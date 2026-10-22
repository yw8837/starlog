import type { ElementAxis } from "@/lib/sajuBalance";
import { ELEMENT_KEY } from "./elements";
import s from "./BalanceCard.module.css";

/** The pentagon: 목 on top, then clockwise along 상생 (화, 토, 금, 수). viewBox units are CSS px at 200px wide. */
const W = 200;
const H = 180;
const CX = 100;
const CY = 90;
const R = 52;

const point = (i: number, radius: number) => {
  const angle = (-90 + 72 * i) * (Math.PI / 180);
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
};
const polygon = (radius: (i: number) => number) =>
  [0, 1, 2, 3, 4]
    .map((i) => point(i, radius(i)))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

/** Where each axis's two-line label sits: above the top, beside the upper two, under the lower two. */
function labelAt(i: number): { x: number; y1: number; y2: number; anchor: "start" | "middle" | "end" } {
  const v = point(i, R);
  if (i === 0) return { x: v.x, y1: v.y - 22, y2: v.y - 7, anchor: "middle" };
  if (i === 1) return { x: v.x + 8, y1: v.y - 2, y2: v.y + 14, anchor: "start" };
  if (i === 4) return { x: v.x - 8, y1: v.y - 2, y2: v.y + 14, anchor: "end" };
  return { x: v.x, y1: v.y + 20, y2: v.y + 35, anchor: "middle" };
}

/** 오행 · 글자 수: one axis per element, the visible glyphs of it as the distance from the middle. */
export function ElementRadar({ axes, total }: { axes: ElementAxis[]; total: number }) {
  const max = Math.max(3, ...axes.map((a) => a.count));
  const label = `오행 글자 수, 보이는 ${total}글자: ${axes.map((a) => `${a.word}(${a.group}) ${a.count}`).join(", ")}`;
  return (
    <svg className={s.radar} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <g className={s.grid}>
        {Array.from({ length: max }, (_, k) => (
          <polygon key={k} points={polygon(() => (R * (k + 1)) / max)} />
        ))}
        {axes.map((_, i) => {
          const v = point(i, R);
          return <line key={i} x1={CX} y1={CY} x2={v.x} y2={v.y} />;
        })}
      </g>
      <polygon className={s.shape} points={polygon((i) => (R * axes[i]!.count) / max)} />
      {axes.map((a, i) => {
        const p = point(i, (R * a.count) / max);
        const at = labelAt(i);
        return (
          <g key={a.element} data-el={ELEMENT_KEY[a.element]}>
            <circle className={s.vertex} cx={p.x} cy={p.y} r={3.5} />
            <text className={s.axisLabel} x={at.x} textAnchor={at.anchor}>
              <tspan x={at.x} y={at.y1}>
                <tspan className={s.axisWord}>{a.word}</tspan>
                <tspan className={a.count === 0 ? s.axisZero : s.axisCount}>{` ${a.count}`}</tspan>
              </tspan>
              <tspan className={s.axisGroup} x={at.x} y={at.y2}>
                {a.group}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
