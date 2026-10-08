import { TEMPLATES, computeChart, createDeck, pickCards } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { TOPIC_SECTION_LENGTH } from "@/lib/sajuTopics";
import { mockDaily, mockSajuReading, mockTarotReading } from "./mock";
import { mockSajuTopicReading } from "./mockSajuTopics";
import { DEEP_TAROT_SYSTEM } from "./prompts/deepTarot";
import { MATCH_TAROT_SYSTEM } from "./prompts/match";
import { NEWYEAR_SYSTEM } from "./prompts/newyear";
import { SAJU_PLAIN_RULES, SAJU_PREAMBLE, SAJU_SYSTEM, SAJU_VOICE_EXAMPLES, SAJU_VOICE_RULES, buildFactSet, sajuFollowUpPrompt } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM, sajuTopicFollowUpPrompt } from "./prompts/sajuTopicPrompts";
import { TAROT_PREAMBLE, TAROT_SYSTEM, buildTarotContext, cleanUserText, tarotFollowUpPrompt } from "./prompts/tarot";
import { GenerationError, generateValidated, type GenerationTask, type ReadingProvider, type TaskName } from "./provider";
import { DailyDraftSchema, FollowUpAnswerSchema, SajuReadingSchema, SajuTeaserDraftSchema, TarotReadingSchema, type SajuReading } from "./schemas";
import { VOICE_PREFIX, isSoftViolation } from "./style";
import { charCount, inputUseViolations, validateDaily, validateSajuFollowUp, validateSajuReading, validateTarotReading } from "./validate";
import { validateSajuTopicFollowUp, validateSajuTopicReading } from "./validateSajuTopics";

/** The reading voice (docs/research/reading-voice-2026-10.md, owner 2026-10-08) in the prompts, the facts, the validators and the mocks. */

const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));
const voice = (violations: string[]) => violations.filter((v) => v.startsWith(VOICE_PREFIX));
const NOW = Date.parse(golden.evalNow);
const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const TOPICS: SajuTopicId[] = ["love", "reunion", "money", "career"];
const situations = golden.situations as Record<SajuTopicId, Record<string, SajuSituationId>>;
const YEAR_MONTH = /(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?!\d)/;

