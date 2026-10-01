import "server-only";

/**
 * HMAC-SHA256 signed tokens and cookies on WebCrypto (`crypto.subtle`), so the same code runs on
 * Node (tests, `next dev`) and Cloudflare Workers. A token is `base64url(JSON) + "." + base64url(mac)`;
 * the payload is readable, never secret, so tokens carry only what the device already knows.
 */

/** Used only outside production, so local runs work without configuration. */
const DEV_SECRET = "starlog-dev-only-signing-secret-never-used-in-production";
const MIN_SECRET_LENGTH = 32;

/**
 * The signing secret, or null when production has none (routes answer 503 then). Outside production
 * a missing or short secret falls back to a fixed dev value.
 */
export function signingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.STARLOG_SIGNING_SECRET?.trim() ?? "";
  if (secret.length >= MIN_SECRET_LENGTH) return secret;
  if (env.NODE_ENV === "production") return null;
  return secret || DEV_SECRET;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keys.set(secret, key);
  }
  return key;
}

/** Every signed payload names its kind, so one kind of token can never be replayed as another. */
export interface SignedPayload {
  k: string;
  /** expiry, ms since epoch */
  exp?: number;
}

export async function signToken(payload: SignedPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/**
 * The payload when the signature holds, the kind matches and `exp` (if any) is in the future;
 * null for anything else (tampered, malformed, expired, other kind).
 */
export async function verifyToken<T extends SignedPayload>(token: unknown, kind: T["k"], secret: string, now = Date.now()): Promise<T | null> {
  if (typeof token !== "string" || token.length > 32_768) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const macBytes = fromBase64Url(mac);
  if (!macBytes) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), macBytes, encoder.encode(body));
  if (!ok) return null;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as SignedPayload;
  if (p.k !== kind) return null;
  if (p.exp !== undefined && !(typeof p.exp === "number" && p.exp > now)) return null;
  return payload as T;
}

/** Constant-time string comparison (both sides are MACed first, so length leaks nothing either). */
export async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  const [x, y] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

const CLIENT_ID_LABEL = "starlog/client-id/v1";
const derivedKeys = new Map<string, Promise<CryptoKey>>();

/** HMAC(secret, label) as its own HMAC key: derived values never use the token-signing key itself. */
function derivedKey(secret: string, label: string): Promise<CryptoKey> {
  const id = `${label}\u0000${secret}`;
  let key = derivedKeys.get(id);
  if (!key) {
    key = (async () => {
      const derived = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(label));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    })();
    derivedKeys.set(id, key);
    // A failed derivation is not cached: the next request tries again.
    key.catch(() => derivedKeys.delete(id));
  }
  return key;
}

/**
 * HMAC-SHA256 of `text` under a subkey derived from the secret for one purpose (`label`), base64url.
 * By default the pseudonym of a client network ("starlog/client-id/v1"). It cannot be reversed or
 * recomputed without the secret, and it is never a valid MAC for a signed token.
 */
export async function keyedHash(text: string, secret: string, label = CLIENT_ID_LABEL): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await derivedKey(secret, label), encoder.encode(text))));
}

/** URL-safe random id from `crypto.getRandomValues`. */
export function randomId(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** JSON with object keys sorted at every level, so a digest never depends on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function sha256(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}
