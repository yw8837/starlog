import "server-only";
import { z } from "zod";
import { CONSTELLATIONS, type SignId } from "@starlog/core";
import { clientKey, json, parseCookies, readJson } from "@/lib/api/http";
import type { RateLimitBinding } from "@/lib/cloudflare";
import { SITE } from "@/lib/config";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { bondsRepo } from "@/lib/db";
import { rateLimit, type LimiterName } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { whoOwns, type OwnerIdentity } from "./owner";
import { BondsError, type BondsErrorCode } from "./service";

/**
 * Plumbing shared by /api/bonds/*: the feature flag, the signing secret, the repository, error codes
 * to HTTP statuses, and JSON in and out. Bodies and birth dates are never logged.
 */

declare global {
  interface CloudflareEnv {
    BOND_JOIN_LIMITER?: RateLimitBinding;
    BOND_CODE_LIMITER?: RateLimitBinding;
    BOND_VIEW_LIMITER?: RateLimitBinding;
  }
}

export type BondsApiCode = BondsErrorCode | "RATE_LIMIT" | "NOT_CONFIGURED" | "SERVER" | "BAD_ORIGIN" | "LOGIN_REQUIRED" | "CODE_LIMIT";

const STATUS: Record<BondsApiCode, number> = {
  BAD_INPUT: 400,
  BAD_CODE: 400,
  LOGIN_REQUIRED: 401,
  SELF_JOIN: 403,
  BAD_ORIGIN: 403,
  NOT_FOUND: 404,
  NO_OWNER: 404,
  FILLING_EXISTS: 409,
  SIGN_COMPLETED: 409,
  CHOOSING: 409,
  ALREADY_JOINED: 409,
  NO_FILLING: 409,
  ALL_DONE: 409,
  MOVED: 409,
  DUPLICATE_STAR: 409,
  REMOVED: 403,
  COOLDOWN: 429,
  DAILY_STAR_LIMIT: 429,
  DAILY_ACTION_LIMIT: 429,
  INVITE_COOLDOWN: 429,
  RATE_LIMIT: 429,
  CODE_LIMIT: 429,
  SERVER: 500,
  NOT_CONFIGURED: 503,
};

const present = (cookies: Array<string | null | undefined>) => cookies.filter((c): c is string => Boolean(c));

export function ok(data: Record<string, unknown>, cookies: Array<string | null | undefined> = []): Response {
  return json({ ok: true, ...data }, { cookies: present(cookies) });
}

export function fail(code: BondsApiCode, extra: Record<string, unknown> = {}, cookies: Array<string | null | undefined> = []): Response {
  return json({ ok: false, code, ...extra }, { status: STATUS[code], cookies: present(cookies) });
}

export interface BondsContext {
  secret: string;
  now: number;
  cookies: Record<string, string>;
  repo: BondsRepo;
  /** who this request acts as: the account's owner, or this device's while it belongs to no account (lib/bonds/owner.ts) */
  who: () => Promise<OwnerIdentity>;
}

/**
 * A state-changing request from another site's page. JSON bodies already need a CORS preflight that
 * this API never grants; this refuses a stated foreign Origin outright as well.
 */
function foreignOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin !== new URL(request.url).origin && origin !== new URL(SITE.url).origin;
}

/** Runs a bonds route: 404 while the feature is off, 503 without a secret or database, BondsError → its status. */
export async function bondsRoute(request: Request, name: string, run: (ctx: BondsContext) => Promise<Response>): Promise<Response> {
  if (!SITE.features.bonds) return fail("NOT_FOUND");
  if (foreignOrigin(request)) return fail("BAD_ORIGIN");
  const secret = signingSecret();
  if (!secret) return fail("NOT_CONFIGURED");
  let repo: BondsRepo;
  try {
    repo = bondsRepo();
  } catch {
    console.error(JSON.stringify({ evt: "bonds.no_db", route: name }));
    return fail("NOT_CONFIGURED");
  }
  try {
    const now = Date.now();
    const cookies = parseCookies(request);
    let identity: Promise<OwnerIdentity> | null = null;
    return await run({ secret, now, cookies, repo, who: () => (identity ??= whoOwns(repo, cookies, secret, now)) });
  } catch (error) {
    if (error instanceof BondsError) {
      return fail(error.code, {
        ...(error.field ? { field: error.field } : {}),
        ...(error.retryAt ? { retryAt: new Date(error.retryAt).toISOString() } : {}),
        ...(error.detail ?? {}),
      });
    }
    console.error(JSON.stringify({ evt: "bonds.error", route: name, error: error instanceof Error ? error.constructor.name : typeof error }));
    return fail("SERVER");
  }
}

/** The request body parsed by `schema`, or a BAD_INPUT BondsError. */
export async function body<T>(request: Request, schema: z.ZodType<T>, maxBytes = 2_000): Promise<T> {
  const parsed = schema.safeParse(await readJson(request, maxBytes));
  if (!parsed.success) throw new BondsError("BAD_INPUT");
  return parsed.data;
}

/** Per-IP limiter for bonds routes; throws nothing, answers whether to go on. */
export function allowed(request: Request, limiter: Extract<LimiterName, "BOND_JOIN_LIMITER" | "BOND_CODE_LIMITER" | "BOND_VIEW_LIMITER">, now: number): Promise<boolean> {
  return rateLimit(limiter, clientKey(request), now);
}

// ---- shared body schemas ----

export const SignSchema = z.enum(CONSTELLATIONS.map((c) => c.id) as [SignId, ...SignId[]]);

export const BirthSchema = z.object({
  calendar: z.enum(["solar", "lunar"]),
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  isLeapMonth: z.boolean().optional(),
});

export const SignBody = z.object({ sign: SignSchema });
export const StarBody = z.object({ starId: z.string().min(1).max(64) });
