import "server-only";
import { headers } from "next/headers";
import type { SignId } from "@starlog/core";
import { codeGuard } from "@/lib/bonds/codeGuard";
import { BondsError, resolveInvite } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { bondsRepo } from "@/lib/db";

export type InviteState =
  | { status: "open"; code: string; ownerNickname: string; sign: SignId; filled: number; slots: number }
  | { status: "choosing"; code: string; ownerNickname: string }
  | { status: "alldone"; code: string; ownerNickname: string }
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
 * What an invite code opens, for the friend page. A lookup like GET /api/bonds/resolve (codeGuard):
 * real codes open generously, unknown and revoked ones count strictly and answer alike (`bad`).
 */
export async function loadInvite(raw: string): Promise<InviteState> {
  const code = codeFromSegment(raw);
  if (!code) return { status: "bad" };
  const guard = codeGuard(new Request("http://local/b", { headers: await headers() }));
  if (!(await guard.allowed())) return { status: "limited" };
  try {
    const info = await resolveInvite(bondsRepo(), code);
    return info.sign
      ? { status: "open", code, ownerNickname: info.ownerNickname, sign: info.sign, filled: info.filled, slots: info.slots }
      : info.allDone
        ? { status: "alldone", code, ownerNickname: info.ownerNickname }
        : { status: "choosing", code, ownerNickname: info.ownerNickname };
  } catch (error) {
    if (error instanceof BondsError && error.code === "BAD_CODE") {
      await guard.failed();
      return { status: "bad" };
    }
    console.error(JSON.stringify({ evt: "bonds.invite_page", error: error instanceof Error ? error.constructor.name : typeof error }));
    return { status: "error" };
  }
}
