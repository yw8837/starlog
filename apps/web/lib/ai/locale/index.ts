import { scriptViolations } from "./script";
import { safetyViolations, voiceViolations } from "./safety";
import { measure, mentionsIn, sentencesOf, type IntlLocale } from "./text";

export type { IntlLocale } from "./text";
export { TELLS, aiTellViolationsIntl } from "./tells";

export interface LocaleProfile {
  locale: IntlLocale;
  /** how prompts name the output language */
  languageName: string;
  /** a Korean length target (characters without spaces) × this = the target in `measure` units; Task 33 calibrates */
  lengthFactor: number;
  /** minimum overlap (0..1) between a section and a cited KB fact's text in this language */
  factOverlap: number;
  measure: (text: string) => number;
  sentences: (text: string) => string[];
  mentions: (text: string, phrase: string, share?: number) => boolean;
  script: (text: string, userText: string) => string[];
  safety: (text: string, userText: string) => string[];
  voice: (text: string) => string[];
}

const profile = (locale: IntlLocale, languageName: string, lengthFactor: number, factOverlap: number): LocaleProfile => ({
  locale,
  languageName,
  lengthFactor,
  factOverlap,
  measure: (text) => measure(locale, text),
  sentences: (text) => sentencesOf(locale, text),
  mentions: (text, phrase, share) => mentionsIn(locale, text, phrase, share),
  script: (text, userText) => scriptViolations(locale, text, userText),
  safety: (text, userText) => safetyViolations(locale, text, userText),
  voice: (text) => voiceViolations(locale, text),
});

export const PROFILES: Readonly<Record<IntlLocale, LocaleProfile>> = {
  en: profile("en", "English", 0.42, 0.4),
  ja: profile("ja", "Japanese", 1.15, 0.35),
  "zh-hant": profile("zh-hant", "Traditional Chinese (Taiwan)", 0.7, 0.35),
};
