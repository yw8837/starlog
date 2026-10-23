import { getCard, getConstellation } from "@starlog/core";
import { BondScore, ScoreGauge } from "@/components/bonds/BondScore";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import type { BondsShareView } from "@/lib/bonds/share";
import { kstMonthDay } from "@/lib/kst";
import b from "@/components/bonds/bonds.module.css";
import s from "../../chapter/[id]/ChapterView.module.css";

/** The way in at the end: one's own constellation, then the Starlog home. */
function StartOwn({ text }: { text: string }) {
  return (
    <section className={s.invite} aria-labelledby="try-title">
      <h2 id="try-title" className={s.inviteTitle}>
        내 별자리 만들기
      </h2>
      <p className={s.inviteText}>{text}</p>
      <Button href="/bonds" block trailing="→">
        내 별자리 만들기
      </Button>
      <Button href="/" variant="ghost" block>
        스타로그 홈으로
      </Button>
    </section>
  );
}

/**
 * A shared constellation (owner 2026-10-23), read live: the figure with the friends' nicknames, the 인연 total and
 * average, 완성 when it is. A friend's own score and message stay the owner's (privacy §4).
 */
function SharedConstellation({ view }: { view: Extract<BondsShareView, { kind: "bonds" }> }) {
  const def = getConstellation(view.sign);
  const labels = Array.from({ length: view.slots }, (_, i) => view.members.find((m) => m.slot === i)?.nickname ?? null);
  return (
    <article aria-labelledby="shared-bonds-title">
      <header className={s.head}>
        <p className={s.eyebrow}>친구가 공유한 별자리 인연</p>
        <h1 id="shared-bonds-title" className={s.title}>
          {`${view.ownerNickname}님의 ${def.ko}`}
        </h1>
        <p className={s.question}>
          {view.complete ? `완성${view.completedAt ? ` · ${kstMonthDay(view.completedAt)}` : ""}` : `채우는 중 · ${view.members.length}/${view.slots}`}
        </p>
      </header>
      <div className={`${b.panel} ${b.panelGold}`}>
        {view.complete ? <p className={b.eyebrow}>완성한 별자리</p> : null}
        <ConstellationArt sign={view.sign} lit={view.members.map((m) => m.slot)} labels={labels} size={320} />
        <p className={b.helper}>{`별이 된 친구 ${view.members.length}명 · 인연 합계 ${view.total}점`}</p>
        {view.average !== null ? <ScoreGauge score={view.average} label="평균 인연 점수" /> : null}
        <p className={b.helper}>친구마다의 점수와 남긴 한 줄은 별자리 주인만 볼 수 있어요.</p>
      </div>
      <StartOwn text="내 별자리를 고르고 친구를 초대하면, 친구가 별이 되어 하나씩 채워 줘요. 생년월일로 두 사람의 인연 점수도 나와요." />
    </article>
  );
}

/** A friend's own star, shared by that friend: their card, their score with its table, whose constellation it is in. */
function SharedStar({ view }: { view: Extract<BondsShareView, { kind: "bond" }> }) {
  const def = getConstellation(view.sign);
  const card = getCard(view.card.cardId);
  const name = `${card.names.ko}${view.card.orientation === "reversed" ? " 역방향" : ""}`;
  return (
    <article aria-labelledby="shared-bond-title">
      <header className={s.head}>
        <p className={s.eyebrow}>{`${view.ownerNickname}님의 ${def.ko} · 별자리 인연`}</p>
        <h1 id="shared-bond-title" className={s.title}>
          {`${view.friendNickname}님과 ${view.ownerNickname}님의 인연`}
        </h1>
        <p className={s.question}>생년월일은 점수를 내는 데만 쓰고 저장하지 않아요.</p>
      </header>
      <div className={`${b.panel} ${b.panelGold}`}>
        <BondScore score={view.score} parts={view.parts} caption="두 사람의 생년월일로 본 사주 궁합이에요. 언제 다시 봐도 같은 점수예요." />
      </div>
      <div className={b.panel}>
        <TarotCard cardId={view.card.cardId} orientation={view.card.orientation} faceUp size="md" label={name} />
        <p className={b.eyebrow}>{`인연 카드 · ${name}`}</p>
        <p className={b.helper}>{view.bondLine}</p>
      </div>
      <StartOwn text="나도 내 별자리를 만들고 친구를 초대해 봐요. 친구마다 인연 점수와 그 근거가 나와요." />
    </article>
  );
}

export function SharedBondsView({ view }: { view: BondsShareView }) {
  return view.kind === "bonds" ? <SharedConstellation view={view} /> : <SharedStar view={view} />;
}
