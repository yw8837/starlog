import type { BondBasis, BondPart, Orientation, SignId } from "@starlog/core";
import type { BondsRepo, ConstellationRow, ConstellationStatus, InviteRow, OwnerRow, RankingEntry, StarRow } from "./bondsRepo";
import type { D1Binding } from "./d1";

/** BondsRepo on Cloudflare D1 (migrations/0001_bonds.sql). JSON columns end in `_json`; booleans are 0/1. */

interface OwnerRecord { id: string; nickname: string; ranking_public: number; basis_json: string; last_refill_at: number | null; created_at: number }
interface InviteRecord { code: string; owner_id: string; created_at: number; revoked_at: number | null }
interface ConstellationRecord {
  id: string; owner_id: string; sign: string; status: string; total: number; started_at: number; completed_at: number | null;
}
interface StarRecord {
  id: string; constellation_id: string; slot: number; nickname: string; message: string | null; card_id: string;
  orientation: string; score: number; parts_json: string; friend_key: string; created_at: number;
}
interface RankingRecord { id: string; nickname: string; total: number; completed_at: number }

const toOwner = (r: OwnerRecord): OwnerRow => ({
  id: r.id, nickname: r.nickname, rankingPublic: r.ranking_public === 1, basis: JSON.parse(r.basis_json) as BondBasis,
  lastRefillAt: r.last_refill_at, createdAt: r.created_at,
});
const toInvite = (r: InviteRecord): InviteRow => ({ code: r.code, ownerId: r.owner_id, createdAt: r.created_at, revokedAt: r.revoked_at });
const toConstellation = (r: ConstellationRecord): ConstellationRow => ({
  id: r.id, ownerId: r.owner_id, sign: r.sign as SignId, status: r.status as ConstellationStatus, total: r.total,
  startedAt: r.started_at, completedAt: r.completed_at,
});
const toStar = (r: StarRecord): StarRow => ({
  id: r.id, constellationId: r.constellation_id, slot: r.slot, nickname: r.nickname, message: r.message, cardId: r.card_id,
  orientation: r.orientation as Orientation, score: r.score, parts: JSON.parse(r.parts_json) as BondPart[], friendKey: r.friend_key,
  createdAt: r.created_at,
});

/** Complete constellations of public owners for a sign (the ranking pool); `?1` is the sign, `?2` since or null. */
const RANKED = `FROM constellations c JOIN owners o ON o.id = c.owner_id
  WHERE c.sign = ?1 AND c.status = 'complete' AND o.ranking_public = 1 AND (?2 IS NULL OR c.completed_at >= ?2)`;

const PATCH_COLUMNS = { status: "status", total: "total", completedAt: "completed_at" } as const;

