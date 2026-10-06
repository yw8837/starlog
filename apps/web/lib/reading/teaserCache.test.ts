// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clearSajuProfile } from "@/lib/sajuFlow";
import { SAJU_TEASERS_KEY, SAJU_TEASER_SLOTS, clearTeasers, pruneSajuTeasers, readTeaser, saveTeaser } from "./teaserCache";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-02T03:00:00Z");
const any = (value: unknown): value is { title: string } => typeof value === "object" && value !== null;
const teaser = (title: string, freshUntil?: string) => ({ title, summary: "s", lockedToc: [], ...(freshUntil ? { freshUntil } : {}) });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("saju teasers on this device (saju-topics spec §9.3)", () => {
  it("keeps one per key in localStorage and reads each back", () => {
    saveTeaser("saju", "k-money", teaser("재물"), NOW);
    saveTeaser("saju", "k-love", teaser("연애"), NOW);
    expect(readTeaser("saju", "k-money", any, NOW)?.title).toBe("재물");
    expect(readTeaser("saju", "k-love", any, NOW)?.title).toBe("연애");
    expect(JSON.parse(localStorage.getItem(SAJU_TEASERS_KEY)!)).toHaveLength(2);
    expect(sessionStorage.getItem("starlog.teaser.saju")).toBeNull();
  });

  it("keeps the newest 15 and drops the oldest", () => {
    for (let i = 0; i <= SAJU_TEASER_SLOTS; i++) saveTeaser("saju", `k${i}`, teaser(`t${i}`), NOW + i);
    expect(readTeaser("saju", "k0", any, NOW + 20)).toBeNull();
    expect(readTeaser("saju", `k${SAJU_TEASER_SLOTS}`, any, NOW + 20)?.title).toBe(`t${SAJU_TEASER_SLOTS}`);
    expect(JSON.parse(localStorage.getItem(SAJU_TEASERS_KEY)!)).toHaveLength(SAJU_TEASER_SLOTS);
  });

  it("stops at the server's freshUntil and never keeps one past 30 days", () => {
    saveTeaser("saju", "soon", teaser("곧", new Date(NOW + 2 * DAY).toISOString()), NOW);
    saveTeaser("saju", "far", teaser("멀리", new Date(NOW + 90 * DAY).toISOString()), NOW);
    saveTeaser("saju", "none", teaser("없음"), NOW);
    expect(readTeaser("saju", "soon", any, NOW + DAY)?.title).toBe("곧");
    expect(readTeaser("saju", "soon", any, NOW + 3 * DAY)).toBeNull();
    expect(readTeaser("saju", "far", any, NOW + 29 * DAY)?.title).toBe("멀리");
    expect(readTeaser("saju", "far", any, NOW + 31 * DAY)).toBeNull();
    expect(readTeaser("saju", "none", any, NOW + 31 * DAY)).toBeNull();
  });

  it("drops the ones past their time when asked (their keys hold birth data), writing nothing when none is", () => {
    const stored = () => localStorage.getItem(SAJU_TEASERS_KEY);
    pruneSajuTeasers(NOW);
    expect(stored()).toBeNull();
    saveTeaser("saju", "soon", teaser("곧", new Date(NOW + 2 * DAY).toISOString()), NOW);
    saveTeaser("saju", "later", teaser("나중", new Date(NOW + 20 * DAY).toISOString()), NOW);
    const both = stored();
    pruneSajuTeasers(NOW + DAY);
    expect(stored()).toBe(both);
    pruneSajuTeasers(NOW + 3 * DAY);
    expect((JSON.parse(stored()!) as Array<{ key: string }>).map((e) => e.key)).toEqual(["later"]);
    pruneSajuTeasers(NOW + 21 * DAY);
    expect(stored()).toBeNull();
  });

  it("is erased with the saju profile and with 기록 모두 지우기", () => {
    saveTeaser("saju", "k", teaser("t"), NOW);
    clearSajuProfile();
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toBeNull();
    saveTeaser("saju", "k", teaser("t"), NOW);
    saveTeaser("tarot", "d", { x: 1 });
    clearTeasers();
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toBeNull();
    expect(sessionStorage.getItem("starlog.teaser.tarot")).toBeNull();
  });

  it("leaves the tarot teaser in this tab only", () => {
    saveTeaser("tarot", "d", { x: 1 });
    expect(sessionStorage.getItem("starlog.teaser.tarot")).not.toBeNull();
    expect(readTeaser("tarot", "d", any)).toEqual({ x: 1 });
  });
});
