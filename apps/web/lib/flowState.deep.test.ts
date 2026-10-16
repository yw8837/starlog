import { describe, expect, it } from "vitest";
import { DEEP_TAROT_HREF, NEW_TAROT_HREF } from "./freshStart";
import { DEEP_RESULT_PATH, deepResultGate, resultGate, sanitizeFlow, spreadResultHref, summarizeFlow, type FlowState } from "./flowState";

const base: FlowState = { who: "me", topicId: "money", when: "month", conditions: {}, note: "" };
const CARDS = Array.from({ length: 10 }, (_, i) => ({ position: `자리 ${i + 1}`, cardId: "major-00-fool", orientation: "upright" as const }));

describe("the 켈틱 크로스 10장 spread in the tarot flow", () => {
  it("keeps spread: deep only as that exact value, and keeps a ten-card draw", () => {
    expect(sanitizeFlow({ ...base, spread: "deep" }).spread).toBe("deep");
    expect(sanitizeFlow({ ...base, spread: "celtic" }).spread).toBeUndefined();
    expect(sanitizeFlow({ ...base, spread: "deep", draw: { templateId: "deep-tarot", drawToken: "t", cards: CARDS } }).draw?.cards).toHaveLength(10);
  });

  it("builds the same question; the standard screens never read a ten-card draw as theirs", () => {
    const deep = { ...base, spread: "deep" as const };
    expect(summarizeFlow(deep)).toEqual(summarizeFlow(base));
    expect(resultGate({ ...deep, draw: { templateId: "deep-tarot", drawToken: "t", cards: CARDS } })).toBe("draw");
  });

  it("sends the ten-card result screen to the builder, then the draw, until a ten-card draw exists", () => {
    expect(deepResultGate({ ...base, who: undefined })).toBe("builder");
    expect(deepResultGate(base)).toBe("draw");
    expect(deepResultGate({ ...base, draw: { templateId: "self-flow", drawToken: "t", cards: CARDS.slice(0, 3) } })).toBe("draw");
    expect(deepResultGate({ ...base, draw: { templateId: "deep-tarot", drawToken: "t", cards: CARDS } })).toBe("ready");
  });

  it("goes on to the screen of the spread chosen; URLs carry only the display flag", () => {
    expect(spreadResultHref("deep")).toBe(DEEP_RESULT_PATH);
    expect(DEEP_RESULT_PATH).toBe("/premium/deep-tarot/result");
    expect(spreadResultHref("standard")).toBe("/tarot/result");
    expect(DEEP_TAROT_HREF).toBe("/tarot/new?new=1&spread=deep");
    expect(NEW_TAROT_HREF).toBe("/tarot/new?new=1");
  });
});
