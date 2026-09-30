import { errorResponse, json, parseCookies, readJson, serializeCookie } from "@/lib/api/http";
import { openCommit } from "@/lib/security/commit";
import { signingSecret } from "@/lib/security/sign";

/**
 * POST {commit} → sets the quota/daily cookies a streamed generation earned. The token comes from
 * the stream's `done` event; it is only honoured while the cookies still hold the values the
 * generation started from.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  const body = (await readJson(request, 8_000)) as { commit?: unknown } | null;
  if (!body || typeof body.commit !== "string") return errorResponse("BAD_REQUEST");
  const cookies = await openCommit(body.commit, parseCookies(request), secret, Date.now());
  if (!cookies) return errorResponse("BAD_TOKEN", { message: "이미 반영됐거나 만료된 요청이에요." });
  return json({ ok: true }, { cookies: cookies.map(serializeCookie) });
}
