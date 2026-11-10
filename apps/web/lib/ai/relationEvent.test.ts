import { readFileSync, readdirSync } from "node:fs";
import golden from "@content/eval/saju-topics/golden.json";
import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { mockSajuTopicReading } from "./mockSajuTopics";
import { buildFactSet } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { generateValidated, type ReadingProvider } from "./provider";
import { OneCardTeaserDraftSchema } from "./schemas";
import { RELATION_EVENT_PREFIX, SOFT_PREFIX, isSoftViolation, softWarrantsRegeneration } from "./style";
import { allowedFactViolations, relationEventSentences, sentences } from "./validate";
import { validateSajuTopicReading } from "./validateSajuTopics";

/**
 * 합·충·형·파·해 read as an event (spec 2026-11-11, 정통 사주에 충·합 … 안: "검증기 추가"; independent review of 30babdf): a
 * [문체] finding that is logged and measured only, as the voice findings were introduced. It never fails a reading, never makes a
 * regeneration and never counts toward the ≥3 rule, so a paid reading is never hurt by it. It needs a relation (its name, a
 * joined name like 자오충, or the plain words the prompts teach) and an event word carrying its own predicate ("이별수가 있",
 * "이사하게 돼", "사고가 나"); the user's own topic words (재회운, 이직·퇴사를 고민 중이에요) do not count.
 */

const allowed = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-11-11T12:00:00+09:00")).allowed;
const findings = (text: string, userText = "") => {
  const out: string[] = [];
  allowedFactViolations(text, allowed, out, userText);
  return out;
};
const relationFindings = (text: string, userText = "") => findings(text, userText).filter((line) => line.includes("관계를 사건으로"));
const hard = (found: string[]) => found.filter((v) => !isSoftViolation(v));

/** The review's true event readings (cases.json) and the first rule's own. */
const EVENT_READINGS = [
  "충이 있어서 이별수가 있어요.",
  "합이 들어오면 결혼할 수 있어요.",
  "子午충 때문에 올해 이사할 수 있어요.",
  "자오충이 있어서 이별수가 있어요.",
  "인신충(寅申沖)이 들어오면 사고를 조심하세요.",
  "정면으로 맞서는 배치가 있어서 올해는 이별할 수 있어요.",
  "충이 있어서 올해 이별수가 있어요.",
  "일지와 월지가 충이라서 이사를 하게 돼요.",
  "충 때문에 사고를 조심하세요.",
  "육합이 있어서 재회할 거예요.",
  "형(刑)이 있으니 수술을 조심하세요.",
  "해(害)가 있으면 구설이 생겨요.",
  "삼합으로 인해 이직하게 될 거예요.",
  "충(沖) 탓에 헤어질 수 있어요.",
  "묶이려는 짝(합)이 들어오니 결혼운이 있어요.",
  "子丑合이 있어서 이사수가 보여요.",
  "갑경충이 들어오는 해라 부상을 조심하세요.",
];

