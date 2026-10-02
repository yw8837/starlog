import { DEFAULT_REVERSAL_RATE, TEMPLATES, computeChart, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { buildDeepContext } from "@/lib/ai/prompts/deepTarot";
import { buildNewYearFacts } from "@/lib/ai/prompts/newyear";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { PART_COUNTS, runNextPart, type PremiumContext } from "./run";

const deep: PremiumContext = {
  product: "tarot-deep",
  tarot: buildDeepContext(pickCards(createDeck("run", DEFAULT_REVERSAL_RATE), TEMPLATES["deep-tarot"], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { topicId: "money", whoId: "me", whenId: "month", question: "", conditions: [] }),
};
const year: PremiumContext = { product: "newyear-2027", year: buildNewYearFacts(computeChart(toSajuInput(DEFAULT_SAJU_FORM))) };

describe("part runner", () => {
  it("writes one part per call and assembles after the last", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const first = await runNextPart(mockProvider, deep, []);
    expect(first.complete).toBe(false);
    expect(first.parts).toHaveLength(1);
    const last = await runNextPart(mockProvider, deep, first.parts);
    expect(last.complete).toBe(true);
    if (last.complete) expect((last.reading as { positions: unknown[] }).positions).toHaveLength(10);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("never regenerates a part it was handed", async () => {
    const a = (await runNextPart(mockProvider, year, [])).parts;
    const b = (await runNextPart(mockProvider, year, a)).parts;
    const spy = vi.spyOn(mockProvider, "generate");
    const c = await runNextPart(mockProvider, year, b);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(c.complete).toBe(true);
    spy.mockRestore();
  });

  it("knows each product's part count and refuses an extra part", async () => {
    expect(PART_COUNTS).toEqual({ "tarot-deep": 2, match: 2, "newyear-2027": 3 });
    const a = (await runNextPart(mockProvider, deep, [])).parts;
    const b = (await runNextPart(mockProvider, deep, a)).parts;
    await expect(runNextPart(mockProvider, deep, b)).rejects.toThrow();
  });
});
