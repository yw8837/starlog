import { crisisTier, type CrisisTier } from "@/lib/crisis";

/**
 * How far the characters may tease (spec 2026-11-11 entry funnel renewal, 2.5), decided from what the person wrote and the
 * topic, before anything is shown. In order, the first that applies wins:
 * 1. crisis words (lib/crisis.ts): the care lines and contacts, no nickname
 * 2. a heavy topic in any text (health, money owed, lawsuits, a death …): the card's facts only
 * 3. 건강·컨디션 or 마음·감정: facts only
 * 4. 재회, 갈등·화해, 결혼, 재물운, a topic the person wrote, or a breakup or money in the text: the mild names and lines
 * 5. everything else: the teasing names and lines
 * 지금의 한 장 has no mild table, so what three cards would read mildly shows its facts only there (nowTone).
 * Runs in the browser: lib/crisis.ts is its one pattern; nothing here is sent anywhere.
 */
export type Tone = "spicy" | "mild" | "facts" | "crisis";

export interface ToneVerdict {
  tone: Tone;
  /** The crisis tier when the tone is "crisis" (an urgent one leads with the emergency lines), else null. */
  crisis: CrisisTier | null;
}

/** Heavy topics: a nickname would make light of them (spec 2.5 별명 없음). */
const HEAVY = /건강|병원|입원|수술|진단|임신|대출|빚|투자|주식|코인|파산|소송|재판|장례|사망/;
/** A breakup, a marriage, a fight, or money: three cards read them mildly. */
const TENDER = /이별|헤어|재회|이혼|결혼|싸움|싸웠|다퉜|다툼|돈|재물|월급|연봉/;
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

function crisisOf(texts: readonly string[]): CrisisTier | null {
  const rank: Record<CrisisTier, number> = { passive: 1, active: 2, urgent: 3 };
  let worst: CrisisTier | null = null;
  for (const text of texts) {
    const tier = text ? crisisTier(asServerReads(text)) : null;
    if (tier && (!worst || rank[tier] > rank[worst])) worst = tier;
  }
  return worst;
}

/** The 3-card result's tone (B2): the question, its notes and any written topic, and the topic id picked. */
export function tarotTone({ texts = [], topicId, customTopic = false }: { texts?: readonly string[]; topicId?: string; customTopic?: boolean }): ToneVerdict {
  const crisis = crisisOf(texts);
  if (crisis) return { tone: "crisis", crisis };
  if (texts.some((text) => HEAVY.test(text)) || (topicId !== undefined && FACTS_TOPICS.has(topicId))) return { tone: "facts", crisis: null };
  if (customTopic || (topicId !== undefined && MILD_TOPICS.has(topicId)) || texts.some((text) => TENDER.test(text))) return { tone: "mild", crisis: null };
  return { tone: "spicy", crisis: null };
}

/** 지금의 한 장: the typed worry only (no topic). Never mild: what would be mild shows its facts only. */
export function nowTone(question: string): ToneVerdict {
  const verdict = tarotTone({ texts: [question] });
  return verdict.tone === "mild" ? { tone: "facts", crisis: null } : verdict;
}
