import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { MESSAGES, NAMESPACES } from "@/lib/i18n/messages";
import { lookup } from "@/lib/i18n/shape";
import type { Unit } from "./index";

function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}

export const messageUnits = (): Unit[] =>
  NAMESPACES.flatMap((ns) => leaves(MESSAGES.ko[ns]).map(([key, ko]): Unit => ({ id: `messages:${ns}:${key}`, kind: "messages", ko, phase: "A" })));

export function messagePresent(locale: Locale, unit: Unit): boolean {
  const [, ns, key] = unit.id.split(":") as [string, (typeof NAMESPACES)[number], string];
  return LOCALES.includes(locale) && lookup(MESSAGES[locale][ns], key) !== undefined;
}
