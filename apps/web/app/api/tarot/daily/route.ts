import { generateDaily } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import type { DailyResult } from "@/lib/ai/schemas";
import { getOrCreateDailyResult, readDailyResult } from "@/lib/api/dailyStore";
import {
  checkServerLimits, clientKey, errorResponse, json, openGate, parseCookies, readJson, serializeCookie, type CookieSpec,
} from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { DAILY_COOKIE, dailyCookie, readDaily, type DailyState } from "@/lib/security/dailyCookie";
import { DAILY_DEAL_SIZE, dailyDeal, dailyLuckyNumber } from "@/lib/security/drawToken";
import { QUOTA_COOKIE_MAX_AGE, kstDay, nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { randomId, signingSecret } from "@/lib/security/sign";

/**
 * 오늘의 한 장 as a 3-card deal (owner order: 셔플 + 카드 3지선다). Each device gets three
 * face-down cards per KST day, dealt from HMAC(secret, device + day) (dailyDeal): a refresh cannot
 * re-roll and the pick is real (three distinct cards). Only the picked card ever leaves the server
 * (owner order: the other two are never revealed, before or after the pick).
 * - GET → today's stored result `{ ...reading, pick, deck }`, or `{ deal: [{index:0},{index:1},{index:2}] }`.
 * - POST {pick: 0|1|2} → the picked card's fortune, generated once and stored for the day (KV) with
 *   the pick. The first pick of the day is locked in the device cookie, and once a result is stored
 *   every later POST that day returns it, whatever it picks. An invalid pick is 400; a missing one
 *   counts as 0 (clients from before the deal).
 * Generations are capped per device (BETA_DAILY_PER_DAY, the cookie) and by the server limits.
 * POST streams NDJSON progress with `Accept: application/x-ndjson`.
 */

/** Three face-down slots: what the client may know before the pick. */
const DEAL = Array.from({ length: DAILY_DEAL_SIZE }, (_, index) => ({ index }));

/** This device's state for today: its cookie when it is from today, else a new day for the same (or a new) device id. */
async function todayState(cookies: Record<string, string>, secret: string, now: number): Promise<DailyState> {
  const day = kstDay(now);
  const saved = await readDaily(cookies[DAILY_COOKIE], secret, now);
  if (saved?.day === day) return saved;
  return { did: saved?.did ?? randomId(12), day, gen: 0 };
}

async function cookieOf(state: DailyState, secret: string): Promise<CookieSpec> {
  return { name: DAILY_COOKIE, value: await dailyCookie(state, secret), maxAge: QUOTA_COOKIE_MAX_AGE };
}

export async function GET(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  const now = Date.now();
  if (!(await rateLimit("GEN_LIMITER", clientKey(request), now))) return errorResponse("RATE_LIMIT");
  const state = await todayState(parseCookies(request), secret, now);
  const stored = await readDailyResult(state.did, state.day);
  return json(stored ?? { deal: DEAL }, { cookies: [serializeCookie(await cookieOf(state, secret))] });
}

export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = await readJson(request, 1_000);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return errorResponse("BAD_REQUEST");
  const requested = (body as { pick?: unknown }).pick;
  // The card design the reader sees: the fortune quotes its picture (absent: the 1909 scans).
  const deck = (body as { deck?: unknown }).deck === "starlog" ? "starlog" : "rws1909";
  const validPick = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < DAILY_DEAL_SIZE;
  if (requested !== undefined && !validPick(requested)) return errorResponse("BAD_REQUEST", { field: "pick" });

  const day = kstDay(gate.now);
  const today = await todayState(gate.cookies, gate.secret, gate.now);
  // The first pick of the day is locked: a failed generation is no chance to choose again.
  const pick = today.pick ?? (requested as number | undefined) ?? 0;
  const state: DailyState = { ...today, pick };
  // The device id and its pick go out with the response headers; the generation count only on success.
  const deviceCookie = await cookieOf(state, gate.secret);

  // A stored fortune always wins, whatever this request picked or the generation count says.
  const stored = await readDailyResult(state.did, day);
  if (stored) {
    return respondGeneration(request, async () => ({ body: stored, cookies: [] }), { gate, startCookies: [deviceCookie] });
  }

  const deal = await dailyDeal(state.did, day, gate.secret);
  const chosen = deal[pick]!;
  const card = { cardId: chosen.cardId, orientation: chosen.orientation };
  if (!gate.owner && state.gen >= quotaLimits().daily) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), card }, [serializeCookie(deviceCookie)]);
  }
  const limited = await checkServerLimits(gate, "daily", { card });
  if (limited) {
    limited.headers.append("Set-Cookie", serializeCookie(deviceCookie));
    return limited;
  }

  const ctx = buildTarotContext("daily", [{ ...card, position: "오늘의 한 장", slot: 0 }], null, { deck });
  return respondGeneration(request, async (hooks) => {
    // Stored with the deck it quotes: switching designs later that day still shows that deck's picture.
    const result = await getOrCreateDailyResult(state.did, day, async (): Promise<DailyResult & { deck: typeof deck }> => {
      const { data } = await generateDaily(gate.provider, ctx, hooks);
      return {
        card: { ...card, keyword: data.keyword.trim() },
        summary: data.summary.trim(),
        body: data.body.trim(),
        areas: { love: data.areas.love.trim(), money: data.areas.money.trim(), work: data.areas.work.trim() },
        lucky: { color: data.color.trim(), number: dailyLuckyNumber(state.did, day) },
        tip: data.tip.trim(),
        pick,
        deck,
      };
    });
    if (!result.generated) return { body: result.reading, cookies: [] };
    return { body: result.reading, cookies: [await cookieOf({ ...state, gen: state.gen + 1 }, gate.secret)] };
  }, { gate, startCookies: [deviceCookie], spend: "daily" });
}
