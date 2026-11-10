import { crisisTier, type CrisisTier } from "@/lib/crisis";

/**
 * How far the characters may tease (spec 2026-11-11 entry funnel renewal, 2.5), decided from what the person wrote and the
 * topic, before anything is shown. In order, the first that applies wins:
 * 1. crisis words (lib/crisis.ts), any tier: the care lines and contacts, no nickname
 * 2. a plain wish to end one's life or vanish that the crisis words let through (STRONG_NEAR): the care step, the same
 * 3. wide near-crisis wording or a heavy topic in any text (health, money owed, lawsuits, a death …): the card's facts only
 * 4. 건강·컨디션 or 마음·감정: facts only
 * 5. 재회, 갈등·화해, 결혼, 재물운, a topic the person wrote, or a breakup or money in the text: the mild names and lines
 * 6. everything else: the teasing names and lines
 * 지금의 한 장 shows no card line, why or share in the care and crisis steps (app/now/NowOracle.tsx).
 * 지금의 한 장 has no mild table, so what three cards would read mildly shows its facts only there (nowTone).
 * Runs in the browser: lib/crisis.ts is its one pattern; nothing here is sent anywhere.
 */
export type Tone = "spicy" | "mild" | "facts" | "care" | "crisis";

export interface ToneVerdict {
  tone: Tone;
  /** The crisis tier when the tone is "crisis" (an urgent one leads with the emergency lines), else null. */
  crisis: CrisisTier | null;
}

/**
 * A plain wish to end one's life or vanish, read in the words themselves, that the server's crisis words (lib/crisis.ts,
 * kept as they are) let through: "죽는게 나을까", "살 이유가 없어", "더 버틸 자신이 없어", "자 살" (coordinator 2026-11-11).
 * Read with the spaces gone and jamo joined. Narrow on purpose, since it shows the helplines in place of the card's line:
 * no overstatement ("배고파 죽겠어", "버텨야 할까"), nothing that goes missing ("우산이 사라졌어"), no shopping ("자 살까 말까").
 */
const STRONG_NEAR = new RegExp(
  [
    "죽는게(?:나을|낫|편)|죽는편이(?:나을|낫)|죽고싶(?!(?:지|진|지는|지도)않)|죽어버리고싶|뒤지고싶|디지고싶|뒤져버리고싶|디져버리고싶",
    "자살(?!까|예방|골)|자해",
    "(?:살|살아갈|살아야할|사는)이유가?없|(?:살|사는)의미가?없|사는게(?:싫|지겹)|살기싫|살고싶지않",
    "(?<!창피해서|쪽팔려서|부끄러워서|민망해서)사라지고싶|(?:그냥|차라리|조용히|영원히)사라질까|(?:내가|나|난|나는)사라졌으면",
    "없어지면편|없어지고싶|(?:내가|나|난|나는)없어지",
    "버틸(?:자신|힘)이?없|못버티겠|더는못버티|더이상못버티",
    "^(?:요즘|그냥|이제|진짜|정말|차라리|나|난|너무)*다(?:포기하|끝내)고싶|(?:전부|모든걸?|모두)포기하고싶|(?:삶|인생)을?(?:포기|끝내)",
    "태어나지(?:말|않았으면)|안태어났으면|태어난게후회|영원히(?:잠들고|자고)싶|깨어나지않았으면|눈(?:안|뜨지않)았?으면|세상을?떠나고싶",
  ].join("|"),
);
/**
 * Near-crisis wording, deliberately wide (review 2026-11-11), read with the spaces gone: a hit only hides the nickname, the
 * card's line stays (the facts only), so overstatement ("배고파 죽겠어") costs nothing but the joke.
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
/**
 * Heavy topics: a nickname would make light of them (spec 2.5 별명 없음), read with the spaces gone. Widened after the review
 * (2026-11-11 #2): a loss, illness and the mind, pregnancy, money trouble, violence, a lost job, big investments.
 */
const HEAVY = new RegExp(
  [
    "건강|병원|입원|수술|진단|임신|대출|빚|투자|주식|코인|파산|소송|재판|장례|사망", // spec 2.5 as written
    "돌아가셨|돌아가시|돌아가신|사별|기일|무지개다리|하늘나라|떠나보내|떠나보낸|49재|사십구재|추모|납골|부고",
    "(?:위|간|폐|유방|갑상선|대장|췌장|자궁|전립선|혈액|피부)암|항암|암(?:이래|이라|이야|이에요|이었|검사|진단|수술|투병|환자|재발|판정|선고|센터|병동)|종양|말기",
    "응급|구급|119|중환자|위독|투병|발병|지병|질병|질환|병명|병이|병에|병걸|병나|병낫|병들|치료|검사결과|검진|재검",
    "아프(?!리카)|아파(?!트)|아픈|아팠|몸이안좋|다쳤|부상|골절|교통사고|치매|간병|약을?(?:끊|먹|줄|바꾸|바꿔|늘)|처방",
    "우울|공황|정신과|정신병|불안장애|조울|양극성|트라우마|불면|심리상담",
    "유산(?!균)|난임|불임|시험관|임테기|인공수정|착상|낙태|중절",
    "빛때문|빛을?갚|연체|카드값|사채|회생|신용불량|신불자|전세사기|사기를?당|사기맞|보이스피싱|압류|독촉|추심",
    "폭력|폭행|학폭|왕따|따돌림|스토킹|스토커|성희롱|성추행|성폭|괴롭힘|괴롭혀|괴롭히|갑질|협박|가스라이팅",
    "잘렸|짤렸|해고|권고사직|실직|구조조정",
    "아파트|부동산|청약|분양|집값|갭투자",
  ].join("|"),
);
/** A breakup, a marriage, a fight, or money: three cards read them mildly (지금의 한 장: the facts only). Hair (헤어 컬러) is no breakup. */
const TENDER = new RegExp(
  [
    "이별|헤[어여](?:지|졌|진|질|짐|져)|재회|재결합|이혼|파혼|별거|결혼|싸움|싸웠|다퉜|다툼",
    "전남친|전여친|전애인|전남자친구|전여자친구|전남편|전부인|전와이프|전처|차였|바람폈|바람펴|바람피|바람났|바람난|외도|불륜|잠수|손절",
    "돈|재물|월급|연봉|적금|예금",
  ].join("|"),
);
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
  if (readsAny(STRONG_NEAR, texts)) return { tone: "care", crisis: null };
  if (readsAny(NEAR_CRISIS, texts) || readsAny(HEAVY, texts) || (topicId !== undefined && FACTS_TOPICS.has(topicId))) return { tone: "facts", crisis: null };
  if (customTopic || (topicId !== undefined && MILD_TOPICS.has(topicId)) || readsAny(TENDER, texts)) return { tone: "mild", crisis: null };
  return { tone: "spicy", crisis: null };
}

/** 지금의 한 장: the typed worry only (no topic). Never mild: what would be mild shows its facts only. */
export function nowTone(question: string): ToneVerdict {
  const verdict = tarotTone({ texts: [question] });
  return verdict.tone === "mild" ? { tone: "facts", crisis: null } : verdict;
}
