import { expect, test, type Page } from "@playwright/test";

/**
 * 결과 공유 (owner 2026-10-13): a saved reading's 공유하기 makes its own link, which shows the cards
 * and the whole reading to anyone, without the question and the note; 공유 그만하기 takes it down.
 */

const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

const INPUT = {
  topicId: "contact",
  whoId: "us",
  whenId: "month",
  question: "이번 달 그 사람에게 먼저 연락해도 될까?",
  conditions: [
    { label: "관계", value: "알아가는 중" },
    { label: "최근 연락", value: "뜸해짐" },
  ],
  note: "요즘은 제가 먼저 안 하면 조용해요",
};

/** Its own client address, so the per-IP generation limiter never spans tests. */
async function ownAddress(page: Page) {
  const n = () => Math.floor(Math.random() * 250);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.7.${n()}.${n()}` });
}

/**
 * A full tarot reading from the API, saved on this device as the result screen keeps it: opened with the
 * owner pass, or (`opening`) with 오픈 기념 무료, which takes no follow-ups but is shared like any other (owner 2026-10-23).
 */
async function savedReading(page: Page, id: string, { opening = false } = {}) {
  await page.context().clearCookies();
  await ownAddress(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  if (!opening) expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin } })).ok()).toBe(true);
  const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] } })).json();
  const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input: INPUT, ...(opening ? {} : { unlock: { method: "owner" } }) } })).json();
  const chapter = {
    id,
    kind: "tarot",
    createdAt: Date.now(),
    chapterToken: res.chapterToken,
    turns: [],
    followUpsLeft: 3,
    question: INPUT.question,
    conditions: INPUT.conditions,
    note: INPUT.note,
    cards: draw.cards,
    reading: res.reading,
    ...(opening ? { opening: true } : {}),
  };
  await page.addInitScript((value) => window.localStorage.setItem("starlog.chapters", value), JSON.stringify([chapter]));
  return res.reading as { verdict: string };
}

test("공유하기 makes the reading's own link: the cards and the reading for anyone, no question; 공유 그만하기 takes it down", async ({ page }) => {
  const reading = await savedReading(page, "sharee2e01");
  await page.goto("/chapter/sharee2e01");
  await page.getByRole("button", { name: "공유하기" }).click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  await expect(sheet).toContainText("질문 원문과 직접 쓴 말은 가려요. 다만 풀이에 고민 내용이 담겨 있으니 보낼 사람을 골라 주세요.");
  await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/);
  const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];

  // A visitor: another browser context (no cookies, no saved readings), at the same origin.
  const link = new URL(path, page.url()).toString();
  const visitor = await page.context().browser()!.newPage();
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("카드 세 장이 건넨 이야기");
  await expect(visitor.locator("main")).toContainText(reading.verdict.replace(/\*\*/g, "").slice(0, 12));
  await expect(visitor.locator("main")).not.toContainText(INPUT.question);
  await expect(visitor.locator("main")).not.toContainText(INPUT.note);
  const image = await visitor.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toContain(`/api/og/share/${path.slice(3)}`);
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await sheet.getByRole("button", { name: "공유 그만하기" }).click();
  await expect(sheet).toContainText("보낸 링크는 이제 열리지 않아요");
  const gone = await visitor.goto(link);
  expect(gone?.status()).toBe(404);
  await visitor.close();
});

test("a 오픈 기념 무료 reading shares too (owner 2026-10-23): its link opens the cards and the reading, not the home", async ({ page }) => {
  const reading = await savedReading(page, "sharee2e02", { opening: true });
  await page.goto("/chapter/sharee2e02");
  await expect(page.getByText("오픈 기념 무료 풀이는 이 기기에서 보고 보관할 수 있어요. 이어서 물어보기는 결제한 풀이에서 할 수 있어요.")).toBeVisible();
  await page.getByRole("button", { name: "공유하기" }).click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/);
  const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];
  const visitor = await page.context().browser()!.newPage();
  await visitor.goto(new URL(path, page.url()).toString());
  await expect(visitor).toHaveURL(new RegExp(`${path}$`));
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("카드 세 장이 건넨 이야기");
  await expect(visitor.locator("main")).toContainText(reading.verdict.replace(/\*\*/g, "").slice(0, 12));
  await expect(visitor.locator("main")).not.toContainText(INPUT.question);
  await visitor.close();
});

/**
 * owner 2026-10-23 "결과공유하면 텍스트만 날라간다": the Kakao feed (SDK mocked: the template is checked) and the phone's share
 * sheet carry the reading's own /s/<id>, its title and first sentence, its 2:1 image and the visitor's own try; 풀이 보기
 * opens the shared reading, not the home. Needs NEXT_PUBLIC_KAKAO_JS_KEY on the dev server (any value: the SDK is mocked).
 */
test("Kakao feed and the share sheet carry the reading's link, title, first sentence and image; 풀이 보기 opens the reading", async ({ page }, info) => {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    const shared: Array<{ title?: string; text?: string; url?: string; files?: Array<{ type: string; size: number }> }> = [];
    let ready = false;
    Object.assign(window, {
      __kakao: sent,
      __shared: shared,
      Kakao: { init: () => void (ready = true), isInitialized: () => ready, Share: { sendDefault: (template: unknown) => void sent.push(template) } },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => void shared.push({ title: data.title, text: data.text, url: data.url, files: data.files?.map((f) => ({ type: f.type, size: f.size })) }),
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (data: ShareData) => !data.files || data.files.every((f) => f.type === "image/png") });
  });
  await savedReading(page, "sharee2e03");
  await page.goto("/chapter/sharee2e03");
  await page.getByRole("button", { name: "공유하기" }).click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  const imageLoaded = page.waitForResponse((r) => r.url().includes("/api/og/share/"), { timeout: 90_000 });
  await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 30_000 });
  const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];
  const link = new URL(path, page.url()).toString();
  if (info.project.name === "mobile") await page.screenshot({ path: "test-results/share-shots/sheet-ready.png" });

  const kakaoButton = sheet.getByRole("button", { name: "카카오톡으로 보내기" });
  await expect(kakaoButton).toBeVisible();
  await kakaoButton.click();
  const template = (await page.evaluate(() => (window as unknown as { __kakao: unknown[] }).__kakao))[0] as {
    content: { title: string; description: string; imageUrl: string; imageWidth: number; imageHeight: number; link: { webUrl: string; mobileWebUrl: string } };
    buttons: Array<{ title: string; link: { webUrl: string } }>;
  };
  expect(template.content.link).toEqual({ webUrl: link, mobileWebUrl: link });
  expect(template.content.imageUrl).toBe(new URL(`/api/og/share/${path.slice(3)}`, page.url()).toString());
  expect([template.content.imageWidth, template.content.imageHeight]).toEqual([1200, 600]);
  expect(template.content.title.length).toBeGreaterThan(5);
  expect(template.content.description.length).toBeGreaterThan(5);
  expect(JSON.stringify(template)).not.toContain(INPUT.question);
  expect(JSON.stringify(template)).not.toContain(INPUT.note);
  expect(template.buttons.map((b) => [b.title, b.link.webUrl])).toEqual([
    ["풀이 보기", link],
    ["나도 뽑아 보기", new URL("/tarot/start", page.url()).toString()],
  ]);

  // The phone's share sheet: title, the text ending in the link, the link, and the image as a PNG.
  // The image is fetched as the link is made, before the tap (a phone opens its sheet only from the tap itself).
  const image = await imageLoaded;
  expect(image.headers()["content-type"]).toBe("image/png");
  await page.waitForTimeout(300);
  await sheet.getByRole("button", { name: "공유하기" }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).length, { timeout: 10_000 }).toBe(1);
  const shared = (await page.evaluate(() => (window as unknown as { __shared: Array<{ title: string; text: string; url: string; files?: Array<{ type: string; size: number }> }> }).__shared))[0]!;
  expect(shared.title).toBe("스타로그");
  expect(shared.url).toBe(link);
  expect(shared.text.endsWith(link)).toBe(true);
  expect(shared.text).toContain(template.content.title);
  expect(shared.files?.map((f) => f.type)).toEqual(["image/png"]);
  expect(shared.files![0]!.size).toBeGreaterThan(10_000);

  // 풀이 보기, as Kakao opens it: the shared reading, never the home; its preview says the same as the message.
  const visitor = await page.context().browser()!.newPage();
  await visitor.goto(template.buttons[0]!.link.webUrl);
  await expect(visitor).toHaveURL(link);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("카드 세 장이 건넨 이야기");
  expect(await visitor.locator('meta[property="og:title"]').getAttribute("content")).toBe(template.content.title);
  expect(await visitor.locator('meta[property="og:description"]').getAttribute("content")).toBe(template.content.description);
  await visitor.close();
});
