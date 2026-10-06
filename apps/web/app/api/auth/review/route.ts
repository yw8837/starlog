import { z } from "zod";
import { reviewLogin, reviewUserKey } from "@/lib/account/review";
import { openAccountRoute } from "@/lib/account/request";
import { createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser } from "@/lib/account/users";
import { dailyStore } from "@/lib/api/dailyStore";
import { clientKey, errorResponse, json, readJson, serializeCookie } from "@/lib/api/http";
import { keyedHash, safeEqual } from "@/lib/security/sign";

const ReviewBody = z.object({ id: z.string().max(200), password: z.string().max(200) });

/** Failed logins one network may make before it waits FAILURE_WINDOW_SECONDS (counted in DAILY_KV). */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;

/**
 * POST {id, password} from /login/review (our own pages only) → a session on the review account
 * (lib/account/review.ts): the very session a Kakao login gets (createSession). 404 while review
 * login is off.
 * - Both values are always compared, in constant time (safeEqual), and one answer covers a wrong ID
 *   and a wrong password.
 * - A network with MAX_FAILURES failed logins waits 15 minutes after its last one, right password or
 *   not. It is counted under a keyed hash of the network, never the IP. The password is never logged.
 * - No signup gift. A session this browser held before is revoked, as on a Kakao login.
 */
export async function POST(request: Request): Promise<Response> {
  const login = reviewLogin();
  if (!login) return new Response("Not found", { status: 404 });
  // The owner code's limiter (5 a minute per network): KV has no atomic increment, so a parallel burst
  // would read one count; this caps bursts, the count below caps the steady pace.
  const ctx = await openAccountRoute(request, { limiter: "OWNER_LOGIN_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const failuresKey = `review-fail:${await keyedHash(`client:${clientKey(request)}`, ctx.secret)}`;
  const failures = Number(await dailyStore().get(failuresKey).catch(() => 0)) || 0;
  if (failures >= MAX_FAILURES) return errorResponse("RATE_LIMIT", { message: "로그인 시도가 많았어요. 15분 뒤에 다시 시도해 주세요." });
  const body = ReviewBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const [idMatches, passwordMatches] = await Promise.all([
    safeEqual(body.data.id.trim(), login.id, ctx.secret),
    safeEqual(body.data.password.trim(), login.password, ctx.secret),
  ]);
  if (!idMatches || !passwordMatches) {
    await dailyStore().put(failuresKey, failures + 1, FAILURE_WINDOW_SECONDS).catch(() => {});
    console.warn(JSON.stringify({ evt: "auth.review_failed" }));
    return errorResponse("BAD_TOKEN", { message: "아이디 또는 비밀번호가 맞지 않아요." });
  }
  const account = await loginKakaoUser(ctx.db, { key: await reviewUserKey(login, ctx.accountSecret), nickname: "심사용 계정", ageConfirmed: false, now: ctx.now });
  if (!account) {
    // Deleted moments ago and not erased yet: the maintenance cron finishes it within minutes.
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return errorResponse("PAY_UNAVAILABLE");
  }
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, account.user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.review_login", created: account.created }));
  return json({ ok: true }, { cookies: [serializeCookie(session.cookie)] });
}
