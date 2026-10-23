import "server-only";
import { getConstellation, type Orientation, type SignId } from "@starlog/core";
import { SITE } from "@/lib/config";
import { bondsRepo } from "@/lib/db";
import type { BondsRepo, StarRow } from "@/lib/db/bondsRepo";
import type { SharedBond, SharedBonds } from "@/lib/share/payload";
import type { BondsPreviewData } from "@/lib/share/preview";
import { bondCardLine } from "./bondCardText";

/**
 * 별자리 인연 shares (owner 2026-10-23), read live from the bonds store each time the link is opened, so a removed star
 * or a refilled constellation is gone from the link too and nothing personal is copied into the share.
 * - an owner's constellation: the friends' nicknames on their stars and how many are filled, each friend's own 인연
 *   score where that friend joined after the join form said it would show (stars.score_public, owner 2026-10-23:
 *   "A랑 나랑 몇 점인지, B랑 나랑 몇 점인지"), filling or complete. The total and average only when every star's score
 *   shows: with one earlier star among them, the total minus the shown scores would give its score away. Never a
 *   friend's message.
 * - a friend's own star: their nickname, score and card, the owner's nickname. Not the reasons: the 오행 a friend fills
 *   and the 띠 relations hint at the owner's chart and age (review 2026-10-23).
 */

export type BondsShareView =
  | {
      kind: "bonds";
      sign: SignId;
      ownerNickname: string;
      slots: number;
      /** `score`: the friend's 인연 score where they joined after the score notice, else null (it stays the owner's) */
      members: Array<{ slot: number; nickname: string; score: number | null }>;
      /** only when every star's score shows (null otherwise) */
      total: number | null;
      average: number | null;
      complete: boolean;
      completedAt: number | null;
    }
  | {
      kind: "bond";
      sign: SignId;
      ownerNickname: string;
      friendNickname: string;
      score: number;
      card: { cardId: string; orientation: Orientation };
      bondLine: string;
    };

export async function loadBondsShare(repo: BondsRepo, share: SharedBonds | SharedBond): Promise<BondsShareView | null> {
  const row = await repo.getConstellation(share.constellationId);
  if (!row) return null;
  const owner = await repo.getOwner(row.ownerId);
  if (!owner) return null;
  const stars = await repo.starsOf(row.id);
  if (share.kind === "bonds") {
    const complete = row.status === "complete";
    const total = stars.reduce((sum, star) => sum + star.score, 0);
    const allShown = stars.length > 0 && stars.every((star) => star.scorePublic === true);
    return {
      kind: "bonds",
      sign: row.sign,
      ownerNickname: owner.nickname,
      slots: getConstellation(row.sign).slots,
      members: stars.map((star) => ({ slot: star.slot, nickname: star.nickname, score: star.scorePublic === true ? star.score : null })),
      total: allShown ? total : null,
      average: allShown ? Math.round(total / stars.length) : null,
      complete,
      completedAt: row.completedAt,
    };
  }
  const star = stars.find((s) => s.id === share.starId);
  if (!star) return null;
  return {
    kind: "bond",
    sign: row.sign,
    ownerNickname: owner.nickname,
    friendNickname: star.nickname,
    score: star.score,
    card: { cardId: star.cardId, orientation: star.orientation },
    bondLine: bondCardLine(star.cardId, star.orientation),
  };
}

/** What the preview (Kakao message, og) says for a live view. */
export function bondsPreviewData(view: BondsShareView): BondsPreviewData {
  const signKo = getConstellation(view.sign).ko;
  if (view.kind === "bonds") {
    return {
      kind: "bonds", signKo, ownerNickname: view.ownerNickname, stars: view.members.length, slots: view.slots, total: view.total, average: view.average,
      complete: view.complete, members: view.members.map(({ nickname, score }) => ({ nickname, score })),
    };
  }
  return { kind: "bond", signKo, ownerNickname: view.ownerNickname, friendNickname: view.friendNickname, score: view.score };
}

/** The constellation, when `ownerId` owns it. */
export async function ownedConstellation(repo: BondsRepo, ownerId: string, constellationId: string) {
  const row = await repo.getConstellation(constellationId);
  return row && row.ownerId === ownerId ? row : null;
}

/** The friend device's own star, when `friendKey` made it. */
export async function friendStar(repo: BondsRepo, friendKey: string, starId: string): Promise<StarRow | null> {
  return (await repo.starsByFriend(friendKey, 100)).find((star) => star.id === starId) ?? null;
}

/** The live view behind a 별자리 인연 link, or null when the feature is off, the store is unreachable or it is gone. */
export async function liveBondsShare(share: SharedBonds | SharedBond): Promise<BondsShareView | null> {
  if (!SITE.features.bonds) return null;
  try {
    return await loadBondsShare(bondsRepo(), share);
  } catch {
    return null;
  }
}
