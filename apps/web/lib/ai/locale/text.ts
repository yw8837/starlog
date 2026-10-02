import type { Locale } from "@/lib/i18n/locales";

/** Length, sentences and phrase matching for en, ja and zh-hant readings (spec §7.4). */
export type IntlLocale = Exclude<Locale, "ko">;

const isCjk = (locale: IntlLocale) => locale !== "en";

export function measure(locale: IntlLocale, text: string): number {
  if (isCjk(locale)) return text.replace(/\s/g, "").length;
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function sentencesOf(locale: IntlLocale, text: string): string[] {
  const parts = isCjk(locale) ? text.split(/(?<=[。！？!?])|\n+/) : text.split(/(?<=[.?!])\s+|\n+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "my", "your", "with", "for", "is", "are", "was", "were", "be", "it", "this", "that", "i", "me", "you", "he", "she", "they", "we", "do", "does", "did", "not", "so", "but", "if", "as", "by", "from"]);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** en: lower-case stems without stop words; ja and zh: bigrams of each run of letters (CJK, kana, Latin). */
export function tokens(locale: IntlLocale, text: string): string[] {
  if (!isCjk(locale)) {
    return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/'s$|'/g, "")).filter((w) => w && !STOP.has(w)).map(stem))];
  }
  const out = new Set<string>();
  for (const run of text.split(/[^\p{L}\p{N}]+/u)) {
    const chars = Array.from(run);
    if (chars.length === 1) out.add(chars[0]!);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i]! + chars[i + 1]!);
  }
  return [...out];
}

/** Share (0..1) of the phrase's tokens that appear among the text's tokens. */
export function overlap(locale: IntlLocale, text: string, phrase: string): number {
  const want = tokens(locale, phrase);
  if (want.length === 0) return 1;
  const have = new Set(tokens(locale, text));
  return want.filter((token) => have.has(token)).length / want.length;
}

/** The phrase verbatim (case-insensitive) or at least `share` of its tokens. */
export function mentionsIn(locale: IntlLocale, text: string, phrase: string, share = 0.5): boolean {
  if (text.toLowerCase().includes(phrase.toLowerCase())) return true;
  return overlap(locale, text, phrase) >= share;
}

/** Matches of `pattern` that the user did not write themselves (their own words may be quoted back). */
export function beyondUser(pattern: RegExp, text: string, userText: string): string[] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const user = userText.toLowerCase();
  return [...text.matchAll(global)].map((m) => m[0]).filter((hit) => !user.includes(hit.toLowerCase()));
}
