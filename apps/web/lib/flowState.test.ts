// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EMPTY_FLOW,
  FLOW_KEY,
  NOTE_MAX,
  builderTopics,
  resultGate,
  sanitizeFlow,
  saveFlow,
  summarizeFlow,
  tarotInput,
  useFlowState,
  withFlags,
} from "./flowState";
import { CUSTOM_MAX } from "./question";

const CONTACT = { who: "us", topicId: "contact", when: "month" } as const;
const MONEY = { who: "me", topicId: "money", when: "week" } as const;

const DRAW = {
  templateId: "self-flow",
  drawToken: "signed.token",
  cards: [
    { position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" },
    { position: "필요한 것", cardId: "major-17-star", orientation: "reversed" },
    { position: "이 시기의 흐름", cardId: "wands-01", orientation: "upright" },
  ],
} as const;

describe("sanitizeFlow", () => {
  it("returns an empty flow for anything that is not an object", () => {
    expect(sanitizeFlow(null)).toEqual(EMPTY_FLOW);
    expect(sanitizeFlow("x")).toEqual(EMPTY_FLOW);
  });

  it("keeps a valid who/topic/when with known condition options", () => {
    const flow = sanitizeFlow({ ...CONTACT, conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" }, note: "메모" });
    expect(flow).toEqual({ ...CONTACT, conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" }, note: "메모" });
  });

  it("drops a topic that belongs to another who, and a when the topic does not allow", () => {
    expect(sanitizeFlow({ who: "us", topicId: "daily", when: "today" })).toEqual({ who: "us", when: "today", conditions: {}, note: "" });
    expect(sanitizeFlow({ who: "me", topicId: "daily", when: "month" })).toEqual({ who: "me", topicId: "daily", conditions: {}, note: "" });
  });

  it("drops unknown conditions and options, and trims the note to NOTE_MAX", () => {
    const flow = sanitizeFlow({ ...CONTACT, conditions: { relation: "가족", mood: "좋음", goal: "가볍게 안부" }, note: "가".repeat(NOTE_MAX + 20) });
    expect(flow.conditions).toEqual({ goal: "가볍게 안부" });
    expect(flow.note).toHaveLength(NOTE_MAX);
  });

  it("lets a typed 무엇 or 언제 replace its chip, caps typed parts and keeps them as typed", () => {
    const flow = sanitizeFlow({ ...MONEY, topicText: "창업 준비 ", whenText: "가".repeat(CUSTOM_MAX + 5), conditions: { situation: "지출이 늘어남" } });
    expect(flow.topicId).toBeUndefined();
    expect(flow.when).toBeUndefined();
    expect(flow.conditions).toEqual({});
    expect(flow.topicText).toBe("창업 준비 ");
    expect(flow.whenText).toHaveLength(CUSTOM_MAX);
    // Spaces alone are nothing: the chips stay.
    expect(sanitizeFlow({ ...MONEY, topicText: "  ", whenText: " " })).toMatchObject({ topicId: "money", when: "week" });
  });

  it("keeps 누구 detail only for someone other than 나", () => {
    expect(sanitizeFlow({ ...MONEY, whoText: "엄마" }).whoText).toBeUndefined();
    expect(sanitizeFlow({ ...CONTACT, whoText: "엄마" }).whoText).toBe("엄마");
  });

  it("keeps a well-formed draw and drops a malformed one", () => {
    expect(sanitizeFlow({ ...MONEY, draw: DRAW }).draw).toEqual(DRAW);
    expect(sanitizeFlow({ ...MONEY, draw: { ...DRAW, templateId: "daily" } }).draw).toBeUndefined();
    expect(sanitizeFlow({ ...MONEY, draw: { ...DRAW, cards: [{ cardId: "x" }] } }).draw).toBeUndefined();
    expect(sanitizeFlow({ ...MONEY, draw: { ...DRAW, drawToken: "" } }).draw).toBeUndefined();
  });
});

describe("summarizeFlow", () => {
  it("is null until the question is complete (no fixture fallback)", () => {
    expect(summarizeFlow(null)).toBeNull();
    expect(summarizeFlow(EMPTY_FLOW)).toBeNull();
    expect(summarizeFlow({ who: "me", topicId: "money", conditions: {}, note: "" })).toBeNull();
    // 오늘의 운 is a one-card daily reading: not a spread this flow draws.
    expect(summarizeFlow({ who: "me", topicId: "daily", when: "today", conditions: {}, note: "" })).toBeNull();
  });

  it("uses only what the user chose, in the topic's condition order", () => {
    const summary = summarizeFlow({ ...CONTACT, conditions: { goal: "가볍게 안부", relation: "알아가는 중" }, note: "" });
    expect(summary).toMatchObject({
      question: "이번 달, 그 사람에게 먼저 연락해도 될까",
      template: "relationship-contact",
      conditions: [
        { label: "관계", value: "알아가는 중" },
        { label: "원하는 방향", value: "가볍게 안부" },
      ],
      note: "",
      custom: false,
    });
  });

  it("reads a typed 무엇 with the spread of the 누구 chip", () => {
    const base = { conditions: {}, note: "", topicText: "전세 계약", whenText: "다음 주 금요일 면접" };
    expect(summarizeFlow({ ...base, who: "me" })?.template).toBe("self-flow");
    expect(summarizeFlow({ ...base, who: "us", whoText: "엄마" })).toMatchObject({
      question: "다음 주 금요일 면접, 나와 엄마 사이 전세 계약은 어떻게 될까",
      template: "relationship",
      conditions: [],
      custom: true,
    });
    expect(summarizeFlow({ ...base, who: "work" })?.template).toBe("work");
    expect(summarizeFlow({ ...base, who: "group" })?.template).toBe("group");
  });

  it("offers every topic but 오늘의 운 in the builder", () => {
    expect(builderTopics("me").map((t) => t.id)).not.toContain("daily");
    expect(builderTopics("me").length).toBeGreaterThan(0);
  });
});

describe("resultGate (flow-state migration)", () => {
  it("sends a session from before server draws (no drawToken) back to the draw", () => {
    const old = sanitizeFlow({ ...MONEY, conditions: {}, note: "메모" });
    expect(old.draw).toBeUndefined();
    expect(resultGate(old)).toBe("draw");
  });

  it("sends an incomplete question to the builder", () => {
    expect(resultGate(sanitizeFlow({ who: "me" }))).toBe("builder");
  });

  it("redraws when the question now needs another spread than the one drawn", () => {
    expect(resultGate(sanitizeFlow({ ...MONEY, draw: DRAW }))).toBe("ready");
    expect(resultGate(sanitizeFlow({ ...CONTACT, draw: DRAW }))).toBe("draw");
  });
});

describe("tarotInput", () => {
  it("sends the chip path as before", () => {
    const flow = sanitizeFlow({ ...MONEY, conditions: { situation: "지금은 수입이 없음" }, note: " 쉬는 중 " });
    expect(tarotInput(flow, summarizeFlow(flow)!)).toEqual({
      topicId: "money",
      whoId: "me",
      whenId: "week",
      question: "이번 주, 나의 재물 흐름은 어떨까",
      conditions: [{ label: "지금 상황", value: "지금은 수입이 없음" }],
      note: "쉬는 중",
    });
  });

  it("sends typed parts, custom topic id and no whenId when 언제 was typed", () => {
    const flow = sanitizeFlow({ who: "us", whoText: " 엄마 ", topicText: "전세 계약", whenText: "다음 주 금요일 면접", conditions: {}, note: "" });
    expect(tarotInput(flow, summarizeFlow(flow)!)).toEqual({
      topicId: "custom",
      whoId: "us",
      question: "다음 주 금요일 면접, 나와 엄마 사이 전세 계약은 어떻게 될까",
      conditions: [],
      topicText: "전세 계약",
      whoText: "엄마",
      whenText: "다음 주 금요일 면접",
    });
  });
});

describe("withFlags", () => {
  it("adds only the instant flag", () => {
    expect(withFlags("/tarot/result", {})).toBe("/tarot/result");
    expect(withFlags("/tarot/result", { instant: true })).toBe("/tarot/result?instant=1");
    expect(withFlags("/chapter/sample?from=x", { instant: true })).toBe("/chapter/sample?from=x&instant=1");
  });
});

describe("useFlowState", () => {
  afterEach(() => sessionStorage.clear());

  it("reads the saved flow and shares updates between hooks", () => {
    saveFlow({ ...CONTACT, conditions: {}, note: "" });
    const a = renderHook(() => useFlowState());
    const b = renderHook(() => useFlowState());
    expect(a.result.current.flow?.topicId).toBe("contact");

    act(() => a.result.current.setFlow((prev) => ({ ...prev, note: "새 메모" })));
    expect(b.result.current.flow?.note).toBe("새 메모");
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}").note).toBe("새 메모");
  });

  it("never writes the question, typed parts or note into the URL", () => {
    const { result } = renderHook(() => useFlowState());
    const before = window.location.href;
    act(() => result.current.setFlow({ ...CONTACT, whoText: "전 남친", conditions: {}, note: "비밀 메모" }));
    expect(window.location.href).toBe(before);
  });
});