describe("the saju prompts (§4.1, §4.2)", () => {
  it("give the standard and topic prompts the voice block after the plain words; 신년운세 builds on the preamble without it", () => {
    expect(SAJU_SYSTEM).toContain(`\n\n${SAJU_VOICE_RULES}\n\n# 작업별 형식`);
    expect(SAJU_TOPIC_SYSTEM).toContain(`\n\n${SAJU_VOICE_RULES}\n\n# 작업별 형식 (주제별 사주)`);
    expect(NEWYEAR_SYSTEM.startsWith(SAJU_PREAMBLE)).toBe(true);
    expect(NEWYEAR_SYSTEM).not.toContain("# 풀이 목소리");
  });

  it("present the template as slots in several forms, rotated, and the examples as form only, with the chart's facts left as slots", () => {
    for (const form of ["적 많지 않나요?", "부터 하게 되죠?", "할 때가 있지 않아요?", "하는 편 아닌가요?", "사주로 보면 ○○라서", "태어난 달 기운이 ○○라서", "하는 경향이 있어요", "하기 쉬워요", "해도 나쁘지 않아요. 다만"]) {
      expect(SAJU_VOICE_RULES).toContain(form);
    }
    // §2.1: every slot rotates, so the template's own phrases do not become the next stock phrases (§5); one rule for every
    // count (review 2026-10-08: the soft checks keep their own caps and still measure)
    expect(SAJU_VOICE_RULES).toMatch(/칸마다 문형을 돌려 써요\. 같은 표현·문형은 풀이 전체에서 두세 번까지예요/);
    for (const count of [
      '같은 질문 꼴은 풀이 전체에서 두 번까지만', '"잠시 숨을 고르고"와 "이번 주에는 ~해 보세요"는 풀이 전체에서 각각 두 번까지만',
      '"~편이에요"는 풀이 전체에서 세 번까지', '"~셈이죠", "~결이에요"', "15자 안팎의 짧은 문장", '"~예요/이에요"는 절 문장의 절반', "바로 뒤에는 쉼표를 찍지 않아요",
    ]) expect(SAJU_SYSTEM, count).not.toContain(count);
    // the count rules left: this merged one, 명리에서는 once, and 적어 보세요 once (a policy with its own check)
    expect(SAJU_SYSTEM.match(/풀이 전체에서[^.\n]{0,24}번/g)?.length).toBe(3);
    // the scene questions keep clear of what the hard checks block (review 2026-10-08)
    expect(SAJU_VOICE_RULES).toMatch(/장면 질문과 예시에는 요일·달·계절을 계기로 쓰지 않고[^\n]*다시 만나게 될까[^\n]*붙을까[^\n]*좋은 날[^\n]*운이 좋은[^\n]*투자[^\n]*점수[^\n]*확실히/);
    expect(TAROT_PREAMBLE).toMatch(/질문이나 장면에도 날짜·요일이나 다른 사람의 속마음을 단정하는 말은 쓰지 않아요/);
    for (const second of ["하는 식이죠", "하곤 해요"]) expect(SAJU_VOICE_RULES).toMatch(new RegExp(`^3\\. [^\\n]*${second}`, "m"));
    for (const advice of ["해도 나쁘지 않아요. 다만", "하는 건 장점이에요. 그래도"]) expect(SAJU_VOICE_RULES).toMatch(new RegExp(`^4\\. [^\\n]*${advice}`, "m"));
    expect(SAJU_VOICE_RULES).toMatch(/형식만 참고[^\n]*문장과 단어를 그대로 쓰지 않아요/);
    for (const example of SAJU_VOICE_EXAMPLES) {
      expect(SAJU_VOICE_RULES).toContain(example);
      expect(example).toMatch(/\[[^\]]+\]/);
      expect(example).not.toMatch(/[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]|비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인|넷이나/);
      expect(example.match(/\*\*[^*]+\*\*/g)?.length).toBe(2);
      // rule 10 offers '일단 해 볼까' as a quote of one's own: an example that holds it makes every use read as a copy
      expect(example).not.toContain("일단 해 볼까");
    }
    // the two examples share no form of the second scene or the advice (review 2026-10-08)
    for (const form of [/식이죠/, /하곤 해요/, /나쁘지 않아요|나쁜 건 아니에요/, /장점이에요/]) {
      expect(SAJU_VOICE_EXAMPLES.filter((example) => form.test(example)).length, String(form)).toBeLessThanOrEqual(1);
    }
  });

  it("give 신년운세's own format the voice's words: a 해석 marker and a scene question, not the confirmation formula", () => {
    expect(NEWYEAR_SYSTEM).toContain("(해석임을 드러내는 말로)");
    expect(NEWYEAR_SYSTEM).toContain("그 경향이 드러나는 장면을 묻는 질문 하나");
    expect(NEWYEAR_SYSTEM).not.toContain("(관점 표시)");
    expect(NEWYEAR_SYSTEM).not.toContain("반증할 수 있는 확인 문장");
  });

  it("keep the facts' relation notes neutral, the 化 rule in the preamble, and the school-label feedback pointing at 계산 기준", () => {
    // 삼합 (1966-11-03), 육합·천간합·방합 (1965-07-15), and the default chart's own
    for (const patch of [{ year: 1966, month: 11, day: 3 }, { year: 1965, month: 7, day: 15 }, {}, { year: 1990, month: 6, day: 21 }]) {
      const f = buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch } as SajuForm)), NOW);
      const notes = [...f.relations, ...(f.luck?.current?.relationsToNatal ?? []), ...f.annual.relationsToNatal].map((r) => r.note ?? "");
      for (const note of notes) expect(note).not.toMatch(/판단하지 않|사건이 아니라|사실만|로만 봄/);
    }
    expect(SAJU_PREAMBLE).toContain("합이 다른 기운으로 바뀐다(化)고 말하지 않아요");
    const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-07T12:00:00+09:00"));
    const answer = `같은 명식으로 이어서 보면 신강한 사주라서 일을 혼자 끌고 가는 편이에요. ${"가까운 일정부터 하나씩 정리해 두면 마음이 한결 가벼워지는 편이에요. ".repeat(3)}`;
    expect(validateSajuFollowUp({ kind: "clarify", answer }, facts).join(" ")).toMatch(/라벨을 단정했어요[^"]*계산 기준 절에서/);
  });

  it("let 심층 타로 and 궁합's card sections end on an act, a question or a short summary, a maxim once a reading (§4.2 rule 16)", () => {
    for (const [system, line] of [[DEEP_TAROT_SYSTEM, "- positions:"], [MATCH_TAROT_SYSTEM, "- cards:"]] as const) {
      expect(system).not.toContain("→ 한 줄 정리");
      expect(system).toMatch(new RegExp(`${line}[^\\n]*행동·질문·짧은 정리 가운데 하나로 맺기`));
    }
  });

  it("drop the lines that made the stock phrases, in every prompt built on the preamble", () => {
    for (const system of [SAJU_SYSTEM, SAJU_TOPIC_SYSTEM, NEWYEAR_SYSTEM]) {
      for (const cause of [
        '"명리에서는 ~로 읽어요", "~한 편으로 읽어요"처럼 관점임을 드러내요',
        '이 부분은 덜 맞는 풀이예요." 풀이 전체에 2번',
        '관점 표시("명리에서는 ~로 읽어요")는 절마다 한 번이면 충분해요',
        '강약을 말해야 하면 "라벨을 붙이지 않았어요"라고만 밝혀요',
        "규칙대로 쓰되",
        "불운이 아니라 기운의 세기와 방향이에요",
        "명식 근거 → 일상 장면 하나 → 작은 실험",
      ]) expect(system, cause).not.toContain(cause);
    }
    expect(SAJU_SYSTEM).not.toContain("강약 라벨은 붙이지 않았다고 한 번 밝혀요");
    expect(SAJU_TOPIC_SYSTEM).not.toContain("명식 근거 → 그 주제의 일상 장면 하나 → 작은 실험 하나");
    // the 직업운 guide's own sentence for 충 (§4.2 rule 10 says it in plain words; "국면이에요" is a stock ending, §2.4)
    expect(SAJU_TOPIC_SYSTEM).not.toContain("충은 움직임이 늘어나는 국면이에요");
    // the groups 2절·3절 must name (anchorViolations) fit the term budget, as the voice check counts them
    expect(SAJU_TOPIC_SYSTEM).toContain("<chart_rules>가 밝히라는 묶음이 여럿이면 그 절은 그 수만큼 용어와 괄호를 써도 돼요.");
    // the disclaimers move to the section that copies the limits, said once; the confirmation formula is banned once
    const placed = "limits를 옮기는 절에 그 명식에 해당하는 것만 한 문장씩 짧게 둬요";
    for (const system of [SAJU_SYSTEM, SAJU_TOPIC_SYSTEM, NEWYEAR_SYSTEM]) {
      expect(system.split(placed)).toHaveLength(2);
      expect(system).not.toMatch(/해명[^\n]*모아요/);
      expect(system.match(/맞물리고/g)?.length).toBe(1);
    }
    expect(SAJU_PLAIN_RULES).not.toContain("해명");
    expect(SAJU_PREAMBLE).not.toContain("라벨을 쓰지 않았다는 말은 limits를 옮기는 절에서만 해요");
    // one sentence settles 문체 규칙's "~로 읽어요" against the saju voice's own markers
    expect(SAJU_PREAMBLE).toContain('아래 문체 규칙의 "~로 읽어요"는 "명리에서는 ~로 읽어요"까지 합쳐 풀이 전체에서 한 번만 써요');
  });

  it("주제 6절: limits run long on a 시 모름 + 경계 chart (golden C9), so 6절 is 200~400자 and even every disclaimer at length stays under its cap", () => {
    expect(SAJU_TOPIC_SYSTEM).toMatch(/\n {2}6\. 계산 기준:[^\n]*시를 모르거나 경계가 걸린 명식은 limits만으로도 길어서 해명은 꼭 필요한 것만 남겨요/);
    // the range the disclaimers moved into (review 2026-10-08): the cap is 400 × 1.5 = 600
    expect(TOPIC_SECTION_LENGTH[5]).toEqual([200, 400]);
    expect(SAJU_TOPIC_SYSTEM).toContain("6절 200~400자");
    const f = buildTopicFactSet(chartOf("C9"), NOW, "money", situations.money.C9);
    expect([f.input.timeKnown, Boolean(f.luckEdge)]).toEqual([false, true]);
    const r = mockSajuTopicReading(f);
    const as6 = (body: string) => validateSajuTopicReading({ ...r, sections: r.sections.map((s, i) => (i === 5 ? { ...s, body } : s)) }, f).join("\n");
    // every calculation and limits line, the one disclaimer that applies and the recompute line, each short: under the cap
    const short = [...f.calculation, ...f.limits, "합·충은 사건으로 읽지 않았어요.", "태어난 시각을 알게 되면 다시 계산할 수 있어요."].join(" ");
    expect(as6(short)).not.toMatch(/'계산 기준[^']*' 절이 공백 제외/);
    // every disclaimer at length, the label one again after the limits: past the old 525 cap, under the new one
    const full = `${short} 강하다 약하다 하는 강약 라벨은 유파마다 결과가 달라 붙이지 않았어요. 합·충 같은 관계는 실제로 묶이는지도 따지지 않았어요. 12운성의 단계도 좋고 나쁨이 아니라 기운의 세기를 가리키는 이름이에요.`;
    expect(charCount(full)).toBeGreaterThan(525);
    expect(as6(full)).not.toMatch(/'계산 기준[^']*' 절이 공백 제외/);
  });

  it("keep the fact rules and the policies", () => {
    for (const rule of [
      "간지, 십성, 12운성, 오행 개수, 관계, 대운·세운, 연도, 나이는 <facts>에 있는 것만 써요",
      "신강·신약, 용신, 격국, 신살(도화, 역마, 공망, 귀인 등), 삼재·원진·백호 같은 라벨은 쓰지 않아요",
      "같은 글자·같은 간지는 그 말 그대로 써요",
      "점수·퍼센트·확률",
      "사건(이별, 사고, 이사)으로 읽지 않아요",
      "모든 문장은 해요체예요",
    ]) expect(SAJU_PREAMBLE, rule).toContain(rule);
    for (const system of [SAJU_SYSTEM, SAJU_TOPIC_SYSTEM]) {
      expect(system).toContain("보완은 일상 행동으로만 말해요");
      expect(system).toContain("<facts>에 없는 십성·12운성은 쓰지 않아요");
      expect(system).toContain('"쉬운 말(용어)"');
    }
  });

  it("set the lengths: 4~8 sentences and 300~450자 a standard body section, 350~480자 a topic's 2~5절", () => {
    expect(SAJU_SYSTEM).toMatch(/1~6절은[^\n]*4~8문장[^\n]*300~450자/);
    expect(SAJU_SYSTEM).toContain("합계 2,100~3,200자");
    expect(SAJU_TOPIC_SYSTEM).toContain("2~5절 각 350~480자");
    expect(SAJU_TOPIC_SYSTEM).toContain("합계 1,900~2,700자");
    expect(SAJU_TOPIC_SYSTEM).not.toContain("500~650자");
  });

  it("ask for a 대운 change in words, and the card in the §2.6 forms without 힘이 붙어요·힘이 실려요", () => {
    for (const system of [SAJU_SYSTEM, SAJU_TOPIC_SYSTEM]) {
      expect(system).toContain('"2027년 9월 무렵"');
      expect(system).toMatch(/goesWell[^\n]*\[쉬운 근거\]라 \[/);
      expect(system).toMatch(/thisYear[^\n]*"힘이 실려요"는 쓰지 않/);
      expect(system).toMatch(/굵게[^\n]*카드 전체에서 두 개까지/);
      expect(system).not.toContain("올해 어느 쪽에 힘이 실리는지");
      expect(system).not.toContain("이 명식에서 힘이 잘 붙는 쪽");
    }
  });
});

