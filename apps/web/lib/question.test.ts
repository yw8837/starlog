import { TOPICS_BY_WHO, composeQuestion, type When, type Who } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { aiTells } from "@/lib/ai/style";
import { builderTopics } from "./flowState";
import { hasFinalConsonant, particle, withParticle } from "./korean";
import { cleanPart, composeFlowQuestion, flowQuote, personRef, timePhrase } from "./question";

const WHOS: Who[] = ["me", "us", "work", "group"];
const WHENS: When[] = ["today", "week", "month", "year"];
const topic = (who: Who, id: string) => TOPICS_BY_WHO[who].find((t) => t.id === id)!;

/** Owner's samples (2026-10-01): names, a Latin letter, two sentences typed as 누구, nothing; plus the
 * field's examples for 나의 일 and 우리 모임. */
const WHO_SAMPLES = ["엄마", "팀장님", "J", "티끌을 얼마나 모아야", "돈 많이 벌고 싶어요", "", "우리 팀", "새 프로젝트", "첫 직장", "대학 동기", "독서 모임", "가족", "울산 AI 자동화방"];
const SENTENCE_WHOS = ["티끌을 얼마나 모아야", "돈 많이 벌고 싶어요"];
const WHEN_SAMPLES = ["다음 주 금요일", "면접 보는 날", "아무거나"];
/** Typed 무엇: nouns, a Latin noun, a question, open clauses and whole sentences. */
const TOPIC_SAMPLES = [
  "창업 준비", "전세 계약", "IPO", "이직해도 될까?", "이직할지 말지", "그 사람 진심인지", "돈 많이 벌고 싶어요", "티끌을 얼마나 모아야", "회사가 너무 힘들다",
  // Owner, 2026-10-02: wishes, proposals and exclamations typed as 무엇.
  "다같이 부자 되어봅시다~", "우리 대박나자!!", "이번엔 꼭 붙고 싶어요", "돈 벌자 ^^",
];
/** Typed 무엇 said rather than named: they never reach the question (shown under it instead). */
const SAID_TOPICS = ["돈 많이 벌고 싶어요", "회사가 너무 힘들다", "다같이 부자 되어봅시다~", "우리 대박나자!!", "이번엔 꼭 붙고 싶어요", "돈 벌자 ^^"];

const DOUBLED = /(과|와)(과|와)|(은|는)(은|는)(?=[\s,?])|(을|를)(을|를)|의의|에게에게|랑(과|와)|에게(과|와)/u;
/** A particle glued to a verb ending, like "모아야와" or "싶어요의". */
const GLUED = /(아야|어야|해야|싶어요|어요|아요|해요|니다|는지|할지)(과|와|의|에게|은|는|을|를|이|가)(?=[\s,?])/u;

/** Every rule the owner set for a question sentence. */
function expectNatural(q: string | null, label: string, absent: readonly string[] = []) {
  expect(q, label).not.toBeNull();
  const sentence = q!;
  expect(sentence, label).not.toMatch(/나아가/);
  expect(sentence, label).not.toMatch(DOUBLED);
  expect(sentence, label).not.toMatch(GLUED);
  expect(sentence, label).not.toMatch(/ {2}|,,|, ,|\?\?|—|[~～!！^]|\p{Extended_Pictographic}/u);
  // One comma at most: "다음 주 금요일, 팀장님과의 갈등, …" reads like a list.
  expect((sentence.match(/,/g) ?? []).length, `${label}: ${sentence}`).toBeLessThanOrEqual(1);
  expect(sentence.endsWith("?"), label).toBe(true);
  expect(sentence.length, `${label}: ${sentence}`).toBeLessThanOrEqual(40);
  expect(aiTells(sentence).map((tell) => tell.id), `${label}: ${sentence}`).toEqual([]);
  for (const typed of absent) expect(sentence, label).not.toContain(typed);
  expect(sentence, label).not.toContain("아무거나");
}

describe("particles", () => {
  it("follows the last syllable's final consonant", () => {
    expect(hasFinalConsonant("계약")).toBe(true);
    expect(hasFinalConsonant("준비")).toBe(false);
    expect(hasFinalConsonant("IPO")).toBeNull();
    expect(hasFinalConsonant("")).toBeNull();
    expect(particle("전세 계약", "은/는")).toBe("은");
    expect(particle("창업 준비", "은/는")).toBe("는");
    expect(particle("엄마", "과/와")).toBe("와");
    expect(particle("팀장님", "과/와")).toBe("과");
    expect(withParticle("지금의 10년", "을/를")).toBe("지금의 10년을");
    expect(withParticle("오행 지도", "을/를")).toBe("오행 지도를");
  });
});

