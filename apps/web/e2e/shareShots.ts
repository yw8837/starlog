import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 공유하기 everywhere (owner 2026-10-23): the share button on a result screen, made into its link, opened by a visitor in
 * another browser page. On the 375px project each step leaves a screenshot in test-results/share-shots.
 */
export const SHARE_SHOTS = "test-results/share-shots";

const mobile = () => test.info().project.name === "mobile";

/** The button in view, as a phone shows it (375px only). */
export async function shotButton(page: Page, button: Locator, name: string) {
  await button.scrollIntoViewIfNeeded();
  if (!mobile()) return;
  mkdirSync(SHARE_SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: `${SHARE_SHOTS}/${name}.png` });
}

/** 공유하기 → 공유 링크 만들기 → the /s/<id> path the sheet shows; the sheet is closed again. */
export async function makeLink(page: Page, button: Locator): Promise<string> {
  await button.click();
  const sheet = page.getByRole("dialog", { name: "결과 공유하기" });
  await sheet.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(sheet).toContainText(/\/s\/[a-z0-9]{12}/, { timeout: 60_000 });
  const path = (/\/s\/[a-z0-9]{12}/.exec((await sheet.textContent()) ?? "") ?? [""])[0];
  await sheet.getByRole("button", { name: "닫기" }).click();
  return path;
}

/** The link opened by a visitor (no cookies, no saved readings): its page, then a full-page shot and its preview image. */
export async function openShared(page: Page, path: string, name: string): Promise<Page> {
  const visitor = await page.context().browser()!.newPage({ viewport: page.viewportSize() ?? undefined });
  await visitor.goto(new URL(path, page.url()).toString(), { timeout: 120_000 });
  await expect(visitor).toHaveURL(new RegExp(`${path}$`));
  if (mobile()) {
    mkdirSync(SHARE_SHOTS, { recursive: true });
    await visitor.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await visitor.screenshot({ path: `${SHARE_SHOTS}/${name}.png`, fullPage: true });
    const og = await visitor.request.get(new URL(`/api/og/share/${path.slice(3)}`, page.url()).toString(), { timeout: 120_000 });
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
    writeFileSync(`${SHARE_SHOTS}/og-${name}.png`, await og.body());
  }
  return visitor;
}
