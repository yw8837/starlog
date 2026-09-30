import Link from "next/link";
import s from "./Stepper.module.css";

type StepperProps = {
  /** 1-based step; omit for a plain back bar (e.g. the login page). */
  step?: number;
  total?: number;
  label: string;
  backHref: string;
  backLabel?: string;
};

/** Top bar for multi-step screens: back, step name, "1/3" and a segmented progress track. */
export function Stepper({ step, total = 3, label, backHref, backLabel = "뒤로 가기" }: StepperProps) {
  return (
    <header className={s.bar}>
      <div className={s.row}>
        <Link href={backHref} className={s.back} aria-label={backLabel}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M15 5.5 8.5 12l6.5 6.5" />
          </svg>
        </Link>
        <p className={s.title}>{label}</p>
        {step ? (
          <p className={s.count}>
            <span className={s.srOnly}>{`${total}단계 중 `}</span>
            {step}
            <span aria-hidden="true">/{total}</span>
            <span className={s.srOnly}>단계</span>
          </p>
        ) : (
          <span className={s.spacer} aria-hidden="true" />
        )}
      </div>
      {step ? (
        <div className={s.track} aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < step ? s.filled : undefined} />
          ))}
        </div>
      ) : null}
    </header>
  );
}
