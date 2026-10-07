import { TEMPLATES } from "@starlog/core";
import type { ReactNode } from "react";
import type { GuideBlock } from "@/lib/guideMeta";
import s from "./GuideBlocks.module.css";

/**
 * The built-in diagrams a guide section can show (GuideBlock kind "diagram"): inline SVG on the cream
 * paper, named by a <title> and described by a <desc>, with any longer labels in an HTML legend so
 * they wrap at 360px. `id` makes every SVG id unique on the page.
 */

type DiagramBlock = Extract<GuideBlock, { kind: "diagram" }>;

/** The ten places of the Celtic Cross, as the celtic-cross-spread article names them (Waite's order). */
export const CELTIC_CROSS_POSITIONS = ["지금의 분위기", "걸림돌", "목표", "바탕", "지나간 영향", "다가올 영향", "나 자신", "주변 환경", "바람과 두려움", "결말"] as const;

function Figure({ id, title, desc, viewBox, legend, caption, children }: { id: string; title: string; desc: string; viewBox: string; legend?: ReactNode; caption?: string; children: ReactNode }) {
  return (
    <figure className={`${s.block} ${s.diagram}`}>
      <svg className={s.diagramSvg} viewBox={viewBox} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{desc}</desc>
        {children}
      </svg>
      {legend}
      {caption ? <figcaption className={s.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;

/** An arrowhead for lines that end at a marker; `className` sets its fill. */
const Arrow = ({ id, className }: { id: string; className: string | undefined }) => (
  <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0L10 5L0 10z" className={className} />
  </marker>
);

// ---- 오행: 상생 around the circle, 상극 as the star inside ----

const ELEMENTS = [
  { ko: "목", hanja: "木", el: "wood" },
  { ko: "화", hanja: "火", el: "fire" },
  { ko: "토", hanja: "土", el: "earth" },
  { ko: "금", hanja: "金", el: "metal" },
  { ko: "수", hanja: "水", el: "water" },
] as const;

function FiveElements({ id, caption }: { id: string; caption?: string }) {
  const cx = 160;
  const cy = 150;
  const radius = 104;
  const node = 32;
  const point = (deg: number, r = radius) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const;
  const angle = (i: number) => -90 + 72 * i;
  // Arcs between neighbours, clear of the circles (the arrowhead needs the extra gap).
  const gap = ((node + 8) / radius) * (180 / Math.PI);
  const arcs = ELEMENTS.map((_, i) => {
    const [x1, y1] = point(angle(i) + gap);
    const [x2, y2] = point(angle(i + 1) - gap);
    return `M${round(x1)} ${round(y1)}A${radius} ${radius} 0 0 1 ${round(x2)} ${round(y2)}`;
  });
  // Chords from each element to the one two steps on: the 상극 star.
  const chords = ELEMENTS.map((_, i) => {
    const [ax, ay] = point(angle(i));
    const [bx, by] = point(angle(i + 2));
    const length = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
    return `M${round(ax + ux * (node + 4))} ${round(ay + uy * (node + 4))}L${round(bx - ux * (node + 8))} ${round(by - uy * (node + 8))}`;
  });
  const legend = (
    <ul className={s.legend}>
      <li>
        <svg className={s.swatch} viewBox="0 0 28 10" aria-hidden="true">
          <line x1="1" y1="5" x2="27" y2="5" className={s.sheng} />
        </svg>
        상생: 살리는 관계
      </li>
      <li>
        <svg className={s.swatch} viewBox="0 0 28 10" aria-hidden="true">
          <line x1="1" y1="5" x2="27" y2="5" className={s.ke} />
        </svg>
        상극: 누르는 관계
      </li>
    </ul>
  );
  return (
    <Figure
      id={id}
      title="오행의 상생과 상극"
      desc="목·화·토·금·수가 둥글게 놓여 있어요. 바깥 화살표는 목에서 화, 화에서 토, 토에서 금, 금에서 수, 수에서 다시 목으로 살리는 상생이고, 안쪽 별 모양 점선 화살표는 목에서 토, 토에서 수, 수에서 화, 화에서 금, 금에서 다시 목으로 누르는 상극이에요."
      viewBox="0 0 320 280"
      legend={legend}
      caption={caption}
    >
      <defs>
        <Arrow id={`${id}-sheng`} className={s.arrowSheng} />
        <Arrow id={`${id}-ke`} className={s.arrowKe} />
      </defs>
      {chords.map((d) => (
        <path key={d} d={d} className={s.ke} markerEnd={`url(#${id}-ke)`} />
      ))}
      {arcs.map((d) => (
        <path key={d} d={d} className={s.sheng} markerEnd={`url(#${id}-sheng)`} />
      ))}
      {ELEMENTS.map((element, i) => {
        const [x, y] = point(angle(i));
        return (
          <g key={element.ko} data-el={element.el}>
            <circle cx={round(x)} cy={round(y)} r={node} className={s.node} />
            <text x={round(x)} y={round(y - 1)} className={s.nodeKo}>
              {element.ko}
            </text>
            <text x={round(x)} y={round(y + 17)} className={s.nodeHanja}>
              {element.hanja}
            </text>
          </g>
        );
      })}
    </Figure>
  );
}

// ---- 타로 3장: the app's own three positions, left to right ----

function ThreeCard({ id, spread, caption }: { id: string; spread: Extract<DiagramBlock, { name: "three-card" }>["spread"]; caption?: string }) {
  const positions = TEMPLATES[spread].positions;
  const centers = [50, 150, 250];
  const [w, h, top] = [58, 92, 12];
  return (
    <Figure
      id={id}
      title="타로 3장 배치"
      desc={`왼쪽부터 ${positions.map((name, i) => `${i + 1}번 ${name}`).join(", ")} 자리에 카드를 한 장씩 놓아요.`}
      viewBox="0 0 300 116"
      legend={
        <ol className={s.spreadLabels}>
          {positions.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ol>
      }
      caption={caption}
    >
      <defs>
        <Arrow id={`${id}-next`} className={s.arrowSheng} />
      </defs>
      {centers.slice(0, -1).map((x) => (
        <line key={x} x1={x + w / 2 + 8} y1={top + h / 2} x2={x + 100 - w / 2 - 6} y2={top + h / 2} className={s.flow} markerEnd={`url(#${id}-next)`} />
      ))}
      {centers.map((x, i) => (
        <g key={x}>
          <rect x={x - w / 2} y={top} width={w} height={h} rx="6" className={s.slot} />
          <text x={x} y={top + h / 2 + 9} className={s.slotNumber}>
            {i + 1}
          </text>
        </g>
      ))}
    </Figure>
  );
}

// ---- 켈틱 크로스: the cross of six on the left, the staff of four on the right ----

/** Each place's box: x, y, width, height (the 2nd lies across the 1st). */
const CELTIC_BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
  [88, 126, 48, 72],
  [75, 144, 74, 36],
  [88, 44, 48, 72],
  [88, 208, 48, 72],
  [17, 126, 48, 72],
  [159, 126, 48, 72],
  [240, 243, 48, 72],
  [240, 165, 48, 72],
  [240, 87, 48, 72],
  [240, 9, 48, 72],
];

function CelticCross({ id, caption }: { id: string; caption?: string }) {
  return (
    <Figure
      id={id}
      title="켈틱 크로스 열 자리"
      desc="왼쪽에 1번부터 6번까지 십자 모양으로 놓아요. 1번을 한가운데에, 2번을 그 위에 가로로 걸쳐 놓고, 3번은 위, 4번은 아래, 5번은 왼쪽, 6번은 오른쪽이에요. 오른쪽에는 7번부터 10번까지 아래에서 위로 한 줄로 쌓아요."
      viewBox="0 0 300 324"
      legend={
        <ol className={`${s.legend} ${s.legendNumbered}`} role="list">
          {CELTIC_CROSS_POSITIONS.map((name, i) => (
            <li key={name}>
              <span className={s.legendNumber}>{i + 1}</span>
              {name}
            </li>
          ))}
        </ol>
      }
      caption={caption}
    >
      {CELTIC_BOXES.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="5" className={i === 1 ? `${s.slot} ${s.slotAcross}` : s.slot} />
      ))}
      {CELTIC_BOXES.map(([x, y, w, h], i) => (
        // The 1st shows its number in the strip above the 2nd, which lies across its middle.
        <text key={i} x={x + w / 2} y={i === 0 ? y + 14 : y + h / 2 + 6} className={i === 0 ? `${s.slotNumber} ${s.slotNumberSmall}` : `${s.slotNumber} ${s.slotNumberMid}`}>
          {i + 1}
        </text>
      ))}
    </Figure>
  );
}

// ---- 대운: 10-year bands from the 대운수, yearly 세운 ticks inside (generic, no one's chart) ----

function Daewoon({ id, caption }: { id: string; caption?: string }) {
  const [start, band, axis] = [64, 72, 78];
  const bands = ["첫 대운", "둘째 대운", "셋째 대운"];
  const marks = ["대운수", "+10년", "+20년", "+30년"];
  return (
    <Figure
      id={id}
      title="대운과 세운"
      desc="첫 대운은 대운수의 나이에 시작되고, 그 뒤로 10년마다 다음 대운으로 바뀌어요. 대운 한 칸 안에서는 세운이 해마다 바뀌어요."
      viewBox="0 0 300 112"
      legend={
        <ul className={s.legend}>
          <li>칸 하나: 대운 10년</li>
          <li>눈금 하나: 세운 1년</li>
        </ul>
      }
      caption={caption}
    >
      <defs>
        <Arrow id={`${id}-on`} className={s.arrowSheng} />
      </defs>
      <line x1={14} y1={axis} x2={start} y2={axis} className={s.before} />
      <line x1={start} y1={axis} x2={294} y2={axis} className={s.flow} markerEnd={`url(#${id}-on)`} />
      <circle cx={14} cy={axis} r={4} className={s.birth} />
      {bands.map((name, i) => (
        <g key={name}>
          <rect x={start + band * i} y={axis - 30} width={band} height={30} className={i === 0 ? `${s.band} ${s.bandFirst}` : s.band} />
          <text x={start + band * i + band / 2} y={axis - 10} className={s.bandName}>
            {name}
          </text>
          {Array.from({ length: 10 }, (_, year) => {
            const x = round(start + band * i + (year + 0.5) * (band / 10));
            return <line key={year} data-tick="" x1={x} y1={axis} x2={x} y2={axis + 7} className={s.tick} />;
          })}
        </g>
      ))}
      <text x={14} y={axis + 26} className={`${s.mark} ${s.markStart}`}>
        0세
      </text>
      {marks.map((mark, i) => (
        <text key={mark} x={start + band * i} y={axis + 26} className={s.mark}>
          {mark}
        </text>
      ))}
    </Figure>
  );
}

export function GuideDiagram({ block, id }: { block: DiagramBlock; id: string }) {
  switch (block.name) {
    case "five-elements":
      return <FiveElements id={id} caption={block.caption} />;
    case "three-card":
      return <ThreeCard id={id} spread={block.spread} caption={block.caption} />;
    case "celtic-cross":
      return <CelticCross id={id} caption={block.caption} />;
    case "daewoon":
      return <Daewoon id={id} caption={block.caption} />;
  }
}
