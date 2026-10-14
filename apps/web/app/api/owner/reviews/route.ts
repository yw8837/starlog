import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { REPORT_REASONS, reportedReviews, setHidden } from "@/lib/reviews/store";

/**
 * The owner's review desk (owner pass only).
 * GET → { reviews }: reviews with reports, newest first (with each one's report count and reasons).
 * POST {id, hidden, reason?} → { ok }: hides one for a rule breach (a reason is required) or restores it.
 * A review is never hidden for being unfavourable, only for the rule reasons (spec §4).
 */

const HideBody = z
  .object({ id: z.string().regex(/^[a-z0-9]{16}$/), hidden: z.boolean(), reason: z.enum(REPORT_REASONS).optional() })
  .refine((body) => !body.hidden || body.reason !== undefined);

export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner) return errorResponse("FORBIDDEN");
  return json({ reviews: await reportedReviews(ctx.db) });
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner) return errorResponse("FORBIDDEN");
  const body = HideBody.safeParse(await readJson(request, 500));
  if (!body.success) return errorResponse("BAD_REQUEST");
  return json({ ok: await setHidden(ctx.db, body.data.id, body.data.hidden, body.data.reason ?? null) });
}
