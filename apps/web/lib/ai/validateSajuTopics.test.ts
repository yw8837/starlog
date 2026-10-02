import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuTopicId } from "@/lib/reading/types";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { isSoftViolation } from "./style";
import { topicHardViolations, validateSajuTopicFollowUp } from "./validateSajuTopics";

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
