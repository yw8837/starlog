import "server-only";
import { readSession, sessionCookieName } from "@/lib/account/session";
import { accountDb } from "@/lib/db";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { readOwnerId } from "./identity";

/**
 * Who a 별자리 인연 request acts as (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"):
 * - `ownerId`: the logged-in account's owner; else this device's owner while it belongs to no account (one made on a
 *   device before accounts, until it is linked). Never an owner that belongs to an account without that account's
 *   session: a shared device after logging out shows nobody's constellation.
 * - `userId`: the logged-in account, if any (only it may start a new owner).
 * - `deviceOwnerId`: this device's owner while it belongs to no account: a logged-in visitor is offered 연결하기.
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
  return { ownerId: account?.id ?? deviceOwnerId, userId, deviceOwnerId };
}
