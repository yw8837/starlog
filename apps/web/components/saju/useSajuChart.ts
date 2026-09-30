"use client";

import { computeChart, type SajuChart } from "@starlog/core";
import { useMemo } from "react";
import { useSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, describeSajuError, toSajuInput, type FieldError, type SajuForm } from "@/lib/sajuForm";
import { isSampleChart } from "@/lib/sajuPrologue";

export type ChartResult = { chart: SajuChart } | { error: FieldError };

function compute(form: SajuForm): ChartResult {
  try {
    return { chart: computeChart(toSajuInput(form)) };
  } catch (error) {
    return { error: describeSajuError(error) };
  }
}

export interface SajuChartState {
  form: SajuForm;
  /** The browser snapshot has been read; nothing below is meaningful before this. */
  ready: boolean;
  /** The user saved their own birth data (otherwise the sample input is shown). */
  saved: boolean;
  result: ChartResult | null;
  /** The sample prologue text describes this chart (same pillars, no hour, same gender, born in 서울). */
  isSample: boolean;
}

/**
 * The chart for the saved birth profile, or for the sample input when nothing is saved. `result`
 * stays null until the browser has read sessionStorage, so no chart or text flashes before the user's own.
 */
export function useSajuChart(): SajuChartState {
  const { profile } = useSajuProfile();
  const result = useMemo(() => (profile === undefined ? null : compute(profile ?? DEFAULT_SAJU_FORM)), [profile]);
  return {
    form: profile ?? DEFAULT_SAJU_FORM,
    ready: profile !== undefined,
    saved: Boolean(profile),
    result,
    isSample: Boolean(result && "chart" in result && isSampleChart(result.chart)),
  };
}
