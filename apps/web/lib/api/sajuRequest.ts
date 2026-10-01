import "server-only";
import { historyUserTexts, withoutCrisisItems, type HistoryItem } from "@/lib/ai/history";
import { buildFactSet, type SajuFactSet, type SajuProfile } from "@/lib/ai/prompts/saju";
import { cleanUserText } from "@/lib/ai/prompts/tarot";
import { checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import { crisisResponse, errorResponse, isCrisisText, readJson } from "./http";
import { LOVE_STATUS, SajuBody, WORK_STATUS, type BirthInput, type SajuBodyData } from "./inputs";

/** The optional personal context (Korean labels, cleaned concern), or undefined when none was given. */
export function profileOf(body: Pick<SajuBodyData, "loveStatus" | "workStatus" | "concern">): SajuProfile | undefined {
  const profile: SajuProfile = {};
  if (body.loveStatus) profile.loveStatus = LOVE_STATUS[body.loveStatus];
  if (body.workStatus) profile.workStatus = WORK_STATUS[body.workStatus];
  const concern = cleanUserText(body.concern ?? "");
  if (concern) profile.concern = concern;
  return Object.keys(profile).length ? profile : undefined;
}

/** Recomputes the chart on the server (client chart facts are never trusted) and builds the FactSet. */
export function factsFromBirth(birth: BirthInput, now: number, profile?: SajuProfile, history?: readonly HistoryItem[]): SajuFactSet | Response {
  const checked = checkSajuForm(birth, todayInKorea(new Date(now)));
  if ("error" in checked) return errorResponse("BAD_REQUEST", { field: checked.error.field, message: checked.error.message });
  return buildFactSet(checked.chart, now, profile, history);
}

/** Largest accepted body; a schema-maximum body (concern and 3 full history items) is about 3.1 KB. */
export const SAJU_BODY_MAX_BYTES = 8_000;

/** Body → crisis check → FactSet, shared by the saju teaser and reading. */
export async function sajuRequest(request: Request, now: number): Promise<{ body: SajuBodyData; profile?: SajuProfile; facts: SajuFactSet } | Response> {
  const parsed = SajuBody.safeParse(await readJson(request, SAJU_BODY_MAX_BYTES));
  if (!parsed.success) return errorResponse("BAD_REQUEST");
  const profile = profileOf(parsed.data);
  // What the user wrote (the concern, earlier questions) and the status labels.
  const crisis = crisisResponse(parsed.data.concern, profile?.loveStatus, profile?.workStatus, ...historyUserTexts(parsed.data.history));
  if (crisis) return crisis;
  const history = withoutCrisisItems(parsed.data.history, isCrisisText);
  const facts = factsFromBirth(parsed.data.birth, now, profile, history);
  if (facts instanceof Response) return facts;
  return { body: { ...parsed.data, history }, profile, facts };
}
