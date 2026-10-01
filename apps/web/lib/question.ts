import { TOPICS_BY_WHO, type TopicDef, type When, type Who } from "@starlog/core";
import { particle } from "./korean";

/**
 * The question sentence at the top of the builder, from the chips and the user's own words
 * (직접 쓰기). Chips alone give the catalog sentence exactly. Typed parts only go into the sentence
 * when they fit it: a 누구 that reads as a person or group, a 언제 that reads as a time, a 무엇 the
 * sentence can be built around. Whatever is left out still goes to the reading as context
 * (flowState.tarotInput sends every typed part), so nothing the user wrote is lost.
 */

/** Longest custom part the builder accepts for 무엇 and 언제. */
export const CUSTOM_MAX = 30;
/** Longest 누구 detail: a name or a role ("엄마", "팀장님", "전 남친"), not a sentence. */
export const WHO_MAX = 10;

export const WHEN_KO: Record<When, string> = { today: "오늘", week: "이번 주", month: "이번 달", year: "올해" };

export interface QuestionParts {
  who: Who;
  /** Extra detail on the 누구 chip, e.g. "엄마" (not used with 나). */
  whoText?: string;
  /** A chip topic; ignored when `topicText` is set. */
  topic?: TopicDef;
  /** The user's own 무엇, which replaces the chip. */
  topicText?: string;
  /** A chip time; ignored when `whenText` is set. */
  when?: When;
  /** The user's own 언제, which replaces the chip. */
  whenText?: string;
}

/**
 * Trims, folds spaces, drops angle brackets (the server strips them too) and trailing
 * commas/periods, so joins never read ",," or ".,". Text without a single letter or digit counts
 * as nothing typed.
 */
