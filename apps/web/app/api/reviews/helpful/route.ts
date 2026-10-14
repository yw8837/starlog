import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { setHelpful } from "@/lib/reviews/store";

const HelpfulBody = z.object({ id: z.string().regex(/^[a-z0-9]{16}$/), on: z.boolean() });

/** POST {id, on} → { ok, on, helpful }: 도움돼요 on or off (logged in; never on my own review), with the state and count it is in now. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const body = HelpfulBody.safeParse(await readJson(request, 500));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const state = await setHelpful(ctx.db, session.user.id, body.data.id, body.data.on, ctx.now);
  return state ? json({ ok: true, ...state }) : errorResponse("NOT_AVAILABLE", { message: "이 후기에는 누를 수 없어요." });
}
