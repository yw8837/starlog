"use client";

import { useState } from "react";
import { getCard, getConstellation, type Orientation, type SignId } from "@starlog/core";
import { BondScore } from "@/components/bonds/BondScore";
import { ConfirmDialog } from "@/components/bonds/ConfirmDialog";
import { TarotCard } from "@/components/tarot/TarotCard";
import { bondsApi, bondsMessage } from "@/lib/bonds/client";
import type { StarView } from "@/lib/bonds/service";
import b from "@/components/bonds/bonds.module.css";
import s from "./BondsView.module.css";

type StarListProps = {
  sign: SignId;
  stars: StarView[];
  /** slots that came in since this device last looked */
  fresh: ReadonlySet<string>;
  /** the constellation is complete: removing a star makes it incomplete again */
  complete: boolean;
  /** the sign being filled while this one is complete (removing a star here clears it) */
  otherFilling: { sign: SignId; filled: number } | null;
  onChanged: () => void;
};

interface TodayCard {
  card: { cardId: string; orientation: Orientation };
  line: string;
}

const cardName = (cardId: string, orientation: Orientation) => `${getCard(cardId).names.ko}${orientation === "reversed" ? " 역방향" : ""}`;

/** The stars of one constellation in slot order: nickname, 인연 카드, 한 줄, score with its reasons. */
export function StarList({ sign, stars, fresh, complete, otherFilling, onChanged }: StarListProps) {
  const def = getConstellation(sign);
  const [today, setToday] = useState<Record<string, TodayCard | "loading" | string>>({});
  const [removing, setRemoving] = useState<StarView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const drawToday = async (star: StarView) => {
    setToday((prev) => ({ ...prev, [star.id]: "loading" }));
    const result = await bondsApi<TodayCard>("today-card", { starId: star.id });
    setToday((prev) => ({ ...prev, [star.id]: result.ok ? { card: result.card, line: result.line } : bondsMessage(result) }));
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const result = await bondsApi("star/remove", { starId: removing.id });
    setBusy(false);
    setRemoving(null);
    if (result.ok) onChanged();
    else setError(bondsMessage(result));
  };

  if (stars.length === 0) {
    return <p className={s.emptyStars}>아직 들어온 별이 없어요. 초대코드를 보내면 친구가 첫 번째 별이 돼요.</p>;
  }

  return (
    <>
      <ol className={s.stars}>
        {stars.map((star) => {
          const t = today[star.id];
          return (
            <li key={star.id} className={s.star} data-new={fresh.has(star.id) ? "" : undefined}>
              <div className={s.starHead}>
                <TarotCard cardId={star.cardId} orientation={star.orientation} faceUp size="sm" className={s.starCard} />
                <div className={s.starText}>
                  <p className={s.starName}>
                    <span className={s.slot}>{star.slot + 1}번 별</span> {star.nickname}
                    {fresh.has(star.id) ? <span className={s.newTag}>새 별</span> : null}
                  </p>
                  {star.message ? <p className={s.message}>“{star.message}”</p> : null}
                  <p className={s.energy}>지금의 기운 · {cardName(star.cardId, star.orientation)}</p>
                </div>
              </div>
              <p className={s.line}>{star.line}</p>
              {/* 인연 점수 한눈에 (owner 2026-10-23): the number, the 55–99 gauge and what made it. */}
              <div className={s.parts}>
                <BondScore score={star.score} parts={star.parts} caption="명리에서 두 분의 생년월일로 읽은 값이에요. 언제 다시 봐도 같은 점수예요." />
              </div>
              <div className={s.starActions}>
                <button type="button" className={s.todayButton} onClick={() => drawToday(star)} disabled={t === "loading"} aria-expanded={Boolean(t && t !== "loading")}>
                  {t === "loading" ? "카드를 고르는 중이에요" : "오늘의 인연 카드"}
                </button>
                <button type="button" className={b.textButton} onClick={() => setRemoving(star)}>
                  별 지우기
                </button>
              </div>
              {t && typeof t === "object" ? (
                <div className={s.today} role="status">
                  <TarotCard cardId={t.card.cardId} orientation={t.card.orientation} faceUp size="sm" className={s.starCard} />
                  <div>
                    <p className={b.eyebrow}>오늘의 인연 카드 · {cardName(t.card.cardId, t.card.orientation)}</p>
                    <p className={s.todayLine}>{t.line}</p>
                    <p className={b.helper}>하루에 한 장, 내일 다시 누르면 새 카드가 나와요. 점수와 랭킹에는 영향이 없어요.</p>
                  </div>
                </div>
              ) : typeof t === "string" && t !== "loading" ? (
                <p className={b.error} role="alert">
                  {t}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={`${removing?.nickname ?? ""}님의 별을 지울까요?`}
        confirmLabel="별 지우기"
        onConfirm={remove}
        onClose={() => setRemoving(null)}
        busy={busy}
      >
        <p>
          그 칸이 비고, 다음 친구가 그 자리를 채워요.
          {complete ? ` 완성한 ${def.ko}는 다시 채우는 중으로 돌아가요.` : ""}
          {complete && otherFilling ? ` 한 번에 하나만 채울 수 있어서 채우던 ${getConstellation(otherFilling.sign).ko} 별 ${otherFilling.filled}개는 사라져요.` : ""}
        </p>
        <p>친구에게는 알리지 않아요.</p>
      </ConfirmDialog>
    </>
  );
}
