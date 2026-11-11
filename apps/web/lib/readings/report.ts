/**
 * 신고 on an AI reading (the Starlog app, W2.5): what can be reported and why. Shared by POST /api/readings/report and the
 * 신고 control (components/report/ReportReading.tsx). Client-safe.
 */

/**
 * The reading surfaces: the full readings, the premium ones, follow-up answers, the 맛보기 (premium previews too), 오늘의 한 장,
 * a shared link, and 별자리 인연's 오늘의 인연 카드 line (`bond`, written by the model: lib/bonds/todayLine.ts).
 */
export const REPORT_KINDS = ["tarot", "saju", "tarot-deep", "match", "newyear-2027", "followup", "teaser", "daily", "shared", "bond"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Why, in fixed words: never free text as the reason (the note is optional and apart). */
export const REPORT_REASONS = ["offensive", "harmful", "sexual", "misleading", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  offensive: "불쾌하거나 모욕적인 내용이에요",
  harmful: "위험하거나 해로운 내용이에요",
  sexual: "선정적인 내용이에요",
  misleading: "사실과 다르거나 오해를 부르는 내용이에요",
  other: "그 밖의 문제예요",
};

/** A reading id the report may carry (a saved reading's, a share link's): letters, digits, _ and -, at most 64. */
export const REPORT_READING_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const REPORT_NOTE_MAX = 500;
