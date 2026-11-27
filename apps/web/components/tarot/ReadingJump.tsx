"use client";

import s from "./ReadingJump.module.css";

/**
 * 골라 읽기 (spec 2026-11-26 beyond trend §2): one row of links under the spread of an opened reading, each to a place in it
 * (components/tarot/ReadingArticle.tsx tarotAnchors, components/premium/DeepTarotArticle.tsx). Nothing is hidden or
 * reordered: the whole reading stays below. Plain in-page links in a list, so they work with a keyboard and without
 * script; a jump also moves focus to the place, so a screen reader reads on from there. Only the opened readings'
 * screens draw it (ChapterView, PremiumChapterView), never a teaser or a lock.
 */
export function ReadingJump({ items }: { items: ReadonlyArray<{ id: string; label: string; number?: number }> }) {
  if (items.length === 0) return null;
  const land = (id: string) => document.getElementById(id)?.focus({ preventScroll: true });
  return (
    <nav className={s.jump} aria-label="풀이 바로 가기">
      <ul className={s.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={s.link} onClick={() => land(item.id)}>
              {item.number !== undefined ? (
                <>
                  <span className={s.number}>{item.number}</span>{" "}
                </>
              ) : null}
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
