import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as choosePost } from "@/app/api/bonds/choose/route";
import { POST as joinPost } from "@/app/api/bonds/join/route";
import { POST as ownerPost } from "@/app/api/bonds/owner/route";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { ownerCookie } from "@/lib/bonds/identity";
import { chooseSign, inviteOf, saveOwner } from "@/lib/bonds/service";
import { bondsRepo, setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { randomId, signingSecret } from "@/lib/security/sign";
import { signIn } from "@/lib/testing/bondsLogin";
import { loadInvite } from "./loadInvite";

/** The cookies this server render sees: what the page's RSC payload is made from (app/b/[code]/page.tsx passes only this state). */
const request = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "cf-connecting-ip": "9.9.9.9" }),
  cookies: async () => ({ getAll: () => [...request.jar].map(([name, value]) => ({ name, value })) }),
}));

type Jar = Map<string, string>;
const send = (url: string, jar: Jar, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "content-type": "application/json", "cf-connecting-ip": "9.9.9.8" },
    body: JSON.stringify(body),
  });
const BIRTH = { calendar: "solar", year: 1990, month: 1, day: 1 };

async function joined() {
  const owner: Jar = new Map();
  await signIn(owner);
  const made = await ownerPost(send("/api/bonds/owner", owner, { nickname: "용우", birth: BIRTH }));
  const { code } = (await made.json()) as { code: string };
  await choosePost(send("/api/bonds/choose", owner, { sign: "aries" }));
  const friend: Jar = new Map();
  const res = await joinPost(send("/api/bonds/join", friend, { code, nickname: "하늘친구", birth: { calendar: "solar", year: 1992, month: 8, day: 3 }, pick: 3 }));
  expect(res.status).toBe(200);
  for (const line of res.headers.getSetCookie()) {
    const [pair = ""] = line.split(";");
    friend.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  }
  return { code, friend, seen: (await res.json()) as { score: number; starId: string; bondLine: string; card: { cardId: string } } };
}

describe("/b/<code> for a friend who already joined (owner 2026-11-05)", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    resetMemoryLimiter();
    resetDailyStore();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setTestDb(null);
    request.jar = new Map();
  });

  it("puts no score, card, line or nickname in what the page renders without a session, only that the star exists", async () => {
    const { code, friend, seen } = await joined();
    request.jar = friend;
    const state = await loadInvite(code);
    expect(state).toEqual({ status: "hidden", kind: "hidden", code, ownerNickname: "용우" });
    const payload = JSON.stringify(state);
    for (const hidden of ["하늘친구", seen.starId, seen.bondLine, seen.card.cardId, '"score"', '"parts"']) expect(payload).not.toContain(hidden);
  });

  it("shows the same result again once the same device has a session; a session cookie that is no good shows none", async () => {
    const { code, friend, seen } = await joined();
    request.jar = new Map([...friend, ["sl_sid", "not-a-real-session"]]);
    expect(await loadInvite(code)).toMatchObject({ status: "hidden" });
    await signIn(friend);
    request.jar = friend;
    expect(await loadInvite(code)).toMatchObject({ status: "joined", result: { nickname: "하늘친구", score: seen.score, starId: seen.starId, bondLine: seen.bondLine } });
  });

  it("on its own link, an owner with no account and no session is told it is theirs: no form to join with, no star, no score", async () => {
    const id = randomId();
    await saveOwner(bondsRepo(), Date.now(), id, { nickname: "예전주인", birth: BIRTH as never });
    await chooseSign(bondsRepo(), Date.now(), id, "leo");
    const { code } = await inviteOf(bondsRepo(), Date.now(), id);
    const [pair = ""] = (await ownerCookie(id, signingSecret()!)).split(";");
    request.jar = new Map([[pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]]);
    const state = await loadInvite(code);
    expect(state).toMatchObject({ status: "self", sign: "leo", filled: 0 });
    expect(JSON.stringify(state)).not.toMatch(/"score"|"stars"|"parts"/);
  });

  it("gives a session on another device (no friend cookie) the form, not the star: stars are kept per device, not per account", async () => {
    const { code } = await joined();
    const other: Jar = new Map();
    await signIn(other);
    request.jar = other;
    expect(await loadInvite(code)).toMatchObject({ status: "open", earlier: null, earlierHidden: false });
  });
});
