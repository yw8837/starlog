import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Sample = {
  cards: Array<{ cardId: string }>;
  free: { lockedToc: string[] };
  paid: { verdict: string };
  followUps: string[];
};

const SAMPLE: Sample = JSON.parse(
  readFileSync(new URL("../../../content/samples/tarot-contact.ko.json", import.meta.url), "utf8"),
);

const SHOTS = "test-results/tarot-flow";

async function shot(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png` });
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

test("tarot flow: question, situation, draw, free result, login, opened chapter", async ({ page }, info) => {
  await page.goto("/");
  await shot(page, info, "01-home");
  await page.getByRole("link", { name: "타로 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/new$/);

  await page.getByRole("button", { name: "나와 그 사람" }).click();
  await page.getByRole("button", { name: "연락", exact: true }).click();
  await page.getByRole("button", { name: "이번 달" }).click();
  await expect(page.getByText("이번 달, 그 사람에게 먼저 연락해도 될까")).toBeVisible();
  await shot(page, info, "02-question");
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page).toHaveURL(/\/tarot\/new\/situation$/);
  await page.getByRole("button", { name: "알아가는 중" }).click();
  await page.getByRole("button", { name: "뜸해짐" }).click();
  await page.getByRole("button", { name: "가볍게 안부" }).click();
  await page.getByLabel("한 줄 메모").fill("요즘은 제가 먼저 안 하면 조용해요");
  await shot(page, info, "03-situation");
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  // Nothing the user typed or chose travels in the URL.
  await expect(page).toHaveURL(/\/tarot\/draw$/);

  await page.goto("/tarot/draw?instant=1");
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
  for (const n of [3, 10, 17]) await pickFanCard(page, n);
  await expect(page.getByText("모두 골랐어요")).toBeVisible();
  await shot(page, info, "04-draw-picked");
  await page.getByRole("button", { name: "결과 보기" }).click();

  await expect(page).toHaveURL(/\/tarot\/result\?instant=1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이번 달, 그 사람에게 먼저 연락해도 될까");
  // Sharing is a secondary button here; the gold primary stays the unlock.
  await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
  const situation = page.getByRole("region", { name: "선택한 상황" });
  for (const chip of ["알아가는 중", "뜸해짐", "가볍게 안부"]) await expect(situation).toContainText(chip);
  await expect(situation).toContainText("요즘은 제가 먼저 안 하면 조용해요");

  const spread = page.getByRole("complementary", { name: "뽑은 카드" });
  await expect(spread.locator("img:not([src*='back.svg'])")).toHaveCount(3);
  for (const card of SAMPLE.cards) await expect(spread.locator(`img[src*="/cards/${card.cardId}"]`)).toBeVisible();

  const toc = page.getByRole("region", { name: "이어지는 풀이" }).getByRole("listitem");
  await expect(toc).toHaveCount(SAMPLE.free.lockedToc.length);
  const paidHeadings = SAMPLE.free.lockedToc.slice(1);
  expect(paidHeadings).toHaveLength(10);
  for (const heading of paidHeadings) await expect(toc.filter({ hasText: heading })).toHaveCount(1);
  // The paid text is not on the page at all (not merely hidden).
  expect(await page.content()).not.toContain(SAMPLE.paid.verdict);
  await shot(page, info, "05-result");

  await page.getByRole("link", { name: "로그인하고 무료로 보기" }).click();
  await expect(page).toHaveURL(/\/login\?instant=1$/);
  await expect(page.getByText("이 풀이를 스타로그에 적어둘게요")).toBeVisible();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  // (Next's route announcer is also an alert, so filter by text.)
  await expect(page.getByRole("alert").filter({ hasText: "만 14세 이상인지 먼저 확인해 주세요" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await shot(page, info, "06-login-age-required");
  await page.getByText("만 14세 이상이에요").click();
  await expect(page.getByLabel("만 14세 이상이에요")).toBeChecked();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();

  await expect(page).toHaveURL(/\/chapter\/sample/);
  await expect(page.getByText(SAMPLE.paid.verdict)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("뜸해진 연락 앞에서");
  await shot(page, info, "07-chapter");
});

test("draw: a cards-only shuffle opens the fan; 다시 섞기 replays it; reduced motion still shows a short one", async ({ page }) => {
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

test("returning visitor sees 별조각, 달빛 (6 short) and direct pay", async ({ page }, info) => {
  await page.goto("/tarot/result?visit=returning");
  const sheet = page.getByRole("region", { name: "전체 풀이 보기" });
  await expect(sheet.getByRole("link", { name: "별조각으로 보기 · 10" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /달빛으로 보기 · 10/ })).toContainText("6개 부족해요 · 충전하고 바로 열기");
  await expect(sheet.getByRole("link", { name: "바로 결제하고 보기 · 2,900원" })).toBeVisible();
  await expect(sheet).toContainText("후속 질문 3번 · 내 스타로그에 보관");
  await sheet.scrollIntoViewIfNeeded();
  await shot(page, info, "08-result-returning");
});

test("opened chapter: one scroll (story, then reading), follow-up answer, rating, share and invite", async ({ page }, info) => {
  await page.goto("/chapter/sample");
  const followUp = page.getByRole("region", { name: /이어서 물어보기/ });
  await expect(followUp).toContainText("3번 남았어요");
  // Keyboard: the chip used goes away, so focus moves to the field, which stays focused (read-only,
  // not disabled) while the answer is on its way.
  await followUp.getByRole("button", { name: SAMPLE.followUps[0] }).press("Enter");
  const field = followUp.getByRole("textbox", { name: "이어서 물어볼 내용" });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-disabled", "true");
  await expect(followUp).toContainText("2번 남았어요");
  await expect(followUp).toContainText("가벼운 안부라면");
  await expect(followUp).toContainText("“문득 생각나서 연락해 봤어. 요즘 어떻게 지내?”");
  await expect(field).toBeFocused();
  // The chosen suggestion is a one-shot button, not a toggle.
  await expect(followUp.getByRole("button", { name: SAMPLE.followUps[1] })).not.toHaveAttribute("aria-pressed");
  await field.fill("다음 주에 보내도 괜찮을까요?");
  await field.press("Enter");
  await expect(followUp).toContainText("펼친 세 장에 비춰서 볼게요");
  await followUp.scrollIntoViewIfNeeded();
  await shot(page, info, "09-follow-up");

  await page.getByRole("radio", { name: "5점 중 4점" }).click();
  await expect(page.getByRole("radio", { name: "5점 중 4점" })).toHaveAttribute("aria-checked", "true");

  // No 이야기/풀이 switch: the story page comes first and the full reading follows in the same scroll.
  await expect(page.getByRole("group", { name: "읽는 방식" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "이 장의 차례" }).getByRole("link", { name: "이야기" }).click();
  await expect(page.getByText("기록 · 토끼 사서")).toBeVisible();
  await expect(page.getByText(SAMPLE.paid.verdict)).toBeAttached();
  const storyTop = (await page.locator("#chapter-story").boundingBox())!.y;
  const readingTop = (await page.locator("#chapter-reading").boundingBox())!.y;
  expect(storyTop).toBeLessThan(readingTop);

  // Sharing: no share sheet in the test browser, so the site link is copied (never a /chapter/ URL).
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "공유하기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "링크를 복사했어요" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://starlog.yeolmaeapps.kr");

  await page.getByRole("button", { name: "친구에게 한 장 받아보기" }).click();
  const dialog = page.getByRole("dialog", { name: "친구에게 보낼 카드" });
  await expect(dialog).toContainText("https://starlog.yeolmaeapps.kr/invite/abc123");
  await shot(page, info, "10-share");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test.describe("before hydration (no JavaScript)", () => {
  test.use({ javaScriptEnabled: false });

  test("the draw page holds the question, slots and fan until the saved flow is read", async ({ page }) => {
    await page.goto("/tarot/draw?instant=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("");
    // Rendered text only (the flight data in <script> tags is not on screen).
    await expect(page.locator("main")).not.toContainText("뜸해진", { useInnerText: true });
    await expect(page.locator("main")).not.toContainText("나의 마음", { useInnerText: true });
    await expect(page.locator("[data-fan-index]")).toHaveCount(0);
  });
});
