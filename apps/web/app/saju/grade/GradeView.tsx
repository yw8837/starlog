"use client";

import { gradeChartOf, SAJU_GRADE_RULE, type GradeChart, type SajuChart } from "@starlog/core";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PremiumRows } from "@/components/premium/PremiumRows";
import { GradeCard } from "@/components/saju/GradeCard";
import { SajuFields } from "@/components/saju/SajuForm";
import { chartFor } from "@/components/saju/useSajuChart";
import { Button } from "@/components/ui/Button";
import { useAccount } from "@/lib/account/client";
import { SITE, sajuGradeMode, won } from "@/lib/config";
import { ENTRY_SAJU_HREF } from "@/lib/freshStart";
import { saveSajuProfile, useSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, type SajuForm } from "@/lib/sajuForm";
import {
  GRADE_FIXED_LINE, GRADE_NOTICE, boundaryNotice, currentGradeYear, gradeChips, gradeObservations, gradePercentile, nextBrightLine, type GradePercentile,
} from "@/lib/sajuGrade";
import s from "./grade.module.css";

/** The 1,900원 풀이's sections (spec D), shown locked while it is not on sale. */
export const GRADE_REASON_TITLES = ["가장 크게 힘이 된 것", "아직 덜 채워진 칸", "언제, 무엇이 달라지나", "올해 이렇게 써 보기", "확인해 볼 신호"] as const;

export const GRADE_CONSENT = "출생 정보를 등급 계산에 쓰는 데 동의해요";

type Kind = "own" | "friend" | "example";

const EXAMPLE_NOTE = `${DEFAULT_SAJU_FORM.year}년 ${DEFAULT_SAJU_FORM.month}월 ${DEFAULT_SAJU_FORM.day}일생(시 모름)으로 계산한 예시예요. 아래에 내 생일을 넣으면 내 등급이 나와요.`;

/** ?y= when it names one of the ten chips from this year, else this year. */
function yearFromAddress(thisYear: number): number {
  if (typeof window === "undefined") return thisYear;
  const y = Number(new URLSearchParams(window.location.search).get("y"));
  return Number.isInteger(y) && y >= thisYear && y < thisYear + 10 ? y : thisYear;
}

/**
 * /saju/grade (spec 2026-11-11 B, E): the grade card for the profile saved on this device, computed here in the browser (nothing
 * about the birth leaves it; the address carries ?y= at most). Without a profile the example (DEFAULT_SAJU_FORM, 예시) shows
 * first and the fields follow (#find); a friend's birth is shown from component state only, never saved.
 */
