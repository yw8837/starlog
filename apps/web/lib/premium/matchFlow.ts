import type { LoveStatus, WorkStatus } from "@/lib/reading/types";
import { sanitizeSajuContext } from "@/lib/sajuFlow";
import { sanitizeSajuForm, type SajuForm } from "@/lib/sajuForm";
import { createSessionStore } from "@/lib/sessionStore";
import { clearPremiumTeaser } from "@/lib/reading/teaserCache";
import { clearPremiumResume, hasPremiumResume } from "./client";

/**
 * 프리미엄 궁합's flow (form → preview; saju only since 2026-10-17, no cards to draw), kept in this tab's sessionStorage
 * only: the other person's birth dies with the tab (P5 spec §9) and never goes into a URL. After the reading is saved
 * the flow is cleared, so the partner's birth then lives only sealed in the user's own chapter token.
 */

export const MATCH_FLOW_KEY = "starlog.match-flow";

/** The server's relations (lib/ai/prompts/match MATCH_RELATIONS, RELATION_KO), in its order and words. */
export const MATCH_RELATION_OPTIONS = [
  { value: "lover", label: "연인" },
  { value: "crush", label: "썸" },
  { value: "spouse", label: "부부" },
  { value: "friend", label: "친구" },
  { value: "coworker", label: "동료" },
  { value: "family", label: "가족" },
] as const;
export type MatchRelationId = (typeof MATCH_RELATION_OPTIONS)[number]["value"];
export const relationLabel = (relation: MatchRelationId) => MATCH_RELATION_OPTIONS.find((o) => o.value === relation)!.label;

export const PARTNER_LABEL_MAX = 10;
export const MATCH_CONCERN_MAX = 60;

export interface MatchFlow {
  /** My birth as it was when the form was sent (the request must stay the same for every part). */
  me?: SajuForm;
  meStatus?: { loveStatus?: LoveStatus; workStatus?: WorkStatus };
  partner?: SajuForm;
  /** What the user calls the other person (부르는 말, optional). */
  partnerLabel?: string;
  relation?: MatchRelationId;
  concern?: string;
  /** 상대에게 알리거나 동의를 받을 수 있는 사이에서만 입력할게요 */
  ack?: boolean;
  /** When the flow was last saved (epoch ms): it lives MATCH_FLOW_TTL_MS from there. */
  savedAt?: number;
}

