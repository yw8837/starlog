import { crisisTier, type CrisisTier } from "@/lib/crisis";

/**
 * How far the characters may tease (spec 2026-11-11 entry funnel renewal, 2.5), decided from what the person wrote and the
 * topic, before anything is shown. In order, the first that applies wins:
 * 1. crisis words (lib/crisis.ts): the care lines and contacts, no nickname
 * 2. near-crisis wording or a heavy topic in any text (health, money owed, lawsuits, a death …): the card's facts only
 * 3. 건강·컨디션 or 마음·감정: facts only
 * 4. 재회, 갈등·화해, 결혼, 재물운, a topic the person wrote, or a breakup or money in the text: the mild names and lines
 * 5. everything else: the teasing names and lines
 * 지금의 한 장 has no mild table, so what three cards would read mildly shows its facts only there (nowTone).
 * Runs in the browser: lib/crisis.ts is its one pattern; nothing here is sent anywhere.
 */
export type Tone = "spicy" | "mild" | "facts" | "crisis";

export interface ToneVerdict {
  tone: Tone;
  /** The crisis tier when the tone is "crisis" (an urgent one leads with the emergency lines), else null. */
  crisis: CrisisTier | null;
}

/**
 * Near-crisis wording the server's crisis words (lib/crisis.ts, kept as they are) let through: "죽는게 나을까", "살 이유가 없어",
 * "더 버틸 자신이 없어", "자 살" (review 2026-11-11). Deliberately wide, read with the spaces gone: a false hit only hides a
 * nickname. The facts only, or the care lines where the server's crisis words also read it.
 */
const NEAR_CRISIS = new RegExp(
  [
    "죽(?!음의?(?:카드|타로))", // 죽는게 나을까, 죽었어; not the 죽음 card
    "자살|자해|ㅈㅅ|ㅈㄱ|극단",
    "사라지|사라질|없어지|없어질|세상을?떠나|떨어지고싶|뛰어내|투신|목매|번개탄|수면제|유서",
    "포기하고싶|포기할래|버틸|버티|버텨|못견디|견딜수없|살이유|살아갈이유|살아야할이유|사는이유|살의미|사는의미|살기싫|살고싶지|그만살|삶을끝|인생끝|끝내고싶|끝내버리",
    "편해지고싶|잠들고싶|깨어나지|눈뜨기싫|태어나지말|태어난게|나없어도|나만없으면|짐이되",
    "뒤지고싶|디지고싶|뒤져버리|디져버리|뒤질래|디질래",
  ].join("|"),
);
/** Heavy topics: a nickname would make light of them (spec 2.5 별명 없음). */
const HEAVY = /건강|병원|입원|수술|진단|임신|대출|빚|투자|주식|코인|파산|소송|재판|장례|사망/;
/** A breakup, a marriage, a fight, or money: three cards read them mildly. */
const TENDER = /이별|헤어|재회|이혼|결혼|싸움|싸웠|다퉜|다툼|돈|재물|월급|연봉/;
/** 건강·컨디션, 마음·감정 (packages/core templates): facts only. */
const FACTS_TOPICS = new Set(["health", "mind"]);
/** 재회, 갈등·화해, 결혼(운), 재물운: mild. */
const MILD_TOPICS = new Set(["reunion", "conflict", "marriage", "money"]);

// The text as the server's crisis check reads it (lib/api/http.ts asPromptSees, server-only): line breaks end a sentence,
// markup and invisible characters cannot split a phrase.
const INVISIBLE = /[​-‍⁠­﻿]/g;
const LINE_BREAK = /\s*\n\s*/g;
const asServerReads = (text: string) =>
  text.replace(LINE_BREAK, ". ").replace(/[<>]/g, "").replaceAll("**", "").replace(/\s+/g, " ").trim().replace(INVISIBLE, "");

// Unicode builds a Hangul syllable as 가 + (initial × 21 + vowel) × 28 + final; the compatibility jamo below are typed alone.
const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const FINALS = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"; // index 0: no final
const vowelOf = (char: string | undefined) => (char ? char.charCodeAt(0) - 0x314f : -1); // ㅏ 0 … ㅣ 20
const isVowel = (char: string | undefined) => vowelOf(char) >= 0 && vowelOf(char) <= 20;

/** Jamo typed apart joined back into syllables ("주ㄱ고" → "죽고", "ㅈㅏㅅㅏㄹ" → "자살"); the rest as it was. */
function joinJamo(text: string): string {
  const chars = [...text];
  const out: string[] = [];
  chars.forEach((char, i) => {
    const prev = out[out.length - 1];
    if (prev && isVowel(char) && INITIALS.includes(prev)) {
      out[out.length - 1] = String.fromCharCode(0xac00 + (INITIALS.indexOf(prev) * 21 + vowelOf(char)) * 28);
      return;
    }
    const final = FINALS.indexOf(char);
    const open = prev ? prev.charCodeAt(0) - 0xac00 : -1; // a syllable with no final yet
    if (final > 0 && open >= 0 && open < 11172 && open % 28 === 0 && !isVowel(chars[i + 1])) {
      out[out.length - 1] = String.fromCharCode(0xac00 + open + final);
      return;
    }
    out.push(char);
  });
  return out.join("");
}

/** What the word lists read: jamo joined, Hangul and digits only (no space, mark or invisible character splits a word), and once more without the digits ("자1살"). */
function squeezed(text: string): string[] {
  const kept = joinJamo(text.replace(/[^가-힣ㄱ-ㅣ0-9]/g, ""));
  return [kept, kept.replace(/[0-9]/g, "")];
}

const readsAny = (pattern: RegExp, texts: readonly string[]) => texts.some((text) => squeezed(text).some((form) => pattern.test(form)));

function crisisOf(texts: readonly string[]): CrisisTier | null {
  const rank: Record<CrisisTier, number> = { passive: 1, active: 2, urgent: 3 };
  let worst: CrisisTier | null = null;
  for (const text of texts) {
    // As typed, and with jamo typed apart joined ("주ㄱ고 싶어"); spaces stay, so "자 살까 말까" is no crisis words.
    for (const form of text ? [text, joinJamo(text)] : []) {
      const tier = crisisTier(asServerReads(form));
      if (tier && (!worst || rank[tier] > rank[worst])) worst = tier;
    }
  }
  return worst;
}

/** The 3-card result's tone (B2): the question, its notes and any written topic, and the topic id picked. */
export function tarotTone({ texts = [], topicId, customTopic = false }: { texts?: readonly string[]; topicId?: string; customTopic?: boolean }): ToneVerdict {
  const crisis = crisisOf(texts);
  if (crisis) return { tone: "crisis", crisis };
  if (readsAny(NEAR_CRISIS, texts) || texts.some((text) => HEAVY.test(text)) || (topicId !== undefined && FACTS_TOPICS.has(topicId))) return { tone: "facts", crisis: null };
  if (customTopic || (topicId !== undefined && MILD_TOPICS.has(topicId)) || texts.some((text) => TENDER.test(text))) return { tone: "mild", crisis: null };
  return { tone: "spicy", crisis: null };
}

/** 지금의 한 장: the typed worry only (no topic). Never mild: what would be mild shows its facts only. */
export function nowTone(question: string): ToneVerdict {
  const verdict = tarotTone({ texts: [question] });
  return verdict.tone === "mild" ? { tone: "facts", crisis: null } : verdict;
}
