import type { Expression } from "./types";
import { starPath } from "./shapes";
import s from "./characters.module.css";

type Point = readonly [number, number];

export type FaceSpec = {
  eyes: readonly [Point, Point];
  eyeRx: number;
  eyeRy: number;
  /** A small five-point gold star in each eye (the cat's signature). */
  starEyes?: boolean;
  /** Top centre of the nose and its half width. */
  nose: Point;
  noseW: number;
  /** Philtrum length below the nose. */
  philtrum: number;
  /** Width of one lobe of the ω mouth. */
  lobe: number;
  cheeks: readonly [Point, Point];
  cheekRx: number;
  cheekRy: number;
  /** Two front teeth when the mouth opens (the rabbit). */
  teeth?: boolean;
};

const LINE = "#2A2350";
const INK = "#3B2F5A";
const MOUTH = "#6E2E4E";
const TONGUE = "#F48FA8";
const r2 = (n: number) => Math.round(n * 100) / 100;

function OpenEye({ at, rx, ry, star }: { at: Point; rx: number; ry: number; star?: boolean }) {
  const [x, y] = at;
  return (
    <>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="url(#sl-iris)" />
      <ellipse cx={x} cy={r2(y + ry * 0.5)} rx={r2(rx * 0.62)} ry={r2(ry * 0.3)} fill="#8C7BE6" opacity=".45" />
      <ellipse cx={r2(x + rx * 0.3)} cy={r2(y - ry * 0.38)} rx={r2(rx * 0.4)} ry={r2(ry * 0.37)} fill="#fff" />
      <circle cx={r2(x - rx * 0.38)} cy={r2(y + ry * 0.42)} r={r2(rx * 0.17)} fill="#fff" opacity=".85" />
      {star && (
        <path
          d={starPath(r2(x + rx * 0.3), r2(y + ry * 0.38), r2(rx * 0.4), 0.5)}
          fill="#FFE9B0"
          stroke="#FFE9B0"
          strokeWidth=".8"
          strokeLinejoin="round"
        />
      )}
    </>
  );
}

function ClosedEye({ at, rx, ry }: { at: Point; rx: number; ry: number }) {
  const [x, y] = at;
  return (
    <path
      d={`M${r2(x - rx)} ${r2(y + ry * 0.2)}Q${x} ${r2(y - ry * 1.05)} ${r2(x + rx)} ${r2(y + ry * 0.2)}`}
      stroke={LINE}
      strokeWidth={r2(rx * 0.3)}
      strokeLinecap="round"
      fill="none"
    />
  );
}

/** Half-lidded, looking down at the work. */
function FocusEye({ at, rx, ry }: { at: Point; rx: number; ry: number }) {
  const [x, y] = at;
  const lid = `M${r2(x - rx)} ${y}Q${x} ${r2(y - ry * 0.95)} ${r2(x + rx)} ${y}`;
  return (
    <>
      <path d={`${lid}A${rx} ${ry} 0 0 1 ${r2(x - rx)} ${y}Z`} fill="url(#sl-iris)" />
      <ellipse cx={x} cy={r2(y + ry * 0.55)} rx={r2(rx * 0.6)} ry={r2(ry * 0.26)} fill="#8C7BE6" opacity=".45" />
      <ellipse cx={r2(x + rx * 0.32)} cy={r2(y - ry * 0.12)} rx={r2(rx * 0.3)} ry={r2(ry * 0.24)} fill="#fff" />
      <circle cx={r2(x - rx * 0.36)} cy={r2(y + ry * 0.5)} r={r2(rx * 0.14)} fill="#fff" opacity=".8" />
      <path d={lid} stroke={LINE} strokeWidth={r2(rx * 0.2)} strokeLinecap="round" fill="none" />
    </>
  );
}

function Eyes({ spec, expression }: { spec: FaceSpec; expression: Expression }) {
  const { eyes, eyeRx: rx, eyeRy: ry, starEyes } = spec;
  switch (expression) {
    case "happy":
      return eyes.map((at, i) => <ClosedEye key={i} at={at} rx={rx} ry={ry} />);
    case "focus":
      return eyes.map((at, i) => <FocusEye key={i} at={at} rx={rx} ry={ry} />);
    case "surprise":
      return eyes.map((at, i) => <OpenEye key={i} at={at} rx={r2(rx * 1.14)} ry={r2(ry * 1.16)} star={starEyes} />);
    case "wink":
      return (
        <>
          <OpenEye at={eyes[0]} rx={rx} ry={ry} star={starEyes} />
          <ClosedEye at={eyes[1]} rx={rx} ry={ry} />
        </>
      );
    default:
      return (
        <g className={s.blink}>
          {eyes.map((at, i) => (
            <OpenEye key={i} at={at} rx={rx} ry={ry} star={starEyes} />
          ))}
        </g>
      );
  }
}

