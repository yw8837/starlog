import { allowed, bondsRoute, fail, ok } from "@/lib/bonds/api";
import { resolveInvite } from "@/lib/bonds/service";

/**
 * GET ?code= → whose constellation a code opens and how full it is. Limited per IP (guessing codes);
 * unknown and revoked codes get the same BAD_CODE.
 */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "resolve", async ({ now, repo }) => {
    if (!(await allowed(request, "BOND_CODE_LIMITER", now))) return fail("RATE_LIMIT");
    const code = new URL(request.url).searchParams.get("code") ?? "";
    return ok({ ...(await resolveInvite(repo, code)) });
  });
}
