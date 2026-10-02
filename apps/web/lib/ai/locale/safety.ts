import { SOFT_PREFIX_INTL } from "../style";
import { beyondUser, sentencesOf, type IntlLocale } from "./text";

/**
 * Hard safety checks for en, ja and zh-hant (spec §7.4), the same intents as the Korean BLOCKLIST,
 * money, other-mind, marriage and date rules in validate.ts. Card names that sound like fate or death
 * (Wheel of Fortune, 運命の輪, 命運之輪, Death, 死神) are allowed.
 */

type Rule = { code: string; pattern: RegExp; message: string };

const RULES: Record<IntlLocale, Rule[]> = {
  en: [
    { code: "guarantee", pattern: /\b(guarantee[sd]?|definitely will|for sure you will|certainly will|without (?:a )?doubt)\b|100\s?%/i, message: "Remove guarantees and certainty words." },
    { code: "fate", pattern: /\b(destin(?:y|ed)|fated|meant to be)\b|\bfate\b/i, message: "Do not talk about fate or destiny (the card name Wheel of Fortune is fine)." },
    { code: "illness", pattern: /\b(?:will|going to) (?:get|become|fall) (?:sick|ill)\b|\b(?:illness|disease|cancer)\b[^.?!]{0,30}\b(?:will|coming|ahead)\b/i, message: "Do not predict illness." },
    { code: "death", pattern: /\b(?:will|going to|'ll) (?:die|pass away)\b|\blife ?(?:span|expectancy)\b/i, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /\b(pregnan(?:t|cy)|give birth|childbirth)\b/i, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /\b(?:will|'ll|going to) (?:have|be in) an accident\b/i, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /\b(?:buy|pay|purchase|unlock) (?:it )?(?:now|today|right away)\b/i, message: "No pressure to pay." },
    { code: "date", pattern: /\b(?:on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i, message: "Do not name dates, weekdays or clock times; speak in conditions within the chosen period." },
  ],
  ja: [
    { code: "guarantee", pattern: /必ず|絶対(?:に)?|間違いなく|確実に|100\s?[%％]/, message: "Remove guarantees (必ず, 絶対, 間違いなく)." },
    { code: "fate", pattern: /運命(?!の輪)|宿命/, message: "Do not talk about fate (運命の輪 as a card name is fine)." },
    { code: "illness", pattern: /(?:病気|がん|癌)(?:に|が)?(?:なる|なります|かかる|かかります|見つかる)/, message: "Do not predict illness." },
    { code: "death", pattern: /死(?:ぬ|にます|んで)|寿命|亡くな(?:る|ります)/, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /妊娠|出産/, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /事故(?:に遭|が起き|に巻き込まれ)/, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /今すぐ(?:購入|課金|決済)/, message: "No pressure to pay." },
    { code: "date", pattern: /\d{1,2}月\d{1,2}日|[月火水木金土日]曜(?:日)?|\d{1,2}時(?:に|ごろ|頃|まで|から)/, message: "Do not name dates, weekdays or clock times." },
  ],
  "zh-hant": [
    { code: "guarantee", pattern: /一定(?:會|能)|絕對|保證|百分之百|肯定會|100\s?[%％]/, message: "Remove guarantees (一定會, 絕對, 保證)." },
    { code: "fate", pattern: /命中注定|宿命|命運(?!之輪)/, message: "Do not talk about fate (命運之輪 as a card name is fine)." },
    { code: "illness", pattern: /(?:生病|疾病|癌症?)[^。！？]{0,6}(?:會|將)|(?:會|將)(?:生病|得病)/, message: "Do not predict illness." },
    { code: "death", pattern: /(?:會|將)(?:死|過世|去世)|壽命|死期/, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /懷孕|分娩|生小孩/, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /(?:會|將)(?:發生|遇到)(?:車禍|意外)/, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /(?:現在|立刻|馬上)(?:購買|付款|儲值)/, message: "No pressure to pay." },
    { code: "date", pattern: /\d{1,2}月\d{1,2}日|(?:星期|週|禮拜)[一二三四五六日天]|\d{1,2}點(?:左右|前|後|時)?/, message: "Do not name dates, weekdays or clock times." },
  ],
};

const MONEY_ORDER: Record<IntlLocale, RegExp> = {
  en: /\b(?:invest in|buy (?:stocks?|shares|crypto|bitcoin|lottery tickets?)|take (?:out )?a loan|borrow money)\b/i,
  ja: /(?:株|仮想通貨|暗号資産|宝くじ|FX)[^。！？]{0,10}(?:買って|始めて|しましょう|するべき|してください)|借金(?:して|しましょう)|ローンを組(?:んで|みましょう)/,
  "zh-hant": /去(?:買|投資)(?:股票|樂透|彩券|加密貨幣)|(?:買進|買入|投資)(?:吧|看看|就對了)|(?:借錢|貸款)(?:吧|看看)/,
};
const MONEY_PROMISE: Record<IntlLocale, RegExp> = {
  en: /\byou(?:'ll| will) (?:make|earn|win) (?:money|a fortune|big)\b|\b(?:prices?|stocks?) will (?:rise|go up)\b|\bjackpot\b/i,
  ja: /(?:お金|利益|収入)が(?:入る|増える|手に入る)でしょう|儲か(?:る|ります)|大金/,
  "zh-hant": /(?:會|將)(?:賺(?:大)?錢|發財|進帳)|(?:股價|價格)(?:會|將)(?:上漲|漲)/,
};
const MONEY_CONTRAST: Record<IntlLocale, RegExp> = {
  en: /\b(?:rather than|instead of|before you|don't|do not)\b/i,
  ja: /より|代わりに|前に|ないで/,
  "zh-hant": /與其|而不是|之前|不要|先別/,
};
const OTHER_MIND: Record<IntlLocale, RegExp> = {
  en: /\b(?:he|she|they|your (?:partner|ex|crush|boyfriend|girlfriend))\b[^.?!]{0,25}\b(?:loves?|likes?|misses|hates|wants|regrets) you\b/i,
  ja: /(?:あの人|相手|彼|彼女)(?:は|が)[^。！？]{0,20}(?:好き|愛して|恋しい|嫌って|後悔して)(?:いる|います|です)/,
  "zh-hant": /(?:他|她|對方|那個人)[^。！？]{0,20}(?:喜歡|愛|想念|討厭|後悔)你/,
};
const HEDGE: Record<IntlLocale, RegExp> = {
  en: /\b(?:might|may|could|perhaps|maybe|hard to know|can't know|cannot know|if)\b/i,
  ja: /かもしれ|可能性|わかりません|わからない|もし|かどうか/,
  "zh-hant": /可能|也許|或許|無法確定|不確定|如果|是否/,
};
const MARRIAGE: Record<IntlLocale, RegExp> = {
  en: /\byou(?:'ll| will| won't| will not) (?:get married|marry)\b|\bmarriage (?:is|will be) (?:certain|guaranteed|delayed|soon)\b/i,
  ja: /結婚(?:する|します|できる|できます|しない|できない)(?:でしょう)?[。！]|(?:今年|来年|\d+年|\d+か月)[^。]{0,8}結婚(?:する|します)/,
  "zh-hant": /(?:會|將|能|不會|無法)(?:結婚|成婚)|(?:今年|明年|\d+年|\d+個月)[^。]{0,8}結婚/,
};

export function safetyViolations(locale: IntlLocale, text: string, userText: string): string[] {
  const out: string[] = [];
  for (const rule of RULES[locale]) {
    if (beyondUser(rule.pattern, text, userText).length) out.push(`[safety:${rule.code}] ${rule.message} Not even in a negative sentence.`);
  }
  const sentences = sentencesOf(locale, text);
  if (sentences.some((s) => (MONEY_ORDER[locale].test(s) || MONEY_PROMISE[locale].test(s)) && !MONEY_CONTRAST[locale].test(s))) {
    out.push("[safety:money] Do not tell the reader to invest, buy or borrow, and do not promise money. Stay with the flow and what to check.");
  }
  if (sentences.some((s) => OTHER_MIND[locale].test(s) && !HEDGE[locale].test(s))) {
    out.push("[safety:other-mind] Do not state another person's feelings as fact. Speak of mood and possibilities.");
  }
  if (beyondUser(MARRIAGE[locale], text, userText).length) {
    out.push("[safety:marriage] Do not state whether or when a marriage will happen. Speak of the flow, preparation and mindset around it.");
  }
  return out;
}

const QUOTES = /「[^」]*」|『[^』]*』|"[^"\n]*"|“[^”]*”/g;
const JA_PLAIN_END = /(?:だ|である|だった|のだ|だろう|する|した|しない|ない|いる|ある|れる|せる)$/;

/** Soft: Japanese sentences that end in the plain form (quotes excluded). Other locales have no voice check. */
export function voiceViolations(locale: IntlLocale, text: string): string[] {
  if (locale !== "ja") return [];
  const plain = sentencesOf("ja", text.replace(QUOTES, "「」"))
    .map((s) => s.replace(/[。！？!?…」』）)\s]+$/, ""))
    .filter((s) => s.length > 0 && JA_PLAIN_END.test(s));
  return plain.length ? [`${SOFT_PREFIX_INTL}Sentences end in the plain form ("${plain[0]!.slice(-12)}"). Use です・ます endings; noun endings now and then are fine.`] : [];
}
