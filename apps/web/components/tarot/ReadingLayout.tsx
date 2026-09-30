import type { ReactNode } from "react";
import s from "./ReadingLayout.module.css";

type ReadingLayoutProps = {
  head: ReactNode;
  spread: ReactNode;
  children: ReactNode;
};

/**
 * Phone: head, spread, reading in one column. Desktop (>=1024px): the spread sits in a sticky
 * left column with large cards; head and reading share a right column capped at 640px.
 */
export function ReadingLayout({ head, spread, children }: ReadingLayoutProps) {
  return (
    <div className={s.layout}>
      <div className={s.head}>{head}</div>
      <aside className={s.spread} aria-label="뽑은 카드">
        {spread}
      </aside>
      <div className={s.body}>{children}</div>
    </div>
  );
}
