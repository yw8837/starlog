// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_FLOW, FLOW_KEY, NOTE_MAX, sanitizeFlow, saveFlow, summarizeFlow, useFlowState, withFlags } from "./flowState";

const FALLBACK = {
  question: "이번 달, 뜸해진 그 사람에게 먼저 연락해도 될까",
  template: "relationship-contact" as const,
  input: {
    conditions: [{ label: "관계", value: "알아가는 중" }],
    note: "지난달엔 거의 매일 연락했어요",
  },
};

const CONTACT = { who: "us", topicId: "contact", when: "month" } as const;

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
});

describe("summarizeFlow", () => {
  it("falls back to the fixture input when no question was built", () => {
    expect(summarizeFlow(EMPTY_FLOW, FALLBACK)).toEqual({
      question: FALLBACK.question,
      template: "relationship-contact",
      conditions: FALLBACK.input.conditions,
      note: FALLBACK.input.note,
      fromFixture: true,
    });
    expect(summarizeFlow(null, FALLBACK).fromFixture).toBe(true);
  });

  it("uses only what the user chose, in the topic's condition order", () => {
    const summary = summarizeFlow(
      { ...CONTACT, conditions: { goal: "가볍게 안부", relation: "알아가는 중" }, note: "" },
      FALLBACK,
    );
    expect(summary).toEqual({
      question: "이번 달, 그 사람에게 먼저 연락해도 될까",
      template: "relationship-contact",
      conditions: [
        { label: "관계", value: "알아가는 중" },
        { label: "원하는 방향", value: "가볍게 안부" },
      ],
      note: "",
      fromFixture: false,
    });
  });
});

describe("withFlags", () => {
  it("adds only the allowed flags that are set", () => {
    expect(withFlags("/tarot/result", {})).toBe("/tarot/result");
    expect(withFlags("/tarot/result", { instant: true })).toBe("/tarot/result?instant=1");
    expect(withFlags("/chapter/sample?from=unlock", { instant: true, visit: "returning" })).toBe(
      "/chapter/sample?from=unlock&instant=1&visit=returning",
    );
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

  it("never writes the question or note into the URL", () => {
    const { result } = renderHook(() => useFlowState());
    const before = window.location.href;
    act(() => result.current.setFlow({ ...CONTACT, conditions: {}, note: "비밀 메모" }));
    expect(window.location.href).toBe(before);
  });
});
