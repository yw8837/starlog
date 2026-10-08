import { BoldText } from "@/components/reading/BoldText";
import type { SajuGlance } from "@/lib/reading/types";
import { SAJU_GLANCE_ACTION_LABEL, SAJU_GLANCE_HEADING, SAJU_GLANCE_LABELS } from "@/lib/sajuPrologue";
import s from "./GlanceCard.module.css";

/** The card's name ("한눈에 보기"); the whole heading is the locked list's entry. */
const NAME = SAJU_GLANCE_HEADING.split(" · ")[0]!;

/** Text presentation (U+FE0E), so a phone keeps the card's colours instead of drawing emoji. */
const MARK = { good: "✔︎", care: "⚠︎", then: "→" } as const;

/**
 * 한눈에 보기 (owner 2026-10-07): the plain answer on top of a saju reading, like the tarot reading's 한 줄 결론. Where
 * things go well, what to watch, one everyday way to make up for it, and this year's flow with one thing to do. The
 * labels and marks are the screen's; the sentences are the reading's.
 */
export function GlanceCard({ glance }: { glance: SajuGlance }) {
  const items = [
    { key: "goesWell", tone: s.good, mark: MARK.good, label: SAJU_GLANCE_LABELS.goesWell, text: glance.goesWell },
    { key: "watchOut", tone: s.care, mark: MARK.care, label: SAJU_GLANCE_LABELS.watchOut, text: glance.watchOut },
    { key: "remedy", tone: s.fix, mark: MARK.then, label: SAJU_GLANCE_LABELS.remedy, text: glance.remedy },
  ];
  return (
    <section className={s.glance} aria-labelledby="glance-title">
      <h2 id="glance-title" className={s.name}>
        {NAME}
      </h2>
      <p className={s.lead}>명리로 읽은 큰 줄기를 먼저 모았어요. 근거는 아래 풀이에 있어요.</p>
      <dl className={s.list}>
        {items.map((item) => (
          <div key={item.key} className={`${s.item} ${item.tone}`}>
            <dt className={s.label}>
              <span className={s.mark} aria-hidden="true">
                {item.mark}
              </span>
              <span>{item.label}</span>
            </dt>
            <dd className={s.text}>
              <BoldText text={item.text} />
            </dd>
          </div>
        ))}
        <div className={`${s.item} ${s.year}`}>
          <dt className={s.label}>
            <span>{SAJU_GLANCE_LABELS.thisYear}</span>
          </dt>
          <dd className={s.text}>
            <BoldText text={glance.thisYear} />
          </dd>
          <dd className={`${s.text} ${s.then}`}>
            {/* the arrow is the label on screen; a screen reader hears it by name */}
            <span className="sr-only">{`${SAJU_GLANCE_ACTION_LABEL} `}</span>
            <span className={s.mark} aria-hidden="true">
              {MARK.then}
            </span>
            <span>
              <BoldText text={glance.thisYearAction} />
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
