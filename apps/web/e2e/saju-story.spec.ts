import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type SajuSample = {
  free: { title: string; lockedToc: string[] };
  paid: { sections: Array<{ heading: string; body: string }> };
};

const SAJU: SajuSample = JSON.parse(readFileSync(new URL("../../../content/samples/saju-prologue.ko.json", import.meta.url), "utf8"));

const SHOTS = "test-results/saju-story";
/** The dev server compiles a route on its first visit, which can take well over the default 10s on this disk. */
const NAV = { timeout: 60_000 };

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

test("saju: input, consent, chart with 丙寅 and 병화, prologue, sign-in, opened prologue", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("link", { name: /사주 보기/ }).click();
  await expect(page).toHaveURL(/\/saju\/new$/, NAV);
  await expect(page.getByRole("heading", { level: 1, name: "태어난 날을 알려주세요" })).toBeVisible();
  await expect(page.getByText("→ 1990년 1월 1일 (양력)")).toBeVisible();
  await expect(page.getByText("10년 흐름(대운)의 방향을 정하는 데만 써요")).toBeVisible();
  await shot(page, info, "01-saju-new");

  // 윤달 is offered for lunar dates only.
  await page.getByRole("button", { name: "음력", exact: true }).click();
  await expect(page.getByLabel("윤달이에요")).toBeVisible();
  await expect(page.getByText("→ 1990년 1월 1일 (음력)")).toBeVisible();
  await page.getByRole("button", { name: "양력", exact: true }).click();
  await expect(page.getByLabel("윤달이에요")).toHaveCount(0);

  // Consent is required; the button explains what is missing.
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "출생 정보를 풀이에 쓰는 데 먼저 동의해 주세요." })).toBeVisible();
  await expect(page).toHaveURL(/\/saju\/new$/, NAV);
  await shot(page, info, "02-saju-consent-required");
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();

  // Birth data never travels in the URL.
  await expect(page).toHaveURL(/\/saju\/chart$/, NAV);
  const chart = page.getByRole("complementary", { name: "명식" });
  const table = chart.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["시주", "일주", "월주", "연주"]);
  await expect(table).toContainText("모름");
  await expect(chart).toContainText("丙寅");
  await expect(chart).toContainText("병화");
  await expect(chart).toContainText("보이는 6글자 기준");
  await chart.getByText("적용한 기준").click();
  await expect(chart).toContainText("00:00~00:32 사이에 태어났다면 일주가 전날 일진인 乙丑(을축)이 돼요.");
  await expect(page.getByRole("heading", { level: 2, name: SAJU.free.title })).toBeVisible();
  const toc = page.getByRole("region", { name: "이어지는 풀이" }).getByRole("listitem");
  await expect(toc).toHaveCount(SAJU.free.lockedToc.length);
  // The paid prologue is not on the page at all.
  expect(await page.content()).not.toContain(SAJU.paid.sections[0]!.body.slice(0, 40));
  await shot(page, info, "03-saju-chart");

  await page.goto("/saju/chart?instant=1");
  await page.getByRole("link", { name: "로그인하고 무료로 보기" }).click();
  await expect(page).toHaveURL(/\/login\?chapter=prologue&instant=1$/, NAV);
  await page.getByText("만 14세 이상이에요").click();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/prologue/, NAV);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(SAJU.free.title);
  for (const section of SAJU.paid.sections) await expect(page.getByText(section.body)).toBeVisible();
  await shot(page, info, "04-prologue-chapter");
  await page.getByRole("button", { name: "이야기", exact: true }).click();
  await expect(page.getByText("기록 · 토끼 선생님")).toBeVisible();
});

