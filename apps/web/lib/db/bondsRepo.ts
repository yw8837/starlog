import type { BondBasis, BondPart, Orientation, SignId } from "@starlog/core";

/** 별자리 인연 storage (migrations/0001_bonds.sql). Times are ms since epoch; days are KST "YYYY-MM-DD". */

export interface OwnerRow {
  id: string; nickname: string; rankingPublic: boolean; basis: BondBasis; lastRefillAt: number | null; createdAt: number;
  /** join events on `joinsDay` (only joinStar moves them; upsertOwner never writes them) */
  joinsDay: string | null; joinsCount: number;
}
export interface InviteRow { code: string; ownerId: string; createdAt: number; revokedAt: number | null }
export type ConstellationStatus = "filling" | "complete";
export interface ConstellationRow {
  id: string; ownerId: string; sign: SignId; status: ConstellationStatus; total: number; startedAt: number; completedAt: number | null;
  /**
   * its friends' scores never show on its public share (migration 0017): set once a star goes in without the score
   * notice, and never cleared. Absent: shown; the D1 repository reads a database without the column as private.
   */
  scoresPrivate?: boolean;
}
export interface StarRow {
  id: string; constellationId: string; slot: number; nickname: string; message: string | null;
  cardId: string; orientation: Orientation; score: number; parts: BondPart[]; friendKey: string; createdAt: number;
  /** the friend joined after the form said their score shows on the owner's share (migration 0016); absent: false */
  scorePublic?: boolean;
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
  /** rejects duplicate (constellationId, slot) or (constellationId, friendKey); a star without `scorePublic` makes its constellation's scores private, as joinStar does */
  insertStar(row: StarRow): Promise<void>;
  /**
   * One atomic step: insert the star, recount the constellation (total = sum of scores; complete with
   * completedAt `now` once it holds `slots` stars), count the join on the owner's `day`, and when this
   * star completes it, start `next` as the sign being filled (skipped if the owner already has that
   * sign or a sign being filled). A star without `scorePublic` sets the constellation's scoresPrivate in the
   * same step, for good. Nothing is written when the star cannot go in (a duplicate slot or friend). Returns
   * the constellation after it.
   */
  joinStar(row: StarRow, slots: number, day: string, now: number, next?: { id: string; sign: SignId } | null): Promise<ConstellationRow>;
  /** Recount a constellation from its stars (total; complete when it holds `slots` stars). */
  tally(constellationId: string, slots: number, now: number): Promise<void>;
  /** Count one removal or switch on the owner's `day`; the count for that day after it. */
  bumpActions(ownerId: string, day: string): Promise<number>;
  deleteStar(id: string): Promise<void>;
  /** This friend device's stars in anyone's constellations, newest first (내가 들어간 별자리). */
  starsByFriend(friendKey: string, limit: number): Promise<StarRow[]>;
  /** This friend device's most recent star in any of the owner's constellations, with that constellation. */
  latestStarOf(ownerId: string, friendKey: string): Promise<{ star: StarRow; constellation: ConstellationRow } | null>;
  ranking(sign: SignId, since: number | null, limit: number): Promise<RankingEntry[]>; // public owners, complete, total desc, completedAt asc
  rankOf(constellationId: string, since: number | null): Promise<number | null>; // 1-based among public entries; null if not ranked
  /** The first `perSign` of every sign's ranking since `since` (null: all time), in one call (sign, then rank order; one batch on D1). */
  topsBySign(since: number | null, perSign: number): Promise<SignTop[]>;
}

/** Ranking order: higher total first, then the earlier completion, then the id (a stable last resort). */
export function compareRanked(a: { total: number; completedAt: number; id: string }, b: { total: number; completedAt: number; id: string }): number {
  return b.total - a.total || a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
