import { expect, test } from "@playwright/test";

/**
 * Home layout (spec 2026-11-11 entry funnel renewal 3.1): one hook first — 타로로's question, the first screen's only gold
 * button, to 지금의 한 장 — then the 오픈 기념 line and the 2027 line, 타로 · 사주 (both above the fold with the hook), the
 * 2027 키워드 line, the two quick cards, 별자리 인연, the guide, the FAQ; and the navigation in the right place for the width
 * (bottom bar on phones, top-right pills from 1024px).
 */

test("home: the one hook, then 타로 · 사주 above the fold, the free tests, 별자리 인연, guide, FAQ, in that order", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText("연락할까 말까? 카드 한 장 뽑아 봐");

  const hookCard = main.locator("section[aria-labelledby='home-hook-title']");
  const hook = hookCard.getByRole("link", { name: /한 장 뽑기/ });
  const tarot = main.getByRole("link", { name: /타로 보기/ });
  const saju = main.getByRole("link", { name: /사주 보기/ });
  const keyword = main.getByRole("link", { name: /2027년 내 키워드는\?/ });
  const today = main.getByRole("link", { name: /오늘의 한 장/ });
  const birth = main.getByRole("link", { name: /나를 닮은 타로 카드/ });
  await expect(hook).toHaveAttribute("href", "/now");
  await expect(tarot).toHaveAttribute("href", "/tarot/new");
  await expect(saju).toHaveAttribute("href", "/saju/start");
  await expect(keyword).toHaveAttribute("href", "/2027-keyword");
  await expect(today).toHaveAttribute("href", "/today");
  await expect(birth).toHaveAttribute("href", "/birth-card");
  // 지금의 한 장 is the hook now: no second way to it on the home.
  await expect(main.locator('a[href="/now"]')).toHaveCount(1);
  // 별자리 인연 loads this device's state first; a new visitor gets the start link. Friends join through the
  // invite link (/b/<code>), so the home has no code box.
  const bondsStart = main.getByRole("link", { name: "별자리 인연 시작하기" });
  await expect(bondsStart).toHaveAttribute("href", "/bonds");
  await expect(main.getByText("초대코드로 참여")).toHaveCount(0);

  const box = async (locator: typeof tarot) => (await locator.boundingBox())!;
  const [hookBox, tarotBox, sajuBox, keywordBox, todayBox, birthBox] = await Promise.all([box(hookCard), box(tarot), box(saju), box(keyword), box(today), box(birth)]);
  const guide = await box(page.getByRole("heading", { level: 2, name: "알아 두면 좋은 이야기" }));
  const faq = await box(page.getByRole("heading", { level: 2, name: "자주 묻는 질문" }));
  const bonds = await box(main.locator("section[aria-labelledby='bonds-home-title']"));

  // Reading order top to bottom (타로 and 사주 may share a row on desktop, 타로 first).
  expect(hookBox.y + hookBox.height).toBeLessThanOrEqual(tarotBox.y);
  expect(tarotBox.y).toBeLessThanOrEqual(sajuBox.y);
  if (tarotBox.y === sajuBox.y) expect(tarotBox.x).toBeLessThan(sajuBox.x);
  expect(sajuBox.y + sajuBox.height).toBeLessThanOrEqual(keywordBox.y);
  expect(keywordBox.y + keywordBox.height).toBeLessThanOrEqual(todayBox.y);
  expect(bonds.y).toBeGreaterThanOrEqual(todayBox.y + todayBox.height);
  expect(guide.y).toBeGreaterThan(bonds.y + bonds.height);
  expect(faq.y).toBeGreaterThan(guide.y);

  // The hook and both paid entries above the fold, the entries visibly bigger than the quick cards.
  const fold = page.viewportSize()!.height;
  expect(hookBox.y).toBeGreaterThanOrEqual(0);
  expect(hookBox.y + hookBox.height).toBeLessThanOrEqual(fold);
  expect(sajuBox.y + sajuBox.height).toBeLessThanOrEqual(fold);
  // The entries are a step shorter beside the hook (spec 3.1 wireframe: about 120px), still clearly bigger than a quick card.
  expect(tarotBox.width * tarotBox.height).toBeGreaterThan(1.2 * todayBox.width * todayBox.height);
  expect(tarotBox.height).toBeGreaterThan(110);
  // The quick cards are equal halves.
  expect(Math.abs(birthBox.width - todayBox.width)).toBeLessThanOrEqual(1);

  // One gold button on the first screen: the hook's (a gold background on any link or button in view).
  const gold = await page.evaluate((height) => {
    // components/ui/Button .primary (and the old gold 타로 보기 card) is --gold, #f3dca1.
    const isGold = (el: Element) => (getComputedStyle(el).backgroundColor + getComputedStyle(el).backgroundImage).includes("243, 220, 161");
    return [...document.querySelectorAll("main a, main button")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top < height && isGold(el);
      })
      .map((el) => el.textContent?.trim());
  }, fold);
  expect(gold).toEqual([expect.stringContaining("한 장 뽑기")]);
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
