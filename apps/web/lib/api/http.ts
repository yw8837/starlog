import "server-only";
import { GenerationError, selectProvider, type ReadingProvider } from "@/lib/ai/provider";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { rateLimit } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";

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

export function errorResponse(code: ErrorCode, extra: Record<string, unknown> = {}, cookies: string[] = []): Response {
  return json({ code, message: MESSAGE[code], ...extra }, { status: STATUS[code], cookies });
}

export function errorFromGeneration(error: unknown): Response {
  if (error instanceof GenerationError) return errorResponse(error.code);
  console.error(JSON.stringify({ evt: "api.error", error: error instanceof Error ? error.name : typeof error }));
  return errorResponse("UPSTREAM");
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

/** httpOnly, SameSite=Lax, Secure (except plain-http local dev). */
export function setCookie(name: string, value: string, maxAgeSeconds: number, env: NodeJS.ProcessEnv = process.env): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

/** The rate-limit key: the client IP from Cloudflare (never logged). */
export function clientKey(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || "local";
}

export interface Gate {
  secret: string;
  provider: ReadingProvider;
  owner: boolean;
  now: number;
  cookies: Record<string, string>;
}

/**
 * What every generation route checks first: signing secret and provider configured (503 otherwise),
 * owner pass, and the per-IP limiter (owners get the 5x limiter).
 */
export async function openGate(request: Request): Promise<Gate | Response> {
  const secret = signingSecret();
  const provider = selectProvider();
  if (!secret || !provider) return errorResponse("AI_UNAVAILABLE");
  const now = Date.now();
  const cookies = parseCookies(request);
  const owner = await isOwner(cookies[OWNER_COOKIE], secret, now);
  if (!(await rateLimit(owner ? "OWNER_GEN_LIMITER" : "GEN_LIMITER", clientKey(request), now))) return errorResponse("RATE_LIMIT");
  return { secret, provider, owner, now, cookies };
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
