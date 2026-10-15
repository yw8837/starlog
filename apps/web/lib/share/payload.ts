import { TEMPLATES, unsureWords, type Orientation, type TemplateId } from "@starlog/core";
import type { ReadingBody } from "@/components/tarot/ReadingArticle";
import { cleanUserText } from "@/lib/ai/prompts/tarot";
import type { FrontDeck } from "@/lib/deck";
import type { Section, SajuGlance, SajuTopicId } from "@/lib/reading/types";
import { isSajuGlance, isSection } from "@/lib/reading/validate";
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

export type SharePayload = SharedTarot | SharedSaju;

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

/** Every string in a JSON value, rewritten by `edit` (objects and arrays keep their shape). */
function mapStrings<T>(value: T, edit: (text: string) => string): T {
  if (typeof value === "string") return edit(value) as T;
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, edit)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, edit)])) as T;
  }
  return value;
}

const READING_KEYS = ["verdict", "cards", "connection", "timing", "observation", "scenarios", "messages", "avoid", "alternatives", "action"] as const;

/**
 * `deck`: the design the reading was written for, signed in its chapter. Absent (a chapter from before
 * chapters carried one): the 1909 scans, which those readings were written for (lib/api/inputs.ts).
 */
export function buildSharePayload(ctx: ChapterContext, reading: unknown, deck: FrontDeck = "rws1909"): SharePayload {
  const r = (reading ?? {}) as Record<string, unknown>;
  if (ctx.kind === "tarot") {
    const words = ownWords(ctx.input);
    const name = userNames(ctx.input);
    const positions = TEMPLATES[ctx.templateId as TemplateId].positions;
    // Only the reading's own blocks: never the follow-up suggestions or an old story block.
    const body = Object.fromEntries(READING_KEYS.filter((key) => r[key] !== undefined).map((key) => [key, r[key]]));
    return {
      kind: "tarot",
      v: 1,
      deck,
      cards: ctx.cards.map(([cardId, orientation], slot) => ({ cardId, orientation, position: positions[slot] ?? "" })),
      reading: mapStrings(body, (text) => dropHiddenQuotes(hideOwnWords(dropContactSentences(text), words, name))) as unknown as ReadingBody,
    };
  }
  if (ctx.kind === "saju") {
    const sections = (Array.isArray(r.sections) ? r.sections : []).filter(isSection).filter((section) => !section.heading.startsWith(BASIS_HEADING));
    const shared: SharedSaju["reading"] = {
      ...(isSajuGlance(r.glance) ? { glance: r.glance } : {}),
      sections,
      ...(isSection(r.observation) ? { observation: r.observation } : {}),
    };
    // The status chips the user picked (전체 흐름) and the one-line concern an older chapter may carry.
    const profile = ctx.profile;
    const words = asPromptSaw([profile?.loveStatus, profile?.workStatus, profile?.concern].filter((text) => !UNSURE.has(text?.trim() ?? "")));
    const hide = (text: string) => dropHiddenQuotes(hideWords(hideBirth(dropContactSentences(text), ctx.birth), words));
    return { kind: "saju", v: 1, ...(ctx.topic ? { topic: ctx.topic } : {}), reading: mapStrings(shared, hide) };
  }
  throw new Error(`a ${ctx.kind} reading is not shared yet`);
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
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.reading)) return null;
  if (value.kind === "tarot") {
    if (!Array.isArray(value.cards) || value.cards.length === 0 || (value.deck !== "starlog" && value.deck !== "rws1909")) return null;
    return value as unknown as SharedTarot;
  }
  if (value.kind === "saju") {
    if (!Array.isArray(value.reading.sections) || (value.topic !== undefined && !isSajuTopicId(value.topic))) return null;
    return value as unknown as SharedSaju;
  }
  return null;
}
