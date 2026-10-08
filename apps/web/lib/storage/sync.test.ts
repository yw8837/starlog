// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAccount } from "@/lib/account/client";
import { clearChapters, listChapters, mergeServerReadings } from "./chapters";
import { checkDelivery, heldCredit } from "./sync";

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
const userWith = (over: Record<string, unknown> = {}) => ({ nickname: "별", gift: null, unused: [], ...over });
const GIFT = { status: "unused", until: "2026-12-30T14:59:59.999Z" };

function stub(readings: unknown[], account: Response) {
  return vi.fn(async (url: string) => (url.startsWith("/api/readings") ? Response.json({ readings, next: null }) : account.clone())) as unknown as typeof fetch;
}

const flow = { startedAt: STARTED, matches: (chapter: unknown) => (chapter as { question?: string }).question === "이번 질문", productId: "tarot" };

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

describe("checking a cut-off paid or gift reading", () => {
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

  it("says kept only when the account shows the purchase or the gift unused", async () => {
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([], me(userWith({ unused: [{ orderId: "o1", productId: "tarot" }] }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0], fetchImpl: stub([], me(userWith({ gift: GIFT }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0, 0], fetchImpl: stub([], me(userWith({ gift: { status: "used" } }))) })).toEqual({ status: "unknown" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0, 0], fetchImpl: stub([], me(userWith())) })).toEqual({ status: "unknown" });
  });

  it("says kept only when every purchase held at the start is unused again", async () => {
    const held = { orderIds: ["o1", "o2"] };
    const onlyOther = me(userWith({ unused: [{ orderId: "o2", productId: "tarot" }] }));
    expect(await checkDelivery({ ...flow, method: "paid", held }, { delays: [0], fetchImpl: stub([], onlyOther) })).toEqual({ status: "unknown" });
    const both = me(userWith({ unused: [{ orderId: "o2", productId: "tarot" }, { orderId: "o1", productId: "tarot" }] }));
    expect(await checkDelivery({ ...flow, method: "paid", held }, { delays: [0], fetchImpl: stub([], both) })).toEqual({ status: "kept" });
  });

  it("counts the purchases the account holds, a reservation of this kind included", () => {
    const user = parseAccount({
      payments: true, login: true, owner: false,
      user: userWith({ gift: GIFT, unused: [{ orderId: "o2", productId: "tarot" }, { orderId: "o3", productId: "saju" }], opening: [{ productId: "tarot", currency: "paid", orderId: "o1" }, { productId: "tarot", currency: "gift", orderId: null }, { productId: "saju", currency: "paid", orderId: "o4" }] }),
    })!.user;
    expect(heldCredit(user, "tarot")).toEqual({ orderIds: ["o2", "o1"] });
    expect(heldCredit(null, "tarot")).toEqual({ orderIds: [] });
  });

  it("keeps checking while the account shows a reading of this kind being opened", async () => {
    const busy = me(userWith({ unused: [{ orderId: "o2", productId: "tarot" }], gift: GIFT, opening: [{ productId: "tarot", currency: "paid", orderId: "o1" }] }));
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([], busy), stopWhenNone: true })).toEqual({ status: "unknown" });
    const spending = me(userWith({ gift: { status: "used" }, opening: [{ productId: "tarot", currency: "gift", orderId: null }] }));
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0], fetchImpl: stub([], spending), stopWhenNone: true })).toEqual({ status: "unknown" });
  });

  it("says nothing is left only when asked to, and only when the account is sure", async () => {
    const empty = () => stub([], me(userWith()));
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: empty(), stopWhenNone: true })).toEqual({ status: "none" });
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: empty() })).toEqual({ status: "unknown" });
    const down = vi.fn(async (url: string) => (url.startsWith("/api/readings") ? Response.json({ readings: [], next: null }) : new Response("", { status: 503 }))) as unknown as typeof fetch;
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: down, stopWhenNone: true })).toEqual({ status: "unknown" });
  });

  it("asks the account before the readings, so a reading saved in between is never missed", async () => {
    let saved = false;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("/api/readings")) return Response.json({ readings: saved ? [{ id: ID, createdAt: STARTED + 1, chapter: serverChapter("이번 질문") }] : [], next: null });
      saved = true; // the opening is delivered right after the account answers
      return me(userWith());
    }) as unknown as typeof fetch;
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl, stopWhenNone: true })).toMatchObject({ status: "delivered" });
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
