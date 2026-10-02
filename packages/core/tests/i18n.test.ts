import { describe, expect, it } from "vitest";
import {
  CARDS, CONSTELLATIONS, CORE_LOCALES, ELEMENT_KEYS, STAGE_KEYS, TEMPLATES, TEN_GOD_KEYS, TOPICS_BY_WHO,
  cardAliasesIn, cardNameIn, conditionText, positionLabel, sajuGlossary, signName, topicLabel, topicQuestion, unsureWords, whenLabel,
  type Who,
} from "../src/index";

const FOREIGN = CORE_LOCALES.filter((locale) => locale !== "ko");
const HANGUL = /[가-힣]/;

describe.each(FOREIGN)("core i18n: %s", (locale) => {
  it("names all 78 cards without Hangul", () => {
    for (const card of CARDS) expect(cardNameIn(card.id, locale), card.id).toMatch(/^[^가-힣]+$/);
  });

  it("labels every spread position", () => {
    for (const template of Object.values(TEMPLATES)) for (const position of template.positions) expect(positionLabel(locale, position), `${template.id}: ${position}`).not.toMatch(HANGUL);
  });

  it("labels and asks every topic, keeping the {when} slot", () => {
    for (const [who, topics] of Object.entries(TOPICS_BY_WHO) as Array<[Who, (typeof TOPICS_BY_WHO)[Who]]>) {
      for (const topic of topics) {
        expect(topicLabel(locale, who, topic), `${who}.${topic.id}`).not.toMatch(HANGUL);
        const question = topicQuestion(locale, who, topic);
        expect(question, `${who}.${topic.id}`).not.toMatch(HANGUL);
        expect(question, `${who}.${topic.id}`).toContain("{when}");
      }
    }
  });

  it("translates every condition with the same options, the unsure one last", () => {
    for (const [who, topics] of Object.entries(TOPICS_BY_WHO) as Array<[Who, (typeof TOPICS_BY_WHO)[Who]]>) {
      for (const topic of topics) {
        for (const condition of topic.conditions) {
          const text = conditionText(locale, who, topic.id, condition);
          const where = `${who}.${topic.id}.${condition.id}`;
          expect(text.label, where).not.toMatch(HANGUL);
          expect(text.options, where).toHaveLength(condition.options.length);
          for (const option of text.options) expect(option, where).not.toMatch(HANGUL);
          expect(unsureWords(locale), where).toContain(text.options.at(-1));
        }
      }
    }
  });

  it("names the four times, the twelve signs and every saju term", () => {
    for (const when of ["today", "week", "month", "year"] as const) expect(whenLabel(locale, when)).not.toMatch(HANGUL);
    for (const sign of CONSTELLATIONS) expect(signName(locale, sign.id)).not.toMatch(HANGUL);
    const glossary = sajuGlossary(locale);
    for (const key of TEN_GOD_KEYS) expect(glossary.tenGods[key]).not.toMatch(HANGUL);
    for (const key of STAGE_KEYS) expect(glossary.stages[key]).not.toMatch(HANGUL);
    for (const key of ELEMENT_KEYS) expect(glossary.elements[key]).not.toMatch(HANGUL);
  });
});

it("builds Traditional Chinese card names from their parts and knows the common aliases", () => {
  expect(cardNameIn("major-00-fool", "zh-hant")).toBe("愚者");
  expect(cardNameIn("cups-03", "zh-hant")).toBe("聖杯三");
  expect(cardNameIn("wands-11", "zh-hant")).toBe("權杖侍從");
  expect(cardNameIn("pentacles-01", "zh-hant")).toBe("錢幣王牌");
  expect(cardNameIn("major-02-high-priestess", "ja")).toBe("女教皇");
  expect(cardAliasesIn("pentacles-03", "en")).toContain("Three of Coins");
  expect(cardAliasesIn("major-20-judgement", "en")).toContain("Judgment");
});
