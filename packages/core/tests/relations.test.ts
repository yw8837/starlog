import { describe, expect, it } from "vitest";
import { BRANCHES, STEMS, branchRelations, relationsWithin, stemRelations, type Placed } from "../src";

// spec 2026-11-11-saju-grade-card-design.md F (C1): the tables moved out of apps/web/lib/ai/prompts/saju.ts unchanged.
const at = (glyph: string, place = ""): Placed => ({ glyph, at: place });
const typesOf = (a: string, b: string, sameChart = false) => branchRelations(at(a), at(b), sameChart).map((r) => r.type);
const stemTypesOf = (a: string, b: string, sameChart = false) => stemRelations(at(a), at(b), sameChart).map((r) => r.type);

describe("relation tables", () => {
  it("are symmetric: a meets b as b meets a", () => {
    for (const a of BRANCHES) for (const b of BRANCHES) for (const same of [false, true]) expect(typesOf(a, b, same), `${a}${b}`).toEqual(typesOf(b, a, same));
    for (const a of STEMS) for (const b of STEMS) for (const same of [false, true]) expect(stemTypesOf(a, b, same), `${a}${b}`).toEqual(stemTypesOf(b, a, same));
  });

  it("寅亥 and 巳申 are both 육합 and 파 (the 파 table the readings keep)", () => {
    expect(typesOf("寅", "亥")).toEqual(["육합(六合)", "파(破)"]);
    expect(typesOf("巳", "申")).toEqual(["육합(六合)", "파(破)", "형(刑)"]);
  });

  it("reads 자형 only inside one chart; across charts or layers the same glyph is 같은 글자", () => {
    for (const g of ["辰", "午", "酉", "亥"]) {
      expect(typesOf(g, g, true)).toEqual(["자형(自刑)"]);
      expect(typesOf(g, g, false)).toEqual(["같은 글자"]);
    }
    for (const g of ["子", "丑", "寅", "卯", "巳", "未", "申", "戌"]) expect(typesOf(g, g, true)).toEqual([]);
  });

  it("names a 반합 only with the 왕지 of its 삼합, and the 삼합 in place of its 반합 when all three stand", () => {
    expect(typesOf("申", "子")).toEqual(["반합(半合, 물 기운)"]);
    expect(typesOf("申", "辰")).toEqual([]);
    const placed = [at("申", "년지"), at("子", "월지"), at("辰", "일지")];
    expect(relationsWithin([], placed).map((r) => r.type)).toEqual(["삼합(三合, 물 기운)"]);
  });

  it("천간합 five pairs, 천간충 four pairs (戊己 meet no 충)", () => {
    const combine = STEMS.flatMap((a, i) => STEMS.slice(i + 1).filter((b) => stemTypesOf(a, b).includes("천간합(天干合)")).map((b) => a + b));
    const clash = STEMS.flatMap((a, i) => STEMS.slice(i + 1).filter((b) => stemTypesOf(a, b).includes("천간충(天干沖)")).map((b) => a + b));
    expect(combine).toEqual(["甲己", "乙庚", "丙辛", "丁壬", "戊癸"]);
    expect(clash).toEqual(["甲庚", "乙辛", "丙壬", "丁癸"]);
  });
});
