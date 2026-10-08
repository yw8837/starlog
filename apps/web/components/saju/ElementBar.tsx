import type { SajuElement } from "@starlog/core";
import { ELEMENT_HANJA, ELEMENT_KEY, ELEMENT_ORDER } from "./elements";
import s from "./ElementBar.module.css";

type ElementBarProps = {
  elements: Record<SajuElement, number>;
  /** One line under the bars (the chart page's 개운 line). */
  note?: string;
};

/** How many of the visible glyphs (6 or 8) fall in each element, one dot per glyph. */
export function ElementBar({ elements, note }: ElementBarProps) {
  const total = ELEMENT_ORDER.reduce((sum, el) => sum + elements[el], 0);

  return (
    <section className={s.box} aria-labelledby="elements-title">
      <div className={s.head}>
        <h2 id="elements-title" className={s.title}>
          오행
        </h2>
        <p className={s.basis}>{`보이는 ${total}글자 기준`}</p>
      </div>
      <ul className={s.list}>
        {ELEMENT_ORDER.map((el) => {
          const count = elements[el];
          return (
            <li key={el} className={s.row} data-el={ELEMENT_KEY[el]} data-empty={count === 0 ? "" : undefined}>
              <span className={s.name}>
                <span className={s.hanja} aria-hidden="true">
                  {ELEMENT_HANJA[el]}
                </span>
                {el}
              </span>
              <span className={s.dots} aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={i < count ? s.on : s.off} />
                ))}
              </span>
              <span className={s.count}>
                {count}
                <span className="sr-only">개</span>
              </span>
            </li>
          );
        })}
      </ul>
      {note ? <p className={s.note}>{note}</p> : null}
    </section>
  );
}
