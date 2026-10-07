"use client";

import { useState } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Button } from "@/components/ui/Button";
import type { ConstellationView, StarView } from "@/lib/bonds/service";
import { bondsApi, bondsMessage, monthDay } from "@/lib/bonds/client";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConstellationArt } from "./ConstellationArt";
import { ShareConstellation } from "./ShareConstellation";
import s from "./CompletedCard.module.css";
import b from "./bonds.module.css";

type CompletedCardProps = {
  row: ConstellationView & { stars: StarView[] };
  ownerNickname: string;
  /** the all-time rank in the sign's ranking; null when it is not ranked */
  allRank: number | null;
  /** the sign being filled now, if any: 새로 채우기 clears it too, and the confirm says so */
  filling: { sign: SignId; filled: number } | null;
  /** 공유하기 as the screen's gold primary (the ranking page) or a secondary (the owner page) */
  sharePrimary: boolean;
  /** the share button's label when it is not the plain 공유하기 (the ranking page says 내 순위 공유하기) */
  shareLabel?: string;
  /** the completion moment: stars light one by one and the cat and rabbit cheer */
  celebrate?: boolean;
  onRefilled: () => void;
};

/**
 * A completed constellation: the figure with every friend's nickname, the 인연 total, the rank, and
 * exactly two actions (spec §7): 공유하기 and 새로 채우기 (confirmed; once an hour in the beta).
 */
export function CompletedCard({ row, ownerNickname, allRank, filling, sharePrimary, shareLabel, celebrate = false, onRefilled }: CompletedCardProps) {
  const def = getConstellation(row.sign);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels = Array.from({ length: def.slots }, (_, i) => row.stars.find((star) => star.slot === i)?.nickname ?? null);

  const refill = async () => {
    setBusy(true);
    setError("");
    const result = await bondsApi<{ constellation: ConstellationView }>("refill", { sign: row.sign });
    setBusy(false);
    setConfirming(false);
    if (result.ok) onRefilled();
    else setError(bondsMessage(result));
  };

  return (
    <section className={`${b.panel} ${b.panelGold} ${s.card}`} aria-labelledby={`done-${row.sign}`}>
      {celebrate ? (
        <div className={s.cheer} aria-hidden="true">
          <Cat outfit="tarot" expression="happy" action="glow" size={72} reactOnTap={false} />
          <Rabbit outfit="tarot" expression="wink" size={64} reactOnTap={false} />
        </div>
      ) : null}
      <p className={b.eyebrow}>{celebrate ? "별자리를 완성했어요" : "완성한 별자리"}</p>
      <h2 id={`done-${row.sign}`} className={s.title}>
        {def.ko} <span className={s.en}>· {def.en}</span>
      </h2>
      <ConstellationArt sign={row.sign} lit={def.slots} labels={labels} size={320} reveal={celebrate} className={s.art} />
      <p className={s.total}>
        인연 <strong>{row.total}</strong>점
      </p>
      <p className={s.meta}>
        {ownerNickname}님의 {def.ko}
        {row.completedAt ? ` · ${monthDay(row.completedAt)} 완성` : ""}
      </p>
      <ul className={s.ranks}>
        <li>{allRank ? `${def.ko} ${allRank}위` : "랭킹에는 없어요"}</li>
      </ul>
      <div className={`${b.actions} ${s.actions}`}>
        <ShareConstellation constellationId={row.id} sign={row.sign} total={row.total} primary={sharePrimary} label={shareLabel} />
        <Button variant="secondary" block onClick={() => setConfirming(true)}>
          새로 채우기
        </Button>
        {error ? (
          <p className={b.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title={`${def.ko}를 새로 채울까요?`}
        confirmLabel="처음부터 다시 채우기"
        onConfirm={refill}
        onClose={() => setConfirming(false)}
        busy={busy}
      >
        <p>
          {def.ko} 카드와 랭킹 기록({row.total}점)이 사라지고 처음부터 다시 채워요.
          {filling && filling.sign !== row.sign && filling.filled > 0 ? ` 채우던 ${getConstellation(filling.sign).ko} 별 ${filling.filled}개도 사라져요.` : ""}
        </p>
        <p>새로 채우기는 한 시간에 한 번 할 수 있어요.</p>
      </ConfirmDialog>
    </section>
  );
}
