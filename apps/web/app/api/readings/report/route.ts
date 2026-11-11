import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { REPORT_KINDS, REPORT_NOTE_MAX, REPORT_READING_ID, REPORT_REASONS } from "@/lib/readings/report";
import { randomId } from "@/lib/security/sign";

const ReportBody = z.object({
  kind: z.enum(REPORT_KINDS),
  readingId: z.string().regex(REPORT_READING_ID).optional(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(REPORT_NOTE_MAX).optional(),
});

/**
 * POST {kind, readingId?, reason, note?} (our own pages only; AUTH_LIMITER, as 후기 신고) → {ok: true}: 신고 on an AI reading
 * from the Starlog app (Google Play's AI-generated content policy). One reading_reports row; the session is optional (its user
 * id when logged in). The reading's text is never sent or stored, and the log line carries the kind and reason only.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const body = ReportBody.safeParse(await readJson(request, 4_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const { kind, readingId, reason, note } = body.data;
  await ctx.db
    .prepare("INSERT INTO reading_reports (id, user_id, reading_id, kind, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(randomId(16), ctx.session?.user.id ?? null, readingId ?? null, kind, reason, note?.trim() || null, ctx.now)
    .run();
  console.info(JSON.stringify({ evt: "report.reading", kind, reason }));
  return json({ ok: true });
}
