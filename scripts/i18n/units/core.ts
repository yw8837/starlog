import {
  BRANCHES, BRANCHES_KO, CARDS, CONSTELLATIONS, ELEMENT_KEYS, SAJU_TERM_KEYS, STAGE_KEYS, STEMS, STEMS_KO, TEMPLATES, TEN_GOD_KEYS, TOPICS_BY_WHO,
  cardNameIn, conditionText, positionLabel, sajuGlossary, signName, topicLabel, topicQuestion, whenLabel,
  type SignId, type When, type Who,
} from "@starlog/core";
import type { Locale } from "@/lib/i18n/locales";
import type { Unit } from "./index";

/**
 * Translation units of packages/core/src/i18n (P6 Task 8): positions, topics, conditions, times,
 * signs, saju terms and card names. A unit is present in a locale when its accessor returns text
 * without Hangul (a fallback to Korean counts as missing).
 */

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const WHENS: readonly When[] = ["today", "week", "month", "year"];
const SAJU_GROUPS = ["terms", "tenGods", "stages", "elements", "stems", "branches"] as const;
type SajuGroup = (typeof SAJU_GROUPS)[number];

const unit = (id: string, ko: string): Unit => ({ id, kind: "core", ko, phase: "A" });

function sajuKo(group: SajuGroup): Array<[string, string]> {
  const ko = sajuGlossary("ko");
  switch (group) {
    case "terms": return SAJU_TERM_KEYS.map((key) => [key, ko.terms[key]]);
    case "tenGods": return TEN_GOD_KEYS.map((key) => [key, key]);
    case "stages": return STAGE_KEYS.map((key) => [key, key]);
    case "elements": return ELEMENT_KEYS.map((key) => [key, key]);
    case "stems": return STEMS.map((hanja, i) => [hanja, `${hanja} ${STEMS_KO[i]}`]);
    case "branches": return BRANCHES.map((hanja, i) => [hanja, `${hanja} ${BRANCHES_KO[i]}`]);
  }
}

export function coreUnits(): Unit[] {
  const out: Unit[] = [];
  const positions = new Set(Object.values(TEMPLATES).flatMap((template) => template.positions));
  for (const position of positions) out.push(unit(`core:position:${position}`, position));
  for (const [who, topics] of Object.entries(TOPICS_BY_WHO) as Array<[Who, (typeof TOPICS_BY_WHO)[Who]]>) {
    for (const topic of topics) {
      out.push(unit(`core:topic:${who}.${topic.id}`, `${topic.ko}\n${topic.questionKo}`));
      for (const condition of topic.conditions) {
        out.push(unit(`core:condition:${who}.${topic.id}.${condition.id}`, [condition.label, ...condition.options].join("\n")));
      }
    }
  }
  for (const when of WHENS) out.push(unit(`core:when:${when}`, whenLabel("ko", when)));
  for (const sign of CONSTELLATIONS) out.push(unit(`core:sign:${sign.id}`, sign.ko));
  for (const group of SAJU_GROUPS) for (const [key, ko] of sajuKo(group)) out.push(unit(`core:saju:${group}.${key}`, ko));
  for (const card of CARDS) out.push(unit(`core:card:${card.id}`, card.names.ko));
  return out;
}

/** The locale's text for a core unit, or undefined when the id is unknown. */
function textOf(locale: Exclude<Locale, "ko">, id: string): string | undefined {
  const [, kind, rest = ""] = id.split(":") as [string, string, string?];
  if (kind === "position") return positionLabel(locale, rest);
  if (kind === "topic" || kind === "condition") {
    const [who, topicId, conditionId] = rest.split(".") as [Who, string, string?];
    const topic = TOPICS_BY_WHO[who]?.find((t) => t.id === topicId);
    if (!topic) return undefined;
    if (kind === "topic") return `${topicLabel(locale, who, topic)}\n${topicQuestion(locale, who, topic)}`;
    const condition = topic.conditions.find((c) => c.id === conditionId);
    if (!condition) return undefined;
    const text = conditionText(locale, who, topicId, condition);
    return [text.label, ...text.options].join("\n");
  }
  if (kind === "when") return whenLabel(locale, rest as When);
  if (kind === "sign") return signName(locale, rest as SignId);
  if (kind === "saju") {
    const dot = rest.indexOf(".");
    const group = rest.slice(0, dot) as SajuGroup;
    return (sajuGlossary(locale)[group] as Record<string, string> | undefined)?.[rest.slice(dot + 1)];
  }
  if (kind === "card") return cardNameIn(rest, locale);
  return undefined;
}

export function corePresent(locale: Locale, unit: Unit): boolean {
  if (locale === "ko") return true;
  const text = textOf(locale, unit.id);
  return text !== undefined && text.trim() !== "" && !HANGUL.test(text);
}
