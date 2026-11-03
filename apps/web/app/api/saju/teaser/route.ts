import { generateSajuTeaser, generateSajuTopicTeaser } from "@/lib/ai/generate";
import { teaserFreshUntil } from "@/lib/ai/prompts/sajuTopics";
import { checkServerLimits, openGate } from "@/lib/api/http";
import { checkMemberLimit, recordMemberSpend, requireMember } from "@/lib/api/member";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";
import { checkBot } from "@/lib/api/turnstile";
import { sealFreeShare } from "@/lib/share/freeSeal";
import { buildSajuFreePayload } from "@/lib/share/payload";

/**
 * POST {birth, topic?, loveStatus?, workStatus?, history?} → the free teaser {title, summary, lockedToc,
 * freshUntil, share} (a topic adds `topic`; `share` is its title and summary as a share holds them, birth and pillars
 * hidden, sealed: lib/share/freeSeal.ts, owner 2026-10-23), written from the chart the server computes itself. Needs a
 * login (owner 2026-11-04, lib/api/member.ts): a visitor gets 401 LOGIN_REQUIRED `reason: "teaser"` before the browser check
 * and before anything is generated or counted; only a body that cannot be read or the crisis check answer before it. One of the account's day teasers whatever the topic (counted on the server, per account), spent only after a
 * validated generation (saju-topics spec §9.1). Then a browser check when Turnstile is on (lib/api/turnstile.ts). Streams NDJSON progress with
 * `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  // The input first, like the tarot 맛보기: its crisis check answers with the care screen whether logged in or not.
  const parsed = await sajuRequest(request, gate);
  if (parsed instanceof Response) return parsed;
  const member = await requireMember(request, gate.secret, gate.now, "teaser");
  if (member instanceof Response) return member;
  const bot = await checkBot(request, gate);
  if (bot) return bot;
  const limited = (await checkServerLimits(gate, "teaser")) ?? (await checkMemberLimit(gate, member, "teaser"));
  if (limited) return limited;

  return respondGeneration(request, async (hooks) => {
    const teaser =
      parsed.topic === "overall"
        ? { ...(await generateSajuTeaser(gate.provider, parsed.facts, hooks)).data, freshUntil: teaserFreshUntil(parsed.facts, gate.now) }
        : (await generateSajuTopicTeaser(gate.provider, parsed.facts, hooks)).data;
    const free = buildSajuFreePayload(
      { birth: parsed.body.birth, ...(parsed.topic === "overall" ? (parsed.profile ? { profile: parsed.profile } : {}) : { topic: parsed.topic }) },
      { title: teaser.title, summary: teaser.summary },
    );
    const share = await sealFreeShare(free, gate.secret, gate.now);
    await recordMemberSpend(gate, member, "teaser");
    return { body: { ...teaser, share }, cookies: [] };
  }, { gate, spend: "teaser" });
}
