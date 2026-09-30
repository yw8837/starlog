import type { SajuChart, SajuPolicy } from "@starlog/core";
import s from "./ChartCriteria.module.css";

type ChartCriteriaProps = {
  chart: SajuChart;
};

/** The calculation rules in plain words, from the policy the chart was computed with. */
export function policyLines(policy: SajuPolicy, place: { name: string; longitude: number }): string[] {
  const where = `태어난 곳(${place.name}, 동경 ${place.longitude}°)`;
  const clock: Record<SajuPolicy["clock"], string> = {
    LMT: `일주·시주는 ${where}의 평균 태양시로 봐요. 균시차는 넣지 않아요.`,
    LAT: `일주·시주는 ${where}의 실제 태양 시각으로 봐요.`,
    ERA_STANDARD: "일주·시주는 당시 표준시 그대로 보고, 경도 보정은 하지 않아요.",
    FIXED_127_5: "일주·시주는 동경 127.5° 기준 시각으로 봐요.",
    WALL: "일주·시주는 입력한 시각 그대로 봐요.",
  };
  return [
    "연주·월주는 태어난 순간과 절기가 바뀌는 시각(절입)을 비교해 정해요.",
    clock[policy.clock],
    policy.jasi === "SPLIT_NEXT_DAY_STEM"
      ? "밤 11시대(자시)는 일주를 그날로 두고, 시주만 다음 날 기준으로 봐요."
      : "밤 11시부터는 다음 날 일주로 봐요.",
    ...(policy.applyHistoricalDst ? ["서머타임과 옛 표준시 기간은 당시 시계를 되돌려 계산해요."] : []),
    "오행 개수는 천간과 지지에 보이는 글자만 세요. 지장간은 세지 않아요.",
    "태어난 시를 모르면 정오 같은 시각을 넣지 않고 시주 없이 봐요.",
  ];
}

/**
 * "적용한 기준": what this chart assumed and where it could differ, in a calm disclosure.
 * The day-pillar warnings carry the exact alternative pillar, so the note that repeats them is dropped.
 */
export function ChartCriteria({ chart }: ChartCriteriaProps) {
  const place = chart.input.place;
  const hasDayWindow = chart.warnings.some((w) => w.code === "DAY_PILLAR_WINDOW");
  const notes = hasDayWindow ? chart.notes.filter((note) => !note.includes("일주는 날짜 기준")) : chart.notes;
  const hint = [chart.correctedLocalTime ? `보정 시각 ${chart.correctedLocalTime}` : "시간 모름", `${place.name} 기준`].join(" · ");

  return (
    <details className={s.criteria}>
      <summary className={s.summary}>
        <span className={s.summaryText}>
          <span className={s.summaryRow}>
            <span className={s.summaryTitle}>적용한 기준</span>
            {chart.warnings.length > 0 ? <span className={s.badge}>{`달라질 수 있는 점 ${chart.warnings.length}`}</span> : null}
          </span>
          <span className={s.hint}>{hint}</span>
        </span>
        <svg className={s.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
        </svg>
      </summary>

      <div className={s.body}>
        {notes.length > 0 ? (
          <section className={s.group}>
            <h3 className={s.groupTitle}>이 명식에서는</h3>
            <ul className={s.list}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {chart.warnings.length > 0 ? (
          <section className={s.group}>
            <h3 className={s.groupTitle}>태어난 시각에 따라 달라지는 점</h3>
            <ul className={s.list}>
              {chart.warnings.map((warning) => (
                <li key={warning.message}>{warning.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={s.group}>
          <h3 className={s.groupTitle}>계산 기준</h3>
          <ul className={s.list}>
            {policyLines(chart.policy, place).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={s.version}>{`${chart.policy.version} · ${chart.engine}`}</p>
        </section>
      </div>
    </details>
  );
}
