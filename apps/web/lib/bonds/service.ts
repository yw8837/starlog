import "server-only";
import {
  CARDS, CONSTELLATIONS, DEFAULT_REVERSAL_RATE, SajuError, bondBasis, bondScore, createDeck, getConstellation, isSignId, kstWeekId, mirrorParts,
  seededRandom,
  type BondBasis, type BondBirth, type BondPart, type Orientation, type SignId,
} from "@starlog/core";
import type { BondsRepo, ConstellationRow, InviteRow, OwnerRow, RankingEntry, StarRow } from "@/lib/db/bondsRepo";
import { kstDay } from "@/lib/security/quota";
import { randomId } from "@/lib/security/sign";
import { bondCardLine } from "./bondCardText";
import { checkMessage, checkNickname, newInviteCode, normalizeCode } from "./text";

/**
 * 별자리 인연 rules (spec §2-§7, §11). Every function takes the repository and the current time first,
 * so the rules are tested without a clock or a database. Birth dates are used inside a call and never
 * stored: the owner keeps only the derived basis, a friend nothing but the score it produced.
 */

export type BondsErrorCode =
  | "NO_OWNER" | "BAD_INPUT" | "SIGN_COMPLETED" | "FILLING_EXISTS" | "NO_FILLING" | "BAD_CODE" | "CHOOSING" | "SELF_JOIN"
  | "ALREADY_JOINED" | "DAILY_STAR_LIMIT" | "DAILY_ACTION_LIMIT" | "COOLDOWN" | "INVITE_COOLDOWN" | "NOT_FOUND" | "ALL_DONE";

export class BondsError extends Error {
  constructor(
    readonly code: BondsErrorCode,
    /** BAD_INPUT: the field at fault ("nickname", "message", "birth", "pick", "sign") */
    readonly field?: string,
    /** COOLDOWN: when 새로 채우기 opens again (ms) */
    readonly retryAt?: number,
  ) {
    super(code);
    this.name = "BondsError";
  }
}

export const REFILL_COOLDOWN_MS = 60 * 60 * 1000;
/** join events per owner per KST day (a removed star still counted) */
export const DAILY_STAR_LIMIT = 20;
/** star removals and sign switches per owner per KST day */
export const DAILY_ACTION_LIMIT = 20;
/** 코드 새로 만들기 per owner per hour */
export const INVITES_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
/** Rows shown per ranking (podium 1-3, list 4-20); anyone further down sees their own rank in 내 순위. */
export const RANKING_LIMIT = 20;
const TOP_STARS = 5;
/** The friend picks from a fan of 21 face-down cards spread through a 78-card deck (components/tarot/CardFan). */
const FAN_SIZE = 21;
const DECK_SIZE = 78;

// ---- views (what the API sends; never a friend key or a birth date) ----

export interface ConstellationView {
  id: string;
  sign: SignId;
  status: ConstellationRow["status"];
  total: number;
  startedAt: number;
  completedAt: number | null;
}

export interface StarView {
  id: string;
  slot: number;
  nickname: string;
  message: string | null;
  cardId: string;
  orientation: Orientation;
  score: number;
  parts: BondPart[];
  createdAt: number;
  /** the 인연 카드's "요즘 두 사람 사이" line */
  line: string;
}

const constellationView = ({ ownerId: _owner, ...row }: ConstellationRow): ConstellationView => row;
const starView = ({ friendKey: _key, constellationId: _c, ...star }: StarRow): StarView => ({ ...star, line: bondCardLine(star.cardId, star.orientation) });

// ---- helpers ----

const kstStart = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
/** This week's ranking starts on the KST Monday at 00:00. */
export const weekStart = (now: number) => kstStart(kstWeekId(now));

async function requireOwner(repo: BondsRepo, ownerId: string): Promise<OwnerRow> {
  const owner = await repo.getOwner(ownerId);
  if (!owner) throw new BondsError("NO_OWNER");
  return owner;
}

/** Date-only basis; an impossible or future date is bad input. */
export function basisOf(birth: BondBirth, now: number): BondBasis {
  const today = kstDay(now);
  const iso = `${String(birth.year).padStart(4, "0")}-${String(birth.month).padStart(2, "0")}-${String(birth.day).padStart(2, "0")}`;
  if (birth.year < 1900 || (birth.calendar === "solar" && iso > today) || birth.year > Number(today.slice(0, 4))) {
    throw new BondsError("BAD_INPUT", "birth");
  }
  try {
    return bondBasis(birth);
  } catch (error) {
    if (error instanceof SajuError) throw new BondsError("BAD_INPUT", "birth");
    throw error;
  }
}