test("saju: a known birth time adds the hour pillar and the correction note", async ({ page }, info) => {
  await page.goto("/saju/new");
  await page.getByRole("button", { name: "알아요" }).click();
  await expect(page.getByText("시간을 모르면 시주 없이 풀어요")).toBeVisible();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "태어난 시각을 골라 주세요." })).toBeVisible();
  await page.getByLabel("태어난 시", { exact: true }).selectOption("9");
  await page.getByLabel("태어난 분").selectOption("30");
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, NAV);
  const chart = page.getByRole("complementary", { name: "명식" });
  await expect(chart.getByRole("table")).toContainText("壬");
  await expect(chart.getByRole("table")).toContainText("辰");
  await expect(chart).toContainText("보이는 8글자 기준");
  await expect(chart).toContainText("보정 시각 08:57");
  await expect(page.getByText("1990년 1월 1일 (양력) · 9시 30분 · 여성 · 서울")).toBeVisible();
  await shot(page, info, "05-saju-chart-known-time");

  // A lunar day that does not exist is explained next to the date.
  await page.goto("/saju/new");
  await page.getByRole("button", { name: "음력", exact: true }).click();
  await page.getByLabel("윤달이에요").check({ force: true });
  await page.getByLabel("태어난 일").selectOption("30");
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "음력으로는 없는 날짜예요." })).toBeVisible();
  await expect(page).toHaveURL(/\/saju\/new$/, NAV);
  await shot(page, info, "06-saju-lunar-error");
});

test("story: three timeline items, story/plain switch, friend scene approval, empty state", async ({ page }, info) => {
  await page.goto("/story");
  await expect(page.getByRole("heading", { level: 1, name: "나의 스타로그" })).toBeVisible();
  const items = page.getByRole("list", { name: "이야기 목차" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("프롤로그");
  await expect(items.nth(1)).toContainText("뜸해진 연락 앞에서");
  await expect(items.nth(2)).toContainText("지인 A님이 남긴 카드");
  await expect(items.nth(2)).toContainText("이 카드 보자마자 네 생각이 났어");
  await expect(items.nth(2).locator('img[src*="/cards/major-19-sun"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "새 장 열기" })).toBeVisible();
  await shot(page, info, "07-story");

  await page.getByRole("button", { name: "풀이", exact: true }).click();
  await expect(items.nth(0)).toContainText("일간은 병화(丙火)예요.");

  await items.nth(2).getByRole("button", { name: "이야기에 넣기" }).click();
  await expect(items.nth(2)).toContainText("나의 스타로그에 넣었어요");
  await shot(page, info, "08-story-approved");

  await page.goto("/story?empty=1");
  await expect(page.getByText("아직 첫 장이 비어 있어요")).toBeVisible();
  await expect(page.getByRole("link", { name: "첫 타로 보기" })).toBeVisible();
  await shot(page, info, "09-story-empty");
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
  await expect(page).toHaveURL(/\/\?visit=first$/, NAV);
});

test("home, 내 정보 and guide", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /나의 스타로그 · 2장/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /타로 보기/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "친구 장면" })).toContainText("지인 A님이 카드를 남겼어요");
  await shot(page, info, "14-home");

  await page.goto("/?visit=first");
  await expect(page.getByText("고양이가 카드를, 토끼가 기록을 맡아요.")).toBeVisible();
  await expect(page.getByRole("link", { name: "첫 타로 보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: /나의 스타로그 · 2장/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "친구 장면" })).toHaveCount(0);
  await shot(page, info, "15-home-first");

  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "별지기" })).toBeVisible();
  await expect(page.getByText("1990년 1월 1일 · 양력 · 시간 모름")).toBeVisible();
  await expect(page.getByRole("link", { name: "고치기" })).toHaveAttribute("href", "/saju/new");
  await shot(page, info, "16-me");
  await page.getByRole("button", { name: "달빛 충전하기" }).click();
  const packs = page.getByRole("dialog", { name: "달빛 충전" });
  await expect(packs).toContainText("9,900원");
  await expect(packs).toContainText("+ 보너스 6");
  await expect(packs).toContainText("19,800원");
  await shot(page, info, "17-me-packs");
  await packs.getByRole("button", { name: "9,900원 결제하기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "달빛 30개를 충전했어요" })).toBeVisible();
  await page.getByRole("button", { name: "친구 초대하기" }).click();
  await expect(page.getByRole("dialog", { name: "친구에게 보낼 카드" })).toContainText("https://taro.yeolmaeapps.kr/invite/abc123");
  await page.keyboard.press("Escape");

  await page.goto("/guide");
  const articles = page.getByRole("main").getByRole("link");
  await expect(articles).toHaveCount(6);
  await shot(page, info, "18-guide");
  await page.getByRole("link", { name: /은둔자 카드 이야기/ }).click();
  await expect(page).toHaveURL(/\/guide\/the-hermit$/, NAV);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("은둔자 카드 이야기");
  await expect(page).toHaveTitle(/은둔자 카드 이야기/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /9번 은둔자/);
  await shot(page, info, "19-guide-article");
});
