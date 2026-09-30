import "server-only";
import { aiConfigProblems } from "@/lib/ai/config";
import { GenerationError, selectProvider, type ReadingProvider } from "@/lib/ai/provider";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import {
  QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, ipLimits, nextKstMidnight, quotaLimits, readQuota, spendQuota, type QuotaKind, type QuotaState,
} from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { clientCount, overDailyBudget, type SpendKind } from "./spend";

/**
 * Route handler plumbing: JSON bodies with a size cap, error codes, cookies, the client key for the
 * rate limiter, and the gate every generation route passes first. Logs never carry user text or IPs.
 */

export type ErrorCode =
  | "BAD_REQUEST" | "BAD_TOKEN" | "BETA_LIMIT" | "RATE_LIMIT" | "AI_UNAVAILABLE" | "REFUSED" | "QUALITY" | "UPSTREAM";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  BAD_TOKEN: 400,
  BETA_LIMIT: 429,
  RATE_LIMIT: 429,
  AI_UNAVAILABLE: 503,
  REFUSED: 422,
  QUALITY: 502,
  UPSTREAM: 502,
};

const MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: "요청을 읽지 못했어요. 처음부터 다시 시도해 주세요.",
  BAD_TOKEN: "카드 정보가 만료됐거나 맞지 않아요. 카드를 다시 뽑아 주세요.",
  BETA_LIMIT: "오늘 쓸 수 있는 횟수를 모두 썼어요. 내일 다시 열려요.",
  RATE_LIMIT: "요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.",
  AI_UNAVAILABLE: "지금은 풀이를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  REFUSED: "이 내용으로는 풀이를 만들 수 없어요. 질문이나 메모를 바꿔 다시 시도해 주세요.",
  QUALITY: "풀이를 제대로 만들지 못했어요. 횟수는 차감되지 않았으니 다시 시도해 주세요.",
  UPSTREAM: "풀이를 만드는 중에 문제가 생겼어요. 횟수는 차감되지 않았으니 다시 시도해 주세요.",
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

export function errorFromGeneration(error: unknown, cookies: string[] = []): Response {
  const { status, body } = generationErrorPayload(error);
  return json(body, { status, cookies });
}

/**
 * The parsed JSON body, or null for a wrong content type (blocks form-post CSRF), a body over
 * `maxBytes`, or invalid JSON. An empty body reads as `{}`.
 */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!request.body) return {};
  if (!type.toLowerCase().startsWith("application/json")) return null;
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

/** httpOnly, SameSite=Lax, Secure (except plain-http local dev). */
export function setCookie(name: string, value: string, maxAgeSeconds: number, env: NodeJS.ProcessEnv = process.env): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * The network a client IP stands for: IPv4 as is, IPv6 by its /64 prefix. One host usually gets a
 * whole /64, so keying on the full IPv6 address would give it a fresh bucket per request.
 */
export function ipGroup(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1]!;
  const halves = address.split("::");
  if (halves.length > 2) return address;
  // An embedded IPv4 tail (x:x::1.2.3.4) takes two hextets; only the first four matter here.
  const parts = (text: string | undefined) => (text ? text.split(":").flatMap((p) => (p.includes(".") ? ["0", "0"] : [p])) : []);
  const head = parts(halves[0]);
  const tail = parts(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return address;
  const hextets = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!hextets.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return address;
  return `${hextets.slice(0, 4).map((h) => parseInt(h, 16).toString(16)).join(":")}::/64`;
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

/**
 * The server's own limits before a new generation: 503 once the day's estimated spend passes
 * BETA_DAILY_BUDGET_KRW (owners too), and 429 once this client's network has used up `kind` today
 * (owners skip it). Both are counted server-side at `done` (spend.ts), whatever the cookies say.
 */
export async function checkServerLimits(gate: Gate, kind: SpendKind, extra: Record<string, unknown> = {}): Promise<Response | null> {
  if (await overDailyBudget(gate.now)) return errorResponse("AI_UNAVAILABLE");
  if (!gate.owner && (await clientCount(gate.client, kind, gate.now)) >= ipLimits()[kind]) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra });
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
  if (!gate.owner && !hasQuota(quota, kind, quotaLimits())) return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), ...extra });
  return quota;
}

/** The cookie that spends one `kind`; set only after a validated generation. None for the owner. */
export async function spendCookies(gate: Gate, quota: QuotaState, kind: QuotaKind): Promise<CookieSpec[]> {
  return gate.owner ? [] : [{ name: QUOTA_COOKIE, value: await spendQuota(quota, kind, gate.secret), maxAge: QUOTA_COOKIE_MAX_AGE }];
}

/** Words that mean the person may be in crisis: no reading, a gentle pointer to help instead. */
const CRISIS = /죽고\s?싶|자살|자해|극단적\s?(인\s?)?선택|살기\s?싫|사라지고\s?싶/;

export function crisisResponse(...texts: Array<string | undefined>): Response | null {
  if (!texts.some((text) => text && CRISIS.test(text))) return null;
  return errorResponse("REFUSED", {
    care: true,
    message: "지금 많이 힘든 마음이 느껴져요. 이 이야기는 풀이보다 사람과 나누는 게 좋아요. 자살예방상담전화 109에서 언제든 이야기를 들어 줘요.",
  });
}
