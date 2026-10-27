import { bondBasis, type BondBirth } from "@starlog/core";

/**
 * Why a birth date cannot give a 인연 score, in the words the form shows, or null. The same rules as the server's basisOf
 * (lib/bonds/service.ts), so the form says so before the cards (QA 2026-10-27) instead of after them.
 */
export function birthProblem(birth: BondBirth, now: number): string | null {
  const today = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const iso = `${String(birth.year).padStart(4, "0")}-${String(birth.month).padStart(2, "0")}-${String(birth.day).padStart(2, "0")}`;
  if (birth.year < 1900 || (birth.calendar === "solar" && iso > today) || birth.year > Number(today.slice(0, 4))) return "생년월일을 다시 확인해 주세요";
  try {
    bondBasis(birth);
    return null;
  } catch {
    return birth.calendar === "lunar" && birth.isLeapMonth
      ? "그해 음력 그 달에는 윤달이 없어요. 윤달 표시를 끄거나 다른 날짜를 골라 주세요"
      : "없는 날짜예요. 날짜를 다시 골라 주세요";
  }
}
