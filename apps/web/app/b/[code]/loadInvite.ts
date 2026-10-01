import "server-only";
import { headers } from "next/headers";
import type { SignId } from "@starlog/core";
import { clientKey } from "@/lib/api/http";
import { BondsError, resolveInvite } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { bondsRepo } from "@/lib/db";
import { rateLimit } from "@/lib/security/rateLimit";

export type InviteState =
  | { status: "open"; code: string; ownerNickname: string; sign: SignId; filled: number; slots: number }
  | { status: "choosing"; code: string; ownerNickname: string }
  | { status: "bad" }
  | { status: "limited" }
  | { status: "error" };

/**
 * What an invite code opens, for the friend page. Counts as a code lookup (BOND_CODE_LIMITER, per IP),
 * like GET /api/bonds/resolve; unknown and revoked codes are the same `bad`.
 */
export async function loadInvite(raw: string): Promise<InviteState> {
  const code = normalizeCode(decodeURIComponent(raw));
  if (!code) return { status: "bad" };
  const key = clientKey(new Request("http://local/b", { headers: await headers() }));
  if (!(await rateLimit("BOND_CODE_LIMITER", key))) return { status: "limited" };
  try {
    const info = await resolveInvite(bondsRepo(), code);
    return info.sign
      ? { status: "open", code, ownerNickname: info.ownerNickname, sign: info.sign, filled: info.filled, slots: info.slots }
      : { status: "choosing", code, ownerNickname: info.ownerNickname };
  } catch (error) {
    if (error instanceof BondsError && error.code === "BAD_CODE") return { status: "bad" };
    console.error(JSON.stringify({ evt: "bonds.invite_page", error: error instanceof Error ? error.constructor.name : typeof error }));
    return { status: "error" };
  }
}
