"use client";

import { computeChart, type SajuChart } from "@starlog/core";
import { useMemo } from "react";
import { useSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, describeSajuError, toSajuInput, type FieldError, type SajuForm } from "@/lib/sajuForm";

export type ChartResult = { chart: SajuChart } | { error: FieldError };

function compute(form: SajuForm): ChartResult {
  try {
    return { chart: computeChart(toSajuInput(form)) };
  } catch (error) {
    return { error: describeSajuError(error) };
  }
}

/**
 * The chart for the saved birth profile, or for the sample when nothing is saved. `result` stays
 * null until the browser has read sessionStorage, so the sample never flashes before the user's chart.
 */
export function useSajuChart(): { form: SajuForm; ready: boolean; result: ChartResult | null } {
  const { profile } = useSajuProfile();
  const result = useMemo(() => (profile === undefined ? null : compute(profile ?? DEFAULT_SAJU_FORM)), [profile]);
  return { form: profile ?? DEFAULT_SAJU_FORM, ready: profile !== undefined, result };
}
