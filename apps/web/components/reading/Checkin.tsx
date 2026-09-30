"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { CHECKIN_ANSWERS, type CheckinAnswer } from "@/lib/reading/types";
import s from "./Checkin.module.css";

type CheckinProps = {
  /** The reading's observation: what to look for in the days after it. */
  observation: string;
  onAnswer: (answer: CheckinAnswer) => void;
  /** Home: a link to the reading it comes from. */
  href?: string;
  /** e.g. "9월 28일 타로" */
  source?: string;
};

/**
 * 돌아보기: a few days after a reading, did its observation happen? One tap stores the answer with
 * the reading on this device (and future readings get it as history).
 */
export function Checkin({ observation, onAnswer, href, source }: CheckinProps) {
  const [answered, setAnswered] = useState<CheckinAnswer | null>(null);

  const answer = (value: CheckinAnswer) => {
    setAnswered(value);
    onAnswer(value);
  };

  return (
    <section className={s.card} aria-labelledby="checkin-title">
      <h2 id="checkin-title" className={s.eyebrow}>
        지난 풀이 돌아보기
        {source ? <span className={s.source}>{` · ${source}`}</span> : null}
      </h2>
      <p className={s.observation}>{observation}</p>
      {/* Answered: the choice stays in view as a calm line; the answers are gone. */}
      <div aria-live="polite">
        {answered ? (
          <p className={s.thanks}>{`“${answered}” 기록해 둘게요`}</p>
        ) : (
          <div className={s.answers}>
            {CHECKIN_ANSWERS.map((value) => (
              <Chip key={value} onClick={() => answer(value)}>
                {value}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {href ? (
        <Link href={href} className={s.link}>
          그 풀이 다시 보기
        </Link>
      ) : null}
    </section>
  );
}