describe("the facts name a 대운 change by year and month in words (owner 2026-10-08)", () => {
  it("say 2027년 8월 in the change, the halves and the start, and keep the machine fields", () => {
    const f = buildFactSet(chartOf("C4"), NOW); // 대운 changes 2027-08
    expect(f.luck?.changeSoon).toMatch(/^2027년 8월 무렵 다음 대운/);
    expect(f.luck?.current?.halves).toMatch(/2017년 8월부터 2022년 8월까지가/);
    expect([f.luck?.start, f.luck?.current?.halves, f.luck?.changeSoon].join(" ")).not.toMatch(YEAR_MONTH);
    expect([f.luck?.current?.from, f.luck?.current?.to]).toEqual(["2017-08", "2027-08"]);
  });

  it("say it in words in a topic's 4절 facts too", () => {
    for (const id of ["C1", "C4", "C9"]) {
      const s4 = buildTopicFactSet(chartOf(id), NOW, "career").focus.s4.join(" ");
      expect(s4).toMatch(/\d{4}년 \d{1,2}월/);
      expect(s4).not.toMatch(YEAR_MONTH);
    }
  });
});

describe("the tarot prompt (§2.7, §4.2 15–18)", () => {
  it("opens a card section on the picture, says 역방향 in the next sentence, frames the position once and ends without a maxim each time", () => {
    for (const rule of ["그림 한 컷으로 시작해요", "역방향으로 나와서", "\"X가 역방향으로 나왔어요\" 한 문장으로 절을 열지 않아요", "\"X 자리에서는 ~로 읽어요\"는 리딩 전체에서 한 번까지", "\"한 줄로 말하면\"", "규칙 문구를 본문에 옮기지 않아요", "\"~입니다\""]) {
      expect(TAROT_PREAMBLE, rule).toContain(rule);
    }
    expect(TAROT_PREAMBLE).not.toContain("첫 문장에서 '역방향'으로 나왔다는 사실을 밝히고");
    expect(TAROT_PREAMBLE).not.toContain("한 줄 정리 순서로 써요");
  });

  it("lets the reading's card sections carry one bold phrase, the branches one picture simile; 심층 타로 shares the rules but not the bold", () => {
    expect(TAROT_SYSTEM).toMatch(/- cards:[^\n]*\*\*굵게\*\*[^\n]*0~1개/);
    expect(TAROT_SYSTEM).toMatch(/- scenarios\.items:[^\n]*갈래 하나에만/);
    expect(TAROT_SYSTEM).toMatch(/- connection:[^\n]*쉼표로 나열하며 시작하지/);
    expect(DEEP_TAROT_SYSTEM.startsWith(TAROT_PREAMBLE)).toBe(true);
    expect(DEEP_TAROT_SYSTEM).not.toContain("**굵게**");
  });
});

