import { bondsRoute, fail, ok } from "@/lib/bonds/api";
import { codeGuard } from "@/lib/bonds/codeGuard";
import { BondsError, resolveInvite } from "@/lib/bonds/service";

/**
 * GET ?code= → whose constellation a code opens and how full it is. Unknown and revoked codes get the
 * same BAD_CODE and count strictly against the network (codeGuard); real codes open generously.
 */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "resolve", async ({ now, repo }) => {
    const guard = codeGuard(request, now);
    // a network shut out for a wrong code waits up to 10 minutes (codeGuard), not the usual minute
    if (!(await guard.allowed())) return fail("CODE_LIMIT");
    const code = new URL(request.url).searchParams.get("code") ?? "";
    try {
      return ok({ ...(await resolveInvite(repo, code)) });
    } catch (error) {
      if (error instanceof BondsError && error.code === "BAD_CODE") await guard.failed();
      throw error;
    }
  });
}