export function GradeView() {
  const { profile } = useSajuProfile();
  const thisYear = useMemo(() => currentGradeYear(), []);
  const [year, setYear] = useState(() => yearFromAddress(thisYear));
  const [friend, setFriend] = useState<SajuForm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => (profile === undefined ? null : chartFor(friend ?? profile ?? DEFAULT_SAJU_FORM)), [profile, friend]);

  if (profile === undefined || result === null) return <div className={s.placeholder} aria-hidden="true" />;

  const kind: Kind = friend ? "friend" : profile ? "own" : "example";
  const toTop = () => requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));

  const pickYear = (y: number) => {
    setYear(y);
    window.history.replaceState(null, "", `?y=${y}`);
  };

  const fields = (
    <section id="find" className={s.find} aria-labelledby="grade-find-title">
      {kind === "example" ? (
        <>
          <h2 id="grade-find-title" className={s.blockTitle}>
            내 등급 보기
          </h2>
          <p className={s.prose}>생일은 이 기기에서만 계산해요. 동의하면 이 기기에만 저장되고, 주소나 서버로 보내지 않아요.</p>
          <SajuFields
            initial={null}
            chips={false}
            consentLabel={GRADE_CONSENT}
            submitLabel="내 등급 보기"
            onDone={(next) => {
              saveSajuProfile(next);
              toTop();
            }}
          />
        </>
      ) : formOpen ? (
        <>
          <h2 id="grade-find-title" className={s.blockTitle}>
            친구 생일로 해 보기
          </h2>
          <p className={s.prose}>친구 생일은 이 화면에서만 계산하고 저장하지 않아요.</p>
          <SajuFields
            initial={null}
            chips={false}
            consentLabel={GRADE_CONSENT}
            submitLabel="친구 등급 보기"
            onDone={(next) => {
              setFriend(next);
              setFormOpen(false);
              toTop();
            }}
          />
        </>
      ) : (
        <Button variant="secondary" block onClick={() => setFormOpen(true)}>
          친구 생일로 해 보기
        </Button>
      )}
    </section>
  );

  if (!("chart" in result)) {
    return (
      <div className={s.view}>
        <p className={s.failed} role="alert">
          {result.error.message}
        </p>
        {fields}
      </div>
    );
  }

  return (
    <div className={s.view}>
      <div ref={topRef} />
      {/* the example's fields come right under its card: the visitor's own birth is the next step */}
      <GradeResult chart={result.chart} kind={kind} year={year} thisYear={thisYear} onYear={pickYear} afterCard={kind === "example" ? fields : null} />
      {kind === "friend" ? (
        <Button variant="secondary" block onClick={() => setFriend(null)}>
          내 등급으로 돌아가기
        </Button>
      ) : null}
      {kind === "example" ? null : fields}
      <NextReadings own={kind === "own"} />
      <p className={s.notice}>{GRADE_NOTICE}</p>
    </div>
  );
}