/** Every sentence the review found wrongly failed (cases.json, cases2.json): no relation, a relation as a fact, or a decline. */
const REVIEW_PASSES = {
  noRelationWord: [
    "충분히 쉬어 가면 이사 준비도 덜 버거울 수 있어요.",
    "두 사람의 생각을 합쳐 보면 이직 시기를 정하는 데 도움이 될 수 있어요.",
    "이사회에서 의견을 낼 때 말을 고르는 편이라 오해가 생길 수 있어요.",
    "사고방식이 유연한 편이라 이직 제안이 오면 오래 망설이지 않을 수 있어요.",
    "이별을 겪은 뒤에는 혼자 정리할 시간이 필요할 수 있어요.",
    "가족과 합의가 되면 이사 날짜를 정해 볼 수 있어요.",
    "가족과 충분히 합의한 뒤에 이직할 수 있어요.",
    "이직은 가족과 합의한 뒤에 해도 늦지 않아요.",
    "합의가 끝나면 이사할 수 있어요.",
    "둘이 합을 맞추면 이사 준비가 한결 수월해질 수 있어요.",
    "합이 잘 맞는 사람을 만나면 다툼이 생겨도 금방 풀 수 있어요.",
    "자신감이 충만한 시기라 이직 같은 새 도전을 해 볼 수 있어요.",
    "에너지가 충만해서 퇴사 뒤 쉬는 시간도 알차게 보낼 수 있어요.",
    "합격 소식이 들어오면 이사를 서두르게 될 수 있어요.",
    "충격을 받으면 다투기 쉬운 편이라 한 박자 쉬어 가면 좋아요.",
    "합가를 앞두고 이사할 수 있어요.",
    "이사장과 상의한 뒤에 이직할 수 있어요.",
  ],
  relationFact: [
    "일지와 월지가 정면으로 맞서는 배치(충)가 있어서 마음이 자주 바뀔 수 있어요.",
    "子午충이 있어서 사고가 빠르게 바뀌는 편이에요.",
    "충이 있어서 사고의 폭이 넓은 편이에요.",
    "합이 있어서 사고방식이 차분한 편이에요.",
    "충이 있어서 사고력이 날카로운 편이에요.",
    "묶이려는 짝(합)이 있으니 가까운 사람과 다툼보다 대화를 먼저 고르는 편일 수 있어요.",
    "子丑합이 있어서 이사회처럼 여러 사람이 모인 자리에서 조율을 맡게 될 수 있어요.",
  ],
  declines: [
    "충이 있으면 이별한다는 말은 아니에요.",
    "충이 있다고 해서 이사나 이직을 해야 한다는 뜻은 아니에요.",
    "충이 있으면 헤어진다고 볼 수는 없어요.",
    "합이 들어오면 결혼한다고 볼 수는 없어요.",
    "충이 있어서 이별수가 있다는 말은 이 풀이에서 하지 않아요.",
    "충이 있으면 이혼한다는 건 이 풀이로는 말하기 어려워요.",
    "충이 있다고 다툼이 생긴다는 건 사실이 아니에요.",
    "子午충이 있어도 사고나 이사 같은 일과는 상관없어요.",
    "합·충이 있다고 이별이나 이사 같은 일이 생기는 건 아니에요.",
    "충은 이별이나 사고 같은 일을 미리 알려 주는 표시가 아니에요.",
    "충이 있으면 이별수가 있다는 해석은 쓰지 않았어요.",
    "합·충 같은 관계는 사건으로 읽지 않았고, 실제로 묶이는지도 따지지 않았어요.",
    "충이 있어서 이별할 거라는 뜻으로 읽지 않아요.",
  ],
  followUpAnswers: [
    "세운이 일지와 충을 이루니 이사를 미뤄야 한다고 볼 수는 없어요.",
    "충이 들어온다고 이사를 하면 안 된다는 뜻은 아니에요.",
    "올해 충이 들어와서 이직해야 한다는 말은 아니에요.",
    "충이 있으면 이별한다는 이야기는 이 풀이에서 다루지 않아요.",
    "합이 들어오면 결혼한다는 식의 풀이는 쓰지 않았어요.",
    "충이 있어서 이혼할 수 있다는 건 이 풀이로는 말하기 어려워요.",
    "충이 있다고 이사를 해야 하는 건 아니고, 이사는 생활 사정에 따라 정하면 돼요.",
    "합이 들어와도 결혼할 시기를 정해 주지는 않아요.",
    "충이 있어서 헤어질 거라고 단정하지 않아요.",
    "충이 있으니 헤어질 거라고 생각하지 않으셔도 돼요.",
  ],
  // 다툼 is the scene 4절 asks for (a tendency), not an event: the first rule failed these
  sceneStyle: [
    "정면으로 맞서는 배치(충)가 있어서 말이 날카로워지면 다툼이 길어질 수 있어요.",
    "충이 있어서 가까운 사람과 부딪치다 보면 다툼이 생기기도 해요.",
    "일지에 충이 있어 의견이 갈리는 순간이 잦을 수 있고, 그럴 때 다툼보다 한 박자 쉬는 쪽이 편해요.",
    "묶이려는 짝(합)이 있어서 함께 사는 사람과 이사 같은 큰일을 같이 정하고 싶어질 수 있어요.",
    "세운이 일지와 충을 이루니 다툼이 생길 수 있어요.",
  ],
  // the first rule's own passes
  firstRule: [
    "합·충은 사건으로 읽지 않고, 실제로 묶이는지도 따지지 않았어요.",
    "충이 있다고 해서 이별이나 이사를 뜻하지는 않아요.",
    "올해 들어오는 세운이 일지와 충을 이루지만, 이사나 이별 같은 일을 예고하지 않아요.",
    "정면으로 맞서는 배치(충)가 있어서, 마음이 두 갈래로 나뉘는 장면이 떠오를 수 있어요.",
    "묶이려는 짝(육합)처럼 가까운 사람과 일을 나누고 싶은 마음이 커지는 해예요.",
    "이사 같은 큰 결정과는 상관없어요.",
    "해가 바뀌면 이사를 생각하는 분이 많아요.",
    "올해는 이직보다 지금 자리에서 손에 익은 일을 다듬어 보세요.",
    "충분히 쉬고 나서 이사를 정해도 늦지 않아요.",
    "합격 소식을 기다리는 동안 생활 리듬부터 지켜 보세요.",
  ],
};