describe("the validators read the words; the voice checks read the marks", () => {
  const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-07T12:00:00+09:00"));
  const clean = mockSajuReading(facts);
  const inSection = (r: SajuReading, i: number, extra: string, replace = false): SajuReading => ({
    ...r, sections: r.sections.map((s, j) => (j === i ? { ...s, body: replace ? extra : `${s.body} ${extra}` } : s)),
  });

  it("counts lengths without the marks", () => {
    expect(charCount("**굵게** 써요")).toBe(4);
  });

  it("still catches what a bold mark splits: a graded year, a 재회 verdict, an investment order", () => {
    expect(hard(validateSajuReading(inSection(clean, 1, "올해는 좋은 **해**예요."), facts)).join(" ")).toMatch(/시기 등급/);
    const reunion = buildTopicFactSet(chartOf("C1"), NOW, "reunion");
    const r = mockSajuTopicReading(reunion);
    expect(hard(validateSajuTopicReading(inSection(r, 3, "재회운이 **있어요**."), reunion)).join(" ")).toMatch(/재회를 판정한 문장/);
    const ctx = buildTarotContext("self-flow", pickCards(createDeck("voice-money", 0.3), TEMPLATES["self-flow"], [3, 30, 60]), {
      topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "",
    });
    const tarot = mockTarotReading(ctx);
    expect(hard(validateTarotReading({ ...tarot, alternatives: { ...tarot.alternatives, body: `${tarot.alternatives.body} 이번 달에는 투자를 **하세요**.` } }, ctx)).join(" ")).toMatch(/투자·매수·대출/);
  });

  it("add the voice findings to the reading validators, soft", () => {
    // §3.1 고치기 전, as the real reading wrote it
    const before = "이 명식에서 눈에 띄는 축은 둘이에요. 하나는 나를 받쳐 주는 도움과 배움(정인)으로, 년간 무토와 년지 진토가 모두 이 기운이에요. 다른 하나는 넓게 벌이고 굴리는 재물 감각(편재)인데, 월간 을목과 월지 묘목이 이 자리를 채워요. 명리에서는 태어난 해의 기둥을 뿌리와 바탕으로, 태어난 달의 기둥을 사회로 나가는 무대로 읽어요. 바탕은 배운 것을 믿고 차근차근 쌓으려 하고, 무대에서는 판을 넓히고 기회를 굴리려는 힘이 크게 서 있죠. 무대의 힘과 내가 맞서며 움직임이 늘어나는 구조예요. 새로운 일을 같이 벌이자는 제안이 왔을 때 먼저 예전에 배운 방식으로 따져 보느라 시간이 걸렸다면 이 구조와 맞물리고, 생각보다 몸이 먼저 나갔다면 이 부분은 덜 맞는 풀이예요. 다음 제안이 오면 바로 답하기 전에 비슷한 일을 해 본 사람의 사례 하나를 찾아보세요.";
    const standard = validateSajuReading(inSection(clean, 2, before, true), facts);
    expect(voice(standard).join("\n")).toMatch(/장면이나 질문[^\n]*나를 움직이는 힘/);
    expect(voice(standard).join("\n")).toMatch(/상투 문구/);
    expect(hard(standard)).toEqual(hard(validateSajuReading(clean, facts)));
    const money = buildTopicFactSet(chartOf("C1"), NOW, "money");
    const topic = mockSajuTopicReading(money);
    expect(voice(validateSajuTopicReading(inSection(topic, 0, before, true), money)).join("\n")).toMatch(/상투 문구/);
    const ctx = buildTarotContext("self-flow", pickCards(createDeck("voice-tarot", 0.3), TEMPLATES["self-flow"], [3, 30, 60]), {
      topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "",
    });
    const tarot = mockTarotReading(ctx);
    const maxim = { ...tarot, cards: tarot.cards.map((c, i) => (i === 0 ? { ...c, body: `${c.body} 한 줄로 말하면, 버티는 사람이에요.` } : c)) };
    expect(voice(validateTarotReading(maxim, ctx)).join("\n")).toMatch(/상투 문구/);
  });

  it("ask for 300~450자 in a standard body section and 300~550자 in 계산 기준", () => {
    const short = (i: number) => validateSajuReading(inSection(clean, i, "짧아요.", true), facts).join("\n");
    expect(short(0)).toContain(`'${SAJU_PROLOGUE_SECTIONS[0]}' 절이 공백 제외 4자예요. 300~450자로 써 주세요.`);
    expect(short(6)).toContain(`'${SAJU_PROLOGUE_SECTIONS[6]}' 절이 공백 제외 4자예요. 300~550자로 써 주세요.`);
  });

  it("leave the 계산 기준 절 out of the plain-word check: it may name its terms as they are", () => {
    const basis = inSection(clean, 6, `${"편관과 지장간은 계산에만 썼어요."} ${clean.sections[6]!.body}`, true);
    expect(validateSajuReading(basis, facts).join("\n")).not.toMatch(/쉬운 말이 먼저 오지 않았어요/);
  });
});

