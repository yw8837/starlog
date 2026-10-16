import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 360px review (2026-10-17), pinned by the style values since jsdom lays nothing out:
 * - CrossSpread: a reversed card's "역방향" tag hangs below the card (TarotCard .tag, `bottom: -Npx`); the position name
 *   under it starts further down than that, so the two never meet at 360, 375 or 414px (the gap is in px, not in %).
 * - The ten-card draw (DeckDraw .grid, 5+5): every position name holds two lines, so a name that wraps does not push its
 *   card below the others in the row. The 3- and 5-card draws (.slots) keep their shape.
 */

const webRoot = ["apps/web", "."].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(join(path, "components/premium")))!;
const css = (path: string) => readFileSync(join(webRoot, path), "utf8");
const rule = (text: string, selector: string) => {
  const at = text.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return text.slice(at, text.indexOf("}", at));
};
const px = (block: string, property: string) => Number(new RegExp(String.raw`${property}:\s*(-?\d+(?:\.\d+)?)px`).exec(block)?.[1] ?? Number.NaN);

describe("card labels on the premium spreads (360px review 2026-10-17)", () => {
  it("CrossSpread puts each position name below the reversed tag that hangs under its card", () => {
    const overhang = -px(rule(css("components/tarot/TarotCard.module.css"), ".tag"), "bottom");
    expect(overhang).toBeGreaterThan(0);
    const slot = rule(css("components/premium/premium.module.css"), ".crossSlot");
    const label = rule(css("components/premium/premium.module.css"), ".crossLabel");
    const gap = px(slot, "gap");
    const margin = Number.isNaN(px(label, "margin-top")) ? 0 : px(label, "margin-top");
    expect(gap + margin).toBeGreaterThanOrEqual(overhang + 2);
  });

  it("the ten-card draw keeps two lines for every position name, its cards level across a row", () => {
    const draw = css("components/tarot/DeckDraw.module.css");
    const names = rule(draw, ".grid > li > p:first-child");
    const lineHeight = Number(/line-height:\s*(\d+(?:\.\d+)?)/.exec(rule(draw, ".grid p"))?.[1]);
    expect(names).toMatch(new RegExp(String.raw`min-height:\s*${2 * lineHeight}em`));
    expect(names).toMatch(/align-items:\s*flex-end/);
    expect(rule(draw, ".slots")).not.toMatch(/min-height/);
  });
});
