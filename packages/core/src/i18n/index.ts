import { CONSTELLATIONS, type SignId } from "../bonds/constellations";
import { getCard, type Suit } from "../tarot/cards";
import { TEMPLATES, type ConditionDef, type TopicDef, type When, type Who } from "../tarot/templates";
import enData from "./data/en.json";
import jaData from "./data/ja.json";
import zhHantData from "./data/zh-hant.json";

/**
 * Card, spread, topic, condition, sign and saju words per locale (P6 spec §6.4–6.7). Korean comes
 * from the definitions themselves; en and ja card names from cards.ts; the rest from data/*.json,
 * which the review ledger tracks (scripts/i18n/units/core.ts).
 */

export const CORE_LOCALES = ["ko", "en", "ja", "zh-hant"] as const;
export type CoreLocale = (typeof CORE_LOCALES)[number];
type Foreign = Exclude<CoreLocale, "ko">;

export const TEN_GOD_KEYS = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"] as const;
export const STAGE_KEYS = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"] as const;
export const ELEMENT_KEYS = ["목", "화", "토", "금", "수"] as const;
export const SAJU_TERM_KEYS = ["saju", "dayMaster", "tenGods", "stages", "luck", "manseryeok", "stems", "branches", "elements"] as const;

export interface SajuGlossary {
  terms: Record<(typeof SAJU_TERM_KEYS)[number], string>;
  tenGods: Record<(typeof TEN_GOD_KEYS)[number], string>;
  stages: Record<(typeof STAGE_KEYS)[number], string>;
  elements: Record<(typeof ELEMENT_KEYS)[number], string>;
  /** hanja stem → how the locale writes it (en "Yang Fire"; ja and zh keep the hanja) */
  stems: Record<string, string>;
  /** hanja branch → how the locale writes it (en "Tiger"; ja and zh keep the hanja) */
  branches: Record<string, string>;
}

export interface CoreLocaleData {
  /** zh-hant only: names built from parts (en and ja names live in cards.ts) */
  cards?: { majors: string[]; suits: Record<Suit, string>; ranks: Record<string, string>; pattern: string };
  suitNames: Record<Suit, string>;
  majorAliases: Record<string, string[]>;
  suitAliases: Partial<Record<Suit, string[]>>;
  /** Korean position → label (ja falls back to positionsJa) */
  positions: Record<string, string>;
  /** "<who>.<topicId>" → label and question with {when} (ja falls back to the topic's ja fields) */
  topics: Record<string, { label: string; question: string }>;
  /** "<who>.<topicId>.<conditionId>" → label and options (same count and order as Korean) */
  conditions: Record<string, { label: string; options: string[] }>;
  when: Record<When, string>;
  /** the locale's 잘 모르겠어요 and 아직 모르겠어요 */
  unsure: string[];
  constellations: Record<SignId, string>;
  saju: SajuGlossary;
}

const DATA: Readonly<Record<Foreign, CoreLocaleData>> = {
  en: enData satisfies CoreLocaleData,
  ja: jaData satisfies CoreLocaleData,
  "zh-hant": zhHantData satisfies CoreLocaleData,
};

const KO_UNSURE = ["잘 모르겠어요", "아직 모르겠어요"];
const JA_POSITION: ReadonlyMap<string, string> = new Map(
  Object.values(TEMPLATES).flatMap((template) => template.positions.map((position, i) => [position, template.positionsJa[i] ?? position] as const)),
);

export function cardNameIn(id: string, locale: CoreLocale): string {
  const card = getCard(id);
  if (locale !== "zh-hant") return card.names[locale];
  const parts = DATA["zh-hant"].cards!;
  if (card.arcana === "major") return parts.majors[card.number] ?? card.names.en;
  return parts.pattern.replace("{suit}", parts.suits[card.suit!]).replace("{rank}", parts.ranks[String(card.number)] ?? String(card.number));
}

/** Other names a reading may use for the card (validators: foreign-card detection). */
export function cardAliasesIn(id: string, locale: CoreLocale): string[] {
  if (locale === "ko") return [];
  const data = DATA[locale];
  const card = getCard(id);
  if (card.arcana === "major") return data.majorAliases[id] ?? [];
  const name = cardNameIn(id, locale);
  const suit = data.suitNames[card.suit!];
  return (data.suitAliases[card.suit!] ?? []).map((alias) => name.replace(suit, alias));
}

export function positionLabel(locale: CoreLocale, position: string): string {
  if (locale === "ko") return position;
  return DATA[locale].positions[position] ?? (locale === "ja" ? JA_POSITION.get(position) : undefined) ?? position;
}

const topicKey = (who: Who, id: string) => `${who}.${id}`;

export function topicLabel(locale: CoreLocale, who: Who, topic: TopicDef): string {
  if (locale === "ko") return topic.ko;
  return DATA[locale].topics[topicKey(who, topic.id)]?.label ?? (locale === "ja" ? topic.ja : topic.ko);
}

export function topicQuestion(locale: CoreLocale, who: Who, topic: TopicDef): string {
  if (locale === "ko") return topic.questionKo;
  return DATA[locale].topics[topicKey(who, topic.id)]?.question ?? (locale === "ja" ? topic.questionJa : topic.questionKo);
}

export function conditionText(locale: CoreLocale, who: Who, topicId: string, condition: ConditionDef): { label: string; options: string[] } {
  if (locale === "ko") return { label: condition.label, options: condition.options };
  return DATA[locale].conditions[`${who}.${topicId}.${condition.id}`] ?? { label: condition.label, options: condition.options };
}

const KO_WHEN: Record<When, string> = { today: "오늘", week: "이번 주", month: "이번 달", year: "올해" };
export const whenLabel = (locale: CoreLocale, when: When): string => (locale === "ko" ? KO_WHEN[when] : DATA[locale].when[when]);
export const unsureWords = (locale: CoreLocale): string[] => (locale === "ko" ? KO_UNSURE : DATA[locale].unsure);

export function signName(locale: CoreLocale, id: SignId): string {
  const sign = CONSTELLATIONS.find((s) => s.id === id)!;
  return locale === "ko" ? sign.ko : DATA[locale].constellations[id];
}

const identity = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key): [K, string] => [key, key])) as Record<K, string>;

export function sajuGlossary(locale: CoreLocale): SajuGlossary {
  if (locale !== "ko") return DATA[locale].saju;
  return {
    terms: { saju: "사주", dayMaster: "일간", tenGods: "십성", stages: "12운성", luck: "대운", manseryeok: "만세력", stems: "천간", branches: "지지", elements: "오행" },
    tenGods: identity(TEN_GOD_KEYS),
    stages: identity(STAGE_KEYS),
    elements: identity(ELEMENT_KEYS),
    stems: {},
    branches: {},
  };
}
