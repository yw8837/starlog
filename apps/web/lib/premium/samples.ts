import "server-only";
import type { Orientation } from "@starlog/core";
import deep from "@content/samples/premium/tarot-deep.json";
import match2 from "@content/samples/premium/match-2.json";
import match from "@content/samples/premium/match.json";
import year from "@content/samples/premium/newyear-2027.json";
import { stripBold } from "@/lib/reading/bold";
import type { DeepTarotReadingData, MatchReadingData, NewYearReadingData } from "@/lib/reading/types";
import type { PremiumId } from "./products";

/**
 * The samples on the product pages (plan-reconciled §4.6): imported on the server only, so the paid text is
 * rendered there and never ships in a client bundle (scripts/check-client-bundle.mjs probes it). They are the
 * owner-approved real outputs of the stage 4 eval (2026-10-17), from made-up inputs summarised in `input`.
 */

export interface SampleCard {
  position: string;
  cardId: string;
  orientation: Orientation;
}

interface SampleBase {
  /** what the made-up input was, in one line (never a real person's) */
  input: { summary: string };
}

export interface PremiumSamples {
  "tarot-deep": SampleBase & { cards: SampleCard[]; reading: DeepTarotReadingData };
  match: SampleBase & { cards: SampleCard[]; reading: MatchReadingData };
  "newyear-2027": SampleBase & { reading: NewYearReadingData };
}

/** The 궁합's second sample, after the first on its page: the other person's birth time unknown (owner 2026-10-17). */
export const MATCH_SECOND_SAMPLE = match2 as unknown as PremiumSamples["match"];

export const PREMIUM_SAMPLES: PremiumSamples = {
  "tarot-deep": deep as unknown as PremiumSamples["tarot-deep"],
  match: match as unknown as PremiumSamples["match"],
  "newyear-2027": year as unknown as PremiumSamples["newyear-2027"],
};

/** Sentences of `text` (bold marks dropped) up to `max` characters, never cut inside one. */
function firstSentences(text: string, max: number): string {
  const sentences = stripBold(text).match(/[^.!?…]+[.!?…]+/g) ?? [stripBold(text)];
  let out = "";
  for (const sentence of sentences) {
    const next = `${out} ${sentence.trim()}`.trim();
    if (out && next.length > max) break;
    out = next;
  }
  return out;
}

/** The product page's short excerpt: the first section of the sample reading, two or three sentences. */
export function sampleExcerpt(id: PremiumId, max = 200): { heading: string; body: string } {
  const section =
    id === "tarot-deep"
      ? PREMIUM_SAMPLES["tarot-deep"].reading.positions[0]!
      : id === "match"
        ? PREMIUM_SAMPLES.match.reading.saju.dayMasters
        : PREMIUM_SAMPLES["newyear-2027"].reading.overview;
  return { heading: section.heading, body: firstSentences(section.body, max) };
}
