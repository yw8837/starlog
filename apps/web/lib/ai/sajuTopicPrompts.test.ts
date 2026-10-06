import { createHash } from "node:crypto";
import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, otherTopicLabels } from "@/lib/sajuTopics";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { NEWYEAR_SYSTEM } from "./prompts/newyear";
import { SAJU_PREAMBLE, SAJU_SYSTEM } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM, sajuTopicFollowUpPrompt, sajuTopicReadingPrompt, sajuTopicTeaserPrompt, topicFactsBlock } from "./prompts/sajuTopicPrompts";
import { MODEL_BLIND_RULE, aiTells } from "./style";
import { allowedFactViolations } from "./validate";
import { topicHardViolations, validateSajuTopicReading } from "./validateSajuTopics";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const NOW = Date.parse(golden.evalNow);
const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const C1 = chartOf("C1");
const inside = (prompt: string, tag: string) => prompt.slice(prompt.indexOf(`<${tag}>`), prompt.indexOf(`</${tag}>`));
/** What the topic system prompt adds after the pinned preamble. */
const TOPIC_RULES = SAJU_TOPIC_SYSTEM.slice(SAJU_PREAMBLE.length);
const TOPICS: SajuTopicId[] = ["love", "reunion", "money", "career"];
const situations = golden.situations as Record<SajuTopicId, Record<string, SajuSituationId>>;

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

