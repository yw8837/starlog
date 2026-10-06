import "server-only";
import type { IntlLocale } from "@/lib/ai/locale";
import type { ReversedMode } from "./index";
import data from "./i18n.generated.json";

/** Per-locale KB text: names, keywords, image facts, glosses, reversed-mode glosses, misdescriptions (spec §6.4, D10). */
export interface KbText {
  name: string;
  aliases: string[];
  keywords: string[];
  facts: Record<string, string>;
  glosses: Record<string, string>;
  reversedGloss: Partial<Record<ReversedMode, string>>;
  misdescriptions: Array<{ wrong: string; regex: string }>;
}

export const KB_I18N_LOCALES = ["en", "ja", "zh-hant"] as const satisfies readonly IntlLocale[];
const DATA = data as unknown as Record<IntlLocale, Record<string, KbText>>;

export function kbText(locale: IntlLocale, cardId: string): KbText {
  const text = DATA[locale]?.[cardId];
  if (!text) throw new Error(`No ${locale} KB text for ${cardId}`);
  return text;
}
