import { Paper } from "@/components/tarot/Paper";
import r from "@/components/tarot/ReadingArticle.module.css";
import type { NewYearReadingData } from "@/lib/reading/types";
import { ProseSection } from "./DeepTarotArticle";

/**
 * The paid 2027 reading in its order: the year and the chart, the 10-year luck, the four areas, the
 * light helps, the twelve months (headings by code: "3월 · 계묘월 (6일 경칩부터)"), how to spend the
 * year and the first month's signal. The page's title is "2027년, <title>".
 */
export function NewYearArticle({ reading }: { reading: NewYearReadingData }) {
  const areas = [reading.areas.work, reading.areas.money, reading.areas.relations, reading.areas.health];
  return (
    <div className={r.article}>
      {[reading.overview, reading.luck].map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} />
        </Paper>
      ))}
      <Paper>
        <h2 className={r.heading}>{reading.areas.heading}</h2>
        {areas.map((section) => (
          <ProseSection key={section.heading} section={section} level={3} />
        ))}
      </Paper>
      <Paper>
        <ProseSection section={reading.lucky} />
      </Paper>
      {reading.months.map((month) => (
        <Paper key={month.month} as="article">
          <ProseSection section={month} />
        </Paper>
      ))}
      {[reading.closing, reading.observation].map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} />
        </Paper>
      ))}
    </div>
  );
}
