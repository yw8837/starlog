import type { GuideBlock } from "@/lib/guideMeta";
import s from "./GuideBlocks.module.css";

/**
 * Data charts drawn from an article's own numbers (GuideBlock kind "chart"): inline SVG on the cream paper, named by a
 * <title> and described by a <desc> that reads the values out, so the chart says the same as the table next to it. No
 * library, no script: the numbers come from the article data, which the data articles' tests tie to their sources.
 */

type ChartBlock = Extract<GuideBlock, { kind: "chart" }>;
type BarChart = Extract<ChartBlock, { chart: "bar" }>;
type TimelineChart = Extract<ChartBlock, { chart: "timeline" }>;

const W = 340;
const LABEL_W = 118;
const VALUE_W = 50;
const ROW_H = 26;
const BAR_H = 14;

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }));

function Bars({ block, id }: { block: BarChart; id: string }) {
  const max = Math.max(1, ...block.rows.map((row) => row.value));
  const track = W - LABEL_W - VALUE_W;
  const height = block.rows.length * ROW_H + 8;
  const desc = block.rows.map((row) => `${row.label} ${fmt(row.value)}${block.unit}`).join(", ");
  return (
    <figure className={`${s.block} ${s.diagram}`}>
      <svg className={s.chartSvg} viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <title id={`${id}-title`}>{block.caption}</title>
        <desc id={`${id}-desc`}>{desc}</desc>
        {block.rows.map((row, i) => {
          const y = 4 + i * ROW_H;
          const w = (row.value / max) * track;
          return (
            <g key={row.label}>
              <text x={LABEL_W - 10} y={y + ROW_H / 2} className={s.chartLabel} textAnchor="end" dominantBaseline="middle">
                {row.label}
              </text>
              <rect x={LABEL_W} y={y + (ROW_H - BAR_H) / 2} width={track} height={BAR_H} rx={3} className={s.chartTrack} />
              {w > 0 ? <rect x={LABEL_W} y={y + (ROW_H - BAR_H) / 2} width={Math.max(2, w)} height={BAR_H} rx={3} className={s.chartBar} /> : null}
              <text x={W - VALUE_W + 8} y={y + ROW_H / 2} className={s.chartValue} dominantBaseline="middle">
                {`${fmt(row.value)}${block.unit}`}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className={s.caption}>{block.caption}</figcaption>
    </figure>
  );
}

function Timeline({ block, id }: { block: TimelineChart; id: string }) {
  const left = 84;
  const right = 16;
  const top = 8;
  const laneH = 30;
  const axisH = 26;
  const height = top + block.lanes.length * laneH + axisH;
  const x = (year: number) => left + ((year - block.from) / (block.to - block.from)) * (W - left - right);
  const ticks: number[] = [];
  for (let year = Math.ceil(block.from / 10) * 10; year <= block.to; year += 10) ticks.push(year);
  const desc = block.lanes.map((lane) => `${lane.label}: ${lane.spans.map(([a, b]) => `${Math.floor(a)}–${Math.floor(b)}`).join(", ")}`).join(". ");
  return (
    <figure className={`${s.block} ${s.diagram}`}>
      <svg className={s.chartSvg} viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <title id={`${id}-title`}>{block.caption}</title>
        <desc id={`${id}-desc`}>{desc}</desc>
        {ticks.map((year) => (
          <g key={year}>
            <line x1={x(year)} x2={x(year)} y1={top} y2={height - axisH + 4} className={s.chartGrid} />
            <text x={x(year)} y={height - 8} className={s.chartTick} textAnchor="middle">
              {year}
            </text>
          </g>
        ))}
        {block.lanes.map((lane, i) => {
          const y = top + i * laneH;
          return (
            <g key={lane.label}>
              <text x={left - 10} y={y + laneH / 2} className={s.chartLabel} textAnchor="end" dominantBaseline="middle">
                {lane.label}
              </text>
              {lane.spans.map(([a, b]) => (
                <rect key={a} x={x(a)} y={y + 8} width={Math.max(2, x(b) - x(a))} height={laneH - 16} rx={2} className={i % 2 ? s.chartBarAlt : s.chartBar} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className={s.caption}>{block.caption}</figcaption>
    </figure>
  );
}

export function GuideChart({ block, id }: { block: ChartBlock; id: string }) {
  return block.chart === "bar" ? <Bars block={block} id={id} /> : <Timeline block={block} id={id} />;
}
