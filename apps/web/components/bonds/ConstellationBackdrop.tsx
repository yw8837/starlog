import { useId, type CSSProperties } from "react";
import { getConstellation, seededRandom, type SignId } from "@starlog/core";
import { FIGURES } from "./art/figures";
import s from "./ConstellationBackdrop.module.css";

const PAD = 170;
const DUST = 54;
const TWINKLES = 3;

/**
 * A sign's constellation as a large, soft backdrop (behind the ranking podium): a purple nebula wash,
 * the figure's faint outline, thin gradient lines and the catalog stars in varied sizes with a glow,
 * over a scatter of dust stars. Purely decorative and static; with motion allowed, three stars twinkle
 * very slowly. The whole layer is drawn at low opacity by the caller's class (see the CSS module).
 */
export function ConstellationBackdrop({ sign, className }: { sign: SignId; className?: string }) {
  const def = getConstellation(sign);
  const uid = useId().replace(/:/g, "");
  const rand = seededRandom(`backdrop:${sign}`);
  const xs = def.stars.map(([x]) => x);
  const ys = def.stars.map(([, y]) => y);
  const box = { x: Math.min(...xs) - PAD, y: Math.min(...ys) - PAD, w: Math.max(...xs) - Math.min(...xs) + PAD * 2, h: Math.max(...ys) - Math.min(...ys) + PAD * 2 };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Brighter stars first in fill order, a little variety after that (the same for every visit).
  const radius = def.stars.map((_, i) => 13 - Math.min(i, 4) + rand() * 5);
  // Three twinkling stars picked by a seeded shuffle (the same on the server and in every browser).
  const order = Array.from({ length: def.slots }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const twinkle = new Set(order.slice(0, TWINKLES));
  // Dust spreads well past the constellation, so a wide box is filled too (the svg clips it).
  const dust = Array.from({ length: DUST }, () => ({
    x: box.x - box.w + rand() * box.w * 3,
    y: box.y - box.h * 0.4 + rand() * box.h * 1.8,
    r: 1.6 + rand() * 2.6,
    o: 0.35 + rand() * 0.5,
  }));
  const ids = { nebula: `${uid}-nebula`, haze: `${uid}-haze`, glow: `${uid}-glow`, line: `${uid}-line` };

  return (
    <svg
      className={[s.backdrop, className ?? ""].filter(Boolean).join(" ")}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={ids.nebula} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8b74ff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#5b46c9" stopOpacity="0.22" />
          <stop offset="1" stopColor="#2e2a78" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.haze} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#d59cff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#d59cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#f3dca1" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f3dca1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.line} gradientUnits="userSpaceOnUse" x1={box.x} y1={box.y + box.h} x2={box.x + box.w} y2={box.y}>
          <stop offset="0" stopColor="#cfc6ff" />
          <stop offset="0.5" stopColor="#f3dca1" />
          <stop offset="1" stopColor="#cfc6ff" />
        </linearGradient>
      </defs>

      <ellipse cx={cx} cy={cy} rx={box.w * 0.62} ry={box.h * 0.56} fill={`url(#${ids.nebula})`} />
      <ellipse cx={cx - box.w * 0.22} cy={cy + box.h * 0.18} rx={box.w * 0.36} ry={box.h * 0.3} fill={`url(#${ids.haze})`} />

      {dust.map((d, i) => (
        <circle key={`d${i}`} className={s.dust} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
      ))}

      <path className={s.figure} d={FIGURES[sign]} />

      {def.lines.map(([a, b]) => {
        const [x1, y1] = def.stars[a]!;
        const [x2, y2] = def.stars[b]!;
        return <line key={`${a}-${b}`} className={s.line} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#${ids.line})`} />;
      })}

      {def.stars.map(([x, y], i) => (
        <g key={i} className={twinkle.has(i) ? s.twinkle : undefined} style={{ "--i": i } as CSSProperties}>
          <circle cx={x} cy={y} r={radius[i]! * 4.2} fill={`url(#${ids.glow})`} />
          <circle className={s.core} cx={x} cy={y} r={radius[i]!} />
          <path className={s.spark} d={`M${x} ${y - radius[i]! * 2.6}V${y + radius[i]! * 2.6}M${x - radius[i]! * 2.6} ${y}H${x + radius[i]! * 2.6}`} />
        </g>
      ))}
    </svg>
  );
}
