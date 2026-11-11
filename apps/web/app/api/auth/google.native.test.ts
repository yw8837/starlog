import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { GOOGLE_JWKS_URL, resetGoogleKeysForTests } from "@/lib/account/googleIdToken";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as deleteIntent } from "../account/delete-intent/route";
import { POST as agePost } from "./age/route";
import { GET as callback } from "./google/callback/route";
import { POST as nativeFinish } from "./google/native/route";
import { POST as nativeStart } from "./google/native/start/route";
import { GET as start } from "./google/start/route";
import { POST as logout } from "./logout/route";

/** Google sign-in inside the Starlog app (W2.4): Credential Manager's ID token instead of Google's web page. */

const T0 = Date.parse("2026-11-11T03:00:00Z");
const CLIENT_ID = "1234-web.apps.googleusercontent.com";
const APP_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

let googleKey: CryptoKeyPair;
beforeAll(async () => {
  googleKey = (await crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"])) as CryptoKeyPair;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_GOOGLE", "mock");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  resetMemoryLimiter();
  resetGoogleKeysForTests();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** /login's 만 14세 check with provider google: the age token its start URL carries. */
async function ageToken(b: Browser, returnTo = "/tarot/result"): Promise<string> {
  const res = await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo, provider: "google" }, origin: true });
  return new URL((await res.json()).url as string, "http://localhost").searchParams.get("age")!;
}

type Started = { state: string; nonce: string; clientId: string };

/** The app's Google button: the age token → native start → (the shell's sign-in) → native finish with `idToken`. */
async function nativeLogin(b: Browser, idToken: (started: Started) => string | Promise<string>, returnTo = "/tarot/result"): Promise<Response> {
  const started = await b.send(nativeStart, "/api/auth/google/native/start", { body: { returnTo, age: await ageToken(b, returnTo) }, origin: true });
  if (started.status !== 200) return started;
  const body = (await started.json()) as Started;
  return b.send(nativeFinish, "/api/auth/google/native", { body: { state: body.state, idToken: await idToken(body) }, origin: true });
}

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("base64url");
const part = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));
async function signed(claims: Record<string, unknown>): Promise<string> {
  const head = `${part({ alg: "RS256", kid: "k1", typ: "JWT" })}.${part(claims)}`;
  return `${head}.${b64url(await crypto.subtle.sign(ALG, googleKey.privateKey, new TextEncoder().encode(head)))}`;
}

/** From here Google is real: its certs serve the test key. */
async function realGoogle(): Promise<void> {
  vi.stubEnv("STARLOG_GOOGLE", "");
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  const jwk = await crypto.subtle.exportKey("jwk", googleKey.publicKey);
  vi.stubGlobal("fetch", async (url: string | URL | Request) => {
    if (String(url) !== GOOGLE_JWKS_URL) throw new TypeError(`unexpected fetch ${String(url)}`);
    return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] }, { headers: { "Cache-Control": "public, max-age=3600" } });
  });
}
const claimsFor = (sub: string, nonce: string, over: Record<string, unknown> = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub, nonce, iat: T0 / 1000, exp: T0 / 1000 + 3600, ...over });

describe("POST /api/auth/google/native/start and /api/auth/google/native: login", () => {
  it("hands out the state (in the signed cookie), a nonce and the client id, then logs in with the ID token and comes back to returnTo", async () => {
    const db = useTestDb();
    const b = browser();
    let started: Started | null = null;
    const done = await nativeLogin(b, (s) => {
      started = s;
      expect(b.jar.has("sl_oauth")).toBe(true);
      return "mock:alice";
    });
    expect(started!.state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(started!.nonce).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ ok: true, returnTo: "/tarot/result" });
    expect(b.jar.has("sl_sid")).toBe(true);
    expect(b.jar.has("sl_oauth")).toBe(false);
    expect((await me(b)).user).toMatchObject({ nickname: "별손님", google: true });
    expect(await one(db, "SELECT age_confirmed_at IS NOT NULL AS age FROM users")).toEqual({ age: 1 });
  });

  it("is the same account as the web's Google login (one key per Google account)", async () => {
    const db = useTestDb();
    const web = browser("198.51.100.70");
    const res = await web.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo: "/me", provider: "google" }, origin: true });
    const location = (await web.send(start, `${(await res.json()).url}&mockUser=alice`)).headers.get("location")!;
    await web.send(callback, location);
    await nativeLogin(browser("198.51.100.71"), () => "mock:alice");
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
  });

  it("answers with the existing login flags: the 만 14세 token is needed, a state is this browser's only, sign-ups stop while sales are paused", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.72");
    const noAge = await b.send(nativeStart, "/api/auth/google/native/start", { body: { returnTo: "/me" }, origin: true });
    expect(noAge.status).toBe(403);
    expect(await noAge.json()).toMatchObject({ reason: "failed" });
    expect(b.jar.has("sl_oauth")).toBe(false);
    // another browser's state
    const started = (await (await b.send(nativeStart, "/api/auth/google/native/start", { body: { returnTo: "/me", age: await ageToken(b, "/me") }, origin: true })).json()) as Started;
    const other = browser("198.51.100.73");
    const stolen = await other.send(nativeFinish, "/api/auth/google/native", { body: { state: started.state, idToken: "mock:alice" }, origin: true });
    expect(stolen.status).toBe(403);
    expect(await stolen.json()).toMatchObject({ reason: "failed" });
    expect(other.jar.has("sl_sid")).toBe(false);
    // paused: existing Google accounts only
    await nativeLogin(browser("198.51.100.74"), () => "mock:alice");
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect(await (await nativeLogin(browser("198.51.100.75"), () => "mock:alice")).json()).toEqual({ ok: true, returnTo: "/tarot/result" });
    const bob = await nativeLogin(browser("198.51.100.76"), () => "mock:bob");
    expect(await bob.json()).toMatchObject({ reason: "closed" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
  });

  it("takes our own pages only (same origin), and says unavailable while Google is not set up", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser("198.51.100.77");
    expect((await b.send(nativeStart, "/api/auth/google/native/start", { body: { returnTo: "/me", age: await ageToken(b, "/me") } })).status).toBe(403);
    vi.stubEnv("STARLOG_GOOGLE", "");
    const res = await b.send(nativeStart, "/api/auth/google/native/start", { body: { returnTo: "/me", age: await ageToken(b, "/me") }, origin: true });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: "unavailable" });
  });

  it("verifies a real ID token: Google's signature, our client, the nonce it was given", async () => {
    useTestDb();
    await realGoogle();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser("198.51.100.78");
    let clientId = "";
    const done = await nativeLogin(b, (s) => {
      clientId = s.clientId;
      return signed(claimsFor("109876543210987654321", s.nonce));
    });
    expect(clientId).toBe(CLIENT_ID);
    expect(await done.json()).toEqual({ ok: true, returnTo: "/tarot/result" });
    const other = browser("198.51.100.79");
    const wrong = await nativeLogin(other, () => signed(claimsFor("109876543210987654321", "someone-elses-nonce")));
    expect(await wrong.json()).toMatchObject({ reason: "failed" });
    expect(other.jar.has("sl_sid")).toBe(false);
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({ evt: "auth.google_failed", step: "nonce", via: "native" }));
  });
});

