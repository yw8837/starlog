/**
 * A new question starts clean (owner: "뒤로가기나 메인으로 갔다가 돌아와도 이전 선택이 유지된다").
 * Links that start one (the home entries, guide CTAs, 새로 물어보기 after a reading) carry `?new=1`;
 * the builder or the saju form then forgets the last question's answers and drops the flag from the
 * address bar, so going back to that page later keeps whatever was chosen since. In-flow links (the
 * steppers' back links, 고치기) carry no flag and keep the answers. Answers left alone for 30 minutes
 * are forgotten as well. The saju birth profile is never part of this: only the per-question context.
 */

export const NEW_TAROT_HREF = "/tarot/new?new=1";
export const NEW_SAJU_HREF = "/saju/new?new=1";

/** Answers older than this are a past question, not this one. */
export const FRESH_FOR_MS = 30 * 60 * 1000;

/** True when `savedAt` is missing or more than 30 minutes before `now`. */
export function isStale(savedAt: number | undefined, now = Date.now()): boolean {
  return typeof savedAt !== "number" || now - savedAt > FRESH_FOR_MS;
}

/**
 * True when this page was opened as a new question (`?new=1`). The flag is removed from the address
 * bar at once (history entry replaced, Next's state kept), so it counts only for this visit.
 */
export function takeNewFlag(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("new")) return false;
  url.searchParams.delete("new");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
