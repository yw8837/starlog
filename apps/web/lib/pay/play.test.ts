import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS, productById } from "./catalog";
import {
  PlayError,
  createPlayClient,
  isPendingPlayError,
  mockPlay,
  playAccountTag,
  playClient,
  playConfigProblems,
  playProductId,
  productFromPlayId,
} from "./play";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/kr.yeolmaeapps.starlog";
const TOKEN = "opaque-purchase-token.AO-J1Oz";
const T0 = Date.parse("2026-11-11T03:00:00Z");

let keys: { pem: string; publicKey: CryptoKey };
let emailSeq = 0;
/** A fresh service account per test: the access token is cached in module memory by its email. */
const account = () => ({ packageName: "kr.yeolmaeapps.starlog", clientEmail: `play-${++emailSeq}@starlog.iam.gserviceaccount.com`, privateKeyPem: keys.pem });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  if (!keys) {
    const pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const der = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
    keys = { pem: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey as CryptoKey };
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mockPlay.reset();
});

type Reply = { status: number; body?: unknown } | "network";

/** Google's two hosts: the token endpoint first (when no token is cached), then the API calls in order. */
function fakeGoogle(replies: Reply[], token: Record<string, unknown> = { access_token: "ya29.test-access", expires_in: 3599, token_type: "Bearer" }) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | undefined }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body === undefined ? undefined : String(init.body) });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json(token);
    const next = replies.shift()!;
    if (next === "network") throw new TypeError("fetch failed");
    return next.body === undefined ? new Response(null, { status: next.status }) : Response.json(next.body, { status: next.status });
  }) as typeof fetch;
  return { calls, fetchImpl, api: () => calls.filter((call) => !call.url.startsWith("https://oauth2.")) };
}

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

