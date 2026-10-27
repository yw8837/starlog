import { expect, test } from "@playwright/test";

/**
 * Home layout (design pass): the owner's reading order — hero, 타로, 사주, the two quick cards,
 * 별자리 인연, the guide, the FAQ — with both paid entries above the fold, and the navigation in the right place for
 * the width (bottom bar on phones, top-right pills from 1024px).
 */

test("home: hero, then 타로 · 사주 above the fold, quick cards, 별자리 인연, guide, FAQ, in that order", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toContainText("고민 그대로 편하게 물어보세요");

  const tarot = main.getByRole("link", { name: /타로 보기/ });
  const saju = main.getByRole("link", { name: /사주 보기/ });
  const now = main.getByRole("link", { name: /지금의 한 장/ });
  const today = main.getByRole("link", { name: /오늘의 한 장/ });
  await expect(tarot).toHaveAttribute("href", "/tarot/new?new=1");
  await expect(saju).toHaveAttribute("href", "/saju/start?new=1");
  await expect(now).toHaveAttribute("href", "/now");
  await expect(today).toHaveAttribute("href", "/today");
  // 별자리 인연 loads this device's state first; a new visitor gets the start link. Friends join through the
  // invite link (/b/<code>), so the home has no code box.
  const bondsStart = main.getByRole("link", { name: "별자리 인연 시작하기" });
  await expect(bondsStart).toHaveAttribute("href", "/bonds");
  await expect(main.getByText("초대코드로 참여")).toHaveCount(0);

  const box = async (locator: typeof tarot) => (await locator.boundingBox())!;
  const [h1Box, tarotBox, sajuBox, nowBox, todayBox] = await Promise.all([box(h1), box(tarot), box(saju), box(now), box(today)]);
  const guide = await box(page.getByRole("heading", { level: 2, name: "알아 두면 좋은 이야기" }));
  const faq = await box(page.getByRole("heading", { level: 2, name: "자주 묻는 질문" }));
  const bonds = await box(main.locator("section[aria-labelledby='bonds-home-title']"));

  // Reading order top to bottom (타로 and 사주 may share a row on desktop, 타로 first).
  expect(h1Box.y).toBeLessThan(tarotBox.y);
  expect(tarotBox.y).toBeLessThanOrEqual(sajuBox.y);
  if (tarotBox.y === sajuBox.y) expect(tarotBox.x).toBeLessThan(sajuBox.x);
  expect(sajuBox.y + sajuBox.height).toBeLessThanOrEqual(nowBox.y);
  expect(bonds.y).toBeGreaterThanOrEqual(nowBox.y + nowBox.height);
  expect(guide.y).toBeGreaterThan(bonds.y + bonds.height);
  expect(faq.y).toBeGreaterThan(guide.y);

  // Both paid entries above the fold, and visibly bigger than the quick cards.
  expect(sajuBox.y + sajuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(tarotBox.width * tarotBox.height).toBeGreaterThan(1.4 * nowBox.width * nowBox.height);
  expect(tarotBox.height).toBeGreaterThan(110);
  // The quick cards are equal halves.
  expect(Math.abs(nowBox.width - todayBox.width)).toBeLessThanOrEqual(1);
});

test("home: guide split 타로 / 사주 and four FAQ questions that open in place", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /타로 가이드/ })).toHaveAttribute("href", "/guide/tarot");
  await expect(page.getByRole("link", { name: /사주 가이드/ })).toHaveAttribute("href", "/guide/saju");
  await expect(page.getByRole("link", { name: /은둔자 카드/ })).toHaveAttribute("href", "/guide/the-hermit");

  const faq = page.getByRole("region", { name: "자주 묻는 질문" });
  const questions = faq.locator("summary");
  await expect(questions).toHaveCount(4);
  await questions.first().click();
  await expect(faq.getByText(/타로는 원본 카드와 공식 해설서/)).toBeVisible();
  await expect(faq.getByRole("link", { name: /전체 FAQ 보기/ })).toHaveAttribute("href", "/faq");
});

test("navigation: bottom bar on phones, top-right pills on desktop, one at a time", async ({ page }, info) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "주요 메뉴" });
  await expect(nav).toHaveCount(1);
  const home = nav.getByRole("link", { name: "홈" });
  await expect(home).toHaveAttribute("aria-current", "page");
  const navBox = (await nav.boundingBox())!;
  const viewport = page.viewportSize()!;
  if (info.project.name === "desktop") {
    // Header pills: top right, with FAQ; the wordmark links home on the left.
    expect(navBox.y).toBeLessThan(80);
    expect(navBox.x + navBox.width).toBeGreaterThan(viewport.width / 2);
    await expect(nav.getByRole("link")).toHaveText(["홈", "가이드", "FAQ", "내 기록", "내 정보"]);
    await expect(page.getByRole("link", { name: "스타로그 홈" })).toBeVisible();
  } else {
    expect(navBox.y + navBox.height).toBeGreaterThanOrEqual(viewport.height - 2);
    await expect(nav.getByRole("link")).toHaveText(["홈", "내 기록", "가이드", "내 정보"]);
  }
});
