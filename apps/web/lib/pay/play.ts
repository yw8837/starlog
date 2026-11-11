import "server-only";
import { cloudflareEnv } from "@/lib/cloudflare";
import { PRODUCTS, type Product } from "./catalog";

/**
 * Google Play billing for the Android app (plan 2026-11-11, W1), server side: the Google Play Developer API
 * (developers.google.com/android-publisher). Server only: the service account's key never leaves the Worker.
 * - Auth: a service-account JWT (RS256, signed with WebCrypto) traded at Google's token endpoint for an access token,
 *   kept in module memory until shortly before it expires (developers.google.com/identity/protocols/oauth2/service-account).
 * - purchases.products.get / :consume, orders:refund and purchases.voidedpurchases.list, each call waiting at most
 *   `timeoutMs`.
 * - Nothing here logs or throws the key, the JWT, the access token or a purchase token: an error carries Google's HTTP
 *   status and its short status word only.
 * - PLAY_SERVICE_ACCOUNT_JSON: on Workers the Worker's own secret only (as GOOGLE_* in lib/account/google.ts); elsewhere
 *   (tests, plain `next dev`) process.env. PLAY_PACKAGE_NAME: a plain var, kr.yeolmaeapps.starlog by default.
 * - STARLOG_PLAY=mock swaps Google for the in-memory mock (tests, e2e, local dev); refused in production.
 */

export const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
export const PLAY_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
export const DEFAULT_PLAY_PACKAGE = "kr.yeolmaeapps.starlog";
const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** An access token is renewed this long before Google says it expires. */
const TOKEN_MARGIN_MS = 60_000;
/** voidedpurchases pages one call follows at most (1,000 purchases each; the cron's subrequest budget, maintenance.ts). */
const MAX_VOIDED_PAGES = 3;

/** The Play product id of a web product: `-` → `_` (Play ids allow no dash): tarot, tarot_deep, set_2027, … */
export const playProductId = (id: string): string => id.replaceAll("-", "_");

