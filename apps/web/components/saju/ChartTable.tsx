import { branchElement, stemElement, type Pillar, type SajuChart } from "@starlog/core";
import { ELEMENT_HANJA, ELEMENT_KEY } from "./elements";
import s from "./ChartTable.module.css";

type ChartTableProps = {
  chart: SajuChart;
  /** Heading shown above the table. */
  title?: string;
};

type PillarKey = keyof SajuChart["pillars"];

// Traditional order: read right to left, so the hour pillar sits on the left and the year on the right.
const COLUMNS: ReadonlyArray<{ key: PillarKey; label: string }> = [
  { key: "hour", label: "시주" },
  { key: "day", label: "일주" },
  { key: "month", label: "월주" },
  { key: "year", label: "연주" },
];

function Glyph({ char, ko, element, row, isDayMaster }: { char: string; ko: string; element: ReturnType<typeof stemElement>; row: "천간" | "지지"; isDayMaster?: boolean }) {
  return (
    <span className={isDayMaster ? `${s.tile} ${s.dayMaster}` : s.tile} data-el={ELEMENT_KEY[element]}>
      <span className={s.srOnly}>{`${row} `}</span>
      <span className={s.hanja}>{char}</span>
      <span className={s.ko}>{ko}</span>
      <span className={s.srOnly}>{`, ${element}(${ELEMENT_HANJA[element]})`}</span>
    </span>
  );
}

function StemCell({ pillar, isDay }: { pillar: Pillar; isDay: boolean }) {
  return (
    <td className={isDay ? `${s.cell} ${s.dayCell}` : s.cell}>
      <span className={isDay ? `${s.god} ${s.godDay}` : s.god}>{isDay ? "일간 · 나" : pillar.stemGod}</span>
      <Glyph char={pillar.stem} ko={pillar.ko.charAt(0)} element={stemElement(pillar.stem)} row="천간" isDayMaster={isDay} />
    </td>
  );
}

function BranchCell({ pillar, isDay }: { pillar: Pillar; isDay: boolean }) {
  return (
    <td className={isDay ? `${s.cell} ${s.dayCell}` : s.cell}>
      <Glyph char={pillar.branch} ko={pillar.ko.charAt(1)} element={branchElement(pillar.branch)} row="지지" />
      <span className={s.god}>{pillar.branchGod}</span>
    </td>
  );
}

/**
 * The four pillars as a real table: hanja large, hangul small, ten-god labels above the stems and
 * below the branches. An unknown hour shows one "모름" slot instead of invented glyphs.
 */
export function ChartTable({ chart, title = "명식" }: ChartTableProps) {
  const { pillars, dayMaster } = chart;
  const day = pillars.day;

  return (
    <section className={s.chart} aria-labelledby="chart-title">
      <h2 id="chart-title" className={s.title}>
        {title}
      </h2>
      <table className={s.table}>
        <caption className={s.srOnly}>사주 명식, 왼쪽부터 시주·일주·월주·연주</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.key === "day" ? `${s.head} ${s.headDay}` : s.head}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COLUMNS.map(({ key }) => {
              const pillar = pillars[key];
              if (!pillar) {
                return (
                  <td key={key} rowSpan={2} className={`${s.cell} ${s.unknownCell}`}>
                    <span className={s.unknown}>
                      <span className={s.unknownText}>모름</span>
                    </span>
                  </td>
                );
              }
              return <StemCell key={key} pillar={pillar} isDay={key === "day"} />;
            })}
          </tr>
          <tr>
            {COLUMNS.map(({ key }) => {
              const pillar = pillars[key];
              return pillar ? <BranchCell key={key} pillar={pillar} isDay={key === "day"} /> : null;
            })}
          </tr>
        </tbody>
      </table>

      <dl className={s.summary}>
        <div className={s.fact}>
          <dt>일주</dt>
          <dd>
            <span className={s.factHanja}>{day.stem + day.branch}</span>
            {day.ko}
          </dd>
        </div>
        <div className={s.fact}>
          <dt>일간</dt>
          <dd>
            <span className={s.factHanja}>{dayMaster.stem}</span>
            {dayMaster.ko}
          </dd>
        </div>
      </dl>
    </section>
  );
}
