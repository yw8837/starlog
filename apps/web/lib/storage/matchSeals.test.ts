// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY, clearChapters, deleteChapter, listChapters } from "./chapters";
import { MATCH_SEALS_KEY } from "./matchSeals";
import { forgetAccountOnDevice, pullAccountReadings } from "./sync";

/**
 * Review 2026-10-17 H3: a 궁합's follow-ups survive a logout and a login again on the device that wrote it. A logout
 * keeps only the partner's seal (this server's AES-GCM, opaque here) by the reading's account id, for its 30 days; the
 * next pull asks the server for a token from it. Nothing readable about either person stays behind.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-20T12:00:00+09:00");
const ID = "abcdefghij0123456789";
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const POS = ["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"];
const CARDS = POS.map((position, i) => ({ position, cardId: `wands-0${i + 1}`, orientation: "upright" }));
const READING = {
  verdict: "속도를 맞춰 가요", saju: { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("기둥 사이"), luck: section("두 사람의 10년") },
  cards: CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
  connection: section("다섯 장의 연결"), bridge: section("사주와 카드"), action: section("이번 주 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
};
/** A chapter token as the server signs it (the payload is plain base64url JSON; the signature is not checked here). */
const tokenWith = (sealed: string, exp: number) =>
  `${Buffer.from(JSON.stringify({ k: "chapter", v: 1, ctx: { kind: "match", me: { birth: DEFAULT_SAJU_FORM }, partner: { sealed, label: "민지" }, relation: "friend", cards: [] }, h: "x", turns: [{ question: "질문이에요", answer: "답이에요" }], iat: 1, exp })).toString("base64url")}.sig`;
const copy = (createdAt: number) => ({
  kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", me: { birth: DEFAULT_SAJU_FORM }, cards: CARDS,
  reading: READING, chapterToken: "", createdAt, turns: [], followUpsLeft: 5,
});
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));

afterEach(() => {
  clearChapters();
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

function account(createdAt: number, issued: { chapterToken: string; followUpsLeft: number } | null) {
  const posts: unknown[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/premium/match/chapter") {
      posts.push(JSON.parse(String(init?.body)));
      return issued ? Response.json(issued) : Response.json({ code: "BAD_TOKEN" }, { status: 400 });
    }
    return Response.json({ readings: [{ id: ID, createdAt, chapter: copy(createdAt) }], next: null });
  }) as unknown as typeof fetch;
  return { fetchImpl, posts };
}

describe("a 궁합's follow-ups across a logout (review 2026-10-17 H3)", () => {
  it("keeps the partner's seal only, then a login again on this device asks for the token and gets its follow-ups back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const createdAt = NOW - 3 * DAY;
    seed([{ ...copy(createdAt), id: ID, serverId: ID, chapterToken: tokenWith("SEALED-PARTNER", createdAt + 30 * DAY), turns: [{ question: "질문이에요", answer: "답이에요" }], followUpsLeft: 4 }]);

    expect(forgetAccountOnDevice()).toBe(1);
    expect(listChapters()).toEqual([]);
    const kept = localStorage.getItem(MATCH_SEALS_KEY) ?? "";
    expect(kept).toContain("SEALED-PARTNER");
    // Only the seal: neither person's birth, the questions nor the answers stay readable after the logout.
    expect(kept).not.toMatch(/1990|질문이에요|답이에요|민지/);

    const { fetchImpl, posts } = account(createdAt, { chapterToken: "new.token", followUpsLeft: 4 });
    await pullAccountReadings(fetchImpl);
    expect(posts).toEqual([{ readingId: ID, sealed: "SEALED-PARTNER" }]);
    expect(listChapters()[0]).toMatchObject({ id: ID, serverId: ID, chapterToken: "new.token", followUpsLeft: 4 });
  });

  it("asks nothing for a 궁합 past its 30 days, and forgets its seal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const createdAt = NOW - 29 * DAY;
    seed([{ ...copy(createdAt), id: ID, serverId: ID, chapterToken: tokenWith("SEALED-PARTNER", createdAt + 30 * DAY) }]);
    forgetAccountOnDevice();
    vi.setSystemTime(NOW + 2 * DAY);
    const { fetchImpl, posts } = account(createdAt, { chapterToken: "new.token", followUpsLeft: 5 });
    await pullAccountReadings(fetchImpl);
    expect(posts).toEqual([]);
    expect(listChapters()[0]).toMatchObject({ chapterToken: "" });
    expect(localStorage.getItem(MATCH_SEALS_KEY) ?? "").not.toContain("SEALED-PARTNER");
  });

  it("leaves a copy without a seal on this device as it was (written on another device)", async () => {
    const { fetchImpl, posts } = account(Date.now() - DAY, null);
    await pullAccountReadings(fetchImpl);
    expect(posts).toEqual([]);
    expect(listChapters()[0]).toMatchObject({ chapterToken: "" });
  });

  describe("a seal leaves with what it was kept for (review 2026-10-17 #5)", () => {
    const sealedChapter = (createdAt: number) => ({ ...copy(createdAt), id: ID, serverId: ID, chapterToken: tokenWith("SEALED-PARTNER", createdAt + 30 * DAY) });

    it("an account's deletion takes the seals too: nothing is left to ask a token with", () => {
      seed([sealedChapter(Date.now() - DAY)]);
      expect(forgetAccountOnDevice({ accountDeleted: true })).toBe(1);
      expect(localStorage.getItem(MATCH_SEALS_KEY) ?? "").not.toContain("SEALED-PARTNER");
    });

    it("deleting the 궁합 on this device drops its seal, and erasing every record drops them all", () => {
      seed([sealedChapter(Date.now() - DAY)]);
      forgetAccountOnDevice();
      expect(localStorage.getItem(MATCH_SEALS_KEY)).toContain("SEALED-PARTNER");
      seed([{ ...copy(Date.now() - DAY), id: ID, serverId: ID }]);
      deleteChapter(ID);
      expect(localStorage.getItem(MATCH_SEALS_KEY) ?? "").not.toContain("SEALED-PARTNER");

      seed([sealedChapter(Date.now() - DAY)]);
      forgetAccountOnDevice();
      clearChapters();
      expect(localStorage.getItem(MATCH_SEALS_KEY) ?? "").not.toContain("SEALED-PARTNER");
    });
  });
});
