import { readFileSync } from "node:fs";
import type { Locale } from "@/lib/i18n/locales";
import { cardIds, koSource } from "../../build-kb-i18n.mjs";
import type { Unit } from "./index";

/**
 * Translation units of the card KB (P6 Task 13): one per card, id `kb:<cardId>`, its Korean the exact
 * source the translation hash covers (koSource). A unit is present in a locale when that card's file
 * exists in content/kb/i18n/<locale>/.
 */

const root = new URL("../../../", import.meta.url);
const cardFile = (id: string) => new URL(`content/kb/cards/${id}.json`, root);

export const kbUnits = (): Unit[] =>
  cardIds().map((id): Unit => ({ id: `kb:${id}`, kind: "kb", ko: koSource(JSON.parse(readFileSync(cardFile(id), "utf8"))), phase: "A" }));

export function kbPresent(locale: Locale, unit: Unit): boolean {
  if (locale === "ko") return true;
  try {
    readFileSync(new URL(`content/kb/i18n/${locale}/${unit.id.slice("kb:".length)}.json`, root));
    return true;
  } catch {
    return false;
  }
}
