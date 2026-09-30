/** Korean calendar days (KST, UTC+9, no daylight saving): the unit of beta quotas and 오늘의 한 장. */

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-01" for the KST day that contains `ms`. */
export function kstDate(ms: number): string {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/** Whole KST days from `from` to `to` (0 on the same KST day). */
export function kstDaysBetween(from: number, to: number): number {
  return Math.floor((to + KST_MS) / DAY_MS) - Math.floor((from + KST_MS) / DAY_MS);
}

/** "10월 1일" */
export function kstMonthDay(ms: number): string {
  const d = new Date(ms + KST_MS);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}
