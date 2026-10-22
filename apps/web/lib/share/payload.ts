import { TEMPLATES, unsureWords, type Orientation, type TemplateId } from "@starlog/core";
import type { ReadingBody } from "@/components/tarot/ReadingArticle";
import { cleanUserText } from "@/lib/ai/prompts/tarot";
import type { FrontDeck } from "@/lib/deck";
import type { DailyData, Section, SajuGlance, SajuTopicId } from "@/lib/reading/types";
import { isCardId, isSajuGlance, isSection } from "@/lib/reading/validate";
import { decisionFor, type Lean } from "@/lib/decision";
import { PREMIUM_IDS, type PremiumId } from "@/lib/premium/products";
import { MATCH_RELATIONS, type MatchRelation } from "@/lib/ai/prompts/match";
import { isSajuTopicId } from "@/lib/sajuTopics";
import type { BirthInput } from "@/lib/api/inputs";
import type { ChapterContext } from "@/lib/security/chapterToken";

/**
 * 결과 공유 (owner 2026-10-13): what a shared link shows is the result screen itself, the cards and
 * the whole reading, without the question, the user's own words, the situations they picked, the
 * follow-ups and the birth data. The payload is built on the server from a chapter the server signed,
 * so its text is always the reading the server wrote, in the card design it was written for.
 */

export interface SharedTarot {
  kind: "tarot";
  v: 1;
  deck: FrontDeck;
  cards: Array<{ cardId: string; orientation: Orientation; position: string }>;
  reading: ReadingBody;
}

export interface SharedSaju {
  kind: "saju";
  v: 1;
  /** 주제별 사주; absent for 사주팔자 (전체 흐름) */
  topic?: SajuTopicId;
  reading: { glance?: SajuGlance; sections: Section[]; observation?: Section };
}

/**
 * 오늘의 한 장 (owner 2026-10-20): the card, the design it was read in, what the screen shows and the KST
 * day. It has no birth data or question, and nothing of the device (no pick, no device id).
 */
export interface SharedDaily {
  kind: "daily";
  v: 1;
  deck: FrontDeck;
  /** the KST day it was drawn for, "2026-10-20" */
  day: string;
  reading: Omit<DailyData, "pick">;
}

/** 지금의 한 장 (owner 2026-10-23): the card, the line it gave and why, all from the card DB (lib/decision.ts); never the worry typed. */
export interface SharedNow {
  kind: "now";
  v: 1;
  deck: FrontDeck;
  card: { cardId: string; orientation: Orientation };
  lean: Lean;
  answer: string;
  why: string;
}

/**
 * The free first tarot reading (owner 2026-10-23): the cards and the two paragraphs the free screen shows, the second
 * one only up to its cut (lib/security/teaserSeal.ts teaserCut). Never the paid reading.
 */
export interface SharedTarotFree {
  kind: "tarot-free";
  v: 1;
  deck: FrontDeck;
  cards: Array<{ cardId: string; orientation: Orientation; position: string }>;
  first: Section;
  second?: Section;
}

/** The free saju teaser or a 운's 맛보기 (owner 2026-10-23): its title and summary only, never the chart or the birth. */
export interface SharedSajuFree {
  kind: "saju-free";
  v: 1;
  topic?: SajuTopicId;
  title: string;
  summary: string;
}

/** A premium reading (owner 2026-10-23), with what its share image draws (PremiumChapterView premiumShareBody), never its text. */
export interface SharedPremium {
  kind: "premium";
  v: 1;
  product: PremiumId;
  deck?: FrontDeck;
  cards?: Array<{ cardId: string; orientation: Orientation }>;
  relation?: MatchRelation;
  title?: string;
}

/**
 * 별자리 인연 (owner 2026-10-23): a link to an owner's constellation, or to a friend's own star in it. The page reads it
 * live from the bonds store, so a removed star or constellation is gone from the link too; nothing personal is copied.
 */
export interface SharedBonds {
  kind: "bonds";
  v: 1;
  constellationId: string;
}

export interface SharedBond {
  kind: "bond";
  v: 1;
  constellationId: string;
  starId: string;
}

export type SharePayload = SharedTarot | SharedSaju | SharedDaily | SharedNow | SharedTarotFree | SharedSajuFree | SharedPremium | SharedBonds | SharedBond;

