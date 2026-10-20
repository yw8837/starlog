import "server-only";
import { aiConfigProblems } from "@/lib/ai/config";
import { cleanUserText } from "@/lib/ai/prompts/tarot";
import { GenerationError, selectProvider, type ReadingProvider } from "@/lib/ai/provider";
import { CRISIS_LEAD, CRISIS_WORDS } from "@/lib/crisis";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import {
  FIRST_FREE_COOKIE, FIRST_FREE_COOKIE_MAX_AGE, QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, ipLimits, nextKstMidnight, quotaLimits, readFirstFree,
  readQuota, spendFirstFree, spendQuota, type QuotaKind, type QuotaState,
} from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { budgetState, clientCount, overNetworkBudget, type SpendKind } from "./spend";

/**
 * Route handler plumbing: JSON bodies with a size cap, error codes, cookies, the client key for the
 * rate limiter, and the gate every generation route passes first. Logs never carry user text or IPs.
 */

export type ErrorCode =
  | "BAD_REQUEST" | "BAD_TOKEN" | "BETA_LIMIT" | "RATE_LIMIT" | "AI_UNAVAILABLE" | "REFUSED" | "QUALITY" | "UPSTREAM"
  | "LOGIN_REQUIRED" | "PAYMENT_REQUIRED" | "NO_CREDIT" | "PAY_FAILED" | "FORBIDDEN"
  | "NOT_AVAILABLE" | "PAY_PENDING" | "NOT_REFUNDABLE" | "REFUND_WINDOW_CLOSED" | "PAY_UNAVAILABLE" | "BOT_CHECK";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  BAD_TOKEN: 400,
  BETA_LIMIT: 429,
  RATE_LIMIT: 429,
  AI_UNAVAILABLE: 503,
  REFUSED: 422,
  QUALITY: 502,
  UPSTREAM: 502,
  LOGIN_REQUIRED: 401,
  PAYMENT_REQUIRED: 402,
  NO_CREDIT: 402,
  PAY_FAILED: 402,
  FORBIDDEN: 403,
  NOT_AVAILABLE: 409,
  PAY_PENDING: 409,
  NOT_REFUNDABLE: 409,
  REFUND_WINDOW_CLOSED: 409,
  PAY_UNAVAILABLE: 503,
  BOT_CHECK: 403,
};

const MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: "요청을 읽지 못했어요. 처음부터 다시 시도해 주세요.",
  BAD_TOKEN: "카드 정보가 만료됐거나 맞지 않아요. 카드를 다시 뽑아 주세요.",
  // The code name stays BETA_LIMIT internally; the copy is launch wording (resets at 0시 KST).
  BETA_LIMIT: "오늘 쓸 수 있는 횟수를 모두 썼어요. 자정에 다시 열려요.",
  RATE_LIMIT: "요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.",
  AI_UNAVAILABLE: "지금은 풀이를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  REFUSED: "이 내용으로는 풀이를 만들 수 없어요. 질문이나 메모를 바꿔 다시 시도해 주세요.",
  // No promise about counts: the network counter is charged when a generation starts.
  QUALITY: "풀이를 제대로 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
  UPSTREAM: "풀이를 만드는 중에 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.",
  LOGIN_REQUIRED: "로그인이 필요해요. 로그인하고 다시 시도해 주세요.",
  PAYMENT_REQUIRED: "전체 풀이는 결제하고 열 수 있어요.",
  NO_CREDIT: "열 수 있는 결제한 풀이가 없어요.",
  PAY_FAILED: "결제를 마치지 못했어요. 청구된 금액은 없어요.",
  FORBIDDEN: "이 요청은 받을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  NOT_AVAILABLE: "지금은 열 수 없는 상품이에요.",
  PAY_PENDING: "결제를 확인하고 있어요. 잠시 뒤에 다시 확인해 주세요.",
  NOT_REFUNDABLE: "이미 연 풀이이거나 환불할 수 없는 결제예요.",
  REFUND_WINDOW_CLOSED: `환불 가능 기간(결제일로부터 ${REFUND_DAYS}일)이 지났어요. 문제가 있으면 문의해 주세요.`,
  PAY_UNAVAILABLE: "지금은 로그인과 결제를 쓸 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  // A free generation without a passing Turnstile token (lib/api/turnstile.ts).
  BOT_CHECK: "보안 확인을 마치지 못했어요. 다시 시도해 주세요.",
};

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...NO_STORE });
  for (const cookie of init.cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

/** Status and body of an error, for a JSON response or an NDJSON `error` event. */
export function errorPayload(code: ErrorCode, extra: Record<string, unknown> = {}): { status: number; body: Record<string, unknown> } {
  return { status: STATUS[code], body: { code, message: MESSAGE[code], ...extra } };
}

export function errorResponse(code: ErrorCode, extra: Record<string, unknown> = {}, cookies: string[] = []): Response {
  const { status, body } = errorPayload(code, extra);
  return json(body, { status, cookies });
}

export function generationErrorPayload(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof GenerationError) return errorPayload(error.code);
  console.error(JSON.stringify({ evt: "api.error", error: error instanceof Error ? error.constructor.name : typeof error }));
  return errorPayload("UPSTREAM");
}

