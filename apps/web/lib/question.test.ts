import { TOPICS_BY_WHO, composeQuestion, type Who } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { hasFinalConsonant, particle, withParticle } from "./korean";
import { cleanPart, composeFlowQuestion } from "./question";

const topic = (who: Who, id: string) => TOPICS_BY_WHO[who].find((t) => t.id === id)!;

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

describe("composeFlowQuestion", () => {
  it("gives exactly the catalog sentence with chips only (unchanged path)", () => {
    for (const who of ["me", "us", "work", "group"] as const) {
      for (const t of TOPICS_BY_WHO[who]) {
        const when = t.whens?.[0] ?? "month";
        expect(composeFlowQuestion({ who, topic: t, when })).toBe(composeQuestion(who, t, when));
      }
    }
  });

  it("is null until 누구, 무엇 and 언제 are all given", () => {
    expect(composeFlowQuestion({ who: "me", when: "week" })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money") })).toBeNull();
    expect(composeFlowQuestion({ who: "me", topicText: "   ", when: "week" })).toBeNull();
    // A chip time the topic does not allow.
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "daily"), when: "month" })).toBeNull();
  });

  it("joins a custom topic, person and time with natural particles (brief example)", () => {
    expect(composeFlowQuestion({ who: "us", whoText: "엄마", topicText: "전세 계약", whenText: "다음 주 금요일 면접" })).toBe(
      "다음 주 금요일 면접, 나와 엄마 사이 전세 계약은 어떻게 될까",
    );
    expect(composeFlowQuestion({ who: "me", topicText: "창업 준비", when: "month" })).toBe("이번 달, 나의 창업 준비는 어떻게 될까");
    expect(composeFlowQuestion({ who: "us", topicText: "여행 계획", when: "week" })).toBe("이번 주, 나와 그 사람 사이 여행 계획은 어떻게 될까");
    expect(composeFlowQuestion({ who: "work", topicText: "연봉 협상", when: "year" })).toBe("올해, 나의 일에서 연봉 협상은 어떻게 될까");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topicText: "연봉 협상", when: "year" })).toBe("올해, 나와 팀장님 사이 연봉 협상은 어떻게 될까");
    expect(composeFlowQuestion({ who: "group", topicText: "축제 준비", when: "month" })).toBe("이번 달, 우리 모임에서 축제 준비는 어떻게 될까");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topicText: "축제 준비", when: "month" })).toBe("이번 달, 동아리에서 축제 준비는 어떻게 될까");
  });

  it("falls back to a particle-free pattern when the ending cannot be read", () => {
    expect(composeFlowQuestion({ who: "me", topicText: "IPO", when: "year" })).toBe("올해, 나의 IPO — 어떻게 흘러갈까");
    // A topic typed as a whole question is used as the question.
    expect(composeFlowQuestion({ who: "me", topicText: "이직해도 될까?", when: "month" })).toBe("이번 달, 이직해도 될까");
  });

  it("puts a named person or group where the catalog sentence has 그 사람 / 우리 모임", () => {
    expect(composeFlowQuestion({ who: "us", whoText: "전 남친", topic: topic("us", "contact"), when: "month" })).toBe("이번 달, 전 남친에게 먼저 연락해도 될까");
    expect(composeFlowQuestion({ who: "us", whoText: "엄마", topic: topic("us", "conflict"), when: "week" })).toBe("이번 주, 엄마와의 갈등을 어떻게 풀어 가면 좋을까");
    expect(composeFlowQuestion({ who: "us", whoText: "팀장님", topic: topic("us", "conflict"), when: "week" })).toBe("이번 주, 팀장님과의 갈등을 어떻게 풀어 가면 좋을까");
    expect(composeFlowQuestion({ who: "us", whoText: "민지", topic: topic("us", "crush"), when: "month" })).toBe("이번 달, 민지와 나의 썸은 어떤 쪽으로 나아갈까");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topic: topic("group", "people"), when: "month" })).toBe("이번 달, 동아리 안의 인간관계는 어떻게 흘러갈까");
    expect(composeFlowQuestion({ who: "group", whoText: "동아리", topic: topic("group", "together"), when: "month" })).toBe("이번 달, 동아리에서 함께하는 일은 어떤 흐름을 탈까");
    expect(composeFlowQuestion({ who: "work", whoText: "팀장님", topic: topic("work", "negotiation"), when: "week" })).toBe("이번 주, 나와 팀장님 사이 협상과 대화는 어떻게 될까");
    // A Latin name: no guessed particle.
    expect(composeFlowQuestion({ who: "us", whoText: "J", topic: topic("us", "crush"), when: "month" })).toBe("이번 달, 썸과 고백 — 어떻게 흘러갈까");
  });

  it("uses a typed time in place of the chip, and ignores 누구 detail for 나", () => {
    expect(composeFlowQuestion({ who: "me", topic: topic("me", "money"), when: "week", whenText: "다음 달 월급날" })).toBe("다음 달 월급날, 나의 재물 흐름은 어떨까");
    expect(composeFlowQuestion({ who: "me", whoText: "엄마", topic: topic("me", "money"), when: "week" })).toBe("이번 주, 나의 재물 흐름은 어떨까");
  });

  it("never doubles punctuation from what the user typed", () => {
    expect(cleanPart("  다음 주,  ")).toBe("다음 주");
    expect(composeFlowQuestion({ who: "me", topicText: "창업 준비.", whenText: "다음 주,", when: "week" })).toBe("다음 주, 나의 창업 준비는 어떻게 될까");
  });
});