/** What stands in for the user's own words, wherever the reading quotes them. */
export const HIDDEN = "○○";

/** The saju section that states the birth data the chart was computed from: never shared. */
const BASIS_HEADING = "계산 기준";

/** Double quotes and corner brackets: hidden when what they hold is part of the user's own words. */
const QUOTES = /(["“”「」『』])([^"“”'‘’「」『』\n]{4,200}?)(["“”「」『』])/g;

/**
 * Single quotes: the prompt quotes the picked situations and the note in them (lib/ai/prompts/tarot.ts),
 * but a reading also quotes a card's own words ('한 주기의 완성'). Hidden, however short, when what they
 * hold is part of the user's own words or holds them.
 */
const SINGLE_QUOTED = /(['‘’])([^'‘’\n]+?)(['‘’])/g;

/** Without spaces and in NFKC, so a quote matches the user's words however the lines broke. */
const squeeze = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");

/** True when a quotation holds part of the user's own words, or holds one of them. */
const quotesUser = (inner: string, words: readonly string[]) => {
  const said = squeeze(inner);
  return said.length > 0 && words.some((word) => squeeze(word).includes(said) || said.includes(squeeze(word)));
};

/** 잘 모르겠어요, 아직 모르겠어요: not a situation, and ordinary words in a reading. */
const UNSURE = new Set(unsureWords("ko"));

/**
 * The user's texts as the prompt saw them (cleanUserText: no tag brackets or bold marks, whitespace
 * collapsed), as typed and in NFKC (full-width letters); longer first, so a whole note is replaced
 * before a shorter word inside it.
 */
function asPromptSaw(texts: ReadonlyArray<string | undefined>): string[] {
  const words = texts.flatMap((text) => (typeof text === "string" ? [cleanUserText(text), cleanUserText(text.normalize("NFKC"))] : []));
  return [...new Set(words.filter((word) => word.length >= 2))].sort((a, b) => b.length - a.length);
}

/** The user's own words in a tarot input: the question, the note, the typed 무엇·누구·언제 and the picked situations. */
function ownWords(input: Extract<ChapterContext, { kind: "tarot" }>["input"]): string[] {
  const picked = input.conditions.map((condition) => condition.value).filter((value) => !UNSURE.has(value.trim()));
  return asPromptSaw([input.question, input.note, input.topicText, input.whoText, input.whenText, ...picked]);
}

/** Common Korean surnames: a word of three syllables that starts with one may be a full name. */
const SURNAMES = "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉";

/** Particles, endings and honorifics after a name, by the sound they follow: 지훈이·지훈아, 민수가·민수야, either. */
const PARTICLES = {
  consonant: ["이", "은", "을", "과", "아", "으로"],
  vowel: ["가", "는", "를", "와", "랑", "야", "야말로", "라는", "라고"],
  either: ["의", "도", "만", "에", "에서", "에게", "에게서", "한테", "한테서", "께", "께서", "까지", "부터", "하고", "처럼", "보다", "로", "님", "씨", "들"],
};
/** Longest first, so 야말로 comes off before 로. */
const PARTICLE_FITS = Object.entries(PARTICLES)
  .flatMap(([after, list]) => list.map((particle) => [particle, after] as const))
  .sort((a, b) => b[0].length - a[0].length);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What follows a name: 님 or 씨, particles (민수야말로, 지훈이랑, 민수에게도), then no more Hangul. */
const AFTER_NAME = String.raw`(?:\s?(?:님|씨))?(?:${PARTICLE_FITS.map(([particle]) => particle).join("|")}){0,3}(?![가-힣])`;

/** A Hangul syllable with a final consonant (훈, 은), which takes 이·은·을·과·아 rather than 가·는·를·와·야. */
const hasBatchim = (char: string) => {
  const code = char.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
};

/**
 * The word without the particles after it ("김민수랑" → 김민수, "지훈이랑" → 지훈, "팀장님께" → 팀장), keeping
 * two letters at least. A particle that does not fit the sound before it is part of the word: 박지은, 김수아.
 */
function stripParticles(word: string): string {
  for (const [particle, after] of PARTICLE_FITS) {
    const rest = word.slice(0, -particle.length);
    if (!word.endsWith(particle) || rest.length < 2) continue;
    if (after === "either" || hasBatchim(rest.charAt(rest.length - 1)) === (after === "consonant")) return stripParticles(rest);
  }
  return word;
}

/** Words a 누구 or a question uses that are not names: roles, and everyday words that start like a surname. */
const ORDINARY = new Set(
  (
    "남친 여친 남자친구 여자친구 전남친 전여친 남편 아내 와이프 신랑 신부 애인 연인 배우자 약혼자 썸남 썸녀 짝남 짝녀 짝사랑 " +
    "친구 절친 동기 동창 동료 선배 후배 지인 이웃 사람 남자 여자 그녀 그분 상대 상대방 막내 손님 고객 연예인 " +
    "엄마 아빠 어머니 아버지 부모 언니 오빠 누나 동생 남동생 여동생 아들 아이 아기 가족 식구 할머니 할아버지 이모 삼촌 고모 조카 사촌 장모 며느리 사위 " +
    "팀장 부장 과장 차장 대리 사장 대표 실장 이사 상사 교수 선생 원장 담임 직원 회사원 강아지 고양이 반려견 반려묘 " +
    "마지막 소개팅 공무원 권태기 지난달 지난주 지난번 이번달 이번주 오랜만 한동안 금요일 오늘밤 지금쯤"
  ).split(" "),
);
/** Last syllables of everyday words, not of names: 어떻게, 연락해, 연애운, 현실적. */
const NOT_NAME_END = /[게까요해히할될려고면데니죠네다듯씩껏운엔적]/;

/** What the user's own words put after a person: 민수랑, 민수한테, 민수 씨, 민수야, 지훈이가 (이 plus a particle). */
const PERSON_AFTER = ["랑", "하고", "한테", "에게", "께", "님", "씨", "야", "아"];

/** A word of the user's own text, its stem without particles, and whether they used it for a person. */
function personStems(text: string | undefined): string[] {
  const tokens = cleanUserText((text ?? "").normalize("NFKC")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.flatMap((raw, i) => {
    const stem = stripParticles(raw);
    const rest = raw.slice(stem.length);
    const honorific = rest === "" && (tokens[i + 1] === "씨" || tokens[i + 1] === "님");
    const nickname = hasBatchim(stem.charAt(stem.length - 1)) && rest.startsWith("이") && rest.length > 1;
    return honorific || nickname || PERSON_AFTER.some((particle) => rest.startsWith(particle)) ? [stem] : [];
  });
}

/** A name's given part, for a full name with a common surname (김민수 → 민수) or of four syllables (남궁민수 → 민수). */
function givenName(word: string): string | null {
  if (/^[가-힣]{4}$/.test(word)) return word.slice(2);
  if (/^[가-힣]{3}$/.test(word) && SURNAMES.includes(word.charAt(0)) && !NOT_NAME_END.test(word.charAt(2))) return word.slice(1);
  return null;
}

/**
 * Names in the user's 누구, question and note, to hide where the reading uses one as a name (at a word
 * start, before a particle, an honorific or a boundary, so 민수용 stays): the 누구's own words (its last
 * word when it has several: "전 남친 민수" → 민수), and the words of the question and note the user put a
 * person's particle after ("민수랑", "지훈이가", "김민수 씨"), each with its given name (김민수 → 민수).
 * Ordinary words (남친, 친구, 팀장님) are never names, and a word used for no one (하반기에, 이야기가) is not one.
 */
function userNames(input: Extract<ChapterContext, { kind: "tarot" }>["input"]): RegExp | null {
  const who = cleanUserText((input.whoText ?? "").normalize("NFKC"))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stripParticles);
  const candidates = [...(who.length > 1 ? who.slice(-1) : who), ...personStems(input.question), ...personStems(input.note)];
  const names = candidates
    .filter((word) => /^[가-힣]{2,4}$/.test(word) && !ORDINARY.has(word))
    .flatMap((word) => {
      const given = givenName(word);
      return given && !ORDINARY.has(given) ? [word, given] : [word];
    });
  if (names.length === 0) return null;
  const alternatives = [...new Set(names)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<![가-힣])(?:${alternatives.join("|")})(?=${AFTER_NAME})`, "g");
}

/** Every occurrence of the words, with any run of whitespace between their parts, replaced by ○○. */
function hideWords(text: string, words: readonly string[]): string {
  return words.reduce((out, word) => out.replace(new RegExp(word.split(" ").map(escapeRegExp).join(String.raw`\s+`), "g"), HIDDEN), text);
}

/**
 * The text with the user's own words replaced by ○○: every quotation that holds part of them, every
 * occurrence of them, and the names among them (userNames).
 */
export function hideOwnWords(text: string, words: readonly string[], name: RegExp | null = null): string {
  const hideQuote = (whole: string, open: string, inner: string, close: string) => (quotesUser(inner, words) ? `${open}${HIDDEN}${close}` : whole);
  let out = text.replace(SINGLE_QUOTED, hideQuote);
  out = out.replace(QUOTES, hideQuote);
  out = hideWords(out, words);
  return name ? out.replace(name, HIDDEN) : out;
}

/**
 * Contact details a share must never publish on our domain (a user can steer the model into writing
 * them through a note or the history the client sends): links, email addresses and @handles, phone
 * numbers, messenger IDs and open chats.
 */
const CONTACT = [
  /https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|kr|io|me|ly|gg|app|xyz|link|site|shop)\b/i,
  /@[a-z0-9_]/i,
  /(?<!\d)0\d{1,2}\s*[.)-]?\s*\d{3,4}\s*[.-]?\s*\d{4}(?!\d)|\+82[\s.-]?\d|(?<!\d)1[5-9]\d{2}-\d{4}(?!\d)/,
  /(?:카카오톡?|카톡|라인|텔레그램)\s*(?:id|아이디)|오픈\s?채팅|오픈\s?톡|open\.kakao/i,
];
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
const hasContact = (text: string) => {
  const plain = text.normalize("NFKC").replace(INVISIBLE, "");
  return CONTACT.some((pattern) => pattern.test(plain));
};

/** The text without every sentence (or line) that `drops`. */
function dropSentences(text: string, drops: (sentence: string) => boolean): string {
  // sentence, separator, sentence, …
  const parts = text.split(/((?<=[.!?。…])\s+|\n+)/);
  let out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    if (!drops(sentence)) out += sentence + (parts[i + 1] ?? "");
  }
  return out.trimEnd();
}

/** The text without every sentence (or line) that carries contact details. */
export function dropContactSentences(text: string): string {
  return hasContact(text) ? dropSentences(text, hasContact) : text;
}

/**
 * A sentence that brings back an earlier reading (A2 SHARE-1): the prompt carries up to three of this
 * device's earlier readings with their questions (lib/ai/history.ts HISTORY_RULE: "지난번 재물 풀이에서
 * 확인해 보자던 신호가…"), but the chapter does not, so their words cannot be hidden one by one. 지난번,
 * 저번, 지난·예전·이전 (주제) 풀이·질문·타로·사주, 물었던, 보자던, 보기로 했던. Time words (지난해, 지난달,
 * 지난주) and the spread's own cards (이전 카드, 앞선 카드) are not one.
 */
const EARLIER_READING = new RegExp(
  [
    String.raw`지난\s?번`,
    String.raw`저번(?!\s?(?:주|달|해))`, // 저번 주·달 are time words
    String.raw`(?:지난(?![해달주날밤])|예전|이전|전에\s?(?:본|봤던|보신|보셨던|받은|받았던))\s?(?:(?:타로|사주|재물|금전|연애|재회|직업운?|이직|관계|궁합)\s?)?(?:풀이|질문|타로|사주|리딩)`,
    String.raw`(?:^|[^가-힣])(?:물었던|물어봤던|물어보셨던|물으셨던)`, // not 다물었던
    String.raw`그때\s?(?:물으신|물었던|물어보신|여쭤|보신|봤던)`,
    String.raw`\d{1,2}월\s?\d{1,2}일[^.!?\n]{0,40}(?:풀이|질문)`,
    String.raw`['‘"“][^'’"”]{2,40}['’"”]\s?풀이(?:에서|를|을|처럼|와|과|도|의)`,
    String.raw`보자던`,
    String.raw`보기로\s?했던`,
  ].join("|"),
);
const bringsBack = (sentence: string) => EARLIER_READING.test(sentence.normalize("NFKC"));
const QUOTED = /\s?['‘"“「『][^'’"”」』]{1,60}['’"”」』]/g;

/**
 * The text without every sentence (or line) that brings back an earlier reading. A field made only of such sentences
 * (a one-line verdict) is not left blank: it keeps them without their quoted words, where an earlier question would be.
 */
export function dropEarlierReadingSentences(text: string): string {
  if (!bringsBack(text)) return text;
  const kept = dropSentences(text, bringsBack);
  return kept.trim() ? kept : text.replace(QUOTED, "").replace(/\s{2,}/g, " ").trim();
}

/** A quotation the hiding emptied: the reading quoted nothing but the user's own words ('○○', "○○"). */
const HIDDEN_QUOTE = /['‘’"“”「」『』]○○['‘’"“”「」『』]/;
const quotesHidden = (sentence: string) => HIDDEN_QUOTE.test(sentence);

/**
 * The text without the sentences that quote the user's hidden words ("'○○'이라고 골랐으니…", "메모에
 * '○○'라고 적었죠."): once the words are gone they read oddly (F-08). A text made only of such
 * sentences stays as it is (its words are hidden already), so no block is ever emptied.
 */
function dropHiddenQuotes(text: string): string {
  if (!quotesHidden(text)) return text;
  return dropSentences(text, quotesHidden) || text;
}

/**
 * The text without the birth's date and clock time, in the ways a reading writes them ("1990년 1월
 * 1일", "1990-01-01", "1990. 1. 1.", "90.1.1", "1월 1일", "90년생", "오후 12시 30분", "12:30"), and without any
 * age ("34~43세", "만 36세", "36살"): an age beside a calendar year gives the birth year away. Other
 * dates stay: a reading's 2027년 3월 is not the user's birth.
 */
export function hideBirth(text: string, birth: BirthInput): string {
  const { year, month, day } = birth;
  const m = `0?${month}`;
  const d = `0?${day}`;
  const yy = String(year % 100).padStart(2, "0");
  const patterns = [
    String.raw`${year}\s?년\s?${m}\s?월(?:\s?${d}\s?일)?`,
    String.raw`${year}\s?[-./]\s?${m}\s?[-./]\s?${d}`,
    String.raw`(?<!\d)${yy}\s?[-./]\s?${m}\s?[-./]\s?${d}(?!\d)`,
    String.raw`(?<!\d)${yy}\s?년\s?${m}\s?월(?:\s?${d}\s?일)?`,
    String.raw`(?<!\d)${m}\s?월\s?${d}\s?일`,
    String.raw`(?<!\d)${year}\s?년생?`,
    String.raw`(?<!\d)${yy}\s?년생`,
    String.raw`(?:만\s?)?(?<!\d)\d{1,3}\s?(?:[~～〜∼\-–]\s?\d{1,3}\s?)?(?:세(?![대기])|살)`,
  ];
  if (birth.timeKnown && birth.hour !== null) {
    const hours = [...new Set([birth.hour, birth.hour % 12 || 12])].join("|");
    const minute = birth.minute === null ? "" : String.raw`(?:\s?0?${birth.minute}\s?분)?`;
    patterns.push(String.raw`(?:(?:오전|오후|새벽|아침|낮|저녁|밤)\s?)?(?<!\d)(?:${hours})\s?시(?!간)${minute}`);
    const clock = birth.minute === null ? String.raw`\d{2}` : String(birth.minute).padStart(2, "0");
    patterns.push(String.raw`(?:(?:오전|오후|새벽|아침|낮|저녁|밤)\s?)?(?<!\d)0?(?:${hours}):${clock}(?!\d)`);
  }
  return patterns.reduce((out, pattern) => out.replace(new RegExp(pattern, "g"), HIDDEN), text);
}

/** The ten stems and twelve branches, each with its Hangul reading: the 간지 pair 庚申 reads 경신. */
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const STEMS_KO = "갑을병정무기경신임계";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const BRANCHES_KO = "자축인묘진사오미신유술해";
const PAIR = `[${STEMS}][${BRANCHES}]`;
const readPair = (pair: string) => `${STEMS_KO[STEMS.indexOf(pair[0]!)]}${BRANCHES_KO[BRANCHES.indexOf(pair[1]!)]}`;

/** A year's own name right after a year ("2026년 병오(丙午)년", "올해 丙午년"): about the calendar, not the birth. */
const YEAR_BEFORE = /(?:\d{4}년|올해|내년|작년|새해)(?:은|는)?\s?$/;
const YEAR_AFTER = /^\s?(?:년|年)(?!생)/;
const yearName = (text: string, start: number, end: number) =>
  YEAR_BEFORE.test(text.slice(Math.max(0, start - 8), start)) && YEAR_AFTER.test(text.slice(end, end + 3));
/** A bare pair's whole name when it sits in one ("병오(丙午)", "丙午(병오)"), so a kept year name stays whole. */
const nameSpan = (text: string, start: number, end: number): [number, number] => {
  const before = /[가-힣]{2}\s?[(（]$/.exec(text.slice(Math.max(0, start - 4), start));
  if (before && /^[)）]/.test(text.slice(end))) return [start - before[0].length, end + 1];
  const after = /^\s?[(（][가-힣]{2}[)）]/.exec(text.slice(end));
  return after ? [start, end + after[0].length] : [start, end];
};

/**
 * The text without any 간지 pair written in hanja, nor its Hangul reading beside it ("경신(庚申)", "庚申(경신)",
 * "庚申" → ○○): the chart's pillars give the birth month and year away (A2 SHARE-2). Every pair, since the
 * builder has no chart to tell the user's pillars from a 대운's (which gives the month away too), except a
 * year's own name right after that year (yearName). A pillar named in Hangul only ("월주 경신") stays:
 * without the chart it is an ordinary word.
 */
function hidePillars(text: string): string {
  return text
    .replace(new RegExp(String.raw`([가-힣]{2})\s?[(（](${PAIR})[)）]`, "g"), (whole, ko: string, pair: string, at: number, all: string) =>
      yearName(all, at, at + whole.length) ? whole : readPair(pair) === ko ? HIDDEN : whole.replace(pair, HIDDEN),
    )
    .replace(new RegExp(String.raw`(${PAIR})\s?[(（]([가-힣]{2})[)）]`, "g"), (whole, pair: string, ko: string, at: number, all: string) =>
      yearName(all, at, at + whole.length) || readPair(pair) !== ko ? whole : HIDDEN,
    )
    .replace(new RegExp(PAIR, "g"), (pair, at: number, all: string) => (yearName(all, ...nameSpan(all, at, at + pair.length)) ? pair : HIDDEN));
}

/** Every string in a JSON value, rewritten by `edit` (objects and arrays keep their shape). */
function mapStrings<T>(value: T, edit: (text: string) => string): T {
  if (typeof value === "string") return edit(value) as T;
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, edit)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, edit)])) as T;
  }
  return value;
}

type TarotCtx = Extract<ChapterContext, { kind: "tarot" }>;
type SajuCtx = Pick<Extract<ChapterContext, { kind: "saju" }>, "birth" | "profile" | "topic">;

/** A tarot text as a share may show it: no earlier reading, no contact, none of the user's own words or names. */
function tarotText(input: TarotCtx["input"]): (text: string) => string {
  const words = ownWords(input);
  const name = userNames(input);
  return (text) => dropHiddenQuotes(hideOwnWords(dropContactSentences(dropEarlierReadingSentences(text)), words, name));
}

/** A saju text as a share may show it: no birth, no pillar in hanja, none of the picked chips or the concern. */
function sajuText(ctx: SajuCtx): (text: string) => string {
  // The status chips the user picked (전체 흐름) and the one-line concern an older chapter may carry.
  const profile = ctx.profile;
  const words = asPromptSaw([profile?.loveStatus, profile?.workStatus, profile?.concern].filter((text) => !UNSURE.has(text?.trim() ?? "")));
  return (text) => dropHiddenQuotes(hideWords(hidePillars(hideBirth(dropContactSentences(dropEarlierReadingSentences(text)), ctx.birth)), words));
}

const READING_KEYS = ["verdict", "cards", "connection", "timing", "observation", "scenarios", "messages", "avoid", "alternatives", "action"] as const;

/**
 * `deck`: the design the reading was written for, signed in its chapter. Absent (a chapter from before
 * chapters carried one): the 1909 scans, which those readings were written for (lib/api/inputs.ts).
 */
export function buildSharePayload(ctx: ChapterContext, reading: unknown, deck: FrontDeck = "rws1909"): SharePayload {
  const r = (reading ?? {}) as Record<string, unknown>;
  if (ctx.kind === "tarot") {
    const positions = TEMPLATES[ctx.templateId as TemplateId].positions;
    // Only the reading's own blocks: never the follow-up suggestions or an old story block.
    const body = Object.fromEntries(READING_KEYS.filter((key) => r[key] !== undefined).map((key) => [key, r[key]]));
    return {
      kind: "tarot",
      v: 1,
      deck,
      cards: ctx.cards.map(([cardId, orientation], slot) => ({ cardId, orientation, position: positions[slot] ?? "" })),
      reading: mapStrings(body, tarotText(ctx.input)) as unknown as ReadingBody,
    };
  }
  if (ctx.kind === "saju") {
    const sections = (Array.isArray(r.sections) ? r.sections : []).filter(isSection).filter((section) => !section.heading.startsWith(BASIS_HEADING));
    const shared: SharedSaju["reading"] = {
      ...(isSajuGlance(r.glance) ? { glance: r.glance } : {}),
      sections,
      ...(isSection(r.observation) ? { observation: r.observation } : {}),
    };
    return { kind: "saju", v: 1, ...(ctx.topic ? { topic: ctx.topic } : {}), reading: mapStrings(shared, sajuText(ctx)) };
  }
  throw new Error(`a ${ctx.kind} reading is not shared yet`);
}

/**
 * The public copy of this device's 오늘의 한 장, from the fortune the server stored for it
 * (lib/api/dailyStore.ts): only the parts the screen shows, field by field. A fortune stored without its
 * design: the 1909 scans.
 */
export function buildDailySharePayload(stored: DailyData & { deck?: unknown }, day: string): SharedDaily {
  const { card, areas, lucky } = stored;
  return {
    kind: "daily",
    v: 1,
    deck: stored.deck === "starlog" ? "starlog" : "rws1909",
    day,
    reading: {
      card: { cardId: card.cardId, orientation: card.orientation, keyword: card.keyword },
      summary: stored.summary,
      body: stored.body,
      areas: { love: areas.love, money: areas.money, work: areas.work },
      lucky: { color: lucky.color, number: lucky.number },
      tip: stored.tip,
    },
  };
}

/** lib/deck.ts FRONT_DECKS, written out: that module is the browser's (its store), and this one is the server's. */
const isFrontDeck = (value: unknown): value is FrontDeck => value === "starlog" || value === "rws1909";
const isSide = (value: unknown): value is Orientation => value === "upright" || value === "reversed";

/** 지금의 한 장 as drawn on a device: the card, its side, which of its lines (0-2) and the design. Null for anything else. */
export function buildNowSharePayload(draw: { cardId: unknown; orientation: unknown; pick: unknown; deck: unknown }): SharedNow | null {
  const { cardId, orientation, pick, deck } = draw;
  if (!isCardId(cardId) || !isSide(orientation) || !isFrontDeck(deck) || typeof pick !== "number" || !Number.isInteger(pick)) return null;
  const entry = decisionFor(cardId, orientation, deck);
  const answer = entry.answers[pick];
  if (pick < 0 || answer === undefined) return null;
  return { kind: "now", v: 1, deck, card: { cardId, orientation }, lean: entry.lean, answer, why: entry.why };
}

/** The free first tarot reading's share (written by the teaser route, where the input and the draw are known). */
export function buildTarotFreePayload(ctx: Pick<TarotCtx, "templateId" | "input" | "cards">, teaser: { first: Section; second?: Section }): SharedTarotFree {
  const positions = TEMPLATES[ctx.templateId as TemplateId].positions;
  const edit = tarotText(ctx.input);
  const part = (section: Section): Section => ({ heading: edit(section.heading), body: edit(section.body) });
  return {
    kind: "tarot-free",
    v: 1,
    deck: ctx.input.deck ?? "rws1909",
    cards: ctx.cards.map(([cardId, orientation], slot) => ({ cardId, orientation, position: positions[slot] ?? "" })),
    first: part(teaser.first),
    ...(teaser.second ? { second: part(teaser.second) } : {}),
  };
}

/** The free saju teaser's share (written by the teaser route, where the birth is known). */
export function buildSajuFreePayload(ctx: SajuCtx, teaser: { title: string; summary: string }): SharedSajuFree {
  const edit = sajuText(ctx);
  return { kind: "saju-free", v: 1, ...(ctx.topic ? { topic: ctx.topic } : {}), title: edit(teaser.title), summary: edit(teaser.summary) };
}

/** The year titles /api/og/premium draws (plain Korean, 2-14 characters), as PremiumChapterView checks them. */
const PREMIUM_TITLE = /^[가-힣\s·,]{2,14}$/;

/** A premium reading's share, from its signed chapter: what its image draws, never its text. */
export function buildPremiumSharePayload(ctx: Extract<ChapterContext, { kind: PremiumId }>, reading: unknown): SharedPremium {
  if (ctx.kind === "tarot-deep") {
    return { kind: "premium", v: 1, product: "tarot-deep", deck: ctx.input.deck ?? "rws1909", cards: ctx.cards.map(([cardId, orientation]) => ({ cardId, orientation })) };
  }
  if (ctx.kind === "match") return { kind: "premium", v: 1, product: "match", ...((MATCH_RELATIONS as readonly string[]).includes(ctx.relation) ? { relation: ctx.relation } : {}) };
  const title = isRecord(reading) && typeof reading.title === "string" ? reading.title.trim() : "";
  return { kind: "premium", v: 1, product: "newyear-2027", ...(PREMIUM_TITLE.test(title) ? { title } : {}) };
}

/** A bonds store id (lib/security/sign.ts randomId). */
const BOND_ID = /^[A-Za-z0-9_-]{16,64}$/;
const isPart = (value: unknown): value is Section => isRecord(value) && typeof value.heading === "string" && typeof value.body === "string";

function parseNewKind(value: Record<string, unknown>): SharePayload | null {
  if (value.kind === "now") {
    const card = value.card;
    if (!isRecord(card) || !isCardId(card.cardId) || !isSide(card.orientation) || !isFrontDeck(value.deck)) return null;
    return typeof value.answer === "string" && typeof value.why === "string" ? (value as unknown as SharedNow) : null;
  }
  if (value.kind === "tarot-free") {
    const cards = value.cards;
    if (!isFrontDeck(value.deck) || !Array.isArray(cards) || cards.length === 0 || !cards.every((c) => isRecord(c) && isCardId(c.cardId) && isSide(c.orientation))) return null;
    return isPart(value.first) && (value.second === undefined || isPart(value.second)) ? (value as unknown as SharedTarotFree) : null;
  }
  if (value.kind === "saju-free") {
    if (typeof value.title !== "string" || typeof value.summary !== "string" || (value.topic !== undefined && !isSajuTopicId(value.topic))) return null;
    return value as unknown as SharedSajuFree;
  }
  if (value.kind === "premium") {
    if (!(PREMIUM_IDS as readonly unknown[]).includes(value.product)) return null;
    if (value.cards !== undefined && !(Array.isArray(value.cards) && value.cards.every((c) => isRecord(c) && isCardId(c.cardId) && isSide(c.orientation)))) return null;
    return value as unknown as SharedPremium;
  }
  if (value.kind === "bonds") return typeof value.constellationId === "string" && BOND_ID.test(value.constellationId) ? (value as unknown as SharedBonds) : null;
  if (value.kind === "bond") {
    const ok = typeof value.constellationId === "string" && BOND_ID.test(value.constellationId) && typeof value.starId === "string" && BOND_ID.test(value.starId);
    return ok ? (value as unknown as SharedBond) : null;
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A stored payload, or null when it is not one this version wrote. */
export function parseSharePayload(text: string): SharePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== 1) return null;
  if (value.kind !== "tarot" && value.kind !== "saju" && value.kind !== "daily") return parseNewKind(value);
  if (!isRecord(value.reading)) return null;
  if (value.kind === "tarot") {
    if (!Array.isArray(value.cards) || value.cards.length === 0 || (value.deck !== "starlog" && value.deck !== "rws1909")) return null;
    return value as unknown as SharedTarot;
  }
  if (value.kind === "saju") {
    if (!Array.isArray(value.reading.sections) || (value.topic !== undefined && !isSajuTopicId(value.topic))) return null;
    return value as unknown as SharedSaju;
  }
  if (value.kind === "daily") {
    const card = value.reading.card;
    if (!isRecord(card) || typeof card.cardId !== "string" || (value.deck !== "starlog" && value.deck !== "rws1909")) return null;
    if (typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || typeof value.reading.summary !== "string") return null;
    return value as unknown as SharedDaily;
  }
  return null;
}