describe("catalog sentences", () => {
  it("reads naturally for every who × topic × time chip, and nothing is left of the old stiff wording", () => {
    for (const who of WHOS)
      for (const t of TOPICS_BY_WHO[who])
        for (const when of t.whens ?? WHENS) {
          const q = composeQuestion(who, t, when);
          expectNatural(q, `${who}/${t.id}/${when}`);
          expect(q, `${who}/${t.id}/${when}`).not.toMatch(/어떤 쪽으로|어떤 방향으로|흐름을 탈까|향하고 있을까|나의 /);
        }
  });
});

describe("composeFlowQuestion", () => {
  it("gives exactly the catalog sentence with chips only", () => {
    for (const who of WHOS)
      for (const t of TOPICS_BY_WHO[who])
        for (const when of t.whens ?? WHENS) expect(composeFlowQuestion({ who, topic: t, when })).toBe(composeQuestion(who, t, when));
  });

  it("reads naturally for EVERY chip × 누구 sample × time chip or typed time", () => {
    let count = 0;
    for (const who of WHOS)
      for (const t of builderTopics(who))
        for (const whoText of who === "me" ? [""] : WHO_SAMPLES)
          for (const when of [...(t.whens ?? WHENS), ...WHEN_SAMPLES]) {
            const chip = (WHENS as string[]).includes(when);
            const q = composeFlowQuestion({ who, topic: t, whoText, ...(chip ? { when: when as When } : { whenText: when }) });
            // A sentence typed as 누구 never reaches the question (it still goes to the reading).
            expectNatural(q, `${who}/${t.id}/${whoText || "-"}/${when}`, SENTENCE_WHOS.includes(whoText) ? ["티끌", "벌고"] : []);
            count += 1;
          }
    expect(count).toBeGreaterThan(500);
  });

  it("reads naturally for EVERY typed 무엇 sample × 누구 sample × time", () => {
    for (const who of WHOS)
      for (const topicText of TOPIC_SAMPLES)
        for (const whoText of who === "me" ? [""] : WHO_SAMPLES)
          for (const when of [...WHENS, ...WHEN_SAMPLES]) {
            const chip = (WHENS as string[]).includes(when);
            const q = composeFlowQuestion({ who, topicText, whoText, ...(chip ? { when: when as When } : { whenText: when }) });
            expectNatural(q, `${who}/${topicText}/${whoText || "-"}/${when}`, SAID_TOPICS.includes(topicText) ? [cleanPart(topicText)] : []);
          }
  });

  it("fixes the owner's case: a sentence typed as 누구 stays out of the question", () => {
    expect(composeFlowQuestion({ who: "us", whoText: "티끌을 얼마나 모아야", topic: topic("us", "crush"), when: "week" })).toBe("이번 주 그 사람과 나 사이는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "us", whoText: "돈 많이 벌고 싶어요", topic: topic("us", "contact"), when: "month" })).toBe("이번 달 그 사람에게 먼저 연락해도 될까?");
  });

  it("puts a name or role where the sentence has 그 사람, 우리 모임 or the other side of 일·협상", () => {
    expect(composeFlowQuestion({ who: "us", whoText: "엄마", topic: topic("us", "crush"), when: "month" })).toBe("이번 달 엄마와 나 사이는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "us", whoText: "전 남친", topic: topic("us", "contact"), when: "month" })).toBe("이번 달 전 남친에게 먼저 연락해도 될까?");
    expect(composeFlowQuestion({ who: "us", whoText: "팀장님", topic: topic("us", "conflict"), when: "week" })).toBe("이번 주 팀장님과의 갈등, 어떻게 풀면 좋을까?");
    expect(composeFlowQuestion({ who: "us", whoText: "민지", topic: topic("us", "marriage"), when: "year" })).toBe("올해 민지와의 결혼은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topic: topic("group", "people"), when: "month" })).toBe("이번 달 동아리 사람들과 잘 지낼 수 있을까?");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topic: topic("group", "together"), when: "month" })).toBe("이번 달 동아리가 함께하는 일, 잘 될까?");
    expect(composeFlowQuestion({ who: "group", whoText: "가족", topic: topic("group", "together"), when: "year" })).toBe("올해 가족이 함께하는 일, 잘 될까?");
    expect(composeFlowQuestion({ who: "group", whoText: "엄마", topic: topic("group", "mood"), when: "week" })).toBe("이번 주 엄마 모임 분위기는 어떨까?");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topic: topic("work", "negotiation"), when: "week" })).toBe("이번 주 팀장님과의 협상, 어떻게 풀어 갈까?");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topic: topic("work", "career"), when: "week" })).toBe("이번 주 팀장님과의 일은 어떻게 풀릴까?");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topic: topic("work", "money"), when: "week" })).toBe("이번 주 내 수입은 어떻게 될까?");
    // A typed time before a sentence that has its own comma: no second comma.
    expect(composeFlowQuestion({ who: "us", whoText: "팀장님", topic: topic("us", "conflict"), whenText: "다음 주 금요일" })).toBe("다음 주 금요일 팀장님과의 갈등, 어떻게 풀면 좋을까?");
  });

  it("reads a 나의 일 detail as a team or project when it looks like one, as a person when it looks like one, otherwise as context only", () => {
    expect(composeFlowQuestion({ who: "work", whoText: "우리 팀", topic: topic("work", "career"), when: "week" })).toBe("이번 주 우리 팀은 어떻게 풀릴까?");
    expect(composeFlowQuestion({ who: "work", whoText: "첫 직장", topic: topic("work", "career"), when: "year" })).toBe("올해 첫 직장은 어떻게 풀릴까?");
    expect(composeFlowQuestion({ who: "work", whoText: "새 프로젝트", topic: topic("work", "negotiation"), when: "month" })).toBe("이번 달 새 프로젝트 협상, 어떻게 풀어 갈까?");
    expect(composeFlowQuestion({ who: "work", whoText: "새 프로젝트", topic: topic("work", "money"), when: "month" })).toBe("이번 달 내 수입은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "work", whoText: "거래처", topic: topic("work", "negotiation"), when: "week" })).toBe("이번 주 거래처와의 협상, 어떻게 풀어 갈까?");
    expect(composeFlowQuestion({ who: "work", whoText: "엄마", topic: topic("work", "negotiation"), when: "week" })).toBe("이번 주 중요한 협상, 어떻게 풀어 갈까?");
    expect(composeFlowQuestion({ who: "work", whoText: "우리 팀", topicText: "연봉 협상", when: "year" })).toBe("올해 우리 팀 연봉 협상은 어떻게 될까?");
  });

  it("reads a 우리 모임 detail as the group", () => {
    expect(composeFlowQuestion({ who: "group", whoText: "독서 모임", topic: topic("group", "mood"), when: "month" })).toBe("이번 달 독서 모임 분위기는 어떨까?");
    expect(composeFlowQuestion({ who: "group", whoText: "대학 동기", topic: topic("group", "conflict"), when: "week" })).toBe("이번 주 대학 동기 모임 안의 갈등, 어떻게 풀면 좋을까?");
  });

  it("keeps the catalog wording when the particle after a name cannot be told, except before 에게", () => {
    expect(composeFlowQuestion({ who: "us", whoText: "J", topic: topic("us", "crush"), when: "month" })).toBe("이번 달 그 사람과 나 사이는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "us", whoText: "J", topic: topic("us", "contact"), when: "month" })).toBe("이번 달 J에게 먼저 연락해도 될까?");
    expect(composeFlowQuestion({ who: "work", whoText: "PM", topic: topic("work", "negotiation"), when: "week" })).toBe("이번 주 중요한 협상, 어떻게 풀어 갈까?");
  });

  it("builds a question around a typed 무엇", () => {
    expect(composeFlowQuestion({ who: "me", topicText: "창업 준비", when: "month" })).toBe("이번 달 내 창업 준비는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "us", topicText: "여행 계획", when: "week" })).toBe("이번 주 그 사람과의 여행 계획은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "us", whoText: "엄마", topicText: "전세 계약", whenText: "다음 주 금요일 면접" })).toBe("다음 주 금요일 면접, 엄마와의 전세 계약은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "work", topicText: "연봉 협상", when: "year" })).toBe("올해 연봉 협상은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topicText: "연봉 협상", when: "year" })).toBe("올해 팀장님과의 연봉 협상은 어떻게 될까?");
    expect(composeFlowQuestion({ who: "group", topicText: "축제 준비", when: "month" })).toBe("이번 달 우리 모임 축제 준비는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topicText: "축제 준비", when: "month" })).toBe("이번 달 동아리 축제 준비는 어떻게 될까?");
    // No particle can be told after a Latin ending: a comma instead.
    expect(composeFlowQuestion({ who: "me", topicText: "IPO", when: "year" })).toBe("올해 내 IPO, 어떻게 될까?");
  });

  it("asks a typed question, clause or sentence as a person would", () => {
    expect(composeFlowQuestion({ who: "me", topicText: "이직해도 될까?", when: "month" })).toBe("이번 달 이직해도 될까?");
    expect(composeFlowQuestion({ who: "me", topicText: "이직할지 말지", when: "month" })).toBe("이번 달 이직할까 말까?");
    expect(composeFlowQuestion({ who: "me", topicText: "합격할지", when: "year" })).toBe("올해 합격할까?");
    expect(composeFlowQuestion({ who: "us", topicText: "그 사람 진심인지", when: "week" })).toBe("이번 주 그 사람 진심일까?");
    expect(composeFlowQuestion({ who: "us", topicText: "왜 연락이 없는지", when: "week" })).toBe("이번 주 왜 연락이 없는 걸까?");
    expect(composeFlowQuestion({ who: "me", topicText: "티끌을 얼마나 모아야", when: "week" })).toBe("이번 주 티끌을 얼마나 모아야 할까?");
    expect(composeFlowQuestion({ who: "me", topicText: "돈 많이 벌고 싶어요", when: "week" })).toBe("이번 주 나는 어떻게 될까?");
    expect(composeFlowQuestion({ who: "me", topicText: "회사가 너무 힘들다", whenText: "다음 주 금요일에" })).toBe("다음 주 금요일에, 나는 어떻게 될까?");
  });

  it("leaves a typed 언제 that is not a time out of the sentence", () => {
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), whenText: "아무거나" })).toBe("내 재물 흐름은 어떨까?");
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), whenText: "다음 주에 면접이 있어요" })).toBe("내 재물 흐름은 어떨까?");
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), whenText: "다음 달 월급날" })).toBe("다음 달 월급날, 내 재물 흐름은 어떨까?");
    expect(composeFlowQuestion({ who: "me", topicText: "돈 많이 벌고 싶어요", whenText: "아무거나" })).toBe("나는 어떻게 될까?");
  });

  it("returns null until 누구 · 무엇 · 언제 are all given, or for a time the topic does not allow", () => {
    expect(composeFlowQuestion({ who: "me", when: "week" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money") })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topicText: "   ", when: "week" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "daily"), when: "month" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "marriage"), when: "today" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topicText: "!!!", when: "month" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topicText: "<>", when: "week" })).toBeNull();
  });

  it("keeps $ patterns literal and ignores 누구 detail with 나", () => {
    expect(composeFlowQuestion({ who: "group", whoText: "A$&", topic: topic("group", "people"), when: "month" })).toBe("이번 달 A$& 모임 사람들과 잘 지낼 수 있을까?");
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), whenText: "$1 월급날" })).toBe("$1 월급날, 내 재물 흐름은 어떨까?");
    expect(composeFlowQuestion({ who: "me", whoText: "엄마", topic: topic("me", "money"), when: "week" })).toBe("이번 주 내 재물 흐름은 어떨까?");
  });

  it("a typed time replaces the chip; trailing commas and periods never double up", () => {
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), when: "week", whenText: "다음 달 월급날" })).toBe("다음 달 월급날, 내 재물 흐름은 어떨까?");
    expect(composeFlowQuestion({ who: "me", topicText: "창업 준비.", whenText: "다음 주,", when: "week" })).toBe("다음 주, 내 창업 준비는 어떻게 될까?");
  });
});

