import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_JWKS_URL, GoogleIdTokenError, resetGoogleKeysForTests, verifyGoogleIdToken } from "./googleIdToken";

const CLIENT_ID = "1234-web.apps.googleusercontent.com";
const NOW = Date.parse("2026-11-11T03:00:00Z");
const NONCE = "nonce-from-native-start";
const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

const b64url = (bytes: Uint8Array | ArrayBuffer) => Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("base64url");
const part = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

let googleKey: CryptoKeyPair;
let otherKey: CryptoKeyPair;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const generate = () => crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
  [googleKey, otherKey] = await Promise.all([generate(), generate()]);
  publicJwk = await crypto.subtle.exportKey("jwk", googleKey.publicKey);
});

const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  azp: "android-client.apps.googleusercontent.com",
  sub: "109876543210987654321",
  nonce: NONCE,
  iat: NOW / 1000 - 10,
  exp: NOW / 1000 + 3600,
  ...over,
});

async function sign(payload: Record<string, unknown>, { kid = "key-1", alg = "RS256", key = googleKey.privateKey }: { kid?: string; alg?: string; key?: CryptoKey } = {}) {
  const head = `${part({ alg, kid, typ: "JWT" })}.${part(payload)}`;
  const signature = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(head));
  return `${head}.${b64url(signature)}`;
}

/** Google's certs endpoint: the JWKS with `kids` (each the test's public key), cached for `maxAge` seconds. */
function jwks(kids: string[] | (() => string[]), maxAge = 3600) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url) !== GOOGLE_JWKS_URL) throw new TypeError(`unexpected fetch ${String(url)}`);
    const list = typeof kids === "function" ? kids() : kids;
    return Response.json({ keys: list.map((kid) => ({ ...publicJwk, kid, alg: "RS256", use: "sig" })) }, { headers: { "Cache-Control": `public, max-age=${maxAge}, must-revalidate, no-transform` } });
  });
}

const verify = (token: string, fetchImpl: typeof fetch, over: Partial<{ audience: string; nonce: string; now: number }> = {}) =>
  verifyGoogleIdToken(token, { audience: CLIENT_ID, nonce: NONCE, now: NOW, fetchImpl, env: { NODE_ENV: "test" } as NodeJS.ProcessEnv, ...over });

const failsAt = async (promise: Promise<unknown>, step: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GoogleIdTokenError);
  expect((error as GoogleIdTokenError).step).toBe(step);
};

beforeEach(() => resetGoogleKeysForTests());
afterEach(() => resetGoogleKeysForTests());

describe("verifyGoogleIdToken", () => {
  it("accepts Google's RS256 token for our client with the expected nonce: its sub", async () => {
    const fetchImpl = jwks(["key-1"]);
    await expect(verify(await sign(claims()), fetchImpl as unknown as typeof fetch)).resolves.toEqual({ sub: "109876543210987654321" });
    // both spellings of the issuer
    await expect(verify(await sign(claims({ iss: "accounts.google.com" })), fetchImpl as unknown as typeof fetch)).resolves.toEqual({ sub: "109876543210987654321" });
  });

  it("keeps the keys for the certs' max-age, and fetches again once it has passed", async () => {
    const fetchImpl = jwks(["key-1"], 600) as unknown as typeof fetch;
    const token = await sign(claims());
    await verify(token, fetchImpl);
    await verify(token, fetchImpl, { now: NOW + 599_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await verify(await sign(claims({ exp: NOW / 1000 + 7200 })), fetchImpl, { now: NOW + 601_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fetches the certs once more for a key id it has not seen (Google rotated), and refuses one still unknown", async () => {
    let kids = ["key-1"];
    const fetchImpl = jwks(() => kids) as unknown as typeof fetch;
    await verify(await sign(claims()), fetchImpl);
    kids = ["key-1", "key-2"];
    await expect(verify(await sign(claims(), { kid: "key-2" }), fetchImpl)).resolves.toEqual({ sub: "109876543210987654321" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await failsAt(verify(await sign(claims(), { kid: "key-9" }), fetchImpl), "key");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("refuses a signature that is not Google's key", async () => {
    await failsAt(verify(await sign(claims(), { key: otherKey.privateKey }), jwks(["key-1"]) as unknown as typeof fetch), "signature");
    // a signature made for other claims
    const good = await sign(claims());
    const swapped = `${good.split(".")[0]}.${part(claims({ sub: "someone-else" }))}.${good.split(".")[2]}`;
    await failsAt(verify(swapped, jwks(["key-1"]) as unknown as typeof fetch), "signature");
  });

  it("refuses another client's token, another issuer, and a token that has expired (60 s of clock skew allowed)", async () => {
    const fetchImpl = jwks(["key-1"]) as unknown as typeof fetch;
    await failsAt(verify(await sign(claims({ aud: "other.apps.googleusercontent.com" })), fetchImpl), "aud");
    await failsAt(verify(await sign(claims({ aud: [CLIENT_ID] })), fetchImpl), "aud");
    await failsAt(verify(await sign(claims({ iss: "https://evil.example.com" })), fetchImpl), "iss");
    await failsAt(verify(await sign(claims({ exp: NOW / 1000 - 61 })), fetchImpl), "exp");
    await expect(verify(await sign(claims({ exp: NOW / 1000 - 30 })), fetchImpl)).resolves.toEqual({ sub: "109876543210987654321" });
  });

  it("refuses another sign-in's nonce, a missing nonce, and an empty sub", async () => {
    const fetchImpl = jwks(["key-1"]) as unknown as typeof fetch;
    await failsAt(verify(await sign(claims({ nonce: "someone-elses" })), fetchImpl), "nonce");
    await failsAt(verify(await sign(claims({ nonce: undefined })), fetchImpl), "nonce");
    await failsAt(verify(await sign(claims({ sub: "" })), fetchImpl), "sub");
  });

  it("takes RS256 only: alg none and HS256 are refused before any key is fetched", async () => {
    const fetchImpl = jwks(["key-1"]) as unknown as typeof fetch;
    const none = `${part({ alg: "none", kid: "key-1" })}.${part(claims())}.`;
    await failsAt(verify(none, fetchImpl), "alg");
    const hs = `${part({ alg: "HS256", kid: "key-1" })}.${part(claims())}.${b64url(new Uint8Array(32))}`;
    await failsAt(verify(hs, fetchImpl), "alg");
    await failsAt(verify("not-a-jwt", fetchImpl), "format");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses when Google's certs cannot be fetched", async () => {
    const token = await sign(claims());
    await failsAt(verify(token, vi.fn(async () => new Response("down", { status: 503 })) as unknown as typeof fetch), "jwks");
    await failsAt(verify(token, vi.fn(async () => { throw new TypeError("network"); }) as unknown as typeof fetch), "jwks");
    await failsAt(verify(token, vi.fn(async () => Response.json({ nope: true })) as unknown as typeof fetch), "jwks");
  });

  it("with STARLOG_GOOGLE=mock (never in production) takes mock:<name> as the account mock-<name>", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const mock = { STARLOG_GOOGLE: "mock", NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;
    await expect(verifyGoogleIdToken("mock:alice", { audience: "", nonce: NONCE, now: NOW, fetchImpl, env: mock })).resolves.toEqual({ sub: "mock-alice" });
    await failsAt(verifyGoogleIdToken("alice", { audience: "", nonce: NONCE, now: NOW, fetchImpl, env: mock }), "format");
    const production = { STARLOG_GOOGLE: "mock", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    await failsAt(verifyGoogleIdToken("mock:alice", { audience: CLIENT_ID, nonce: NONCE, now: NOW, fetchImpl, env: production }), "format");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
