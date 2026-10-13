"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import s from "./Feedback.module.css";

const SCALE = [1, 2, 3, 4, 5] as const;

/** Five stars as a radio group (arrow keys move and choose); 0 is none chosen yet. */
export function StarRating({ value, onChange, labelledBy }: { value: number; onChange: (score: number) => void; labelledBy: string }) {
  const stars = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, n: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, n + step));
    onChange(next);
    stars.current[next - 1]?.focus();
  };

  return (
    <div className={s.stars} role="radiogroup" aria-labelledby={labelledBy}>
      {SCALE.map((n) => (
        <button
          key={n}
          ref={(el) => {
            stars.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`5점 중 ${n}점`}
          tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
          className={n <= value ? `${s.star} ${s.on}` : s.star}
          onClick={() => onChange(n)}
          onKeyDown={(e) => onKeyDown(e, n)}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.3 6.4L12 16.9l-5.6 3.2 1.3-6.4-4.8-4.3 6.4-.7z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** One-tap "how much did this land" rating: five stars, no emoji. Kept on the screen only (the demo, device-only readings). */
export function Feedback() {
  const [score, setScore] = useState(0);
  return (
    <section className={s.feedback} aria-labelledby="feedback-title">
      <h2 id="feedback-title" className={s.title}>
        이 풀이, 얼마나 와닿았나요?
      </h2>
      <StarRating value={score} onChange={setScore} labelledBy="feedback-title" />
      <p className={s.thanks} aria-live="polite">
        {score ? "알려 줘서 고마워요" : ""}
      </p>
    </section>
  );
}
