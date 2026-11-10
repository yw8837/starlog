"use client";

import { gradeChartOf, type GradeLetter } from "@starlog/core";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { PremiumRows } from "@/components/premium/PremiumRows";
import { GradeCard } from "@/components/saju/GradeCard";
import { SajuFields } from "@/components/saju/SajuForm";
import { chartFor } from "@/components/saju/useSajuChart";
import { Button } from "@/components/ui/Button";
import { saveSajuProfile, useSajuProfile } from "@/lib/sajuFlow";
import { GRADE_CONSENT, GRADE_NICKNAME, compareLine, currentGradeYear, gradeForYear } from "@/lib/sajuGrade";
import s from "../grade.module.css";

const noSubscribe = () => () => {};

/** The shared card itself; 올해의 only on the device, at the time it is read (the page is built ahead). */
export function SharedGradeCard({ year, ko, grade }: { year: number; ko: string; grade: GradeLetter }) {
  const thisYear = useSyncExternalStore(noSubscribe, () => currentGradeYear() === year, () => false);
  return <GradeCard year={year} ko={ko} grade={grade} nickname={GRADE_NICKNAME[grade]} thisYear={thisYear} tag="친구의 등급" />;
}

/**
 * The visitor's way to their own card from a shared one (spec 2026-11-11 C): a profile on this device shows its grade for the
 * same year in one tap; without one, 내 등급 보기 goes to the fields on this page (#find). Either way the compare line comes
 * first ("친구 S · 나 B — 2028년엔 나도 S예요"), from the address's grade and the grade computed here; nothing is sent.
 */
export function GradeVisitor({ year, grade }: { year: number; grade: GradeLetter }) {
  const { profile } = useSajuProfile();
  const [shown, setShown] = useState(false);
  const result = useMemo(() => (profile ? chartFor(profile) : null), [profile]);
  if (profile === undefined) return <div className={s.placeholder} aria-hidden="true" style={{ minHeight: 56 }} />;

  const mine = result && "chart" in result ? gradeChartOf(result.chart) : null;
  if (mine && shown) {
    const own = gradeForYear(mine, year);
    return (
      <section className={s.view} aria-label="내 등급">
        <p className={s.compare}>{compareLine(grade, mine, year)}</p>
        <GradeCard year={own.year} ko={own.ko} grade={own.grade} nickname={own.nickname} thisYear={own.year === currentGradeYear()} tag="내 등급" />
        <Link href={`/saju/grade?y=${year}`} className={s.howLink}>
          내 등급 자세히 보기 →
        </Link>
        <PremiumRows ids={["match"]} title="둘 사이가 궁금하면" onlyOpen />
      </section>
    );
  }

  return (
    <>
      {mine ? (
        <Button block trailing="→" onClick={() => setShown(true)}>
          내 등급 보기
        </Button>
      ) : (
        <Button href="#find" block trailing="→">
          내 등급 보기
        </Button>
      )}
      {profile ? null : (
        <section id="find" className={s.find} aria-labelledby="grade-find-title">
          <h2 id="grade-find-title" className={s.blockTitle}>
            내 등급 찾기
          </h2>
          <p className={s.prose}>생일은 이 기기에서만 계산해요. 동의하면 이 기기에만 저장되고, 주소나 서버로 보내지 않아요.</p>
          <SajuFields
            initial={null}
            chips={false}
            consentLabel={GRADE_CONSENT}
            submitLabel="내 등급 보기"
            onDone={(form) => {
              saveSajuProfile(form);
              setShown(true);
            }}
          />
        </section>
      )}
    </>
  );
}
