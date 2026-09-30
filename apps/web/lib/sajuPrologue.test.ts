import { describe, expect, it } from "vitest";
import sample from "@content/samples/saju-prologue.ko.json";
import { SAJU_PROLOGUE_SECTIONS } from "./sajuPrologue";

describe("SAJU_PROLOGUE_SECTIONS", () => {
  it("keeps one generic entry per paid section, in the sample's order and 'label · title' form", () => {
    expect(SAJU_PROLOGUE_SECTIONS).toHaveLength(sample.paid.sections.length);
    expect(SAJU_PROLOGUE_SECTIONS.map((h) => h.split(" · ")[0])).toEqual(["월령과 뿌리", "오행 지도", "십성", "일지", "일하는 결과 쉬는 결", "지금의 10년", "계산 기준"]);
    for (const heading of SAJU_PROLOGUE_SECTIONS) expect(heading.split(" · ")).toHaveLength(2);
  });

  it("holds nothing that is only true of the sample chart", () => {
    const text = SAJU_PROLOGUE_SECTIONS.join(" ");
    for (const specific of ["한겨울", "丙", "巳", "庚", "辰", "불 셋", "정관", "상관", "편인", "비견", "경진", "시를 모를"]) {
      expect(text).not.toContain(specific);
    }
  });
});
