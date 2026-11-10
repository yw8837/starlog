/**
 * The line over the locked contents (spec 2026-11-11 entry funnel renewal 3.6): what the free part gave and what is left,
 * from the counts the server sends with the 맛보기 (lib/ai/generate.ts), never a fixed number. A 맛보기 kept on the device
 * before the counts reads as it did.
 */
export interface TocCounts {
  lockedToc: readonly string[];
  /** Every heading of the paid reading. */
  tocTotal?: number;
  /** Headings the 맛보기 showed whole. */
  tocOpen?: number;
  /** Locked headings whose first part the 맛보기 showed (the tarot second card, 감질맛). */
  tocPartial?: number;
}

const headings = (total: number, open: number) => (open > 0 ? `소제목 ${total}개 중 ${open}개 공개` : `소제목 ${total}개`);

/** Tarot (T13): "소제목 12개 중 1개 공개 · 1개는 앞부분만 · 전체 약 2,000자". `chars`: the length as approxCharsText writes it. */
export function tarotTocMeta(teaser: TocCounts, chars: string): string {
  if (teaser.tocTotal === undefined) return `소제목 ${teaser.lockedToc.length}개 · 약 ${chars}자`;
  const partial = teaser.tocPartial ?? 0;
  return [headings(teaser.tocTotal, teaser.tocOpen ?? 0), ...(partial > 0 ? [`${partial}개는 앞부분만`] : []), `전체 약 ${chars}자`].join(" · ");
}

/** Saju (S27): no heading is shown, so the line names what was (the name and the summary) rather than "0개 공개". */
export function sajuTocMeta(teaser: TocCounts, chars: string): string {
  if (teaser.tocTotal === undefined) return `소제목 ${teaser.lockedToc.length}개 · 약 ${chars}자`;
  return [headings(teaser.tocTotal, teaser.tocOpen ?? 0), "맛보기에서는 이름과 요약을 먼저 보여 드렸어요", `전체 약 ${chars}자`].join(" · ");
}
