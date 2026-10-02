import type { Locale } from "@/lib/i18n/locales";
import { messagePresent, messageUnits } from "./messages";

/** One translatable piece with its Korean source. Phase B kinds only gate a locale once their feature ships there. */
export type UnitKind = "messages" | "core" | "kb" | "info" | "legal" | "decision" | "guide";
export interface Unit {
  id: string;
  kind: UnitKind;
  ko: string;
  phase: "A" | "B";
}

interface Source {
  units: () => Unit[];
  present: (locale: Locale, unit: Unit) => boolean;
}

/** Later tasks add their kind here (core: Task 8, kb: Task 13, info/legal: Task 30, decision: Task 35, guide: Task 36). */
const SOURCES: Partial<Record<UnitKind, Source>> = {
  messages: { units: messageUnits, present: messagePresent },
};

export const allUnits = (): Unit[] => Object.values(SOURCES).flatMap((source) => source!.units());

export function presentIn(locale: Locale, unit: Unit): boolean {
  return SOURCES[unit.kind]?.present(locale, unit) ?? false;
}
