import { gradeChartOf, type SajuChart } from "@starlog/core";
import Link from "next/link";
import { currentGradeYear, gradeForYear, yearName } from "@/lib/sajuGrade";
import s from "./GradeMini.module.css";

/**
 * 이 명식의 올해 등급 (spec 2026-11-11 B, 들어오는 곳 3): the free 명식's chart graded for the year now, computed here, and the
 * way to its card. No login; the chart never leaves the device.
 */
export function GradeMini({ chart }: { chart: SajuChart }) {
  const g = gradeForYear(gradeChartOf(chart), currentGradeYear());
  return (
    <Link href="/saju/grade" className={s.mini} data-grade={g.grade}>
      <span className={s.letter} aria-hidden="true">
        {g.grade}
      </span>
      <span className={s.text}>
        <span className={s.title}>
          이 명식의 올해 등급 <span className="sr-only">{g.grade}</span>
        </span>
        <span className={s.sub}>{`${yearName(g)} · ${g.nickname}`}</span>
        <span className={s.note}>로그인 없이 무료 · 정해진 규칙으로 계산해요</span>
      </span>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
    </Link>
  );
}
