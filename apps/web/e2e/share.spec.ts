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
 * A full tarot reading from the API, saved on this device as the result screen keeps it. Opened with the
 * owner pass: a 오픈 기념 무료 reading is read and kept on its device only, and the server never shares it.
 */
async function savedReading(page: Page, id: string) {
  await page.context().clearCookies();
  await ownAddress(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin } })).ok()).toBe(true);
  const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] } })).json();
  const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input: INPUT, unlock: { method: "owner" } } })).json();
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
  };
  await page.addInitScript((value) => window.localStorage.setItem("starlog.chapters", value), JSON.stringify([chapter]));
  return res.reading as { verdict: string };
}

test("공유하기 makes the reading's own link: the cards and the reading for anyone, no question; 공유 그만하기 takes it down", async ({ page }) => {
  const reading = await savedReading(page, "sharee2e01");
  await page.goto("/chapter/sharee2e01");
  await page.getByRole("button", { name: "공유하기" }).click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  await expect(sheet).toContainText("질문과 직접 쓴 말, 고른 상황, 이어서 물어본 내용은 보이지 않아요");
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
