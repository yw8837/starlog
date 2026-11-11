import "server-only";
import { googleMode } from "./google";
import { MOCK_CODE_PREFIX } from "./kakao";

/**
 * A Google ID token from the Starlog app's native sign-in (Credential Manager), checked the way Google's guide says a backend
 * must (developers.google.com/identity/gsi/web/guides/verify-google-id-token): it never came straight from Google's token
 * endpoint over our own TLS, so its signature is verified too, unlike the web callback's (google.ts).
 * - RS256 only; the header's `kid` picks the key from https://www.googleapis.com/oauth2/v3/certs, kept in memory for the
 *   response's Cache-Control max-age and fetched once more for a `kid` not seen yet (Google rotates its keys);
 * - then `aud` is our GOOGLE_CLIENT_ID, `iss` accounts.google.com or https://accounts.google.com, `exp` not past (60 s of clock
 *   skew), `nonce` the one the native start handed out, and `sub` (the account id) is there.
 * STARLOG_GOOGLE=mock (refused in production) takes `mock:<name>` as the account `mock-<name>`, as the code flow does.
 */

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const SKEW_MS = 60_000;
const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export class GoogleIdTokenError extends Error {
  constructor(readonly step: "format" | "alg" | "jwks" | "key" | "signature" | "aud" | "iss" | "exp" | "nonce" | "sub") {
    super(`google id_token ${step}`);
    this.name = "GoogleIdTokenError";
  }
}

type Jwk = { kty: string; n: string; e: string };

let certs: { keys: Map<string, Jwk>; until: number } | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** base64url → bytes on a plain ArrayBuffer (what crypto.subtle takes as a BufferSource). */
function bytes(part: string): Uint8Array<ArrayBuffer> {
  const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function json(part: string | undefined): Record<string, unknown> {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) throw new GoogleIdTokenError("format");
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes(part)));
    if (isRecord(value)) return value;
  } catch {
    // not JSON
  }
  throw new GoogleIdTokenError("format");
}

async function fetchCerts(fetchImpl: typeof fetch, now: number): Promise<Map<string, Jwk>> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GoogleIdTokenError("jwks");
  }
  const body: unknown = response.ok ? await response.json().catch(() => null) : null;
  if (!isRecord(body) || !Array.isArray(body.keys)) throw new GoogleIdTokenError("jwks");
  const keys = new Map<string, Jwk>();
  for (const key of body.keys) {
    if (isRecord(key) && typeof key.kid === "string" && key.kty === "RSA" && typeof key.n === "string" && typeof key.e === "string") keys.set(key.kid, { kty: "RSA", n: key.n, e: key.e });
  }
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 0);
  certs = { keys, until: now + maxAge * 1000 };
  return keys;
}

/** The key for `kid`: from memory while the certs are fresh, else (expired, or a kid not seen) from Google once. */
async function keyFor(kid: string, fetchImpl: typeof fetch, now: number): Promise<Jwk> {
  const cached = certs && certs.until > now ? certs.keys.get(kid) : undefined;
  if (cached) return cached;
  const key = (await fetchCerts(fetchImpl, now)).get(kid);
  if (!key) throw new GoogleIdTokenError("key");
  return key;
}

export async function verifyGoogleIdToken(
  idToken: string,
  expected: { audience: string; nonce: string; now: number; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv },
): Promise<{ sub: string }> {
  const env = expected.env ?? process.env;
  if (googleMode(env) === "mock" && env.NODE_ENV !== "production") {
    if (!idToken.startsWith(MOCK_CODE_PREFIX)) throw new GoogleIdTokenError("format");
    const name = idToken.slice(MOCK_CODE_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "e2e";
    return { sub: `mock-${name}` };
  }
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleIdTokenError("format");
  const [head, body, signature] = parts as [string, string, string];
  const header = json(head);
  if (header.alg !== "RS256") throw new GoogleIdTokenError("alg");
  if (typeof header.kid !== "string" || !header.kid) throw new GoogleIdTokenError("key");
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) throw new GoogleIdTokenError("signature");
  const claims = json(body);

  const jwk = await keyFor(header.kid, expected.fetchImpl ?? fetch, expected.now);
  const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true }, ALG, false, ["verify"]).catch(() => {
    throw new GoogleIdTokenError("key");
  });
  const valid = await crypto.subtle.verify(ALG, key, bytes(signature), new TextEncoder().encode(`${head}.${body}`));
  if (!valid) throw new GoogleIdTokenError("signature");

  if (claims.aud !== expected.audience || !expected.audience) throw new GoogleIdTokenError("aud");
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw new GoogleIdTokenError("iss");
  if (typeof claims.exp !== "number" || claims.exp * 1000 + SKEW_MS <= expected.now) throw new GoogleIdTokenError("exp");
  if (typeof claims.nonce !== "string" || claims.nonce !== expected.nonce) throw new GoogleIdTokenError("nonce");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new GoogleIdTokenError("sub");
  return { sub: claims.sub };
}

/** Tests only. */
export function resetGoogleKeysForTests(): void {
  certs = null;
}
