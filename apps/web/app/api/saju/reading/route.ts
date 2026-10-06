import { generateSajuReading, generateSajuTopicReading } from "@/lib/ai/generate";
import { fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { sajuChapter } from "@/lib/readings/chapters";
import { issueChapter, type ChapterContext } from "@/lib/security/chapterToken";

/**
 * POST {birth, topic?, loveStatus?, workStatus?, unlock?, display?} → {reading, chapterToken, readingId?}:
 * the full saju reading, 전체 흐름 or the 운 asked for (saju-topics spec §7.1). One payment opens one
 * reading of the topic asked for now (P4 product `saju`).
 * - 오픈 기념: one daily unlock after a validated generation.
 * - paid / 별조각: credit reserved, then saved and spent before the client sees it, released on
 *   failure (spec 5.4).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await sajuRequest(request, gate);
  if (parsed instanceof Response) return parsed;
  const plan = await planUnlock(request, gate, "saju", parsed.body.unlock?.method);
  if (plan instanceof Response) return plan;
  const { birth, loveStatus, workStatus, display } = parsed.body;
  // What the chapter token and the account copy carry: 전체 흐름's status labels, or the topic.
  const ctx: ChapterContext =
    parsed.topic === "overall" ? { kind: "saju", birth, profile: parsed.profile } : { kind: "saju", birth, topic: parsed.topic };
  const copy =
    parsed.topic === "overall"
      ? { birth, context: { loveStatus, workStatus }, display }
      : { birth, context: {}, topic: parsed.topic, display };

  return respondGeneration(
    request,
    async (hooks) => {
      const reading =
        parsed.topic === "overall"
          ? (await generateSajuReading(gate.provider, parsed.facts, hooks)).data
          : (await generateSajuTopicReading(gate.provider, parsed.facts, hooks)).data;
      const chapterToken = await issueChapter(ctx, reading, [], gate.secret, gate.now);
      return { body: { reading, chapterToken }, cookies: plan.quota ? await spendCookies(gate, plan.quota, "full") : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      settle: settlementFor(plan, (body) => sajuChapter(copy, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
