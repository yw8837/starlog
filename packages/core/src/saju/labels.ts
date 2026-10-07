// Stem/branch labels and derived tables owned by the wrapper (saju-policy@1). The engine
// (manseryeok) works in hangul; charts are keyed by hanja with hangul labels next to them.

export type SajuElement = "목" | "화" | "토" | "금" | "수";

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const STEMS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
export const STEM_ELEMENTS: readonly SajuElement[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];

export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export const BRANCHES_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
export const BRANCH_ELEMENTS: readonly SajuElement[] = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];

/** A 지장간's role. The 정기 of the 월률분야 table is called 본기 here, as in the facts and the guides. */
export type HiddenRole = "여기" | "중기" | "본기";
export interface HiddenStem {
  stem: string;
  role: HiddenRole;
}

/**
 * 지장간, the Korean 월률분야 table (orrery; ssaju's role names): 여기, 중기 where there is one, then 정기 (본기).
 * Every entry carries its role, so 子·卯·酉 (여기 and 본기, no 중기) need no position to be read.
 */
export const HIDDEN_STEMS: Readonly<Record<(typeof BRANCHES)[number], readonly HiddenStem[]>> = {
  子: [{ stem: "壬", role: "여기" }, { stem: "癸", role: "본기" }],
  丑: [{ stem: "癸", role: "여기" }, { stem: "辛", role: "중기" }, { stem: "己", role: "본기" }],
  寅: [{ stem: "戊", role: "여기" }, { stem: "丙", role: "중기" }, { stem: "甲", role: "본기" }],
  卯: [{ stem: "甲", role: "여기" }, { stem: "乙", role: "본기" }],
  辰: [{ stem: "乙", role: "여기" }, { stem: "癸", role: "중기" }, { stem: "戊", role: "본기" }],
  巳: [{ stem: "戊", role: "여기" }, { stem: "庚", role: "중기" }, { stem: "丙", role: "본기" }],
  午: [{ stem: "丙", role: "여기" }, { stem: "己", role: "중기" }, { stem: "丁", role: "본기" }],
  未: [{ stem: "丁", role: "여기" }, { stem: "乙", role: "중기" }, { stem: "己", role: "본기" }],
  申: [{ stem: "戊", role: "여기" }, { stem: "壬", role: "중기" }, { stem: "庚", role: "본기" }],
  酉: [{ stem: "庚", role: "여기" }, { stem: "辛", role: "본기" }],
  戌: [{ stem: "辛", role: "여기" }, { stem: "丁", role: "중기" }, { stem: "戊", role: "본기" }],
  亥: [{ stem: "戊", role: "여기" }, { stem: "甲", role: "중기" }, { stem: "壬", role: "본기" }],
};

/** A branch's 본기 (정기): the stem its ten god is read by. */
export const mainHiddenStem = (branch: string): string =>
  HIDDEN_STEMS[BRANCHES[indexOrThrow(BRANCHES, branch, "branch")]!].find((h) => h.role === "본기")!.stem;

function indexOrThrow(list: readonly string[], value: string, what: string): number {
  const i = list.indexOf(value);
  if (i < 0) throw new Error(`Unknown ${what}: ${value}`);
  return i;
}

export const stemIndexOfKo = (ko: string) => indexOrThrow(STEMS_KO, ko, "stem");
export const branchIndexOfKo = (ko: string) => indexOrThrow(BRANCHES_KO, ko, "branch");
export const stemElement = (stem: string) => STEM_ELEMENTS[indexOrThrow(STEMS, stem, "stem")]!;
export const branchElement = (branch: string) => BRANCH_ELEMENTS[indexOrThrow(BRANCHES, branch, "branch")]!;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Hangul reading of a hanja ganzhi, e.g. "丙辰" → "병진". */
export function ganzhiKo(ganzhi: string): string {
  return STEMS_KO[indexOrThrow(STEMS, ganzhi.charAt(0), "stem")]! + BRANCHES_KO[indexOrThrow(BRANCHES, ganzhi.charAt(1), "branch")]!;
}

/** The ganzhi `delta` steps along the 60-cycle, e.g. shiftGanzhi("丙寅", -1) → "乙丑". */
export function shiftGanzhi(ganzhi: string, delta: number): string {
  const s = indexOrThrow(STEMS, ganzhi.charAt(0), "stem");
  const b = indexOrThrow(BRANCHES, ganzhi.charAt(1), "branch");
  return STEMS[mod(s + delta, 10)]! + BRANCHES[mod(b + delta, 12)]!;
}
