/**
 * A question's answers live only while the user moves inside its flow (owner: "새로고침이나 페이지
 * 이동하면 초기화좀"). The tarot flow is 질문 ⇄ 상황 → 카드 뽑기 (and 결과, whose 질문 고치기 leads
 * back), the saju flow 입력 ⇄ 명식. The builder, the situation step and the saju form keep the
 * answers only when the route shown just before was another page of the same flow — a link, a
 * push or browser back/forward between them (lib/useFlowVisit.ts, with the route tracker in the
 * root layout); a refresh, a link from elsewhere or back from the home starts clean, and so do
 * answers left alone for 30 minutes. `?new=1` on the links that
 * start a question is dropped from the address on arrival; `?keep=1` asks to keep (tests) and stays.
 * No React here: server components import the hrefs. The saju birth profile is never reset: only
 * the chips and concern.
 */

export const NEW_TAROT_HREF = "/tarot/new?new=1";
export const NEW_SAJU_HREF = "/saju/new?new=1";

export type FlowName = "tarot" | "saju";

/** Answers older than this are a past question, not this one. */
export const FRESH_FOR_MS = 30 * 60 * 1000;

/** True when `savedAt` is missing or more than 30 minutes before `now`. */
export function isStale(savedAt: number | undefined, now = Date.now()): boolean {
  return typeof savedAt !== "number" || now - savedAt > FRESH_FOR_MS;
}

/**
 * True when the address carries `?<name>=1`. The flag is removed from the address bar at once
 * (history entry replaced, Next's state kept), so it counts only for this visit.
 */
export function takeFlag(name: "new"): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return false;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
