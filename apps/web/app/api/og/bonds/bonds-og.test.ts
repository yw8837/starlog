import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bondsRepo } from "@/lib/db";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { LIMITS_PER_MINUTE, resetMemoryLimiter } from "@/lib/security/rateLimit";
import { GET as meGet } from "../../bonds/me/route";
import { POST as ownerPost } from "../../bonds/owner/route";
import { POST as choosePost } from "../../bonds/choose/route";
import { POST as joinPost } from "../../bonds/join/route";
import { POST as settingsPost } from "../../bonds/settings/route";
import { GET } from "./[id]/route";

/**
 * /api/og/bonds/<id>: the owner's share image. next/og and the font download are replaced, so the test
 * reads the element tree the route hands to the renderer, i.e. exactly what would be drawn.
 */

const { drawn } = vi.hoisted(() => ({ drawn: [] as ReactElement[] }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement) {
      // the body names the render ("png 1", "png 2", …), so a test can tell which picture it was served
      super(`png ${drawn.length + 1}`, { headers: { "content-type": "image/png" } });
      drawn.push(element);
    }
  },
}));
vi.mock("@/lib/og/googleFont", () => ({ ogFonts: async () => [] }));

type Props = { children?: ReactNode };
function drawnText(element: ReactElement): string {
  const out: string[] = [];
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "string" || typeof node === "number") return void out.push(String(node));
    if (isValidElement(node)) walk((node as ReactElement<Props>).props.children);
  };
  walk(element);
  return out.join(" ");
}

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

const OWNER_BIRTH = { calendar: "solar", year: 1990, month: 1, day: 1 };
const FRIEND_BIRTHS = [[1991, 5, 12], [1992, 8, 3], [1988, 11, 20], [1995, 2, 28]] as const;
/** every year of birth in play: none of them may reach the picture */
const BIRTH_YEARS = /1988|1990|1991|1992|1995/;

