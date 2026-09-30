import { generateDaily } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import type { DailyReading } from "@/lib/ai/schemas";
import { getOrCreateDailyResult, readDailyResult } from "@/lib/api/dailyStore";
import { checkServerLimits, errorResponse, openGate, readJson, serializeCookie, type CookieSpec } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { DAILY_COOKIE, dailyCookie, readDaily, type DailyState } from "@/lib/security/dailyCookie";
import { dailyCard, dailyLuckyNumber } from "@/lib/security/drawToken";
import { QUOTA_COOKIE_MAX_AGE, kstDay, nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { randomId } from "@/lib/security/sign";

/**
 * POST {} → 오늘의 한 장, a free light fortune. One card per device per KST day (signed cookie
 * `sl_daily`); the reading is generated once and stored (KV), so every visit that day returns the
 * same JSON. Only when nothing is stored does it generate, at most `BETA_DAILY_PER_DAY` times a day.
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  if ((await readJson(request, 1_000)) === null) return errorResponse("BAD_REQUEST");

  const day = kstDay(gate.now);
  const saved = await readDaily(gate.cookies[DAILY_COOKIE], gate.secret, gate.now);
  const state: DailyState = saved?.day === day ? saved : newDay(saved?.did ?? randomId(12), day);
  const cookieOf = async (s: DailyState): Promise<CookieSpec> => ({ name: DAILY_COOKIE, value: await dailyCookie(s, gate.secret), maxAge: QUOTA_COOKIE_MAX_AGE });
  // The device id and today's card go out with the response headers; the generation count only on success.
  const deviceCookie = await cookieOf(state);

  // A stored fortune always wins, whatever the generation count says.
  const stored = await readDailyResult(state.did, day);
  if (stored && stored.card.cardId === state.cardId) {
    return respondGeneration(request, async () => ({ body: stored, cookies: [] }), { gate, startCookies: [deviceCookie] });
  }

  const card = { cardId: state.cardId, orientation: state.orientation };
  if (!gate.owner && state.gen >= quotaLimits().daily) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), card }, [serializeCookie(deviceCookie)]);
  }
  const limited = await checkServerLimits(gate, "daily", { card });
  if (limited) {
    limited.headers.append("Set-Cookie", serializeCookie(deviceCookie));
    return limited;
  }

  const ctx = buildTarotContext("daily", [{ cardId: state.cardId, orientation: state.orientation, position: "오늘의 한 장", slot: 0 }], null);
  return respondGeneration(request, async (hooks) => {
    const result = await getOrCreateDailyResult(state.did, day, async (): Promise<DailyReading> => {
      const { data } = await generateDaily(gate.provider, ctx, hooks);
      return {
        card: { cardId: state.cardId, orientation: state.orientation, keyword: data.keyword.trim() },
        summary: data.summary.trim(),
        body: data.body.trim(),
        areas: { love: data.areas.love.trim(), money: data.areas.money.trim(), work: data.areas.work.trim() },
        lucky: { color: data.color.trim(), number: dailyLuckyNumber(state.did, day) },
        tip: data.tip.trim(),
      };
    });
    if (!result.generated) return { body: result.reading, cookies: [] };
    return { body: result.reading, cookies: [await cookieOf({ ...state, gen: state.gen + 1 })], spend: "daily" };
  }, { gate, startCookies: [deviceCookie] });
}

function newDay(did: string, day: string): DailyState {
  const card = dailyCard(did, day);
  return { did, day, cardId: card.cardId, orientation: card.orientation, gen: 0 };
}