async function startSign(repo: BondsRepo, now: number, ownerId: string, sign: SignId): Promise<ConstellationView> {
  const row: ConstellationRow = { id: randomId(), ownerId, sign, status: "filling", total: 0, startedAt: now, completedAt: null };
  try {
    await repo.insertConstellation(row);
  } catch {
    // The same request twice (a double tap): the first one already started a sign.
    throw new BondsError("FILLING_EXISTS");
  }
  return constellationView(row);
}

/**
 * The sign that starts by itself when `sign` is completed (owner decision 2026-10-01): the next one in
 * zodiac order, wrapping, that the owner has not completed. Null once all twelve are done.
 */
export function nextSignAfter(sign: SignId, completed: ReadonlySet<SignId>): SignId | null {
  const start = CONSTELLATIONS.findIndex((c) => c.id === sign);
  for (let step = 1; step < CONSTELLATIONS.length; step++) {
    const candidate = CONSTELLATIONS[(start + step) % CONSTELLATIONS.length]!.id;
    if (!completed.has(candidate)) return candidate;
  }
  return null;
}

async function nextFor(repo: BondsRepo, ownerId: string, sign: SignId): Promise<SignId | null> {
  const completed = new Set((await repo.completedOf(ownerId)).map((c) => c.sign));
  completed.add(sign);
  return nextSignAfter(sign, completed);
}

/** Counts one removal or switch for today; over the day's limit it is refused. */
async function spendAction(repo: BondsRepo, now: number, ownerId: string): Promise<void> {
  if ((await repo.bumpActions(ownerId, kstDay(now))) > DAILY_ACTION_LIMIT) throw new BondsError("DAILY_ACTION_LIMIT");
}

const sum = (stars: readonly { score: number }[]) => stars.reduce((n, s) => n + s.score, 0);

/** The star and its constellation, when the star belongs to one of this owner's constellations. */
async function findOwnedStar(repo: BondsRepo, ownerId: string, starId: string) {
  const filling = await repo.fillingOf(ownerId);
  const rows = [...(filling ? [filling] : []), ...(await repo.completedOf(ownerId))];
  for (const row of rows) {
    const stars = await repo.starsOf(row.id);
    const star = stars.find((s) => s.id === starId);
    if (star) return { row, stars, star };
  }
  throw new BondsError("NOT_FOUND");
}

// ---- owner ----

export interface OwnerInput {
  nickname: string;
  /** required for a new owner; an existing one keeps their basis when it is left out */
  birth?: BondBirth;
  rankingPublic?: boolean;
}

export async function saveOwner(repo: BondsRepo, now: number, ownerId: string, input: OwnerInput): Promise<OwnerRow> {
  const nickname = checkNickname(input.nickname);
  if (!nickname.ok) throw new BondsError("BAD_INPUT", "nickname");
  const existing = await repo.getOwner(ownerId);
  const basis = input.birth ? basisOf(input.birth, now) : existing?.basis;
  if (!basis) throw new BondsError("BAD_INPUT", "birth");
  const row: OwnerRow = {
    id: ownerId,
    nickname: nickname.value,
    rankingPublic: input.rankingPublic ?? existing?.rankingPublic ?? true,
    basis,
    lastRefillAt: existing?.lastRefillAt ?? null,
    createdAt: existing?.createdAt ?? now,
    // the join counters move only in joinStar; upsertOwner leaves them as stored
    joinsDay: existing?.joinsDay ?? null,
    joinsCount: existing?.joinsCount ?? 0,
  };
  await repo.upsertOwner(row);
  return row;
}

/** `랭킹에 내 이름 올리기` and the nickname, without asking for the birth date again. */
export async function updateSettings(repo: BondsRepo, now: number, ownerId: string, patch: { rankingPublic?: boolean; nickname?: string }): Promise<OwnerRow> {
  const owner = await requireOwner(repo, ownerId);
  return saveOwner(repo, now, ownerId, { nickname: patch.nickname ?? owner.nickname, rankingPublic: patch.rankingPublic ?? owner.rankingPublic });
}