describe("the mocks follow the voice", () => {
  it("전체 흐름: the default chart's mock opens each body section on a question, 4~8 sentences and 300~450자 with one bold phrase or two, rotates its forms, and no 2027-09", () => {
    const f = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-07T12:00:00+09:00"));
    const r = mockSajuReading(f);
    for (const section of r.sections.slice(0, -1)) {
      const sentences = section.body.split(/(?<=[.?!])\s+/);
      expect(sentences[0], section.heading).toMatch(/\?$/);
      expect(sentences.length, section.heading).toBeGreaterThanOrEqual(4);
      expect(sentences.length, section.heading).toBeLessThanOrEqual(8);
      expect(charCount(section.body), section.heading).toBeGreaterThanOrEqual(300);
      expect(charCount(section.body), section.heading).toBeLessThanOrEqual(450);
      expect(section.body.match(/\*\*[^*]+\*\*/g)?.length, section.heading).toBeGreaterThanOrEqual(1);
    }
    // §2.1: the same form twice at most in a reading, the second scene's and the advice's included
    const body = r.sections.map((s) => s.body).join("\n");
    expect(body.match(/식이죠/g)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(body.match(/나쁘지 않아요|나쁜 건 아니에요/g)?.length ?? 0).toBeLessThanOrEqual(2);
    // no weekday, season or month as a scene's trigger in 1~5절 (6절 names the 대운's change by its month)
    expect(r.sections.slice(0, 5).map((s) => s.body).join("\n")).not.toMatch(/[월화수목금토일]요일|(?<![가-힣])(?:봄|여름|가을|겨울)(?:에|이|이면|철)|(?<!\d)\d{1,2}월/);
    expect(JSON.stringify(r)).not.toMatch(YEAR_MONTH);
    expect(validateSajuReading(r, f)).toEqual([]);
  });

  it.each(golden.charts.flatMap((c) => TOPICS.map((topic) => [c.id, topic] as const)))("%s %s: the 운 mock has no voice finding, the groups its anchors force in 2절·3절 included", (id, topic) => {
    const f = buildTopicFactSet(chartOf(id), NOW, topic, situations[topic][id]);
    expect(voice(validateSajuTopicReading(mockSajuTopicReading(f), f))).toEqual([]);
  });

  it("재회운 2절: names its place (일지) and each group it has none of, one term and one bracket each, without a voice finding (review 2026-10-08)", () => {
    const zeroed = golden.charts.filter((c) => buildTopicFactSet(chartOf(c.id), NOW, "reunion").allowed.anchors.zeroS2.length > 0);
    expect(zeroed.length).toBeGreaterThan(0);
    for (const { id } of zeroed) {
      const f = buildTopicFactSet(chartOf(id), NOW, "reunion", situations.reunion[id]);
      const r = mockSajuTopicReading(f);
      // a model names the place in words with its term ("가장 가까운 자리(일지)") where the mock gives the bare glyph
      const s2 = r.sections[1]!.body.replace(/가장 가까운 자리의 글자\([^)]*\)/, "가장 가까운 자리(일지)");
      expect(s2, id).toContain("(일지)");
      const real = { ...r, sections: r.sections.map((s, i) => (i === 1 ? { ...s, body: s2 } : s)) };
      const found = validateSajuTopicReading(real, f);
      expect(hard(found), id).toEqual([]);
      expect(voice(found), id).toEqual([]);
    }
  });
});

