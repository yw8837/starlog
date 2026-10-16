import { useId } from "react";
import type { SajuElement } from "@starlog/core";
import { ELEMENT_KEY, ELEMENT_ORDER } from "@/components/saju/elements";
import type { ChartViewData } from "@/lib/reading/types";
import s from "./premium.module.css";

/**
 * One computed chart, narrow enough to stand beside another at 360px: the day master's image and
 * glyph, the pillars, and how many glyphs fall in each element. Never a birth date.
 */
export function ChartCard({ who, chart }: { who: string; chart: ChartViewData }) {
  const id = useId();
  return (
    <section className={s.chart} aria-labelledby={id}>
      <h3 id={id} className={s.chartWho}>
        {who}
      </h3>
      <p className={s.chartImage}>{chart.dayMaster.image}</p>
      <p className={s.chartDay}>{chart.dayMaster.display}</p>
      <ol className={s.pillars}>
        {chart.pillars.map((p) => (
          <li key={p.label} className={s.pillar}>
            <span className="sr-only">{p.label} </span>
            <span className={s.pillarGz}>{p.gz}</span>
            <span className={s.pillarKo}>{p.ko}</span>
          </li>
        ))}
      </ol>
      <ul className={s.counts} aria-label="오행 개수">
        {ELEMENT_ORDER.map((el: SajuElement) => (
          <li key={el} className={s.count} data-el={ELEMENT_KEY[el]}>
            <span className={s.countDot} aria-hidden="true" />
            {`${el} ${chart.elements[el] ?? 0}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

type PairChartsProps = { me: ChartViewData; partner: ChartViewData; partnerLabel?: string };

/** Two computed charts side by side (우리 사이 궁합): the other person goes by the label the user gave, or 그 사람. */
export function PairCharts({ me, partner, partnerLabel }: PairChartsProps) {
  return (
    <div className={s.pair}>
      <ChartCard who="나" chart={me} />
      <ChartCard who={partnerLabel || "그 사람"} chart={partner} />
    </div>
  );
}