export function cleanPart(text: string | undefined): string {
  const clean = (text ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().replace(/[\s,.·]+$/u, "");
  return /[\p{L}\p{N}]/u.test(clean) ? clean : "";
}

/**
 * Verb endings that make typed text a clause or a sentence ("모아야", "싶어요", "할지", "하면").
 * Bare 어/아/해/야 are left out: too many nouns end in them (커리어, 아이디어, 피해, 분야).
 */
const CLAUSE_ENDING =
  /(요|니다|다|까|죠|네|거야|이야|아야|어야|해야|여야|워야|는지|은지|인지|던지|하지|않지|겠지|하고|이고|라고|려고|자고|면서|아서|어서|해서|라서|니까|으면|하면|려면|다면|는데|은데|던데|지만|거든|잖아|싶어|싶음|있어|없어|같아|좋아|싫어|많아|않아|찮아|몰라|했어|됐어|겠어|힘들어|아파|바빠|어려워|무서워|외로워|없음|있음)$/u;
/** A clause ending in 지 after a syllable with ㄹ (할지, 될지, 좋을지). */
const L_FINAL = 8;

function endsWithLJi(text: string): boolean {
  if (text.length < 2 || !text.endsWith("지")) return false;
  const code = text.charCodeAt(text.length - 2) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === L_FINAL;
}

/** True when typed text reads as a clause or a sentence, not a name or a noun. */
function isClause(text: string): boolean {
  if (/[?？!！]/u.test(text)) return true;
  // Two syllables are a name or a noun (민지, 은지, 바다, 라면) unless they end like 해요 or 할까.
  if (text.length <= 2) return /[요까죠]$/u.test(text);
  // 아버지, 할아버지: a person, not a 지 clause.
  if (/버지$/u.test(text)) return false;
  return CLAUSE_ENDING.test(text) || endsWithLJi(text);
}

/**
 * The 누구 detail as it can stand in the sentence, or "" when it cannot: longer than 8, more than
 * one space, a clause ("티끌을 얼마나 모아야"), a number or a link, or (for a person) a name
 * already carrying 과/와/랑, after which the sentence cannot add its own. 에게/한테/이랑/하고 typed
 * after a name are dropped, since the sentence adds its own. A group (우리 모임) takes no particle.
 */
export function personRef(text: string | undefined, who?: Who): string {
  const clean = cleanPart(text).replace(/(에게|한테|이랑|하고)$/u, "").trim();
  if (!clean || clean.length > 8 || (clean.match(/ /g) ?? []).length > 1) return "";
  if (/^[\d\s.,:/+-]+$/u.test(clean) || /https?:|www\.|\.(com|net|kr|io|me)\b|@/iu.test(clean)) return "";
  if (isClause(clean) || (who !== "group" && /[과와랑]$/u.test(clean))) return "";
  return clean;
}

/**
 * Words that make a typed 언제 read as a time: "다음 주 금요일", "면접 보는 날", "연말쯤". One-syllable
 * ones only count at the end of a word (날, 3월, 아무 때나), so 날씨, 시험 or 기분 do not.
 */
const TIME_WORD =
  /오늘|내일|모레|어제|이번|다음|지난|올해|내년|작년|요즘|언제|언젠|주말|평일|아침|점심|저녁|새벽|오전|오후|연말|연초|월말|월초|반기|여름|가을|겨울|방학|학기|분기|휴가|명절|설날|추석|크리스마스|생일|기념일|요일|무렵|동안|이내|중순|\d|(날|일|주|달|월|년|해|시|분|밤|봄|때|쯤|전|후)(?=$|\s|에|엔|까지|쯤|나|부터|즈음|이나)/u;

/** The typed 언제 when it reads as a time, otherwise "" (it is still sent as context). */
export function timePhrase(text: string | undefined): string {
  const clean = cleanPart(text);
  if (!clean || isClause(clean)) return "";
  return TIME_WORD.test(clean) ? clean : "";
}

/**
 * 나의 일 detail: a person ("팀장님", "거래처") or a team, project or workplace ("우리 팀",
 * "새 프로젝트", "첫 직장"). Anything else only reaches the reading.
 */
const WORK_PERSON = /(님|씨|선배|후배|동료|상사|고객|거래처|대표|교수|선생|사장|팀장|부장|과장|대리|사원|직원|클라이언트)$/u;
const WORK_PLACE = /(팀|회사|직장|프로젝트|부서|사업|가게|매장|학교|학원|연구실|업무|과제|공모전|스터디|알바|아르바이트|인턴|창업)$/u;

function workSide(name: string): "person" | "place" | null {
  if (!name) return null;
  if (WORK_PERSON.test(name)) return "person";
  return WORK_PLACE.test(name) ? "place" : null;
}

/** A group for the 우리 모임 sentences: "동아리" as it is, "엄마" → "엄마 모임". */
function groupName(name: string): string {
  return /(모임|동아리|동호회|팀|회사|학교|반|방|회|부|과|조|가족|친구들|교회)$/u.test(name) ? name : `${name} 모임`;
}

/**
 * The time in front of the rest of the question: a chip as it is ("이번 주 …"), a typed time set off
 * with a comma ("다음 주 금요일 면접, …") unless the rest already has one, or no time at all.
 */
function withTime(when: { text: string; typed: boolean } | null, rest: string): string {
  if (!when) return rest;
  return when.typed && !rest.includes(",") ? `${when.text}, ${rest}` : `${when.text} ${rest}`;
}

/** "이번 주엔", "다음 주 금요일엔" (금요일에 → 금요일엔). */
function withEn(time: string): string {
  if (/(엔|에는|은|는)$/u.test(time)) return time;
  return /에$/u.test(time) ? `${time.slice(0, -1)}엔` : `${time}엔`;
}

/** Question endings typed as is: "이직해도 될까", "괜찮을까요", "어떡하나요". */
const QUESTION_END = /(까|까요|나요|가요|냐|는가)$/u;

/** "이직할지 말지" → "이직할까 말까", "진심인지" → "진심일까", "왜 연락이 없는지" → "왜 연락이 없는 걸까". */
function whetherQuestion(text: string): string | null {
  if (text.length < 3) return null;
  if (/지 말지$/u.test(text)) return text.replace(/지 말지$/u, "까 말까");
  if (/인지$/u.test(text)) return `${text.slice(0, -2)}일까`;
  if (/[는은]지$/u.test(text)) return `${text.slice(0, -1)} 걸까`;
  if (endsWithLJi(text)) return `${text.slice(0, -1)}까`;
  return null;
}

/** The 무엇 typed by the user, built into a question that reads naturally. */
function customTopicQuestion(when: { text: string; typed: boolean } | null, who: Who, name: string, topicText: string): string {
  const text = topicText.replace(/[?？!！.]+$/u, "").trim();
  // Typed as a question already: used as is.
  if (/[?？]$/u.test(topicText) || QUESTION_END.test(text)) return withTime(when, `${text}?`);
  // "티끌을 얼마나 모아야 (해요)" → "티끌을 얼마나 모아야 할까?"
  const must = /(아야|어야|해야|여야|워야)( ?(해요|해|한다|합니다|돼요|돼|된다|하나|하나요))?$/u.exec(text);
  if (must) return withTime(when, `${text.slice(0, must.index + must[1]!.length)} 할까?`);
  const whether = whetherQuestion(text);
  if (whether) return withTime(when, `${whether}?`);
  // A whole sentence ("돈 많이 벌고 싶어요"): kept as the user said it, then the question.
  if (isClause(text)) {
    const polite = /(요|니다)$/u.test(text);
    const time = when ? `${withEn(when.text)} ` : "";
    return `${text}. ${time}어떻게 될까${polite ? "요" : ""}?`;
  }
  // A noun phrase ("창업 준비"): whose it is, then the topic.
  const withName = name ? particle(name, "과/와") : null;
  const side = who === "work" ? workSide(name) : null;
  const prefix =
    who === "me"
      ? "내 "
      : who === "us"
        ? withName
          ? `${name}${withName}의 `
          : "그 사람과의 "
        : who === "work"
          ? side === "person" && withName
            ? `${name}${withName}의 `
            : side === "place"
              ? `${name} `
              : ""
          : `${name ? groupName(name) : "우리 모임"} `;
  const topicParticle = particle(text, "은/는");
  return withTime(when, topicParticle ? `${prefix}${text}${topicParticle} 어떻게 될까?` : `${prefix}${text}, 어떻게 될까?`);
}

/**
 * A chip topic with a named person or group: the name goes where the catalog sentence has
 * "그 사람" / "우리 모임" (and, for 나의 일, the other side of 일 or 협상, or the team or project they
 * are about). When the particle after the name cannot be told (a Latin or digit ending), the catalog
 * sentence stays as it is, except before 에게, which fits any name. Replacements are functions, so
 * "$&" or "$1" in what the user typed stays literal.
 */
function namedChipQuestion(sentence: string, who: Who, name: string): string {
  if (who === "work") {
    const side = workSide(name);
    if (side === "place") {
      // "우리 팀은 어떻게 풀릴까?", "새 프로젝트 협상, 어떻게 풀어 갈까?"
      const topicParticle = particle(name, "은/는");
      return sentence.replace(/중요한 협상|내 일은/u, (match) => (match === "내 일은" ? (topicParticle ? `${name}${topicParticle}` : match) : `${name} 협상`));
    }
    const withName = side === "person" ? particle(name, "과/와") : null;
    if (!withName) return sentence;
    return sentence.replace(/중요한 협상|내 일은/u, (match) => (match === "내 일은" ? `${name}${withName}의 일은` : `${name}${withName}의 협상`));
  }
  if (who === "group") {
    const group = groupName(name);
    // "우리가 함께하는 일" → "가족이 함께하는 일", "동아리가 함께하는 일"
    const subject = particle(group, "이/가");
    return sentence.replace(/우리 모임/u, () => group).replace(/우리가 /u, () => (subject ? `${group}${subject} ` : `${group}에서 `));
  }
  if (sentence.includes("그 사람에게")) return sentence.replace("그 사람에게", () => `${name}에게`);
  const withName = particle(name, "과/와");
  if (!withName) return sentence;
  if (sentence.includes("그 사람과")) return sentence.replace("그 사람과", () => `${name}${withName}`);
  return sentence;
}

/**
 * The full question, or null while 누구 · 무엇 · 언제 are not all given. With chips only it is
 * exactly the catalog sentence (composeQuestion). A typed 언제 that is not a time leaves the
 * sentence without one.
 */
export function composeFlowQuestion(parts: QuestionParts): string | null {
  const typedWhen = cleanPart(parts.whenText);
  const topicText = cleanPart(parts.topicText);
  const name = parts.who === "me" ? "" : personRef(parts.whoText, parts.who);
  if (!typedWhen && !parts.when) return null;
  const time = typedWhen ? timePhrase(typedWhen) : "";
  const when = typedWhen ? (time ? { text: time, typed: true } : null) : { text: WHEN_KO[parts.when!], typed: false };

  if (topicText) return customTopicQuestion(when, parts.who, name, topicText);

  const topic = parts.topic;
  if (!topic || !TOPICS_BY_WHO[parts.who].includes(topic)) return null;
  // A chip time must be one the topic allows; a typed time replaces the chip, so any is fine.
  if (!typedWhen && parts.when && topic.whens && !topic.whens.includes(parts.when)) return null;
  const sentence = withTime(when, topic.questionKo.replace(/^\{when\},? /u, ""));
  return name ? namedChipQuestion(sentence, parts.who, name) : sentence;
}
