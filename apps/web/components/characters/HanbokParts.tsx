import s from "./characters.module.css";

type Point = readonly [number, number];
const r = (n: number) => Math.round(n * 10) / 10;

/** 고름: knot, short loop and two ribbons, tied at (x, y). `length` is the long ribbon's drop. */
export function Goreum({ x, y, length = 29 }: { x: number; y: number; length?: number }) {
  const k = length / 29;
  const Y = (dy: number) => r(y + dy * k);
  return (
    <g className={s.goreum} fill="url(#sl-goreum)">
      <path d={`M${x} ${y}C${x - 11} ${y - 7} ${x - 16} ${y + 3} ${x - 9} ${y + 6}C${x - 5} ${y + 7} ${x - 2} ${y + 4} ${x} ${y}Z`} />
      <path d={`M${x - 1} ${y + 2}C${x - 2} ${Y(11)} ${x - 4} ${Y(19)} ${x - 6} ${Y(29)}L${x - 0.5} ${Y(30)}C${x} ${Y(20)} ${x + 1} ${Y(11)} ${x + 2} ${y + 2}Z`} />
      <path d={`M${x + 1} ${y + 2}C${x + 3} ${Y(10)} ${x + 5} ${Y(17)} ${x + 8} ${Y(25)}L${x + 12.5} ${Y(23)}C${x + 9} ${Y(15)} ${x + 6} ${Y(8)} ${x + 3} ${y}Z`} />
      <ellipse cx={x} cy={y + 1} rx="4" ry="3.4" />
      <ellipse cx={x - 1} cy={y} rx="1.6" ry="1" fill="#fff" opacity=".5" />
    </g>
  );
}

type CollarProps = {
  /** 깃 band colour. */
  band: string;
  /** Neck points where the inner (viewer's left) and outer collar start. */
  left: Point;
  right: Point;
  /** Where the inner collar ends, under the outer one. */
  cross: Point;
  /** Where the outer collar ends at the 고름. */
  tie: Point;
  width?: number;
};

/** A white 동정 strip along the neck-side edge of a collar segment, from `a` toward `b`. */
function dongjeong(a: Point, b: Point, towardV: 1 | -1, offset: number, share: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];
  // Normal pointing into the V opening (up and toward the centre line).
  const [nx, ny] = towardV === 1 ? [uy, -ux] : [-uy, ux];
  const ox = nx * offset;
  const oy = ny * offset;
  return `M${r(a[0] + ox)} ${r(a[1] + oy)}L${r(a[0] + dx * share + ox)} ${r(a[1] + dy * share + oy)}`;
}

/** 깃 with a white 동정: the outer collar crosses from the right of the neck down to the tie. */
export function Collar({ band, left, right, cross, tie, width = 9 }: CollarProps) {
  const offset = width / 2 - 2;
  return (
    <g strokeLinecap="round" fill="none">
      <path d={`M${left[0]} ${left[1]}L${cross[0]} ${cross[1]}`} stroke={band} strokeWidth={width - 1} />
      <path d={dongjeong(left, cross, 1, offset, 0.92)} stroke="#FFFFFF" strokeWidth="3.6" />
      <path d={`M${right[0]} ${right[1]}L${tie[0]} ${tie[1]}`} stroke={band} strokeWidth={width} />
      <path d={dongjeong(right, tie, -1, offset, 0.62)} stroke="#FFFFFF" strokeWidth="3.8" />
    </g>
  );
}