/** The catalog product a Play product id names, or null: looked up in the catalog, never rebuilt from the string. */
export function productFromPlayId(playId: string): Product | null {
  return PRODUCTS.find((product) => playProductId(product.id) === playId) ?? null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The account id the app gives Google as obfuscatedAccountId (64 characters at most, no personal data): the sha256 hex of
 * the user id. Google hands it back with the purchase, so the server can tell whose purchase it is.
 */
export const playAccountTag = (userId: string): Promise<string> => sha256Hex(userId);

/** What we use of a ProductPurchase (purchases.products.get). */
export interface PlayPurchase {
  /** 0 purchased, 1 canceled, 2 pending */
  purchaseState: 0 | 1 | 2;
  /** 0 yet to be consumed, 1 consumed */
  consumptionState: 0 | 1;
  /** Google's order id (GPA.…) */
  orderId: string | null;
  purchaseTimeMillis: number | null;
  /** a license tester's purchase (purchaseType 0) */
  test: boolean;
  /** obfuscatedExternalAccountId: playAccountTag of the buyer */
  obfuscatedAccountId: string | null;
  /** obfuscatedExternalProfileId: our order id */
  obfuscatedProfileId: string | null;
}

export interface VoidedPurchase {
  purchaseToken: string;
  orderId: string | null;
  voidedTimeMillis: number;
}

export interface PlayClient {
  /** null when Google does not know the token (404, 410). */
  getPurchase(playProductId: string, token: string): Promise<PlayPurchase | null>;
  consume(playProductId: string, token: string): Promise<void>;
  /** Refunds Google's order (GPA.…, not ours) whole, the purchase revoked (orders.refund with revoke=true). */
  refund(googleOrderId: string): Promise<void>;
  /** Voided in-app purchases Google saw since `startTime` (ms, at most 30 days back), every page. */
  listVoided(input: { startTime: number }): Promise<VoidedPurchase[]>;
}

/** A Google error answer (its HTTP status and `error.status`), or status 0 / NETWORK when nothing came back. */
export class PlayError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/**
 * An answer that says nothing about the purchase: no answer, a timeout, a Google-side 5xx, or 429 (quota). Anything that is
 * not a PlayError counts too. Never treat these as a refusal: ask again later.
 */
export function isPendingPlayError(error: unknown): boolean {
  if (!(error instanceof PlayError)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

export interface PlayConfig {
  packageName: string;
  clientEmail: string;
  privateKeyPem: string;
}

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const base64UrlJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

/** The JWT a service account signs to ask for an access token (header and claims as Google's guide lists them). */
async function serviceAccountJwt(config: PlayConfig, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const unsigned = `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson({ iss: config.clientEmail, scope: PLAY_SCOPE, aud: PLAY_TOKEN_URL, iat, exp: iat + 3600 })}`;
  const der = Uint8Array.from(atob(config.privateKeyPem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

/** Access tokens by service account email, in this isolate's memory. */
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

async function send(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new PlayError(0, "NETWORK");
  }
}

/** Google's error answer as a PlayError: the HTTP status and `error.status` (never its message, which may quote a token). */
async function refusal(response: Response): Promise<PlayError> {
  const data = (await response.json().catch(() => null)) as { error?: { status?: unknown } } | null;
  return new PlayError(response.status, typeof data?.error?.status === "string" ? data.error.status : "UNKNOWN");
}

function parsePurchase(value: unknown): PlayPurchase {
  const v = (value ?? {}) as Record<string, unknown>;
  if (v.purchaseState !== 0 && v.purchaseState !== 1 && v.purchaseState !== 2) throw new PlayError(502, "BAD_RESPONSE");
  const text = (field: unknown) => (typeof field === "string" && field ? field : null);
  const millis = Number(v.purchaseTimeMillis);
  return {
    purchaseState: v.purchaseState,
    consumptionState: v.consumptionState === 1 ? 1 : 0,
    orderId: text(v.orderId),
    // Google sends it as a string (int64).
    purchaseTimeMillis: typeof v.purchaseTimeMillis === "string" && Number.isFinite(millis) ? millis : null,
    // Only set for a purchase made outside the standard flow: 0 is a license tester's.
    test: v.purchaseType === 0,
    obfuscatedAccountId: text(v.obfuscatedExternalAccountId),
    obfuscatedProfileId: text(v.obfuscatedExternalProfileId),
  };
}

export function createPlayClient(config: PlayConfig, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): PlayClient {
  const accessToken = async (): Promise<string> => {
    const cached = accessTokens.get(config.clientEmail);
    if (cached && Date.now() < cached.expiresAt - TOKEN_MARGIN_MS) return cached.token;
    const assertion = await serviceAccountJwt(config, Date.now());
    const response = await send(
      fetchImpl,
      PLAY_TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: JWT_BEARER, assertion }).toString() },
      timeoutMs,
    );
    const data = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!response.ok || typeof data?.access_token !== "string") throw new PlayError(response.ok ? 502 : response.status, "TOKEN");
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    accessTokens.set(config.clientEmail, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return data.access_token;
  };
  const call = async (method: "GET" | "POST", path: string): Promise<Response> =>
    send(fetchImpl, `${PLAY_API}/${encodeURIComponent(config.packageName)}${path}`, { method, headers: { Authorization: `Bearer ${await accessToken()}` } }, timeoutMs);
  const tokenPath = (productId: string, token: string) => `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

  return {
    async getPurchase(productId, token) {
      const response = await call("GET", tokenPath(productId, token));
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) throw await refusal(response);
      return parsePurchase(await response.json().catch(() => null));
    },
    async consume(productId, token) {
      const response = await call("POST", `${tokenPath(productId, token)}:consume`);
      if (!response.ok) throw await refusal(response);
    },
    // "The request body must be empty." / "If successful, the response body is empty." Without revoke Google refunds but
    // never lists the purchase as voided.
    async refund(googleOrderId) {
      const response = await call("POST", `/orders/${encodeURIComponent(googleOrderId)}:refund?revoke=true`);
      if (!response.ok) throw await refusal(response);
    },
    async listVoided({ startTime }) {
      const voided: VoidedPurchase[] = [];
      let page: string | null = null;
      for (let n = 0; n < MAX_VOIDED_PAGES; n++) {
        const query = new URLSearchParams({ startTime: String(startTime), maxResults: "1000", ...(page ? { token: page } : {}) });
        const response = await call("GET", `/purchases/voidedpurchases?${query}`);
        if (!response.ok) throw await refusal(response);
        const data = (await response.json().catch(() => null)) as { voidedPurchases?: unknown; tokenPagination?: { nextPageToken?: unknown } } | null;
        for (const item of Array.isArray(data?.voidedPurchases) ? (data.voidedPurchases as Array<Record<string, unknown>>) : []) {
          const at = Number(item.voidedTimeMillis);
          if (typeof item.purchaseToken !== "string" || !Number.isFinite(at)) continue;
          voided.push({ purchaseToken: item.purchaseToken, orderId: typeof item.orderId === "string" ? item.orderId : null, voidedTimeMillis: at });
        }
        page = typeof data?.tokenPagination?.nextPageToken === "string" && data.tokenPagination.nextPageToken ? data.tokenPagination.nextPageToken : null;
        if (!page) return voided;
      }
      throw new PlayError(502, "TOO_MANY_PAGES");
    },
  };
}

type SecretEnv = CloudflareEnv | NodeJS.ProcessEnv;

export type PlayMode = "google" | "mock";

export function playMode(env: NodeJS.ProcessEnv = process.env): PlayMode {
  return env.STARLOG_PLAY?.trim().toLowerCase() === "mock" ? "mock" : "google";
}

const playPackage = (env: NodeJS.ProcessEnv) => env.PLAY_PACKAGE_NAME?.trim() || DEFAULT_PLAY_PACKAGE;

/** The service account's email and key from its JSON key file, or null when it is not one. */
function serviceAccount(json: string | undefined): { clientEmail: string; privateKeyPem: string } | null {
  try {
    const value = JSON.parse(json ?? "") as { client_email?: unknown; private_key?: unknown };
    if (typeof value.client_email !== "string" || !value.client_email.includes("@")) return null;
    if (typeof value.private_key !== "string" || !value.private_key.includes("-----BEGIN PRIVATE KEY-----")) return null;
    return { clientEmail: value.client_email, privateKeyPem: value.private_key };
  } catch {
    return null;
  }
}

/** What stops Play billing from running, by variable name (never a value); empty when fine. */
export function playConfigProblems(env: NodeJS.ProcessEnv = process.env, secrets: SecretEnv = cloudflareEnv() ?? env): string[] {
  if (playMode(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_PLAY=mock in production"] : [];
  const problems: string[] = [];
  if (!serviceAccount(secrets.PLAY_SERVICE_ACCOUNT_JSON)) problems.push("PLAY_SERVICE_ACCOUNT_JSON");
  if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(playPackage(env))) problems.push("PLAY_PACKAGE_NAME");
  return problems;
}

let loggedProblems = false;

/**
 * This deploy's Play client: the mock under STARLOG_PLAY=mock (outside production), null while the service account is not
 * set (the web's own deploys) or anything is wrong (logged once, by name). `timeoutMs` shortens the 30 s wait per call
 * (the Cron Trigger's own budget).
 */
export function playClient(env: NodeJS.ProcessEnv = process.env, options: { timeoutMs?: number } = {}): PlayClient | null {
  const secrets = cloudflareEnv() ?? env;
  const problems = playConfigProblems(env, secrets);
  if (problems.length) {
    const configured = playMode(env) === "mock" || Boolean(secrets.PLAY_SERVICE_ACCOUNT_JSON?.trim());
    if (configured && !loggedProblems) {
      loggedProblems = true;
      console.error(JSON.stringify({ evt: "config.play_invalid", problems }));
    }
    return null;
  }
  if (playMode(env) === "mock") return mockPlay;
  return createPlayClient({ packageName: playPackage(env), ...serviceAccount(secrets.PLAY_SERVICE_ACCOUNT_JSON)! }, fetch, options.timeoutMs);
}

// ---- the mock ----

export interface MockPlayPurchase {
  token: string;
  playProductId: string;
  /** purchaseState, 0 (purchased) by default */
  state?: 0 | 1 | 2;
  accountTag: string | null;
  /** obfuscatedProfileId: the order id */
  profileId: string | null;
  test?: boolean;
}

export interface MockPlay extends PlayClient {
  reset(): void;
  /** Google holds this purchase (again: replaced, e.g. a pending one that went through). */
  addPurchase(purchase: MockPlayPurchase): void;
  /** Google refunded or revoked it: listVoided lists it from `voidedTimeMillis` (now by default) on. */
  voidPurchase(token: string, voidedTimeMillis?: number): void;
}

/**
 * STARLOG_PLAY=mock: an in-memory Google Play for tests, e2e and local dev. It behaves like the API where the app depends on
 * it: an unknown token (or another product's) is null, consuming needs a purchased one and happens once (consumptionState
 * 1), a refund (by Google's order id, once) cancels the purchase and voids it, and a voided purchase is listed by the time
 * it was voided.
 */
export function createMockPlay(): MockPlay {
  const purchases = new Map<string, { playProductId: string; purchase: PlayPurchase }>();
  const voided = new Map<string, number>();
  let orders = 0;
  const find = (productId: string, token: string) => {
    const held = purchases.get(token);
    return held && held.playProductId === productId ? held : null;
  };
  return {
    async getPurchase(productId, token) {
      const held = find(productId, token);
      return held ? { ...held.purchase } : null;
    },
    async consume(productId, token) {
      const held = find(productId, token);
      if (!held) throw new PlayError(404, "NOT_FOUND");
      if (held.purchase.purchaseState !== 0) throw new PlayError(400, "FAILED_PRECONDITION");
      held.purchase.consumptionState = 1;
    },
    async refund(googleOrderId) {
      const found = [...purchases].find(([, held]) => held.purchase.orderId === googleOrderId);
      if (!found) throw new PlayError(404, "NOT_FOUND");
      const [token, held] = found;
      if (voided.has(token)) throw new PlayError(400, "FAILED_PRECONDITION");
      held.purchase.purchaseState = 1;
      voided.set(token, Date.now());
    },
    async listVoided({ startTime }) {
      return [...voided].filter(([, at]) => at >= startTime).map(([purchaseToken, voidedTimeMillis]) => ({ purchaseToken, orderId: purchases.get(purchaseToken)?.purchase.orderId ?? null, voidedTimeMillis }));
    },
    addPurchase(input) {
      purchases.set(input.token, {
        playProductId: input.playProductId,
        purchase: {
          purchaseState: input.state ?? 0,
          consumptionState: 0,
          orderId: `GPA.0000-0000-0000-${String(++orders).padStart(5, "0")}`,
          purchaseTimeMillis: Date.now(),
          test: input.test === true,
          obfuscatedAccountId: input.accountTag,
          obfuscatedProfileId: input.profileId,
        },
      });
    },
    voidPurchase(token, voidedTimeMillis = Date.now()) {
      voided.set(token, voidedTimeMillis);
    },
    reset() {
      purchases.clear();
      voided.clear();
    },
  };
}

/** The one mock instance (kept on globalThis so every route bundle in `next dev` shares it). */
export const mockPlay: MockPlay = ((globalThis as unknown as { __starlogMockPlay?: MockPlay }).__starlogMockPlay ??= createMockPlay());
