/**
 * The pages of the tarot worries (spec 2026-11-26 worry catalog §5.2): their start moves into the tarot flow with its
 * values, so lib/useFlowVisit.ts counts them as pages of that flow. Written out here, apart from lib/worries.ts, so the
 * builder, situation and saju input bundles do not pull the whole catalog (code review 2026-11-26 A5); lib/worries.test.ts
 * checks the list against the catalog.
 */
/** 고민 전체 보기. Here so a screen that only links to it (app/now) does not pull the catalog. */
export const WORRIES_PATH = "/worries";

export const TAROT_WORRY_PATHS: readonly string[] = [
  "/w/some",
  "/w/no-reply",
  "/w/miss-ex",
  "/w/again",
  "/w/after-breakup",
  "/w/moved-on",
  "/w/coworker",
  "/w/stay-or-go",
];
