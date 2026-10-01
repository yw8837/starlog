import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Tarot on the real API (the server runs with STARLOG_AI=mock and a signing secret): the cards
 * the server deals are the cards shown, the teaser and the full reading come from the API, the
 * reading is saved on this device and survives a reload, follow-ups go through /api/followup.
 */

/** Client navigations wait for `next dev` to compile the next route, which is slow on this disk. */
const NAV = 30_000;

const SHOTS = "test-results/tarot-flow";

async function shot(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png` });
}

/** Each test gets its own client address, so the per-IP generation limiter never spans tests. */
async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.1.${info.workerIndex}.${(info.repeatEachIndex * 50 + info.retry * 7 + Math.floor(Math.random() * 200)) % 250}` });
}

/** Waits until every finite CSS animation (e.g. the fan's deal-out) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** Fan cards overlap, so click each one on a point where it is the top-most element. */
async function pickFanCard(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3)
        if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point, `fan card ${n} has a visible spot`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

/** Builds 나 · 재물운 · (typed 언제) and picks one situation chip and a note. */
async function buildMoneyQuestion(page: Page, info: TestInfo) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  // 나 needs no 누구 detail.
  await expect(page.getByRole("textbox", { name: "누구인지 더 적기" })).toHaveCount(0);
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await expect(page.getByText("이번 주, 나의 재물 흐름은 어떨까")).toBeVisible();
  // A typed 언제 replaces the chip; the question updates from it.
  await page.getByRole("textbox", { name: "언제인지 직접 쓰기" }).fill("다음 주 금요일 면접");
  await expect(page.getByRole("button", { name: "이번 주" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("다음 주 금요일 면접, 나의 재물 흐름은 어떨까")).toBeVisible();
  await expect(page.getByText("11/30")).toBeVisible();
  await shot(page, info, "01-question-typed-when");
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
  await page.getByLabel("한 줄 메모").fill("퇴사하고 두 달째 쉬는 중이에요");
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  // Nothing the user typed or chose travels in the URL.
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
}

/** Picks three fan cards and returns the cards the server dealt for them. */
async function drawThree(page: Page): Promise<Array<{ cardId: string; position: string }>> {
  await page.goto("/tarot/draw?instant=1");
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
  for (const n of [3, 10, 17]) await pickFanCard(page, n);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  const dealt = page.waitForResponse((r) => r.url().endsWith("/api/tarot/draw") && r.request().method() === "POST");
  await page.getByRole("button", { name: "결과 보기" }).click();
  const body = (await (await dealt).json()) as { cards: Array<{ cardId: string; position: string }> };
  expect(body.cards).toHaveLength(3);
  return body.cards;
}

test("tarot money flow with a typed 언제: the dealt cards, the teaser, a saved reading that survives reload, a follow-up", async ({ page }, info) => {
  await ownAddress(page, info);
  await buildMoneyQuestion(page, info);
  const cards = await drawThree(page);

  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("다음 주 금요일 면접, 나의 재물 흐름은 어떨까");
  const spread = page.getByRole("complementary", { name: "뽑은 카드" });
  for (const card of cards) await expect(spread.locator(`img[src*="/cards/${card.cardId}"]`)).toBeVisible();

  // The free teaser from the API, then the scope before opening.
  const toc = page.getByRole("region", { name: "이어지는 풀이" });
  await expect(toc).toBeVisible({ timeout: 30_000 });
  await expect(toc).toContainText(/소제목 \d+개 · 약 2,000자/);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toContainText("풀이 전체 · 약 2,000자");
  await expect(sheet).toContainText("이어서 물어보기 3번");
  await expect(sheet).toContainText("이 기기에 계속 보관");
  await expect(sheet).toContainText(/오픈 기념으로 하루 .+ 무료예요/);
  await expect(sheet.getByRole("link")).toHaveCount(0);
  const unlock = sheet.getByRole("button", { name: /^전체 풀이 보기 · 오늘 \d+번 남았어요$/ });
  await expect(unlock).toBeVisible();
  await expect(page.getByText("AI가 만든 풀이예요 · 재미와 자기 성찰을 위한 참고용이에요")).toBeVisible();
  // A money question never gets the relationship sample.
  await expect(page.locator("main")).not.toContainText("뜸해진", { useInnerText: true });
  await shot(page, info, "02-result");

  await unlock.click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: 60_000 });
  const readingUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("다음 주 금요일 면접, 나의 재물 흐름은 어떨까");
  await expect(page.getByText("한 줄 결론")).toBeVisible();
  const verdict = await page.locator("#verdict-label + p").innerText();
  for (const card of cards) await expect(page.locator(`img[src*="/cards/${card.cardId}"]`).first()).toBeVisible();
  await expect(page.getByText("기록 · 토끼 사서")).toHaveCount(0);
  await shot(page, info, "03-reading");

  // Saved on this device: a reload shows the same reading without calling the API.
  let generationCalls = 0;
  page.on("request", (r) => {
    if (/\/api\/(tarot|saju)\//.test(r.url())) generationCalls += 1;
  });
  await page.reload();
  await expect(page.locator("#verdict-label + p")).toHaveText(verdict);
  expect(generationCalls).toBe(0);

  // A follow-up goes to /api/followup; the answer and the count are kept with the reading.
  const followUp = page.getByRole("region", { name: /이어서 물어보기/ });
  await expect(followUp).toContainText("3번 남았어요");
  const field = followUp.getByRole("textbox", { name: "이어서 물어볼 내용" });
  await field.fill("면접 전에 무엇부터 정리하면 좋을까요?");
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/followup"));
  await field.press("Enter");
  await answered;
  await expect(followUp).toContainText("2번 남았어요", { timeout: 30_000 });
  await expect(followUp.locator("li")).toHaveCount(1);
  await followUp.scrollIntoViewIfNeeded();
  await shot(page, info, "04-follow-up");
  await page.reload();
  await expect(page.getByRole("region", { name: /이어서 물어보기/ })).toContainText("2번 남았어요");
  await expect(page.getByRole("region", { name: /이어서 물어보기/ })).toContainText("면접 전에 무엇부터 정리하면 좋을까요?");

  // 내 기록 lists it, newest first, and opens it.
  await page.goto("/story");
  const records = page.getByRole("list", { name: "기록 목록" }).getByRole("listitem");
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText("다음 주 금요일 면접, 나의 재물 흐름은 어떨까");
  await expect(records.first()).toContainText(verdict.slice(0, 10));
  await records.first().getByRole("link").click();
  await expect(page).toHaveURL(readingUrl, { timeout: NAV });
});