async function completedAries() {
  const owner: Jar = new Map();
  absorb(owner, await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: OWNER_BIRTH })));
  await choosePost(req("/api/bonds/choose", owner, { sign: "aries" }));
  const { invite } = (await (await meGet(req("/api/bonds/me", owner))).json()) as { invite: { code: string } };
  for (const [i, [year, month, day]] of FRIEND_BIRTHS.entries()) {
    const res = await joinPost(req("/api/bonds/join", new Map(), { code: invite.code, nickname: `친구${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `7.7.7.${i}`));
    expect(res.status).toBe(200);
  }
  const me = (await (await meGet(req("/api/bonds/me", owner))).json()) as { completed: { id: string; total: number; stars: { nickname: string; score: number }[] }[] };
  return { owner, constellation: me.completed[0]! };
}

const image = (id: string, size = "feed") => GET(new Request(`http://localhost/api/og/bonds/${id}?size=${size}`, { headers: { "cf-connecting-ip": "8.8.8.8" } }), { params: Promise.resolve({ id }) });

describe("share image route", () => {
  const store = new Map<string, Response>();
  beforeEach(() => {
    drawn.length = 0;
    store.clear();
    // a fresh in-memory repository per test (lib/db/index.ts keeps one per process on globalThis), so ranks start from empty
    delete (globalThis as Record<string, unknown>).__starlogMemoryBondsRepo;
    vi.stubEnv("STARLOG_AI", "mock");
    resetMemoryLimiter();
    resetDailyStore();
    vi.stubGlobal("caches", {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res.clone()),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws the owner and sign, my total, my all-time rank and every friend's nickname, but no friend's score and never a birth date", async () => {
    const { constellation } = await completedAries();
    const res = await image(constellation.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(drawn).toHaveLength(1);
    const text = drawnText(drawn[0]!);
    expect(text).toContain("용우님의 양자리");
    expect(text).toContain(String(constellation.total));
    expect(text).toContain("양자리 1위");
    expect(constellation.stars).toHaveLength(4);
    // scores are 55~99, so none can pass for the 3-digit total, the rank or a part of the date
    const numbers = new Set(text.match(/\d+/g));
    for (const star of constellation.stars) {
      expect(text).toContain(star.nickname);
      expect(numbers.has(String(star.score)), `${star.nickname}'s score ${star.score}`).toBe(false);
    }
    expect(text).not.toMatch(BIRTH_YEARS);
    expect(text).not.toMatch(/생년|생일|태어/);
    // the story size draws the same facts
    await image(constellation.id, "story");
    const story = drawnText(drawn.at(-1)!);
    expect(story).toContain("양자리 1위");
    expect(story).toContain(constellation.stars[0]!.nickname);
  });

  it("serves a repeat request from the cache, but a changed rank never meets the old picture", async () => {
    const { constellation } = await completedAries();
    const first = await image(constellation.id);
    expect(drawn).toHaveLength(1);
    expect(drawnText(drawn[0]!)).toContain("양자리 1위");
    // nothing changed: no second render, the same bytes
    expect(await (await image(constellation.id)).text()).toBe(await first.text());
    expect(drawn).toHaveLength(1);
    // someone completes 양자리 with a higher total: this one is 2위 now, so the picture is drawn again
    const repo = bondsRepo();
    const basis = (await repo.getOwner((await repo.getConstellation(constellation.id))!.ownerId))!.basis;
    await repo.upsertOwner({ id: "rival", nickname: "라이벌", rankingPublic: true, basis, lastRefillAt: null, createdAt: 1, joinsDay: null, joinsCount: 0 });
    await repo.insertConstellation({ id: "rival-c", ownerId: "rival", sign: "aries", status: "complete", total: constellation.total + 50, startedAt: 1, completedAt: Date.now() });
    await image(constellation.id);
    expect(drawn).toHaveLength(2);
    const text = drawnText(drawn[1]!);
    expect(text).toContain("양자리 2위");
    expect(text).not.toContain("양자리 1위");
    // one cache entry per picture, plus the last picture under the id and size alone; the browser is told to ask again
    const keys = [...store.keys()].filter((key) => key.includes("/api/og/bonds/"));
    expect(keys.filter((key) => key.includes("&v="))).toHaveLength(2);
    expect(keys.filter((key) => !key.includes("&v="))).toHaveLength(1);
    expect((await image(constellation.id)).headers.get("cache-control")).toMatch(/no-cache/);
  });

  it("leaves the rank out when the owner is kept off the rankings, but still draws the members", async () => {
    const { owner, constellation } = await completedAries();
    await settingsPost(req("/api/bonds/settings", owner, { rankingPublic: false }));
    await image(constellation.id);
    const text = drawnText(drawn[0]!);
    expect(text).not.toMatch(/\d+위/);
    expect(text).toContain(constellation.stars[0]!.nickname);
  });

  it("is a 404 for an unknown id and for a constellation that is not complete yet", async () => {
    expect((await image("not-a-real-id")).status).toBe(404);
    const owner: Jar = new Map();
    absorb(owner, await ownerPost(req("/api/bonds/owner", owner, { nickname: "별지기", birth: OWNER_BIRTH }, "5.5.5.5")));
    await choosePost(req("/api/bonds/choose", owner, { sign: "leo" }));
    const me = (await (await meGet(req("/api/bonds/me", owner))).json()) as { filling: { row: { id: string } } };
    expect((await image(me.filling.row.id)).status).toBe(404);
    expect(drawn).toHaveLength(0);
  });

  it("counts a picture served from the cache against the per-network limit too: past it, a 429", async () => {
    const { constellation } = await completedAries();
    for (let i = 0; i < LIMITS_PER_MINUTE.BOND_VIEW_LIMITER; i++) expect((await image(constellation.id)).status).toBe(200);
    expect(drawn).toHaveLength(1); // one render, every other answer from the cache
    expect((await image(constellation.id)).status).toBe(429);
    expect(drawn).toHaveLength(1);
  });

  it("serves the last picture drawn for that id and size while the database cannot be read, and a 503 without one", async () => {
    const { constellation } = await completedAries();
    await image(constellation.id);
    // the rank changes, so a second picture is drawn: that one is the last
    const repo = bondsRepo();
    const basis = (await repo.getOwner((await repo.getConstellation(constellation.id))!.ownerId))!.basis;
    await repo.upsertOwner({ id: "rival", nickname: "라이벌", rankingPublic: true, basis, lastRefillAt: null, createdAt: 1, joinsDay: null, joinsCount: 0 });
    await repo.insertConstellation({ id: "rival-c", ownerId: "rival", sign: "aries", status: "complete", total: constellation.total + 50, startedAt: 1, completedAt: Date.now() });
    expect(await (await image(constellation.id)).text()).toBe("png 2");

    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(repo, "getConstellation").mockRejectedValue(new Error("D1_ERROR: storage operation exceeded timeout"));
    const res = await image(constellation.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
    expect(await res.text()).toBe("png 2");
    expect(drawn).toHaveLength(2); // nothing drawn while the database is down
    // nothing drawn before for this size, or for this id: nothing to fall back on
    expect((await image(constellation.id, "story")).status).toBe(503);
    expect((await image("never-drawn")).status).toBe(503);
    expect(quiet).toHaveBeenCalled();
  });

  it("never falls back for a constellation that is not there: that stays a 404", async () => {
    const { constellation } = await completedAries();
    await image(constellation.id);
    const repo = bondsRepo();
    vi.spyOn(repo, "getConstellation").mockResolvedValue(null);
    expect((await image(constellation.id)).status).toBe(404);
  });
});
