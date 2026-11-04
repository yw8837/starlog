import { generateDaily } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import type { DailyResult } from "@/lib/ai/schemas";
import { getOrCreateDailyResult, readDailyResult } from "@/lib/api/dailyStore";
import {
  checkServerLimits, clientKey, errorResponse, json, openGate, parseCookies, readJson, serializeCookie, type CookieSpec,
} from "@/lib/api/http";
import { dailyViewer, giveBackPlace, requireMember, takePlace } from "@/lib/api/member";
import { respondGeneration } from "@/lib/api/stream";
import { checkBot } from "@/lib/api/turnstile";
import { DAILY_COOKIE, dailyCookie, readDaily, type DailyState } from "@/lib/security/dailyCookie";
import { DAILY_DEAL_SIZE, dailyDeal, dailyLuckyNumber } from "@/lib/security/drawToken";
import { QUOTA_COOKIE_MAX_AGE, kstDay, nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";

/**
 * 오늘의 한 장 as a 3-card deal (owner order: 셔플 + 카드 3지선다). It needs a login (owner 2026-11-04, lib/api/member.ts):
 * a visitor gets 401 LOGIN_REQUIRED `reason: "daily"` from GET and POST before anything else is asked. Each account gets
 * three face-down cards per KST day, dealt from HMAC(secret, account + day) (dailyDeal; the account is its member key, an
 * HMAC of users.id), so every device of the account deals, stores and shows the same card: a refresh cannot re-roll and
 * the pick is real (three distinct cards). Only the picked card ever leaves the server (owner order: the other two are
 * never revealed, before or after the pick).
 * - GET → today's stored result `{ ...reading, pick, deck }`, or `{ deal: [{index:0},{index:1},{index:2}] }`.
 * - POST {pick: 0|1|2} → the picked card's fortune, generated once and stored for the day (KV) with
 *   the pick. The first pick of the day is locked in the device cookie, and once a result is stored
 *   every later POST that day returns it, whatever it picks, on any device of the account. An invalid pick is 400; a
 *   missing one counts as 0 (clients from before the deal).
 * Generations are capped per account across its devices (BETA_DAILY_PER_DAY, a place taken in D1 before each one and given
 * back when nothing new was written), per device too (the cookie's count), and by the server limits. A limit answer names no
 * card. Every answer carries `account`, a marker of the account (lib/api/member.ts dailyViewer), for the device's own copy.
 * POST asks for a browser check first when Turnstile is on (lib/api/turnstile.ts).
 * POST streams NDJSON progress with `Accept: application/x-ndjson`.
 */

/** Three face-down slots: what the client may know before the pick. */
const DEAL = Array.from({ length: DAILY_DEAL_SIZE }, (_, index) => ({ index }));

/**
 * This account's state for today on this device: its cookie when it is from today and of this account (`did` is the
 * account's member key, so /api/share/daily finds the same stored card), else a new day for the account.
 */
async function todayState(cookies: Record<string, string>, secret: string, now: number, account: string): Promise<DailyState> {
  const day = kstDay(now);
  const saved = await readDaily(cookies[DAILY_COOKIE], secret, now);
  if (saved?.day === day && saved.did === account) return saved;
  return { did: account, day, gen: 0 };
}

async function cookieOf(state: DailyState, secret: string): Promise<CookieSpec> {
  return { name: DAILY_COOKIE, value: await dailyCookie(state, secret), maxAge: QUOTA_COOKIE_MAX_AGE };
}

export async function GET(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  const now = Date.now();
  if (!(await rateLimit("GEN_LIMITER", clientKey(request), now))) return errorResponse("RATE_LIMIT");
  const member = await requireMember(request, secret, now, "daily");
  if (member instanceof Response) return member;
  const state = await todayState(parseCookies(request), secret, now, member.key);
  const stored = await readDailyResult(state.did, state.day);
  // `account`: whose card a device keeps (TodayView shows a kept card only for the same marker; code review 2026-11-04).
  const account = await dailyViewer(member, secret);
  return json({ ...(stored ?? { deal: DEAL }), account }, { cookies: [serializeCookie(await cookieOf(state, secret))] });
}

export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const member = await requireMember(request, gate.secret, gate.now, "daily");
  if (member instanceof Response) return member;
  const bot = await checkBot(request, gate);
  if (bot) return bot;
  const body = await readJson(request, 1_000);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return errorResponse("BAD_REQUEST");
  const requested = (body as { pick?: unknown }).pick;
  // The card design the reader sees: the fortune quotes its picture (absent: the 1909 scans).
  const deck = (body as { deck?: unknown }).deck === "starlog" ? "starlog" : "rws1909";
  const validPick = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < DAILY_DEAL_SIZE;
  if (requested !== undefined && !validPick(requested)) return errorResponse("BAD_REQUEST", { field: "pick" });

  const day = kstDay(gate.now);
  const today = await todayState(gate.cookies, gate.secret, gate.now, member.key);
  // The first pick of the day is locked: a failed generation is no chance to choose again.
  const pick = today.pick ?? (requested as number | undefined) ?? 0;
  const state: DailyState = { ...today, pick };
  // The device id and its pick go out with the response headers; the generation count only on success.
  const deviceCookie = await cookieOf(state, gate.secret);

  const account = await dailyViewer(member, gate.secret);
  // A stored fortune always wins, whatever this request picked or the generation count says.
  const stored = await readDailyResult(state.did, day);
  if (stored) {
    return respondGeneration(request, async () => ({ body: { ...stored, account }, cookies: [] }), { gate, startCookies: [deviceCookie] });
  }

  // A limit answer names no card (code review 2026-11-04): with a deal fixed per account, cards in limit answers from other
  // devices or cleared cookies would show all three.
  const withCookie = (response: Response) => (response.headers.append("Set-Cookie", serializeCookie(deviceCookie)), response);
  if (!gate.owner && state.gen >= quotaLimits().daily) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now) }, [serializeCookie(deviceCookie)]);
  }
  const limited = await checkServerLimits(gate, "daily");
  if (limited) return withCookie(limited);
  // The account's regenerations of the day, across its devices (D1, atomic); given back when nothing new was written.
  const place = await takePlace(gate, member, "daily");
  if (place instanceof Response) return withCookie(place);

  const deal = await dailyDeal(state.did, day, gate.secret);
  const chosen = deal[pick]!;
  const card = { cardId: chosen.cardId, orientation: chosen.orientation };

  const ctx = buildTarotContext("daily", [{ ...card, position: "오늘의 한 장", slot: 0 }], null, { deck });
  const writeDaily = async (hooks: Parameters<typeof generateDaily>[2]) => {
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
    if (!result.generated) {
      await giveBackPlace(place);
      return { body: { ...result.reading, account }, cookies: [] };
    }
    return { body: { ...result.reading, account }, cookies: [await cookieOf({ ...state, gen: state.gen + 1 }, gate.secret)] };
  };

  return respondGeneration(request, async (hooks) => {
    try {
      return await writeDaily(hooks);
    } catch (error) {
      if (!hooks.signal?.aborted) await giveBackPlace(place);
      throw error;
    }
  }, { gate, startCookies: [deviceCookie], spend: "daily" });
}
