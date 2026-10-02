import { createHash } from "node:crypto";
import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import { TOPIC_SECTIONS, otherTopicLabels } from "@/lib/sajuTopics";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { NEWYEAR_SYSTEM } from "./prompts/newyear";
import { SAJU_PREAMBLE, SAJU_SYSTEM } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM, sajuTopicFollowUpPrompt, sajuTopicReadingPrompt, sajuTopicTeaserPrompt } from "./prompts/sajuTopicPrompts";
import { MODEL_BLIND_RULE } from "./style";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const NOW = Date.parse(golden.evalNow);
const C1 = computeChart(toSajuInput(golden.charts[0]!.birth as SajuForm));
const inside = (prompt: string, tag: string) => prompt.slice(prompt.indexOf(`<${tag}>`), prompt.indexOf(`</${tag}>`));

describe("주제별 사주 prompts (spec §7.5)", () => {
  it("leaves the standard and 신년운세 prompts byte for byte", () => {
    expect(hash(SAJU_PREAMBLE)).toBe("83bf9731147da635f53c4743b72d607c53c127a7748bba24bcc4c56050892f6b");
    expect(hash(SAJU_SYSTEM)).toBe("b5bc0441ff23dbfdd5496caa02a1d887534734d160aa8d1a04f25a03584418fe");
    expect(hash(NEWYEAR_SYSTEM)).toBe("74ce3549ff870560a081930b741db01e8884a461aa2d82c7f62af81e59bd9221");
  });

  it("builds the topic system prompt on the unchanged preamble, blind to model names, without 베타", () => {
    expect(SAJU_TOPIC_SYSTEM.startsWith(`${SAJU_PREAMBLE}\n\n# 주제별 사주에서 달라지는 것`)).toBe(true);
    expect(SAJU_TOPIC_SYSTEM.split(MODEL_BLIND_RULE)).toHaveLength(2);
    for (const heading of ["## teaser", "## reading", "## followup", "## 연애운", "## 재회운", "## 재물운", "## 직업운"]) expect(SAJU_TOPIC_SYSTEM).toContain(heading);
    expect(SAJU_TOPIC_SYSTEM).not.toContain("베타");
    expect(hash(SAJU_TOPIC_SYSTEM)).toMatchSnapshot();
  });

  it("puts the topic and its one chip inside <user_context>, never in <facts>, and no other topic's chip anywhere", () => {
    const f = buildTopicFactSet(C1, NOW, "money", "leaking");
    const teaser = sajuTopicTeaserPrompt(f);
    expect(teaser.startsWith("<task>teaser</task>\n<topic>재물운</topic>")).toBe(true);
    expect(inside(teaser, "user_context")).toContain("주제: 재물운");
    expect(inside(teaser, "user_context")).toContain("요즘 상황: 돈이 안 모이고 자꾸 새요");
    const facts = inside(teaser, "facts");
    expect(facts).not.toContain("돈이 안 모이고");
    expect(facts).not.toContain('"allowed"');
    expect(facts).not.toContain('"freshUntil"');
    expect(facts).toContain('"nextAnnual"');
    expect(facts).toContain('"focus"');
    for (const label of otherTopicLabels("money")) expect(teaser).not.toContain(label);
    expect(inside(sajuTopicTeaserPrompt(buildTopicFactSet(C1, NOW, "love")), "user_context")).toContain("요즘 상황: (고르지 않음)");
  });

  it("lists the topic's six headings and the observation, and never the birth date", () => {
    const reading = sajuTopicReadingPrompt(buildTopicFactSet(C1, NOW, "money", "leaking"));
    expect(reading.startsWith("<task>reading</task>")).toBe(true);
    for (const heading of TOPIC_SECTIONS.money) expect(inside(reading, "headings")).toContain(heading);
    expect(inside(reading, "headings")).toContain("observation: 앞으로 몇 주 · 확인해 볼 신호");
    expect(reading).not.toContain("1990-01-01");
  });

  it("cleans the follow-up question and keeps the reading as data", () => {
    const follow = sajuTopicFollowUpPrompt(buildTopicFactSet(C1, NOW, "career"), { sections: [] }, [], "올해 <지출>은요?");
    expect(follow.startsWith("<task>followup</task>\n<topic>직업운</topic>")).toBe(true);
    expect(inside(follow, "followup_question")).toContain("올해 지출은요?");
    expect(inside(follow, "previous_turns")).toContain("(없음)");
  });
});
