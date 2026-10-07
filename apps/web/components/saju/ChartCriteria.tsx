import type { SajuChart } from "@starlog/core";
import { criteriaGroups } from "@/lib/sajuCriteria";
import s from "./ChartCriteria.module.css";

type ChartCriteriaProps = {
  chart: SajuChart;
};

function Group({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={s.group}>
      <h3 className={s.groupTitle}>{title}</h3>
      <ul className={s.list}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** "적용한 기준": what this chart assumed and where it could differ, in a calm disclosure (closed by default). */
export function ChartCriteria({ chart }: ChartCriteriaProps) {
  const { applied, changes, rules } = criteriaGroups(chart);
  const place = chart.input.place;
  const hint = [chart.correctedLocalTime ? `보정 시각 ${chart.correctedLocalTime}` : "시간 모름", `${place.name} 기준`].join(" · ");

  return (
    <details className={s.criteria}>
      <summary className={s.summary}>
        <span className={s.summaryText}>
          <span className={s.summaryRow}>
            <span className={s.summaryTitle}>적용한 기준</span>
            {changes.length > 0 ? <span className={s.badge}>{`달라질 수 있는 점 ${changes.length}`}</span> : null}
          </span>
          <span className={s.hint}>{hint}</span>
        </span>
        <svg className={s.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
        </svg>
      </summary>

      <div className={s.body}>
        <Group title="이 명식에서는" lines={applied} />
        <Group title="달라질 수 있는 점" lines={changes} />
        <section className={s.group}>
          <h3 className={s.groupTitle}>계산 기준</h3>
          <ul className={s.list}>
            {rules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}
