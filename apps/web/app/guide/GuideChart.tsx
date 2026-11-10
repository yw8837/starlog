import { spanLabel, type GuideBlock } from "@/lib/guideMeta";
import s from "./GuideBlocks.module.css";

/**
 * Data charts drawn from an article's own numbers (GuideBlock kind "chart"): inline SVG on the cream paper, named by a
 * <title> and described by a <desc> that reads the values out, so the chart says the same as the table next to it. No
 * library, no script: the numbers come from the article data, which the data articles' tests tie to their sources.
 */

type ChartBlock = Extract<GuideBlock, { kind: "chart" }>;
type BarChart = Extract<ChartBlock, { chart: "bar" }>;
type TimelineChart = Extract<ChartBlock, { chart: "timeline" }>;

const ROW_H = 26;
const BAR_H = 14;
const TRACK = 160;

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }));

export { spanLabel };

/**
 * A generous width of `text` at the charts' 13px (GuideBlocks.module.css .chartLabel): a Hangul syllable a full em, Latin
 * letters and digits 0.62em, a space 0.3em. Wider than the browser's own measure, so the columns never clip.
 */
export function estimateTextWidth(text: string, px = 13): number {
  let em = 0;
  for (const char of text) em += /[ㄱ-힣]/.test(char) ? 1 : char === " " ? 0.3 : 0.62;
  return em * px;
}

/** A bar chart's columns, sized from its own longest label and value. */
export function chartLayout(block: BarChart) {
  const valueText = (value: number) => `${fmt(value)}${block.unit}`;
  const labelW = Math.ceil(Math.max(...block.rows.map((row) => estimateTextWidth(row.label)))) + 16;
  const valueW = Math.ceil(Math.max(...block.rows.map((row) => estimateTextWidth(valueText(row.value))))) + 14;
  return { labelW, valueW, track: TRACK, width: labelW + TRACK + valueW, valueText };
}

function Bars({ block, id }: { block: BarChart; id: string }) {
  const max = Math.max(1, ...block.rows.map((row) => row.value));
  const { labelW: LABEL_W, valueW: VALUE_W, track, width: W, valueText } = chartLayout(block);
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
                {valueText(row.value)}
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
  const W = 340;
  const left = Math.ceil(Math.max(...block.lanes.map((lane) => estimateTextWidth(lane.label)))) + 16;
  const right = 16;
  const top = 8;
  const laneH = 30;
  const axisH = 26;
  const height = top + block.lanes.length * laneH + axisH;
  const x = (year: number) => left + ((year - block.from) / (block.to - block.from)) * (W - left - right);
  const ticks: number[] = [];
  for (let year = Math.ceil(block.from / 10) * 10; year <= block.to; year += 10) ticks.push(year);
  const desc = block.lanes.map((lane) => `${lane.label}: ${lane.spans.map(spanLabel).join(", ")}`).join(". ");
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
