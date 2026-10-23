import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { filledSlots, pickCard, tableCards } from "./cards";
import { fakeBrowserClock, openingOn, ownerPass } from "./opening";
import { makeLink, openShared, shotButton } from "./shareShots";

/**
 * Tarot on the real API (the server runs with STARLOG_AI=mock and a signing secret): the cards
 * the server deals are the cards shown, the teaser and the full reading come from the API, the
 * reading is saved on this device and survives a reload. A 오픈 기념 무료 reading is read and kept on
 * this device (no follow-ups, but shareable since owner 2026-10-23); pay-flow.spec.ts asks a follow-up on a paid one.
 * 오픈 기념 무료 ends with 2026-10-31 (KST): from 11월 1일 the free opening below is refused.
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

/** Waits until every finite CSS animation and transition (e.g. the table's spread) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** Builds 나 · 재물운 · (typed 언제) and picks one situation chip and a note. */
async function buildMoneyQuestion(page: Page, info: TestInfo) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  // 나 needs no 누구 detail.
  await expect(page.getByRole("textbox", { name: "구체적으로 적기 (선택)" })).toHaveCount(0);
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await expect(page.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeVisible();
  // A typed 언제 replaces the chip; the question updates from it.
  await page.getByRole("textbox", { name: "언제인지 직접 쓰기" }).fill("다음 주 금요일 면접");
  await expect(page.getByRole("button", { name: "이번 주" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("다음 주 금요일 면접, 내 재물 흐름은 어떨까?")).toBeVisible();
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

/** Picks three cards from the table and returns the cards the server dealt for them. */
async function drawThree(page: Page): Promise<Array<{ cardId: string; position: string }>> {
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  await settleAnimations(page);
  for (let i = 0; i < 3; i++) await pickCard(page);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  const dealt = page.waitForResponse((r) => r.url().endsWith("/api/tarot/draw") && r.request().method() === "POST");
  await page.getByRole("button", { name: "결과 보기" }).click();
  const body = (await (await dealt).json()) as { cards: Array<{ cardId: string; position: string }> };
  expect(body.cards).toHaveLength(3);
  return body.cards;
}

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

test("tarot money flow with a typed 언제: the dealt cards, the teaser, a 오픈 기념 무료 reading that survives reload, read and kept only", async ({ page }, info) => {
  // Until 10/31 the free first reading opens it, read and kept only; from 11월 1일 a visitor has nothing free to
  // open, so the owner pass opens it and the reading is an ordinary one.
  const free = openingOn();
  await ownAddress(page, info);
  if (!free) await ownerPass(page, info);
  await buildMoneyQuestion(page, info);
  const cards = await drawThree(page);

  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/, { timeout: NAV });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("다음 주 금요일 면접, 내 재물 흐름은 어떨까?");
  const spread = page.getByRole("complementary", { name: "뽑은 카드" });
  for (const card of cards) await expect(spread.locator(`img[src*="/cards/starlog/${card.cardId}"]`)).toBeVisible();

  // The free teaser from the API, then the scope before opening.
  const toc = page.getByRole("region", { name: "이어지는 풀이" });
  await expect(toc).toBeVisible({ timeout: 30_000 });
  await expect(toc).toContainText(/소제목 \d+개 · 약 2,000자/);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toContainText("풀이 전체 · 약 2,000자");
  await expect(sheet).toContainText("이 기기에 계속 보관");
  if (free) {
    // 오픈 기념 무료 alone is offered: no follow-ups are promised, and its rule is said under the button.
    await expect(sheet).not.toContainText("이어서 물어보기 3번");
    await expect(sheet).toContainText("10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 내 기록에 보관돼요(이어서 물어보기 제외).");
    await expect(sheet.getByRole("link")).toHaveCount(0);
  } else {
    await expect(sheet).not.toContainText("오픈 기념 무료");
    await expect(sheet).toContainText("이어서 물어보기 3번");
  }
  const unlock = free ? sheet.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }) : sheet.getByRole("button", { name: "운영자로 무료 열기" });
  await expect(unlock).toBeVisible();
  await expect(page.getByText(/AI가 만든|재미와 자기/)).toHaveCount(0); // owner 2026-10-23: 약관에만
  // A money question never gets the relationship sample.
  await expect(page.locator("main")).not.toContainText("뜸해진", { useInnerText: true });
  // 감질맛: the second card's first part ends in the nudge, and opening sends the teaser's seal so the reading reads on from it.
  await expect(page.getByText("이어지는 이야기는 전체 풀이에서 열려요")).toBeVisible();
  await shot(page, info, "02-result");

  // 공유하기 on the free result (owner 2026-10-23): the cards and the free part only; the question stays here.
  const teaserShare = page.getByRole("button", { name: "공유하기" });
  await shotButton(page, teaserShare, "tarot-teaser-button");
  const freePath = await makeLink(page, teaserShare);
  const freeVisitor = await openShared(page, freePath, "tarot-free-shared");
  await expect(freeVisitor.getByRole("heading", { level: 1 })).toHaveText("카드 세 장이 건넨 이야기");
  await expect(freeVisitor.locator("main")).toContainText("이어지는 이야기는 공유한 사람만 볼 수 있어요");
  await expect(freeVisitor.locator("main")).not.toContainText("다음 주 금요일 면접");
  await freeVisitor.close();

  const opened = page.waitForRequest((r) => r.url().endsWith("/api/tarot/reading"));
  await unlock.click();
  expect(JSON.parse((await opened).postData() ?? "{}").seal).toEqual(expect.any(String));
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: 60_000 });
  const readingUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("다음 주 금요일 면접, 내 재물 흐름은 어떨까?");
  await expect(page.getByText("한 줄 결론")).toBeVisible();
  const verdict = await page.locator("#verdict-label + p").innerText();
  for (const card of cards) await expect(page.locator(`img[src*="/cards/starlog/${card.cardId}"]`).first()).toBeVisible();
  await expect(page.getByText("기록 · 토끼 사서")).toHaveCount(0);
  if (free) {
    // Read and kept on this device: said once, no follow-up box, no 이어서 물어보기 link; 공유하기 shows (owner 2026-10-23).
    await expect(page.getByText("오픈 기념 무료 풀이는 내 기록에 보관돼요. 이어서 물어보기는 결제한 풀이에서 할 수 있어요.")).toHaveCount(1);
    await expect(page.getByRole("region", { name: /이어서 물어보기/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
    await shotButton(page, page.getByRole("button", { name: "공유하기" }), "tarot-opening-button");
    await expect(page.getByRole("navigation", { name: "이 기록의 차례" }).getByRole("link")).toHaveText(["풀이"]);
  } else {
    await expect(page.getByText(/오픈 기념 무료 풀이는 내 기록에 보관돼요/)).toHaveCount(0);
    await expect(page.getByRole("region", { name: /이어서 물어보기/ })).toBeVisible();
  }
  await shot(page, info, "03-reading");

  // Saved on this device: a reload shows the same reading without calling the API.
  let generationCalls = 0;
  page.on("request", (r) => {
    if (/\/api\/(tarot|saju)\//.test(r.url())) generationCalls += 1;
  });
  await page.reload();
  await expect(page.locator("#verdict-label + p")).toHaveText(verdict);
  expect(generationCalls).toBe(0);

  // 내 기록 lists it, newest first, and opens it.
  await page.goto("/story");
  const records = page.getByRole("list", { name: "기록 목록" }).getByRole("listitem");
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText("다음 주 금요일 면접, 내 재물 흐름은 어떨까?");
  await expect(records.first()).toContainText(verdict.slice(0, 10));
  await records.first().getByRole("link").click();
  await expect(page).toHaveURL(readingUrl, { timeout: NAV });
});

test("오픈 기념 무료 used: opening again says so with no reset time, no reading is shown", async ({ page }, info) => {
  test.skip(!openingOn(), "오픈 기념 무료 ended 2026-10-31: no device can be in the used-it state any more");
  await ownAddress(page, info);
  await buildMoneyQuestion(page, info);
  await drawThree(page);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  // What the server answers a device whose free first reading is spent (lib/api/http.ts checkFirstFree).
  await page.route("**/api/tarot/reading", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "BETA_LIMIT", scope: "first", message: "…" }) }),
  );
  await sheet.getByRole("button", { name: /전체 풀이 보기/ }).click();
  await expect(sheet).toContainText("오픈 기념 무료 풀이를 이미 열었어요");
  await expect(sheet).not.toContainText("다시 열려요");
  await expect(page.getByRole("status").filter({ hasText: "오픈 기념 무료 풀이를 이미 열었어요" })).toBeAttached();
  await expect(page).toHaveURL(/\/tarot\/result/);
  // The device now knows its free first reading is used: the button stays off, for good.
  await expect(sheet.getByRole("button", { name: "전체 풀이 보기", exact: true })).toBeDisabled();
  await sheet.scrollIntoViewIfNeeded();
  await shot(page, info, "05-limit");
});

