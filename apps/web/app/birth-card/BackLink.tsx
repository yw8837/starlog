import Link from "next/link";
import s from "./birthCard.module.css";

/** The top-left back chevron, as on 지금의 한 장. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <header className={s.top}>
      <Link href={href} className={s.back} aria-label={label}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M15 5.5 8.5 12l6.5 6.5" />
        </svg>
      </Link>
    </header>
  );
}