function GradeResult({
  chart, kind, year, thisYear, onYear, afterCard,
}: { chart: SajuChart; kind: Kind; year: number; thisYear: number; onYear: (y: number) => void; afterCard: ReactNode }) {
  const gc = useMemo(() => gradeChartOf(chart), [chart]);
  const chips = useMemo(() => gradeChips(gc, thisYear), [gc, thisYear]);
  const shown = chips.find((c) => c.year === year) ?? chips[0]!;
  const observations = gradeObservations(gc, shown.year);
  const boundary = boundaryNotice(chart, shown.year);
  const tag = kind === "example" ? "예시" : kind === "friend" ? "친구 생일로 본 등급" : undefined;
  return (
    <>
      <GradeCard year={shown.year} ko={shown.ko} grade={shown.grade} nickname={shown.nickname} thisYear={shown.year === thisYear} tag={tag} />
      {kind === "example" ? <p className={s.exampleNote}>{EXAMPLE_NOTE}</p> : null}
      <p className={s.fixed}>{GRADE_FIXED_LINE}</p>
      {afterCard}

      <div className={s.chips} role="group" aria-label="10년 등급">
        {chips.map((chip) => (
          <button key={chip.year} type="button" className={s.chip} aria-pressed={chip.year === shown.year} aria-label={`${chip.year} ${chip.ko} ${chip.grade}`} onClick={() => onYear(chip.year)}>
            <span className={s.chipYear}>{chip.year}</span>
            <span className={s.chipKo}>{chip.ko}</span>
            <span className={s.chipGrade}>{chip.grade}</span>
          </button>
        ))}
      </div>

      <section className={s.block} aria-labelledby="grade-why-title">
        <h2 id="grade-why-title" className={s.blockTitle}>
          규칙으로 본 세 가지
        </h2>
        <ul className={s.observations}>
          {observations.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li className={s.next}>{nextBrightLine(gc, shown.year)}</li>
        </ul>
        {boundary ? <p className={s.boundary}>{boundary.message}</p> : null}
      </section>

      {/* the 1,900원 풀이 reads one's own chart: never offered on the example or a friend's */}
      {kind === "own" ? <LockedReasons /> : null}
      <HowItWorks gc={gc} year={shown.year} />
    </>
  );
}

/** 이 등급인 이유 (spec B.7): only with NEXT_PUBLIC_SAJU_GRADE on (or owner, on the owner pass); not on sale yet, so 곧 열려요. */
function LockedReasons() {
  const mode = sajuGradeMode();
  if (mode === "off") return null;
  return mode === "owner" ? <OwnerOnly /> : <ReasonsBlock />;
}

function OwnerOnly() {
  const account = useAccount();
  return account?.owner ? <ReasonsBlock /> : null;
}

function ReasonsBlock() {
  return (
    <section className={s.locked} aria-labelledby="grade-reasons-title">
      <h2 id="grade-reasons-title" className={s.blockTitle}>
        이 등급인 이유 · 5개 중 0개 공개
      </h2>
      <ul className={s.lockList}>
        {GRADE_REASON_TITLES.map((title) => (
          <li key={title}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span>{title}</span>
          </li>
        ))}
      </ul>
      <p className={s.lockScope}>내 명식에 맞춘 풀이 · 1,900원 예정</p>
      <p className={s.soon}>곧 열려요</p>
    </section>
  );
}

/** 등급은 어떻게 나와요? (spec A6, B.8): the rule in short; the 상위 % is loaded (dynamic import) only when opened. */
function HowItWorks({ gc, year }: { gc: GradeChart; year: number }) {
  const [open, setOpen] = useState(false);
  const [percentile, setPercentile] = useState<{ key: string; value: GradePercentile | null } | null>(null);
  const key = `${gc.stems.join("")}${gc.branches.join("")}-${year}`;
  useEffect(() => {
    if (!open || percentile?.key === key) return;
    let live = true;
    gradePercentile(gc, year).then(
      (value) => live && setPercentile({ key, value }),
      () => live && setPercentile({ key, value: null }),
    );
    return () => {
      live = false;
    };
  }, [open, key, gc, year, percentile?.key]);
  const current = percentile?.key === key ? percentile : null;
  return (
    <details className={s.how} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={s.howSummary}>등급은 어떻게 나와요?</summary>
      <div className={s.howBody}>
        <p>AI가 아니라 정해진 규칙으로 계산해요. 보이는 글자 여덟 개(시를 모르면 여섯 개)의 오행과 그해 들어오는 세운 두 글자만 봐요.</p>
        <p>
          다섯 기운이 얼마나 고르게 퍼졌는지(고르기), 이웃한 글자끼리 서로 살려 주는 사이인지(흐름), 그리고 내 명식이 만나는 60가지 해 가운데 그해 세운이 빈칸을 얼마나 채우는지(올해 순위)를 18 : 12 : 70의 무게로 더해요. 같은 해의 가능한 조합을 모두 같은 방식으로 계산해서 위에서 8%까지 S, 30%까지 A, 70%까지 B, 나머지는 C예요.
        </p>
        <p aria-live="polite">{current ? (current.value ? current.value.text : "순위 표를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.") : open ? "순위를 계산하고 있어요." : ""}</p>
        <p>{`판 번호 ${SAJU_GRADE_RULE.id} · ${SAJU_GRADE_RULE.date}. 같은 입력이면 언제나 같은 결과예요.`}</p>
        <p>
          <Link href="/saju/grade/how" className={s.howLink}>
            규칙 전체 보기 →
          </Link>
        </p>
      </div>
    </details>
  );
}

/** 다음 풀이 (spec B.9): products on sale only, below and apart from the card; the set only while it sells (PremiumRows). */
function NextReadings({ own }: { own: boolean }) {
  return (
    <section className={s.block} aria-labelledby="grade-next-title">
      <h2 id="grade-next-title" className={s.blockTitle}>
        다음 풀이
      </h2>
      <Link href={own ? "/saju/chart" : ENTRY_SAJU_HREF} className={s.row}>
        <span className={s.rowHead}>
          <strong>사주 전체 풀이</strong>
          <span className={s.price}>{won(SITE.price.sajuStandardKrw)}</span>
        </span>
        <span className={s.rowLine}>타고난 결과 지금 지나는 10년의 흐름(대운)을 내 명식으로 풀어요</span>
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
      </Link>
      <PremiumRows ids={["newyear-2027", "match"]} title="더 깊게 보는 풀이" onlyOpen withSet />
    </section>
  );
}
