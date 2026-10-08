import { describe, expect, it } from "vitest";
import sample from "@content/samples/saju-prologue.ko.json";
import { SAJU_ARTICLES } from "./guide-articles/saju";
import { SAJU_CONCEPT_ARTICLES } from "./guide-articles/saju-concepts";
import { SAJU_GLANCE_HEADING, SAJU_GLANCE_LABELS, SAJU_PROLOGUE_SECTIONS } from "./sajuPrologue";

/** 명리 terms a plain heading leaves out (owner 2026-10-07: plain words first). */
const JARGON = ["월령", "오행", "십성", "일지", "일간", "대운", "세운", "식신", "편관", "제왕", "비겁", "식상", "재성", "관성", "인성", "월주"];

describe("SAJU_PROLOGUE_SECTIONS", () => {
  it("keeps one generic entry per paid section, in the sample's order and 'label · title' form, under plain labels", () => {
    expect(SAJU_PROLOGUE_SECTIONS).toHaveLength(sample.paid.sections.length);
    expect(SAJU_PROLOGUE_SECTIONS.map((h) => h.split(" · ")[0])).toEqual([
      "타고난 바탕", "많은 기운·적은 기운", "나를 움직이는 힘", "가까운 관계 속 나", "일할 때·쉴 때", "지금의 10년과 올해", "이름표 풀이", "기운 채우기", "계산 기준",
    ]);
    for (const heading of SAJU_PROLOGUE_SECTIONS) expect(heading.split(" · ")).toHaveLength(2);
    for (const heading of SAJU_PROLOGUE_SECTIONS) for (const term of JARGON) expect(heading, heading).not.toContain(term);
  });

  it("names the 한눈에 보기 card and its four plain labels (owner 2026-10-07)", () => {
    expect(SAJU_GLANCE_HEADING.split(" · ")[0]).toBe("한눈에 보기");
    expect(SAJU_GLANCE_LABELS).toEqual({ goesWell: "잘 풀리는 쪽", watchOut: "조심할 쪽", remedy: "이렇게 보완", thisYear: "올해 흐름" });
    for (const term of JARGON) expect(SAJU_GLANCE_HEADING).not.toContain(term);
  });

  it("is the name the guides use for the second section (review 2026-10-08: 많은 기운·적은 기운)", () => {
    const guides = JSON.stringify([SAJU_CONCEPT_ARTICLES, SAJU_ARTICLES]);
    expect(guides).toContain("많은 기운·적은 기운");
    expect(guides).not.toContain("모자란 기운");
  });

  it("holds nothing that is only true of the sample chart", () => {
    const text = SAJU_PROLOGUE_SECTIONS.join(" ");
    for (const specific of ["한겨울", "丙", "巳", "庚", "辰", "불 셋", "정관", "상관", "편인", "비견", "경진", "시를 모를"]) {
      expect(text).not.toContain(specific);
    }
  });
});