/**
 * The parsed JSON body, or null for a wrong content type (blocks form-post CSRF; checked first, a
 * body-less request included), a body over `maxBytes`, or invalid JSON. An empty JSON body reads as `{}`.
 */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return null;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes).trim();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && !(name in out)) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

/** A cookie to set, before it is serialised (a stream sends it later through /api/commit). */
export interface CookieSpec {
  name: string;
  value: string;
  maxAge: number;
}

export const serializeCookie = (spec: CookieSpec) => setCookie(spec.name, spec.value, spec.maxAge);

/**
 * The name a login cookie goes by, for whoever reads or writes it: `__Host-<name>` in production,
 * where setCookie makes every cookie Secure with Path=/ and no Domain, so only this origin over
 * https can set it; the plain name on http://localhost, which cannot set a __Host- cookie.
 */
export function hostCookieName(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

/** httpOnly, SameSite=Lax, Secure (except plain-http local dev). */
export function setCookie(name: string, value: string, maxAgeSeconds: number, env: NodeJS.ProcessEnv = process.env): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * The network a client IP stands for: IPv4 as is, IPv6 by its /64 prefix. One host usually gets a
 * whole /64, so keying on the full IPv6 address would give it a fresh bucket per request. An
 * IPv4-mapped IPv6 address (::ffff:192.0.2.5, ::ffff:c000:205, 0:0:0:0:0:ffff:…) is its IPv4.
 */
export function ipGroup(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const hextets = expandIpv6(address);
  if (!hextets) return address;
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return [hextets[6]! >> 8, hextets[6]! & 0xff, hextets[7]! >> 8, hextets[7]! & 0xff].join(".");
  }
  return `${hextets.slice(0, 4).map((h) => h.toString(16)).join(":")}::/64`;
}

