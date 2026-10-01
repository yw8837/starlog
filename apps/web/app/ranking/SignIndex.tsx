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
 * 별자리 리더보드: one card per sign. This week's 1위 gets the card's showpiece (the sign's figure fully
 * lit, the nickname and the 인연 total in large type); 2·3위 are listed beside it. A sign with no 1위 yet
 * shows its figure unlit with "첫 1위 자리". The device's own sun sign (remembered when 별자리 인연 was
 * started here) is marked after load.
 */
export function SignIndex({ leaders }: SignIndexProps) {
  const [mine, setMine] = useState<SignId | null>(null);
  useEffect(() => setMine(savedSunSign()), []);
  return (
    <ul className={s.grid}>
      {CONSTELLATIONS.map((c) => {
        const [first, ...rest] = leaders?.[c.id] ?? [];
        return (
          <li key={c.id} className={s.card} data-mine={c.id === mine ? "" : undefined} aria-labelledby={`sign-${c.id}`}>
            {c.id === mine ? <span className={s.badge}>내 별자리</span> : null}
            <div className={s.head}>
              <h2 id={`sign-${c.id}`} className={s.name}>
                {c.ko}
              </h2>
              <p className={s.dates}>
                <span className={s.date}>{signDateParts(c)[0]}</span> ~ <span className={s.date}>{signDateParts(c)[1]}</span>
              </p>
            </div>

            <div className={s.champ} data-champ={first ? "lit" : "empty"}>
              <ConstellationArt sign={c.id} lit={first ? c.slots : 0} size={96} decorative className={s.champArt} />
              {first ? (
                <p className={s.champText}>
                  <span className={s.crown}>
                    <span className="sr-only">이번 주 </span>1위
                  </span>
                  <span className={s.champName}>{first.nickname}</span>
                  <span className={s.champTotal}>
                    <span className="sr-only">인연 </span>
                    {first.total}
                    <small>점</small>
                  </span>
                </p>
              ) : leaders === null ? null : (
                <p className={s.champHint}>첫 1위 자리</p>
              )}
            </div>

            <div className={s.rest}>
              {leaders === null ? (
                <p className={s.empty}>지금은 순위를 불러오지 못했어요</p>
              ) : !first ? (
                <>
                  <p className={s.empty}>아직 완성한 별자리가 없어요</p>
                  <Link href={`/bonds?sign=${c.id}`} className={s.inline}>
                    첫 번째가 되어 보세요
                  </Link>
                </>
              ) : rest.length ? (
                <ol className={s.top} aria-label={`${c.ko} 이번 주 2·3위`}>
                  {rest.map((row) => (
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
                <p className={s.empty}>2위 자리는 아직 비어 있어요</p>
              )}
            </div>

            <Link href={`/ranking/${c.id}`} className={s.all} aria-label={`${c.ko} 전체 순위`}>
              전체 순위
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