describe("Play product ids", () => {
  it("are the web ids with - as _, for every product, and map back only through the catalog", () => {
    expect(PRODUCTS.map((product) => playProductId(product.id))).toEqual(["tarot", "saju", "tarot_deep", "match", "newyear_2027", "set_2027"]);
    for (const product of PRODUCTS) expect(productFromPlayId(playProductId(product.id))).toBe(product);
    expect(productFromPlayId("tarot_deep")).toBe(productById("tarot-deep"));
    for (const unknown of ["tarot-deep", "moon_30", "", "TAROT"]) expect(productFromPlayId(unknown), unknown).toBeNull();
  });

  it("tags an account with the sha256 hex of its user id: 64 characters, no personal data", async () => {
    const tag = await playAccountTag("u_AbC123");
    expect(tag).toBe(createHash("sha256").update("u_AbC123").digest("hex"));
    expect(tag).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Play client", () => {
  it("signs a service-account JWT (RS256) for the androidpublisher scope and trades it for an access token", async () => {
    const google = fakeGoogle([{ status: 200, body: { purchaseState: 0, consumptionState: 0 } }]);
    const config = account();
    await createPlayClient(config, google.fetchImpl).getPurchase("tarot", TOKEN);
    const tokenCall = google.calls[0]!;
    expect(tokenCall).toMatchObject({ url: "https://oauth2.googleapis.com/token", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const form = new URLSearchParams(tokenCall.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(decode(header!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims!)).toEqual({ iss: config.clientEmail, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: T0 / 1000, exp: T0 / 1000 + 3600 });
    const signed = new TextEncoder().encode(`${header}.${claims}`);
    expect(await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Buffer.from(signature!, "base64url"), signed)).toBe(true);
    expect(google.calls[1]!.headers).toEqual({ Authorization: "Bearer ya29.test-access" });
  });

  it("reuses the access token until shortly before it expires, across clients of the same account", async () => {
    const google = fakeGoogle(Array.from({ length: 4 }, () => ({ status: 200, body: { purchaseState: 0 } })));
    const config = account();
    await createPlayClient(config, google.fetchImpl).getPurchase("tarot", TOKEN);
    await createPlayClient(config, google.fetchImpl).getPurchase("tarot", TOKEN);
    vi.setSystemTime(T0 + 3_500_000);
    await createPlayClient(config, google.fetchImpl).getPurchase("tarot", TOKEN);
    expect(google.calls.filter((call) => call.url.startsWith("https://oauth2.")).length).toBe(1);
    vi.setSystemTime(T0 + 3_560_000);
    await createPlayClient(config, google.fetchImpl).getPurchase("tarot", TOKEN);
    expect(google.calls.filter((call) => call.url.startsWith("https://oauth2.")).length).toBe(2);
  });

  it("reads a purchase: its state, Google's order id, the time, a test purchase, and the ids the app sent", async () => {
    const google = fakeGoogle([
      {
        status: 200,
        body: {
          kind: "androidpublisher#productPurchase", purchaseTimeMillis: "1762830000123", purchaseState: 0, consumptionState: 0, orderId: "GPA.3361-1234-5678-90123",
          purchaseType: 0, acknowledgementState: 0, obfuscatedExternalAccountId: "a".repeat(64), obfuscatedExternalProfileId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", regionCode: "KR",
        },
      },
      { status: 200, body: { purchaseState: 2 } },
    ]);
    const client = createPlayClient(account(), google.fetchImpl);
    expect(await client.getPurchase("set_2027", TOKEN)).toEqual({
      purchaseState: 0, consumptionState: 0, orderId: "GPA.3361-1234-5678-90123", purchaseTimeMillis: 1762830000123, test: true,
      obfuscatedAccountId: "a".repeat(64), obfuscatedProfileId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2",
    });
    // A real purchase has no purchaseType; the ids are absent for a purchase made outside the app.
    expect(await client.getPurchase("set_2027", TOKEN)).toEqual({ purchaseState: 2, consumptionState: 0, orderId: null, purchaseTimeMillis: null, test: false, obfuscatedAccountId: null, obfuscatedProfileId: null });
    expect(google.api().map((call) => [call.method, call.url])).toEqual([
      ["GET", `${BASE}/purchases/products/set_2027/tokens/${encodeURIComponent(TOKEN)}`],
      ["GET", `${BASE}/purchases/products/set_2027/tokens/${encodeURIComponent(TOKEN)}`],
    ]);
  });

  it("answers null for a token Google does not know (404, 410), and throws the rest: 5xx, timeouts and no answer are pending", async () => {
    const google = fakeGoogle([{ status: 404, body: { error: { code: 404, status: "NOT_FOUND" } } }, { status: 410 }, { status: 503 }, "network", { status: 401, body: { error: { code: 401, status: "UNAUTHENTICATED" } } }, { status: 200, body: { purchaseState: 7 } }]);
    const client = createPlayClient(account(), google.fetchImpl);
    expect(await client.getPurchase("tarot", TOKEN)).toBeNull();
    expect(await client.getPurchase("tarot", TOKEN)).toBeNull();
    const errors: unknown[] = [];
    for (let n = 0; n < 4; n++) errors.push(await client.getPurchase("tarot", TOKEN).catch((error: unknown) => error));
    expect(errors.map((error) => (error instanceof PlayError ? [error.status, error.reason, isPendingPlayError(error)] : error))).toEqual([
      [503, "UNKNOWN", true],
      [0, "NETWORK", true],
      [401, "UNAUTHENTICATED", false],
      // An answer that is not a purchase says nothing either (as parsePayment's 502 for Toss).
      [502, "BAD_RESPONSE", true],
    ]);
    expect(isPendingPlayError(new Error("anything else"))).toBe(true);
    expect(isPendingPlayError(new PlayError(429, "RESOURCE_EXHAUSTED"))).toBe(true);
    // Never the token in what an error says.
    for (const error of errors) expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it("refuses a token request Google turns down, without the key in the error", async () => {
    const google = fakeGoogle([], { error: "invalid_grant" });
    const error = await createPlayClient(account(), google.fetchImpl).getPurchase("tarot", TOKEN).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlayError);
    expect((error as PlayError).message).not.toContain("PRIVATE KEY");
    expect(google.api()).toEqual([]);
  });

  it("consumes with an empty POST and throws when Google refuses", async () => {
    const google = fakeGoogle([{ status: 200, body: {} }, { status: 400, body: { error: { code: 400, status: "FAILED_PRECONDITION" } } }]);
    const client = createPlayClient(account(), google.fetchImpl);
    await client.consume("tarot_deep", TOKEN);
    await expect(client.consume("tarot_deep", TOKEN)).rejects.toMatchObject({ status: 400, reason: "FAILED_PRECONDITION" });
    expect(google.api()[0]).toMatchObject({ method: "POST", url: `${BASE}/purchases/products/tarot_deep/tokens/${encodeURIComponent(TOKEN)}:consume`, body: undefined });
  });

  it("refunds an order by Google's order id with the purchase revoked (an empty POST), and throws when Google refuses", async () => {
    const google = fakeGoogle([{ status: 200, body: {} }, { status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT" } } }, { status: 503 }]);
    const client = createPlayClient(account(), google.fetchImpl);
    await client.refund("GPA.3361-1234-5678-90123");
    await expect(client.refund("GPA.3361-1234-5678-90123")).rejects.toMatchObject({ status: 400, reason: "INVALID_ARGUMENT" });
    const pending = await client.refund("GPA.3361-1234-5678-90123").catch((error: unknown) => error);
    expect(isPendingPlayError(pending)).toBe(true);
    expect(google.api()[0]).toMatchObject({ method: "POST", url: `${BASE}/orders/GPA.3361-1234-5678-90123:refund?revoke=true`, body: undefined });
  });

  it("lists voided purchases since a time, following every page", async () => {
    const google = fakeGoogle([
      { status: 200, body: { tokenPagination: { nextPageToken: "page-2" }, voidedPurchases: [{ kind: "androidpublisher#voidedPurchase", purchaseToken: "t1", orderId: "GPA.1", voidedTimeMillis: "1762830000000", voidedSource: 0, voidedReason: 1 }] } },
      { status: 200, body: { voidedPurchases: [{ purchaseToken: "t2", voidedTimeMillis: "1762830000500" }, { voidedTimeMillis: "1" }] } },
      { status: 200, body: {} },
    ]);
    const client = createPlayClient(account(), google.fetchImpl);
    expect(await client.listVoided({ startTime: 1762800000000 })).toEqual([
      { purchaseToken: "t1", orderId: "GPA.1", voidedTimeMillis: 1762830000000 },
      { purchaseToken: "t2", orderId: null, voidedTimeMillis: 1762830000500 },
    ]);
    expect(await client.listVoided({ startTime: 1762800000000 })).toEqual([]);
    expect(google.api().map((call) => call.url)).toEqual([
      `${BASE}/purchases/voidedpurchases?startTime=1762800000000&maxResults=1000`,
      `${BASE}/purchases/voidedpurchases?startTime=1762800000000&maxResults=1000&token=page-2`,
      `${BASE}/purchases/voidedpurchases?startTime=1762800000000&maxResults=1000`,
    ]);
  });
});

describe("this deploy's Play client", () => {
  const ACCOUNT_JSON = () => JSON.stringify({ type: "service_account", client_email: "starlog-play@starlog.iam.gserviceaccount.com", private_key: keys.pem, private_key_id: "k1" });

  it("needs the service account JSON (a Worker secret) and a package name, reported by name only", () => {
    expect(playConfigProblems(env({}))).toEqual(["PLAY_SERVICE_ACCOUNT_JSON"]);
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: "{not json" }))).toEqual(["PLAY_SERVICE_ACCOUNT_JSON"]);
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x@y" }) }))).toEqual(["PLAY_SERVICE_ACCOUNT_JSON"]);
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON() }))).toEqual([]);
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON(), PLAY_PACKAGE_NAME: "not a package" }))).toEqual(["PLAY_PACKAGE_NAME"]);
    // The secret is read from the Worker's own env when there is one (`secrets`), never from what a build baked in.
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON() }), env({}))).toEqual(["PLAY_SERVICE_ACCOUNT_JSON"]);
    expect(playConfigProblems(env({}), env({ PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON() }))).toEqual([]);
    expect(playConfigProblems(env({ PLAY_SERVICE_ACCOUNT_JSON: "{not json" })).join(" ")).not.toContain("not json");
  });

  it("is null until configured, the real client once configured, and the mock with STARLOG_PLAY=mock outside production only", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(playClient(env({ NODE_ENV: "production" }))).toBeNull();
    expect(error).not.toHaveBeenCalled();
    const real = playClient(env({ NODE_ENV: "production", PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON() }));
    expect(real).not.toBeNull();
    expect(real).not.toBe(mockPlay);
    expect(playClient(env({ NODE_ENV: "test", STARLOG_PLAY: "mock" }))).toBe(mockPlay);
    expect(playConfigProblems(env({ NODE_ENV: "production", STARLOG_PLAY: "mock" }))).toEqual(["STARLOG_PLAY=mock in production"]);
    expect(playClient(env({ NODE_ENV: "production", STARLOG_PLAY: "mock", PLAY_SERVICE_ACCOUNT_JSON: ACCOUNT_JSON() }))).toBeNull();
    expect(playClient(env({ NODE_ENV: "production", PLAY_SERVICE_ACCOUNT_JSON: "{broken" }))).toBeNull();
    // A setting that is there but wrong is logged once per isolate, by name; the key never.
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain("config.play_invalid");
    expect(String(error.mock.calls[0]![0])).not.toContain("PRIVATE KEY");
  });
});