// ---- choosing ----

export async function chooseSign(repo: BondsRepo, now: number, ownerId: string, sign: SignId): Promise<ConstellationView> {
  await requireOwner(repo, ownerId);
  if (!isSignId(sign)) throw new BondsError("BAD_INPUT", "sign");
  if (await repo.fillingOf(ownerId)) throw new BondsError("FILLING_EXISTS");
  if ((await repo.completedOf(ownerId)).some((c) => c.sign === sign)) throw new BondsError("SIGN_COMPLETED");
  return startSign(repo, now, ownerId, sign);
}

/** 별자리 바꾸기: the sign being filled loses its stars and `sign` starts from zero. No limit, only a confirm (UI). */
export async function switchSign(repo: BondsRepo, now: number, ownerId: string, sign: SignId): Promise<ConstellationView> {
  await requireOwner(repo, ownerId);
  if (!isSignId(sign)) throw new BondsError("BAD_INPUT", "sign");
  const filling = await repo.fillingOf(ownerId);
  if (!filling) throw new BondsError("NO_FILLING");
  if ((await repo.completedOf(ownerId)).some((c) => c.sign === sign)) throw new BondsError("SIGN_COMPLETED");
  await spendAction(repo, now, ownerId);
  await repo.deleteConstellation(filling.id);
  return startSign(repo, now, ownerId, sign);
}

/**
 * 새로 채우기: a completed sign starts again from zero; its card and ranking record go, and so do the
 * stars of any sign being filled (one at a time). Once an hour in the beta.
 */
export async function refill(repo: BondsRepo, now: number, ownerId: string, sign: SignId): Promise<ConstellationView> {
  const owner = await requireOwner(repo, ownerId);
  const done = (await repo.completedOf(ownerId)).find((c) => c.sign === sign);
  if (!done) throw new BondsError("NOT_FOUND");
  if (owner.lastRefillAt !== null && now - owner.lastRefillAt < REFILL_COOLDOWN_MS) {
    throw new BondsError("COOLDOWN", undefined, owner.lastRefillAt + REFILL_COOLDOWN_MS);
  }
  const filling = await repo.fillingOf(ownerId);
  if (filling) await repo.deleteConstellation(filling.id);
  await repo.deleteConstellation(done.id);
  await repo.upsertOwner({ ...owner, lastRefillAt: now });
  return startSign(repo, now, ownerId, sign);
}

// ---- invites ----

async function createInvite(repo: BondsRepo, now: number, ownerId: string): Promise<InviteRow> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newInviteCode();
    if (await repo.inviteByCode(code)) continue;
    const row: InviteRow = { code, ownerId, createdAt: now, revokedAt: null };
    try {
      await repo.insertInvite(row);
      return row;
    } catch {
      // taken in the meantime: try another
    }
  }
  throw new Error("No free invite code");
}

/** The owner's code, made on first use. */
export async function inviteOf(repo: BondsRepo, now: number, ownerId: string): Promise<InviteRow> {
  await requireOwner(repo, ownerId);
  return (await repo.activeInvite(ownerId)) ?? createInvite(repo, now, ownerId);
}

/** 코드 새로 만들기: the old code and link stop working at once. */
export async function regenerateInvite(repo: BondsRepo, now: number, ownerId: string): Promise<InviteRow> {
  await requireOwner(repo, ownerId);
  if ((await repo.invitesSince(ownerId, now - HOUR_MS)) >= INVITES_PER_HOUR) throw new BondsError("INVITE_COOLDOWN");
  await repo.revokeInvites(ownerId, now);
  return createInvite(repo, now, ownerId);
}

/** The owner behind a live code. Unknown and revoked codes fail alike (BAD_CODE). */
async function ownerOfCode(repo: BondsRepo, raw: string): Promise<OwnerRow> {
  const code = normalizeCode(raw);
  const invite = code ? await repo.inviteByCode(code) : null;
  if (!invite || invite.revokedAt !== null) throw new BondsError("BAD_CODE");
  const owner = await repo.getOwner(invite.ownerId);
  if (!owner) throw new BondsError("BAD_CODE");
  return owner;
}

export interface InviteInfo {
  ownerNickname: string;
  /** null while the owner is choosing a sign, or once all twelve are done */
  sign: SignId | null;
  filled: number;
  slots: number;
  /** all twelve signs completed: nothing left to join */
  allDone: boolean;
}