/** The eight 16-bit groups of an IPv6 address (`::` and an embedded IPv4 tail expanded), or null. */
function expandIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (text: string | undefined): number[] | null => {
    if (!text) return [];
    const out: number[] = [];
    const parts = text.split(":");
    for (const [i, part] of parts.entries()) {
      if (part.includes(".")) {
        const octets = part.split(".").map(Number);
        const valid = i === parts.length - 1 && octets.length === 4 && octets.every((o, j) => Number.isInteger(o) && o >= 0 && o <= 255 && /^\d{1,3}$/.test(part.split(".")[j]!));
        if (!valid) return null;
        out.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        out.push(parseInt(part, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

/** The rate-limit key: the client's network (ipGroup) from Cloudflare's client IP; never logged. */
export function clientKey(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() ? ipGroup(ip) : "local";
}

export interface Gate {
  secret: string;
  provider: ReadingProvider;
  owner: boolean;
  now: number;
  cookies: Record<string, string>;
  /** the client's network as an HMAC under the signing secret: the key of the server-side day counters (spend.ts) */
  client: string;
}

let loggedConfigProblems = false;

/**
 * What every generation route checks first: signing secret, provider and model/effort config valid
 * (503 otherwise; a bad config is logged once, by variable name), owner pass, and the per-IP
 * limiter (owners get the 5x limiter).
 */
export async function openGate(request: Request): Promise<Gate | Response> {
  const secret = signingSecret();
  const provider = selectProvider();
  const problems = aiConfigProblems();
  if (problems.length && !loggedConfigProblems) {
    loggedConfigProblems = true;
    console.error(JSON.stringify({ evt: "config.invalid_ai", problems }));
  }
  if (!secret || !provider || problems.length) return errorResponse("AI_UNAVAILABLE");
  const now = Date.now();
  const cookies = parseCookies(request);
  const owner = await isOwner(cookies[OWNER_COOKIE], secret, now);
  const network = clientKey(request);
  if (!(await rateLimit(owner ? "OWNER_GEN_LIMITER" : "GEN_LIMITER", network, now))) return errorResponse("RATE_LIMIT");
  return { secret, provider, owner, now, cookies, client: await keyedHash(`client:${network}`, secret) };
}

/** The full-reading limiter (the expensive calls), on top of the gate's limiter. Owners get 5x. */
export async function fullReadingLimit(request: Request, gate: Gate): Promise<Response | null> {
  const ok = await rateLimit(gate.owner ? "OWNER_FULL_LIMITER" : "FULL_LIMITER", clientKey(request), gate.now);
  return ok ? null : errorResponse("RATE_LIMIT");
}

/** Shown for a per-network limit (many phones can share one carrier IP); the UI may replace it by `scope`. */
const NETWORK_LIMIT_MESSAGE = "지금 쓰는 인터넷(와이파이·통신사)에서 오늘 열 수 있는 풀이를 모두 썼어요. 자정에 다시 열려요.";

/** This device has used its free first tarot reading (오픈 기념 무료, owner 2026-10-14): it does not come back at midnight. */
const FIRST_FREE_USED_MESSAGE = "이 기기에서는 오픈 기념 무료 풀이를 이미 받았어요.";

/** Shown when the day's budget is used up (the UI may replace it by `reason`). */
const BUDGET_MESSAGE = "오늘 준비한 풀이가 모두 나갔어요. 자정에 다시 열려요.";

/** Kinds that stop for everyone, owner included, while the day's spend cannot be trusted (the expensive ones). */
const CLOSED_FOR_OWNER_TOO: ReadonlySet<SpendKind> = new Set(["full", "teaser"]);

/**
 * The server's own limits before a new generation, counted server-side whatever the cookies say
 * (spend.ts):
 * - 503 `reason: "budget"` once the day's estimated spend reaches 80% of BETA_DAILY_BUDGET_KRW
 *   (owners too);
 * - 503 while the spend total cannot be trusted ("unknown": KV down, writes failing): full readings
 *   and teasers for everyone, follow-ups and the daily card for everyone but the owner;
 * - 429 `scope: "network"` once this client's network has used up `kind` today (owners skip it);
 * - the same 429 once the network's free-tier generations cost its share of the day's budget
 *   (spend.ts overNetworkBudget, SEC-01). Owners and `credit` openings (the signup gift, a purchase)
 *   skip it. A network total that cannot be read counts 0: the budget check above already closes
 *   when KV is down.
 * `paid`: a generation paid for on real keys (a premium follow-up) is not stopped by the free day's
 * budget, like a paid opening (which never asks it); a total that cannot be trusted still stops it.
 */
export async function checkServerLimits(
  gate: Gate, kind: SpendKind, extra: Record<string, unknown> = {}, { credit = false, paid = false }: { credit?: boolean; paid?: boolean } = {},
): Promise<Response | null> {
  const budget = await budgetState(gate.now);
  if (budget === "over" && !paid) return errorResponse("AI_UNAVAILABLE", { reason: "budget", resetsAt: nextKstMidnight(gate.now), message: BUDGET_MESSAGE });
  if (budget === "unknown" && (!gate.owner || CLOSED_FOR_OWNER_TOO.has(kind))) return errorResponse("AI_UNAVAILABLE");
  if (!gate.owner && (await clientCount(gate.client, kind, gate.now)) >= ipLimits()[kind]) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra, scope: "network", message: NETWORK_LIMIT_MESSAGE });
  }
  if (!gate.owner && !credit && (await overNetworkBudget(gate.client, gate.now))) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra, scope: "network", message: NETWORK_LIMIT_MESSAGE });
  }
  return null;
}