describe("the mock Play (STARLOG_PLAY=mock)", () => {
  it("answers what a test registered, consumes once, and lists what was voided since a time", async () => {
    mockPlay.addPurchase({ token: "t_ok", playProductId: "tarot", accountTag: "tag", profileId: "order_1", test: true });
    mockPlay.addPurchase({ token: "t_pending", playProductId: "saju", state: 2, accountTag: "tag", profileId: "order_2" });
    expect(await mockPlay.getPurchase("tarot", "t_ok")).toMatchObject({ purchaseState: 0, consumptionState: 0, test: true, obfuscatedAccountId: "tag", obfuscatedProfileId: "order_1" });
    expect(await mockPlay.getPurchase("saju", "t_ok")).toBeNull();
    expect(await mockPlay.getPurchase("tarot", "t_unknown")).toBeNull();
    await mockPlay.consume("tarot", "t_ok");
    expect(await mockPlay.getPurchase("tarot", "t_ok")).toMatchObject({ consumptionState: 1 });
    await expect(mockPlay.consume("saju", "t_pending")).rejects.toBeInstanceOf(PlayError);
    await expect(mockPlay.consume("tarot", "t_unknown")).rejects.toMatchObject({ status: 404 });
    mockPlay.voidPurchase("t_ok", T0 + 5);
    expect(await mockPlay.listVoided({ startTime: T0 })).toEqual([{ purchaseToken: "t_ok", orderId: expect.any(String), voidedTimeMillis: T0 + 5 }]);
    expect(await mockPlay.listVoided({ startTime: T0 + 6 })).toEqual([]);
    mockPlay.reset();
    expect(await mockPlay.getPurchase("tarot", "t_ok")).toBeNull();
  });

  it("refunds by Google's order id: the purchase reads canceled and is listed voided; an unknown or refunded order is refused", async () => {
    mockPlay.addPurchase({ token: "t_refund", playProductId: "tarot", accountTag: "tag", profileId: "order_1" });
    const { orderId } = (await mockPlay.getPurchase("tarot", "t_refund"))!;
    await mockPlay.refund(orderId!);
    expect(await mockPlay.getPurchase("tarot", "t_refund")).toMatchObject({ purchaseState: 1 });
    expect(await mockPlay.listVoided({ startTime: T0 })).toEqual([{ purchaseToken: "t_refund", orderId, voidedTimeMillis: T0 }]);
    await expect(mockPlay.refund(orderId!)).rejects.toMatchObject({ status: 400 });
    await expect(mockPlay.refund("GPA.unknown")).rejects.toMatchObject({ status: 404 });
  });
});
