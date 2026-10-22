import { getCard } from "@starlog/core";
import { Paper } from "@/components/tarot/Paper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { luckySwatch } from "@/lib/reading/luckySwatch";
import type { SharedDaily } from "@/lib/share/payload";
import t from "../../today/TodayView.module.css";
import s from "../../chapter/[id]/ChapterView.module.css";

/** "10월 20일의 한 장" for the KST day "2026-10-20". */
export function dailyShareTitle(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${month}월 ${date}일의 한 장`;
}

/** "별 · 역방향" */
export const dailyCardName = (card: SharedDaily["reading"]["card"]) => `${getCard(card.cardId).names.ko} · ${card.orientation === "reversed" ? "역방향" : "정방향"}`;

/**
 * A shared 오늘의 한 장 (owner 2026-10-20) as the sender's screen showed it: the line, the card face in the
 * design it was read with, its name and keyword, the reading, 애정·금전·일, the lucky colour and number and
 * the tip; then a calm way to draw one's own on /today.
 */
export function SharedDailyView({ share }: { share: SharedDaily }) {
  const { card, areas, lucky } = share.reading;
  const name = dailyCardName(card);
  return (
    <article className={t.opened} aria-labelledby="shared-daily-title">
      <header className={s.head}>
        <p className={s.eyebrow}>친구가 공유한 오늘의 한 장</p>
        <h1 id="shared-daily-title" className={s.title}>
          {dailyShareTitle(share.day)}
        </h1>
      </header>

      <div className={t.slip}>
        <p className={t.slipLabel}>오늘의 한마디</p>
        <p className={t.line}>{share.reading.summary}</p>
      </div>

      <div className={t.cardBlock}>
        <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="md" highlight className={t.card} label={name} deck={share.deck} />
        <p className={t.cardName}>{name}</p>
        <p className={t.keyword}>{card.keyword}</p>
      </div>

      <Paper>
        <p className={t.prose}>{share.reading.body}</p>
      </Paper>

      <section className={t.areas} aria-labelledby="shared-areas-title">
        <h2 id="shared-areas-title" className={t.sectionTitle}>
          오늘의 흐름
        </h2>
        <dl className={t.areaList}>
          {(
            [
              ["애정", areas.love],
              ["금전", areas.money],
              ["일", areas.work],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className={t.area}>
              <dt className={t.areaLabel}>{label}</dt>
              <dd className={t.areaText}>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={t.lucky} aria-labelledby="shared-lucky-title">
        <h2 id="shared-lucky-title" className={t.sectionTitle}>
          오늘의 행운
        </h2>
        <div className={t.luckyRow}>
          <p className={t.colorChip}>
            <span className={t.swatch} style={{ background: luckySwatch(lucky.color) }} aria-hidden="true" />
            <span>
              <span className={t.luckyLabel}>색</span>
              {lucky.color}
            </span>
          </p>
          <p className={t.numberWrap}>
            <span className={t.luckyLabel}>숫자</span>
            <span className={t.ball}>{lucky.number}</span>
          </p>
        </div>
      </section>

      <section className={t.tip} aria-labelledby="shared-tip-title">
        <h2 id="shared-tip-title" className={t.tipTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" fill="currentColor" />
          </svg>
          오늘의 한 가지
        </h2>
        <p className={t.tipText}>{share.reading.tip}</p>
      </section>

      <section className={s.invite} aria-labelledby="try-title">
        <h2 id="try-title" className={s.inviteTitle}>
          나도 오늘의 카드 골라 보기
        </h2>
        <p className={s.inviteText}>섞은 카드 세 장 가운데 마음이 가는 한 장을 골라 봐요. 하루 한 번 무료예요.</p>
        <Button href="/today" block trailing="→">
          오늘의 한 장 뽑기
        </Button>
        <Button href="/" variant="ghost" block>
          스타로그 홈으로
        </Button>
      </section>
    </article>
  );
}
