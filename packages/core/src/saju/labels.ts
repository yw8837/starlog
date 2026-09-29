// Stem/branch labels and derived tables owned by the wrapper (saju-policy@1). The engine
// (manseryeok) works in hangul; charts are keyed by hanja with hangul labels next to them.

export type SajuElement = "목" | "화" | "토" | "금" | "수";

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const STEMS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
export const STEM_ELEMENTS: readonly SajuElement[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];

export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export const BRANCHES_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
export const BRANCH_ELEMENTS: readonly SajuElement[] = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];

/** 지장간, 본기(정기) first, then 중기, 여기 (same table and order as lunar-javascript 1.7.7). */
export const HIDDEN_STEMS: Readonly<Record<(typeof BRANCHES)[number], readonly string[]>> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
  辰: ["戊", "乙", "癸"], 巳: ["丙", "庚", "戊"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};

function indexOrThrow(list: readonly string[], value: string, what: string): number {
  const i = list.indexOf(value);
  if (i < 0) throw new Error(`Unknown ${what}: ${value}`);
  return i;
}

export const stemIndexOfKo = (ko: string) => indexOrThrow(STEMS_KO, ko, "stem");
export const branchIndexOfKo = (ko: string) => indexOrThrow(BRANCHES_KO, ko, "branch");
export const stemElement = (stem: string) => STEM_ELEMENTS[indexOrThrow(STEMS, stem, "stem")]!;
export const branchElement = (branch: string) => BRANCH_ELEMENTS[indexOrThrow(BRANCHES, branch, "branch")]!;
