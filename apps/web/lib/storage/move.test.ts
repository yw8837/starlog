// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, listChapters, mergeServerReadings, saveChapter, uniqueChapters, type NewChapter } from "./chapters";
import { clearMoveMarks, isMovable, moveMarks, moveToAccount, movableNow, putOffMove } from "./move";

/** Account sync, the device side: which records may move, moving them a few at a time, and 내 기록 showing each once. */

afterEach(() => {
  clearChapters();
  clearMoveMarks();
  vi.restoreAllMocks();
});

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const tarot = (question: string, extra: Partial<NewChapter> = {}) =>
  saveChapter({ kind: "tarot", question, conditions: [{ label: "지금 상황", value: "고민 중" }], note: "메모", cards: [card], reading: reading as never, chapterToken: `token-${question}`, ...extra } as NewChapter).chapter;
const saju = () =>
  saveChapter({ kind: "saju", birth: DEFAULT_SAJU_FORM, title: "맛보기 제목", summary: "맛보기 요약", reading: { sections: [{ heading: "h", body: "b" }] } as never, chapterToken: "saju-token" }).chapter;
const SERVER = (n: number) => `${String(n).padStart(2, "0")}server0000000000000`.slice(0, 20);

type Sent = { chapters: Array<Record<string, unknown>> };

/** /api/readings/move answering each record moved (account id SERVER(i)), except the ids in `refuse`. */
function server(refuse: string[] = []) {
  const bodies: Sent[] = [];
  let n = 0;
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Sent;
    bodies.push(body);
    const ids = body.chapters.map((c) => String(c.id));
    return Response.json({
      moved: ids.filter((id) => !refuse.includes(id)).map((id) => ({ id, readingId: SERVER(++n) })),
      kept: ids.filter((id) => refuse.includes(id)).map((id) => ({ id, reason: "unverified" })),
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, bodies, calls: fetchImpl };
}

describe("records that may move into the account", () => {
  it("are this device's own tarot and saju records with a token: not one already in the account, a premium one, or a 궁합 without its token", () => {
    const own = tarot("기기에서 연 질문");
    const inAccount = tarot("계정에 있는 질문", { serverId: "abcdefghij0123456789" });
    const premium = saveChapter({ kind: "tarot-deep", question: "q", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t" } as NewChapter).chapter;
    const tokenless = tarot("토큰 없는 질문", { chapterToken: "" });
    expect(isMovable(own)).toBe(true);
    expect(isMovable(saju())).toBe(true);
    expect([inAccount, premium, tokenless].map(isMovable)).toEqual([false, false, false]);
  });
});

describe("moving them", () => {
  it("sends only the record's id, token and reading (a saju record's teaser labels too), five at a time, and takes each account id", async () => {
    const records = [...Array.from({ length: 6 }, (_, i) => tarot(`질문 ${i}`)), saju()];
    const { fetchImpl, bodies } = server();
    expect(await moveToAccount(movableNow(listChapters(), moveMarks()), fetchImpl)).toEqual({ moved: 7, kept: 0, failed: false });
    expect(bodies.map((b) => b.chapters.length)).toEqual([5, 2]);
    expect(Object.keys(bodies[0]!.chapters[0]!).sort()).toEqual(["chapterToken", "id", "reading"]);
    expect(bodies[1]!.chapters[1]).toEqual({ id: records[6]!.id, chapterToken: "saju-token", reading: records[6]!.reading, title: "맛보기 제목", summary: "맛보기 요약" });
    expect(listChapters().map((c) => c.serverId)).toEqual(Array.from({ length: 7 }, (_, i) => SERVER(i + 1)));
    // Moved: nothing left to offer, nothing sent again.
    expect(movableNow(listChapters(), moveMarks())).toEqual([]);
  });

  it("keeps on the device what the server would not take, and offers it no more", async () => {
    const good = tarot("확인되는 질문");
    const bad = tarot("확인 안 되는 질문");
    const { fetchImpl, calls } = server([bad.id]);
    expect(await moveToAccount(movableNow(listChapters(), moveMarks()), fetchImpl)).toEqual({ moved: 1, kept: 1, failed: false });
    expect(listChapters().find((c) => c.id === good.id)?.serverId).toBe(SERVER(1));
    expect(listChapters().find((c) => c.id === bad.id)?.serverId).toBeUndefined();
    expect(moveMarks().kept).toEqual([bad.id]);
    expect(movableNow(listChapters(), moveMarks())).toEqual([]);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("changes nothing when the server cannot be reached or refuses", async () => {
    tarot("질문");
    const failing = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await moveToAccount(movableNow(listChapters(), moveMarks()), failing)).toEqual({ moved: 0, kept: 0, failed: true });
    expect(listChapters()[0]?.serverId).toBeUndefined();
    expect(moveMarks().kept).toEqual([]);
  });

  it("puts the offer off for the records there are now; a record opened later is offered again", () => {
    const first = tarot("처음");
    putOffMove(movableNow(listChapters(), moveMarks()));
    expect(moveMarks().later).toEqual([first.id]);
    const later = tarot("나중");
    expect(movableNow(listChapters(), moveMarks()).map((c) => c.id)).toEqual([first.id, later.id]);
    expect(movableNow(listChapters(), moveMarks()).filter((c) => !moveMarks().later.includes(c.id)).map((c) => c.id)).toEqual([later.id]);
  });
});

describe("내 기록 shows each reading once (account + this device)", () => {
  it("drops the account copy pulled before a move whose answer was lost, once the move links the record to it", async () => {
    const own = tarot("옮긴 질문");
    // The move landed but its answer was lost; the next pull brought the account copy as a record of its own.
    mergeServerReadings([{ id: SERVER(1), createdAt: own.createdAt, chapter: { ...own, id: undefined, serverId: undefined } }]);
    expect(listChapters()).toHaveLength(2);
    const { fetchImpl } = server();
    await moveToAccount(movableNow(listChapters(), moveMarks()).filter((c) => c.id === own.id), fetchImpl);
    expect(listChapters().map((c) => [c.id, c.serverId])).toEqual([[own.id, SERVER(1)]]);
  });

  it("uniqueChapters keeps the first of records that share an id or account id", () => {
    const a = tarot("하나", { serverId: SERVER(1) });
    const b = tarot("둘");
    const copies = [a, b, { ...a, id: SERVER(1) }, { ...b }];
    expect(uniqueChapters(copies).map((c) => c.id)).toEqual([a.id, b.id]);
  });
});
