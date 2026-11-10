import { describe, expect, it } from "vitest";
import { DATA_ARTICLES } from "@/lib/guide-articles/data-articles";
import type { GuideBlock } from "@/lib/guideMeta";
import { chartLayout, estimateTextWidth, spanLabel } from "./GuideChart";

/**
 * The charts' columns hold their longest label and value at 13px (review 2026-11-10: "korean-lunar-calendar" and "3,824일"
 * were clipped). estimateTextWidth over-estimates the browser's measure (getComputedTextLength, checked on the page).
 */
const charts = DATA_ARTICLES.flatMap((a) => a.sections.flatMap((s) => s.blocks ?? [])).filter((b): b is Extract<GuideBlock, { kind: "chart" }> => b.kind === "chart");

describe("GuideChart", () => {
  it.each(charts.filter((c) => c.chart === "bar").map((c) => [c.caption, c] as const))("%s: label and value columns fit their text", (_caption, chart) => {
    if (chart.chart !== "bar") return;
    const layout = chartLayout(chart);
    for (const row of chart.rows) expect(estimateTextWidth(row.label), row.label).toBeLessThanOrEqual(layout.labelW - 10);
    for (const row of chart.rows) expect(estimateTextWidth(layout.valueText(row.value)), row.label).toBeLessThanOrEqual(layout.valueW - 8);
    expect(layout.track).toBeGreaterThanOrEqual(120);
  });

  it("names a span within one year once", () => {
    expect(spanLabel([1948.41, 1948.7])).toBe("1948");
    expect(spanLabel([1912, 1954.2])).toBe("1912–1954");
  });
});
