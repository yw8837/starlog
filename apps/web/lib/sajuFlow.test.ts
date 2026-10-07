// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAJU_CONTEXT_KEY,
  SAJU_PROFILE_KEY,
  chapterRequestFields,
  clearSajuProfile,
  freshSajuContextOnEntry,
  sajuContextBody,
  sajuStatusBody,
  sajuTeaserKey,
  sanitizeSajuContext,
  saveSajuContext,
  saveSajuProfile,
  useSajuContext,
  useSajuProfile,
} from "./sajuFlow";
import { DEFAULT_SAJU_FORM } from "./sajuForm";

const KNOWN = { ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: 30, placeId: "busan" };

describe("useSajuProfile", () => {
  afterEach(() => localStorage.clear());

  it("reads nothing (null) until a profile is saved", () => {
    const { result } = renderHook(() => useSajuProfile());
    expect(result.current.profile).toBeNull();
  });

  it("shares a saved profile between hooks and keeps it on this device (localStorage)", () => {
    const a = renderHook(() => useSajuProfile());
    const b = renderHook(() => useSajuProfile());
    act(() => a.result.current.saveProfile(KNOWN));
    expect(b.result.current.profile).toEqual(KNOWN);
    expect(JSON.parse(localStorage.getItem(SAJU_PROFILE_KEY) ?? "{}").placeId).toBe("busan");
  });

  it("ignores a stored profile that no longer validates", () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify({ ...KNOWN, placeId: "tokyo" }));
    const { result } = renderHook(() => useSajuProfile());
    expect(result.current.profile).toBeNull();
  });

  it("never writes birth data into the URL", () => {
    const before = window.location.href;
    act(() => saveSajuProfile(KNOWN));
    expect(window.location.href).toBe(before);
  });

  it("erases the profile and the status chips together", () => {
    const profile = renderHook(() => useSajuProfile());
    const context = renderHook(() => useSajuContext());
    act(() => {
      saveSajuProfile(KNOWN);
      saveSajuContext({ loveStatus: "dating" });
    });
    expect(context.result.current).toMatchObject({ loveStatus: "dating" });
    act(() => clearSajuProfile());
    expect(profile.result.current.profile).toBeNull();
    expect(context.result.current).toEqual({});
    expect(localStorage.getItem(SAJU_PROFILE_KEY)).toBeNull();
    expect(localStorage.getItem(SAJU_CONTEXT_KEY)).toBeNull();
  });
});

describe("saju status chips (no free text)", () => {
  it("keeps only known chip ids and drops a concern an older version saved", () => {
    expect(sanitizeSajuContext({ loveStatus: "dating", workStatus: "ceo", concern: "이직" })).toEqual({ loveStatus: "dating" });
    expect(sanitizeSajuContext("x")).toBeNull();
  });

  it("sends only the filled chips and never a concern", () => {
    expect(sajuContextBody({ loveStatus: "married", concern: "이사할까" } as Parameters<typeof sajuContextBody>[0])).toEqual({ loveStatus: "married" });
    expect(sajuContextBody({})).toEqual({});
  });
});

describe("freshSajuContextOnEntry (a new saju question starts clean)", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });
  const savedContext = () => JSON.parse(localStorage.getItem(SAJU_CONTEXT_KEY) ?? "null");

  it("clears the status chips for a new question but never the birth profile", () => {
    saveSajuProfile(KNOWN);
    saveSajuContext({ loveStatus: "dating", workStatus: "employee" });
    freshSajuContextOnEntry(false);
    expect(savedContext()).toMatchObject({ loveStatus: "dating" });
    freshSajuContextOnEntry(true);
    expect(localStorage.getItem(SAJU_CONTEXT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SAJU_PROFILE_KEY) ?? "null")).toEqual(KNOWN);
  });

  it("forgets chips saved more than 30 minutes ago (fake clock), and never sends the saved time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00+09:00"));
    saveSajuContext({ loveStatus: "married" });
    expect(savedContext().savedAt).toBe(Date.parse("2026-10-01T10:00:00+09:00"));
    expect(sajuContextBody(savedContext())).toEqual({ loveStatus: "married" });
    vi.setSystemTime(new Date("2026-10-01T10:30:00+09:00"));
    freshSajuContextOnEntry(false);
    expect(savedContext()).toMatchObject({ loveStatus: "married" });
    vi.setSystemTime(new Date("2026-10-01T10:31:00+09:00"));
    freshSajuContextOnEntry(false);
    expect(localStorage.getItem(SAJU_CONTEXT_KEY)).toBeNull();
  });
});

describe("request fields and teaser keys (saju-topics, owner cut §0)", () => {
  const status = { loveStatus: "dating", workStatus: "employee" } as const;

  it("sends 전체 흐름's status chips as before and a 운 only its id", () => {
    expect(sajuContextBody(status)).toEqual({ loveStatus: "dating", workStatus: "employee" });
    expect(sajuContextBody(status, "overall")).toEqual({ loveStatus: "dating", workStatus: "employee" });
    expect(sajuContextBody(status, "money")).toEqual({ topic: "money" });
    expect(sajuContextBody({}, "overall")).toEqual({});
    expect(sajuStatusBody({ ...status, concern: "이사할까" } as Parameters<typeof sajuStatusBody>[0])).toEqual(status);
  });

  it("describes a saved chapter in the same shape (an older chapter is 전체 흐름)", () => {
    expect(chapterRequestFields({})).toEqual({});
    expect(chapterRequestFields({ context: { loveStatus: "married" } })).toEqual({ loveStatus: "married" });
    expect(chapterRequestFields({ topic: "money", context: { loveStatus: "married" } })).toEqual({ topic: "money" });
  });

  it("keys a teaser by birth data, 운 and status chips, whatever the key order", () => {
    const shuffled = Object.fromEntries(Object.entries(KNOWN).reverse()) as typeof KNOWN;
    expect(sajuTeaserKey(shuffled, { topic: "money" })).toBe(sajuTeaserKey(KNOWN, { topic: "money" }));
    expect(sajuTeaserKey(KNOWN, { topic: "money" })).not.toBe(sajuTeaserKey(KNOWN, { topic: "love" }));
    expect(sajuTeaserKey(KNOWN, {})).toBe(sajuTeaserKey(KNOWN, { topic: undefined }));
    expect(sajuTeaserKey(KNOWN, {})).not.toBe(sajuTeaserKey(KNOWN, { loveStatus: "dating" }));
    expect(sajuTeaserKey(KNOWN, {})).not.toBe(sajuTeaserKey({ ...KNOWN, day: 2 }, {}));
  });

  it("keeps every key made before 윤달 '모름', and gives 모름 a key of its own", () => {
    expect(sajuTeaserKey(KNOWN, {})).toBe(JSON.stringify(["solar", 1990, 1, 1, false, true, 9, 30, "female", "busan", "overall", null, null]));
    const lunar = { ...KNOWN, calendar: "lunar" as const };
    const keys = [lunar, { ...lunar, isLeapMonth: true }, { ...lunar, leapMonthUnknown: true }].map((birth) => sajuTeaserKey(birth, {}));
    expect(new Set(keys).size).toBe(3);
  });
});
