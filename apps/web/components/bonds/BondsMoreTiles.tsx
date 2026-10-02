"use client";

import Link from "next/link";
import { useState } from "react";
import { getConstellation } from "@starlog/core";
import type { WeekTop } from "@/app/ranking/loadLeaders";
import { storedLuckyNumbers } from "@/lib/bonds/client";
import s from "./BondsMoreTiles.module.css";

type BondsMoreTilesProps = {
  /** this week's best constellation; null before any completion; undefined when it could not be read */
  weekTop?: WeekTop | null;
  className?: string;
};

/**
 * The rest of 별자리 인연 as two equal tiles (stacked on the narrowest phones), on the home row and on
 * /bonds' 더 보기: 별자리 인연 랭킹 with this week's best record, and 이번 주 행운 번호 with this device's
 * numbers once /lucky has shown them (else the way in).
 */
export function BondsMoreTiles({ weekTop, className }: BondsMoreTilesProps) {
  // Both callers mount the tiles only after their client-side fetch, so the device's storage is read on
  // the first render (no swap from the plain line to the numbers).
  const [numbers] = useState<number[] | null>(() => (typeof window === "undefined" ? null : storedLuckyNumbers()));

  const leader =
    weekTop === undefined
      ? "별자리마다 이번 주 1~3위"
      : weekTop === null
        ? "첫 1위에 도전해 보세요"
        : `이번 주 ${getConstellation(weekTop.sign).ko} 1위 ${weekTop.total}점`;

  return (
    <nav className={[s.tiles, className].filter(Boolean).join(" ")} aria-label="별자리 인연 더 보기">
      <Link href="/ranking" className={s.tile}>
        <TrophyIcon />
        <span className={s.text}>
          <span className={s.title}>별자리 인연 랭킹</span>
          <span className={s.sub}>{leader}</span>
        </span>
      </Link>
      <Link href="/lucky" className={s.tile}>
        <CloverIcon />
        <span className={s.text}>
          <span className={s.title}>이번 주 행운 번호</span>
          {numbers?.length ? (
            <span className={s.balls}>
              <span className="sr-only">내 번호 </span>
              {numbers.map((n, i) => (
                <span key={`${n}-${i}`} className={s.ball}>
                  {n}
                  {i < numbers.length - 1 ? <span className="sr-only">, </span> : null}
                </span>
              ))}
            </span>
          ) : (
            <span className={s.sub}>이번 주 내 번호 6개 보기</span>
          )}
        </span>
      </Link>
    </nav>
  );
}

/** A small gold cup on a step: the leaderboard. */
function TrophyIcon() {
  return (
    <span className={s.icon} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <defs>
          <linearGradient id="tile-cup" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff0b8" />
            <stop offset="0.45" stopColor="#f3c969" />
            <stop offset="1" stopColor="#b8862b" />
          </linearGradient>
        </defs>
        <path d="M9 5h14v5.5a7 7 0 0 1-14 0z" fill="url(#tile-cup)" />
        <path d="M9 7H5.5a3.5 3.5 0 0 0 3.8 5.4M23 7h3.5a3.5 3.5 0 0 1-3.8 5.4" fill="none" stroke="#f3c969" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.5 17h3v4h-3z" fill="#d9a948" />
        <path d="M10.5 21.5h11l1.5 5h-14z" fill="#8d7be8" />
        <path d="M12 7.5c0 2.6.8 4.6 2.2 5.8" fill="none" stroke="#fff7dc" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** A four-leaf clover: luck. */
function CloverIcon() {
  return (
    <span className={s.icon} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <g fill="#7fc8a9" stroke="#2f6e58" strokeWidth="0.8">
          <path d="M16 15c-1.6-4.8-7.6-6.2-8.2-2.4-.6 3.6 4.3 4.6 8.2 2.4z" />
          <path d="M16 15c-1.6-4.8-7.6-6.2-8.2-2.4-.6 3.6 4.3 4.6 8.2 2.4z" transform="rotate(90 16 15)" />
          <path d="M16 15c-1.6-4.8-7.6-6.2-8.2-2.4-.6 3.6 4.3 4.6 8.2 2.4z" transform="rotate(180 16 15)" />
          <path d="M16 15c-1.6-4.8-7.6-6.2-8.2-2.4-.6 3.6 4.3 4.6 8.2 2.4z" transform="rotate(270 16 15)" />
        </g>
        <path d="M16 15.5c.6 4 2.2 7.6 5 11" fill="none" stroke="#5fae8c" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="15" r="1.4" fill="#f3dca1" />
      </svg>
    </span>
  );
}
