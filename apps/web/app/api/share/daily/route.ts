import { sameOrigin } from "@/lib/account/request";
import { readSession, sessionCookieName } from "@/lib/account/session";
import { readDailyResult } from "@/lib/api/dailyStore";
import { clientKey, errorResponse, json, parseCookies, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { DAILY_COOKIE, readDaily } from "@/lib/security/dailyCookie";
import { kstDay } from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { buildDailySharePayload } from "@/lib/share/payload";
import { deleteShare, saveShare } from "@/lib/share/store";

/**
 * 오늘의 한 장 공유 (owner 2026-10-20).
 * POST {} → {id, path}: the public copy of this device's 오늘의 한 장 at /s/<id> (lib/share/payload.ts
 * SharedDaily), made from the fortune the server stored for the device (`sl_daily` cookie → DAILY_KV) for
 * today (KST). Nothing the client sends is read: the card, its design and its reading are the server's
 * own. Sharing again the same day answers the same address. A signed-in sharer's account owns the share:
 * deleting the account takes it down (lib/account/deletion.ts).
 * DELETE {} → {deleted}: stops sharing it.
 * One link per device and day: its key is a keyed hash of both, so the stored row names no device.
 */

const UNAVAILABLE = "지금은 공유 링크를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
const NO_CARD = "오늘 고른 카드가 있어야 공유할 수 있어요. 오늘의 한 장을 먼저 골라 주세요.";

/** The keyed hash's own purpose; the "daily:" prefix keeps these keys apart from the chapters' (sha256 of a chapter id). */
const KEY_LABEL = "starlog/daily-share/v1";

async function open(request: Request) {
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  const now = Date.now();
  if (!(await rateLimit("GEN_LIMITER", clientKey(request), now))) return errorResponse("RATE_LIMIT");
  const secret = signingSecret();
  const db = accountDb();
  if (!secret || !db) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  // Nothing in the body is used; it only has to be a small JSON object.
  const body = await readJson(request, 1_000);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return errorResponse("BAD_REQUEST");
  const day = kstDay(now);
  const device = await readDaily(parseCookies(request)[DAILY_COOKIE], secret, now);
  if (!device || device.day !== day) return errorResponse("NOT_AVAILABLE", { message: NO_CARD });
  return { db, secret, now, day, did: device.did, shareKey: `daily:${await keyedHash(`${device.did}:${day}`, secret, KEY_LABEL)}` };
}

export async function POST(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  const stored = await readDailyResult(opened.did, opened.day);
  if (!stored) return errorResponse("NOT_AVAILABLE", { message: NO_CARD });
  const payload = buildDailySharePayload(stored, opened.day);
  const session = await readSession(opened.db, parseCookies(request)[sessionCookieName()], opened.secret, opened.now);
  const id = await saveShare(opened.db, opened.shareKey, payload, opened.now, session?.user.id ?? null);
  return json({ id, path: `/s/${id}` });
}

export async function DELETE(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  return json({ deleted: await deleteShare(opened.db, opened.shareKey) });
}
