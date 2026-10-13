import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { REPORT_REASONS, reportReview } from "@/lib/reviews/store";

const ReportBody = z.object({ id: z.string().regex(/^[a-z0-9]{16}$/), reason: z.enum(REPORT_REASONS) });

/** POST {id, reason} → { ok }: one report per person per review; the owner decides in /owner. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const body = ReportBody.safeParse(await readJson(request, 500));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const ok = await reportReview(ctx.db, session.user.id, body.data.id, body.data.reason, ctx.now);
  return ok ? json({ ok }) : errorResponse("NOT_AVAILABLE", { message: "이 후기는 이미 없어요." });
}
