import { describe, expect, it } from "vitest";
import { getCard } from "../../src/tarot/cards";
import type { BondBasis } from "../../src/bonds/score";
import { LUCKY_NOTICE, cardNumber, elementNumbers, kstWeekId, weekElement, weeklyLucky } from "../../src/bonds/lucky";

const basis: BondBasis = { dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false };

describe("lucky numbers", () => {
  it("maps elements to 하도수 endings within 1-45", () => {
    expect(elementNumbers("수")).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 41]);
    expect(elementNumbers("토")).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45]);
  });

  it("maps cards to 1-45 (the Fool is 22)", () => {
    expect(cardNumber(getCard("major-00-fool"))).toBe(22);
    expect(cardNumber(getCard("major-17-star"))).toBe(17);
    expect(cardNumber(getCard("wands-01"))).toBe(1);
    expect(cardNumber(getCard("pentacles-14"))).toBe(11); // (3*14 + 14 - 1) % 45 + 1
  });

  it("uses the KST Monday as the week id", () => {
    // 2026-10-04 is a Sunday; 23:30 KST that day is still the week of 2026-09-28
    expect(kstWeekId(Date.UTC(2026, 9, 4, 14, 30))).toBe("2026-09-28");
    // 2026-10-05 00:10 KST is Monday → new week
    expect(kstWeekId(Date.UTC(2026, 9, 4, 15, 10))).toBe("2026-10-05");
  });

  it("gives 6 unique ascending numbers with a reason each, the same for the same person and week", () => {
    const a = weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-09-28" });
    const b = weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-09-28" });
    expect(a).toEqual(b);
    const ns = a.numbers.map((x) => x.n);
    expect(new Set(ns).size).toBe(6);
    expect([...ns].sort((x, y) => x - y)).toEqual(ns);
    for (const x of a.numbers) {
      expect(x.n).toBeGreaterThanOrEqual(1);
      expect(x.n).toBeLessThanOrEqual(45);
      expect(x.reason).toMatch(/[가-힣]/);
    }
    // two picks come from the weakest element (금 → endings 4, 9)
    expect(a.numbers.filter((x) => x.reason.includes("부족한 금")).every((x) => [4, 9].includes(x.n % 10))).toBe(true);
    expect(weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-10-05" })).not.toEqual(a);
    expect(weekElement("2026-09-28")).toMatch(/^[목화토금수]$/);
    expect(LUCKY_NOTICE).toContain("확률이 같아요");
  });

  it("stays unique over many people and weeks, and never says 로또", () => {
    for (let i = 0; i < 80; i++) {
      const r = weeklyLucky({ basis, seedKey: `p${i}`, weekId: i % 2 ? "2026-09-28" : "2026-10-05" });
      expect(new Set(r.numbers.map((x) => x.n)).size).toBe(6);
      for (const x of r.numbers) expect(x.reason).not.toContain("로또");
    }
  });
});
