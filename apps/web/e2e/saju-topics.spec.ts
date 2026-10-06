import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";

/**
 * 주제별 사주 end to end with mock AI (saju-topics lite plan, step D). Runs with the topics on: the dev server
 * (an empty NEXT_PUBLIC_SAJU_TOPICS is `on` outside production) or a preview built with
 * NEXT_PUBLIC_SAJU_TOPICS=on. Owner-mode payments are in pay-flow.spec.ts.
 */

const NAV = 30_000;
const GENERATION = 120_000;
const TOPICS = ["연애운", "재회운", "재물운", "직장운"];

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.7.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

/** W-07: the date, the gender and the consent are picked by hand (nothing starts filled). */
async function fillBirth(page: Page, year: number, month: number, day: number, gender: "여성" | "남성") {
  await page.getByLabel("태어난 연도").selectOption(String(year));
  await page.getByLabel("태어난 월").selectOption(String(month));
  await page.getByLabel("태어난 일").selectOption(String(day));
  await page.getByRole("button", { name: gender, exact: true }).click();
  await page.getByText("출생 정보를 풀이에 쓰는 데 동의해요").click();
}

/** The chart page for 1992-08-03 (남성), from the form, with the 사주팔자 teaser on screen. */
async function toChart(page: Page) {
  await page.goto("/saju/new");
  await fillBirth(page, 1992, 8, 3, "남성");
  await page.getByRole("button", { name: "명식 보기" }).click();
  await expect(page).toHaveURL(/\/saju\/chart$/, { timeout: NAV });
  await expect(page.getByText("첫 장", { exact: true })).toBeVisible({ timeout: GENERATION });
}

/**
 * The teaser requests this page sends from now on. One the page cancelled itself never reached a model and
 * is left out: `next dev` runs React's Strict Mode, which replays the chart page's effect once, and the first
 * request of the replay is aborted at once (a production build sends one).
 */
function teaserRequests(page: Page): () => Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/saju/teaser")) sent.push(request);
  });
  return () => sent.filter((request) => request.failure() === null);
}

test("주제별 사주: the input screen has no topic or situation chips", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/saju/new");
  await expect(page.getByRole("group", { name: "무엇이 궁금해요?" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "연애운" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /요즘 상황도 알려 주기/ })).toBeVisible();
});

test("주제별 사주: each 운 shows its own teaser, list and sheet under the 사주팔자, and the way back", async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  await toChart(page);
  const row = page.getByRole("group", { name: "다른 운도 볼 수 있어요" });
  await expect(row.getByRole("button")).toHaveText(TOPICS);
  for (const topic of TOPICS) {
    await row.getByRole("button", { name: topic }).click();
    await expect(page.getByText(`${topic} · 맛보기`, { exact: true })).toBeVisible({ timeout: GENERATION });
    await expect(row.getByRole("button", { name: topic })).toHaveAttribute("aria-pressed", "true");
    const toc = page.getByRole("region", { name: "이어지는 풀이" });
    await expect(toc).toContainText("소제목 7개 · 약 3,000자");
    await expect(toc).toContainText("나의 기본 결 · 한눈에 보기");
    await expect(page.getByRole("region", { name: `${topic} 전체 풀이에 담긴 것` })).toBeVisible();
  }
  await page.getByRole("button", { name: "사주팔자로 돌아가기" }).click();
  await expect(page.getByText("첫 장", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible();
});

test("주제별 사주: 재물운 sends only its topic, comes back from this device, opens with 오픈 기념, and 내 기록 names it", async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  const sent = teaserRequests(page);
  await toChart(page);
  expect(sent()).toHaveLength(1);
  expect(JSON.parse(sent()[0]!.postData() ?? "{}")).not.toHaveProperty("topic");

  const row = page.getByRole("group", { name: "다른 운도 볼 수 있어요" });
  await row.getByRole("button", { name: "재물운" }).click();
  await expect(page.getByText("재물운 · 맛보기", { exact: true })).toBeVisible({ timeout: GENERATION });
  expect(sent()).toHaveLength(2);
  const body = JSON.parse(sent()[1]!.postData() ?? "{}");
  expect(body).toMatchObject({ birth: { year: 1992, month: 8, day: 3, gender: "male" }, topic: "money" });
  expect(body).not.toHaveProperty("situation");
  expect(body).not.toHaveProperty("concern");

  await row.getByRole("button", { name: "연애운" }).click();
  await expect(page.getByText("연애운 · 맛보기", { exact: true })).toBeVisible({ timeout: GENERATION });
  expect(sent()).toHaveLength(3);
  // A 운 this device has seen comes back without a request (and without a teaser count).
  await row.getByRole("button", { name: "재물운" }).click();
  await expect(page.getByText("재물운 · 맛보기", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(sent()).toHaveLength(3);

  const sheet = page.getByRole("region", { name: "재물운 전체 풀이에 담긴 것" });
  await sheet.getByRole("button", { name: /^전체 풀이 보기/ }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]{6,32}$/, { timeout: GENERATION });
  await expect(page.getByText(/^사주 재물운 · \d+월 \d+일$/)).toBeVisible();
  await expect(page.locator("#chapter-reading article")).toHaveCount(7);
  await expect(page.locator("#chapter-reading")).toContainText("나의 기본 결");
  // A heading shows as its label and its title on two lines, without the " · " between them.
  await expect(page.locator("#chapter-reading")).toContainText(/앞으로 몇 주\s*확인해 볼 신호/);

  await page.goto("/story");
  const records = page.getByRole("list", { name: "기록 목록" }).getByRole("listitem");
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText("재물운 · 1992년 8월 3일");
});
