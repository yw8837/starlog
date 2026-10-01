import { describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { boxesOverlap, clip, layoutLabels, pillWidth } from "./labels";

const NAMES = ["민지", "하늘이", "도윤", "서아", "별빛", "지우", "Momo"];

describe("label layout", () => {
  it("keeps every pill inside the box and clear of the other pills, for every sign", () => {
    for (const font of [36, 42]) {
      for (const c of CONSTELLATIONS) {
        const boxes = layoutLabels(c.stars, NAMES.slice(0, c.slots), font);
        expect(boxes.filter(Boolean)).toHaveLength(c.slots);
        for (const [i, a] of boxes.entries()) {
          expect(a!.x).toBeGreaterThanOrEqual(0);
          expect(a!.y).toBeGreaterThanOrEqual(0);
          expect(a!.x + a!.w).toBeLessThanOrEqual(1000);
          expect(a!.y + a!.h).toBeLessThanOrEqual(1000);
          for (const b of boxes.slice(i + 1)) expect(boxesOverlap(a!, b!), `${c.id} ${a!.text}/${b!.text} @${font}`).toBe(false);
        }
      }
    }
  });

  it("shrinks a long Latin name to fit instead of letting it run past its pill", () => {
    const [box] = layoutLabels([[500, 500]], ["WWWWWWWWWW"], 46);
    expect(box!.w).toBeLessThanOrEqual(420);
    expect(box!.font).toBeLessThan(46);
    // the text at its own size fits the pill that was drawn for it
    expect(pillWidth("WWWWWWWWWW", box!.font)).toBeLessThanOrEqual(box!.w);
    const [short] = layoutLabels([[500, 500]], ["민지"], 46);
    expect(short!.font).toBe(46);
  });

  it("leaves empty slots without a pill and sizes pills by their text", () => {
    const boxes = layoutLabels(CONSTELLATIONS[0]!.stars, ["민지", null, "", "하늘"], 40);
    expect(boxes.map((b) => b?.text ?? null)).toEqual(["민지", null, null, "하늘"]);
    expect(pillWidth("가나다", 40)).toBeGreaterThan(pillWidth("가", 40));
    expect(clip("가나다라마바사아자차", 8)).toBe("가나다라마바사…");
    expect(clip("민지", 8)).toBe("민지");
  });
});
