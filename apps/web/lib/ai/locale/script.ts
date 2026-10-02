import type { IntlLocale } from "./text";

export const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
export const KANA = /[぀-ゟ゠-ヿ]/;

/** Characters that exist only in Simplified Chinese (each has a different Traditional form). */
export const SIMPLIFIED_ONLY: ReadonlySet<string> = new Set(
  Array.from("这们时会说对发过还没问应关现实经动认运气东车长门见让给爱欢难题头体点钱业开机觉学习书写读话语识谁请谢边远进选择断恋梦宝剑权圣币骑个为来国么"),
);

const without = (text: string, userText: string) => (userText ? text.split(userText).join(" ") : text);

/** Hard: text that is not in the locale's script (spec §7.4). Messages go back to the model in English. */
export function scriptViolations(locale: IntlLocale, text: string, userText: string): string[] {
  const out: string[] = [];
  const own = without(text, userText);
  const userHangul = new Set(Array.from(userText).filter((ch) => HANGUL.test(ch)));
  if (Array.from(own).some((ch) => HANGUL.test(ch) && !userHangul.has(ch))) {
    out.push("[script] Korean letters appeared. Write every sentence in the output language; never copy Korean words from the reference data.");
  }
  if (locale === "ja" && own.trim() && !KANA.test(own)) out.push("[script] Write natural Japanese with kana, not kanji-only phrases.");
  if (locale === "zh-hant") {
    if (KANA.test(own)) out.push("[script] Japanese kana appeared. Write Traditional Chinese only.");
    const simplified = new Set(Array.from(own).filter((ch) => SIMPLIFIED_ONLY.has(ch)));
    if (simplified.size >= 2) out.push(`[script] Simplified characters appeared (${[...simplified].join("")}). Write Traditional Chinese (Taiwan).`);
  }
  return out;
}
