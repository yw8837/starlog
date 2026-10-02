// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, mergeServerReadings } from "./chapters";
import { checkDelivery } from "./sync";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const serverChapter = (question = "계정 질문", turns = 0) => ({
  kind: "tarot", question, conditions: [], note: "", cards: [card], reading,
  chapterToken: `t${turns}`, createdAt: 5, turns: Array.from({ length: turns }, (_, i) => ({ question: `q${i}`, answer: `a${i}` })), followUpsLeft: 3 - turns,
});
const ID = "abcdefghij0123456789";
const STARTED = Date.parse("2026-10-01T03:00:00Z");
const me = (user: unknown) => Response.json({ payments: true, login: true, owner: false, user });
const userWith = (over: Record<string, unknown> = {}) => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], ...over });

function stub(readings: unknown[], account: Response) {
  return vi.fn(async (url: string) => (url.startsWith("/api/readings") ? Response.json({ readings, next: null }) : account.clone())) as unknown as typeof fetch;
}

const flow = { startedAt: STARTED, matches: (chapter: unknown) => (chapter as { question?: string }).question === "이번 질문", productId: "tarot", units: 10 };

describe("account readings on this device", () => {
  it("adds readings from the account once, and takes newer follow-ups", () => {
    expect(mergeServerReadings([{ id: ID, createdAt: 5, chapter: serverChapter() }])).toBe(1);
    expect(mergeServerReadings([{ id: ID, createdAt: 5, chapter: serverChapter("계정 질문", 1) }])).toBe(0);
    const [only] = listChapters();
    expect(only).toMatchObject({ id: ID, serverId: ID, chapterToken: "t1", followUpsLeft: 2 });
    expect(only?.turns).toHaveLength(1);
  });

  it("skips what does not parse", () => {
    expect(mergeServerReadings([{ id: "bad", createdAt: 1, chapter: { kind: "tarot" } }])).toBe(0);
    expect(listChapters()).toEqual([]);
  });
});

describe("checking a cut-off paid or 별조각 reading", () => {
  it("finds the reading the server saved after the request started", async () => {
    const saved = { id: ID, createdAt: STARTED + 30_000, chapter: serverChapter("이번 질문") };
    const result = await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([saved], me(userWith())) });
    expect(result).toEqual({ status: "delivered", reading: saved });
  });

  it("ignores an older reading and one of another flow", async () => {
    const older = { id: ID, createdAt: STARTED - 10 * 60_000, chapter: serverChapter("이번 질문") };
    const other = { id: "zzzzzzzzzz0123456789", createdAt: STARTED + 1, chapter: serverChapter("다른 질문") };
    const result = await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([older, other], me(userWith())) });
    expect(result).toEqual({ status: "unknown" });
  });

  it("says kept only when the account shows the credit unused", async () => {
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([], me(userWith({ unused: [{ orderId: "o1", productId: "tarot" }] }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0], fetchImpl: stub([], me(userWith({ stardust: 10 }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0, 0], fetchImpl: stub([], me(userWith({ stardust: 0 }))) })).toEqual({ status: "unknown" });
  });

  it("asks again until it knows, and stops when told to", async () => {
    let round = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("/api/readings")) {
        round++;
        return Response.json({ readings: round < 3 ? [] : [{ id: ID, createdAt: STARTED + 1, chapter: serverChapter("이번 질문") }], next: null });
      }
      return me(userWith());
    }) as unknown as typeof fetch;
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0, 0, 0], fetchImpl })).toMatchObject({ status: "delivered" });
    const controller = new AbortController();
    controller.abort();
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0, 0], fetchImpl, signal: controller.signal })).toEqual({ status: "unknown" });
  });
});
