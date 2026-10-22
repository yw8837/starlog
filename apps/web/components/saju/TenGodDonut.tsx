import type { GroupShare } from "@/lib/sajuBalance";
import { ELEMENT_KEY } from "./elements";
import s from "./BalanceCard.module.css";

/** A ring of `pathLength` 100: each arc's dash is its percentage, laid end to end from 12 o'clock. */
const R = 46;
/** A hair of night sky between two arcs. */
const GAP = 0.8;

/** 십성 · 비율: each group's share of the counted places, coloured by the element that holds it; the basis in the middle. */
export function TenGodDonut({ items, total }: { items: GroupShare[]; total: number }) {
  const shown = items.filter((g) => g.percent > 0);
  const gap = shown.length > 1 ? GAP : 0;
  let start = 0;
  const arcs = shown.map((g) => {
    const arc = { g, start, length: Math.max(g.percent - gap, 0.4) };
    start += g.percent;
    return arc;
  });
  const label = `십성 비율, 일간을 뺀 ${total}글자: ${items.map((g) => `${g.group}(${g.word}) ${g.percent}%`).join(", ")}`;
  return (
    <svg className={s.donut} viewBox="0 0 120 120" role="img" aria-label={label}>
      <circle className={s.track} cx={60} cy={60} r={R} />
      <g transform="rotate(-90 60 60)">
        {arcs.map(({ g, start: from, length }) => (
          <circle
            key={g.group}
            data-arc=""
            data-el={ELEMENT_KEY[g.element]}
            className={s.arc}
            cx={60}
            cy={60}
            r={R}
            pathLength={100}
            strokeDasharray={`${length} ${100 - length}`}
            strokeDashoffset={-from}
          />
        ))}
      </g>
      <text className={s.donutTotal} x={60} y={62} textAnchor="middle">
        {total}
      </text>
      <text className={s.donutUnit} x={60} y={80} textAnchor="middle">
        글자
      </text>
    </svg>
  );
}
