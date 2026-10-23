import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { bondsRepo, setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { findShare } from "@/lib/share/store";
import { useTestDb } from "@/lib/testing/p4";
import { POST as choosePost } from "../../bonds/choose/route";
import { POST as joinPost } from "../../bonds/join/route";
import { POST as ownerPost } from "../../bonds/owner/route";
import { DELETE as bondDelete, POST as bondPost } from "../bond/route";
import { DELETE as bondsDelete, POST as bondsPost } from "./route";
import { loadBondsShare } from "@/lib/bonds/share";
import { getConstellation } from "@starlog/core";

/** 별자리 인연 results share (owner 2026-10-23): the owner's constellation and a friend's own star, each only from its own device. */

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair!.indexOf("=");
    jar.set(pair!.slice(0, index), pair!.slice(index + 1));
  }
}
const req = (url: string, jar: Jar, body: unknown, { ip = "1.1.1.1", method = "POST", origin = true } = {}) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "cf-connecting-ip": ip, ...(origin ? { origin: "http://localhost" } : {}) },
    body: JSON.stringify(body),
  });

const BIRTHS = [[1991, 5, 12], [1992, 8, 3], [1988, 11, 20], [1995, 2, 28]] as const;

/**
 * An owner of `sign` with `count` friends joined (aries has 4 slots: four complete it). `notice[i]`: friend i joined after
 * the form's score notice (owner 2026-10-23); absent: an earlier star.
 */
async function constellationWithTwo(sign = "leo", count = 2, notice: boolean[] = []) {
  const owner: Jar = new Map();
  const res = await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } }));
  absorb(owner, res);
  const { code } = (await res.json()) as { code: string };
  await choosePost(req("/api/bonds/choose", owner, { sign }));
  const friends: Array<{ jar: Jar; starId: string; score: number }> = [];
  for (const [i, [year, month, day]] of BIRTHS.slice(0, count).entries()) {
    const jar: Jar = new Map();
    const joined = await joinPost(req("/api/bonds/join", jar, { code, nickname: `친구${i}`, birth: { calendar: "solar", year, month, day }, pick: i, ...(notice[i] ? { scoreNotice: true } : {}) }, { ip: `2.2.2.${i}` }));
    absorb(jar, joined);
    const body = (await joined.json()) as { starId: string; score: number };
    friends.push({ jar, starId: body.starId, score: body.score });
  }
  const ownerId = await ownerIdOf(owner);
  const filling = await bondsRepo().fillingOf(ownerId);
  const row = filling?.sign === sign ? filling : (await bondsRepo().completedOf(ownerId)).find((c) => c.sign === sign);
  return { owner, friends, constellationId: row!.id };
}

/** The owner id behind the device cookie, read the way the routes read it. */
async function ownerIdOf(jar: Jar): Promise<string> {
  const { readOwnerId } = await import("@/lib/bonds/identity");
  const { signingSecret } = await import("@/lib/security/sign");
  return (await readOwnerId(Object.fromEntries(jar), signingSecret()!))!;
}

