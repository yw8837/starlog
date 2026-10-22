import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fakeBrowserClock, ownerPass } from "./opening";

/**
 * PDF로 저장 (owner 2026-10-21): a finished reading prints through the browser (window.print) with a print
 * stylesheet: white A4 paper, the site and the day on top, the question, the cards or the chart, the reading
 * and the follow-ups already answered, then the AI note and the address. Navigation, buttons, share, upsells
 * and the follow-up box stay on screen. Each test seeds a reading on this device, checks the page under print
 * media, and has Chromium make the PDF (saved with a print-media screenshot in test-results/reading-pdf).
 */

const SHOTS = "test-results/reading-pdf";
const BRAND = "스타로그 · starlog.yeolmaeapps.kr";
const INPUT = {
  topicId: "contact",
  whoId: "us",
  whenId: "month",
  question: "이번 달 그 사람에게 먼저 연락해도 될까?",
  conditions: [{ label: "관계", value: "알아가는 중" }],
  note: "요즘은 제가 먼저 안 하면 조용해요",
};
const BIRTH = { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: true, hour: 9, minute: 30, gender: "female", placeId: "seoul" };
const TURN = { question: "언제쯤 연락하면 좋을까요?", answer: "주말 저녁처럼 서로 여유 있는 때가 무난해요." };

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

/** Its own client address, so the per-IP generation limiter never spans tests. */
async function ownAddress(page: Page) {
  const n = () => Math.floor(Math.random() * 250);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.12.${n()}.${n()}` });
}

const seed = (page: Page, chapter: object) =>
  page.addInitScript((value) => window.localStorage.setItem("starlog.chapters", value), JSON.stringify({ v: 1, chapters: [chapter] }));

/** A full tarot reading from the (mock) API with one follow-up answered, opened with the owner pass. */
async function tarotChapter(page: Page, info: TestInfo, id: string) {
  await page.context().clearCookies();
  await ownAddress(page);
  await ownerPass(page, info);
  const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] } })).json();
  const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input: INPUT, unlock: { method: "owner" } } })).json();
  await page.context().clearCookies();
  const chapter = {
    id, kind: "tarot", createdAt: Date.now(), chapterToken: res.chapterToken, turns: [TURN], followUpsLeft: 2,
    question: INPUT.question, conditions: INPUT.conditions, note: INPUT.note, cards: draw.cards, reading: res.reading,
  };
  return { chapter, heading: res.reading.cards[0].heading as string };
}

/** A full saju reading from the (mock) API, opened with the owner pass. */
async function sajuChapter(page: Page, info: TestInfo, id: string) {
  await page.context().clearCookies();
  await ownAddress(page);
  await ownerPass(page, info);
  const teaser = await (await page.request.post("/api/saju/teaser", { data: { birth: BIRTH } })).json();
  const res = await (await page.request.post("/api/saju/reading", { data: { birth: BIRTH, unlock: { method: "owner" } } })).json();
  await page.context().clearCookies();
  const chapter = { id, kind: "saju", createdAt: Date.now(), chapterToken: res.chapterToken, turns: [], followUpsLeft: 3, birth: BIRTH, title: teaser.title, summary: teaser.summary, reading: res.reading };
  // SajuSections shows "label · heading" as two lines; the heading proper is after the first " · ".
  const first = res.reading.sections[0].heading as string;
  return { chapter, heading: first.includes(" · ") ? first.slice(first.indexOf(" · ") + 3) : first };
}

const section = (heading: string) => ({ heading, body: `${heading}에 대한 풀이 본문이에요. 차분히 읽어 보세요.` });
const POS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
const CARDS = POS.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: i === 1 ? "reversed" : "upright" }));
/** A 켈틱 크로스 10장 record as this device keeps it (premium readings are not on sale on the e2e server). */
const DEEP = {
  id: "pdfdeep01", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 5, kind: "tarot-deep", question: "이번 달 내 재물 흐름은 어떨까?", conditions: [], note: "", cards: CARDS,
  reading: {
    verdict: "천천히 가도 괜찮아요", positions: CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "이 자리의 카드가 들려주는 이야기예요." })),
    crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
    staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};

/** PDF로 저장 opens the print dialog under the file's name and puts the page title back afterwards. */
async function pressSave(page: Page, type: string) {
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      (window as unknown as { printedAs?: string }).printedAs = document.title;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  const before = await page.title();
  await page.getByRole("button", { name: "PDF로 저장" }).click();
  expect(await page.evaluate(() => (window as unknown as { printedAs?: string }).printedAs)).toMatch(new RegExp(`^스타로그-${type}-\\d{4}-\\d{2}-\\d{2}$`));
  expect(await page.title()).toBe(before);
}

/** Under print media: the paper look, what prints and what stays on screen; then the PDF itself. */
async function printsCleanly(page: Page, info: TestInfo, name: string, texts: string[]) {
  mkdirSync(SHOTS, { recursive: true });
  await page.emulateMedia({ media: "print" });
  const main = page.getByRole("main");
  await expect(main.getByText(BRAND, { exact: true })).toBeVisible();
  for (const text of texts) await expect(main.getByText(text, { exact: true }).first()).toBeVisible();
  await expect(main.getByText(/AI가 만든|재미와 자기/)).toHaveCount(0); // owner 2026-10-23: 약관에만

  // getByRole leaves out what print media hides (display: none)
  for (const button of ["PDF로 저장", "공유하기", "이미지로 공유", "보내기"]) await expect(page.getByRole("button", { name: button, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "내 기록으로" })).toHaveCount(0); // the stepper
  await expect(page.locator("nav:visible")).toHaveCount(0); // tab bar, site footer links, 이 기록의 차례
  await expect(page.locator("input:visible, textarea:visible")).toHaveCount(0); // the follow-up box
  await expect(page.getByRole("contentinfo")).toBeHidden(); // the site footer
  await expect(page.getByText("인쇄 화면에서 'PDF로 저장'(아이폰은 공유 → 파일에 저장)을 고르면 돼요")).toBeHidden();

  const look = await page.evaluate(() => {
    const rgb = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
    const [r, g, b] = rgb(getComputedStyle(document.querySelector("h1")!).color);
    return { paper: getComputedStyle(document.body).backgroundColor, inkLuma: (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 };
  });
  expect(look.paper).toBe("rgb(255, 255, 255)");
  expect(look.inkLuma).toBeLessThan(0.4); // dark ink, not the sky's light text
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}-print.png`, fullPage: true });

  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${info.project.name}-${name}.pdf`, pdf);
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(30_000); // fonts and card or chart drawings, not a blank page
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  expect(pages).toBeGreaterThanOrEqual(1);
  expect(pages).toBeLessThanOrEqual(15);
}

test("PDF로 저장 on a tarot reading: the question, the three cards, the reading and the answered follow-up print on white A4", async ({ page }, info) => {
  const { chapter, heading } = await tarotChapter(page, info, "pdftarot01");
  await seed(page, chapter);
  await page.goto("/chapter/pdftarot01");
  await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-tarot-screen.png` });
  await pressSave(page, "타로");
  await printsCleanly(page, info, "tarot", [INPUT.question, heading, TURN.answer]);
  // the drawn cards print with their pictures
  const cards = page.getByRole("complementary", { name: "뽑은 카드" }).locator("img");
  expect(await cards.evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length)).toBeGreaterThanOrEqual(3);
});

