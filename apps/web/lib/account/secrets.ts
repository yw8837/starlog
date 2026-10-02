import "server-only";

/** Used only outside production, so local runs work without configuration. */
const DEV_ACCOUNT_SECRET = "starlog-dev-only-account-secret-never-used-in-production";

/**
 * STARLOG_ACCOUNT_SECRET keys the stored Kakao lookup value and encrypts saved readings. Never
 * rotate it: D1 pins it (secretCheck.ts) and account routes close when it changes. Null in
 * production when it is missing or shorter than 32 characters; account routes then answer 503.
 */
export function accountSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.STARLOG_ACCOUNT_SECRET?.trim() ?? "";
  if (secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") return null;
  return DEV_ACCOUNT_SECRET;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Every key is an HKDF-SHA256 subkey of the secret under its own purpose, so no two uses share key
 * material:
 * - `kakao-lookup`: HMAC key for kakaoKey();
 * - `secret-check`: HMAC key for the value D1 keeps to recognise the secret;
 * - `readings-v<n>`: the AES-256-GCM key for saved readings with key_version n.
 */
type Purpose = "kakao-lookup" | "secret-check" | `readings-v${number}`;

const SALT = encoder.encode("starlog-account-v1");
const baseKeys = new Map<string, Promise<CryptoKey>>();
const subkeys = new Map<string, Promise<CryptoKey>>();

function baseKey(secret: string): Promise<CryptoKey> {
  let key = baseKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
    baseKeys.set(secret, key);
  }
  return key;
}

function subkey(secret: string, purpose: Purpose): Promise<CryptoKey> {
  const id = `${purpose}\u0000${secret}`;
  let key = subkeys.get(id);
  if (!key) {
    key = (async () => {
      const params = { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(purpose) };
      return purpose.startsWith("readings-v")
        ? crypto.subtle.deriveKey(params, await baseKey(secret), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
        : crypto.subtle.deriveKey(params, await baseKey(secret), { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    })();
    subkeys.set(id, key);
  }
  return key;
}

async function mac(secret: string, purpose: "kakao-lookup" | "secret-check", text: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await subkey(secret, purpose), encoder.encode(text));
  return toBase64Url(new Uint8Array(signature));
}

/** How a login finds its account: an HMAC of the Kakao member number. The raw id is never stored. */
export function kakaoKey(kakaoId: string, secret: string): Promise<string> {
  return mac(secret, "kakao-lookup", `kakao:${kakaoId}`);
}

/** What D1 keeps (meta.account_secret_check) to recognise this secret. It reveals nothing about it. */
export function secretCheckValue(secret: string): Promise<string> {
  return mac(secret, "secret-check", "starlog-account-secret");
}

/** The key version new readings are sealed with. Each row keeps its own (readings.key_version). */
export const READING_KEY_VERSION = 1;

/**
 * JSON sealed with AES-GCM: base64url of the 12-byte IV followed by the ciphertext and tag.
 * `context` is the AES-GCM additional data: a saved reading's `${userId}:${readingId}`, so a payload
 * copied or moved to another row never opens there. It is the only format: no account existed before
 * it (key_version still names only the derived key, readings-v<N>).
 */
export async function sealJson(value: unknown, secret: string, context: string, version: number = READING_KEY_VERSION): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await subkey(secret, `readings-v${version}`),
    encoder.encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(12 + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), 12);
  return toBase64Url(out);
}

/** The sealed JSON, or null when it was altered, or sealed under another secret, key version or context. */
export async function openJson<T = unknown>(sealed: string, secret: string, context: string, version: number = READING_KEY_VERSION): Promise<T | null> {
  const bytes = fromBase64Url(sealed);
  if (!bytes || bytes.length < 29) return null; // 12-byte IV + 16-byte tag + at least 1 byte
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(context) },
      await subkey(secret, `readings-v${version}`),
      bytes.slice(12),
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}
