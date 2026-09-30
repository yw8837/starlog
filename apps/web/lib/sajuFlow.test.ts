// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAJU_PROFILE_KEY, saveSajuProfile, useSajuProfile } from "./sajuFlow";
import { DEFAULT_SAJU_FORM } from "./sajuForm";

const KNOWN = { ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: 30, placeId: "busan" };

describe("useSajuProfile", () => {
  afterEach(() => sessionStorage.clear());

  it("reads nothing (null) until a profile is saved", () => {
    const { result } = renderHook(() => useSajuProfile());
    expect(result.current.profile).toBeNull();
  });

  it("shares a saved profile between hooks and keeps it in sessionStorage", () => {
    const a = renderHook(() => useSajuProfile());
    const b = renderHook(() => useSajuProfile());
    act(() => a.result.current.saveProfile(KNOWN));
    expect(b.result.current.profile).toEqual(KNOWN);
    expect(JSON.parse(sessionStorage.getItem(SAJU_PROFILE_KEY) ?? "{}").placeId).toBe("busan");
  });

  it("ignores a stored profile that no longer validates", () => {
    sessionStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify({ ...KNOWN, placeId: "tokyo" }));
    const { result } = renderHook(() => useSajuProfile());
    expect(result.current.profile).toBeNull();
  });

  it("never writes birth data into the URL", () => {
    const before = window.location.href;
    act(() => saveSajuProfile(KNOWN));
    expect(window.location.href).toBe(before);
  });
});
