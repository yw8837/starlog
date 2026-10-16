import { describe, expect, it } from "vitest";
import { DEEP_RESULT_PATH } from "./flowState";
import { cameFromFlow } from "./useFlowVisit";

describe("the 켈틱 크로스 10장 result is a page of the tarot flow (review 2026-10-16 #5)", () => {
  it("keeps the answers on 질문 고치기 from it back into the ten-card builder and the situation step", () => {
    expect(cameFromFlow("tarot", DEEP_RESULT_PATH, "/tarot/new")).toBe(true);
    expect(cameFromFlow("tarot", DEEP_RESULT_PATH, "/tarot/new/situation")).toBe(true);
    expect(cameFromFlow("saju", DEEP_RESULT_PATH, "/saju/new")).toBe(false);
  });
});
