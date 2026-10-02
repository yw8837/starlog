import { getConstellation } from "@starlog/core";
import type { OwnerView } from "./service";

/** What the home row has fetched about this device: the part of the owner view the line reads. */
export type HomeRankLineInput = { owner: null } | Pick<OwnerView, "owner" | "filling" | "completed" | "ranks">;

const INVITE = "나의 인연들과 별자리를 만들어 봐요";

const sum = (stars: ReadonlyArray<{ score: number }>) => stars.reduce((total, star) => total + star.score, 0);

/**
 * The second line of the home row's 별자리 인연 랭킹 tile, about this device's owner, first match wins:
 * a completed constellation (the latest, the one `ownerView` looks the ranks up for) gives my score and,
 * when the ranking is public, this week's rank, else the all-time one; a constellation still filling gives
 * its score so far and what finishing it brings; otherwise the way in. Pure.
 */
export function homeRankLine(me: HomeRankLineInput): string {
  if (me.owner === null) return INVITE;
  const latest = me.completed.reduce<OwnerView["completed"][number] | null>((a, c) => (a === null || (c.completedAt ?? 0) > (a.completedAt ?? 0) ? c : a), null);
  if (latest) {
    const mine = `내 ${getConstellation(latest.sign).ko} ${sum(latest.stars)}점`;
    const rank = me.owner.rankingPublic ? me.ranks[latest.sign] : undefined;
    if (rank?.week) return `${mine} · 이번 주 ${rank.week}위`;
    if (rank?.all) return `${mine} · 전체 ${rank.all}위`;
    return mine;
  }
  if (me.filling) return `지금 ${getConstellation(me.filling.row.sign).ko} ${sum(me.filling.stars)}점 · 완성하면 순위에 올라요`;
  return INVITE;
}