export async function resolveInvite(repo: BondsRepo, code: string): Promise<InviteInfo> {
  const owner = await ownerOfCode(repo, code);
  const filling = await repo.fillingOf(owner.id);
  if (!filling) {
    const allDone = (await repo.completedOf(owner.id)).length >= CONSTELLATIONS.length;
    return { ownerNickname: owner.nickname, sign: null, filled: 0, slots: 0, allDone };
  }
  const stars = await repo.starsOf(filling.id);
  return { ownerNickname: owner.nickname, sign: filling.sign, filled: stars.length, slots: getConstellation(filling.sign).slots, allDone: false };
}

// ---- joining ----

export interface JoinInput {
  code: string;
  /** hash of the friend's device cookie: one star per device per constellation round */
  friendKey: string;
  /** set when the friend is an owner on this device (their own link is refused) */
  joinerOwnerId?: string | null;
  nickname: string;
  birth: BondBirth;
  /** index 0-20 into the friend's fan of face-down cards */
  pick: number;
  message?: string | null;
}

export interface JoinResult {
  star: StarRow;
  score: number;
  /** the score's reasons, written from the friend's side */
  parts: BondPart[];
  completed: boolean;
  sign: SignId;
  ownerNickname: string;
  card: { cardId: string; orientation: Orientation };
  bondLine: string;
}

/** The card under fan slot `pick` of a freshly shuffled deck (same spread as CardFan's fanIndexes). */
function drawCard(pick: number): { cardId: string; orientation: Orientation } {
  const deck = createDeck(randomId(), DEFAULT_REVERSAL_RATE);
  const index = Math.floor(((pick + 0.5) * DECK_SIZE) / FAN_SIZE);
  return { cardId: deck.order[index]!, orientation: deck.orientations[index]! };
}

export async function joinStar(repo: BondsRepo, now: number, input: JoinInput): Promise<JoinResult> {
  const nickname = checkNickname(input.nickname);
  if (!nickname.ok) throw new BondsError("BAD_INPUT", "nickname");
  const message = checkMessage(input.message);
  if (!message.ok) throw new BondsError("BAD_INPUT", "message");
  if (!Number.isInteger(input.pick) || input.pick < 0 || input.pick >= FAN_SIZE) throw new BondsError("BAD_INPUT", "pick");

  const owner = await ownerOfCode(repo, input.code);
  if (input.joinerOwnerId && input.joinerOwnerId === owner.id) throw new BondsError("SELF_JOIN");
  const today = kstDay(now);
  if (owner.joinsDay === today && owner.joinsCount >= DAILY_STAR_LIMIT) throw new BondsError("DAILY_STAR_LIMIT");

  const friend = basisOf(input.birth, now);
  const { score, parts } = bondScore(owner.basis, friend);
  const card = drawCard(input.pick);

  // Each failed attempt means another friend took a slot (or completed the sign and the next one
  // started), so a bounded number of attempts always settles it.
  for (let attempt = 0; attempt < 16; attempt++) {
    const filling = await repo.fillingOf(owner.id);
    if (!filling) {
      const done = await repo.completedOf(owner.id);
      throw new BondsError(done.length >= CONSTELLATIONS.length ? "ALL_DONE" : "CHOOSING");
    }
    const slots = getConstellation(filling.sign).slots;
    const stars = await repo.starsOf(filling.id);
    if (stars.some((s) => s.friendKey === input.friendKey)) throw new BondsError("ALREADY_JOINED");
    const used = new Set(stars.map((s) => s.slot));
    const slot = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined) {
      // Full but still marked as filling (filled by someone else just now, or a count that never
      // landed): complete it, start the next sign, and try again there.
      await repo.tally(filling.id, slots, now);
      const next = await nextFor(repo, owner.id, filling.sign);
      if (next) {
        await repo.insertConstellation({ id: randomId(), ownerId: owner.id, sign: next, status: "filling", total: 0, startedAt: now, completedAt: null }).catch(() => undefined);
      }
      continue;
    }
    // Only a star that can complete the sign needs the next one ready.
    const nextSign = stars.length + 1 >= slots ? await nextFor(repo, owner.id, filling.sign) : null;
    const row: StarRow = {
      id: randomId(), constellationId: filling.id, slot, nickname: nickname.value, message: message.value,
      cardId: card.cardId, orientation: card.orientation, score, parts, friendKey: input.friendKey, createdAt: now,
    };
    try {
      // Insert, recount, count the join and (when it completes) start the next sign, in one atomic step.
      const after = await repo.joinStar(row, slots, today, now, nextSign ? { id: randomId(), sign: nextSign } : null);
      return {
        star: row,
        score,
        parts: bondScore(friend, owner.basis).parts,
        completed: after.status === "complete",
        sign: filling.sign,
        ownerNickname: owner.nickname,
        card,
        bondLine: bondCardLine(card.cardId, card.orientation),
      };
    } catch (error) {
      // Another friend took the slot at the same moment, or this device joined twice at once.
      if ((await repo.starsOf(filling.id)).some((s) => s.friendKey === input.friendKey)) throw new BondsError("ALREADY_JOINED");
      if (attempt === 15) throw error;
    }
  }
  throw new BondsError("CHOOSING");
}

