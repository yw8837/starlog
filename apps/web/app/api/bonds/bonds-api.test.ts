import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signIn } from "@/lib/testing/bondsLogin";
import { POST as ownerPost } from "./owner/route";
import { POST as choosePost } from "./choose/route";
import { POST as invitePost } from "./invite/route";
import { GET as resolveGet } from "./resolve/route";
import { POST as joinPost } from "./join/route";
import { GET as meGet } from "./me/route";
import { GET as rankingGet } from "./ranking/[sign]/route";
import { POST as removePost } from "./star/remove/route";
import { POST as settingsPost } from "./settings/route";
import { POST as todayPost } from "./today-card/route";

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair!.indexOf("=");
    jar.set(pair!.slice(0, index), pair!.slice(index + 1));
  }
}
const req = (url: string, jar: Jar, body?: unknown, ip = "1.1.1.1") =>
  new Request(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "cf-connecting-ip": ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ME = { calendar: "solar", year: 1990, month: 1, day: 1 };
const BIRTHS = [[1991, 5, 12], [1992, 8, 3], [1988, 11, 20], [1995, 2, 28]] as const;

async function startOwner(nickname = "용우", sign = "aries") {
  const owner: Jar = new Map();
  await signIn(owner);
  const res = await ownerPost(req("/api/bonds/owner", owner, { nickname, birth: ME }));
  absorb(owner, res);
  const { code } = (await res.json()) as { code: string };
  await choosePost(req("/api/bonds/choose", owner, { sign }));
  return { owner, code };
}

describe("bonds API", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    resetMemoryLimiter();
    resetDailyStore();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setTestDb(null);
  });

  it("runs the owner → friends → complete → ranking loop", async () => {
    const owner: Jar = new Map();
    await signIn(owner);
    let res = await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: ME }));
    absorb(owner, res);
    expect(res.status).toBe(200);
    // the owner belongs to the account (owner 2026-10-27), so no device cookie names it
    expect(res.headers.getSetCookie().join()).not.toMatch(/sl_uid=/);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    res = await choosePost(req("/api/bonds/choose", owner, { sign: "aries" }));
    expect(res.status).toBe(200);
    let last: { completed: boolean } | null = null;
    for (const [i, [year, month, day]] of BIRTHS.entries()) {
      const friend: Jar = new Map();
      res = await joinPost(req("/api/bonds/join", friend, { code, nickname: `친구${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `2.2.2.${i}`));
      expect(res.status).toBe(200);
      last = (await res.json()) as { completed: boolean };
    }
    expect(last?.completed).toBe(true);
    const me = (await (await meGet(req("/api/bonds/me", owner))).json()) as { completed: { sign: string; stars: unknown[] }[]; invite: { code: string } };
    expect(me.completed[0]?.sign).toBe("aries");
    expect(me.completed[0]?.stars).toHaveLength(4);
    expect(me.invite.code).toBe(code);
    expect(JSON.stringify(me)).not.toMatch(/friendKey|ownerId|basis/);
    const ranking = (await (await rankingGet(req("/api/bonds/ranking/aries", owner), { params: Promise.resolve({ sign: "aries" }) })).json()) as {
      all: { nickname: string; mine: boolean }[];
      week: unknown;
      mine: { allRank: number | null; weekRank: unknown };
    };
    expect(ranking.all[0]).toMatchObject({ nickname: "용우", mine: true });
    // one cumulative ranking; for one release `week` and `mine.weekRank` repeat it, so a page opened before
    // the deploy (which reads data.week) keeps working
    expect(ranking.week).toEqual(ranking.all);
    expect(ranking.mine.weekRank).toBe(ranking.mine.allRank);
    expect(JSON.stringify(ranking)).not.toMatch(/constellationId/);
  });

  it("answers `owner: null` for a device that has not started, with the best record for the 인연 랭킹 tile (still under `weekTop`)", async () => {
    const res = await meGet(req("/api/bonds/me", new Map()));
    const body = (await res.json()) as { ok: true; owner: null; weekTop: { sign: string; total: number } | null };
    // signedIn: false, so the page asks for a login before starting (owner 2026-10-27)
    expect(body).toMatchObject({ ok: true, owner: null, signedIn: false });
    expect(Object.keys(body).sort()).toEqual(["ok", "owner", "signedIn", "weekTop"]);
    // the first test completed 양자리: all-time records count
    expect(body.weekTop).toMatchObject({ sign: expect.any(String), total: expect.any(Number) });
  });

  it("lists under `joined` the constellations a friend device joined, members by nickname only; an owner sees theirs too (owner 2026-10-14)", async () => {
    const { owner, code } = await startOwner("민지", "aquarius");
    const friend: Jar = new Map();
    let res = await joinPost(req("/api/bonds/join", friend, { code, nickname: "용우", birth: ME, pick: 0, message: "비밀 쪽지" }, "3.3.3.1"));
    absorb(friend, res);
    expect(res.status).toBe(200);
    res = await joinPost(req("/api/bonds/join", new Map(), { code, nickname: "지수", birth: { calendar: "solar", year: 1991, month: 5, day: 12 }, pick: 1 }, "3.3.3.2"));
    expect(res.status).toBe(200);
    const body = (await (await meGet(req("/api/bonds/me", friend))).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      owner: null,
      joined: [{ ownerNickname: "민지", sign: "aquarius", status: "filling", filled: 2, members: [{ nickname: "용우", me: true }, { nickname: "지수", me: false }] }],
    });
    expect(JSON.stringify(body.joined)).not.toMatch(/비밀 쪽지|friendKey|constellationId|ownerId/);
    // the owner's own view has no `joined` (nothing joined from that device), and the home row's light view never asks
    expect(Object.keys((await (await meGet(req("/api/bonds/me", owner))).json()) as object)).not.toContain("joined");
    expect(Object.keys((await (await meGet(req("/api/bonds/me?view=home", friend))).json()) as object)).not.toContain("joined");
  });

  it("refuses self-joins", async () => {
    const { owner, code } = await startOwner("용우", "leo");
    const self = await joinPost(req("/api/bonds/join", owner, { code, nickname: "나야", birth: ME, pick: 0 }));
    expect(self.status).toBe(403);
    expect(await self.json()).toMatchObject({ ok: false, code: "SELF_JOIN" });
  });

  it("opens real codes generously but shuts a network out after 10 wrong codes a minute", async () => {
    const { code } = await startOwner("용우", "leo");
    const resolve = (c: string, ip: string) => resolveGet(req(`/api/bonds/resolve?code=${c}`, new Map(), undefined, ip));
    for (let i = 0; i < 30; i++) expect((await resolve(code, "9.9.9.9")).status).toBe(200);
    const wrong = [];
    for (let i = 0; i < 11; i++) wrong.push((await resolve(`ZZZZZ${"ABCDEFGHJKM"[i]}`, "8.8.8.8")).status);
    expect(wrong.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(wrong[10]).toBe(400); // the 11th wrong code is still answered, then the network is blocked
    expect((await resolve(code, "8.8.8.8")).status).toBe(429);
    const join = await joinPost(req("/api/bonds/join", new Map(), { code, nickname: "하늘", birth: ME, pick: 0 }, "8.8.8.8"));
    expect(join.status).toBe(429);
    expect((await resolve(code, "7.7.7.7")).status).toBe(200);
  });

  it("refuses a state change from another site's page", async () => {
    const res = await ownerPost(new Request("http://localhost/api/bonds/owner", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ nickname: "용우", birth: ME }),
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "BAD_ORIGIN" });
    const same = await ownerPost(new Request("http://localhost/api/bonds/owner", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ nickname: "용우", birth: ME }),
    }));
    // past the origin check, starting asks for a login (owner 2026-10-27)
    expect(same.status).toBe(401);
    expect(await same.json()).toMatchObject({ code: "LOGIN_REQUIRED" });
  });

  it("limits new owners per network, not renames", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const jar: Jar = new Map();
      await signIn(jar);
      statuses.push((await ownerPost(req("/api/bonds/owner", jar, { nickname: `주인${i}`, birth: ME }, "6.6.6.6"))).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    const owner: Jar = new Map();
    await signIn(owner);
    absorb(owner, await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: ME }, "5.4.3.2")));
    for (let i = 0; i < 12; i++) expect((await ownerPost(req("/api/bonds/owner", owner, { nickname: `이름${i}` }, "5.4.3.2"))).status).toBe(200);
  });

  it("serves the home row a light view: the latest completion's ranks, but no TOP 5", async () => {
    const { owner, code } = await startOwner("용우", "aries");
    for (const [i, [year, month, day]] of BIRTHS.entries()) {
      await joinPost(req("/api/bonds/join", new Map(), { code, nickname: `벗${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `3.3.3.${i + 10}`));
    }
    const light = (await (await meGet(req("/api/bonds/me?view=home", owner))).json()) as { ranks: Record<string, unknown>; top5: unknown[]; completed: unknown[] };
    expect(Object.keys(light.ranks)).toEqual(["aries"]);
    expect(light.ranks.aries).toEqual({ all: expect.any(Number) });
    expect(light.top5).toEqual([]);
    expect(light.completed).toHaveLength(1);
    const full = (await (await meGet(req("/api/bonds/me", owner))).json()) as { ranks: Record<string, unknown>; top5: unknown[] };
    expect(full.ranks).toEqual(light.ranks);
    expect(full.top5).toHaveLength(4);
  });

  it("never echoes the friend's birth date and lets one device join a round once", async () => {
    const { code } = await startOwner("하늘", "gemini");
    const friend: Jar = new Map();
    const res = await joinPost(req("/api/bonds/join", friend, { code, nickname: "민지", birth: { calendar: "solar", year: 1993, month: 7, day: 14 }, pick: 3, message: "늘 고마워" }, "3.3.3.3"));
    absorb(friend, res);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("민지");
    expect(text).not.toMatch(/1993|늘 고마워|"birth"/);
    expect(JSON.parse(text)).toMatchObject({ ok: true, ownerNickname: "하늘", sign: "gemini", completed: false });
    const again = await joinPost(req("/api/bonds/join", friend, { code, nickname: "민지", birth: { calendar: "solar", year: 1993, month: 7, day: 14 }, pick: 4 }, "3.3.3.3"));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "ALREADY_JOINED" });
  });

  it("answers revoked and unknown codes alike, and resolves a waiting owner", async () => {
    const owner: Jar = new Map();
    await signIn(owner);
    const res = await ownerPost(req("/api/bonds/owner", owner, { nickname: "별지기", birth: ME }));
    absorb(owner, res);
    const { code } = (await res.json()) as { code: string };
    expect(await (await resolveGet(req(`/api/bonds/resolve?code=${code.toLowerCase()}`, new Map()))).json()).toMatchObject({ ownerNickname: "별지기", sign: null });
    const next = (await (await invitePost(req("/api/bonds/invite", owner, {}))).json()) as { code: string };
    expect(next.code).not.toBe(code);
    const old = await resolveGet(req(`/api/bonds/resolve?code=${code}`, new Map()));
    const unknown = await resolveGet(req("/api/bonds/resolve?code=ZZZZZZ", new Map()));
    expect([old.status, unknown.status]).toEqual([400, 400]);
    expect(await old.json()).toEqual(await unknown.json());
  });

  it("checks inputs and identity", async () => {
    const anonymous = await ownerPost(req("/api/bonds/owner", new Map(), { nickname: "용우", birth: ME }));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ code: "LOGIN_REQUIRED" });
    const signed: Jar = new Map();
    await signIn(signed);
    expect((await ownerPost(req("/api/bonds/owner", signed, { nickname: "가", birth: ME }))).status).toBe(400);
    expect((await ownerPost(req("/api/bonds/owner", signed, { nickname: "용우" }))).status).toBe(400);
    expect((await choosePost(req("/api/bonds/choose", new Map(), { sign: "aries" }))).status).toBe(404);
    const { owner } = await startOwner("용우", "taurus");
    expect((await choosePost(req("/api/bonds/choose", owner, { sign: "ophiuchus" }))).status).toBe(400);
    expect((await choosePost(req("/api/bonds/choose", owner, { sign: "leo" }))).status).toBe(409);
    const notJson = new Request("http://localhost/api/bonds/choose", { method: "POST", headers: { "content-type": "text/plain" }, body: "sign=leo" });
    expect((await choosePost(notJson)).status).toBe(400);
    expect((await rankingGet(req("/api/bonds/ranking/x", owner), { params: Promise.resolve({ sign: "x" }) })).status).toBe(404);
  });

  it("removes a star, turns the ranking name off, and draws 오늘의 인연 카드", async () => {
    const { owner, code } = await startOwner("용우", "libra");
    for (const [i, [year, month, day]] of BIRTHS.entries()) {
      await joinPost(req("/api/bonds/join", new Map(), { code, nickname: `벗${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `4.4.4.${i}`));
    }
    let me = (await (await meGet(req("/api/bonds/me", owner))).json()) as { completed: { stars: { id: string }[] }[]; filling: unknown };
    const starId = me.completed[0]!.stars[0]!.id;

    const today = await todayPost(req("/api/bonds/today-card", owner, { starId }));
    expect(today.status).toBe(200);
    const card = (await today.json()) as { card: { cardId: string }; line: string; day: string };
    expect(card.line).toMatch(/두 사람/);
    expect(await (await todayPost(req("/api/bonds/today-card", owner, { starId }))).json()).toMatchObject({ card: card.card, line: card.line });
    expect((await todayPost(req("/api/bonds/today-card", new Map(), { starId }))).status).toBe(404);

    const off = await settingsPost(req("/api/bonds/settings", owner, { rankingPublic: false }));
    expect(await off.json()).toMatchObject({ owner: { rankingPublic: false } });
    const ranking = (await (await rankingGet(req("/api/bonds/ranking/libra", owner), { params: Promise.resolve({ sign: "libra" }) })).json()) as {
      all: unknown[]; mine: { allRank: number | null };
    };
    expect(ranking.all).toEqual([]);
    expect(ranking.mine.allRank).toBeNull();

    expect((await removePost(req("/api/bonds/star/remove", owner, { starId }))).status).toBe(200);
    me = (await (await meGet(req("/api/bonds/me", owner))).json()) as typeof me;
    expect(me.completed).toEqual([]);
    expect(me.filling).toMatchObject({ row: { sign: "libra" } });
  });

  it("is off when the feature flag is off", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config", async (original) => {
      const mod = await original<typeof import("@/lib/config")>();
      return { ...mod, SITE: { ...mod.SITE, features: { ...mod.SITE.features, bonds: false } } };
    });
    const { GET } = await import("./me/route");
    expect((await GET(req("/api/bonds/me", new Map()))).status).toBe(404);
    vi.doUnmock("@/lib/config");
  });

  it("answers 503 in production without a signing secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "");
    expect((await meGet(req("/api/bonds/me", new Map()))).status).toBe(503);
  });

  it("serves the top lists from the edge cache, but fresh ones to an owner who just made the list", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res.clone()),
      },
    });
    try {
      const get = async (jar: Jar) =>
        (await (await rankingGet(req("/api/bonds/ranking/aries", jar), { params: Promise.resolve({ sign: "aries" }) })).json()) as {
          all: { nickname: string; mine: boolean }[];
        };
      const before = await get(new Map());
      expect(store.size).toBe(1);
      const { owner, code } = await startOwner("늦별", "aries");
      for (const [i, [year, month, day]] of BIRTHS.entries()) {
        await joinPost(req("/api/bonds/join", new Map(), { code, nickname: `늦벗${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `6.6.6.${i}`));
      }
      // a visitor within the minute still gets the cached lists
      expect((await get(new Map())).all).toEqual(before.all);
      // the owner who just completed is in them, and that refreshes the cache for everyone
      expect((await get(owner)).all.find((r) => r.mine)).toMatchObject({ nickname: "늦별" });
      expect((await get(new Map())).all.some((r) => r.nickname === "늦별")).toBe(true);
      // the cache key names the sign only, with no week id in it, so nothing restarts on a Monday
      expect([...store.keys()].every((key) => !/\d{4}-\d{2}-\d{2}/.test(key))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