describe("deleting a Google account inside the app", () => {
  async function nativeDelete(b: Browser, idToken: string): Promise<Response> {
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const intent = new URL(url, "http://localhost").searchParams.get("intent")!;
    const started = (await (await b.send(nativeStart, "/api/auth/google/native/start", { body: { purpose: "delete", intent }, origin: true })).json()) as Started;
    return b.send(nativeFinish, "/api/auth/google/native", { body: { state: started.state, idToken }, origin: true });
  }

  it("re-checks with the same Google account, refunds and erases, ends the session; Google's revoke is skipped (no access token) and logged", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.80");
    await nativeLogin(b, () => "mock:alice");
    const orderId = await buy(b);
    const done = await nativeDelete(b, "mock:alice");
    expect(await done.json()).toEqual({ ok: true, deleted: true });
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(b.jar.has("sl_oauth")).toBe(false);
    expect(await one(db, "SELECT erased_at FROM users")).toEqual({ erased_at: T0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect(console.info).toHaveBeenCalledWith(JSON.stringify({ evt: "auth.google_revoke_skipped_native" }));
  });

  it("stops when another Google account answers, and needs the intent handed to this very session", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.81");
    await nativeLogin(b, () => "mock:alice");
    const mismatch = await nativeDelete(b, "mock:mallory");
    expect(await mismatch.json()).toMatchObject({ reason: "mismatch" });
    expect((await me(b)).user).not.toBeNull();
    const forged = await b.send(nativeStart, "/api/auth/google/native/start", { body: { purpose: "delete", intent: "forged" }, origin: true });
    expect(await forged.json()).toMatchObject({ reason: "failed" });
    // a Kakao account is never deleted by a Google answer
    const k = browser("198.51.100.82");
    await loginAs(k, "alice");
    const { url } = (await (await k.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const intent = new URL(url, "http://localhost").searchParams.get("intent")!;
    const started = (await (await k.send(nativeStart, "/api/auth/google/native/start", { body: { purpose: "delete", intent }, origin: true })).json()) as Started;
    expect(await (await k.send(nativeFinish, "/api/auth/google/native", { body: { state: started.state, idToken: "mock:alice" }, origin: true })).json()).toMatchObject({ reason: "mismatch" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NOT NULL")).toEqual({ n: 0 });
  });
});

describe("GET /api/auth/google/start from the Starlog app", () => {
  const fromApp = (b: Browser, url: string) => {
    const cookie = [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    return new Request(new URL(url, "http://localhost"), { headers: { cookie, "cf-connecting-ip": "198.51.100.90", "user-agent": APP_UA } });
  };

  it("goes back like an in-app browser: Google's web sign-in must not run in a WebView", async () => {
    useTestDb();
    const b = browser("198.51.100.90");
    const res = await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo: "/me", provider: "google" }, origin: true });
    const login = await start(fromApp(b, (await res.json()).url as string));
    expect(login.headers.get("location")).toBe("http://localhost/login?next=%2Fme&login=in-app");
    await nativeLogin(b, () => "mock:alice");
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect((await start(fromApp(b, url))).headers.get("location")).toBe("http://localhost/me?delete=in-app");
  });

  it("keeps a normal browser on Google's page", async () => {
    useTestDb();
    const b = browser("198.51.100.91");
    const res = await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo: "/me", provider: "google" }, origin: true });
    expect((await b.send(start, `${(await res.json()).url}&mockUser=alice`)).headers.get("location")).toContain("/api/auth/google/callback?code=");
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
  });
});
