import type { BondBasis, BondPart, Orientation, SignId } from "@starlog/core";

/** 별자리 인연 storage (migrations/0001_bonds.sql). Times are ms since epoch. */

export interface OwnerRow { id: string; nickname: string; rankingPublic: boolean; basis: BondBasis; lastRefillAt: number | null; createdAt: number }
export interface InviteRow { code: string; ownerId: string; createdAt: number; revokedAt: number | null }
export type ConstellationStatus = "filling" | "complete";
export interface ConstellationRow { id: string; ownerId: string; sign: SignId; status: ConstellationStatus; total: number; startedAt: number; completedAt: number | null }
export interface StarRow {
  id: string; constellationId: string; slot: number; nickname: string; message: string | null;
  cardId: string; orientation: Orientation; score: number; parts: BondPart[]; friendKey: string; createdAt: number;
}
export interface RankingEntry { constellationId: string; nickname: string; total: number; completedAt: number }

export interface BondsRepo {
  getOwner(id: string): Promise<OwnerRow | null>;
  upsertOwner(row: OwnerRow): Promise<void>;
  activeInvite(ownerId: string): Promise<InviteRow | null>;
  inviteByCode(code: string): Promise<InviteRow | null>;
  insertInvite(row: InviteRow): Promise<void>;
  revokeInvites(ownerId: string, at: number): Promise<void>;
  getConstellation(id: string): Promise<ConstellationRow | null>;
  fillingOf(ownerId: string): Promise<ConstellationRow | null>;
  completedOf(ownerId: string): Promise<ConstellationRow[]>;
  insertConstellation(row: ConstellationRow): Promise<void>;
  updateConstellation(id: string, patch: Partial<Pick<ConstellationRow, "status" | "total" | "completedAt">>): Promise<void>;
  deleteConstellation(id: string): Promise<void>; // deletes its stars too
  starsOf(constellationId: string): Promise<StarRow[]>; // slot order
  insertStar(row: StarRow): Promise<void>; // rejects duplicate (constellationId, slot) or (constellationId, friendKey)
  deleteStar(id: string): Promise<void>;
  starsSince(ownerId: string, since: number): Promise<number>;
  ranking(sign: SignId, since: number | null, limit: number): Promise<RankingEntry[]>; // public owners, complete, total desc, completedAt asc
  rankOf(constellationId: string, since: number | null): Promise<number | null>; // 1-based among public entries; null if not ranked
}

/** Ranking order: higher total first, then the earlier completion, then the id (a stable last resort). */
export function compareRanked(a: { total: number; completedAt: number; id: string }, b: { total: number; completedAt: number; id: string }): number {
  return b.total - a.total || a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
