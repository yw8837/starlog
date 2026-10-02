import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuTopicId } from "@/lib/reading/types";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { mockSajuTopicFollowUp, mockSajuTopicReading } from "./mockSajuTopics";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { isSoftViolation } from "./style";
import { topicHardViolations, validateSajuTopicFollowUp, validateSajuTopicReading } from "./validateSajuTopics";

const NOW = Date.parse(golden.evalNow);
const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const factsFor = (topic: SajuTopicId, id = "C1") => buildTopicFactSet(chartOf(id), NOW, topic);
const hardOf = (topic: SajuTopicId, text: string, id = "C1") => {
  const out: string[] = [];
  topicHardViolations({ whole: text, timing: text }, factsFor(topic, id), out);
  return out;
};

const CAUGHT: Array<[SajuTopicId, string, RegExp]> = [
  ["money", "3일 뒤에 변화가 보여요.", /시기를 지정한 문장/],
  ["love", "2주 안에 마음을 정해 보세요.", /시기를 지정한 문장/],
  ["career", "D-30부터 준비해요.", /시기를 지정한 문장/],
  ["reunion", "디데이를 정해 두세요.", /시기를 지정한 문장/],
  ["money", "5월 12일에 지출을 확인해요.", /시기를 지정한 문장/],
  ["love", "토요일에 만나 보세요.", /시기를 지정한 문장/],
  ["career", "9시에 시작해 보세요.", /시기를 지정한 문장/],
  ["money", "3월에 지출을 점검해요.", /달·계절로 시기를 짚은 문장/],
  ["career", "하반기에 움직임이 늘어요.", /달·계절로 시기를 짚은 문장/],
  ["love", "내년 봄에 마음이 열려요.", /달·계절로 시기를 짚은 문장/],
  ["reunion", "올해 가을쯤 정리가 돼요.", /달·계절로 시기를 짚은 문장/],
  ["love", "정재는 아내의 별이에요.", /성별로 배우자 별을 정한 문장/],
  ["love", "관성이 남편이에요.", /성별로 배우자 별을 정한 문장/],
  ["career", "여자에게 관성은 일의 기준이에요.", /성별로 배우자 별을 정한 문장/],
  ["money", "썸이 애매해요라는 마음도 들 수 있어요.", /다른 주제의 상황 칩 문구/],
  ["love", "그 사람의 사주를 보면 알 수 있어요.", /상대의 정보를 다룬 문장/],
  ["reunion", "상대의 띠가 중요해요.", /상대의 정보를 다룬 문장/],
  ["reunion", "그 사람은 아직 당신을 좋아해요.", /다른 사람의 마음을 단정한 문장/],
  ["career", "팀장은 당신을 싫어해요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "헤어진 사람의 마음은 아직 당신에게 있어요.", /다른 사람의 마음을 단정한 문장/],
  ["money", "300만 원을 모아 보세요.", /금액이나 비율을 쓴 문장/],
  ["money", "1억을 목표로 해요.", /금액이나 비율을 쓴 문장/],
  ["career", "20% 더 힘을 내요.", /금액이나 비율을 쓴 문장/],
  ["love", "곧 인연이 나타나요.", /만남·이별을 예언한 문장/],
  ["love", "곧 만나게 돼요.", /만남·이별을 예언한 문장/],
  ["reunion", "결국 헤어지게 돼요.", /만남·이별을 예언한 문장/],
  ["love", "배우자는 키가 크고 다정해요.", /상대의 특징을 말한 문장/],
  ["love", "연상을 만나요.", /상대의 특징을 말한 문장/],
  ["reunion", "그 사람의 MBTI가 잘 맞아요.", /상대의 특징을 말한 문장/],
  ["reunion", "재회하게 돼요.", /재회를 판정한 문장/],
  ["reunion", "다시 이어질 거예요.", /재회를 판정한 문장/],
  ["reunion", "그 사람이 돌아올 거예요.", /재회를 판정한 문장/],
  ["reunion", "재회운이 있어요.", /재회를 판정한 문장/],
  ["reunion", "곧 연락이 와요.", /연락을 예언하거나 시킨 문장/],
  ["reunion", "먼저 연락하세요.", /연락을 예언하거나 시킨 문장/],
  ["love", "붙잡는 법을 알려 드릴게요.", /붙잡는 법을 다룬 문장/],
  ["reunion", "마음을 돌리는 말이 있어요.", /붙잡는 법을 다룬 문장/],
  ["reunion", "돌아오게 만드는 방법이에요.", /붙잡는 법을 다룬 문장/],
  ["money", "주식을 사 보세요.", /투자를 권하거나 수익을 약속한 문장/],
  ["money", "곧 목돈이 들어와요.", /투자를 권하거나 수익을 약속한 문장/],
  ["money", "재물운이 약해요.", /재물운의 세기를 매긴 문장/],
  ["money", "돈복이 없어요.", /재물운의 세기를 매긴 문장/],
  ["money", "부자가 될 사주예요.", /재물운의 세기를 매긴 문장/],
  ["money", "돈이 들어오는 해예요.", /돈이 들어오는 때를 짚은 문장/],
  ["career", "이직하세요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "퇴사할 때예요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "회사에 남으세요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "합격해요.", /합격·승진을 판정한 문장/],
  ["career", "붙을 거예요.", /합격·승진을 판정한 문장/],
  ["career", "이번 시험에서는 떨어질 수 있어요.", /합격·승진을 판정한 문장/],
  ["career", "승진운이 들어와요.", /합격·승진을 판정한 문장/],
  ["career", "합격 가능성이 높아요.", /합격·승진을 판정한 문장/],
];

const PASSES: Array<[SajuTopicId, string]> = [
  ["money", "앞으로 몇 주 동안 눈여겨보세요."],
  ["love", "해가 바뀌는 입춘 무렵부터 결이 달라져요."],
  ["career", "관성은 나를 다잡는 약속과 질서로 읽어요."],
  ["reunion", "그 사람의 마음은 알 수 없지만, 분위기를 살펴볼 수는 있어요."],
  ["love", "만남이 생기는 생활 반경을 넓혀 볼 수 있어요."],
  ["reunion", "다시 이어진다면 되풀이되기 쉬운 것부터 살펴요."],
  ["reunion", "재회를 생각할 때 내 마음이 머무는 자리부터 살펴요."],
  ["reunion", "연락할지 말지는 내 하루가 흔들리지 않는지를 기준으로 스스로 정해 보세요."],
  ["money", "투자 판단은 이 풀이로 말하기 어려워요."],
  ["money", "돈이 들어오는 길이 지장간에 숨어 있어요."],
  ["money", "재성이 드러나는 국면이에요."],
  ["career", "옮긴다면 배울 거리를, 남는다면 맡을 일을 기준으로 두 길을 놓고 정해 보세요."],
  ["career", "합격 여부는 이 풀이로 보지 않아요."],
  ["career", "합격·불합격은 이 풀이로 보지 않아요."],
  ["career", "오후에는 집중력이 떨어져요."],
  ["love", "상대의 명식 없이 내 명식만 읽었어요."],
  ["love", "재회가 된다고 약속하지 않아요."],
];

describe("§8.2 hard checks", () => {
  it.each(CAUGHT)("%s catches %s", (topic, text, label) => {
    expect(hardOf(topic, text).join("\n")).toMatch(label);
  });

  it.each(PASSES)("%s passes %s", (topic, text) => {
    expect(hardOf(topic, text)).toEqual([]);
  });

  it("lets a year and month the facts give through (C4's 대운 change), and no other", () => {
    expect(hardOf("career", "2027년 8월 무렵 대운이 바뀌어요.", "C4")).toEqual([]);
    expect(hardOf("career", "2027년 8월 무렵 대운이 바뀌어요.", "C1").join()).toMatch(/달·계절로 시기를 짚은 문장/);
  });

  it("runs only the topic's own checks", () => {
    expect(hardOf("money", "합격해요.")).toEqual([]);
    expect(hardOf("career", "재물운이 약해요.")).toEqual([]);
  });

  it("lets a follow-up answer quote the user's own question", () => {
    const f = factsFor("career");
    const answer = {
      kind: "clarify" as const,
      answer:
        "3월에 이직해도 될지는 이 풀이로 말하기 어려워요. 다만 일간 병화(丙火)는 하늘의 해에 비유하는 글자라서, 맡은 일을 내 방식으로 정리할 때 힘이 붙는 편으로 읽어요. 이번 주에는 지금 하는 일 가운데 하나를 골라 순서를 바꿔 해 보고, 그때 마음이 어땠는지 견주어 보세요. 옮긴다면 배울 거리를, 남는다면 맡을 일을 기준으로 두 길을 놓고 정해 보세요.",
    };
    expect(validateSajuTopicFollowUp(answer, f, "3월에 이직해도 될까요?").filter((v) => !isSoftViolation(v))).toEqual([]);
    expect(validateSajuTopicFollowUp(answer, f, "이직해도 될까요?").join()).toMatch(/달·계절로 시기를 짚은 문장/);
  });
});

// ---- Fix round 1 (Bundle A review): near-variants of the banned promises, verdicts and orders, and four false positives ----

/** Near-variants that passed with 0 hard violations, their closest siblings, and guards that must stay caught. */
const NEAR_CAUGHT: Array<[SajuTopicId, string, RegExp]> = [
  ["reunion", "재회 가능성이 높아요.", /재회를 판정한 문장/],
  ["reunion", "다시 인연이 이어질 가능성이 커요.", /재회를 판정한 문장/],
  ["reunion", "다시 인연이 이어질 거예요.", /재회를 판정한 문장/],
  ["reunion", "재회의 가능성이 있어요.", /재회를 판정한 문장/],
  ["reunion", "그 사람을 다시 만날 가능성이 높아요.", /재회를 판정한 문장/],
  ["reunion", "다시 이어질 수 있어요.", /재회를 판정한 문장/],
  ["love", "머지않아 좋은 사람이 나타날 거예요.", /만남·이별을 예언한 문장/],
  ["love", "올해 안에 인연을 만날 수 있어요.", /만남·이별을 예언한 문장/],
  ["love", "좋은 사람이 곧 나타나요.", /만남·이별을 예언한 문장/],
  ["love", "귀인을 만날 거예요.", /만남·이별을 예언한 문장/],
  ["love", "새로운 인연을 만날 수도 있어요.", /만남·이별을 예언한 문장/],
  ["career", "이번 시험에는 합격하실 거예요.", /합격·승진을 판정한 문장/],
  ["career", "이번에는 승진하실 수 있어요.", /합격·승진을 판정한 문장/],
  ["career", "이번 면접에는 붙으실 거예요.", /합격·승진을 판정한 문장/],
  ["career", "이번 시험에는 붙어요.", /합격·승진을 판정한 문장/],
  ["career", "지금은 이직을 하는 편이 좋아요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "퇴사를 추천해요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "이직을 권해요.", /이직·퇴사를 정해 주는 문장/],
  // guards: what the four false-positive fixes must not let through ("편이에요" is no hedge for another person's mind)
  ["career", "팀장은 성격이 급한 편이에요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "그 사람은 마음을 잘 표현하지 않는 편이에요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "그 사람은 아직 마음이 있어요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "그 사람 마음은 확실해요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "그 사람의 마음에는 아직 당신이 있어요.", /다른 사람의 마음을 단정한 문장/],
  ["reunion", "그는 아직 마음이 있어요.", /다른 사람의 마음을 단정한 문장/],
  ["career", "팀장님의 성격은 꼼꼼한 편이에요.", /다른 사람의 마음을 단정한 문장/],
  ["love", "썸 상대는 아직 당신에게 마음이 확실해요.", /다른 사람의 마음을 단정한 문장/],
  ["career", "10년 후에 달라져요.", /시기를 지정한 문장/],
];

/** The four false positives of the review, the same shapes in other words, and neighbours of the new catches. */
const NEAR_PASSES: Array<[SajuTopicId, string]> = [
  ["career", "일에 속도가 붙어요."],
  ["career", "회사 사람과 부딪히는 장면에서 내 마음이 먼저 굳는 편이에요."],
  ["career", "지금의 10년 후반에는"],
  ["career", "지금의 10년 후반에는 일의 방식이 조금씩 달라져요."],
  ["love", "상대의 명식은 읽지 않았어요."],
  ["career", "회사 사람 앞에서는 제 마음이 먼저 굳는 편이에요."],
  // the reader's own mind without "내"/"제": an object, a place, a cause or a verb stands between the person and "마음"
  ["career", "상사 앞에서는 마음이 먼저 굳는 편이에요."],
  ["career", "동료의 말에 마음이 흔들리는 편이에요."],
  ["reunion", "헤어진 사람이 떠오를 때 마음이 머무는 자리가 있어요."],
  ["reunion", "그 사람을 떠올릴 때 마음이 먼저 가라앉는 편이에요."],
  ["reunion", "그 사람 생각이 날 때 마음이 머무는 곳이 있어요."],
  ["reunion", "헤어진 사람이 생각날 때 마음이 먼저 움츠러드는 편이에요."],
  ["love", "썸 상대의 연락을 기다릴 때 마음이 조급해지는 편이에요."],
  ["reunion", "그 사람의 마음을 읽으려고 애쓰는 편이에요."],
  ["reunion", "그 사람 마음을 신경 쓰는 편이에요."],
  ["reunion", "그 마음은 소중한 감정이에요."],
  ["love", "상대의 사주나 띠는 묻지 않고 내 명식만 읽었어요."],
  ["love", "새로운 사람을 만날 수 있는 자리를 하나 더 만들어 보세요."],
  ["love", "새로운 사람을 만날 때 먼저 거리를 재는 편이에요."],
  ["love", "마음에 드는 사람이 나타나도 먼저 다가가기까지 시간이 걸리는 편이에요."],
  ["reunion", "재회 가능성은 이 풀이로 말하기 어려워요."],
  ["career", "이직을 추천하지도 말리지도 않아요."],
  ["career", "이직을 권하지 않고 두 길을 견줄 기준만 줘요."],
  ["career", "이직을 하는 편이 아니라 오래 머무는 편이에요."],
];

describe("§8.2 near-variants of the banned promises, verdicts and orders (fix round 1)", () => {
  it.each(NEAR_CAUGHT)("%s catches %s", (topic, text, label) => {
    expect(hardOf(topic, text).join("\n")).toMatch(label);
  });

  it.each(NEAR_PASSES)("%s passes %s", (topic, text) => {
    expect(hardOf(topic, text)).toEqual([]);
  });
});

describe("the same sentences inside a whole reading and a follow-up answer (fix round 1)", () => {
  /** A clean mock reading with one sentence added to 4절 (the time checks read it too), judged by the whole reading validator. */
  const readingHard = (topic: SajuTopicId, sentence = "") => {
    const f = factsFor(topic);
    const reading = mockSajuTopicReading(f);
    if (sentence) reading.sections[3]!.body += ` ${sentence}`;
    return validateSajuTopicReading(reading, f).filter((v) => !isSoftViolation(v));
  };

  it.each(["love", "reunion", "career"] as const)("the clean %s mock reading has no hard violation", (topic) => {
    expect(readingHard(topic)).toEqual([]);
  });

  it.each(NEAR_CAUGHT)("%s catches %s", (topic, text, label) => {
    expect(readingHard(topic, text).join("\n")).toMatch(label);
  });

  it.each(NEAR_PASSES)("%s passes %s", (topic, text) => {
    expect(readingHard(topic, text)).toEqual([]);
  });

  it("holds for a follow-up answer too", () => {
    const f = factsFor("career");
    const question = "올해 무엇부터 해 보면 좋을까요?";
    const answer = mockSajuTopicFollowUp(f, question);
    expect(validateSajuTopicFollowUp(answer, f, question).filter((v) => !isSoftViolation(v))).toEqual([]);
    const pushed = { ...answer, answer: `${answer.answer} 지금은 이직을 하는 편이 좋아요.` };
    expect(validateSajuTopicFollowUp(pushed, f, question).join()).toMatch(/이직·퇴사를 정해 주는 문장/);
  });
});