/**
 * The owner removes one star (an unkind message, say). A completed sign goes back to being filled;
 * since only one sign fills at a time, the stars of the sign being filled go (the UI confirms first).
 */
export async function removeStar(repo: BondsRepo, now: number, ownerId: string, starId: string): Promise<void> {
  await requireOwner(repo, ownerId);
  const { row } = await findOwnedStar(repo, ownerId, starId);
  await spendAction(repo, now, ownerId);
  await repo.deleteStar(starId);
  if (row.status === "complete") {
    const other = await repo.fillingOf(ownerId);
    if (other) await repo.deleteConstellation(other.id);
    await repo.updateConstellation(row.id, { status: "filling", completedAt: null });
  }
  await repo.tally(row.id, getConstellation(row.sign).slots, now);
}

// ---- views ----

export interface OwnerView {
  owner: { nickname: string; rankingPublic: boolean; refillReadyAt: number | null };
  invite: { code: string };
  filling: { row: ConstellationView; stars: StarView[] } | null;
  /** oldest completion first */
  completed: Array<ConstellationView & { stars: StarView[] }>;
  /** best scores across every star the owner has now */
  top5: Array<StarView & { sign: SignId }>;
  ranks: Partial<Record<SignId, { week: number | null; all: number | null }>>;
}

/**
 * The owner page's data. Ranks are looked up for the latest completion only (the card the page shows);
 * `light` (the home row) skips ranks and TOP 5.
 */
export async function ownerView(repo: BondsRepo, now: number, ownerId: string, { light = false }: { light?: boolean } = {}): Promise<OwnerView> {
  const owner = await requireOwner(repo, ownerId);
  const invite = await inviteOf(repo, now, ownerId);
  const [fillingRow, completedRows] = await Promise.all([repo.fillingOf(ownerId), repo.completedOf(ownerId)]);
  const [fillingStars, ...completedStars] = await Promise.all([
    fillingRow ? repo.starsOf(fillingRow.id) : Promise.resolve([]),
    ...completedRows.map((c) => repo.starsOf(c.id)),
  ]);
  const since = weekStart(now);
  const ranks: OwnerView["ranks"] = {};
  const latest = completedRows.reduce<ConstellationRow | null>((a, c) => (a === null || (c.completedAt ?? 0) > (a.completedAt ?? 0) ? c : a), null);
  if (latest && !light) {
    const [week, all] = await Promise.all([repo.rankOf(latest.id, since), repo.rankOf(latest.id, null)]);
    ranks[latest.sign] = { week, all };
  }
  const withSign = [
    ...(fillingRow ? fillingStars!.map((s) => ({ ...starView(s), sign: fillingRow.sign })) : []),
    ...completedRows.flatMap((c, i) => completedStars[i]!.map((s) => ({ ...starView(s), sign: c.sign }))),
  ];
  return {
    owner: {
      nickname: owner.nickname,
      rankingPublic: owner.rankingPublic,
      refillReadyAt: owner.lastRefillAt !== null && now - owner.lastRefillAt < REFILL_COOLDOWN_MS ? owner.lastRefillAt + REFILL_COOLDOWN_MS : null,
    },
    invite: { code: invite.code },
    filling: fillingRow ? { row: constellationView(fillingRow), stars: fillingStars!.map(starView) } : null,
    completed: completedRows.map((c, i) => ({ ...constellationView(c), stars: completedStars[i]!.map(starView) })),
    top5: light ? [] : withSign.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt).slice(0, TOP_STARS),
    ranks,
  };
}

