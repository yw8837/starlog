import { generateDaily } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import type { DailyReading } from "@/lib/ai/schemas";
import { readDailyCache, writeDailyCache } from "@/lib/api/dailyCache";
import { errorFromGeneration, errorResponse, json, openGate, readJson, setCookie } from "@/lib/api/http";
import { dailyCard, dailyLuckyNumber } from "@/lib/security/drawToken";
import { DAILY_COOKIE, dailyCookie, readDaily, type DailyState } from "@/lib/security/dailyCookie";
import { QUOTA_COOKIE_MAX_AGE, kstDay, nextKstMidnight, quotaLimits } from "@/lib/security/quota";
import { randomId } from "@/lib/security/sign";

/**
 * POST {} → 오늘의 한 장, a free light fortune. One card per device per KST day (signed cookie
 * `sl_daily`); the reading is generated once and cached, so every visit that day returns the same
 * JSON. A cache miss regenerates for the same card, at most `BETA_DAILY_PER_DAY` times a day.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  if ((await readJson(request, 1_000)) === null) return errorResponse("BAD_REQUEST");

  const day = kstDay(gate.now);
  const saved = await readDaily(gate.cookies[DAILY_COOKIE], gate.secret, gate.now);
  const state: DailyState = saved?.day === day ? saved : newDay(saved?.did ?? randomId(12), day);
  const cookieOf = async (s: DailyState) => setCookie(DAILY_COOKIE, await dailyCookie(s, gate.secret), QUOTA_COOKIE_MAX_AGE);

  const cached = await readDailyCache(state.did, day, gate.now);
  if (cached && cached.card.cardId === state.cardId) return json(cached, { cookies: [await cookieOf(state)] });

  if (!gate.owner && state.gen >= quotaLimits().daily) {
    return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now), card: { cardId: state.cardId, orientation: state.orientation } }, [await cookieOf(state)]);
  }

  const ctx = buildTarotContext("daily", [{ cardId: state.cardId, orientation: state.orientation, position: "오늘의 한 장", slot: 0 }], null);
  let reading: DailyReading;
  try {
    const { data } = await generateDaily(gate.provider, ctx);
    reading = {
      card: { cardId: state.cardId, orientation: state.orientation, keyword: data.keyword.trim() },
      summary: data.summary.trim(),
      body: data.body.trim(),
      areas: { love: data.areas.love.trim(), money: data.areas.money.trim(), work: data.areas.work.trim() },
      lucky: { color: data.color.trim(), number: dailyLuckyNumber(state.did, day) },
      tip: data.tip.trim(),
    };
  } catch (error) {
    return errorFromGeneration(error);
  }
  await writeDailyCache(state.did, day, reading, gate.now);
  return json(reading, { cookies: [await cookieOf({ ...state, gen: state.gen + 1 })] });
}

function newDay(did: string, day: string): DailyState {
  const card = dailyCard(did, day);
  return { did, day, cardId: card.cardId, orientation: card.orientation, gen: 0 };
}
