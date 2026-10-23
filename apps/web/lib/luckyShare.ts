/**
 * A shared 이번 주 행운 번호 (/lucky?n=4-9-17-23-31-40&w=2026-10-19): six distinct numbers in 1–45 and the week's Monday,
 * the same check the image route makes (app/api/og/lucky). Nothing of the birth date is in it.
 */
export function parseLuckyShare(n: unknown, w: unknown): { numbers: number[]; weekId: string } | null {
  if (typeof n !== "string" || typeof w !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w)) return null;
  const numbers = n.split("-").map(Number);
  const valid = numbers.length === 6 && new Set(numbers).size === 6 && numbers.every((x) => Number.isInteger(x) && x >= 1 && x <= 45);
  return valid ? { numbers: [...numbers].sort((a, b) => a - b), weekId: w } : null;
}

/** "10월 19일부터 한 주" */
export function luckyWeekLabel(weekId: string): string {
  const [, m, d] = weekId.split("-").map(Number);
  return `${m}월 ${d}일부터 한 주`;
}
