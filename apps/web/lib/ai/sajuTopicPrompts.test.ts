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
import { mockSajuTopicReading } from "./mockSajuTopics";
import type { SajuReading } from "./schemas";
import { MODEL_BLIND_RULE, aiTells } from "./style";
import { allowLimitPillars, allowedFactViolations } from "./validate";
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
  it("pins the standard and 신년운세 prompts by hash (each change is on purpose and noted here)", () => {
    // changed on purpose 2026-10-07: the observation format names this and next month's 월건 (gap review R1), and the
    // preamble says 같은 글자·같은 간지 keep those words (no 복음·반음·병림); that one line is all three hashes moved by.
    // Then SAJU_SYSTEM alone (owner 2026-10-07): the plain-words block, the 한눈에 보기 card, plain section names, the
    // two-month 월건 wording; the preamble and 신년운세 stay as they were.
    // Then SAJU_SYSTEM alone again (review 2026-10-08): month labels and 절기·간지 month names, the preamble's section names
    // mapped onto the plain headings, the limits' other pillars kept to 계산 기준, the card's time, make-up and 입춘 rules,
    // four more glossed terms and the 많은 기운·적은 기운 label.
    // Then all three (the reading voice, owner 2026-10-08, docs/research/reading-voice-2026-10.md §4.1): the preamble drops
    // the lines that made the stock phrases ("명리에서는 ~로 읽어요" a section, the confirmation formula, the body's
    // disclaimers, now in the section that copies the limits), so 신년운세 moves with it; SAJU_SYSTEM adds the voice block,
    // bold, the human dates and 300~450자 sections.
    // Then all three again (review 2026-10-08): the preamble says not to claim 化 (the facts' notes are neutral now),
    // 신년운세's format asks for a 해석 marker and a scene question, and the teaser and follow-up formats say no bold.
    // Then all three once more (before the one real-model check, 2026-10-08): the scene questions keep clear of what the hard
    // checks block, one rule replaces the per-reading counts, the unchecked rhythm rules go, the disclaimers are placed once
    // (only the ones that apply, short), the confirmation formula is banned once, and "~로 읽어요" is settled in one sentence.
    expect(hash(SAJU_PREAMBLE)).toBe("90e3535f9cab2ce186fac45f2dcef97dd97339e26a122bc1cd104ae37800e5bd");
    // Then SAJU_SYSTEM alone (real-model check 2026-10-08): the basis slot writes a required anchor once as "태어난 달(월주)".
    // Then SAJU_SYSTEM alone (saju enrichment, owner 2026-10-08, docs/superpowers/specs/2026-10-08-saju-enrichment-design.md):
    // the reading format grows to nine sections, 7절 이름표 풀이 (the facts' 살·귀인 names, there only) and 8절 기운 채우기
    // (the scarce element's colour, direction, habit and environment as small choices), 계산 기준 moves to 9절 with its basis
    // sentence, the total to 2,700~4,100자, and a follow-up names a 살·귀인 only when asked. The preamble keeps its 신살 ban
    // byte for byte, so 신년운세 and the 운 do not move. Re-pinned the same day for the basis sentence's wording
    // ("귀인은 일간을, 도화·역마·화개는 … 기준으로 찾았고, 이 기준은 유파마다 달라요.").
    expect(hash(SAJU_SYSTEM)).toBe("027b1a51231f695e5432d7e9184f7ba9433d7bdf545a3e5972a3632bd5fa50c8");
    expect(hash(NEWYEAR_SYSTEM)).toBe("1307d57b62ae51e374b7be06b89445fb7c0ad161540b3384fae4447844710f13");
  });

  it("builds the topic system prompt on the shared preamble, blind to model names, without 베타", () => {
    expect(SAJU_TOPIC_SYSTEM.startsWith(`${SAJU_PREAMBLE}\n\n# 주제별 사주에서 달라지는 것`)).toBe(true);
    expect(SAJU_TOPIC_SYSTEM.split(MODEL_BLIND_RULE)).toHaveLength(2);
    for (const heading of ["## teaser", "## reading", "## followup", "## 연애운", "## 재회운", "## 재물운", "## 직업운"]) expect(SAJU_TOPIC_SYSTEM).toContain(heading);
    expect(SAJU_TOPIC_SYSTEM).not.toContain("베타");
    // last moved on purpose (2026-10-08): 6절 200~400자, as the disclaimers moved into it; then 2절·3절 write their anchor
    // once as "쉬운 말(용어)" after a real-model draft cited 월주 only as 태어난 달
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

  it("gives a 연애운·재회운 teaser, which carries the day-pillar window, the reading's limit-only line with the window's time (review 2026-10-08)", () => {
    for (const topic of ["love", "reunion"] as const) {
      const f = buildTopicFactSet(C1, NOW, topic); // C1: 00:00~00:32 gives 乙丑, whose 丑 is not the chart's
      const lead = "limits에만 나오는 다른 기둥의 글자: 丑.";
      expect(inside(sajuTopicReadingPrompt(f), "chart_rules")).toContain(lead);
      const rules = inside(sajuTopicTeaserPrompt(f), "chart_rules");
      expect(rules).toContain(lead);
      expect(rules).toContain(f.dayWindow!.range);
    }
    // no window to carry: the money teaser, and an hour-known chart
    expect(sajuTopicTeaserPrompt(money)).not.toContain("<chart_rules>");
    expect(sajuTopicTeaserPrompt(buildTopicFactSet(chartOf("C3"), NOW, "love"))).not.toContain("<chart_rules>");
  });

  it.each(golden.charts.flatMap((c) => TOPICS.map((topic) => [c.id, topic] as const)))(
    "%s %s: <chart_rules> says what the validator would flag: the groups to name as missing, the basis, the glyphs <facts> shows outside the chart",
    (id, topic) => {
      const f = buildTopicFactSet(chartOf(id), NOW, topic, situations[topic][id]);
      const rules = inside(sajuTopicReadingPrompt(f), "chart_rules");
      // The validator is the oracle: what it asks of a reading that says nothing in 2절·3절 …
      const glance = { goesWell: "", watchOut: "", remedy: "", thisYear: "", thisYearAction: "" };
      const blank = { sections: TOPIC_SECTIONS[topic].map((heading) => ({ heading, body: "" })), observation: { heading: TOPIC_OBSERVATION_HEADING, body: "" }, glance, followUps: [] };
      const asked = validateSajuTopicReading(blank, f);
      for (const heading of TOPIC_SECTIONS[topic].slice(1, 3)) {
        const lead = `'${heading}' 절에서 겉에 없는 `;
        const zero = asked.find((v) => v.startsWith(lead));
        const line = rules.split("\n").find((l) => l.includes(`'${heading}'`)) ?? "";
        expect(line === "").toBe(zero === undefined);
        for (const name of zero ? zero.slice(lead.length, zero.indexOf("을 없거나")).split("·") : []) expect(line).toContain(name);
        expect(line.includes("시주 없이 여섯 글자 기준")).toBe(asked.includes(`'${heading}' 절에서 개수는 시주 없이 여섯 글자 기준이라고 밝혀 주세요.`));
      }
      // … and the glyphs it rejects when <facts> is copied as is: anywhere (쓰지 않는 글자), or outside the 계산 기준 절,
      // which copies the limits (the pillars only the limits name, review 2026-10-08).
      const listed = (text: string | undefined, lead: string, sep: string) => (text?.includes(lead) ? text.slice(text.indexOf(lead) + lead.length).split(". ")[0]!.split(sep).sort() : []);
      const rejected = (text: string) => {
        const out: string[] = [];
        allowedFactViolations(text, f.allowed, out);
        return listed(out.find((v) => v.startsWith("명식에 없는 간지 글자")), "나왔어요: ", ", ");
      };
      const anywhere = rejected(allowLimitPillars(topicFactsBlock(f), f, true));
      expect(listed(rules, "쓰지 않는 글자: ", "·")).toEqual(anywhere);
      expect(listed(rules, "limits에만 나오는 다른 기둥의 글자: ", "·")).toEqual(rejected(topicFactsBlock(f)).filter((g) => !anywhere.includes(g)));
    },
  );

  it("lets only the observation lean on this and next month's 월건, by 간지 and 절기 (no dates, no month names), and lets a complete 삼합·방합 keep its three glyphs", () => {
    expect(TOPIC_RULES).toMatch(/- observation:[^\n]*월건\(monthly\)[^\n]*절기 이름/);
    expect(TOPIC_RULES).toContain("세 글자가 모두 members에 있는 삼합·방합");
    expect(topicFactsBlock(money)).toContain('"monthly"');
    // the facts name the 절 only: its date is exactly what the topic timing check rejects
    expect(topicFactsBlock(money)).toContain('"term":{"name":"한로"}');
    expect(topicFactsBlock(money)).not.toMatch(/"kst"|10월 8일|9월 7일/);
    expect(hardFindings("이번 달 10월 8일 한로부터 흐름이 바뀌어요.").join("\n")).toContain("시기를 지정한 문장");
    expect(hardFindings("한로부터 드는 이번 달 월건의 결을 눈여겨보세요.")).toEqual([]);
  });

  it("flags the facts' two 월건 (戊戌, 己亥 at evalNow, six days before 한로) in a section or the card, never in the observation", () => {
    const said = (r: SajuReading) => validateSajuTopicReading(r, money).filter((v) => v.includes("월건이 나왔어요"));
    const clean = mockSajuTopicReading(money);
    const inSection = (extra: string): SajuReading => ({ ...clean, sections: clean.sections.map((s, i) => (i === 4 ? { ...s, body: `${s.body} ${extra}` } : s)) });
    expect(said(clean)).toEqual([]);
    expect(said(inSection("이번 달 월건의 결도 함께 보세요.")).join(" ")).toContain(`'${TOPIC_SECTIONS.money[4]}' 절`);
    expect(said(inSection("다음 달 戊戌의 결도 함께 보세요."))).toHaveLength(1);
    expect(said({ ...clean, glance: { ...clean.glance, thisYearAction: "그다음 달 己亥의 결에 맞춰 지출을 줄여 보세요." } }).join(" ")).toContain("'한눈에 보기' 절");
    expect(said({ ...clean, observation: { ...clean.observation, body: `${clean.observation.body} 한로부터 드는 무술(戊戌) 월건의 결도 보세요.` } })).toEqual([]);
  });

  it("calls each topic section in the guides by its current heading (review 2026-10-08: 재물운 4절 is 돈의 흐름)", () => {
    const names: Record<SajuTopicId, string> = { love: "연애운", reunion: "재회운", money: "재물운", career: "직업운" };
    for (const topic of TOPICS) {
      const from = SAJU_TOPIC_SYSTEM.indexOf(`## ${names[topic]}\n`);
      const to = SAJU_TOPIC_SYSTEM.indexOf("\n## ", from + 1);
      const guide = SAJU_TOPIC_SYSTEM.slice(from, to < 0 ? undefined : to);
      const named = [...guide.matchAll(/^- (\d)절 ([^:]+):/gm)].map((m) => [Number(m[1]), m[2]!] as const);
      expect(named.map(([n]) => n), topic).toEqual([2, 3, 4, 5]);
      for (const [n, name] of named) expect(TOPIC_SECTIONS[topic][n - 1], `${topic} ${n}절`).toContain(name);
    }
  });

  it("tells the 계산 기준 절 that 봤어요·셌어요·않았어요 are one ending, as the E2 check counts them; mixing in ~이에요·~죠 clears it", () => {
    expect(TOPIC_RULES).toContain("봤어요·셌어요·않았어요");
    const ids = (text: string) => aiTells(text).map((t) => t.id);
    expect(ids("출생지 경도로 봤어요. 대표 글자로 셌어요. 시주 해석은 다루지 않았어요. 일주가 전날로 바뀌어요.")).toContain("E2");
    expect(ids("출생지 경도로 봤어요. 대표 글자로 셌어요. 시주 해석은 다루지 않은 풀이예요. 일주가 전날로 바뀌죠.")).not.toContain("E2");
  });
});
