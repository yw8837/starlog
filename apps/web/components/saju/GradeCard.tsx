import type { GradeLetter } from "@starlog/core";
import { Rabbit } from "@/components/characters/Rabbit";
import { SITE } from "@/lib/config";
import { gradeLine, yearName } from "@/lib/sajuGrade";
import s from "./GradeCard.module.css";

export interface GradeCardProps {
  year: number;
  /** "병오" */
  ko: string;
  grade: GradeLetter;
  nickname: string;
  /** the year in force now: 올해의 사주 등급, and the line says 올해 */
  thisYear: boolean;
  /** a tag on the card's corner: 예시, 친구 생일로 본 등급 */
  tag?: string;
  className?: string;
}

/**
 * 올해의 사주 등급, the card a screenshot keeps (spec 2026-11-11 B.2, A4): the year, the grade in a moon drawn in CSS (the only
 * thing that differs by grade, 확정 사항 5), its nickname, 사주주 in hanbok (the owner's art), the grade's line and the host.
 * Never the birth data, a score or a share.
 */
export function GradeCard({ year, ko, grade, nickname, thisYear, tag, className }: GradeCardProps) {
  return (
    <figure className={[s.card, className].filter(Boolean).join(" ")} data-grade={grade} aria-label={`${yearName({ year, ko })} 사주 등급 ${grade}, ${nickname}`}>
      {tag ? <span className={s.tag}>{tag}</span> : null}
      <p className={s.eyebrow}>{`${yearName({ year, ko })} · ${thisYear ? "올해의 사주 등급" : "사주 등급"}`}</p>
      <p className={s.grade}>
        <span className={s.moon} aria-hidden="true" />
        <span className="sr-only">등급 </span>
        <span className={s.letter}>{grade}</span>
      </p>
      <p className={s.nickname}>{nickname}</p>
      <div className={s.rabbit}>
        <Rabbit outfit="hanbok" size={120} reactOnTap={false} />
      </div>
      <figcaption className={s.line}>{gradeLine(grade, thisYear)}</figcaption>
      <p className={s.host}>{new URL(SITE.url).host}</p>
    </figure>
  );
}