describe("personRef", () => {
  it("takes a short name or role, minus a particle typed after it", () => {
    for (const name of ["엄마", "팀장님", "J", "전 남친", "아버지", "민지", "은지", "시어머니"]) expect(personRef(name, "us")).toBe(name);
    expect(personRef("엄마에게", "us")).toBe("엄마");
    expect(personRef("동생한테", "us")).toBe("동생");
    expect(personRef("경영학과", "group")).toBe("경영학과");
  });

  it("refuses sentences, long text, numbers, links and names that already carry 과/와/랑", () => {
    for (const text of ["티끌을 얼마나 모아야", "돈 많이 벌고 싶어요", "연락해도 될까", "누구일까?", "좋아하는 사람이에요", "고등학교 동창 친구들", "010-1234-5678", "https://a.kr", "엄마랑", "동생과", "", "  "]) {
      expect(personRef(text, "us"), text).toBe("");
    }
  });
});

describe("timePhrase", () => {
  it("keeps a typed time and drops anything else", () => {
    for (const time of ["다음 주 금요일", "면접 보는 날", "연말쯤", "3월", "다음 주 금요일 면접", "아무 때나"]) expect(timePhrase(time)).toBe(time);
    for (const text of ["아무거나", "다음 주에 면접이 있어요", "몰라요", "?"]) expect(timePhrase(text), text).toBe("");
  });
});

