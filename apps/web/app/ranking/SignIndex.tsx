"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSTELLATIONS, type ConstellationDef, type SignId } from "@starlog/core";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { savedSunSign } from "@/lib/bonds/client";
import type { LeaderView } from "@/lib/bonds/service";
import s from "./SignIndex.module.css";

/** The sign's first and last day: ["3월 21일", "4월 19일"] (the last is the day before the next sign starts). */
export function signDateParts(sign: ConstellationDef): [string, string] {
  const index = CONSTELLATIONS.findIndex((c) => c.id === sign.id);
  const next = CONSTELLATIONS[(index + 1) % CONSTELLATIONS.length]!;
  // A non-leap year: the day before 3월 1일 would be 2월 28일.
  const end = new Date(Date.UTC(2001, next.from[0] - 1, next.from[1]) - 86_400_000);
  return [`${sign.from[0]}월 ${sign.from[1]}일`, `${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일`];
}

/** "3월 21일 ~ 4월 19일" */
export const signDates = (sign: ConstellationDef) => signDateParts(sign).join(" ~ ");

type SignIndexProps = {
  /** this week's top 3 per sign; null when they could not be read (cards without names) */
  leaders: Partial<Record<SignId, LeaderView[]>> | null;
};

/**
 * 별자리 리더보드: one card per sign with this week's 1·2·3 (nickname and 인연 total) and 전체 순위.
 * The device's own sun sign (remembered when 별자리 인연 was started here) is marked after load.
 */
export function SignIndex({ leaders }: SignIndexProps) {
  const [mine, setMine] = useState<SignId | null>(null);
  useEffect(() => setMine(savedSunSign()), []);
  return (
    <ul className={s.grid}>
      {CONSTELLATIONS.map((c) => {
        const top = leaders?.[c.id] ?? [];
        return (
          <li key={c.id} className={s.card} data-mine={c.id === mine ? "" : undefined} aria-labelledby={`sign-${c.id}`}>
            {c.id === mine ? <span className={s.badge}>내 별자리</span> : null}
            <div className={s.head}>
              <ConstellationArt sign={c.id} lit={c.slots} size={56} decorative className={s.art} />
              <div className={s.headText}>
                <h2 id={`sign-${c.id}`} className={s.name}>
                  {c.ko}
                </h2>
                <p className={s.dates}>
                  <span className={s.date}>{signDateParts(c)[0]}</span> ~ <span className={s.date}>{signDateParts(c)[1]}</span>
                </p>
              </div>
            </div>
            {leaders === null ? (
              <p className={s.empty}>지금은 순위를 불러오지 못했어요</p>
            ) : top.length ? (
              <ol className={s.top} aria-label={`${c.ko} 이번 주 1~3등`}>
                {top.map((row) => (
                  <li key={row.rank} className={s.row}>
                    <span className={s.medal} data-rank={row.rank}>
                      {row.rank}
                    </span>
                    <span className={s.nickname}>{row.nickname}</span>
                    <span className={s.total}>{row.total}점</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={s.emptyBox}>
                <p className={s.empty}>아직 완성한 별자리가 없어요</p>
                <Link href={`/bonds?sign=${c.id}`} className={s.inline}>
                  첫 번째가 되어 보세요
                </Link>
              </div>
            )}
            <Link href={`/ranking/${c.id}`} className={s.all} aria-label={`${c.ko} 전체 순위`}>
              전체 순위
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
