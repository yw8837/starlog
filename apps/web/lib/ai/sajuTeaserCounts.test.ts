import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { generateSajuTeaser } from "./generate";
import { mockProvider } from "./mock";
import { SAJU_LOCKED_TOC, buildFactSet } from "./prompts/saju";

describe("the saju 맛보기's lock counts (spec 2026-11-11 3.6)", () => {
  it("counts every heading of the paid reading, none of them shown: the 맛보기 is a name and a summary", async () => {
    const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-11-11T12:00:00+09:00"));
    const { data } = await generateSajuTeaser(mockProvider, facts);
    expect(data.lockedToc).toEqual([...SAJU_LOCKED_TOC]);
    expect(data).toMatchObject({ tocTotal: SAJU_LOCKED_TOC.length, tocOpen: 0, tocPartial: 0 });
  });
});
