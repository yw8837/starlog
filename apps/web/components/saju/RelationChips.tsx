"use client";

import type { SajuChart } from "@starlog/core";
import { useId, useState } from "react";
import { RELATION_NONE, RELATION_NOT_EVENT, RELATION_TITLE, relationChips } from "@/lib/sajuRelationChips";
import names from "./NameChips.module.css";
import own from "./RelationChips.module.css";

const s = { ...names, ...own };

/**
 * 글자끼리 맺은 관계 (spec 2026-11-11 C13): the chart's 합 and 충 as chips, free and code-built, in the look of 이 명식에 붙는 이름
 * (NameChips). A chip opens where its glyphs stand and that it is not read as an event, one at a time.
 */
export function RelationChips({ chart }: { chart: Pick<SajuChart, "pillars"> }) {
  const id = useId();
  const chips = relationChips(chart);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className={s.box} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.title}>
        {RELATION_TITLE}
      </h2>
      {chips.length === 0 ? (
        <p className={s.none}>{RELATION_NONE}</p>
      ) : (
        <>
          <ul className={s.chips}>
            {chips.map((chip, i) => (
              <li key={`${chip.term}-${chip.places}`}>
                <button type="button" className={s.chip} aria-expanded={open === i} aria-controls={`${id}-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                  {`${chip.name}(${chip.term})`} <span className={s.chipPlace}>{chip.pillars}</span>
                </button>
              </li>
            ))}
          </ul>
          {chips.map((chip, i) => (
            <div key={`${chip.term}-${chip.places}`} id={`${id}-${i}`} className={s.detail} hidden={open !== i}>
              <p className={s.meaning}>{RELATION_NOT_EVENT}</p>
              <p className={s.basis}>{`자리 · ${chip.places}`}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
