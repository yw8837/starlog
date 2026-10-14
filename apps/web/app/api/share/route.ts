import { z } from "zod";
import { sameOrigin } from "@/lib/account/request";
import { readSession, sessionCookieName } from "@/lib/account/session";
import { clientKey, errorResponse, json, parseCookies, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { buildSharePayload } from "@/lib/share/payload";
import { deleteShare, saveShare } from "@/lib/share/store";
import { OPENING_KEEP_ONLY } from "@/lib/helpGuide";
import { isOpeningChapter, openChapterForShare } from "@/lib/security/chapterToken";
import { rateLimit } from "@/lib/security/rateLimit";
import { sha256, signingSecret } from "@/lib/security/sign";

/**
 * 결과 공유 (owner 2026-10-13).
 * POST {chapterToken, reading} → {id, path}: the public copy of a tarot or saju reading at
 * /s/<id> (lib/share/payload.ts says what it leaves out), in the card design signed in its chapter
 * (an older client's `deck` is ignored). Sharing the same reading again answers the same address. A
 * signed-in sharer's account owns the share: deleting the account takes it down (lib/account/deletion.ts).
 * DELETE {chapterToken, reading} → {deleted}: stops sharing it.
 * Both take the signed chapter the result screen holds, so only the device with the reading can share
 * it or stop it, and the shared text is always the one the server wrote. A 오픈 기념 무료 reading is never
 * shared (409 `reason: "opening"`).
 */

const ShareBody = z.object({
  chapterToken: z.string().min(1).max(32_768),
  reading: z.unknown(),
});

const UNAVAILABLE = "지금은 공유 링크를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
const NOT_SHAREABLE = "이 풀이는 공유할 수 없어요. 기록에 저장된 풀이 그대로인지 확인해 주세요.";

async function open(request: Request) {
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const secret = signingSecret();
  const db = accountDb();
  if (!secret || !db) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  const body = ShareBody.safeParse(await readJson(request, 64_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const chapter = await openChapterForShare(body.data.chapterToken, body.data.reading, secret);
  if (!chapter) return errorResponse("BAD_TOKEN", { message: NOT_SHAREABLE });
  if (chapter.ctx.kind !== "tarot" && chapter.ctx.kind !== "saju") return errorResponse("NOT_AVAILABLE", { message: "이 풀이는 아직 공유할 수 없어요." });
  // 오픈 기념 무료 is read and kept on the device only (owner 2026-10-14 evening).
  if (isOpeningChapter(chapter.ctx)) return errorResponse("NOT_AVAILABLE", { reason: "opening", message: OPENING_KEEP_ONLY });
  return { db, secret, chapter, body: body.data, chapterKey: await sha256(chapter.id) };
}

export async function POST(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  // The design the reading was written for (signed in its chapter; none: the 1909 scans).
  const ctx = opened.chapter.ctx;
  const payload = buildSharePayload(ctx, opened.body.reading, ctx.kind === "tarot" ? ctx.input.deck : undefined);
  const now = Date.now();
  const session = await readSession(opened.db, parseCookies(request)[sessionCookieName()], opened.secret, now);
  const id = await saveShare(opened.db, opened.chapterKey, payload, now, session?.user.id ?? null);
  return json({ id, path: `/s/${id}` });
}

export async function DELETE(request: Request): Promise<Response> {
  const opened = await open(request);
  if (opened instanceof Response) return opened;
  return json({ deleted: await deleteShare(opened.db, opened.chapterKey) });
}
