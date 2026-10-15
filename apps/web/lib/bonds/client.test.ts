import { describe, expect, it } from "vitest";
import { JOIN_FAILED, bondsMessage } from "./client";

describe("bondsMessage", () => {
  it("says loading failed for an unknown failure, and joining failed where the friend was joining (F-12)", () => {
    expect(bondsMessage({ code: "SERVER" })).toBe("지금은 별자리를 불러올 수 없어요. 잠시 뒤에 다시 시도해 주세요");
    expect(bondsMessage({ code: "SERVER" }, JOIN_FAILED)).toBe("별자리에 참여하지 못했어요. 잠시 뒤에 다시 시도해 주세요");
    // A known code keeps its own words either way.
    expect(bondsMessage({ code: "ALREADY_JOINED" }, JOIN_FAILED)).toBe("이 기기로 이미 이 별자리에 참여했어요");
  });
});
