import "server-only";
import { clientKey } from "@/lib/api/http";
import { dailyStore } from "@/lib/api/dailyStore";
import { rateLimit } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";

/**
 * Invite-code lookups (the friend page, /api/bonds/resolve, joins and the invite OG card). Opening a
 * real code is cheap and allowed generously per network (BOND_VIEW_LIMITER, for link-preview crawlers
 * too); a code that does not exist counts strictly (BOND_CODE_LIMITER), and a network over that limit
 * is shut out of every lookup for a while, so codes cannot be enumerated.
 */

const BLOCK_SECONDS = 10 * 60;

export interface CodeGuard {
  /** false while the network is blocked or over the generous limit: answer without looking up */
  allowed(): Promise<boolean>;
  /** a lookup found no live code */
  failed(): Promise<void>;
}

async function blockKey(network: string): Promise<string> {
  // Raw IPs never reach storage: the key is an HMAC under the signing secret.
  return `code-block:${await keyedHash(`client:${network}`, signingSecret() ?? "starlog-no-secret")}`;
}

export function codeGuard(request: Request, now = Date.now()): CodeGuard {
  const network = clientKey(request);
  return {
    async allowed() {
      try {
        if (await dailyStore().get(await blockKey(network))) return false;
      } catch {
        // storage trouble: the per-minute limiters still apply
      }
      return rateLimit("BOND_VIEW_LIMITER", network, now);
    },
    async failed() {
      if (await rateLimit("BOND_CODE_LIMITER", network, now)) return;
      try {
        await dailyStore().put(await blockKey(network), 1, BLOCK_SECONDS);
      } catch {
        // best effort
      }
    },
  };
}
