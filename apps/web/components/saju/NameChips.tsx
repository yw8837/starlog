"use client";

import { sinsalOf, type SajuChart } from "@starlog/core";
import { useId, useState } from "react";
import { SAJU_NAMES_MAX, SAJU_NAMES_NONE, SAJU_NAMES_TITLE, SINSAL_MEANINGS, sinsalBasisLine } from "@/lib/sajuEnrichment";
import s from "./NameChips.module.css";

/**
 * 이 명식에 붙는 이름 (saju enrichment spec 2026-10-08 §5): the 살·귀인 names under the four pillars, free and code-built. A chip
 * opens its one-line meaning and where it was found, one at a time; with no name, one plain line says so.
 */
export function NameChips({ chart }: { chart: SajuChart }) {
  const id = useId();
  const found = sinsalOf(chart).slice(0, SAJU_NAMES_MAX);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className={s.box} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.title}>
        {SAJU_NAMES_TITLE}
      </h2>
      {found.length === 0 ? (
        <p className={s.none}>{SAJU_NAMES_NONE}</p>
      ) : (
        <>
          <ul className={s.chips}>
            {found.map((name, i) => (
              <li key={name.name}>
                <button type="button" className={s.chip} aria-expanded={open === i} aria-controls={`${id}-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                  {name.name}
                </button>
              </li>
            ))}
          </ul>
          {found.map((name, i) => (
            <div key={name.name} id={`${id}-${i}`} className={s.detail} hidden={open !== i}>
              <p className={s.meaning}>{`${SINSAL_MEANINGS[name.name]}이에요.`}</p>
              <p className={s.basis}>{`찾은 자리 · ${sinsalBasisLine(name)}`}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
