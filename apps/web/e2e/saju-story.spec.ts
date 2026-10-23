import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fakeBrowserClock, openingOn } from "./opening";
import { makeLink, openShared, shotButton } from "./shareShots";

type SajuSample = {
  free: { title: string; lockedToc: string[] };
  paid: { sections: Array<{ heading: string; body: string }> };
};

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

const SAJU: SajuSample = JSON.parse(readFileSync(new URL("../../../content/samples/saju-prologue.ko.json", import.meta.url), "utf8"));

/** Client navigations wait for `next dev` to compile the next route, which is slow on this disk. */
const NAV = 30_000;

const SHOTS = "test-results/saju-story";

/** The owner pass of the server under test (scripts/ops/gate3-lite.sh passes the preview's; `pnpm e2e` uses this default). */
const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

async function shot(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  // Finite animations (bubble pop-in, result rise) jump to their end state so the shot shows the settled screen.
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png`, fullPage: true, animations: "disabled" });
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

/** Each test gets its own client address, so the per-IP generation limiter never spans tests. */
async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.2.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

test("saju: input, consent, the example chart, then the user's own chart with 丙寅 and 병화", async ({ page }, info) => {
  // Nothing saved yet: an example chart (computed, no reading text) asks for the user's own birth data.
  await page.goto("/saju/chart");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("예시 명식");
  await expect(page.getByRole("link", { name: "태어난 날 입력하기" })).toBeVisible();
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(SAJU.free.title);
  await shot(page, info, "00-saju-chart-example");

  await ownAddress(page, info);
  // The home's entry to it is checked in "home, 내 정보 and guide"; the home layout belongs to the design pass.
  await page.goto("/saju/new");
  await expect(page.getByRole("heading", { level: 1, name: "태어난 날을 알려 주면 사주를 봐 드릴게요" })).toBeVisible();
  // W-07: nothing is filled in before the user picks it.
  await expect(page.getByLabel("태어난 연도")).toHaveValue("");
  await expect(page.getByText(/^→ /)).toHaveCount(0);
  await page.getByLabel("태어난 연도").selectOption("1990");
  await page.getByLabel("태어난 월").selectOption("1");
  await page.getByLabel("태어난 일").selectOption("1");
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await expect(page.getByText("→ 1990년 1월 1일 (양력)")).toBeVisible();
  await expect(page.getByText("10년 흐름(대운)의 방향을 정하는 데만 써요")).toBeVisible();

  // 평달 / 윤달 / 모름 is offered for lunar dates only.
  await page.getByRole("button", { name: "음력", exact: true }).click();
  await expect(page.getByRole("group", { name: "평달 또는 윤달" })).toBeVisible();
  await page.getByRole("button", { name: "모름", exact: true }).click();
  await expect(page.getByText("→ 1990년 1월 1일 (음력 · 윤달 모름)")).toBeVisible();
  await page.getByRole("button", { name: "양력", exact: true }).click();
  await expect(page.getByRole("group", { name: "평달 또는 윤달" })).toHaveCount(0);

  // The optional status chips are folded until asked for.
  const more = page.getByRole("button", { name: /요즘 상황도 알려 주기/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await page.getByRole("button", { name: "연애 중" }).click();
  await page.getByRole("button", { name: "직장인" }).click();
  await expect(page.getByRole("textbox", { name: "요즘 고민 한 줄" })).toHaveCount(0);
  await shot(page, info, "01-saju-new-status");

  // Consent is required; the button explains what is missing.
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "출생 정보를 풀이에 쓰는 데 먼저 동의해 주세요." })).toBeVisible();
  await expect(page).toHaveURL(/\/saju\/new$/);
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  const teaserRequest = page.waitForRequest((r) => r.url().endsWith("/api/saju/teaser"));
  await page.getByRole("button", { name: "명식 보기" }).click();

  // Birth data never travels in the URL; the chips go in the request body.
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });
  expect(JSON.parse((await teaserRequest).postData() ?? "{}")).toMatchObject({
    birth: { year: 1990, month: 1, day: 1, calendar: "solar" },
    loveStatus: "dating",
    workStatus: "employee",
  });
  expect(JSON.parse((await teaserRequest).postData() ?? "{}")).not.toHaveProperty("concern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나의 명식");
  const chart = page.getByRole("complementary", { name: "명식" });
  await expect(chart.getByRole("table").getByRole("columnheader")).toHaveText(["시주", "일주", "월주", "연주"]);
  await expect(chart).toContainText("丙寅");
  await expect(chart).toContainText("병화");
  // free, no AI (saju enrichment 2026-10-08): the names under 네 기둥 (丙 → 학당귀인 on the 일지 寅) and the 개운 line (쇠 0)
  const names = chart.getByRole("region", { name: "이 명식에 붙는 이름" });
  const chip = names.getByRole("button", { name: "학당귀인" });
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(names).toContainText("배움이 자라기 쉬운 자리에 붙는 이름이에요.");
  await expect(names).toContainText("일간 丙 기준 → 태어난 날 寅");
  await expect(chart.getByRole("region", { name: "오행" })).toContainText("곁에 두면 좋은 것: 흰색 포인트 · 비우기·청소");
  await expect(page.getByRole("region", { name: "이어지는 풀이" })).toContainText(/소제목 \d+개 · 약 2,500~3,000자/, { timeout: 30_000 });
  // The sample's written prologue is never shown, even for the sample chart.
  expect(await page.locator("body").innerText()).not.toContain(SAJU.paid.sections[0]!.body.slice(0, 40));
  await shot(page, info, "03-saju-chart");
});

test("saju: a non-sample chart gets its own reading, saved on this device", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/saju/new");
  await page.getByLabel("태어난 연도").selectOption("1990");
  await page.getByLabel("태어난 월").selectOption("1");
  await page.getByLabel("태어난 일").selectOption("1");
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await page.getByRole("button", { name: "알아요" }).click();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "태어난 시각을 골라 주세요." })).toBeVisible();
  await page.getByLabel("태어난 시", { exact: true }).selectOption("9");
  await page.getByLabel("태어난 분").selectOption("30");
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });
  const chart = page.getByRole("complementary", { name: "명식" });
  await expect(chart.getByRole("table")).toContainText("壬");
  await expect(chart).toContainText("보정 시각 08:57");
  await expect(page.getByText("1990년 1월 1일 (양력) · 9시 30분 · 여성 · 서울")).toBeVisible();

  // The free reading from the API, then the scope, then one gold button.
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toContainText("풀이 전체 · 약 2,500~3,000자");
  await expect(page.getByRole("region", { name: "이어지는 풀이" })).toContainText("계산 기준");
  expect(await page.locator("body").innerText()).not.toContain(SAJU.free.title);
  await shot(page, info, "05-saju-chart-known-time");

  // 공유하기 under the 맛보기 (owner 2026-10-23): its title and summary, never the birth or the chart.
  const teaserShare = page.getByRole("button", { name: "공유하기" });
  await shotButton(page, teaserShare, "saju-teaser-button");
  const freeVisitor = await openShared(page, await makeLink(page, teaserShare), "saju-free-shared");
  await expect(freeVisitor.locator("main")).toContainText("사주 맛보기");
  await expect(freeVisitor.locator("main")).not.toContainText("1990");
  await freeVisitor.close();

  // No free saju full reading (owner 2026-10-14): a visitor is told it opens with a payment, and nothing opens.
  await expect(sheet).toContainText("전체 풀이는 결제하고 열 수 있어요");
  await expect(sheet.getByRole("button", { name: "전체 풀이 보기", exact: true })).toBeDisabled();
  await expect(sheet).not.toContainText(/첫 이용|처음 한 번|무료로 열|남았어요/);
  // The owner pass opens it.
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin: new URL(info.project.use.baseURL!).origin } })).ok()).toBe(true);
  await page.reload();
  await sheet.getByRole("button", { name: "운영자로 무료 열기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: 90_000 });
  await expect(page.getByText("사주 기록 ·", { exact: false })).toBeVisible();
  const sections = page.locator("#chapter-reading article");
  expect(await sections.count()).toBeGreaterThanOrEqual(7);
  // 한눈에 보기 first (owner 2026-10-07), then the sections under plain labels
  const glance = page.locator("#chapter-reading > :first-child");
  await expect(glance).toHaveAccessibleName("한눈에 보기");
  for (const label of ["잘 풀리는 쪽", "조심할 쪽", "이렇게 보완", "올해 흐름"]) await expect(glance).toContainText(label);
  await expect(page.locator("#chapter-reading")).toContainText("타고난 바탕");
  await expect(page.getByText("풀이를 적고 있어요")).toHaveCount(0);
  await expect(page.getByText("기록 · 토끼 선생님")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "명식" })).toContainText("壬");
  const firstSection = (await sections.first().textContent()) ?? "";
  await shot(page, info, "06-saju-reading");

  const readingShare = page.getByRole("button", { name: "공유하기" });
  await shotButton(page, readingShare, "saju-paid-button");
  const sajuVisitor = await openShared(page, await makeLink(page, readingShare), "saju-shared");
  await expect(sajuVisitor.getByRole("heading", { level: 1 })).toHaveText("사주팔자 풀이");
  await expect(sajuVisitor.locator("main")).not.toContainText("1990");
  await sajuVisitor.close();

  await page.reload();
  await expect(page.locator("#chapter-reading article").first()).toHaveText(firstSection);
  await page.goto("/story");
  const records = page.getByRole("list", { name: "기록 목록" }).getByRole("listitem");
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText("사주");
  await expect(records.first()).toContainText("일간 병화");
  await shot(page, info, "07-records");
});

test("saju: a lunar day that does not exist is explained next to the date", async ({ page }, info) => {
  await page.goto("/saju/new");
  await page.getByRole("button", { name: "음력", exact: true }).click();
  await page.getByRole("button", { name: "윤달", exact: true }).click();
  await page.getByLabel("태어난 연도").selectOption("1990");
  await page.getByLabel("태어난 월").selectOption("1");
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await page.getByLabel("태어난 일").selectOption("30");
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "음력으로는 없는 날짜예요." })).toBeVisible();
  await expect(page).toHaveURL(/\/saju\/new$/);
  await shot(page, info, "08-saju-lunar-error");
});

test("오늘의 한 장: shuffle, pick one of three; a reload shows only that card and its fortune", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오늘의 타로 카드를 골라 볼까요?");
  await page.getByRole("button", { name: "바로 펼치기" }).click();
  const cards = page.getByRole("button", { name: /번째 카드 고르기/ });
  await expect(cards).toHaveCount(3);
  await shot(page, info, "09-today-pick");
  const picked = page.waitForRequest((r) => r.url().endsWith("/api/tarot/daily") && r.method() === "POST");
  await cards.nth(1).click();
  // The card design shown goes with the pick (the fortune quotes its picture); the default is the Starlog deck.
  expect(JSON.parse((await picked).postData() ?? "{}")).toEqual({ pick: 1, deck: "starlog" });
  const line = page.locator("#today-line");
  await expect(line).toBeVisible({ timeout: 30_000 });
  const summary = await line.innerText();
  await expect(page.getByRole("heading", { level: 2, name: "오늘의 흐름" })).toBeVisible();
  for (const area of ["애정", "금전", "일"]) await expect(page.getByText(area, { exact: true })).toBeVisible();
  await expect(page.getByText(/AI가 만든|재미와 자기/)).toHaveCount(0); // owner 2026-10-23: 약관에만
  await shot(page, info, "10-today-opened");

  const todayShare = page.getByRole("button", { name: "공유하기" });
  await shotButton(page, todayShare, "today-button");
  const dailyVisitor = await openShared(page, await makeLink(page, todayShare), "daily-shared");
  await expect(dailyVisitor.locator("main")).toContainText("오늘의 한 장 뽑기");
  await dailyVisitor.close();

  // Only the picked card is ever shown: one card image on the page, no face-down ones to pick.
  await expect(page.locator("main img[src*='/cards/']:not([src*='back'])")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /번째 카드 고르기/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("오늘의 카드는 이미 골랐어요 · 내일 새 카드가 기다려요")).toBeVisible();
  await expect(page.locator("#today-line")).toHaveText(summary);
  await expect(page.getByRole("button", { name: /번째 카드 고르기/ })).toHaveCount(0);
  await expect(page.locator("main img[src*='/cards/']:not([src*='back'])")).toHaveCount(1);
  await shot(page, info, "10b-today-revisit");
});

test("내 기록: the empty state", async ({ page }, info) => {
  await page.goto("/story");
  await expect(page.getByText("아직 기록이 없어요")).toBeVisible();
  await expect(page.getByRole("link", { name: "첫 타로 보기" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "내 기록" })).toHaveAttribute("aria-current", "page");
  await shot(page, info, "11-records-empty");
});

test("invite: guest picks one card, reads the sun, leaves it for 하늘", async ({ page }, info) => {
  await page.goto("/invite/abc123?instant=1");
  await expect(page.getByText("로그인 없이 보는 중")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "하늘님이 이야기에 한 장 부탁했어요" })).toBeVisible();
  await expect(page.getByText("남긴 카드는 하늘님이 확인한 뒤 이야기에 들어가요.").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
  await shot(page, info, "10-invite");

  await page.getByRole("button", { name: "카드 한 장 뽑기" }).click();
  await expect(page.locator("[data-fan-index]")).toHaveCount(7);
  await settleAnimations(page);
  await shot(page, info, "11-invite-fan");
  await pickFanCard(page, 3);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("태양");
  await expect(page.getByText("오늘은 숨기지 않아도 되는 날이에요.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "하늘님 이야기에 남기기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "하늘님에게 보일 이름을 적어 주세요." })).toBeVisible();
  await page.getByLabel("하늘님에게 보일 이름").fill("지인 A");
  await page.getByLabel("하늘님에게 한마디 남기기 (선택)").fill("이 카드 보자마자 네 생각이 났어");
  await expect(page.getByRole("link", { name: "나도 내 스타로그 시작하기" })).toBeVisible();
  await shot(page, info, "12-invite-result");

  await page.getByRole("button", { name: "하늘님 이야기에 남기기" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "하늘님 이야기에 남겼어요" })).toBeVisible();
  await shot(page, info, "13-invite-sent");
  await page.getByRole("link", { name: "나도 내 스타로그 시작하기" }).click();
  await expect(page).toHaveURL(/\/\?visit=first$/);
});

test("home, 내 정보 and guide", async ({ page }, info) => {
  await page.goto("/");
  // Every reading starts from the home; no story hero and no balance pill in the beta.
  for (const href of ["/tarot/new?new=1", "/saju/start?new=1", "/now", "/today"]) await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /나의 스타로그 · \d장/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /내 재화/ })).toHaveCount(0);
  await shot(page, info, "14-home");

  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "내 정보" })).toBeVisible();
  if (openingOn()) {
    await expect(page.getByRole("heading", { name: "오픈 기념 무료" })).toBeVisible();
    await expect(page.getByText("10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 내 기록에 보관돼요(이어서 물어보기 제외).", { exact: true })).toBeVisible();
  } else {
    // 오픈 기념 무료 ended 2026-10-31: 내 정보 no longer shows its box.
    await expect(page.getByRole("heading", { name: "오픈 기념 무료" })).toHaveCount(0);
  }
  await expect(page.getByText("아직 입력하지 않았어요")).toBeVisible();
  await expect(page.getByRole("link", { name: "입력하기" })).toHaveAttribute("href", "/saju/new");
  await expect(page.getByRole("button", { name: "달빛 충전하기" })).toHaveCount(0);
  await expect(page.getByText("별지기")).toHaveCount(0);
  await shot(page, info, "16-me");
  // Erasing asks first, then clears this device.
  await page.evaluate(() => localStorage.setItem("starlog.saju-profile", JSON.stringify({ calendar: "solar", year: 1993, month: 8, day: 17, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "male", placeId: "busan" })));
  await page.reload();
  await expect(page.getByText("1993년 8월 17일 · 양력 · 시간 모름")).toBeVisible();
  await page.getByRole("button", { name: "이 기기에 저장된 기록 모두 지우기" }).click();
  const confirm = page.getByRole("dialog", { name: "이 기기의 기록을 모두 지울까요?" });
  await expect(confirm).toBeVisible();
  await shot(page, info, "17-me-erase");
  await confirm.getByRole("button", { name: "모두 지우기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "이 기기에 저장된 기록을 모두 지웠어요" })).toBeVisible();
  await expect(page.getByText("아직 입력하지 않았어요")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("starlog.saju-profile"))).toBeNull();

  // /guide moved to the tarot tab; each tab lists only its own articles.
  await page.goto("/guide");
  await expect(page).toHaveURL(/\/guide\/tarot$/);
  const guideTabs = page.getByRole("navigation", { name: "가이드 분류" });
  await expect(guideTabs.getByRole("link", { name: "타로" })).toHaveAttribute("aria-current", "page");
  const articles = page.getByRole("main").getByRole("list").getByRole("link");
  // The library keeps growing (lib/guide-articles): each tab lists at least its first articles.
  await expect(articles.first()).toBeVisible();
  expect(await articles.count()).toBeGreaterThanOrEqual(4);
  await shot(page, info, "18-guide");
  await guideTabs.getByRole("link", { name: "사주" }).click();
  await expect(page).toHaveURL(/\/guide\/saju$/);
  await expect(page.getByRole("heading", { level: 2, name: "사주 가이드" })).toBeVisible();
  await expect(articles.first()).toBeVisible();
  expect(await articles.count()).toBeGreaterThanOrEqual(2);
  await guideTabs.getByRole("link", { name: "타로" }).click();
  // From the tab's own list: the hub's 최근 검토한 글 may name the same article.
  await page.getByRole("region", { name: "타로 가이드" }).getByRole("link", { name: /타로 은둔자 카드 뜻/ }).click();
  await expect(page).toHaveURL(/\/guide\/the-hermit$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("타로 은둔자 카드 뜻");
  await expect(page).toHaveTitle(/타로 은둔자 카드 뜻/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /9번 은둔자/);
  await expect(page.getByRole("link", { name: "타로 가이드 목록으로" })).toHaveAttribute("href", "/guide/tarot");
  await shot(page, info, "19-guide-article");
});

test("사주 from the home starts the status chips clean but keeps the birth profile; back from the chart keeps them", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("starlog.saju-profile", JSON.stringify({ calendar: "solar", year: 1993, month: 8, day: 17, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "male", placeId: "busan" }));
    localStorage.setItem("starlog.saju-context", JSON.stringify({ loveStatus: "married", concern: "지난번 고민", savedAt: Date.now() }));
  });
  await page.getByRole("main").getByRole("link", { name: /사주 보기/ }).click();
  // With the topics on (production), 사주 starts at the topic step and 사주팔자 goes on to the birth input; with
  // them off, /saju/start sends straight to /saju/new.
  await expect(page).toHaveURL(/\/saju\/(start|new)$/, { timeout: NAV });
  if (page.url().endsWith("/saju/start")) {
    await page.getByRole("list", { name: "무엇이 궁금해요?" }).getByRole("link", { name: /^사주팔자/ }).click();
    await expect(page).toHaveURL(/\/saju\/new\?topic=overall$/, { timeout: NAV });
  }
  await expect(page.getByText("→ 1993년 8월 17일 (양력)")).toBeVisible();
  const more = page.getByRole("button", { name: /요즘 상황도 알려 주기/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => localStorage.getItem("starlog.saju-context"))).toBeNull();

  await more.click();
  await page.getByRole("button", { name: "연애 중" }).click();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });
  await page.getByRole("link", { name: "입력으로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/saju\/new$/, { timeout: NAV });
  await expect(page.getByRole("button", { name: "연애 중" })).toHaveAttribute("aria-pressed", "true");

  // A refresh starts the chips clean; the birth profile stays.
  await page.reload();
  await expect(page.getByText("→ 1993년 8월 17일 (양력)")).toBeVisible();
  await expect(page.getByRole("button", { name: /요즘 상황도 알려 주기/ })).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => localStorage.getItem("starlog.saju-context"))).toBeNull();
});
