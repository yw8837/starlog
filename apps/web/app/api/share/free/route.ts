import { sameOrigin } from "@/lib/account/request";
import { clientKey, errorResponse, json, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { rateLimit } from "@/lib/security/rateLimit";
import { canonicalJson, sha256, signingSecret } from "@/lib/security/sign";
import { openFreeShare } from "@/lib/share/freeSeal";
import { sharePreview } from "@/lib/share/preview";
import { deleteShare, saveShare } from "@/lib/share/store";

/**
 * 무료 첫 풀이 공유 (owner 2026-10-23: "무료풀이에서도 공유가 가능하게").
 * POST {share} → {id, path, preview}: the free first tarot reading or saju 맛보기 at /s/<id>, exactly as its teaser route
 * sealed it (lib/share/freeSeal.ts): the cards or the 맛보기's title and summary and the free part, cleaned, never the
 * paid part. The same seal's content answers the same address. No AI call; the share routes' per-network limit applies.
 * DELETE {share} → {deleted}: stops it (only the device holding the seal can).
 */

const UNAVAILABLE = "지금은 공유 링크를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
const EXPIRED = "공유할 수 있는 시간이 지났어요. 다시 풀이를 열면 공유할 수 있어요.";

async function open(request: Request) {
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const secret = signingSecret();
  const db = accountDb();
  if (!secret || !db) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  const body = await readJson(request, 20_000);
  const seal = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as { share?: unknown }).share : undefined;
  if (typeof seal !== "string") return errorResponse("BAD_REQUEST");
  const now = Date.now();
  const payload = await openFreeShare(seal, secret, now);
  if (!payload) return errorResponse("BAD_TOKEN", { message: EXPIRED });
  return { db, now, payload, key: `free:${await sha256(canonicalJson(payload))}` };
}

export async function POST(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  const id = await saveShare(opened.db, opened.key, opened.payload, opened.now, null);
  return json({ id, path: `/s/${id}`, preview: sharePreview(opened.payload) });
}

export async function DELETE(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  return json({ deleted: await deleteShare(opened.db, opened.key) });
}
