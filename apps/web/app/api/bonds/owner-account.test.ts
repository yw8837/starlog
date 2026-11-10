import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { ownerCookie } from "@/lib/bonds/identity";
import { chooseSign, inviteOf, saveOwner } from "@/lib/bonds/service";
import { bondsRepo, setTestDb } from "@/lib/db";
import { createD1BondsRepo } from "@/lib/db/d1BondsRepo";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { randomId, signingSecret } from "@/lib/security/sign";
import { signIn } from "@/lib/testing/bondsLogin";
import { useTestDb } from "@/lib/testing/p4";
import { POST as choosePost } from "./choose/route";
import { POST as invitePost } from "./invite/route";
import { POST as joinPost } from "./join/route";
import { POST as linkPost } from "./link/route";
import { GET as meGet } from "./me/route";
import { POST as ownerPost } from "./owner/route";
import { GET as rankingGet } from "./ranking/[sign]/route";
import { POST as refillPost } from "./refill/route";
import { POST as settingsPost } from "./settings/route";
import { POST as removePost } from "./star/remove/route";
import { POST as switchPost } from "./switch/route";
import { POST as todayPost } from "./today-card/route";

/** 별자리 인연 owners belong to accounts (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"). */

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
let ip = 10;
const req = (url: string, jar: Jar, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "cf-connecting-ip": `9.9.${Math.floor(ip / 250)}.${ip++ % 250}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ME = { calendar: "solar" as const, year: 1990, month: 1, day: 1 };

interface MeBody {
  owner: { nickname: string } | null;
  signedIn: boolean;
  invite?: { code: string };
  filling?: { row: { id: string; sign: string }; stars: Array<{ nickname: string }> } | null;
  link?: { kind: "offer" } | { kind: "choose"; account: Record<string, unknown>; device: Record<string, unknown> };
}
const me = async (jar: Jar) => (await (await meGet(req("/api/bonds/me", jar))).json()) as MeBody;

/** An owner made on a device before accounts: its sl_uid cookie, belonging to no account. */
async function deviceOwner(nickname: string, sign: "aries" | "leo" = "leo"): Promise<{ jar: Jar; id: string }> {
  const id = randomId();
  await saveOwner(bondsRepo(), Date.now(), id, { nickname, birth: ME });
  await chooseSign(bondsRepo(), Date.now(), id, sign);
  const [pair = ""] = (await ownerCookie(id, signingSecret()!)).split(";");
  const index = pair.indexOf("=");
  return { jar: new Map([[pair.slice(0, index), pair.slice(index + 1)]]), id };
}

async function accountOwner(jar: Jar, nickname = "용우", sign = "aries") {
  const res = await ownerPost(req("/api/bonds/owner", jar, { nickname, birth: ME }));
  absorb(jar, res);
  expect(res.status).toBe(200);
  await choosePost(req("/api/bonds/choose", jar, { sign }));
  return ((await res.json()) as { code: string }).code;
}

describe("별자리 인연 owners belong to accounts", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    resetMemoryLimiter();
    resetDailyStore();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setTestDb(null);
  });

  it("starting needs a login; logged in, the owner belongs to the account and no device cookie names it", async () => {
    const anonymous = await ownerPost(req("/api/bonds/owner", new Map(), { nickname: "용우", birth: ME }));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ ok: false, code: "LOGIN_REQUIRED" });
    expect(await me(new Map())).toMatchObject({ owner: null, signedIn: false });
    const web: Jar = new Map();
    const userId = await signIn(web);
    expect(await me(web)).toMatchObject({ owner: null, signedIn: true });
    const res = await ownerPost(req("/api/bonds/owner", web, { nickname: "용우", birth: ME }));
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join()).not.toMatch(/sl_uid=/);
    const linked = await bondsRepo().ownerOfUser(userId);
    expect(linked?.nickname).toBe("용우");
  });

  it("another device of the account shows the same constellation, invite link and stars; a friend joins without logging in", async () => {
    const web: Jar = new Map();
    const userId = await signIn(web);
    const code = await accountOwner(web);
    const phone: Jar = new Map();
    await signIn(phone, userId);
    const [onWeb, onPhone] = [await me(web), await me(phone)];
    expect(onPhone.invite?.code).toBe(code);
    expect(onPhone.filling?.row.id).toBe(onWeb.filling?.row.id);
    // a friend, no login, from the link
    const friend: Jar = new Map();
    const joined = await joinPost(req("/api/bonds/join", friend, { code, nickname: "하늘", birth: { calendar: "solar", year: 1992, month: 8, day: 3 }, pick: 1 }));
    expect(joined.status).toBe(200);
    for (const device of [web, phone]) expect((await me(device)).filling?.stars.map((s) => s.nickname)).toEqual(["하늘"]);
    // logged out, the same browser shows nobody's constellation
    const loggedOut: Jar = new Map([...phone].filter(([name]) => !name.includes("sl_sid")));
    expect(await me(loggedOut)).toMatchObject({ owner: null, signedIn: false });
  });

  it("hides an owner made on a device before accounts from a device with no session: nothing of it anywhere, every action answers the login, and it stays (owner 2026-11-05)", async () => {
    const { jar, id } = await deviceOwner("예전주인");
    const friend: Jar = new Map();
    const { code } = await inviteOf(bondsRepo(), Date.now(), id);
    const joined = await joinPost(req("/api/bonds/join", friend, { code, nickname: "하늘친구", birth: { calendar: "solar", year: 1992, month: 8, day: 3 }, pick: 1, scoreNotice: true }));
    expect(joined.status).toBe(200);
    const { score, starId } = (await joined.json()) as { score: number; starId: string };
    const secretWords = /예전주인|하늘친구|"leo"|"score"|"stars"|"filling"|"invite"/;

    // /api/bonds/me: no owner, only the marker, on the page and on the home row alike.
    for (const path of ["/api/bonds/me", "/api/bonds/me?view=home"]) {
      const body = (await (await meGet(req(path, jar))).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ owner: null, signedIn: false, ownerHidden: true });
      expect(JSON.stringify(body)).not.toMatch(secretWords);
    }
    // The ranking has no `mine`, nor a row marked as its own.
    const ranking = (await (await rankingGet(req("/api/bonds/ranking/leo", jar), { params: Promise.resolve({ sign: "leo" }) })).json()) as { mine: unknown; filling: unknown };
    expect(ranking.mine ?? null).toBeNull();
    expect(ranking.filling ?? null).toBeNull();
    // What only an owner may do answers the login, not a confusing error.
    const asks: Array<[string, () => Promise<Response>]> = [
      ["today-card", () => todayPost(req("/api/bonds/today-card", jar, { starId }))],
      ["choose", () => choosePost(req("/api/bonds/choose", jar, { sign: "aries" }))],
      ["switch", () => switchPost(req("/api/bonds/switch", jar, { sign: "aries" }))],
      ["refill", () => refillPost(req("/api/bonds/refill", jar, { sign: "aries" }))],
      ["invite", () => invitePost(req("/api/bonds/invite", jar, {}))],
      ["settings", () => settingsPost(req("/api/bonds/settings", jar, { rankingPublic: false }))],
      ["star/remove", () => removePost(req("/api/bonds/star/remove", jar, { starId }))],
    ];
    for (const [name, ask] of asks) {
      const res = await ask();
      expect(res.status, name).toBe(401);
      expect(await res.json(), name).toEqual({ ok: false, code: "LOGIN_REQUIRED" });
    }
    // Its own invite link: no joining its own constellation as a friend.
    const self = await joinPost(req("/api/bonds/join", jar, { code, nickname: "다른이름", birth: { calendar: "solar", year: 1995, month: 1, day: 1 }, pick: 2 }));
    expect(self.status).toBe(403);
    expect(await self.json()).toMatchObject({ code: "SELF_JOIN" });

    // A login: the very same owner and star, and 연결하기 as before.
    await signIn(jar);
    const back = await me(jar);
    expect(back).toMatchObject({ owner: { nickname: "예전주인" }, signedIn: true, link: { kind: "offer" } });
    expect(back.filling?.row.sign).toBe("leo");
    expect(back.filling?.stars.map((star) => star.nickname)).toEqual(["하늘친구"]);
    expect((back.filling?.stars[0] as unknown as { score: number }).score).toBe(score);
  });

  it("logged in with an owner on the account and another on this device: neither's link joins as a friend (code review 2026-11-06)", async () => {
    const web: Jar = new Map();
    const userId = await signIn(web);
    const accountCode = await accountOwner(web, "계정주인", "aries");
    const { jar: device, id: deviceId } = await deviceOwner("기기주인", "leo");
    await signIn(device, userId);
    const { code: deviceCode } = await inviteOf(bondsRepo(), Date.now(), deviceId);
    for (const code of [accountCode, deviceCode]) {
      const res = await joinPost(req("/api/bonds/join", device, { code, nickname: "다른이름", birth: { calendar: "solar", year: 1995, month: 1, day: 1 }, pick: 0, scoreNotice: true }));
      expect(res.status, code).toBe(403);
      expect(await res.json(), code).toMatchObject({ code: "SELF_JOIN" });
    }
  });

  it("logged in on that device: offers 연결하기 and links only when asked; then the account's other devices show it", async () => {
    const { jar, id } = await deviceOwner("예전주인");
    const userId = await signIn(jar);
    const offered = await me(jar);
    expect(offered).toMatchObject({ owner: { nickname: "예전주인" }, signedIn: true, link: { kind: "offer" } });
    // not linked by opening the page
    expect(await bondsRepo().ownerOfUser(userId)).toBeNull();
    const other: Jar = new Map();
    await signIn(other, userId);
    expect((await me(other)).owner).toBeNull();
    const res = await linkPost(req("/api/bonds/link", jar, {}));
    expect(await res.json()).toMatchObject({ ok: true, kept: "device" });
    expect((await bondsRepo().ownerOfUser(userId))?.id).toBe(id);
    expect((await me(jar)).link).toBeUndefined();
    expect(await me(other)).toMatchObject({ owner: { nickname: "예전주인" } });
    expect((await me(other)).filling?.row.sign).toBe("leo");
    // linked, it is the account's: logged out, this device's cookie alone no longer opens it
    expect((await me(new Map([...jar].filter(([name]) => !name.includes("sl_sid"))))).owner).toBeNull();
  });

  it("refuses a link without a login, or with nothing on the device to link", async () => {
    const { jar } = await deviceOwner("주인");
    expect((await linkPost(req("/api/bonds/link", jar, {}))).status).toBe(401);
    const empty: Jar = new Map();
    await signIn(empty);
    expect((await linkPost(req("/api/bonds/link", empty, {}))).status).toBe(404);
  });

  it("with an owner on the account already: shows both and keeps the one chosen; the other goes with its stars", async () => {
    const web: Jar = new Map();
    const userId = await signIn(web);
    const code = await accountOwner(web, "계정주인", "aries");
    await joinPost(req("/api/bonds/join", new Map(), { code, nickname: "하늘", birth: { calendar: "solar", year: 1992, month: 8, day: 3 }, pick: 1 }));
    const { jar: device, id: deviceId } = await deviceOwner("기기주인", "leo");
    await signIn(device, userId);
    const offer = (await me(device)).link;
    expect(offer).toMatchObject({
      kind: "choose",
      account: { nickname: "계정주인", sign: "aries", filled: 1, slots: 4, completed: 0, stars: 1, createdAt: expect.any(Number) },
      device: { nickname: "기기주인", sign: "leo", filled: 0, completed: 0, stars: 0 },
    });
    // the account's owner is on screen meanwhile
    expect((await me(device)).owner?.nickname).toBe("계정주인");
    expect((await linkPost(req("/api/bonds/link", device, {}))).status).toBe(400);
    const accountId = (await bondsRepo().ownerOfUser(userId))!.id;
    const kept = await linkPost(req("/api/bonds/link", device, { keep: "device" }));
    expect(await kept.json()).toMatchObject({ ok: true, kept: "device" });
    expect(await bondsRepo().getOwner(accountId)).toBeNull();
    expect((await bondsRepo().ownerOfUser(userId))?.id).toBe(deviceId);
    for (const browser of [web, device]) expect(await me(browser)).toMatchObject({ owner: { nickname: "기기주인" } });
    expect((await me(device)).link).toBeUndefined();
  });

  it("a choice made on a stale screen is refused once another device chose (CHANGED): it never deletes the owner kept there", async () => {
    const web: Jar = new Map();
    const userId = await signIn(web);
    await accountOwner(web, "계정주인", "aries");
    const { jar: phone, id: phoneId } = await deviceOwner("폰주인", "leo");
    const { jar: laptop } = await deviceOwner("노트북주인", "aries");
    await signIn(phone, userId);
    await signIn(laptop, userId);
    const createdAtShown = async (jar: Jar) => {
      const link = (await me(jar)).link;
      if (link?.kind !== "choose") throw new Error("expected the choice");
      return link.account.createdAt as number;
    };
    const shown = { account: { createdAt: await createdAtShown(laptop) } };
    const phoneShown = { account: { createdAt: await createdAtShown(phone) } };
    expect(await (await linkPost(req("/api/bonds/link", phone, { keep: "device", accountSince: phoneShown.account.createdAt }))).json()).toMatchObject({ ok: true, kept: "device" });
    for (const keep of ["device", "account"] as const) {
      const res = await linkPost(req("/api/bonds/link", laptop, { keep, accountSince: shown.account.createdAt }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ ok: false, code: "CHANGED" });
    }
    expect((await bondsRepo().ownerOfUser(userId))?.id).toBe(phoneId);
  });

  it("keeping the account's owner deletes the device's", async () => {
    const web: Jar = new Map();
    const userId = await signIn(web);
    await accountOwner(web, "계정주인", "aries");
    const { jar: device, id: deviceId } = await deviceOwner("기기주인", "leo");
    await signIn(device, userId);
    expect(await (await linkPost(req("/api/bonds/link", device, { keep: "account" }))).json()).toMatchObject({ ok: true, kept: "account" });
    expect(await bondsRepo().getOwner(deviceId)).toBeNull();
    expect(await me(device)).toMatchObject({ owner: { nickname: "계정주인" } });
    expect((await me(device)).link).toBeUndefined();
  });

  it("deleting the account deletes its owner with its constellations, stars and invites; a device's unlinked owner stays", async () => {
    const db = useTestDb();
    const repo = createD1BondsRepo(db);
    const jar: Jar = new Map();
    const userId = await signIn(jar);
    const now = Date.now();
    for (const [id, nickname] of [["linked", "계정주인"], ["device", "기기주인"]] as const) {
      await saveOwner(repo, now, id, { nickname, birth: ME });
      await repo.insertInvite({ code: id === "linked" ? "LNKD22" : "DVCE22", ownerId: id, createdAt: now, revokedAt: null });
      await repo.insertConstellation({ id: `c-${id}`, ownerId: id, sign: "aries", status: "filling", total: 0, startedAt: now, completedAt: null });
      await repo.insertStar({ id: `s-${id}`, constellationId: `c-${id}`, slot: 0, nickname: "하늘", message: null, cardId: "cups-02", orientation: "upright", score: 80, parts: [], friendKey: "k", createdAt: now, scorePublic: true });
    }
    expect(await repo.linkOwner("linked", userId)).toBe("linked");
    expect(await deleteAccount(db, null, { userId, now })).toEqual({ ok: true, refunded: 0 });
    expect(await repo.getOwner("linked")).toBeNull();
    expect(await repo.getConstellation("c-linked")).toBeNull();
    expect(await repo.starsOf("c-linked")).toEqual([]);
    expect(await repo.inviteByCode("LNKD22")).toBeNull();
    expect((await repo.getOwner("device"))?.nickname).toBe("기기주인");
    expect((await repo.starsOf("c-device")).map((s) => s.id)).toEqual(["s-device"]);
  });
});