describe("bold stays where a reading shows it, and nowhere else (review 2026-10-08)", () => {
  /** A provider that returns `data` on every attempt. */
  const stub = (data: unknown): ReadingProvider => ({ name: "mock", generate: async () => ({ data: data as never, usage: [] }) });
  const task = <T,>(name: TaskName, schema: z.ZodType<T>): GenerationTask<T> => ({
    name, system: "", user: "", schema, effort: "low", maxTokens: 1, mock: () => { throw new Error("not used"); },
  });
  const failure = (error: unknown) => (error instanceof GenerationError ? error.detail.join(" ") : String(error));
  const padded = (sentence: string) => `${sentence} ${"같은 명식으로 이어서 보면 가까운 일정부터 하나씩 정리해 두면 마음이 한결 가벼워지는 편이에요. ".repeat(3)}`;
  const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-07T12:00:00+09:00"));
  const tarotCtx = buildTarotContext("self-flow", pickCards(createDeck("bold-tarot", 0.3), TEMPLATES["self-flow"], [3, 30, 60]), {
    topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "",
  });

  it("strips a stray mark before any task's checks read it: a 재회 verdict, a graded year and 반말 are found", async () => {
    const reunion = buildTopicFactSet(chartOf("C1"), NOW, "reunion");
    const verdict = await generateValidated(stub({ kind: "clarify", answer: padded("재회운이 **있어요**.") }), task("followup", FollowUpAnswerSchema), (a) => validateSajuTopicFollowUp(a, reunion, "다시 만날까요?")).catch((e: unknown) => e);
    expect(failure(verdict)).toMatch(/재회를 판정한 문장/);
    const graded = await generateValidated(stub({ kind: "clarify", answer: padded("올해는 좋은 **해**예요.") }), task("followup", FollowUpAnswerSchema), (a) => validateSajuFollowUp(a, facts, "올해는 어때요?")).catch((e: unknown) => e);
    expect(failure(graded)).toMatch(/시기 등급/);
    const daily = buildTarotContext("daily", pickCards(createDeck("bold-daily", 0.5), TEMPLATES.daily, [5]), null);
    const day = mockDaily(daily);
    const banmal = await generateValidated(stub({ ...day, body: `${day.body} 오늘은 일단 **정리해**.` }), task("tarot-daily", DailyDraftSchema), (d) => validateDaily(d, daily)).catch((e: unknown) => e);
    expect(failure(banmal)).toMatch(/해요체가 아닌 문장/);
  });

  it("returns every draft without marks but where its screen shows bold: the saju sections and card, the tarot prose sections", async () => {
    const reading = mockSajuReading(facts);
    const bold = (text: string) => `**${text.slice(0, 6)}**${text.slice(6)}`;
    // the observation is also the 돌아보기 card's plain text and history's 120 characters (review 2026-10-08): never bold
    const saju = await generateValidated(
      stub({ ...reading, observation: { ...reading.observation, body: bold(reading.observation.body) }, followUps: ["**지금** 대운에서 해 볼 일은요?", reading.followUps[1]!] }),
      task("saju-reading", SajuReadingSchema), () => [],
    );
    expect(saju.data.followUps[0]).toBe("지금 대운에서 해 볼 일은요?");
    expect(saju.data.observation.body).toBe(reading.observation.body);
    expect(saju.data.sections).toEqual(reading.sections);
    expect(saju.data.glance).toEqual(reading.glance);
    const t = mockTarotReading(tarotCtx);
    const marked = {
      ...t, verdict: bold(t.verdict), cards: t.cards.map((c) => ({ ...c, body: bold(c.body) })), connection: { ...t.connection, body: bold(t.connection.body) },
      scenarios: { ...t.scenarios, items: t.scenarios.items.map((item) => ({ ...item, body: bold(item.body) })) },
      messages: { ...t.messages, items: t.messages.items.map(bold), hint: bold(t.messages.hint) }, avoid: { ...t.avoid, items: t.avoid.items.map(bold) },
      observation: { ...t.observation, body: bold(t.observation.body) }, followUps: t.followUps.map(bold),
    };
    const tarot = await generateValidated(stub(marked), task("tarot-reading", TarotReadingSchema), () => []);
    expect(JSON.stringify([tarot.data.verdict, tarot.data.scenarios, tarot.data.messages, tarot.data.avoid, tarot.data.observation, tarot.data.followUps])).not.toContain("**");
    expect(tarot.data.cards.map((c) => c.body)).toEqual(marked.cards.map((c) => c.body));
    expect(tarot.data.connection.body).toBe(marked.connection.body);
    const teaser = await generateValidated(stub({ title: "한겨울의 해", summary: "새 일을 **먼저 드러내는** 편이에요." }), task("saju-teaser", SajuTeaserDraftSchema), () => []);
    expect(teaser.data.summary).toBe("새 일을 먼저 드러내는 편이에요.");
  });

  it("takes the marks out of what the user typed too, so a quoted note matches the reading it is quoted in (review 2026-10-08)", () => {
    expect(cleanUserText("**급해요** 답이 <와야>  해요")).toBe("급해요 답이 와야 해요");
    const noted = buildTarotContext("self-flow", pickCards(createDeck("bold-note", 0.3), TEMPLATES["self-flow"], [3, 30, 60]), {
      topicId: "money", whoId: "me", whenId: "week", question: "**이번 달** 돈 흐름은?", conditions: [], note: "**급해요** 이번 달 안에 정리하고 싶어요",
    });
    expect(JSON.stringify([noted.note, noted.question])).not.toContain("**");
    const out: string[] = [];
    inputUseViolations(`메모에 '${noted.note}'라고 적었죠.`, noted, out);
    expect(out).toEqual([]);
  });

  it("tells the teaser, follow-up and daily formats not to bold, and shows a follow-up the reading without marks", () => {
    const part = (system: string, heading: string) => {
      const at = system.indexOf(heading);
      const end = system.indexOf("\n## ", at + 1);
      return system.slice(at, end < 0 ? undefined : end);
    };
    for (const [system, heading] of [
      [SAJU_SYSTEM, "## teaser"], [SAJU_SYSTEM, "## followup"], [SAJU_TOPIC_SYSTEM, "## teaser"], [SAJU_TOPIC_SYSTEM, "## followup"],
      [TAROT_SYSTEM, "## teaser"], [TAROT_SYSTEM, "## daily"], [TAROT_SYSTEM, "## followup"],
    ] as const) expect(part(system, heading), heading).toContain("굵게(**)는 쓰지 않아요");
    const reading = mockSajuReading(facts);
    expect(sajuFollowUpPrompt(facts, reading, [], "더 알려 주세요")).not.toContain("**");
    const topic = buildTopicFactSet(chartOf("C1"), NOW, "money");
    expect(sajuTopicFollowUpPrompt(topic, mockSajuTopicReading(topic), [], "더 알려 주세요")).not.toContain("**");
    const t = mockTarotReading(tarotCtx);
    expect(tarotFollowUpPrompt(tarotCtx, { ...t, cards: t.cards.map((c) => ({ ...c, body: `**${c.body.slice(0, 5)}**${c.body.slice(5)}` })) }, [], "더 알려 주세요")).not.toContain("**");
  });
});