describe("POST /api/share/bonds and /api/share/bond", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    resetMemoryLimiter();
    resetDailyStore();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setTestDb(null);
  });

  it("the owner shares a constellation of earlier stars (joined before the score notice): the sign, the stars filled and the nicknames, no number; nobody else can", async () => {
    const db = useTestDb();
    const { owner, friends, constellationId } = await constellationWithTwo();
    const res = await bondsPost(req("/api/share/bonds", owner, { constellationId }));
    expect(res.status).toBe(200);
    const { id, path, preview } = (await res.json()) as { id: string; path: string; preview: { title: string; description: string; try: { path: string } } };
    expect(path).toBe(`/s/${id}`);
    const share = await findShare(db, id);
    expect(share?.payload).toEqual({ kind: "bonds", v: 1, constellationId });
    // These friends were told only that their nickname shows: their scores stay the owner's, and so does the total
    // (it would give them away).
    const slots = getConstellation("leo").slots;
    expect(preview.title).toBe(`용우님의 사자자리 · 별 2/${slots}`);
    expect(preview.description).toBe(`친구 2명이 별이 되어 ${slots}칸 가운데 2칸을 채웠어요`);
    expect(preview.try.path).toBe("/bonds");
    const view = await loadBondsShare(bondsRepo(), { kind: "bonds", v: 1, constellationId });
    expect(view).toMatchObject({ kind: "bonds", ownerNickname: "용우", total: null, average: null, complete: false });
    expect(view?.kind === "bonds" && view.members.map((m) => m.score)).toEqual([null, null]);
    for (const f of friends) expect(JSON.stringify({ view, preview })).not.toContain(String(f.score));
    expect(JSON.stringify(view)).not.toMatch(/message|birth|비밀/);
    // A friend's device, or a stranger's, cannot share it.
    const stranger = await bondsPost(req("/api/share/bonds", friends[0]!.jar, { constellationId }));
    expect(stranger.status).not.toBe(200);
    // Stopping takes the link down.
    const stopped = await bondsDelete(req("/api/share/bonds", owner, { constellationId }, { method: "DELETE" }));
    expect(((await stopped.json()) as { deleted: boolean }).deleted).toBe(true);
    expect(await findShare(db, id)).toBeNull();
  });

  it("while filling, every friend who joined after the score notice shows with their score, and the total and average too (owner 2026-10-23)", async () => {
    useTestDb();
    const { owner, friends, constellationId } = await constellationWithTwo("leo", 2, [true, true]);
    const { preview } = (await (await bondsPost(req("/api/share/bonds", owner, { constellationId }))).json()) as { preview: { title: string; description: string } };
    const total = friends[0]!.score + friends[1]!.score;
    const slots = getConstellation("leo").slots;
    expect(preview.title).toBe(`용우님의 사자자리 · 인연 ${total}점`);
    expect(preview.description).toBe(`친구0 · 인연 ${friends[0]!.score}점, 친구1 · 인연 ${friends[1]!.score}점 · 평균 ${Math.round(total / 2)}점`);
    const view = await loadBondsShare(bondsRepo(), { kind: "bonds", v: 1, constellationId });
    expect(view).toMatchObject({ total, average: Math.round(total / 2), complete: false, slots });
    expect(view?.kind === "bonds" && view.members).toEqual([
      { slot: 0, nickname: "친구0", score: friends[0]!.score },
      { slot: 1, nickname: "친구1", score: friends[1]!.score },
    ]);
  });

  it("with one earlier star among them: its score and the total and average stay hidden (the total minus the shown scores would give it away)", async () => {
    useTestDb();
    const { owner, friends, constellationId } = await constellationWithTwo("leo", 2, [true, false]);
    const { preview } = (await (await bondsPost(req("/api/share/bonds", owner, { constellationId }))).json()) as { preview: { title: string; description: string } };
    expect(preview.description).toBe(`친구0 · 인연 ${friends[0]!.score}점, 친구1`);
    expect(preview.title).toMatch(/^용우님의 사자자리 · 별 2\/\d+$/);
    const view = await loadBondsShare(bondsRepo(), { kind: "bonds", v: 1, constellationId });
    expect(view).toMatchObject({ total: null, average: null });
    expect(view?.kind === "bonds" && view.members.map((m) => m.score)).toEqual([friends[0]!.score, null]);
    expect(JSON.stringify({ view, preview })).not.toContain(String(friends[1]!.score));
  });

  it("a complete constellation of friends who saw the notice: its total and average show", async () => {
    useTestDb();
    const { owner, friends, constellationId } = await constellationWithTwo("aries", 4, [true, true, true, true]);
    const res = await bondsPost(req("/api/share/bonds", owner, { constellationId }));
    const { preview } = (await res.json()) as { preview: { title: string; description: string } };
    const total = friends.reduce((sum, f) => sum + f.score, 0);
    expect(preview.title).toBe(`용우님의 양자리 완성 · 인연 ${total}점`);
    expect(preview.description.endsWith(`· 평균 ${Math.round(total / 4)}점`)).toBe(true);
    expect(preview.description.startsWith(`친구0 · 인연 ${friends[0]!.score}점, `)).toBe(true);
    const view = await loadBondsShare(bondsRepo(), { kind: "bonds", v: 1, constellationId });
    expect(view).toMatchObject({ kind: "bonds", total, average: Math.round(total / 4), complete: true });
  });

  it("a friend shares their own star: their score with the owner's nickname, never the reasons (they hint at the owner's 오행 and age); the owner or another friend cannot", async () => {
    const db = useTestDb();
    const { owner, friends } = await constellationWithTwo();
    const me = friends[0]!;
    const res = await bondPost(req("/api/share/bond", me.jar, { starId: me.starId }));
    expect(res.status).toBe(200);
    const { id, preview } = (await res.json()) as { id: string; preview: { title: string } };
    expect(preview.title).toBe(`친구0님과 용우님의 인연 ${me.score}점`);
    const share = await findShare(db, id);
    expect(share?.payload).toMatchObject({ kind: "bond", starId: me.starId });
    const view = await loadBondsShare(bondsRepo(), share!.payload as never);
    expect(view).toMatchObject({ kind: "bond", score: me.score, ownerNickname: "용우" });
    expect(view).not.toHaveProperty("parts");
    // the reasons' own words (the 인연 카드's line may speak of 기운; it is the card's, not the owner's)
    expect(JSON.stringify({ view, preview })).not.toMatch(/부족한|띠가|일간이|일지가/);
    expect((await bondPost(req("/api/share/bond", friends[1]!.jar, { starId: me.starId }))).status).not.toBe(200);
    expect((await bondPost(req("/api/share/bond", owner, { starId: me.starId }))).status).not.toBe(200);
    expect((await bondDelete(req("/api/share/bond", me.jar, { starId: me.starId }, { method: "DELETE" }))).status).toBe(200);
  });

  it("refuses another site's page", async () => {
    useTestDb();
    const { owner, constellationId } = await constellationWithTwo();
    expect((await bondsPost(req("/api/share/bonds", owner, { constellationId }, { origin: false }))).status).toBe(403);
  });
});