function Mouth({ spec, expression }: { spec: FaceSpec; expression: Expression }) {
  const [nx, ny] = spec.nose;
  const w = spec.lobe;
  const top = r2(ny + spec.noseW * 1.05);
  const my = r2(top + spec.philtrum);
  const stroke = { stroke: INK, strokeWidth: 2.3, strokeLinecap: "round" as const, fill: "none" };
  const philtrum = <path d={`M${nx} ${top}V${my}`} {...stroke} />;

  if (expression === "happy" || expression === "wink") {
    const d =
      `M${r2(nx - w * 1.7)} ${r2(my - 0.5)}Q${nx} ${r2(my + 1.5)} ${r2(nx + w * 1.7)} ${r2(my - 0.5)}` +
      `Q${r2(nx + w * 1.5)} ${r2(my + w * 2.5)} ${nx} ${r2(my + w * 2.6)}` +
      `Q${r2(nx - w * 1.5)} ${r2(my + w * 2.5)} ${r2(nx - w * 1.7)} ${r2(my - 0.5)}Z`;
    return (
      <>
        {philtrum}
        <path d={d} fill={MOUTH} />
        <ellipse cx={nx} cy={r2(my + w * 1.9)} rx={r2(w * 0.95)} ry={r2(w * 0.6)} fill={TONGUE} />
        {spec.teeth && (
          <>
            <rect x={r2(nx - 3.1)} y={r2(my + 0.2)} width="2.9" height="3.6" rx=".8" fill="#fff" />
            <rect x={r2(nx + 0.2)} y={r2(my + 0.2)} width="2.9" height="3.6" rx=".8" fill="#fff" />
          </>
        )}
      </>
    );
  }
  if (expression === "surprise") {
    return (
      <>
        {philtrum}
        <ellipse cx={nx} cy={r2(my + w)} rx={r2(w * 0.75)} ry={r2(w * 0.95)} fill={MOUTH} />
      </>
    );
  }
  if (expression === "focus") {
    return (
      <>
        {philtrum}
        <path d={`M${r2(nx - w)} ${r2(my + 1)}Q${nx} ${r2(my + w * 0.6)} ${r2(nx + w)} ${r2(my + 1)}`} {...stroke} />
      </>
    );
  }
  return (
    <>
      {philtrum}
      <path
        d={`M${r2(nx - 2 * w)} ${r2(my - 1)}q${w} ${r2(w * 1.25)} ${2 * w} 1q${w} ${r2(w * 1.25)} ${2 * w} -1`}
        {...stroke}
      />
    </>
  );
}

function Nose({ spec }: { spec: FaceSpec }) {
  const [x, y] = spec.nose;
  const w = spec.noseW;
  const d =
    `M${r2(x - w)} ${y}Q${x} ${r2(y - w * 0.4)} ${r2(x + w)} ${y}` +
    `Q${r2(x + w * 0.55)} ${r2(y + w * 0.95)} ${x} ${r2(y + w * 1.05)}` +
    `Q${r2(x - w * 0.55)} ${r2(y + w * 0.95)} ${r2(x - w)} ${y}Z`;
  return (
    <>
      <path d={d} fill="#E88FA6" />
      <ellipse cx={r2(x - w * 0.28)} cy={r2(y + w * 0.18)} rx={r2(w * 0.32)} ry={r2(w * 0.17)} fill="#fff" opacity=".7" />
    </>
  );
}

export function Face({ spec, expression }: { spec: FaceSpec; expression: Expression }) {
  const glow = expression === "happy" || expression === "wink" ? 0.72 : 0.55;
  return (
    <g>
      {spec.cheeks.map(([x, y], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={spec.cheekRx}
          ry={spec.cheekRy}
          fill="#F4A3B7"
          opacity={glow}
          filter="url(#sl-blush)"
        />
      ))}
      <Eyes spec={spec} expression={expression} />
      <Nose spec={spec} />
      <Mouth spec={spec} expression={expression} />
    </g>
  );
}
