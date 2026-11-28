import { describe, expect, it } from "vitest";
import { SAJU_TOPIC_IDS, TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, sectionHook } from "@/lib/sajuTopics";
import { assertVoice } from "@/lib/voice/banned";

/**
 * 궁금증 한 줄 (owner 2026-11-28): the question a reader has, shown over a section's real heading on the screens that list
 * the headings. Screens only: the headings themselves (prompts, validator, stored readings) stay as they are.
 */
describe("sectionHook", () => {
  const headings = SAJU_TOPIC_IDS.flatMap((topic) => TOPIC_SECTIONS[topic]);

  it("gives a question to every section but 계산 기준, and to the observation", () => {
    for (const topic of SAJU_TOPIC_IDS) {
      const hooks = TOPIC_SECTIONS[topic].map(sectionHook);
      for (const hook of hooks.slice(0, 5)) expect(hook, topic).toMatch(/\?$/);
      // 계산 기준 says how the chart was computed: no curiosity to sell there.
      expect(hooks[5], topic).toBeUndefined();
      // No two sections of a reading ask the same thing.
      expect(new Set(hooks.slice(0, 5)).size, topic).toBe(5);
    }
    expect(sectionHook(TOPIC_OBSERVATION_HEADING)).toMatch(/\?$/);
  });

  it("is undefined for any other text (a tarot position, an old heading)", () => {
    expect(sectionHook("지금의 나")).toBeUndefined();
    expect(sectionHook("")).toBeUndefined();
  });

  it("asks about what the section reads, never promising an outcome, a date, a score or another person's mind", () => {
    for (const heading of [...headings, TOPIC_OBSERVATION_HEADING]) {
      const hook = sectionHook(heading);
      if (!hook) continue;
      expect(hook.length, hook).toBeLessThanOrEqual(26);
      assertVoice(hook);
      for (const banned of ["언제", "점수", "점", "돈복", "부자", "합격", "승진", "결혼", "재회할", "돌아올", "그 사람 마음", "상대 마음", "운명", "무조건"]) {
        expect(hook, hook).not.toContain(banned);
      }
      // plain words, as the headings (owner 2026-10-07)
      for (const term of ["재성", "식상", "비겁", "인성", "관성", "월주", "십성", "일지", "대운", "세운"]) expect(hook, hook).not.toContain(term);
    }
  });
});