test("PDF로 저장 on a saju reading: the chart and the sections print", async ({ page }, info) => {
  const { chapter, heading } = await sajuChapter(page, info, "pdfsaju01");
  await seed(page, chapter);
  await page.goto("/chapter/pdfsaju01");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await pressSave(page, "사주");
  await printsCleanly(page, info, "saju", [chapter.title, "네 기둥", heading]);
});

test("PDF로 저장 on a premium reading (켈틱 크로스 10장): the ten cards and the reading print", async ({ page }, info) => {
  await seed(page, DEEP);
  await page.goto("/chapter/pdfdeep01");
  await expect(page.getByRole("heading", { level: 1, name: DEEP.question })).toBeVisible();
  await pressSave(page, "켈틱크로스10장");
  await printsCleanly(page, info, "premium", [DEEP.question, "지금의 나 카드", "오늘 해 볼 일"]);
});

test("the demo's notice stays on screen: it never tops the printed page", async ({ page }) => {
  await page.goto("/chapter/sample");
  await expect(page.getByText("예시로 보여드리는 풀이예요.")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("예시로 보여드리는 풀이예요.")).toBeHidden();
  await expect(page.getByRole("main").getByText(BRAND, { exact: true })).toBeVisible();
});

test.describe("in KakaoTalk's in-app browser", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410110" });

  test("PDF로 저장 says to open the page in the phone's browser and copies the link, instead of printing", async ({ page }, info) => {
    await page.goto("/chapter/sample");
    await page.evaluate(() => {
      window.print = () => {
        (window as unknown as { printed?: boolean }).printed = true;
      };
    });
    await page.getByRole("button", { name: "PDF로 저장" }).click();
    await expect(page.getByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeVisible();
    await expect(page.getByRole("button", { name: "링크 복사" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { printed?: boolean }).printed ?? false)).toBe(false);
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-in-app.png` });
  });
});
