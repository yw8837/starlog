import { TOPICS_BY_WHO, type TopicDef, type When, type Who } from "@starlog/core";
import { particle } from "./korean";

/**
 * The question sentence at the top of the builder, from the chips and the user's own words
 * (직접 쓰기). Chips alone give the catalog sentence exactly as before. Custom parts are joined with
 * the particle their last syllable needs; when that cannot be told (a Latin or digit ending, or a
 * topic typed as a whole sentence), a plain pattern that never needs a particle is used instead.
 */

/** Longest custom part the builder accepts (누구 · 무엇 · 언제). */
export const CUSTOM_MAX = 30;

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

/** A topic typed as a whole question ("이직해도 될까?"): it is used as the question itself. */
const QUESTION_END = /(까|까요|나요|\?|？)$/u;
/** A topic typed as an open clause ("이직할지"): no particle fits after it. */
const CLAUSE_END = /(는지|은지|을지|할지|될지|인지)$/u;

function customTopicQuestion(when: string, who: Who, whoText: string, topicText: string): string {
  const topic = topicText.replace(/[?？]+$/u, "");
  if (QUESTION_END.test(topicText)) return `${when}, ${topic}`;
  if (CLAUSE_END.test(topic)) return `${when}, ${topic} — 어떻게 흘러갈까`;
  const prefix =
    who === "me"
      ? "나의"
      : who === "us"
        ? `나와 ${whoText || "그 사람"} 사이`
        : who === "work"
          ? whoText
            ? `나와 ${whoText} 사이`
            : "나의 일에서"
          : whoText
            ? `${whoText}에서`
            : "우리 모임에서";
  const topicParticle = particle(topic, "은/는");
  return topicParticle ? `${when}, ${prefix} ${topic}${topicParticle} 어떻게 될까` : `${when}, ${prefix} ${topic} — 어떻게 흘러갈까`;
}

/**
 * A chip topic with a named person or group: the name goes where the catalog sentence has
 * "그 사람" / "우리 모임". When the particle after the name cannot be told (a Latin or digit
 * ending), the catalog sentence stays as it is, except before 에게, which fits any name.
 * Replacements are functions, so "$&" or "$1" in what the user typed stays literal.
 */
function namedChipQuestion(sentence: string, who: Who, whoText: string, topic: TopicDef, when: string): string {
  const match = /그 사람(과|에게)/u.exec(sentence);
  if (match) {
    if (match[1] === "에게") return sentence.replace(match[0], () => `${whoText}에게`);
    const withName = particle(whoText, "과/와");
    return withName ? sentence.replace(match[0], () => `${whoText}${withName}`) : sentence;
  }
  if (who === "group" && /우리 모임|우리가 /u.test(sentence)) {
    return sentence.replace(/우리 모임/u, () => whoText).replace(/우리가 /u, () => `${whoText}에서 `);
  }
  if (who === "work") {
    const topicParticle = particle(topic.phrase, "은/는");
    if (topicParticle) return `${when}, 나와 ${whoText} 사이 ${topic.phrase}${topicParticle} 어떻게 될까`;
  }
  return sentence;
}

/**
 * The full question, or null while 누구 · 무엇 · 언제 are not all given. With chips only it is
 * exactly the catalog sentence (composeQuestion).
 */
export function composeFlowQuestion(parts: QuestionParts): string | null {
  const whenText = cleanPart(parts.whenText);
  const topicText = cleanPart(parts.topicText);
  const whoText = parts.who === "me" ? "" : cleanPart(parts.whoText);
  const when = whenText || (parts.when ? WHEN_KO[parts.when] : "");
  if (!when) return null;

  if (topicText) return customTopicQuestion(when, parts.who, whoText, topicText);

  const topic = parts.topic;
  if (!topic || !TOPICS_BY_WHO[parts.who].includes(topic)) return null;
  // A chip time must be one the topic allows; a typed time replaces the chip, so any is fine.
  if (!whenText && parts.when && topic.whens && !topic.whens.includes(parts.when)) return null;
  const sentence = topic.questionKo.replace("{when}", () => when);
  return whoText ? namedChipQuestion(sentence, parts.who, whoText, topic, when) : sentence;
}
