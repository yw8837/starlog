import type { BondBasis, BondPart, Orientation, SignId } from "@starlog/core";

/** 별자리 인연 storage (migrations/0001_bonds.sql). Times are ms since epoch; days are KST "YYYY-MM-DD". */

export interface OwnerRow {
  id: string; nickname: string; rankingPublic: boolean; basis: BondBasis; lastRefillAt: number | null; createdAt: number;
  /** join events on `joinsDay` (only joinStar moves them; upsertOwner never writes them) */
  joinsDay: string | null; joinsCount: number;
}
export interface InviteRow { code: string; ownerId: string; createdAt: number; revokedAt: number | null }
export type ConstellationStatus = "filling" | "complete";
export interface ConstellationRow { id: string; ownerId: string; sign: SignId; status: ConstellationStatus; total: number; startedAt: number; completedAt: number | null }
export interface StarRow {
  id: string; constellationId: string; slot: number; nickname: string; message: string | null;
  cardId: string; orientation: Orientation; score: number; parts: BondPart[]; friendKey: string; createdAt: number;
}
export interface RankingEntry { constellationId: string; nickname: string; total: number; completedAt: number }
export interface SignTop { sign: SignId; rank: number; nickname: string; total: number; completedAt: number }

export interface BondsRepo {
  getOwner(id: string): Promise<OwnerRow | null>;
  /** creates the owner, or updates nickname, ranking flag, basis and lastRefillAt (never the counters) */
  upsertOwner(row: OwnerRow): Promise<void>;
  activeInvite(ownerId: string): Promise<InviteRow | null>;
  inviteByCode(code: string): Promise<InviteRow | null>;
  insertInvite(row: InviteRow): Promise<void>;
  revokeInvites(ownerId: string, at: number): Promise<void>;
  /** invites made since `since` (live or revoked): the 코드 새로 만들기 cooldown */
  invitesSince(ownerId: string, since: number): Promise<number>;
  getConstellation(id: string): Promise<ConstellationRow | null>;
  fillingOf(ownerId: string): Promise<ConstellationRow | null>;
  completedOf(ownerId: string): Promise<ConstellationRow[]>;
  insertConstellation(row: ConstellationRow): Promise<void>; // rejects a second sign row or a second filling one per owner
  updateConstellation(id: string, patch: Partial<Pick<ConstellationRow, "status" | "total" | "completedAt">>): Promise<void>;
  deleteConstellation(id: string): Promise<void>; // deletes its stars too
  starsOf(constellationId: string): Promise<StarRow[]>; // slot order
  insertStar(row: StarRow): Promise<void>; // rejects duplicate (constellationId, slot) or (constellationId, friendKey)
  /**
   * One atomic step: insert the star, recount the constellation (total = sum of scores; complete with
   * completedAt `now` once it holds `slots` stars) and count the join on the owner's `day`. Nothing is
   * written when any part fails (a duplicate slot or friend). Returns the constellation after it.
   */
  joinStar(row: StarRow, slots: number, day: string, now: number): Promise<ConstellationRow>;
  /** Recount a constellation from its stars (total; complete when it holds `slots` stars). */
  tally(constellationId: string, slots: number, now: number): Promise<void>;
  /** Count one removal or switch on the owner's `day`; the count for that day after it. */
  bumpActions(ownerId: string, day: string): Promise<number>;
  deleteStar(id: string): Promise<void>;
  ranking(sign: SignId, since: number | null, limit: number): Promise<RankingEntry[]>; // public owners, complete, total desc, completedAt asc
  rankOf(constellationId: string, since: number | null): Promise<number | null>; // 1-based among public entries; null if not ranked
  /** The first `perSign` of every sign's ranking since `since`, in one query (sign, then rank order). */
  topsBySign(since: number, perSign: number): Promise<SignTop[]>;
}

/** Ranking order: higher total first, then the earlier completion, then the id (a stable last resort). */
export function compareRanked(a: { total: number; completedAt: number; id: string }, b: { total: number; completedAt: number; id: string }): number {
  return b.total - a.total || a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
