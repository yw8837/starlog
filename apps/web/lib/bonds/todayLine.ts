import "server-only";
import { z } from "zod";
import { getCard, type Orientation } from "@starlog/core";
import { aiConfigProblems, generationSetting } from "@/lib/ai/config";
import { generateValidated, selectProvider } from "@/lib/ai/provider";
import { MODEL_BLIND_RULE } from "@/lib/ai/style";
import { charCount, modelNameViolations, nonHaeyoSentences } from "@/lib/ai/validate";
import { dailyStore } from "@/lib/api/dailyStore";
import { SpendLedger, budgetState, clientCount, recordClientSpend } from "@/lib/api/spend";
import { kbCard } from "@/lib/kb";
import { ipLimits } from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { todayCardLine } from "./bondCardText";

/**
 * The one- or two-sentence reading of 오늘의 인연 카드. Written by the model at the daily task's
 * setting (low effort), at most AI_PER_OWNER_PER_DAY new ones per owner per KST day, and stored for
 * the day so a second tap returns the same line. Anything else (limit, budget, no provider, a failed
 * or rejected draft) gets the rule-based line; this route never fails because of the model.
 * A model call passes the same server-side guards as the reading routes (lib/api/spend.ts): the
 * per-minute limiter, the day's budget (closed when unknown), the network's day count charged
 * before the call, and a SpendLedger so every billed call is recorded, failed ones included.
 */

export const AI_PER_OWNER_PER_DAY = 5;
const TTL_SECONDS = 36 * 60 * 60;
/** one short line: a model call that takes longer is cut off (and stays charged at its reservation) */
const LINE_BUDGET_MS = 30_000;

const SYSTEM = `너는 스타로그의 타로 리더예요. 친구 사이인 두 사람을 위해 오늘 뽑힌 타로 카드 한 장으로 "오늘 두 사람 사이"를 한두 문장으로 읽어요. 결과는 JSON 스키마로만 내요.
- 해요체로, 공백을 빼고 30~90자로 써요.
- <card>의 imageryFacts 가운데 하나를 짧게 묘사하고, 그 장면을 오늘 두 사람 사이의 분위기나 흐름으로 읽어요. 그림에 없는 것은 지어내지 않아요.
- 역방향이면 역방향으로 읽되 나쁜 일로 읽지 않아요.
- 두 사람이 친구라고만 보고, 연애·결혼·재회로 단정하지 않아요.
- 누구의 속마음이나 감정도 사실로 말하지 않아요. 분위기와 흐름까지만 말해요.
- 보장·예언을 하지 않고 확률, 반드시, 무조건, 운명, 절대 같은 말을 쓰지 않아요.
- 글머리표, 이모지, 따옴표 강조, 줄표를 쓰지 않아요. 카드를 주어로 세우지 않아요.
- 끝에 오늘 해 볼 작은 일 하나를 권해도 좋아요(안부 묻기, 사진 하나 보내기처럼 가벼운 것).

${MODEL_BLIND_RULE}`;

const LineSchema = z.object({ line: z.string().min(1).max(300) });

const FORBIDDEN = /확률|반드시|무조건|100%|틀림없이|절대|운명(?!의 수레바퀴)|로또|재회|결혼|헤어지|이별/;
const FORMATTING = /^\s*[-*•]\s|\*\*|—|\p{Extended_Pictographic}/mu;

/** Violations of the line's rules; empty when it may be shown. */
export function validateTodayLine(line: string): string[] {
  const out: string[] = [];
  const n = charCount(line);
  if (n < 20 || n > 110) out.push(`길이가 맞지 않아요(${n}자). 공백을 빼고 30~90자로 써 주세요.`);
  if (!/[가-힣]/.test(line)) out.push("한국어로 써 주세요.");
  if (FORBIDDEN.test(line)) out.push("단정·보장하는 말이나 연애로 단정하는 말을 빼 주세요.");
  if (FORMATTING.test(line)) out.push("글머리표·이모지·줄표 없이 문장으로만 써 주세요.");
  if (nonHaeyoSentences(line).length) out.push("모든 문장을 해요체로 맺어 주세요.");
  modelNameViolations({ line }, out);
  return out;
}

function prompt(cardId: string, orientation: Orientation): string {
  const kb = kbCard(cardId);
  const card = {
    name: getCard(cardId).names.ko,
    orientation: orientation === "upright" ? "정방향" : "역방향",
    keywords: kb.keywordsKo,
    imageryFacts: kb.imagery.facts.filter((f) => f.salience === 1).map((f) => f.ko),
    oneLine: kb.core.oneLine[orientation],
    group: kb.topics.group[orientation],
  };
  return `<task>bond-today</task>\n<card>${JSON.stringify(card)}</card>\n{"line": "..."} 형식으로만 답해요.`;
}

interface Stored {
  line: string;
}

const lineKey = (ownerId: string, starId: string, day: string) => `bond-line:${ownerId}:${starId}:${day}`;
const countKey = (ownerId: string, day: string) => `bond-gen:${ownerId}:${day}`;

async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

/**
 * `client`, when the route has it, is the caller's network id (Gate.client); without it the owner id
 * stands in for the per-minute limiter and the day count.
 */
export async function todayLine(args: { ownerId: string; starId: string; day: string; cardId: string; orientation: Orientation; now: number; client?: string }): Promise<string> {
  const { ownerId, starId, day, cardId, orientation, now } = args;
  const rule = todayCardLine(cardId, orientation);
  const store = dailyStore();
  const stored = (await safely(() => store.get(lineKey(ownerId, starId, day)), null)) as Stored | null;
  if (stored && typeof stored.line === "string") return stored.line;

  const provider = selectProvider();
  const used = Number(await safely(() => store.get(countKey(ownerId, day)), 0)) || 0;
  if (!provider || aiConfigProblems().length || used >= AI_PER_OWNER_PER_DAY) return rule;

  // The reading routes' guards, before anything is billed.
  const who = args.client ?? `owner:${ownerId}`;
  if (!(await safely(() => rateLimit("GEN_LIMITER", who, now), false))) return rule;
  if ((await safely(() => budgetState(now), "unknown" as const)) !== "ok") return rule;
  if ((await clientCount(who, "line", now)) >= ipLimits().line) return rule;
  await recordClientSpend(who, "line", now);

  const ledger = new SpendLedger();
  let line = rule;
  try {
    const result = await generateValidated(provider, {
      name: "tarot-daily",
      system: SYSTEM,
      user: prompt(cardId, orientation),
      schema: LineSchema,
      ...generationSetting("tarot-daily"),
      mock: () => ({ line: rule }),
    }, (draft) => validateTodayLine(draft.line.trim()), {
      signal: AbortSignal.timeout(LINE_BUDGET_MS),
      deadline: Date.now() + LINE_BUDGET_MS,
      onReserve: (usage) => ledger.reserve(usage),
      onRelease: () => ledger.release(),
      onUsage: (usage) => ledger.bill(usage),
    });
    line = result.data.line.trim();
  } catch {
    return rule;
  } finally {
    await ledger.finish(); // billed calls are recorded whatever happened
  }
  await safely(() => store.put(countKey(ownerId, day), used + 1, TTL_SECONDS), undefined);
  await safely(() => store.put(lineKey(ownerId, starId, day), { line } satisfies Stored, TTL_SECONDS), undefined);
  return line;
}
