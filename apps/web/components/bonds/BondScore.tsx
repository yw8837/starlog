import { BOND_BASE, BOND_MAX, BOND_MIN, type BondPart } from "@starlog/core";
import s from "./BondScore.module.css";

/**
 * 인연 점수 한눈에 (owner 2026-10-23: "점수 직관적으로 보이게"): the score big, where it sits between 55 and 99, and a
 * table of what made it. Every number is bondScore's own (packages/core/src/bonds/score.ts): the base, each part's
 * points, their sum. Parts that take points off keep the calm words they were written in (the bond-score guide's
 * 읽는 법). No hooks: the owner page, the friend's result and the shared page all draw it.
 */

const ROWS = [
  { label: "일간끼리", ids: ["stem-combine", "stem-generate", "stem-same"] },
  { label: "띠끼리", ids: ["year-six", "year-three", "year-same", "year-clash", "year-wonjin"] },
  { label: "일지끼리", ids: ["day-six", "day-three", "day-clash"] },
  { label: "서로 채워 주는 오행", ids: ["fill-mine", "fill-theirs"] },
] as const;

const NONE = "이번에는 더하거나 빼는 관계가 없어요";

/** "+12", "−5" (a true minus sign), "0". */
export const signedPoints = (points: number) => (points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0");

/** Where a score sits on the 55–99 gauge, 0–100%. */
const gaugeAt = (score: number) => Math.round(((Math.min(BOND_MAX, Math.max(BOND_MIN, score)) - BOND_MIN) / (BOND_MAX - BOND_MIN)) * 100);

/** The big number and its 55–99 gauge. */
export function ScoreGauge({ score, label = "인연 점수", caption }: { score: number; label?: string; caption?: string }) {
  return (
    <div className={s.gaugeBlock}>
      <p className={s.big}>
        <span className={s.bigLabel}>{label}</span>
        <strong className={s.bigNumber}>{score}</strong>
        <span className={s.bigUnit}>점</span>
      </p>
      <div className={s.gauge} role="meter" aria-label={label} aria-valuemin={BOND_MIN} aria-valuemax={BOND_MAX} aria-valuenow={score} aria-valuetext={`${score}점`}>
        <span className={s.fill} style={{ width: `${gaugeAt(score)}%` }} />
      </div>
      <p className={s.ends} aria-hidden="true">
        <span>{BOND_MIN}</span>
        <span>{BOND_MAX}</span>
      </p>
      {caption ? <p className={s.caption}>{caption}</p> : null}
    </div>
  );
}

export function BondScore({ score, parts, caption }: { score: number; parts: readonly BondPart[]; caption?: string }) {
  const raw = BOND_BASE + parts.reduce((sum, part) => sum + part.points, 0);
  const note = parts.find((part) => part.id === "uncertain");
  return (
    <div className={s.score}>
      <ScoreGauge score={score} caption={caption} />
      <table className={s.table}>
        <caption className={s.tableCaption}>점수를 만든 항목</caption>
        <thead>
          <tr>
            <th scope="col">보는 것</th>
            <th scope="col">점수</th>
            <th scope="col">풀이</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">기본 점수</th>
            <td className={s.points}>{BOND_BASE}</td>
            <td>모든 계산은 {BOND_BASE}점에서 시작해요</td>
          </tr>
          {ROWS.map((row) => {
            const found = parts.filter((part) => (row.ids as readonly string[]).includes(part.id));
            const points = found.reduce((sum, part) => sum + part.points, 0);
            return (
              <tr key={row.label} data-sign={points > 0 ? "plus" : points < 0 ? "minus" : undefined}>
                <th scope="row">{row.label}</th>
                <td className={s.points}>{signedPoints(points)}</td>
                <td>{found.length ? found.map((part) => part.text).join(" · ") : NONE}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">합계</th>
            <td className={s.points} colSpan={2}>
              {score}점
            </td>
          </tr>
        </tfoot>
      </table>
      {raw !== score ? <p className={s.note}>{`더한 값은 ${raw}점이지만, 인연 점수는 ${BOND_MIN}점에서 ${BOND_MAX}점 사이로 매겨요`}</p> : null}
      {note ? <p className={s.note}>{note.text}</p> : null}
    </div>
  );
}

/**
 * A constellation's average and best score. `best: false` on a page others see: the best is one friend's own score,
 * which only the owner sees (privacy §4); the average follows from the total and the count, which are shown anyway.
 */
export function ConstellationStats({ scores, best = true }: { scores: readonly number[]; best?: boolean }) {
  if (scores.length === 0) return null;
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  return (
    <dl className={s.stats}>
      <div className={s.stat}>
        <dt>평균</dt>
        <dd>{average}점</dd>
      </div>
      {best ? (
        <div className={s.stat}>
          <dt>최고</dt>
          <dd>{Math.max(...scores)}점</dd>
        </div>
      ) : null}
    </dl>
  );
}