export interface RankingRowView {
  rank: number;
  nickname: string;
  total: number;
  completedAt: number;
  /** the viewer's own record */
  mine: boolean;
}

export interface RankingView {
  week: RankingRowView[];
  all: RankingRowView[];
  /** the viewer's completed constellation of this sign */
  mine: { row: ConstellationView; stars: StarView[]; weekRank: number | null; allRank: number | null } | null;
  /** the sign the viewer is filling now (any sign) */
  filling: { sign: SignId; filled: number; total: number } | null;
  owner: { nickname: string; rankingPublic: boolean; refillReadyAt: number | null } | null;
  /** the viewer's invite code, for 초대하기 on this page */
  invite: { code: string } | null;
}

/** The public part of a sign's ranking: this week's and all-time top RANKING_LIMIT (cacheable; ids stay server-side). */
export interface RankingBoards {
  week: RankingEntry[];
  all: RankingEntry[];
}

export async function rankingBoards(repo: BondsRepo, now: number, sign: SignId): Promise<RankingBoards> {
  const [week, all] = await Promise.all([repo.ranking(sign, weekStart(now), RANKING_LIMIT), repo.ranking(sign, null, RANKING_LIMIT)]);
  return { week, all };
}

/**
 * One sign's ranking for this viewer: the top lists (from `boards` when given, e.g. the edge cache) and
 * the viewer's own record. Their rank is looked up even beyond the lists, and only when they have a
 * completed constellation of the sign.
 */
export async function rankingView(repo: BondsRepo, now: number, sign: SignId, ownerId: string | null, boards?: RankingBoards): Promise<RankingView> {
  if (!isSignId(sign)) throw new BondsError("NOT_FOUND");
  const since = weekStart(now);
  const owner = ownerId ? await repo.getOwner(ownerId) : null;
  const done = owner ? (await repo.completedOf(owner.id)).find((c) => c.sign === sign) ?? null : null;
  const fillingRow = owner ? await repo.fillingOf(owner.id) : null;
  const [{ week: weekRows, all: allRows }, doneStars, fillingStars, invite] = await Promise.all([
    boards ?? rankingBoards(repo, now, sign),
    done ? repo.starsOf(done.id) : Promise.resolve([]),
    fillingRow ? repo.starsOf(fillingRow.id) : Promise.resolve([]),
    owner ? repo.activeInvite(owner.id) : Promise.resolve(null),
  ]);
  const rows = (list: typeof weekRows): RankingRowView[] =>
    list.map((e, i) => ({ rank: i + 1, nickname: e.nickname, total: e.total, completedAt: e.completedAt, mine: e.constellationId === done?.id }));
  return {
    week: rows(weekRows),
    all: rows(allRows),
    mine: done
      ? { row: constellationView(done), stars: doneStars.map(starView), weekRank: await repo.rankOf(done.id, since), allRank: await repo.rankOf(done.id, null) }
      : null,
    filling: fillingRow ? { sign: fillingRow.sign, filled: fillingStars.length, total: sum(fillingStars) } : null,
    owner: owner
      ? {
          nickname: owner.nickname,
          rankingPublic: owner.rankingPublic,
          refillReadyAt: owner.lastRefillAt !== null && now - owner.lastRefillAt < REFILL_COOLDOWN_MS ? owner.lastRefillAt + REFILL_COOLDOWN_MS : null,
        }
      : null,
    invite: invite ? { code: invite.code } : null,
  };
}

/**
 * 오늘의 인연 카드: one card per (owner, star, KST day), drawn on the server. It never touches the score,
 * the ranking or the share image.
 */
export async function todayBondCard(repo: BondsRepo, now: number, ownerId: string, starId: string): Promise<{ cardId: string; orientation: Orientation; day: string }> {
  await findOwnedStar(repo, ownerId, starId);
  const day = kstDay(now);
  const rand = seededRandom(`bond:${ownerId}:${starId}:${day}`);
  const card = CARDS[Math.floor(rand() * CARDS.length)]!;
  return { cardId: card.id, orientation: rand() < DEFAULT_REVERSAL_RATE ? "reversed" : "upright", day };
}

