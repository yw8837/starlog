import { describe, expect, it } from "vitest";
import { fanIndexes } from "./CardFan";

describe("fanIndexes", () => {
  it("spreads 21 distinct cards evenly through a 78-card deck", () => {
    const indexes = fanIndexes(78, 21);
    expect(indexes).toHaveLength(21);
    expect(new Set(indexes).size).toBe(21);
    expect(indexes[0]).toBe(1);
    expect(indexes.at(-1)).toBe(76);
    for (let i = 1; i < indexes.length; i++) expect(indexes[i]! - indexes[i - 1]!).toBeGreaterThanOrEqual(3);
  });

  it("never asks for more cards than the deck holds", () => {
    expect(fanIndexes(5, 21)).toEqual([0, 1, 2, 3, 4]);
  });
});
