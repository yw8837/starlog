import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { OWNER_REPORTS_PAGE, type OwnerReadingReport, type ReportKind, type ReportReason } from "@/lib/readings/report";
import { SHARE_ID } from "@/lib/share/store";

/**
 * The operator's 신고 목록 on /owner (owner pass only, as the review desk next door; owner 2026-11-13).
 * GET [?before=<createdAt>.<id>] → { reports, next }: 풀이 신고 (migrations/0025) newest first, OWNER_REPORTS_PAGE at a time,
 * `next` the cursor for 더 보기 (null on the last page). Never the reporter (user_id); no reading text is stored at all.
 * POST {id, handled} → { ok, handledAt }: marks one handled (its first time is kept) or back to not handled (NULL).
 */

const REPORT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURSOR = /^(\d{1,16})\.([A-Za-z0-9_-]{1,64})$/;

const HandledBody = z.object({ id: z.string().regex(REPORT_ID), handled: z.boolean() });

type Row = { id: string; reading_id: string | null; kind: ReportKind; reason: ReportReason; note: string | null; created_at: number; handled_at: number | null };

export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner) return errorResponse("FORBIDDEN");
  const before = new URL(request.url).searchParams.get("before");
  const cursor = before === null ? null : CURSOR.exec(before);
  if (before !== null && !cursor) return errorResponse("BAD_REQUEST");
  const select = "SELECT id, reading_id, kind, reason, note, created_at, handled_at FROM reading_reports";
  const order = "ORDER BY created_at DESC, id DESC LIMIT ?";
  const { results } = await (cursor
    ? ctx.db.prepare(`${select} WHERE created_at < ? OR (created_at = ? AND id < ?) ${order}`).bind(Number(cursor[1]), Number(cursor[1]), cursor[2], OWNER_REPORTS_PAGE + 1)
    : ctx.db.prepare(`${select} ${order}`).bind(OWNER_REPORTS_PAGE + 1)
  ).all<Row>();
  const page = results.slice(0, OWNER_REPORTS_PAGE);
  const last = page.at(-1);
  const reports: OwnerReadingReport[] = page.map((row) => ({
    id: row.id,
    kind: row.kind,
    readingId: row.reading_id,
    // A share link is a public page; a saved reading opens on its owner's device or account only.
    link: row.kind === "shared" && row.reading_id && SHARE_ID.test(row.reading_id) ? `/s/${row.reading_id}` : null,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
    handledAt: row.handled_at,
  }));
  return json({ reports, next: results.length > OWNER_REPORTS_PAGE && last ? `${last.created_at}.${last.id}` : null });
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner) return errorResponse("FORBIDDEN");
  const body = HandledBody.safeParse(await readJson(request, 500));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const { id, handled } = body.data;
  const row = await (handled
    ? ctx.db.prepare("UPDATE reading_reports SET handled_at = COALESCE(handled_at, ?) WHERE id = ? RETURNING handled_at").bind(ctx.now, id)
    : ctx.db.prepare("UPDATE reading_reports SET handled_at = NULL WHERE id = ? RETURNING handled_at").bind(id)
  ).first<{ handled_at: number | null }>();
  return json({ ok: row !== null, handledAt: row?.handled_at ?? null });
}