export function createD1BondsRepo(db: D1Binding): BondsRepo {
  const one = <T>(sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values).first<T>();
  const all = async <T>(sql: string, ...values: unknown[]) => (await db.prepare(sql).bind(...values).all<T>()).results;
  const run = async (sql: string, ...values: unknown[]) => {
    await db.prepare(sql).bind(...values).run();
  };

  return {
    async getOwner(id) {
      const r = await one<OwnerRecord>("SELECT * FROM owners WHERE id = ?", id);
      return r ? toOwner(r) : null;
    },
    async upsertOwner(row) {
      await run(
        `INSERT INTO owners (id, nickname, ranking_public, basis_json, last_refill_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, ranking_public = excluded.ranking_public,
           basis_json = excluded.basis_json, last_refill_at = excluded.last_refill_at`,
        row.id, row.nickname, row.rankingPublic ? 1 : 0, JSON.stringify(row.basis), row.lastRefillAt, row.createdAt,
      );
    },
    async activeInvite(ownerId) {
      const r = await one<InviteRecord>("SELECT * FROM invites WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", ownerId);
      return r ? toInvite(r) : null;
    },
    async inviteByCode(code) {
      const r = await one<InviteRecord>("SELECT * FROM invites WHERE code = ?", code);
      return r ? toInvite(r) : null;
    },
    async insertInvite(row) {
      await run("INSERT INTO invites (code, owner_id, created_at, revoked_at) VALUES (?, ?, ?, ?)", row.code, row.ownerId, row.createdAt, row.revokedAt);
    },
    async revokeInvites(ownerId, at) {
      await run("UPDATE invites SET revoked_at = ? WHERE owner_id = ? AND revoked_at IS NULL", at, ownerId);
    },
    async getConstellation(id) {
      const r = await one<ConstellationRecord>("SELECT * FROM constellations WHERE id = ?", id);
      return r ? toConstellation(r) : null;
    },
    async fillingOf(ownerId) {
      const r = await one<ConstellationRecord>(
        "SELECT * FROM constellations WHERE owner_id = ? AND status = 'filling' ORDER BY started_at DESC LIMIT 1",
        ownerId,
      );
      return r ? toConstellation(r) : null;
    },
    async completedOf(ownerId) {
      const rows = await all<ConstellationRecord>("SELECT * FROM constellations WHERE owner_id = ? AND status = 'complete' ORDER BY completed_at ASC", ownerId);
      return rows.map(toConstellation);
    },
    async insertConstellation(row) {
      await run(
        "INSERT INTO constellations (id, owner_id, sign, status, total, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        row.id, row.ownerId, row.sign, row.status, row.total, row.startedAt, row.completedAt,
      );
    },
    async updateConstellation(id, patch) {
      const keys = (Object.keys(PATCH_COLUMNS) as (keyof typeof PATCH_COLUMNS)[]).filter((k) => patch[k] !== undefined);
      if (keys.length === 0) return;
      const set = keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(", ");
      await run(`UPDATE constellations SET ${set} WHERE id = ?`, ...keys.map((k) => patch[k]), id);
    },
    async deleteConstellation(id) {
      await db.batch([
        db.prepare("DELETE FROM stars WHERE constellation_id = ?").bind(id),
        db.prepare("DELETE FROM constellations WHERE id = ?").bind(id),
      ]);
    },
    async starsOf(constellationId) {
      return (await all<StarRecord>("SELECT * FROM stars WHERE constellation_id = ? ORDER BY slot ASC", constellationId)).map(toStar);
    },
    async insertStar(row) {
      await run(
        `INSERT INTO stars (id, constellation_id, slot, nickname, message, card_id, orientation, score, parts_json, friend_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.constellationId, row.slot, row.nickname, row.message, row.cardId, row.orientation, row.score,
        JSON.stringify(row.parts), row.friendKey, row.createdAt,
      );
    },
    async deleteStar(id) {
      await run("DELETE FROM stars WHERE id = ?", id);
    },
    async starsSince(ownerId, since) {
      const r = await one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM stars s JOIN constellations c ON c.id = s.constellation_id WHERE c.owner_id = ? AND s.created_at >= ?",
        ownerId, since,
      );
      return r?.n ?? 0;
    },
    async ranking(sign, since, limit) {
      const rows = await all<RankingRecord>(
        `SELECT c.id, o.nickname, c.total, c.completed_at ${RANKED} ORDER BY c.total DESC, c.completed_at ASC, c.id ASC LIMIT ?3`,
        sign, since, limit,
      );
      return rows.map((r): RankingEntry => ({ constellationId: r.id, nickname: r.nickname, total: r.total, completedAt: r.completed_at }));
    },
    async rankOf(constellationId, since) {
      const row = await one<ConstellationRecord & { ranking_public: number }>(
        "SELECT c.*, o.ranking_public FROM constellations c JOIN owners o ON o.id = c.owner_id WHERE c.id = ?",
        constellationId,
      );
      if (!row || row.status !== "complete" || row.completed_at === null || row.ranking_public !== 1) return null;
      if (since !== null && row.completed_at < since) return null;
      const ahead = await one<{ n: number }>(
        `SELECT COUNT(*) AS n ${RANKED}
           AND (c.total > ?3 OR (c.total = ?3 AND (c.completed_at < ?4 OR (c.completed_at = ?4 AND c.id < ?5))))`,
        row.sign, since, row.total, row.completed_at, row.id,
      );
      return (ahead?.n ?? 0) + 1;
    },
  };
}
