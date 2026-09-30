import s from "./LockedToc.module.css";

type LockedTocProps = {
  items: string[];
  title?: string;
};

/** Headings of the paid reading, listed as they are (never faked or blurred text). */
export function LockedToc({ items, title = "이어지는 풀이" }: LockedTocProps) {
  return (
    <section className={s.toc} aria-labelledby="locked-toc-title">
      <h2 id="locked-toc-title" className={s.title}>
        {title}
      </h2>
      <ol className={s.list}>
        {items.map((item) => (
          <li key={item} className={s.item}>
            <svg className={s.lock} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
