import { expect, test } from "@playwright/test";

/**
 * The service speaks of "AI", never of a model or its maker, and as an official service (no beta
 * framing). Rendered pages, title and meta description included. The privacy policy must name the
 * overseas processor (Anthropic, PBC), and only that, never a model.
 */

const MODEL_NAMES = /Claude|클로드|Opus|오푸스|Sonnet|GPT|Gemini/;
const VENDOR = /Anthropic|앤트로픽/;
const BETA = /베타/;

const PAGES = ["/", "/how", "/about", "/faq", "/help", "/pricing", "/terms", "/refund", "/privacy"];

for (const path of PAGES) {
  test(`${path} names no AI model${path === "/privacy" ? "" : " or vendor"} and says nothing of a beta`, async ({ page }) => {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    const head = `${await page.title()} ${(await page.locator('meta[name="description"]').getAttribute("content")) ?? ""}`;
    for (const content of [text, head]) {
      expect(content).not.toMatch(MODEL_NAMES);
      expect(content).not.toMatch(BETA);
      if (path !== "/privacy") expect(content).not.toMatch(VENDOR);
    }
    // The privacy policy names the processor, by its legal name.
    if (path === "/privacy") expect(text).toContain("Anthropic, PBC");
  });
}