describe("the validator's rules that first attempts broke in the 2026-10-06 real check, said up front", () => {
  const money = buildTopicFactSet(C1, NOW, "money");
  /** The topic validator's hard findings (§8.2) for one sentence, read the way it reads a reading. */
  const hardFindings = (sentence: string) => {
    const out: string[] = [];
    topicHardViolations({ whole: sentence, timing: sentence }, money, out);
    return out;
  };

  it("bans a numeric window of any unit by example; the validator catches each example and passes each wording offered instead", () => {
    const rule = TOPIC_RULES.split("\n").find((line) => line.startsWith("- 시기 지정:"))!;
    for (const banned of ["3일 뒤", "2주 안에", "3개월 안에", "1년 안에", "2년 후"]) {
      expect(rule.slice(0, rule.indexOf("D-30"))).toContain(`"${banned}"`);
      expect(hardFindings(`앞으로 ${banned} 흐름이 바뀌어요.`).join("\n")).toContain(`시기를 지정한 문장이 있어요("${banned}")`);
    }
    for (const offered of ["앞으로 몇 주 동안", "앞으로 몇 달 동안", "올해 남은 기간", "다가오는 해", "이번 대운 동안"]) {
      expect(rule.slice(rule.indexOf("앞으로의 일은"))).toContain(`"${offered}"`);
      expect(hardFindings(`${offered} 흐름을 살펴보세요.`)).toEqual([]);
    }
  });

  it("rules out a glyph <facts> shows only in a relation's note (C1: 申 of 寅巳申 삼형), by example and by name for the chart", () => {
    const love = buildTopicFactSet(C1, NOW, "love");
    expect(topicFactsBlock(love)).toContain("寅巳申 삼형");
    const strayGlyphs = (text: string) => {
      const out: string[] = [];
      allowedFactViolations(text, love.allowed, out);
      return out.filter((v) => v.startsWith("명식에 없는 간지 글자"));
    };
    expect(TOPIC_RULES).toContain('"寅巳申 삼형"');
    expect(strayGlyphs("寅巳申 삼형 가운데 두 글자예요.")).toHaveLength(1);
    expect(TOPIC_RULES).toContain('"사화(巳火)와 인목(寅木) 사이의 형(刑)"');
    expect(strayGlyphs("사화(巳火)와 인목(寅木) 사이의 형(刑)이 있어요.")).toEqual([]);
    expect(inside(sajuTopicReadingPrompt(love), "chart_rules")).toContain("쓰지 않는 글자: 申");
    expect(sajuTopicReadingPrompt(buildTopicFactSet(chartOf("C3"), NOW, "love"))).not.toContain("<chart_rules>");
  });

  it("tells a no-hour chart to say 시주 없이 여섯 글자 기준 inside the section that counts a missing group; an hour-known chart gets that section's rule without it", () => {
    const heading = TOPIC_SECTIONS.money[1]!;
    const unknown = inside(sajuTopicReadingPrompt(money), "chart_rules"); // C1: no hour, 재성 0
    expect(unknown).toContain(`2절 '${heading}'`);
    expect(unknown).toContain("재성");
    expect(unknown).toContain('"시주 없이 여섯 글자 기준"');
    const known = inside(sajuTopicReadingPrompt(buildTopicFactSet(chartOf("C5"), NOW, "money")), "chart_rules"); // C5: hour known, 재성 0
    expect(known).toContain(`2절 '${heading}'`);
    expect(known).toContain("재성");
    expect(known).not.toContain("여섯 글자");
    expect(sajuTopicReadingPrompt(buildTopicFactSet(chartOf("C3"), NOW, "money"))).not.toContain("<chart_rules>"); // hour known, no group at 0
    expect(sajuTopicTeaserPrompt(money)).not.toContain("<chart_rules>");
  });

  it.each(golden.charts.flatMap((c) => TOPICS.map((topic) => [c.id, topic] as const)))(
    "%s %s: <chart_rules> says what the validator would flag: the groups to name as missing, the basis, the glyphs <facts> shows outside the chart",
    (id, topic) => {
      const f = buildTopicFactSet(chartOf(id), NOW, topic, situations[topic][id]);
      const rules = inside(sajuTopicReadingPrompt(f), "chart_rules");
      // The validator is the oracle: what it asks of a reading that says nothing in 2절·3절 …
      const blank = { sections: TOPIC_SECTIONS[topic].map((heading) => ({ heading, body: "" })), observation: { heading: TOPIC_OBSERVATION_HEADING, body: "" }, followUps: [] };
      const asked = validateSajuTopicReading(blank, f);
      for (const heading of TOPIC_SECTIONS[topic].slice(1, 3)) {
        const lead = `'${heading}' 절에서 겉에 없는 `;
        const zero = asked.find((v) => v.startsWith(lead));
        const line = rules.split("\n").find((l) => l.includes(`'${heading}'`)) ?? "";
        expect(line === "").toBe(zero === undefined);
        for (const name of zero ? zero.slice(lead.length, zero.indexOf("을 없거나")).split("·") : []) expect(line).toContain(name);
        expect(line.includes("시주 없이 여섯 글자 기준")).toBe(asked.includes(`'${heading}' 절에서 개수는 시주 없이 여섯 글자 기준이라고 밝혀 주세요.`));
      }
      // … and the glyphs it rejects when <facts> is copied as is.
      const out: string[] = [];
      allowedFactViolations(topicFactsBlock(f), f.allowed, out);
      const listed = (text: string | undefined, lead: string, sep: string) => (text?.includes(lead) ? text.slice(text.indexOf(lead) + lead.length).split(". ")[0]!.split(sep).sort() : []);
      expect(listed(rules, "쓰지 않는 글자: ", "·")).toEqual(listed(out.find((v) => v.startsWith("명식에 없는 간지 글자")), "나왔어요: ", ", "));
    },
  );

  it("tells the 계산 기준 절 that 봤어요·셌어요·않았어요 are one ending, as the E2 check counts them; mixing in ~이에요·~죠 clears it", () => {
    expect(TOPIC_RULES).toContain("봤어요·셌어요·않았어요");
    const ids = (text: string) => aiTells(text).map((t) => t.id);
    expect(ids("출생지 경도로 봤어요. 대표 글자로 셌어요. 시주 해석은 다루지 않았어요. 일주가 전날로 바뀌어요.")).toContain("E2");
    expect(ids("출생지 경도로 봤어요. 대표 글자로 셌어요. 시주 해석은 다루지 않은 풀이예요. 일주가 전날로 바뀌죠.")).not.toContain("E2");
  });
});
