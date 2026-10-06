import { describe, expect, it } from "vitest";
import { cardNameIn } from "@starlog/core";
import { KB_CARDS } from "./index";
import { KB_I18N_LOCALES, kbText } from "./i18n";

const HANGUL = /[\uac00-\ud7a3]/;

describe.each(KB_I18N_LOCALES)("KB text: %s", (locale) => {
  it("covers all 78 cards with every fact, gloss and reversed-mode gloss of the Korean KB", () => {
    for (const card of KB_CARDS) {
      const text = kbText(locale, card.id);
      expect(text.name, card.id).toBe(cardNameIn(card.id, locale));
      expect(Object.keys(text.facts).sort(), card.id).toEqual(card.imagery.facts.map((f) => f.id).sort());
      expect(Object.keys(text.glosses).sort(), card.id).toEqual(card.imagery.glosses.map((g) => g.factId).sort());
      expect(Object.keys(text.reversedGloss).sort(), card.id).toEqual(Object.keys(card.reversedModes.gloss).sort());
      expect(text.keywords.length, card.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no Hangul and only compiling misdescription regexes that its own facts never match", () => {
    for (const card of KB_CARDS) {
      const text = kbText(locale, card.id);
      expect(JSON.stringify(text), card.id).not.toMatch(HANGUL);
      const facts = Object.values(text.facts).join("\n");
      for (const m of text.misdescriptions) {
        const re = new RegExp(m.regex, "i");
        expect(re.test(facts), `${card.id}: ${m.regex}`).toBe(false);
      }
    }
  });
});
