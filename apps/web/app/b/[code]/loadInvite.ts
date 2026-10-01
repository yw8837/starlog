import "server-only";
import { cookies, headers } from "next/headers";
import { codeGuard } from "@/lib/bonds/codeGuard";
import { existingFriendKey, readOwnerId } from "@/lib/bonds/identity";
import { BondsError, invitePage, type InvitePage } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { bondsRepo } from "@/lib/db";
import { signingSecret } from "@/lib/security/sign";

export type { FriendResultView } from "@/lib/bonds/service";

/** The friend page's state: `invitePage` for this visitor, plus the code, or why there is nothing to show. */
export type InviteState =
  | (Extract<InvitePage, { kind: "self" }> & { status: "self"; code: string })
  | (Extract<InvitePage, { kind: "joined" }> & { status: "joined"; code: string })
  | (Extract<InvitePage, { kind: "open" }> & { status: "open"; code: string })
  | (Extract<InvitePage, { kind: "choosing" }> & { status: "choosing"; code: string })
  | (Extract<InvitePage, { kind: "alldone" }> & { status: "alldone"; code: string })
  | { status: "bad" }
  | { status: "limited" }
  | { status: "error" };

/** The code in a URL segment, or null when it is malformed (a bad %-escape included). */
export function codeFromSegment(raw: string): string | null {
  try {
    return normalizeCode(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/**
 * What an invite code opens for this visitor. A lookup like GET /api/bonds/resolve (codeGuard): real
 * codes open generously, unknown and revoked ones count strictly and answer alike (`bad`). The device
 * cookies say whether this is the owner, or a friend who already joined (never minted here).
 */
export async function loadInvite(raw: string): Promise<InviteState> {
  const code = codeFromSegment(raw);
  if (!code) return { status: "bad" };
  const guard = codeGuard(new Request("http://local/b", { headers: await headers() }));
  if (!(await guard.allowed())) return { status: "limited" };
  try {
    const secret = signingSecret();
    const jar = Object.fromEntries((await cookies()).getAll().map((c) => [c.name, c.value]));
    const viewer = secret
      ? { ownerId: await readOwnerId(jar, secret), friendKey: await existingFriendKey(jar, secret) }
      : { ownerId: null, friendKey: null };
    const page = await invitePage(bondsRepo(), code, viewer);
    return { ...page, status: page.kind, code } as InviteState;
  } catch (error) {
    if (error instanceof BondsError && error.code === "BAD_CODE") {
      await guard.failed();
      return { status: "bad" };
    }
    console.error(JSON.stringify({ evt: "bonds.invite_page", error: error instanceof Error ? error.constructor.name : typeof error }));
    return { status: "error" };
  }
}