describe("cleanPart", () => {
  it("trims, folds spaces and strips angle brackets and trailing commas", () => {
    expect(cleanPart("  창업   준비, ")).toBe("창업 준비");
    expect(cleanPart("<b>계약</b>")).toBe("b계약/b");
    expect(cleanPart("...")).toBe("");
    expect(cleanPart(undefined)).toBe("");
  });
});

describe("a 무엇 said rather than named (owner, 2026-10-02)", () => {
  const group = (topicText: string, whoText = "울산 AI 자동화방") => ({ who: "group" as const, whoText, topicText, when: "year" as const });

  it("keeps wishes, proposals and exclamations out of the question and shows them under it", () => {
    expect(composeFlowQuestion(group("다같이 부자 되어봅시다~"))).toBe("올해 울산 AI 자동화방, 어떻게 될까?");
    expect(flowQuote({ topicText: "다같이 부자 되어봅시다~" })).toBe("다같이 부자 되어봅시다");
    expect(composeFlowQuestion(group("우리 대박나자!!", ""))).toBe("올해 우리 모임, 어떻게 될까?");
    expect(flowQuote({ topicText: "우리 대박나자!!" })).toBe("우리 대박나자");
    expect(composeFlowQuestion({ who: "me", topicText: "이번엔 꼭 붙고 싶어요", when: "year" })).toBe("올해 나는 어떻게 될까?");
    expect(flowQuote({ topicText: "이번엔 꼭 붙고 싶어요" })).toBe("이번엔 꼭 붙고 싶어요");
    expect(composeFlowQuestion({ who: "work", whoText: "우리 팀", topicText: "돈 벌자 ^^", when: "month" })).toBe("이번 달 우리 팀, 어떻게 될까?");
    expect(flowQuote({ topicText: "돈 벌자 ^^" })).toBe("돈 벌자");
    expect(composeFlowQuestion({ who: "us", whoText: "엄마", topicText: "다같이 부자 되어봅시다~", when: "year" })).toBe("올해 엄마와 나, 어떻게 될까?");
  });

  it("still splices a named topic and keeps a typed question as the user's own", () => {
    expect(composeFlowQuestion(group("창업 준비"))).toBe("올해 울산 AI 자동화방 창업 준비는 어떻게 될까?");
    expect(flowQuote({ topicText: "창업 준비" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topicText: "이직해도 될까?!", when: "month" })).toBe("이번 달 이직해도 될까?");
    expect(flowQuote({ topicText: "이직해도 될까?" })).toBeNull();
    expect(flowQuote({ topicText: "티끌을 얼마나 모아야" })).toBeNull();
  });

  it("takes a group or team name up to the 10-character field with two spaces, never a sentence", () => {
    expect(personRef("울산 AI 자동화방", "group")).toBe("울산 AI 자동화방");
    expect(personRef("울산 AI 자동화방", "work")).toBe("울산 AI 자동화방");
    expect(personRef("울산 AI 자동화방", "us")).toBe("");
    expect(personRef("우리 다 같이 하자", "group")).toBe("");
    expect(cleanPart("울산 모임!! ^^")).toBe("울산 모임");
  });
});