test("the daily limit: opening past it says when it resets, no reading is shown", async ({ page }, info) => {
  await ownAddress(page, info);
  await buildMoneyQuestion(page, info);
  await drawThree(page);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await page.route("**/api/tarot/reading", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "BETA_LIMIT", message: "…", resetsAt: "2099-01-01T15:00:00.000Z" }) }),
  );
  await sheet.getByRole("button", { name: /전체 풀이 보기/ }).click();
  await expect(sheet).toContainText("오늘 열 수 있는 풀이를 모두 열었어요");
  await expect(sheet).toContainText("다시 열려요");
  await expect(page.getByRole("status").filter({ hasText: "오늘 열 수 있는 풀이를 모두 열었어요" })).toBeAttached();
  await expect(page).toHaveURL(/\/tarot\/result/);
  // The device now knows the day is used up.
  await expect(sheet.getByRole("button", { name: "전체 풀이 보기" })).toBeVisible();
  await sheet.scrollIntoViewIfNeeded();
  await shot(page, info, "05-limit");
});

test("a typed 무엇 with a named person reads with the 누구 chip's spread", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나와 그 사람" }).click();
  await page.getByRole("textbox", { name: "누구인지 더 적기" }).fill("엄마");
  await page.getByRole("button", { name: "연락", exact: true }).click();
  await page.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }).fill("전세 계약");
  // Typing replaced the chip.
  await expect(page.getByRole("button", { name: "연락", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("textbox", { name: "언제인지 직접 쓰기" }).fill("다음 주 금요일 면접");
  await expect(page.getByText("다음 주 금요일 면접, 나와 엄마 사이 전세 계약은 어떻게 될까")).toBeVisible();
  await shot(page, info, "06-question-custom");
  await page.getByRole("button", { name: "다음" }).click();
  // A typed topic has no situation chips: only the note, with a neutral example.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("지금 상황을 적어 주세요");
  await expect(page.getByLabel("한 줄 메모")).toHaveAttribute("placeholder", "예: 요즘 가장 마음에 걸리는 일을 한 줄로 적어 보세요");
  await page.getByRole("button", { name: "카드 뽑기" }).click();

  const drawn = page.waitForRequest((r) => r.url().endsWith("/api/tarot/draw"));
  await drawThree(page);
  expect(JSON.parse((await drawn).postData() ?? "{}").templateId).toBe("relationship");
  const teaser = page.waitForRequest((r) => r.url().endsWith("/api/tarot/teaser"));
  const input = JSON.parse((await teaser).postData() ?? "{}").input;
  expect(input).toMatchObject({ topicId: "custom", whoId: "us", topicText: "전세 계약", whoText: "엄마", whenText: "다음 주 금요일 면접" });
  expect(input.whenId).toBeUndefined();
  await expect(page.getByRole("region", { name: "이어지는 풀이" })).toBeVisible({ timeout: 30_000 });
});

test("draw: a cards-only shuffle opens the fan; 다시 섞기 replays it; reduced motion still shows a short one", async ({ page }) => {
  await page.addInitScript(() =>
    window.sessionStorage.setItem("starlog.tarot-flow", JSON.stringify({ who: "me", topicId: "money", when: "week", conditions: {}, note: "" })),
  );
  await page.goto("/tarot/draw");
  await expect(page.getByText("카드를 섞고 있어요")).toBeVisible();
  // No character on the draw screen, only the deck.
  await expect(page.getByRole("img", { name: /고양이/ })).toHaveCount(0);
  await expect(page.locator("[data-fan-index]")).toHaveCount(21, { timeout: 6_000 });
  await expect(page.getByRole("img", { name: /고양이/ })).toHaveCount(0);

  await page.getByRole("button", { name: "다시 섞기" }).click();
  await expect(page.getByText("카드를 섞고 있어요")).toBeVisible();
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);

  // Reduced motion: not skipped. The stacked deck is shown for a moment (opacity only), then the fan.
  // It lasts only ~0.8s, so record the draw phases (data-phase) as they happen instead of racing it.
  await page.addInitScript(() => {
    const seen: Array<{ phase: string; at: number }> = [];
    (window as unknown as { __drawPhases: typeof seen }).__drawPhases = seen;
    new MutationObserver(() => {
      const phase = document.querySelector("[data-phase]")?.getAttribute("data-phase");
      if (phase && seen.at(-1)?.phase !== phase) seen.push({ phase, at: performance.now() });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("[data-fan-index]")).toHaveCount(21, { timeout: 5_000 });
  const phases = await page.evaluate(() => (window as unknown as { __drawPhases: Array<{ phase: string; at: number }> }).__drawPhases);
  expect(phases.map((p) => p.phase)).toEqual(["shuffle", "pick"]);
  // The gentle version runs its 0.8s after hydration, so the shuffle phase lasts at least that long.
  expect(phases[1]!.at - phases[0]!.at).toBeGreaterThanOrEqual(700);
});

test("the demo reading: one scroll, written follow-up answers, rating, share and invite", async ({ page }, info) => {
  await page.goto("/chapter/sample");
  await expect(page.getByText("예시로 보여드리는 풀이예요.")).toBeVisible();
  const followUp = page.getByRole("region", { name: /이어서 물어보기/ });
  await expect(followUp).toContainText("3번 남았어요");
  // Keyboard: the chip used goes away, so focus moves to the field, which stays focused (read-only,
  // not disabled) while the answer is on its way.
  const first = followUp.getByRole("button").first();
  await first.press("Enter");
  const field = followUp.getByRole("textbox", { name: "이어서 물어볼 내용" });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-disabled", "true");
  await expect(followUp).toContainText("2번 남았어요");
  await expect(followUp).toContainText("가벼운 안부라면");
  await expect(field).toBeFocused();
  await field.fill("다음 주에 보내도 괜찮을까요?");
  await field.press("Enter");
  await expect(followUp).toContainText("펼친 세 장에 비춰서 볼게요");

  await page.getByRole("radio", { name: "5점 중 4점" }).click();
  await expect(page.getByRole("radio", { name: "5점 중 4점" })).toHaveAttribute("aria-checked", "true");
  // No story block: the contents jump to the reading and the follow-ups.
  await expect(page.getByText("기록 · 토끼 사서")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "이 기록의 차례" }).getByRole("link")).toHaveText(["풀이", "이어서 물어보기"]);

  // Sharing: no share sheet in the test browser, so the site link is copied (never a /chapter/ URL).
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "공유하기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "링크를 복사했어요" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://starlog.yeolmaeapps.kr");

  await page.getByRole("button", { name: "친구에게 한 장 받아보기" }).click();
  const dialog = page.getByRole("dialog", { name: "친구에게 보낼 카드" });
  await expect(dialog).toContainText("https://starlog.yeolmaeapps.kr/invite/abc123");
  await shot(page, info, "07-demo-share");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test.describe("before hydration (no JavaScript)", () => {
  test.use({ javaScriptEnabled: false });

  test("the draw page holds the question, slots and fan until the saved flow is read", async ({ page }) => {
    await page.goto("/tarot/draw?instant=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("");
    await expect(page.locator("main")).not.toContainText("나의 마음", { useInnerText: true });
    await expect(page.locator("[data-fan-index]")).toHaveCount(0);
  });
});