/** An unfinished flow (the partner's birth) is kept 24 hours at most (review 2026-10-17 M4). */
export const MATCH_FLOW_TTL_MS = 24 * 60 * 60 * 1000;
/** Pages a 궁합 flow passes through: its own, checkout, login and the policies its form links to. Any other page ends it. */
const MATCH_FLOW_PATHS = ["/premium/match", "/pay/", "/login", "/auth/", "/privacy", "/terms", "/refund"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const clip = (value: unknown, max: number) => (typeof value === "string" ? Array.from(value).slice(0, max).join("") : undefined);

/** Keeps only what the flow knows, so stale or edited storage can never break a page (an older tab's cards included). */
export function sanitizeMatchFlow(value: unknown): MatchFlow {
  if (!isRecord(value)) return {};
  const me = sanitizeSajuForm(value.me) ?? undefined;
  const status = sanitizeSajuContext(value.meStatus);
  const partner = sanitizeSajuForm(value.partner) ?? undefined;
  const partnerLabel = clip(value.partnerLabel, PARTNER_LABEL_MAX);
  const relation = MATCH_RELATION_OPTIONS.find((o) => o.value === value.relation)?.value;
  const concern = clip(value.concern, MATCH_CONCERN_MAX);
  return {
    ...(me ? { me } : {}),
    ...(status && (status.loveStatus || status.workStatus) ? { meStatus: status } : {}),
    ...(partner ? { partner } : {}),
    ...(partnerLabel ? { partnerLabel } : {}),
    ...(relation ? { relation } : {}),
    ...(concern ? { concern } : {}),
    ...(value.ack === true ? { ack: true } : {}),
    ...(typeof value.savedAt === "number" && Number.isFinite(value.savedAt) ? { savedAt: value.savedAt } : {}),
  };
}

/** The form until both births, the relation and the consent are given; then the preview. */
export function matchReady(flow: MatchFlow): "form" | "ready" {
  return flow.me && flow.partner && flow.relation && flow.ack ? "ready" : "form";
}

/** The request /api/premium/match/* takes (lib/premium/inputs.ts MatchBody), or null before the flow is ready. */
export function matchBody(flow: MatchFlow) {
  if (matchReady(flow) !== "ready") return null;
  const label = flow.partnerLabel?.trim();
  const concern = flow.concern?.trim();
  return {
    me: { birth: flow.me!, ...(flow.meStatus?.loveStatus ? { loveStatus: flow.meStatus.loveStatus } : {}), ...(flow.meStatus?.workStatus ? { workStatus: flow.meStatus.workStatus } : {}) },
    partner: { birth: flow.partner!, ...(label ? { label } : {}) },
    relation: flow.relation!,
    ...(concern ? { concern } : {}),
    ack: true as const,
  };
}

/**
 * The account's copy of this flow's 궁합, found after a cut-off (lib/storage/sync.ts checkDelivery): the same relation,
 * label and concern, and the same own birth (me.birth), so two 궁합 of one relation on one account never cross (review
 * 2026-10-20 A4). Never the other person's birth: the account's copy holds none (owner 2026-10-16).
 */
export function matchesThisFlow(chapter: unknown, flow: MatchFlow): boolean {
  const body = matchBody(flow);
  if (!body || !isRecord(chapter) || chapter.kind !== "match") return false;
  const me = isRecord(chapter.me) ? sanitizeSajuForm(chapter.me.birth) : null;
  return (
    chapter.relation === body.relation &&
    (chapter.partnerLabel ?? "") === (body.partner.label ?? "") &&
    (chapter.concern ?? "") === (body.concern ?? "") &&
    me !== null &&
    JSON.stringify(me) === JSON.stringify(sanitizeSajuForm(body.me.birth))
  );
}

const store = createSessionStore<MatchFlow>(MATCH_FLOW_KEY, (value) => sanitizeMatchFlow(value));

/** `flow` is undefined until the browser snapshot is read; {} when nothing is kept. */
export function useMatchFlow(): { flow: MatchFlow | undefined; setFlow: (next: MatchFlow) => void } {
  const value = store.useValue();
  return { flow: value === undefined ? undefined : (value ?? {}), setFlow: saveMatchFlow };
}

export function saveMatchFlow(next: MatchFlow, now: number = Date.now()) {
  store.save(sanitizeMatchFlow({ ...next, savedAt: now }));
}

/** The flow now (browser only). */
export const readMatchFlow = (): MatchFlow => store.read() ?? {};

/** After the reading is saved: the partner's birth leaves the tab. */
export function clearMatchFlow() {
  store.clear();
}

/**
 * Whenever a page opens (RouteTracker): an unfinished 궁합 flow ends once the user leaves its pages, or 24 hours after it
 * was last saved (review 2026-10-17 M4). The partner's birth leaves the tab with its preview and resume token. A paid
 * reading with parts already written (its resume token) is kept on leaving, so it can be finished; only the 24 hours
 * end it (review 2026-10-17 #7).
 */
export function pruneMatchFlow(pathname: string, now: number = Date.now()): void {
  const flow = store.read();
  if (!flow) return;
  const fresh = flow.savedAt !== undefined && now - flow.savedAt < MATCH_FLOW_TTL_MS;
  const inFlow = MATCH_FLOW_PATHS.some((path) => pathname.startsWith(path));
  if (fresh && (inFlow || hasPremiumResume("match"))) return;
  store.clear();
  clearPremiumTeaser("match|");
  clearPremiumResume("match");
}
