import { describe, expect, it } from "vitest";
import { CRISIS_HITS } from "@/lib/api/crisisSamples";
import { nowTone, tarotTone } from "./tone";

/** Spec 2026-11-11 entry funnel renewal, 2.5: how far the characters may tease, judged before anything is shown. */

describe("지금의 한 장 tone (question only, spec 2.5)", () => {
  it.each(CRISIS_HITS)("crisis words get the care lines, never a nickname: %s", (text) => {
    const verdict = nowTone(text);
    expect(verdict.tone).toBe("crisis");
    expect(verdict.crisis).not.toBeNull();
  });

  it("names the tier, so a stated means or plan leads with the emergency lines", () => {
    expect(nowTone("죽고 싶어. 유서도 써놨어").crisis).toBe("urgent");
    expect(nowTone("살고 싶지 않아요").crisis).toBe("passive");
  });

  it.each(["수술 받아도 될까", "대출 갈아탈까", "병원 옮길까", "주식 지금 팔까", "코인 들어갈까", "소송 걸까", "임신 준비해도 될까"])("a heavy topic gets the facts only: %s", (text) => {
    expect(nowTone(text)).toEqual({ tone: "facts", crisis: null });
  });

  it.each(["헤어진 사람한테 연락할까", "재회할 수 있을까", "이혼할까", "결혼해도 될까", "어제 싸웠는데 먼저 사과할까", "돈 빌려줘도 될까"])("what three cards would read mildly (a breakup, marriage, a fight, money) gets the facts only here: one card has no mild table: %s", (text) => {
    expect(nowTone(text).tone).toBe("facts");
  });

  it.each(["먼저 연락할까", "오늘 먼저 연락해도 될까?", "이직 준비를 시작할까?", "", "   ", "죽음 카드가 나왔어요", "이번 주말 여행 갈까"])("everything else is teased: %j", (text) => {
    expect(nowTone(text)).toEqual({ tone: "spicy", crisis: null });
  });
});

describe("3장 tone (topic and texts, spec 2.5 order)", () => {
  it("crisis first, whatever the topic", () => {
    expect(tarotTone({ texts: ["그냥 다 끝내고 싶어"], topicId: "crush" }).tone).toBe("crisis");
  });

  it("then a heavy topic in any text, then 건강·컨디션 and 마음·감정: facts only", () => {
    expect(tarotTone({ texts: ["", "대출 갈아탈까"], topicId: "crush" }).tone).toBe("facts");
    expect(tarotTone({ topicId: "health" }).tone).toBe("facts");
    expect(tarotTone({ topicId: "mind" }).tone).toBe("facts");
  });

  it("then 재회, 갈등·화해, 결혼, 재물운, a written topic, a breakup or money text: mild", () => {
    for (const topicId of ["reunion", "conflict", "marriage", "money"]) expect(tarotTone({ topicId }).tone).toBe("mild");
    expect(tarotTone({ topicId: "crush", customTopic: true }).tone).toBe("mild");
    expect(tarotTone({ texts: ["헤어진 사람"], topicId: "contact" }).tone).toBe("mild");
    expect(tarotTone({ texts: ["돈 문제"], topicId: "people" }).tone).toBe("mild");
  });

  it("the rest is teased", () => {
    for (const topicId of ["crush", "relationship", "contact", "love", "career", "study", "creative", "negotiation", "people", "together", "mood", "move", "daily", undefined]) {
      expect(tarotTone({ texts: ["먼저 연락해도 될까?"], topicId }).tone).toBe("spicy");
    }
  });
});