/**
 * Today's cookie counters, or the error when a new `kind` generation may not start: the server
 * limits (checkServerLimits), then this device's cookie quota (the owner pass skips both counters).
 */
export async function checkQuota(gate: Gate, kind: QuotaKind, extra: Record<string, unknown> = {}): Promise<QuotaState | Response> {
  const limited = await checkServerLimits(gate, kind, extra);
  if (limited) return limited;
  const quota = await readQuota(gate.cookies[QUOTA_COOKIE], gate.secret, gate.now);
  if (!gate.owner && !hasQuota(quota, kind, quotaLimits())) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra });
  }
  return quota;
}

/**
 * 오픈 기념 무료: the free tarot full readings this device has used, or the error when it may not open
 * one: the server limits (checkServerLimits: network caps, the day's budget, the network's budget
 * share), then this device's `sl_first` cookie, which never resets (429 `scope: "first"`). The owner
 * pass skips both counters.
 */
export async function checkFirstFree(gate: Gate): Promise<number | Response> {
  const limited = await checkServerLimits(gate, "full");
  if (limited) return limited;
  const used = await readFirstFree(gate.cookies[FIRST_FREE_COOKIE], gate.secret);
  if (!gate.owner && used >= quotaLimits().full) return errorResponse("BETA_LIMIT", { scope: "first", message: FIRST_FREE_USED_MESSAGE });
  return used;
}

/** The cookie that spends the free first reading; set only after a validated generation. None for the owner. */
export async function firstFreeCookies(gate: Gate, used: number): Promise<CookieSpec[]> {
  return gate.owner ? [] : [{ name: FIRST_FREE_COOKIE, value: await spendFirstFree(used, gate.secret), maxAge: FIRST_FREE_COOKIE_MAX_AGE }];
}

/** The cookie that spends one `kind`; set only after a validated generation. None for the owner. */
export async function spendCookies(gate: Gate, quota: QuotaState, kind: QuotaKind): Promise<CookieSpec[]> {
  return gate.owner ? [] : [{ name: QUOTA_COOKIE, value: await spendQuota(quota, kind, gate.secret), maxAge: QUOTA_COOKIE_MAX_AGE }];
}

/**
 * Crisis words (lib/crisis.ts CRISIS_WORDS) mean no reading, a gentle pointer to help instead. Judged on
 * the text as the prompt will see it (cleanUserText), so markup cannot split a word.
 */
// Zero-width characters cannot split a phrase (죽​고 싶어).
export const isCrisisText = (text: string | undefined) => Boolean(text) && CRISIS_WORDS.test(cleanUserText(text!).replace(/[​-‍﻿]/g, ""));

/** The care response when any user-written text reads as a crisis; null otherwise. */
export function crisisResponse(...texts: Array<string | undefined>): Response | null {
  if (!texts.some(isCrisisText)) return null;
  return errorResponse("REFUSED", {
    care: true,
    // The UI lists the hotlines (109, 1577-0199, 1388, 1588-9191) under this line; no numbers here.
    message: CRISIS_LEAD,
  });
}
