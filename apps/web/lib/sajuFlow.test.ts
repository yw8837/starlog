// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONCERN_MAX,
  SAJU_CONTEXT_KEY,
  SAJU_PROFILE_KEY,
  clearSajuProfile,
  freshSajuContextOnEntry,
  sajuContextBody,
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
      saveSajuContext({ loveStatus: "dating", concern: "이직" });
    });
    expect(context.result.current).toMatchObject({ loveStatus: "dating", concern: "이직" });
    act(() => clearSajuProfile());
    expect(profile.result.current.profile).toBeNull();
    expect(context.result.current).toEqual({});
    expect(localStorage.getItem(SAJU_PROFILE_KEY)).toBeNull();
    expect(localStorage.getItem(SAJU_CONTEXT_KEY)).toBeNull();
  });
});

describe("saju status chips and concern", () => {
  it("keeps only known chip ids and caps the concern", () => {
    expect(sanitizeSajuContext({ loveStatus: "dating", workStatus: "ceo", concern: "가".repeat(CONCERN_MAX + 5) })).toEqual({
      loveStatus: "dating",
      concern: "가".repeat(CONCERN_MAX),
    });
    expect(sanitizeSajuContext("x")).toBeNull();
  });

  it("sends only filled fields, with the concern trimmed", () => {
    expect(sajuContextBody({ loveStatus: "married", concern: "  이사할까  " })).toEqual({ loveStatus: "married", concern: "이사할까" });
    expect(sajuContextBody({ concern: "   " })).toEqual({});
  });
});

describe("freshSajuContextOnEntry (a new saju question starts clean)", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });
  const savedContext = () => JSON.parse(localStorage.getItem(SAJU_CONTEXT_KEY) ?? "null");

  it("clears the status chips and concern for a new question but never the birth profile", () => {
    saveSajuProfile(KNOWN);
    saveSajuContext({ loveStatus: "dating", workStatus: "employee", concern: "이직" });
    freshSajuContextOnEntry(false);
    expect(savedContext()).toMatchObject({ loveStatus: "dating", concern: "이직" });
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
