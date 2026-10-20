import "server-only";
import { historyForTopic, withoutCrisisItems, type HistoryItem } from "@/lib/ai/history";
import { buildFactSet, type SajuFactSet, type SajuProfile } from "@/lib/ai/prompts/saju";
import { buildTopicFactSet, type SajuTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import { sajuTopicsMode } from "@/lib/config";
import type { SajuTopicId } from "@/lib/reading/types";
import { checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import { crisisResponse, errorResponse, isCrisisText, readJson, type Gate } from "./http";
import { LOVE_STATUS, SajuBody, WORK_STATUS, type BirthInput, type SajuBodyData } from "./inputs";

/** The optional status chips as Korean labels, or undefined when none was given. The saju side takes no free text. */
export function profileOf(body: Pick<SajuBodyData, "loveStatus" | "workStatus">): SajuProfile | undefined {
  const profile: SajuProfile = {};
  if (body.loveStatus) profile.loveStatus = LOVE_STATUS[body.loveStatus];
  if (body.workStatus) profile.workStatus = WORK_STATUS[body.workStatus];
  return Object.keys(profile).length ? profile : undefined;
}

/** A chapter token's profile without the one-line concern older tokens may carry (saju-topics spec §7.7). */
export function withoutConcern(profile: SajuProfile | undefined): SajuProfile | undefined {
  if (!profile) return undefined;
  const { concern: _dropped, ...rest } = profile;
  return Object.keys(rest).length ? rest : undefined;
}

/** Recomputes the chart on the server (client chart facts are never trusted) and builds the FactSet. */
export function factsFromBirth(birth: BirthInput, now: number, profile?: SajuProfile, history?: readonly HistoryItem[]): SajuFactSet | Response {
  const checked = checkSajuForm(birth, todayInKorea(new Date(now)));
  if ("error" in checked) return errorResponse("BAD_REQUEST", { field: checked.error.field, message: checked.error.message });
  return buildFactSet(checked.chart, now, profile, history);
}

/**
 * The same for a topic: the topic FactSet from the server's own chart (spec §7.4). The engine's optional
 * situation chip is never passed (owner cut §0).
 */
export function topicFactsFromBirth(birth: BirthInput, now: number, topic: SajuTopicId, history?: readonly HistoryItem[]): SajuTopicFactSet | Response {
  const checked = checkSajuForm(birth, todayInKorea(new Date(now)));
  if ("error" in checked) return errorResponse("BAD_REQUEST", { field: checked.error.field, message: checked.error.message });
  return buildTopicFactSet(checked.chart, now, topic, undefined, history);
}

/**
 * Whether this request may get a topic (전체 흐름 never needs it): the flag (spec §13: `on` for
 * everyone, `owner` for the owner pass) on Korean screens only (another language sends
 * `x-starlog-locale`; no client does yet).
 */
export function topicsOpenFor(request: Request, gate: Pick<Gate, "owner">): boolean {
  const locale = request.headers.get("x-starlog-locale")?.trim().toLowerCase();
  if (locale && locale !== "ko") return false;
  const mode = sajuTopicsMode();
  return mode === "on" || (mode === "owner" && gate.owner);
}

/** Largest accepted body; a schema-maximum body (statuses and 3 full history items) is about 2.9 KB. */
export const SAJU_BODY_MAX_BYTES = 8_000;

export type SajuRequest =
  | { topic: "overall"; body: SajuBodyData; profile?: SajuProfile; facts: SajuFactSet }
  | { topic: SajuTopicId; body: SajuBodyData; facts: SajuTopicFactSet };

/**
 * Body → topic gate (flag, language) → crisis check → the earlier readings that belong with this one →
 * FactSet; shared by the saju teaser and reading (saju-topics spec §7.1, §7.3).
 */
export async function sajuRequest(request: Request, gate: Pick<Gate, "now" | "owner">): Promise<SajuRequest | Response> {
  const parsed = SajuBody.safeParse(await readJson(request, SAJU_BODY_MAX_BYTES));
  if (!parsed.success) return errorResponse("BAD_REQUEST");
  const body = parsed.data;
  if (body.topic !== "overall" && !topicsOpenFor(request, gate)) return errorResponse("BAD_REQUEST", { field: "topic" });
  const profile = body.topic === "overall" ? profileOf(body) : undefined;
  // The status labels; earlier questions only leave the prompt (withoutCrisisItems).
  const crisis = crisisResponse(profile?.loveStatus, profile?.workStatus);
  if (crisis) return crisis;
  const history = historyForTopic(withoutCrisisItems(body.history, isCrisisText), body.topic);
  if (body.topic === "overall") {
    const facts = factsFromBirth(body.birth, gate.now, profile, history);
    if (facts instanceof Response) return facts;
    return { topic: "overall", body: { ...body, history }, profile, facts };
  }
  const facts = topicFactsFromBirth(body.birth, gate.now, body.topic, history);
  if (facts instanceof Response) return facts;
  return { topic: body.topic, body: { ...body, history }, facts };
}
