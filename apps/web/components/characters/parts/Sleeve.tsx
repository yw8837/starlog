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

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * A chubby sleeve from the shoulder: narrow at the top, softly bell-shaped toward a rounded
 * cuff, with round-tube shading. `fill` is painted in the sleeve's own frame, so a striped
 * pattern (색동) runs across the arm.
 */
export function Sleeve({ x, y, angle, fill, length = 34, width = 24, cuff }: SleeveProps) {
  const w = width / 2;
  const L = length;
  const d =
    `M${r(-0.8 * w)} 0C${r(-0.8 * w)} -7 ${r(0.8 * w)} -7 ${r(0.8 * w)} 0` +
    `C${r(0.95 * w)} ${r(L * 0.4)} ${r(1.15 * w)} ${r(L * 0.7)} ${r(1.1 * w)} ${L - 5}` +
    `C${r(1.05 * w)} ${L + 2} ${r(-1.05 * w)} ${L + 2} ${r(-1.1 * w)} ${L - 5}` +
    `C${r(-1.15 * w)} ${r(L * 0.7)} ${r(-0.95 * w)} ${r(L * 0.4)} ${r(-0.8 * w)} 0Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={d} fill={fill} />
      {cuff && (
        <path
          d={`M${r(-1.12 * w)} ${L - 7}H${r(1.12 * w)}L${r(1.1 * w)} ${L - 5}C${r(1.05 * w)} ${L + 2} ${r(-1.05 * w)} ${L + 2} ${r(-1.1 * w)} ${L - 5}Z`}
          fill={cuff}
        />
      )}
      <path d={d} fill="url(#sl-tube)" />
    </g>
  );
}