describe("relation read as an event: a soft finding", () => {
  it.each(EVENT_READINGS)("finds: %s", (sentence) => {
    expect(relationEventSentences(sentence)).toEqual([sentence]);
    const found = relationFindings(sentence);
    expect(found).toHaveLength(1);
    expect(found[0]!.startsWith(RELATION_EVENT_PREFIX)).toBe(true);
    expect(found[0]!.startsWith(SOFT_PREFIX)).toBe(true);
    expect(isSoftViolation(found[0]!)).toBe(true);
    // never hard itself (결혼·재회·수술 or a glyph this chart lacks are other rules, judged as before)
    expect(hard(findings(sentence)).some((v) => v.includes("관계를 사건으로"))).toBe(false);
  });

  for (const [group, list] of Object.entries(REVIEW_PASSES)) {
    it.each(list)(`passes (${group}): %s`, (sentence) => {
      expect(relationEventSentences(sentence)).toEqual([]);
      expect(relationFindings(sentence)).toEqual([]);
    });
  }

  it("names the sentences, so a regeneration made for another reason knows what to change", () => {
    const found = relationFindings(`${REVIEW_PASSES.firstRule[0]} ${EVENT_READINGS[0]}`);
    expect(found[0]).toContain(EVENT_READINGS[0]);
  });

  it("does not count the user's own topic words (재회운, 이직·퇴사를 고민 중이에요, 결혼을 생각 중이에요)", () => {
    expect(relationEventSentences("육합이 있어서 재회할 거예요.", "재회운 헤어진 사람이 자꾸 생각나요")).toEqual([]);
    expect(relationEventSentences("충이 있어서 이직하게 될 거예요.", "직업운 이직·퇴사를 고민 중이에요")).toEqual([]);
    expect(relationEventSentences("합이 들어오면 결혼할 수 있어요.", "연애운 결혼을 생각 중이에요")).toEqual([]);
    // another event in the same reading still counts
    expect(relationEventSentences("충이 있어서 이별수가 있어요.", "직업운 이직·퇴사를 고민 중이에요")).toHaveLength(1);
    expect(relationFindings("충이 있어서 이직하게 될 거예요.", "직업운 이직·퇴사를 고민 중이에요")).toEqual([]);
  });

  it("can never make generateValidated regenerate or fail, alone or with two other soft findings", async () => {
    const task = {
      name: "tarot-teaser" as const, system: "s", user: "u", schema: OneCardTeaserDraftSchema, effort: "low" as const, maxTokens: 10,
      mock: () => ({ cards: [], firstCard: { heading: "h", body: "b" } }),
    };
    const calls: number[] = [];
    const provider: ReadingProvider = {
      name: "mock",
      async generate(_t, attempt) {
        calls.push(attempt);
        return { data: { cards: [], firstCard: { heading: "h", body: `draft-${attempt}` } } as never, usage: [] };
      },
    };
    // event readings that trip no other rule: the relation finding is all the validator says
    const only = EVENT_READINGS.filter((s) => hard(findings(s)).length === 0);
    expect(only.length).toBeGreaterThanOrEqual(5);
    const relation = findings(only.join(" "));
    expect(relation).toHaveLength(1);
    expect(relation[0]!.startsWith(RELATION_EVENT_PREFIX)).toBe(true);
    expect(softWarrantsRegeneration(relation)).toBe(false);
    const alone = await generateValidated(provider, task, () => relation);
    expect(calls).toEqual([1]);
    expect(alone).toMatchObject({ attempts: 1, data: { firstCard: { body: "draft-1" } } });

    const QUOTE = `${SOFT_PREFIX}같은 칩을 두 번 넘게 옮겼어요.`;
    const MOVES = `${SOFT_PREFIX}행동 제안이 비슷하게 되풀이돼요.`;
    expect(softWarrantsRegeneration([...relation, QUOTE, MOVES])).toBe(false);
    calls.length = 0;
    const withTwo = await generateValidated(provider, task, () => [...relation, QUOTE, MOVES]);
    expect(calls).toEqual([1]);
    expect(withTwo.attempts).toBe(1);
  });

  it("no sentence in the samples and golden sets is found", () => {
    const root = new URL("../../../../content/", import.meta.url);
    const files = [
      new URL("samples/saju-prologue.ko.json", root),
      ...readdirSync(new URL("samples/premium/", root)).map((f) => new URL(`samples/premium/${f}`, root)),
      new URL("eval/premium/golden.json", root),
      new URL("eval/saju-topics/golden.json", root),
    ];
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const file of files) walk(JSON.parse(readFileSync(file, "utf8")));
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.flatMap((s) => relationEventSentences(s))).toEqual([]);
    // the patterns are really there to be met: relation names occur in those texts
    expect(strings.flatMap(sentences).filter((s) => /(?<![가-힣])(?:충|합|육합|삼합|방합|천간합)(?:\(|이|은|을|과|와|\s)/.test(s)).length).toBeGreaterThan(0);
  });
});