/** A completed constellation for its share image (public: only nicknames, sign, total and date go on it). */
export async function shareCard(repo: BondsRepo, constellationId: string) {
  const row = await repo.getConstellation(constellationId);
  if (!row || row.status !== "complete" || row.completedAt === null) throw new BondsError("NOT_FOUND");
  const owner = await repo.getOwner(row.ownerId);
  if (!owner) throw new BondsError("NOT_FOUND");
  const stars = await repo.starsOf(row.id);
  return { sign: row.sign, total: row.total, completedAt: row.completedAt, ownerNickname: owner.nickname, nicknames: stars.map((s) => s.nickname) };
}

export const LEADERS_PER_SIGN = 3;

export interface LeaderView {
  rank: number;
  nickname: string;
  total: number;
}

/** This KST week's top 3 of every sign (one query): 별자리 리더보드. Signs with no completion are left out. */
export async function weeklyLeaders(repo: BondsRepo, now: number): Promise<Partial<Record<SignId, LeaderView[]>>> {
  const out: Partial<Record<SignId, LeaderView[]>> = {};
  for (const top of await repo.topsBySign(weekStart(now), LEADERS_PER_SIGN)) {
    (out[top.sign] ??= []).push({ rank: top.rank, nickname: top.nickname, total: top.total });
  }
  return out;
}

// ---- the friend page ----

/** A friend's star as their own result screen shows it (reasons from their side). */
export interface FriendResultView {
  nickname: string;
  score: number;
  parts: BondPart[];
  /** the constellation is complete now */
  completed: boolean;
  sign: SignId;
  slot: number;
  ownerNickname: string;
  card: { cardId: string; orientation: Orientation };
  bondLine: string;
}

export type InvitePage =
  /** the owner opened their own link */
  | { kind: "self"; ownerNickname: string; sign: SignId | null; filled: number; slots: number }
  /** this device is already a star of the sign being filled */
  | { kind: "joined"; result: FriendResultView }
  /** open for a new star; `earlier` is this device's star in an earlier sign of the same owner */
  | { kind: "open"; ownerNickname: string; sign: SignId; filled: number; slots: number; earlier: FriendResultView | null }
  | { kind: "choosing"; ownerNickname: string; earlier: FriendResultView | null }
  | { kind: "alldone"; ownerNickname: string; earlier: FriendResultView | null };

/**
 * /b/<code> for this visitor (Q-05, Q-11): their own link, the result of a join this device already
 * made (so a reload never shows the empty form again), or the form, with an earlier star noted.
 * Unknown and revoked codes fail with BAD_CODE like every lookup.
 */
export async function invitePage(repo: BondsRepo, code: string, viewer: { ownerId: string | null; friendKey: string | null }): Promise<InvitePage> {
  const owner = await ownerOfCode(repo, code);
  const filling = await repo.fillingOf(owner.id);
  const stars = filling ? await repo.starsOf(filling.id) : [];
  if (viewer.ownerId === owner.id) {
    return { kind: "self", ownerNickname: owner.nickname, sign: filling?.sign ?? null, filled: stars.length, slots: filling ? getConstellation(filling.sign).slots : 0 };
  }
  const found = viewer.friendKey ? await repo.latestStarOf(owner.id, viewer.friendKey) : null;
  const result: FriendResultView | null = found
    ? {
        nickname: found.star.nickname,
        score: found.star.score,
        parts: mirrorParts(found.star.parts),
        completed: found.constellation.status === "complete",
        sign: found.constellation.sign,
        slot: found.star.slot,
        ownerNickname: owner.nickname,
        card: { cardId: found.star.cardId, orientation: found.star.orientation },
        bondLine: bondCardLine(found.star.cardId, found.star.orientation),
      }
    : null;
  if (filling && found && found.constellation.id === filling.id) return { kind: "joined", result: result! };
  if (!filling) {
    const allDone = (await repo.completedOf(owner.id)).length >= CONSTELLATIONS.length;
    return allDone ? { kind: "alldone", ownerNickname: owner.nickname, earlier: result } : { kind: "choosing", ownerNickname: owner.nickname, earlier: result };
  }
  return { kind: "open", ownerNickname: owner.nickname, sign: filling.sign, filled: stars.length, slots: getConstellation(filling.sign).slots, earlier: result };
}
