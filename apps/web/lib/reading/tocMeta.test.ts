import { describe, expect, it } from "vitest";
import { assertVoice } from "@/lib/voice/banned";
import { sajuTocMeta, tarotTocMeta } from "./tocMeta";

/** Spec 2026-11-11 entry funnel renewal 3.6: the lock says what was given and what is left, from the server's real counts. */

const ELEVEN = Array.from({ length: 11 }, (_, i) => `소제목 ${i + 1}`);

describe("the lock's line", () => {
  it("tarot: N of M shown, the second card's first part, the length (T13)", () => {
    expect(tarotTocMeta({ lockedToc: ELEVEN, tocTotal: 12, tocOpen: 1, tocPartial: 1 }, "2,000")).toBe("소제목 12개 중 1개 공개 · 1개는 앞부분만 · 전체 약 2,000자");
  });

  it("tarot: says nothing of a part or an opened heading it did not give (a one-card spread)", () => {
    expect(tarotTocMeta({ lockedToc: ELEVEN, tocTotal: 11, tocOpen: 0, tocPartial: 0 }, "2,000")).toBe("소제목 11개 · 전체 약 2,000자");
  });

  it("follows the counts, not a fixed number", () => {
    expect(tarotTocMeta({ lockedToc: ["a", "b", "c", "d", "e", "f", "g"], tocTotal: 8, tocOpen: 1, tocPartial: 1 }, "2,000")).toBe("소제목 8개 중 1개 공개 · 1개는 앞부분만 · 전체 약 2,000자");
  });

  it("saju: names what the 맛보기 gave instead of 0개 공개 (S27)", () => {
    expect(sajuTocMeta({ lockedToc: ELEVEN, tocTotal: 11, tocOpen: 0, tocPartial: 0 }, "2,500~3,000")).toBe("소제목 11개 · 맛보기에서는 이름과 요약을 먼저 보여 드렸어요 · 전체 약 2,500~3,000자");
    expect(sajuTocMeta({ lockedToc: ELEVEN.slice(0, 8), tocTotal: 8, tocOpen: 0, tocPartial: 0 }, "2,500~3,000")).toBe("소제목 8개 · 맛보기에서는 이름과 요약을 먼저 보여 드렸어요 · 전체 약 2,500~3,000자");
  });

  it("a teaser kept before the counts reads as it did (its locked headings counted)", () => {
    expect(tarotTocMeta({ lockedToc: ["흐름", "조언"] }, "2,000")).toBe("소제목 2개 · 약 2,000자");
    expect(sajuTocMeta({ lockedToc: ELEVEN.slice(0, 8) }, "2,500~3,000")).toBe("소제목 8개 · 약 2,500~3,000자");
  });

  it("passes the banned list (spec 2.4)", () => {
    for (const text of [
      tarotTocMeta({ lockedToc: ELEVEN, tocTotal: 12, tocOpen: 1, tocPartial: 1 }, "2,000"),
      sajuTocMeta({ lockedToc: ELEVEN, tocTotal: 11, tocOpen: 0, tocPartial: 0 }, "2,500~3,000"),
    ]) assertVoice(text);
  });
});
