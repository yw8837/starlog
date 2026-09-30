import "server-only";
import { buildFactSet, type SajuFactSet } from "@/lib/ai/prompts/saju";
import { checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import { errorResponse } from "./http";
import type { BirthInput } from "./inputs";

/** Recomputes the chart on the server (client chart facts are never trusted) and builds the FactSet. */
export function factsFromBirth(birth: BirthInput, now: number): SajuFactSet | Response {
  const checked = checkSajuForm(birth, todayInKorea(new Date(now)));
  if ("error" in checked) return errorResponse("BAD_REQUEST", { field: checked.error.field, message: checked.error.message });
  return buildFactSet(checked.chart, now);
}
