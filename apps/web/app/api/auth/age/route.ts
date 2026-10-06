import { z } from "zod";
import { issueAgeCheck } from "@/lib/account/oauthState";
import { openAccountRoute } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { errorResponse, json, readJson } from "@/lib/api/http";

/** `ageConfirmed: true` = the 만 14세 box on /login was ticked; `provider` = the button (Kakao when absent). */
const AgeBody = z.object({ ageConfirmed: z.literal(true), returnTo: z.string().max(200).optional(), provider: z.enum(["kakao", "google"]).optional() });

/**
 * POST {ageConfirmed: true, returnTo?, provider?} from /login (our own pages only) → the URL that
 * starts Kakao or Google login, with a signed 5-minute token saying the 만 14세 box was ticked.
 * /api/auth/kakao/start and /api/auth/google/start take nothing else as the check, so a link from
 * anywhere cannot skip it.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const body = AgeBody.safeParse(await readJson(request, 1_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const token = await issueAgeCheck(ctx.secret, ctx.now);
  const provider = body.data.provider ?? "kakao";
  return json({ url: `/api/auth/${provider}/start?returnTo=${encodeURIComponent(safeReturnTo(body.data.returnTo))}&age=${encodeURIComponent(token)}` });
}
