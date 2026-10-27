import type { SignId } from "@starlog/core";
import { CONSTELLATIONS } from "@starlog/core";
import { compareRanked, type BondsRepo, type ConstellationRow, type InviteRow, type OwnerRow, type RankingEntry, type SignTop, type StarRow } from "./bondsRepo";

/**
 * In-memory BondsRepo for tests and `next dev` without D1. Same semantics as the D1 one (contract.ts);
 * the multi-step writes run without an await in between, so they are atomic like a D1 batch.
 */
export function createMemoryBondsRepo(): BondsRepo {
  const owners = new Map<string, OwnerRow>();
  const acts = new Map<string, { day: string; count: number }>();
  const invites = new Map<string, InviteRow>();
  const constellations = new Map<string, ConstellationRow>();
  const stars = new Map<string, StarRow>();

  const copy = <T extends object>(row: T): T => structuredClone(row);
  const ownedBy = (ownerId: string) => [...constellations.values()].filter((c) => c.ownerId === ownerId);
  const starsIn = (constellationId: string) => [...stars.values()].filter((s) => s.constellationId === constellationId);

  /** Complete constellations of public owners for a sign, in ranking order. */
  const ranked = (sign: SignId, since: number | null) =>
    [...constellations.values()]
      .filter((c): c is ConstellationRow & { completedAt: number } =>
        c.sign === sign && c.status === "complete" && c.completedAt !== null && owners.get(c.ownerId)?.rankingPublic === true && (since === null || c.completedAt >= since))
      .sort(compareRanked);

  const checkStar = (row: StarRow) => {
    for (const s of stars.values()) {
      if (s.constellationId === row.constellationId && (s.slot === row.slot || s.friendKey === row.friendKey)) throw new Error("UNIQUE");
    }
    if (stars.has(row.id)) throw new Error("UNIQUE");
  };

  /** A star without the score notice makes its constellation's scores private, for good (as D1's migration 0017). */
  const markPrivate = (row: StarRow) => {
    const constellation = constellations.get(row.constellationId);
    if (constellation && !row.scorePublic) constellations.set(row.constellationId, { ...constellation, scoresPrivate: true });
  };

  const tallyNow = (constellationId: string, slots: number, now: number) => {
    const row = constellations.get(constellationId);
    if (!row) return;
    const mine = starsIn(constellationId);
    const full = mine.length >= slots;
    constellations.set(constellationId, {
      ...row,
      total: mine.reduce((n, s) => n + s.score, 0),
      status: full ? "complete" : row.status,
      completedAt: row.completedAt === null && full ? now : row.completedAt,
    });
  };

  return {
    async getOwner(id) {
      const row = owners.get(id);
      return row ? copy(row) : null;
    },
    async upsertOwner(row) {
      const existing = owners.get(row.id);
      const { userId: _ignored, ...fields } = row;
      owners.set(row.id, copy({
        ...fields,
        createdAt: existing?.createdAt ?? row.createdAt,
        joinsDay: existing ? existing.joinsDay : null,
        joinsCount: existing ? existing.joinsCount : 0,
        // only linkOwner writes the account
        ...(existing?.userId ? { userId: existing.userId } : {}),
      }));
    },
    async ownerOfUser(userId) {
      const row = [...owners.values()].find((o) => o.userId === userId);
      return row ? copy(row) : null;
    },
    async linkOwner(ownerId, userId) {
      const row = owners.get(ownerId);
      if (!row || row.userId || [...owners.values()].some((o) => o.userId === userId)) return "taken";
      owners.set(ownerId, { ...row, userId });
      return "linked";
    },
    async deleteOwner(id) {
      for (const c of ownedBy(id)) {
        for (const [key, s] of stars) if (s.constellationId === c.id) stars.delete(key);
        constellations.delete(c.id);
      }
      for (const [code, invite] of invites) if (invite.ownerId === id) invites.delete(code);
      owners.delete(id);
    },
    async activeInvite(ownerId) {
      const row = [...invites.values()].filter((i) => i.ownerId === ownerId && i.revokedAt === null).sort((a, b) => b.createdAt - a.createdAt)[0];
      return row ? copy(row) : null;
    },
    async inviteByCode(code) {
      const row = invites.get(code);
      return row ? copy(row) : null;
    },
    async insertInvite(row) {
      if (invites.has(row.code)) throw new Error("UNIQUE");
      invites.set(row.code, copy(row));
    },
    async revokeInvites(ownerId, at) {
      for (const row of invites.values()) if (row.ownerId === ownerId && row.revokedAt === null) row.revokedAt = at;
    },
    async invitesSince(ownerId, since) {
      return [...invites.values()].filter((i) => i.ownerId === ownerId && i.createdAt >= since).length;
    },
    async getConstellation(id) {
      const row = constellations.get(id);
      return row ? copy(row) : null;
    },
    async fillingOf(ownerId) {
      const row = ownedBy(ownerId).find((c) => c.status === "filling");
      return row ? copy(row) : null;
    },
    async completedOf(ownerId) {
      return ownedBy(ownerId)
        .filter((c) => c.status === "complete")
        .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
        .map(copy);
    },
    async insertConstellation(row) {
      const clash = ownedBy(row.ownerId).some((c) => c.sign === row.sign || (row.status === "filling" && c.status === "filling"));
      if (constellations.has(row.id) || clash) throw new Error("UNIQUE");
      constellations.set(row.id, copy(row));
    },
    async updateConstellation(id, patch) {
      const row = constellations.get(id);
      if (!row) return;
      if (patch.status === "filling" && ownedBy(row.ownerId).some((c) => c.id !== id && c.status === "filling")) throw new Error("UNIQUE");
      constellations.set(id, { ...row, ...patch });
    },
    async deleteConstellation(id) {
      for (const [key, s] of stars) if (s.constellationId === id) stars.delete(key);
      constellations.delete(id);
    },
    async starsByFriend(friendKey, limit) {
      return [...stars.values()]
        .filter((s) => s.friendKey === friendKey)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(copy);
    },
    async starsOf(constellationId) {
      return starsIn(constellationId).sort((a, b) => a.slot - b.slot).map(copy);
    },
    async insertStar(row) {
      checkStar(row);
      stars.set(row.id, copy(row));
      markPrivate(row);
    },
    async joinStar(row, slots, day, now, next = null) {
      checkStar(row);
      const constellation = constellations.get(row.constellationId);
      if (!constellation) throw new Error("FOREIGN KEY");
      stars.set(row.id, copy(row));
      markPrivate(row);
      tallyNow(row.constellationId, slots, now);
      const owner = owners.get(constellation.ownerId);
      if (owner) owners.set(owner.id, { ...owner, joinsCount: owner.joinsDay === day ? owner.joinsCount + 1 : 1, joinsDay: day });
      const after = constellations.get(row.constellationId)!;
      const theirs = ownedBy(after.ownerId);
      if (next && after.status === "complete" && after.completedAt === now && !theirs.some((c) => c.status === "filling" || c.sign === next.sign)) {
        constellations.set(next.id, { id: next.id, ownerId: after.ownerId, sign: next.sign, status: "filling", total: 0, startedAt: now, completedAt: null });
      }
      return copy(after);
    },
    async tally(constellationId, slots, now) {
      tallyNow(constellationId, slots, now);
    },
    async bumpActions(ownerId, day) {
      const prev = acts.get(ownerId);
      const next = { day, count: prev?.day === day ? prev.count + 1 : 1 };
      acts.set(ownerId, next);
      return next.count;
    },
    async deleteStar(id) {
      stars.delete(id);
    },
    async latestStarOf(ownerId, friendKey) {
      const mine = new Set(ownedBy(ownerId).map((c) => c.id));
      const star = [...stars.values()]
        .filter((s) => s.friendKey === friendKey && mine.has(s.constellationId))
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return star ? { star: copy(star), constellation: copy(constellations.get(star.constellationId)!) } : null;
    },
    async ranking(sign, since, limit) {
      return ranked(sign, since)
        .slice(0, limit)
        .map((c): RankingEntry => ({ constellationId: c.id, nickname: owners.get(c.ownerId)!.nickname, total: c.total, completedAt: c.completedAt }));
    },
    async topsBySign(since, perSign) {
      return CONSTELLATIONS.flatMap((c) =>
        ranked(c.id, since)
          .slice(0, perSign)
          .map((row, i): SignTop => ({ sign: c.id, rank: i + 1, nickname: owners.get(row.ownerId)!.nickname, total: row.total, completedAt: row.completedAt })),
      );
    },
    async rankOf(constellationId, since) {
      const row = constellations.get(constellationId);
      if (!row) return null;
      const index = ranked(row.sign, since).findIndex((c) => c.id === constellationId);
      return index < 0 ? null : index + 1;
    },
  };
}
