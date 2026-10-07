import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuTopicId } from "@/lib/reading/types";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { mockSajuTopicFollowUp, mockSajuTopicReading, mockSajuTopicTeaser } from "./mockSajuTopics";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { isSoftViolation } from "./style";
import { topicHardViolations, validateSajuTopicFollowUp, validateSajuTopicReading, validateSajuTopicTeaser } from "./validateSajuTopics";

const NOW = Date.parse(golden.evalNow);
const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const factsFor = (topic: SajuTopicId, id = "C1") => buildTopicFactSet(chartOf(id), NOW, topic);
const hardOf = (topic: SajuTopicId, text: string, id = "C1") => {
  const out: string[] = [];
  topicHardViolations({ whole: text, timing: text }, factsFor(topic, id), out);
  return out;
};
/** A clean mock reading with one sentence added to 4절 (the time checks read it too), or with other follow-up questions, judged by the whole reading validator. */
const readingHard = (topic: SajuTopicId, sentence = "", followUps?: string[]) => {
  const f = factsFor(topic);
  const reading = mockSajuTopicReading(f);
  if (sentence) reading.sections[3]!.body += ` ${sentence}`;
  if (followUps) reading.followUps = followUps;
  return validateSajuTopicReading(reading, f).filter((v) => !isSoftViolation(v));
};
/** A clean mock follow-up answer with one sentence added, judged against the question the user asked. */
const followHard = (topic: SajuTopicId, question: string, sentence = "") => {
  const f = factsFor(topic);
  const answer = mockSajuTopicFollowUp(f, question);
  return validateSajuTopicFollowUp({ ...answer, answer: sentence ? `${answer.answer} ${sentence}` : answer.answer }, f, question).filter((v) => !isSoftViolation(v));
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

// ---- Fix round 2 (re-review of fix round 1): another person's mind, stems bound to their ending, hypothetical encounters, "~지 않아도" ----

/** Claims about another person's mind: the review's sentences first (the first fix let them through), then the same shapes in other words and about other people. */
const MIND_CAUGHT: Array<[SajuTopicId, string]> = [
  ["reunion", "그 사람도 같은 마음일 거예요."],
  ["reunion", "상대방도 당신과 같은 마음이에요."],
  ["reunion", "그 사람은 지금도 당신을 생각하고 있어요."],
  ["reunion", "그 사람도 당신 생각을 하고 있을 거예요."],
  ["reunion", "그 사람은 분명 당신에게 미안한 마음이 있어요."],
  ["career", "상사는 당신을 인정하는 성격이에요."],
  ["reunion", "그 사람은 당신 앞에서는 마음이 확실해요."],
  ["reunion", "그 사람은 속으로는 여전히 마음이 남아 있어요."],
  ["reunion", "그 사람은 당신을 향한 마음이 확실해요."],
  ["reunion", "그 사람 쪽에서도 마음이 남아 있어요."],
  ["reunion", "그 사람이 지금 이 순간에도 마음이 있어요."],
  ["reunion", "그 사람은 지금 이 순간에도 당신 생각을 하고 있어요."],
  ["reunion", "상대방은 지금 당신 생각이 확실해요."],
  ["reunion", "그 사람은 겉으로는 차가워도 마음은 따뜻한 사람이에요."],
  ["career", "동료는 당신에게 호감이 있는 마음이에요."],
  ["love", "썸 상대는 당신을 향한 마음이 확실해요."],
  ["reunion", "그 사람은 당신을 대하는 마음이 진심이에요."],
  ["reunion", "그 사람은 당신을 아끼는 마음이 확실해요."],
  ["reunion", "그 사람은 당신과 이어지고 싶은 마음이 있어요."],
  ["reunion", "그 사람은 당신에게 서운한 마음이 있어요."],
  ["reunion", "그 사람은 이별 후에도 당신을 향한 마음이 분명해요."],
  ["reunion", "그 사람은 당신을 놓지 못하는 마음이에요."],
  ["reunion", "헤어진 사람은 당신에게 미안한 마음이 남아 있어요."],
  ["career", "팀장님은 당신을 아끼는 마음이 있어요."],
  ["career", "상사는 당신의 일을 인정하는 마음이 확실해요."],
  ["career", "동료는 당신을 믿는 마음이 분명해요."],
  ["reunion", "그 사람도 속으로는 같은 마음이에요."],
  ["reunion", "그 사람도 지금쯤 마음이 흔들리고 있을 거예요."],
  ["reunion", "그 사람은 이별 후에도 마음이 확실해요."],
  ["reunion", "그 사람은 속으론 마음이 있어요."],
  ["reunion", "그 사람은 분명히 당신에게 마음이 있어요."],
  ["reunion", "그 사람도 분명히 마음이 남아 있어요."],
  ["reunion", "그 사람도 헤어진 뒤에 마음이 많이 힘들 거예요."],
  ["reunion", "헤어진 사람은 겉으로는 담담해도 마음이 복잡할 거예요."],
  ["reunion", "그 사람은 당신 앞에서만 진심이 확실해요."],
  ["reunion", "그 사람은 요즘 당신 생각이 많아요."],
  ["reunion", "상대방은 지금도 당신 생각을 해요."],
  ["love", "썸 상대도 지금 당신과 같은 마음이에요."],
  ["love", "애인은 당신을 향한 마음이 확실해요."],
  ["reunion", "그 사람 쪽에서도 당신을 향한 마음이 확실해요."],
  ["career", "상사는 속으로는 당신을 믿는 마음이 있어요."],
  ["career", "동료는 당신에게 질투하는 마음이 있어요."],
  ["reunion", "그 사람은 정말 당신을 아끼는 마음이에요."],
  ["reunion", "그 사람은 당신에 대해 생각하고 있을 거예요."],
  ["reunion", "그 사람은 미안한 마음이 있어요."],
  ["reunion", "그 사람도 후회하는 마음이 있을 거예요."],
  ["reunion", "헤어진 사람은 그리워하는 마음이 있어요."],
  ["career", "상사는 아끼는 마음이 있어요."],
  ["love", "썸 상대는 설레는 마음이 있어요."],
  ["reunion", "그 사람은 아직도 후회하는 마음이 있어요."],
  ["reunion", "그 사람도 불안한 마음일 거예요."],
];

/**
 * The reader's own mind with another person in the scene, a hedge, a wish and a question. The first block is what the review found passing; the
 * rest are the shapes a gap of any words (instead of a claim shape) between the person and "마음" would flag.
 */
const MIND_PASSES: Array<[SajuTopicId, string]> = [
  ["reunion", "헤어진 사람이 자꾸 떠오르는 건 마음이 아직 머물고 있다는 뜻이에요."],
  ["reunion", "그 사람을 생각하면 마음이 먼저 가라앉는 편이에요."],
  ["reunion", "그 사람과 있을 때의 내 마음을 먼저 적어 보세요."],
  ["reunion", "그 사람의 연락을 기다리는 동안 마음이 조급해지는 편이에요."],
  ["reunion", "그 사람의 마음을 읽으려고 애쓰다 보면 내 마음이 먼저 지쳐요."],
  ["reunion", "헤어진 사람이 생각나는 밤에는 마음이 먼저 움직이는 편이에요."],
  ["reunion", "전 연인과 주고받은 말이 떠오를 때 마음이 먼저 굳는 편이에요."],
  ["reunion", "그 사람이 떠난 뒤로 마음이 비어 있는 느낌이 있어요."],
  ["reunion", "그 사람이 아직 마음에 남아 있다면 천천히 정리해 봐요."],
  ["reunion", "그 사람이 내 마음에 남긴 말이 있어요."],
  ["reunion", "그 사람이 마음을 흔들 때도 내 하루를 먼저 지키는 편이에요."],
  ["reunion", "그 사람 얘기만 나오면 마음이 먼저 움츠러드는 편이에요."],
  ["reunion", "그 사람에게 마음을 쓰는 만큼 나에게도 마음을 써 보세요."],
  ["reunion", "그 사람이 보낸 마지막 말에 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람이 없는 하루에도 내 마음이 쉴 자리가 있어요."],
  ["reunion", "그 사람이 생각날 때 마음이 어디에 머무는지 적어 보는 편이에요."],
  ["love", "썸 상대의 말투에 내 마음이 먼저 흔들리는 편이에요."],
  ["love", "연애 중에는 상대의 감정을 살피느라 내 마음을 놓치는 편이에요."],
  ["love", "썸이 애매할 때는 상대에게 마음이 있는지부터 확인하려는 편이에요."],
  ["love", "상대가 연락을 늦게 해도 내 마음을 먼저 들여다보는 편이에요."],
  ["love", "애인과 다투고 나면 마음이 먼저 닫히는 편이에요."],
  ["love", "상대가 내 마음을 몰라줄 때 말을 아끼는 편이에요."],
  ["love", "상대방의 마음을 확인하기 전에 내 마음부터 정리하는 편이에요."],
  ["love", "애인에게 마음을 다 주고 나서야 불안해지는 편이에요."],
  ["career", "상사가 지시할 때 내 마음이 먼저 굳는 편이에요."],
  ["career", "팀장님이 부르면 마음이 철렁하는 편이에요."],
  ["career", "동료의 말에 마음이 흔들리는 편이에요."],
  ["career", "회사 사람들 사이에서는 마음이 편한 쪽을 고르는 편이에요."],
  ["career", "상사와의 대화에서 마음이 먼저 굳는 편이에요."],
  ["career", "동료 눈치를 보느라 마음이 쉽게 지치는 편이에요."],
  ["career", "회사 사람 때문에 마음이 무거운 날이 있어요."],
  ["career", "상사 앞에서는 마음이 먼저 굳는 편이에요."],
  ["career", "동료와 의견이 부딪히면 마음이 먼저 닫히는 편이에요."],
  ["career", "상사의 성격보다 내 일의 기준을 먼저 세우는 편이에요."],
  ["career", "회사 사람과 부딪히는 날에는 내 마음을 먼저 챙겨요."],
  // a person is the subject of a clause of the reader's scene; a topic particle; the reader addressed as 당신
  ["reunion", "헤어진 사람이 문득 떠오르는 건 마음이 머물던 자리가 있다는 뜻이에요."],
  ["reunion", "그 사람이 보낸 편지를 다시 읽는 날에는 마음이 오래 무거운 편이에요."],
  ["reunion", "헤어진 사람이 잘 지낸다는 얘기에 마음이 철렁하는 편이에요."],
  ["reunion", "그 사람이 떠올라도 마음이 흔들리지 않는 날이 있어요."],
  ["reunion", "헤어진 사람이 자꾸 생각이 나는 건 마음이 아직 정리 중이라는 신호예요."],
  ["love", "썸 상대가 답장을 늦게 해도 마음이 크게 흔들리지 않는 편이에요."],
  ["love", "애인이 바쁜 주에는 마음이 먼저 불안해지는 편이에요."],
  ["career", "상사가 지시한 일이 많아도 마음이 흔들리지 않는 편이에요."],
  ["career", "팀장님이 칭찬해 주는 날에는 마음이 가벼워지는 편이에요."],
  ["career", "동료가 늘어난 날에는 마음이 한결 편해지는 편이에요."],
  ["career", "상사가 있는 자리에서는 성격이 조금 달라지는 편이에요."],
  ["career", "회사 사람이 던진 말 한마디에 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람은 떠났지만 마음은 아직 그 자리에 머물러 있어요."],
  ["reunion", "헤어진 사람은 멀어졌지만 마음은 쉽게 정리되지 않는 편이에요."],
  ["career", "상사는 바뀌었지만 마음이 편해지는 데는 시간이 걸리는 편이에요."],
  ["love", "썸 상대는 그대로인데 마음이 먼저 앞서가는 편이에요."],
  ["love", "애인은 바쁘지만 마음이 서운한 건 어쩔 수 없는 일이에요."],
  ["reunion", "그 사람은 잘 지낸다고 해도 마음이 놓이지 않는 편이에요."],
  ["reunion", "그 사람도 나도 마음이 정리되는 데 시간이 걸리는 편이에요."],
  ["reunion", "그 사람이 당신에게 건넨 말에 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람이 당신에게 남긴 말이 마음에 오래 남아 있어요."],
  ["reunion", "그 사람이 당신을 부를 때 마음이 철렁하는 편이에요."],
  ["career", "상사가 당신에게 일을 맡긴 날에는 마음이 먼저 굳는 편이에요."],
  ["reunion", "그 사람이 떠난 뒤 당신은 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람이 당신에게 이별을 말한 순간의 마음이 아직 남아 있어요."],
  ["reunion", "그 사람이 이별 후에 보낸 연락에 마음이 흔들리는 편이에요."],
  ["reunion", "그 사람이 겉으로는 괜찮아 보여도 내 마음은 쉽게 놓이지 않는 편이에요."],
  ["reunion", "그 사람이 같은 말을 반복할 때마다 마음이 먼저 지치는 편이에요."],
  ["career", "동료가 같은 실수를 반복하면 마음이 먼저 굳는 편이에요."],
  ["reunion", "당신을 향한 마음이 흔들릴 때는 일상의 리듬부터 지켜요."],
  ["reunion", "당신에게 생각해 볼 질문 하나를 드려요."],
  ["reunion", "당신에 대해 생각해 보면 일지의 결이 먼저 보여요."],
  ["reunion", "그 사람이 당신에게 이별을 말한 뒤로 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람이 당신을 떠난 뒤로 마음이 오래 머무는 편이에요."],
  ["reunion", "그 사람이 당신에게 한 말 때문에 마음이 오래 무거운 편이에요."],
  ["reunion", "그 사람이 당신에게 건넨 마지막 말이 후회로 마음에 남아 있어요."],
  ["career", "당신은 상사가 지시한 일이 많을수록 마음이 차분해지는 편이에요."],
  ["love", "일지가 가까운 관계의 자리라서, 애인이 다가오는 속도에 내 마음이 먼저 반응하는 편이에요."],
  ["love", "관계에서 상대가 더 많이 표현하면 마음이 오히려 물러서는 편이에요."],
  ["reunion", "헤어진 사람의 소식을 들은 날에는 마음이 하루 종일 머무는 편이에요."],
  ["reunion", "전 연인이 잘 지낸다는 소식을 들으면 마음이 복잡해지는 편이에요."],
  ["reunion", "그 사람이 남긴 말을 곱씹는 동안 마음이 쉽게 지치는 편이에요."],
  ["career", "회사 사람이 많은 자리에서는 성격이 조금 조용해지는 편이에요."],
  ["career", "동료와 비교될 때 마음이 먼저 움츠러드는 편이에요."],
  ["career", "동료가 건네는 마음이 고마운 편이에요."],
  ["love", "썸 상대가 보내는 마음이 조금 부담스러운 편이에요."],
  ["reunion", "헤어진 사람이 남긴 마음이 오래 가는 편이에요."],
  ["reunion", "그 사람이 주는 마음이 큰 날이 있어요."],
  // wondering, wishing and hedging about the other person's mind is not claiming it
  ["reunion", "그 사람도 같은 마음일까 궁금한 날이 있어요."],
  ["reunion", "그 사람도 같은 마음이면 좋겠다는 생각이 들 때가 있어요."],
  ["reunion", "그 사람도 같은 마음이었으면 좋겠다고 바라는 마음이 있어요."],
  ["reunion", "그 사람이 지금쯤 마음이 어떨지 궁금한 날이 있어요."],
  ["reunion", "헤어진 사람이 속으로는 어떤 마음일지 궁금한 건 자연스러운 일이에요."],
  ["reunion", "그 사람이 후회하는 마음이 있는지 확인하고 싶어지는 날이 있어요."],
  ["reunion", "그 사람이 당신에게 미안한 마음이 있는지 궁금한 건 자연스러워요."],
  ["reunion", "그 사람이 당신을 향한 마음이 남아 있는지 따져 보기보다 내 하루를 먼저 살펴봐요."],
  ["career", "상사가 당신을 인정하는 성격인지 헤아리기보다 내 기준을 먼저 세워요."],
  ["reunion", "그 사람이 같은 마음이라고 믿고 싶은 마음이 있어요."],
  ["reunion", "그 사람도 같은 마음일 수 있어요."],
  ["reunion", "그 사람이 당신을 생각하고 있을지도 몰라요."],
  ["reunion", "그 사람의 마음은 이 풀이로 알 수 없어요."],
];

describe("§8.2 another person's mind: the claims the first fix let through are caught again, the reader's own scene still passes (fix round 2)", () => {
  it.each(MIND_CAUGHT)("%s catches %s", (topic, text) => {
    const label = /다른 사람의 마음을 단정한 문장/;
    expect(hardOf(topic, text).join("\n")).toMatch(label);
    expect(readingHard(topic, text).join("\n")).toMatch(label);
    expect(followHard(topic, "그 사람 마음은 어떨까요?", text).join("\n")).toMatch(label);
  });

  it.each(MIND_PASSES)("%s passes %s", (topic, text) => {
    expect(hardOf(topic, text)).toEqual([]);
    expect(readingHard(topic, text)).toEqual([]);
    expect(followHard(topic, "마음 정리는 어디서부터 할까요?", text)).toEqual([]);
  });
});

/** "가능성" and the verdict words only count with their ending: "재회 가능성이 높아요" is a verdict, "재회 가능성은 알 수 없어요" is not. */
const POSSIBILITY_CAUGHT: Array<[SajuTopicId, string, RegExp]> = [
  ["reunion", "재회 가능성이 없어요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 낮아요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 높은 편이에요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 높지 않아요.", /재회를 판정한 문장/],
  ["reunion", "재회할 가능성이 높아요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 열려 있어요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 엿보여요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 전혀 없어요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 안 보여요.", /재회를 판정한 문장/],
  ["reunion", "다시 이어질 가능성이 충분히 있어요.", /재회를 판정한 문장/],
  ["reunion", "그 사람을 다시 만날 가능성이 커요.", /재회를 판정한 문장/],
  ["career", "이직하는 편이 나아요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "퇴사하는 편이 낫겠어요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "지금은 이직하는 편이 더 좋겠어요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "이직을 추천해 드려요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "퇴사를 권해 드립니다.", /이직·퇴사를 정해 주는 문장/],
];

/** Declines, an aside and questions that name the same stems. */
const POSSIBILITY_PASSES: Array<[SajuTopicId, string]> = [
  ["reunion", "재회 가능성은 알 수 없어요."],
  ["reunion", "재회 가능성을 점치지 않아요."],
  ["reunion", "재회 가능성을 따져 보기보다 지금 내 리듬을 먼저 살펴봐요."],
  ["reunion", "재회 가능성이 자꾸 마음에 걸리는 건 자연스러워요."],
  ["reunion", "재회 가능성은 어떻게 봐요?"],
  ["reunion", "다시 이어질 가능성이 있을까요?"],
  ["reunion", "재회 가능성이 있나요?"],
  ["reunion", "재회 가능성이 높을까요?"],
  ["career", "이직하는 편이 좋은지는 이 풀이로 말하기 어려워요."],
  ["career", "이직하는 편이 나은지는 정해 드릴 수 없어요."],
  ["career", "이직을 추천해 드리지는 않아요."],
  ["career", "퇴사를 권해 드리지 않고 기준만 드려요."],
  ["career", "이직을 추천할 수는 없어요."],
  ["career", "이직하는 편이 좋을까요?"],
  ["career", "지금 퇴사하는 편이 나을까요?"],
];

/** A verdict hidden behind the words of the user's own question: the answer's matched text must not be a piece of the question. */
const ECHOES: Array<[SajuTopicId, string, string, RegExp]> = [
  ["reunion", "재회 가능성이 있나요?", "재회 가능성이 높아요.", /재회를 판정한 문장/],
  ["reunion", "재회 가능성이 있나요?", "재회 가능성이 없어요.", /재회를 판정한 문장/],
  ["reunion", "다시 이어질 가능성이 있나요?", "다시 이어질 가능성이 커요.", /재회를 판정한 문장/],
  ["career", "지금 이직을 하는 편이 좋을까요?", "지금은 이직을 하는 편이 좋아요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "이직하는 편이 나을까요?", "이직하는 편이 나아요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "퇴사를 추천하시나요?", "퇴사를 추천해요.", /이직·퇴사를 정해 주는 문장/],
  ["career", "이직을 권하시나요?", "이직을 권해요.", /이직·퇴사를 정해 주는 문장/],
];

describe("§8.2 stems bound to the ending of the verdict (fix round 2)", () => {
  it.each(POSSIBILITY_CAUGHT)("%s catches %s", (topic, text, label) => {
    expect(hardOf(topic, text).join("\n")).toMatch(label);
    expect(readingHard(topic, text).join("\n")).toMatch(label);
    expect(followHard(topic, "올해 무엇부터 해 보면 좋을까요?", text).join("\n")).toMatch(label);
  });

  it.each(POSSIBILITY_PASSES)("%s passes %s", (topic, text) => {
    expect(hardOf(topic, text)).toEqual([]);
    expect(readingHard(topic, text)).toEqual([]);
    expect(followHard(topic, "마음 정리는 어디서부터 할까요?", text)).toEqual([]);
  });

  it.each(ECHOES)("%s: a follow-up answer cannot hide behind the question's words (Q %s | A %s)", (topic, question, answer, label) => {
    expect(followHard(topic, question, answer).join("\n")).toMatch(label);
  });

  it.each([
    ["reunion", ["재회 가능성은 어떻게 봐요?", "다시 이어질 가능성이 있을까요?"]],
    ["career", ["이직하는 편이 좋을까요?", "지금 퇴사하는 편이 나을까요?"]],
  ] as const)("%s: followUps written as questions are not verdicts (%j)", (topic, followUps) => {
    expect(readingHard(topic, "", [...followUps])).toEqual([]);
  });
});

describe("§8.2 a hypothetical encounter is not a promise, a concession that goes on to a verdict is not a decline (fix round 2)", () => {
  it.each([
    ["love", "새로운 사람을 만날 거라면 먼저 속도를 정해 두세요."],
    ["love", "좋은 사람이 나타날 거면 먼저 속도를 정해 두세요."],
    ["love", "새로운 인연을 만날 것이라면 먼저 거리를 재는 방식부터 살펴봐요."],
    ["love", "새로운 인연을 만날 가능성은 이 풀이로 말하기 어려워요."],
    ["love", "새로운 사람을 만날 가능성이 있다면 먼저 속도를 정해 두세요."],
    ["love", "상대의 사주는 묻지 않아도 돼요."],
    ["love", "상대의 사주는 묻지 않아도 괜찮아요, 내 명식만 읽어요."],
    ["love", "상대의 명식은 읽지 않았어요."],
    ["love", "상대의 사주나 띠는 묻지 않고 내 명식만 읽었어요."],
    ["reunion", "재회가 된다고 약속하지 않아요."],
  ] as const)("%s passes %s", (topic, text) => {
    expect(hardOf(topic, text)).toEqual([]);
    expect(readingHard(topic, text)).toEqual([]);
  });

  it.each([
    ["love", "새로운 사람을 곧 만날 거예요.", /만남·이별을 예언한 문장/],
    ["love", "좋은 사람이 나타날 거예요. 그때는 속도를 정해 두세요.", /만남·이별을 예언한 문장/],
    ["love", "새로운 인연을 만날 것 같아요.", /만남·이별을 예언한 문장/],
    ["love", "새로운 인연을 만날 가능성이 높아요.", /만남·이별을 예언한 문장/],
    ["reunion", "묻지 않아도 재회하게 돼요.", /재회를 판정한 문장/],
    ["reunion", "묻지 않아도 되고 재회하게 돼요.", /재회를 판정한 문장/],
    ["reunion", "읽지 않아도 다시 이어질 거예요.", /재회를 판정한 문장/],
    ["reunion", "신경 쓰지 않아도 그 사람이 돌아올 거예요.", /재회를 판정한 문장/],
    ["love", "상대의 명식을 읽지 않아도 궁합이 보여요.", /상대의 정보를 다룬 문장/],
    ["love", "그 사람의 사주를 읽지 않아도 알 수 있어요.", /상대의 정보를 다룬 문장/],
  ] as const)("%s catches %s", (topic, text, label) => {
    expect(hardOf(topic, text).join("\n")).toMatch(label);
    expect(readingHard(topic, text).join("\n")).toMatch(label);
  });
});

describe("a 연애운·재회운 teaser that carries the day-pillar window (review 2026-10-08)", () => {
  // C1, time unknown: "00:00~00:32 사이에 태어났다면 일주가 전날 일진인 乙丑(을축)이 돼요." (丑 is not the chart's)
  const f = factsFor("love");
  const glyphs = (extra: string) => {
    const teaser = mockSajuTopicTeaser(f);
    return validateSajuTopicTeaser({ ...teaser, summary: `${teaser.summary} ${extra}` }, f).filter((v) => v.startsWith("명식에 없는 간지 글자"));
  };

  it("passes the window's glyphs in its own words beside its time, as well as word for word", () => {
    expect([f.dayWindow?.range, f.allowed.limitGlyphs]).toEqual(["00:00~00:32", ["丑"]]);
    expect(glyphs(f.dayWindow!.sentence)).toEqual([]);
    expect(glyphs("00:00~00:32 사이에 태어났다면 일주가 을축(乙丑)으로 바뀌어 일지도 축토(丑土)가 돼요.")).toEqual([]);
  });

  it("fails them without the window's time, and a 간지 the window does not name even beside it", () => {
    expect(glyphs("일지는 축토(丑土)로 읽어요.").join(" ")).toContain("丑");
    expect(glyphs("00:00~00:32 사이에 태어났다면 일주가 갑신(甲申)이 돼요.").join(" ")).toContain("申");
  });
});
