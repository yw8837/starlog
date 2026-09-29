import s from "./characters.module.css";

type SleeveProps = {
  /** Shoulder point and angle (deg, 0 = hanging straight down). */
  x: number;
  y: number;
  angle: number;
  fill: string;
  length?: number;
  width?: number;
  cuff?: string;
};

/**
 * A chubby sleeve drawn as a rounded tube from the shoulder, with round-tube shading.
 * `fill` is painted in the sleeve's own frame, so the 색동 pattern bands run across it.
 */
export function Sleeve({ x, y, angle, fill, length = 34, width = 24, cuff }: SleeveProps) {
  const w = width / 2;
  const L = length;
  const r = (n: number) => Math.round(n * 10) / 10;
  // Narrow at the shoulder, softly bell-shaped toward a rounded cuff.
  const d =
    `M${r(-0.8 * w)} 0C${r(-0.8 * w)} -7 ${r(0.8 * w)} -7 ${r(0.8 * w)} 0` +
    `C${r(0.95 * w)} ${r(L * 0.4)} ${r(1.15 * w)} ${r(L * 0.7)} ${r(1.1 * w)} ${L - 5}` +
    `C${r(1.05 * w)} ${L + 2} ${r(-1.05 * w)} ${L + 2} ${r(-1.1 * w)} ${L - 5}` +
    `C${r(-1.15 * w)} ${r(L * 0.7)} ${r(-0.95 * w)} ${r(L * 0.4)} ${r(-0.8 * w)} 0Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={d} fill={fill} />
      {cuff && <path d={`M${r(-1.12 * w)} ${L - 7}H${r(1.12 * w)}L${r(1.1 * w)} ${L - 5}C${r(1.05 * w)} ${L + 2} ${r(-1.05 * w)} ${L + 2} ${r(-1.1 * w)} ${L - 5}Z`} fill={cuff} />}
      <path d={d} fill="url(#sl-tube)" />
    </g>
  );
}

/** 고름: knot, short loop and two long ribbons, tied at (x, y). */
export function Goreum({ x, y }: { x: number; y: number }) {
  return (
    <g className={s.goreum} fill="url(#sl-goreum)">
      <path d={`M${x} ${y}C${x - 11} ${y - 7} ${x - 16} ${y + 3} ${x - 9} ${y + 6}C${x - 5} ${y + 7} ${x - 2} ${y + 4} ${x} ${y}Z`} />
      <path d={`M${x - 1} ${y + 2}C${x - 2} ${y + 11} ${x - 4} ${y + 19} ${x - 6} ${y + 29}L${x - 0.5} ${y + 30}C${x} ${y + 20} ${x + 1} ${y + 11} ${x + 2} ${y + 2}Z`} />
      <path d={`M${x + 1} ${y + 2}C${x + 3} ${y + 10} ${x + 5} ${y + 17} ${x + 8} ${y + 25}L${x + 12.5} ${y + 23}C${x + 9} ${y + 15} ${x + 6} ${y + 8} ${x + 3} ${y}Z`} />
      <ellipse cx={x} cy={y + 1} rx="4" ry="3.4" />
      <ellipse cx={x - 1} cy={y} rx="1.6" ry="1" fill="#fff" opacity=".5" />
    </g>
  );
}

/** 깃 with a white 동정: outer collar crosses from the right of the neck down to the tie. */
export function Collar({ band, tieX, tieY }: { band: string; tieX: number; tieY: number }) {
  return (
    <g strokeLinecap="round" fill="none">
      <path d="M130 217L151 238" stroke={band} strokeWidth="8" />
      <path d="M132.5 215.5L151.5 234.5" stroke="#FFFFFF" strokeWidth="3.4" />
      <path d={`M170 217L${tieX} ${tieY}`} stroke={band} strokeWidth="9" />
      <path d="M167.5 215.5L148.5 234.5" stroke="#FFFFFF" strokeWidth="3.6" />
    </g>
  );
}
