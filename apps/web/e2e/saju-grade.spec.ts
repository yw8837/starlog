import { mkdirSync } from "node:fs";
import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";

/**
 * 올해의 사주 등급 (/saju/grade, spec 2026-11-11 F C5–C6): no login; the card is computed in the browser, so no request and no
 * address ever carries the birth data; the chips change the card; everything fits 375px. Full-page shots go to GRADE_SHOTS
 * (default test-results/screens/saju-grade) as <project>-<name>.png.
 */

const SHOTS = process.env.GRADE_SHOTS ?? "test-results/screens/saju-grade";
const BIRTH = { year: "1995", month: "6", day: "1", hour: "14", minute: "30" };

async function shot(page: Page, info: TestInfo, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png`, fullPage: true, animations: "disabled" });
}

/** Every request the page makes, with its body: none may name the birth. */
function recordRequests(page: Page): Array<{ url: string; body: string }> {
  const seen: Array<{ url: string; body: string }> = [];
  page.on("request", (request: Request) => seen.push({ url: request.url(), body: request.postData() ?? "" }));
  return seen;
}

function expectNoBirth(requests: Array<{ url: string; body: string }>, page: Page) {
  const own = requests.filter(({ url }) => !/\/_next\/static\/|\/characters\/|\.woff2?$|fonts\.g/.test(url));
  expect(own.length).toBeGreaterThan(0);
  for (const { url, body } of own) {
    const both = `${url} ${body}`;
    expect(both, url).not.toContain(BIRTH.year);
    expect(both, url).not.toMatch(/calendar|placeId|"birth"|timeKnown/);
  }
  expect(page.url()).not.toContain(BIRTH.year);
}

/** No sideways scroll: the page is as wide as the screen. */
async function expectFits(page: Page) {
  const { scroll, view } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(view);
}

test("no login: the example first, my birth gives my card in the browser, a chip changes the year, the rule opens", async ({ page }, info) => {
  const requests = recordRequests(page);
  await page.goto("/saju/grade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("올해의 사주 등급");
  const card = page.getByRole("figure");
  await expect(card).toContainText("예시");
  await expect(card).toContainText("올해의 사주 등급");
  await expect(page.getByText("등급은 사람이나 사주의 좋고 나쁨이 아니에요.", { exact: false })).toBeVisible();
  await expectFits(page);
  await shot(page, info, "example");

  const find = page.locator("#find");
  await expect(find.getByRole("button", { name: /요즘 상황도 알려 주기/ })).toHaveCount(0);
  await find.getByLabel("태어난 연도").selectOption(BIRTH.year);
  await find.getByLabel("태어난 월").selectOption(BIRTH.month);
  await find.getByLabel("태어난 일").selectOption(BIRTH.day);
  await find.getByRole("button", { name: "알아요" }).click();
  await find.getByLabel("태어난 시", { exact: true }).selectOption(BIRTH.hour);
  await find.getByLabel("태어난 분").selectOption(BIRTH.minute);
  await find.getByRole("button", { name: "여성" }).click();
  await find.getByRole("checkbox", { name: "출생 정보를 등급 계산에 쓰는 데 동의해요" }).check();
  await find.getByRole("button", { name: /내 등급 보기/ }).click();

  await expect(card).not.toContainText("예시");
  await expect(page).not.toHaveURL(/login/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("starlog.saju-profile") ?? "null"))).toMatchObject({ year: 1995, month: 6, day: 1 });
  const observations = page.getByRole("region", { name: "규칙으로 본 세 가지" }).getByRole("listitem");
  await expect(observations).toHaveCount(4);
  await expect(observations.last()).toContainText(/다음 S·A 해: \d{4} .+년|S·A가 나오는 해가 없어요/);
  await expectFits(page);
  await shot(page, info, "result");

  // a chip: the card turns to that year, only ?y= in the address
  const chips = page.getByRole("group", { name: "10년 등급" }).getByRole("button");
  await expect(chips).toHaveCount(10);
  const third = chips.nth(2);
  const label = (await third.getAttribute("aria-label"))!;
  const [year, ko] = label.split(" ");
  await third.click();
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText(`${year} ${ko}년 · 사주 등급`);
  await expect(page).toHaveURL(new RegExp(`/saju/grade\\?y=${year}$`));

  // the rule, with the 상위 % loaded when opened
  await page.locator("summary", { hasText: "등급은 어떻게 나와요?" }).click();
  await expect(page.getByText(/가능한 사주 조합 561,600개 가운데 위에서 \d+%/)).toBeVisible();
  await expect(card).not.toContainText("%");
  await expectFits(page);
  await shot(page, info, "how-open");

  // reloads on the chip's year, from this device's profile
  await page.reload();
  await expect(card).toContainText(`${year} ${ko}년`);
  expectNoBirth(requests, page);
});

test("the rule page: formula, what is left out, the measured tables, sources and the helplines, fitting 375px", async ({ page }, info) => {
  await page.goto("/saju/grade/how");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("사주 등급은 이렇게 계산해요");
  await expect(page.getByRole("table", { name: /2026 병오년 일간별 등급 비율/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "근거 자료" }).getByText("출처 미확인").first()).toBeVisible();
  await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
  await expectFits(page);
  await shot(page, info, "how-page");
});
