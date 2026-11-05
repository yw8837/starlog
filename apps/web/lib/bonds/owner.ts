import "server-only";
import { readSession, sessionCookieName } from "@/lib/account/session";
import { accountDb } from "@/lib/db";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { readOwnerId } from "./identity";

/**
 * Who a 별자리 인연 request acts as (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"; owner 2026-11-05: "애초에 로그인한 적이
 * 없는데 계속 보이게 남았다"):
 * - `ownerId`: the owner this request may see and act as, only with a session: the logged-in account's owner; else this
 *   device's owner while it belongs to no account (one made on a device before accounts, until it is linked). Without a
 *   session nobody's constellation shows, whoever's it is. Nothing is deleted.
 * - `userId`: the logged-in account, if any (only it may start a new owner).
 * - `deviceOwnerId`: this device's owner while it belongs to no account, session or not: a logged-in visitor is offered
 *   연결하기, a visitor is told it is there, and its own invite link is never joined. It shows and changes nothing itself.
 */
export interface OwnerIdentity {
  ownerId: string | null;
  userId: string | null;
  deviceOwnerId: string | null;
}

export async function whoOwns(repo: BondsRepo, cookies: Record<string, string>, secret: string, now: number): Promise<OwnerIdentity> {
  const db = accountDb();
  // No account store (a deploy without D1 for accounts) or a broken session: logged out, as before accounts.
  const session = db ? await readSession(db, cookies[sessionCookieName()], secret, now).catch(() => null) : null;
  const userId = session?.user.id ?? null;
  const deviceId = await readOwnerId(cookies, secret);
  const device = deviceId ? await repo.getOwner(deviceId) : null;
  const deviceOwnerId = device && !device.userId ? device.id : null;
  const account = userId ? await repo.ownerOfUser(userId) : null;
  return { ownerId: account?.id ?? (userId ? deviceOwnerId : null), userId, deviceOwnerId };
}