test("a typed 무엇 with a named person reads with the 누구 chip's spread", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나와 그 사람" }).click();
  await page.getByRole("textbox", { name: "구체적으로 적기 (선택)" }).fill("엄마");
  await page.getByRole("button", { name: "연락", exact: true }).click();
  await page.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }).fill("전세 계약");
  // Typing replaced the chip.
  await expect(page.getByRole("button", { name: "연락", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("textbox", { name: "언제인지 직접 쓰기" }).fill("다음 주 금요일 면접");
  await expect(page.getByText("다음 주 금요일 면접, 엄마와의 전세 계약은 어떻게 될까?")).toBeVisible();
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

test("draw: a cards-only shuffle opens the table of 78; 다시 섞기 shuffles on the table and keeps the picks; reduced motion still shows a short one", async ({ page }) => {
  await page.addInitScript(() =>
    window.sessionStorage.setItem("starlog.tarot-flow", JSON.stringify({ who: "me", topicId: "money", when: "week", conditions: {}, note: "" })),
  );
  await page.goto("/tarot/draw");
  await expect(page.getByText("카드를 섞고 있어요")).toBeVisible();
  // No character on the draw screen, only the deck.
  await expect(page.getByRole("img", { name: /고양이/ })).toHaveCount(0);
  await expect(tableCards(page)).toHaveCount(78, { timeout: 6_000 });
  await expect(page.getByRole("img", { name: /고양이/ })).toHaveCount(0);
  await settleAnimations(page);

  // A pick flies to its slot; 다시 섞기 then shuffles only the 77 left, on the table, with input held meanwhile.
  await pickCard(page);
  await expect(filledSlots(page)).toHaveCount(1);
  const reshuffle = page.getByRole("button", { name: "다시 섞기" });
  await reshuffle.click();
  await expect(reshuffle).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("카드를 섞고 있어요")).toHaveCount(0);
  // The undo waits until the cards are down.
  await expect(page.getByRole("button", { name: "방금 고른 카드 빼기" })).toBeDisabled();
  await expect(reshuffle).toHaveAttribute("aria-disabled", "false", { timeout: 10_000 });
  await expect(page.getByRole("status").filter({ hasText: "카드를 다시 섞었어요. 2장 더 골라 주세요" })).toBeVisible();
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(tableCards(page)).toHaveCount(77);
  await expect(page.getByRole("button", { name: "방금 고른 카드 빼기" })).toBeEnabled();

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
  await expect(tableCards(page)).toHaveCount(78, { timeout: 5_000 });
  const phases = await page.evaluate(() => (window as unknown as { __drawPhases: Array<{ phase: string; at: number }> }).__drawPhases);
  expect(phases.map((p) => p.phase)).toEqual(["shuffle", "pick"]);
  // The gentle version runs its 0.8s after hydration, so the shuffle phase lasts at least that long.
  expect(phases[1]!.at - phases[0]!.at).toBeGreaterThanOrEqual(700);
});

test("draw: the table takes the keyboard on its ring, and 돌리기 is remembered on this device", async ({ page }) => {
  await page.addInitScript(() =>
    window.sessionStorage.setItem("starlog.tarot-flow", JSON.stringify({ savedAt: Date.now(), who: "me", topicId: "money", when: "week", conditions: {}, note: "" })),
  );
  await page.goto("/tarot/draw?instant=1");
  await expect(tableCards(page)).toHaveCount(78);
  const modes = page.getByRole("group", { name: "카드 펼치는 방식" });
  await expect(modes.getByRole("button", { name: "흩뿌리기" })).toHaveAttribute("aria-pressed", "true");
  await modes.getByRole("button", { name: "돌리기" }).click();
  await expect(modes.getByRole("button", { name: "돌리기" })).toHaveAttribute("aria-pressed", "true");
  await settleAnimations(page);

  // One tab stop: Tab from the reshuffle button lands on the card on top of the ring; arrows walk it, Enter picks.
  await page.getByRole("button", { name: "다시 섞기" }).focus();
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.card ?? null);
  expect(first, "Tab lands on a table card").not.toBeNull();
  await page.keyboard.press("ArrowRight");
  const second = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.card ?? null);
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  await page.keyboard.press("Enter");
  await expect(filledSlots(page)).toHaveCount(1);
  await expect(page.locator(`[data-card="${second}"]`)).toBeHidden();
  // Focus stays on the table, on the next card.
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.card ?? null)).not.toBeNull();

  await page.reload();
  await expect(tableCards(page)).toHaveCount(78);
  await expect(modes.getByRole("button", { name: "돌리기" })).toHaveAttribute("aria-pressed", "true");
  // No sideways scroll at this width in either mode.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("the demo reading: one scroll, written follow-up answers, rating, no share, and invite", async ({ page }, info) => {
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

  // No share on the sample: only a reading's own link is shared, and the sample has none (owner 2026-10-14).
  await expect(page.getByRole("button", { name: "공유하기" })).toHaveCount(0);

  await page.getByRole("button", { name: "친구에게 한 장 받아보기" }).click();
  const dialog = page.getByRole("dialog", { name: "친구에게 보낼 카드" });
  await expect(dialog).toContainText("https://starlog.yeolmaeapps.kr/invite/abc123");
  await shot(page, info, "07-demo-share");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test.describe("before hydration (no JavaScript)", () => {
  test.use({ javaScriptEnabled: false });

  test("the draw page holds the question, slots and table until the saved flow is read", async ({ page }) => {
    await page.goto("/tarot/draw?instant=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("");
    await expect(page.locator("main")).not.toContainText("나의 마음", { useInnerText: true });
    await expect(page.locator("[data-card]")).toHaveCount(0);
  });
});

test.describe("question builder: toggling chips and starting clean", () => {
  const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
  const next = (page: Page) => page.getByRole("button", { name: /^다음/ });
  const EMPTY = "누구, 무엇, 언제를 고르면 질문이 완성돼요";

  async function buildMoney(page: Page) {
    await chip(page, "나").click();
    await chip(page, "재물운").click();
    await chip(page, "이번 주").click();
    await expect(page.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeVisible();
  }

  test("무엇 and 언제 chips toggle off; 누구 stays chosen; the detail field fits the 누구 chip", async ({ page }) => {
    await page.goto("/tarot/new?new=1");
    // The flag is used once and leaves the address.
    await expect(page).toHaveURL(/\/tarot\/new$/);
    await buildMoney(page);
    await expect(next(page)).toBeEnabled();

    await chip(page, "재물운").click();
    await expect(chip(page, "재물운")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(EMPTY)).toBeVisible();
    await expect(next(page)).toBeDisabled();
    await chip(page, "재물운").click();
    await chip(page, "이번 주").click();
    await expect(chip(page, "이번 주")).toHaveAttribute("aria-pressed", "false");
    await expect(next(page)).toBeDisabled();
    await chip(page, "이번 주").click();
    await expect(next(page)).toBeEnabled();
    // 누구 is one of four: a second tap changes nothing.
    await chip(page, "나").click();
    await expect(chip(page, "나")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "구체적으로 적기 (선택)" })).toHaveCount(0);

    const examples: Array<[string, string]> = [
      ["나와 그 사람", "예: 엄마, 팀장님, 전 남친"],
      ["나의 일", "예: 우리 팀, 새 프로젝트, 첫 직장"],
      ["우리 모임", "예: 대학 동기, 독서 모임, 가족"],
    ];
    for (const [who, example] of examples) {
      await chip(page, who).click();
      await expect(page.getByRole("textbox", { name: "구체적으로 적기 (선택)" })).toHaveAttribute("placeholder", example);
      await expect(page.getByText("구체적으로 적기 (선택)", { exact: true })).toBeVisible();
    }
  });

  test("home → tarot → back home → tarot starts clean; situation → back keeps the answers", async ({ page }) => {
    await page.goto("/");
    const entry = page.getByRole("main").getByRole("link", { name: /타로 보기/ });
    await entry.click();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await buildMoney(page);
    await next(page).click();
    await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
    await page.getByRole("link", { name: "질문 만들기로" }).click();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await expect(chip(page, "재물운")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeVisible();

    await page.getByRole("link", { name: "홈으로" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: NAV });
    await entry.click();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await expect(chip(page, "나")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(EMPTY)).toBeVisible();
  });

  test("a refresh starts clean; 다음 → browser back keeps; home → browser back starts clean", async ({ page }) => {
    await page.goto("/tarot/new?new=1");
    await buildMoney(page);
    await page.reload();
    await expect(chip(page, "나")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(EMPTY)).toBeVisible();

    await buildMoney(page);
    await next(page).click();
    await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
    await page.goBack();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await expect(chip(page, "재물운")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeVisible();
    // Forward again is a move inside the flow too.
    await page.goForward();
    await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
    await expect(page.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeVisible();

    await page.getByRole("link", { name: "질문 만들기로" }).click();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await page.getByRole("link", { name: "홈으로" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: NAV });
    await page.goBack();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await expect(chip(page, "나")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(EMPTY)).toBeVisible();
  });

  test("answers left for 30 minutes are forgotten (fake clock)", async ({ page }) => {
    const start = new Date("2026-10-01T10:00:00+09:00").getTime();
    await page.clock.setFixedTime(start);
    await page.goto("/tarot/new?new=1");
    await buildMoney(page);
    await next(page).click();
    await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
    await page.clock.setFixedTime(start + 31 * 60 * 1000);
    await page.getByRole("link", { name: "질문 만들기로" }).click();
    await expect(page).toHaveURL(/\/tarot\/new$/, { timeout: NAV });
    await expect(chip(page, "나")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(EMPTY)).toBeVisible();
  });
});
