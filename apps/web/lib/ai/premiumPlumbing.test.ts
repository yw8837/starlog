import { createHash } from "node:crypto";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildRequest } from "./anthropic";
import { generationSetting, KIND_ENV } from "./config";
import { SAJU_PLAIN_RULES, SAJU_PREAMBLE, SAJU_SYSTEM, SAJU_VOICE_RULES } from "./prompts/saju";
import { POSITION_LENS, TAROT_PREAMBLE, TAROT_SYSTEM, buildTarotContext } from "./prompts/tarot";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("standard prompts stay byte for byte", () => {
  it("keeps TAROT_SYSTEM and SAJU_SYSTEM unchanged by the split", () => {
    expect(hash(TAROT_SYSTEM)).toMatchSnapshot();
    // (owner 2026-10-16) SAJU_SYSTEM re-pinned on purpose: the 정통 reading format is written in two halves at once (see
    // sajuTopicPrompts.test.ts's note); the premium split itself still leaves it alone.
    expect(hash(SAJU_SYSTEM)).toMatchSnapshot();
  });
});

describe("premium plumbing", () => {
  it("composes the standard systems from their preambles", () => {
    expect(TAROT_SYSTEM.startsWith(`${TAROT_PREAMBLE}\n\n# 작업별 형식`)).toBe(true);
    // 2026-10-07: the plain-words block sits between them; 2026-10-08: the reading voice after it (both standard and topic only)
    expect(SAJU_SYSTEM.startsWith(`${SAJU_PREAMBLE}\n\n${SAJU_PLAIN_RULES}\n\n${SAJU_VOICE_RULES}\n\n# 작업별 형식`)).toBe(true);
    expect(TAROT_PREAMBLE).not.toContain("## teaser");
  });

  it("gives every premium kind a setting", () => {
    for (const kind of ["premium-teaser", "deep-tarot-part", "match-part", "newyear-part", "premium-followup"] as const) expect(KIND_ENV[kind]).toMatch(/^PREMIUM_/);
    expect(generationSetting("deep-tarot-part", {} as NodeJS.ProcessEnv)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 24000 });
    expect(generationSetting("premium-teaser", {} as NodeJS.ProcessEnv).effort).toBe("low");
    expect(generationSetting("newyear-part", { STARLOG_EFFORT_PREMIUM_NEWYEAR: "high" } as unknown as NodeJS.ProcessEnv).effort).toBe("high");
  });

  it("sends a shared block first, cached, and leaves tasks without one as they were", () => {
    const base = { name: "deep-tarot-part" as const, system: "S", user: "U", schema: z.object({ a: z.string() }), effort: "medium" as const, maxTokens: 24000, mock: () => ({ a: "" }) };
    const withShared = buildRequest({ ...base, shared: "SHARED" }, 24000);
    expect(withShared.messages[0]!.content).toEqual([
      { type: "text", text: "SHARED", cache_control: { type: "ephemeral" } },
      { type: "text", text: "U" },
    ]);
    expect(buildRequest(base, 24000).messages[0]!.content).toEqual([{ type: "text", text: "U" }]);
  });

  it("reads a deep draw's topic by who and id, with the topic's own frame", () => {
    const cards = pickCards(createDeck("lens", DEFAULT_REVERSAL_RATE), TEMPLATES["deep-tarot"], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const money = buildTarotContext("deep-tarot", cards, { topicId: "money", whoId: "me", whenId: "month", question: "", conditions: [] });
    expect(money.topic?.id).toBe("money");
    expect(money.relational).toBe(false);
    expect(money.bannedWords).toContain("재회");
    expect(money.cards.map((c) => c.lens)).toEqual(TEMPLATES["deep-tarot"].positions.map((p) => POSITION_LENS[p]));
    const love = buildTarotContext("deep-tarot", cards, { topicId: "relationship", whoId: "us", whenId: "month", question: "", conditions: [] });
    expect(love.relational).toBe(true);
    expect(love.bannedWords).toEqual([]);
  });
});
