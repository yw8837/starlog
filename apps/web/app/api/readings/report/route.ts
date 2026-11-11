import { z } from "zod";
import { openAccount, sameOrigin } from "@/lib/account/request";
import { clientKey, errorResponse, json, readJson } from "@/lib/api/http";
import { REPORT_KINDS, REPORT_NOTE_MAX, REPORT_READING_ID, REPORT_REASONS } from "@/lib/readings/report";
import { rateLimit } from "@/lib/security/rateLimit";
import { randomId } from "@/lib/security/sign";

const ReportBody = z.object({
  kind: z.enum(REPORT_KINDS),
  readingId: z.string().regex(REPORT_READING_ID).optional(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(REPORT_NOTE_MAX).optional(),
});

/**
 * 신고 has a count of its own, stricter than the login's AUTH_LIMITER it no longer shares (review L9): the owner code's
 * limiter (5 a minute per network, the strictest binding there is) under its own key, so neither eats into the other.
 */
const reportKey = (request: Request) => `report:${clientKey(request)}`;

/**
 * POST {kind, readingId?, reason, note?} (our own pages only) → {ok: true}: 신고 on an AI reading from the Starlog app (Google
 * Play's AI-generated content policy). One reading_reports row; the session is optional (its user id when logged in). The
 * reading's text is never sent or stored, the note is at most REPORT_NOTE_MAX characters, and the log line carries the kind
 * and reason only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit("OWNER_LOGIN_LIMITER", reportKey(request)))) return errorResponse("RATE_LIMIT");
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  const ctx = await openAccount(request);
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