/**
 * Topic-reading golden sentences with relation names (cases3.json and more), judged by the whole topic validator on a clean mock
 * reading with the sentence added to 4절: no relation finding, and nothing hard that the clean reading does not have.
 */
const TOPIC_GOLDEN: Array<[SajuTopicId, SajuSituationId, string]> = [
  ["reunion", "missing", "일지가 월지와 정면으로 맞서는 짝(충)이라, 다시 이어진다면 같은 일로 다투는 장면이 되풀이될 수 있어요."],
  ["reunion", "missing", "올해 세운이 일지와 묶이려는 짝(합)을 이루니 재회를 떠올리는 마음이 커질 수 있어요."],
  ["reunion", "torn", "지금 대운이 일지와 충을 이루니, 재회를 생각하다가도 마음이 자주 오갈 수 있어요."],
  ["reunion", "torn", "합이 들어오는 해라서 재회를 바라는 마음이 커지기 쉬워요."],
  ["reunion", "fresh-breakup", "일지와 시지 사이에 충이 있어서, 헤어지고 나서도 마음이 쉽게 가라앉지 않을 수 있어요."],
  ["reunion", "fresh-breakup", "지금 대운이 일지와 충을 이루니, 헤어진 뒤 멈춰 있던 마음이 다시 움직이기 쉬워요."],
  ["reunion", "missing", "일지와 월지가 정면으로 맞서는 짝(충)이라, 재회를 하게 되더라도 같은 일로 부딪치기 쉬운 편이에요."],
  ["love", "marriage", "일지와 월지가 묶이려는 짝(육합)이라 결혼을 생각할 때 함께 사는 생활부터 그려 보게 될 수 있어요."],
  ["love", "marriage", "세운이 일지와 충을 이루니 연애 중에도 사소한 다툼이 잦아질 수 있어요."],
  ["love", "marriage", "일지와 월지가 묶이려는 짝(육합)이라, 결혼하게 되면 함께 정하는 일이 많아지는 쪽을 편하게 느낄 수 있어요."],
  ["career", "move", "대운이 월지와 충을 이루니 이직을 고민하는 마음이 커질 수 있어요."],
  ["career", "move", "세운과 월지가 묶이려는 짝(합)이라, 퇴사보다 지금 자리에서 손을 넓혀 보는 쪽이 편할 수 있어요."],
  ["career", "move", "대운이 월지와 충을 이루는 때라 이직할 수 있는 길을 넓게 살펴보기 좋아요."],
  ["money", "leaking", "세운이 일지와 묶이려는 짝(합)을 이루니 지출을 누군가와 함께 정하는 일이 늘 수 있어요."],
];

const NOW = Date.parse(golden.evalNow);
const topicFacts = (topic: SajuTopicId, situation: SajuSituationId) =>
  buildTopicFactSet(computeChart(toSajuInput(golden.charts.find((c) => c.id === "C1")!.birth as SajuForm)), NOW, topic, situation);
const topicFindings = (topic: SajuTopicId, situation: SajuSituationId, sentence = "") => {
  const f = topicFacts(topic, situation);
  const reading = mockSajuTopicReading(f);
  if (sentence) reading.sections[3]!.body += ` ${sentence}`;
  return validateSajuTopicReading(reading, f);
};
describe("relation read as an event in a topic reading", () => {
  it.each(TOPIC_GOLDEN)("%s (%s) passes: %s", (topic, situation, sentence) => {
    const found = topicFindings(topic, situation, sentence);
    expect(found.filter((v) => v.includes("관계를 사건으로"))).toEqual([]);
    expect(hard(found)).toEqual(hard(topicFindings(topic, situation)));
  });

  it("finds an event reading on another word, soft, and the reading's hard findings stay as they were", () => {
    const found = topicFindings("career", "move", "대운이 월지와 충을 이루니 올해 이사하게 돼요.");
    expect(found.filter((v) => v.startsWith(RELATION_EVENT_PREFIX))).toHaveLength(1);
    expect(hard(found)).toEqual(hard(topicFindings("career", "move")));
  });
});
