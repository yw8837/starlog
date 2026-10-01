// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { FRESH_FOR_MS, NEW_SAJU_HREF, NEW_TAROT_HREF, isStale, takeNewFlag } from "./freshStart";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("freshStart", () => {
  it("links a new question with ?new=1", () => {
    expect(NEW_TAROT_HREF).toBe("/tarot/new?new=1");
    expect(NEW_SAJU_HREF).toBe("/saju/new?new=1");
  });

  it("takes the flag once and leaves the rest of the address as it was", () => {
    window.history.replaceState(null, "", "/tarot/new?new=1&instant=1#top");
    expect(takeNewFlag()).toBe(true);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/tarot/new?instant=1#top");
    expect(takeNewFlag()).toBe(false);
    window.history.replaceState(null, "", "/tarot/new");
    expect(takeNewFlag()).toBe(false);
  });

  it("calls answers stale after 30 minutes, or when their age is unknown", () => {
    const now = 1_790_000_000_000;
    expect(FRESH_FOR_MS).toBe(30 * 60 * 1000);
    expect(isStale(now - 29 * 60 * 1000, now)).toBe(false);
    expect(isStale(now - 30 * 60 * 1000, now)).toBe(false);
    expect(isStale(now - 30 * 60 * 1000 - 1, now)).toBe(true);
    expect(isStale(undefined, now)).toBe(true);
  });
});
