import { errorResponse, json } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { runMaintenance } from "@/lib/pay/maintenance";
import { tossClient } from "@/lib/pay/toss";
import { safeEqual } from "@/lib/security/sign";

/**
 * POST with `Authorization: Bearer <STARLOG_CRON_SECRET>` → the maintenance report. Called by the
 * Cron Trigger every 10 minutes (apps/web/worker.mjs). Anyone else gets 403; a deploy without the
 * secret (32+ characters) or D1 gets 503.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STARLOG_CRON_SECRET?.trim() ?? "";
  if (secret.length < 32) return errorResponse("PAY_UNAVAILABLE");
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !(await safeEqual(given, secret, secret))) return errorResponse("FORBIDDEN");
  const db = accountDb();
  if (!db) return errorResponse("PAY_UNAVAILABLE");
  const report = await runMaintenance(db, tossClient(), Date.now());
  console.info(JSON.stringify({ evt: "cron.maintenance", ...report }));
  return json(report);
}
