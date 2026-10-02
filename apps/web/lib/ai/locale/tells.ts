import { AI_TELL_THRESHOLD, SOFT_PREFIX_INTL, repeatedEndingsBy } from "../style";
import { sentencesOf, type IntlLocale } from "./text";

/** Per-language AI tells (spec §7.3): prompts list them, and three or more distinct ones cost one regeneration. */
export interface Tell {
  id: string;
  hint: string;
  test: (text: string) => boolean;
}

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;
const distinct = (text: string, pattern: RegExp) => new Set([...text.matchAll(pattern)].map((m) => m[0].toLowerCase())).size;
const FORMAT = /^\s*[-*•]\s|^\s*\d+[.)]\s|\*\*|—|\p{Extended_Pictographic}/mu;

export const TELLS: Record<IntlLocale, Tell[]> = {
  en: [
    { id: "E1", hint: "Do not open sentences with In conclusion, Ultimately, Overall, In summary", test: (t) => /(^|[.!?]\s+)(In conclusion|Ultimately|Overall|In summary|All in all),/m.test(t) },
    { id: "E2", hint: "Drop stock words (delve, tapestry, embark, journey, navigate, unlock, testament, realm, beacon, transformative)", test: (t) => distinct(t, /\b(delve|tapestry|embark|journey|navigate|unlock|unleash|testament|realm|beacon|transformative|profound)\b/gi) >= 2 },
    { id: "E3", hint: "Skip 'it's important to note' and 'plays a crucial role'", test: (t) => /\bit'?s (?:important|crucial|essential) to (?:note|remember)\b|\bplays? a (?:crucial|vital|pivotal) role\b/i.test(t) },
    { id: "E4", hint: "No bullets, bold, emoji or em dashes inside sentences", test: (t) => FORMAT.test(t) },
    { id: "E5", hint: "Avoid the 'not just X, but Y' formula", test: (t) => /\bnot (?:just|only) [^.?!]{1,40}, but\b/i.test(t) },
    { id: "E6", hint: "One hedge at most: no 'might possibly' or 'could potentially'", test: (t) => /\b(?:might|may|could) (?:possibly|perhaps|potentially)\b/i.test(t) },
    { id: "E7", hint: "Do not make the card or the universe the speaker; describe the picture", test: (t) => /\b(?:the card|this card|the cards|the universe) (?:tells|says|whispers|is telling|wants)\b/i.test(t) },
    { id: "E8", hint: "Do not stack lists of three again and again", test: (t) => count(t, /\b\w+, \w+,? and \w+\b/g) >= 3 },
    { id: "E9", hint: "Do not open with 'Remember,'", test: (t) => /(^|[.!?]\s+)Remember,/m.test(t) },
  ],
  ja: [
    { id: "J1", hint: "まとめると／結論として／総じて／要するに で文を始めない", test: (t) => /(^|[。！？]\s*)(まとめると|結論として|総じて|要するに)/m.test(t) },
    { id: "J2", hint: "「重要です」「大切です」を繰り返さない", test: (t) => count(t, /重要です|大切です|欠かせません|鍵となります/g) >= 2 },
    { id: "J3", hint: "「あなた」を使わず主語を省く", test: (t) => count(t, /あなた/g) >= 3 },
    { id: "J4", hint: "「〜でしょう。」を続けない", test: (t) => sentencesOf("ja", t).some((_, i, all) => all.slice(i, i + 3).length === 3 && all.slice(i, i + 3).every((s) => /でしょう[。！？]?$/.test(s))) },
    { id: "J5", hint: "箇条書き・太字・絵文字・「！！」を使わない", test: (t) => FORMAT.test(t) || /！！|!!/.test(t) },
    { id: "J6", hint: "カードを主語にしない（「このカードは〜と教えてくれます」）", test: (t) => /(?:この)?カード(?:は|が)[^。]{0,30}(?:教えて|語りかけ|伝えて|告げて)/.test(t) },
    { id: "J7", hint: "ポジティブ・エネルギー・ステージ・チャレンジを重ねない", test: (t) => distinct(t, /ポジティブ|エネルギー|ステージ|チャレンジ|マインド/g) >= 2 },
    { id: "J8", hint: "同じ文末を4回続けない", test: (t) => repeatedEndingsBy(sentencesOf("ja", t)) },
    { id: "J9", hint: "「寄り添う」を使わない", test: (t) => /寄り添/.test(t) },
  ],
  "zh-hant": [
    { id: "Z1", hint: "不要用總而言之、綜上所述、總的來說開頭", test: (t) => /(^|[。！？]\s*)(總而言之|綜上所述|總的來說|總之)/m.test(t) },
    { id: "Z2", hint: "少用至關重要、不可或缺、值得注意的是、旅程、賦能", test: (t) => distinct(t, /至關重要|不可或缺|值得注意的是|深入探討|旅程|賦能|全方位/g) >= 2 },
    { id: "Z3", hint: "不要反覆用「不僅…更…」", test: (t) => count(t, /不僅[^。]{1,30}更/g) >= 2 },
    { id: "Z4", hint: "不要說「讓我們」", test: (t) => /讓我們/.test(t) },
    { id: "Z5", hint: "不用項目符號、粗體、表情符號、破折號", test: (t) => FORMAT.test(t) },
    { id: "Z6", hint: "不要讓牌當主詞（「這張牌告訴你」），描述畫面", test: (t) => /(?:這張牌|牌面|卡牌)[^。]{0,20}(?:告訴你|在說|提醒你|想說)/.test(t) },
    { id: "Z7", hint: "用「你」，不用「您」；用台灣用語（影片、資訊、品質、預設）", test: (t) => count(t, /您/g) >= 2 || /視頻|信息|默認|質量/.test(t) },
    { id: "Z8", hint: "同樣的句尾不要連續四次", test: (t) => repeatedEndingsBy(sentencesOf("zh-hant", t)) },
  ],
};

export function aiTellViolationsIntl(locale: IntlLocale, texts: string[], out: string[]): void {
  const text = texts.join("\n");
  const hits = TELLS[locale].filter((tell) => tell.test(text));
  if (hits.length >= AI_TELL_THRESHOLD) out.push(`${SOFT_PREFIX_INTL}The text reads as machine-written: ${hits.map((h) => `${h.id} ${h.hint}`).join(" / ")}.`);
}
