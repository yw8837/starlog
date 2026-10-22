import { sameOrigin } from "@/lib/account/request";
import { clientKey, errorResponse, json, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { rateLimit } from "@/lib/security/rateLimit";
import { buildNowSharePayload } from "@/lib/share/payload";
import { saveShare } from "@/lib/share/store";

/**
 * 지금의 한 장 공유 (owner 2026-10-23).
 * POST {cardId, orientation, pick, deck} → {id, path}: the public copy of one 지금의 한 장 draw at /s/<id>
 * (lib/share/payload.ts SharedNow). Only the card, its side, which of its lines and the design are read: the line and
 * why come from the card DB, never from the client, and the worry typed never leaves the device. The same draw is one
 * link for everyone (its key names the card, not the device), so there is nothing to stop and no account owns it.
 * No AI call: the draw is the card DB's own text. The share routes' per-network limit applies.
 */

const UNAVAILABLE = "지금은 공유 링크를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const db = accountDb();
  if (!db) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  const body = await readJson(request, 1_000);
  const draw = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const payload = draw ? buildNowSharePayload({ cardId: draw.cardId, orientation: draw.orientation, pick: draw.pick, deck: draw.deck }) : null;
  if (!payload) return errorResponse("BAD_REQUEST");
  const key = `now:${payload.deck}:${payload.card.cardId}:${payload.card.orientation}:${String(draw!.pick)}`;
  const id = await saveShare(db, key, payload, Date.now(), null);
  return json({ id, path: `/s/${id}` });
}
