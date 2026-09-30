import { describe, expect, it } from "vitest";
import { seededRandom } from "../../src/tarot/draw";
import { CONSTELLATIONS, getConstellation, isSignId, sunSign } from "../../src/bonds/constellations";

describe("constellations", () => {
  it("has the 12 signs in zodiac order with the spec's slot counts (67 in total)", () => {
    expect(CONSTELLATIONS.map((c) => [c.ko, c.slots])).toEqual([
      ["양자리", 4], ["황소자리", 5], ["쌍둥이자리", 6], ["게자리", 5], ["사자자리", 6], ["처녀자리", 6],
      ["천칭자리", 4], ["전갈자리", 7], ["궁수자리", 6], ["염소자리", 5], ["물병자리", 6], ["물고기자리", 7],
    ]);
    expect(CONSTELLATIONS.reduce((n, c) => n + c.slots, 0)).toBe(67);
  });

  it("draws every slot as a star inside the 1000 box, and lines join existing stars", () => {
    for (const c of CONSTELLATIONS) {
      expect(c.stars).toHaveLength(c.slots);
      for (const [x, y] of c.stars) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1000);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1000);
      }
      for (const [a, b] of c.lines) {
        expect(a).toBeLessThan(c.slots);
        expect(b).toBeLessThan(c.slots);
        expect(a).not.toBe(b);
      }
      const touched = new Set(c.lines.flat());
      expect(touched.size).toBe(c.slots); // every star is on the figure
    }
  });

  it("finds a sign by id and rejects unknown ids", () => {
    expect(getConstellation("leo").ko).toBe("사자자리");
    expect(isSignId("aries")).toBe(true);
    expect(isSignId("ophiuchus")).toBe(false);
    expect(() => getConstellation("x" as never)).toThrow();
  });

  it("maps birthdays to tropical sun signs, including the year wrap", () => {
    expect(sunSign(3, 21)).toBe("aries");
    expect(sunSign(4, 19)).toBe("aries");
    expect(sunSign(4, 20)).toBe("taurus");
    expect(sunSign(12, 22)).toBe("capricorn");
    expect(sunSign(1, 1)).toBe("capricorn");
    expect(sunSign(1, 19)).toBe("capricorn");
    expect(sunSign(1, 20)).toBe("aquarius");
    expect(sunSign(3, 20)).toBe("pisces");
  });

  it("seededRandom is deterministic per seed", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    const c = seededRandom("y");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });
});
