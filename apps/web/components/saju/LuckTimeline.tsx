"use client";

import { branchElement, stemElement, type SajuChart } from "@starlog/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { annualView, luckView } from "@/lib/sajuLuckView";
import { ELEMENT_KEY } from "./elements";
import s from "./LuckTimeline.module.css";

type View = "daewoon" | "seun";
const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: "daewoon", label: "대운 · 10년" },
  { value: "seun", label: "세운 · 1년" },
];

/** A 간지 as two small tiles in their elements' colours, its hangul under them. */
function Ganzhi({ gz, ko }: { gz: string; ko: string }) {
  const stem = gz.charAt(0);
  const branch = gz.charAt(1);
  return (
    <>
      <span className={s.tiles}>
        <span className={s.tile} data-el={ELEMENT_KEY[stemElement(stem)]}>
          {stem}
        </span>
        <span className={s.tile} data-el={ELEMENT_KEY[branchElement(branch)]}>
          {branch}
        </span>
      </span>
      <span className={s.ko}>{ko}</span>
    </>
  );
}

function Gods({ stemGod, branchGod }: { stemGod: string; branchGod: string }) {
  return (
    <span className={s.gods}>
      <span>
        <span className="sr-only">천간 </span>
        {stemGod}
      </span>
      <span>
        <span className="sr-only">지지 </span>
        {branchGod}
      </span>
    </span>
  );
}

const NOW_BADGE = (
  <span className={s.badge} aria-hidden="true">
    지금
  </span>
);

/**
 * 대운과 세운: every 대운 the engine gives as a row of cards (the current one marked 지금 and scrolled into view) and the
 * 세운 in force with the two years after it, behind one toggle. Dates, the current cycle and the year are the readings'
 * (lib/sajuLuckView.ts); the labels under the glyphs are ten gods only, no reading of what a cycle brings. `now` waits for
 * the browser's clock (null: nothing shown), so a page rendered elsewhere never shows another day's cycle.
 */
export function LuckTimeline({ chart, now: fixedNow }: { chart: SajuChart; now?: number | null }) {
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => {
    if (fixedNow === undefined) setClock(Date.now());
  }, [fixedNow]);
  const now = fixedNow === undefined ? clock : fixedNow;
  const [view, setView] = useState<View>("daewoon");
  const luck = useMemo(() => (now === null ? null : luckView(chart, now)), [chart, now]);
  const years = useMemo(() => (now === null ? [] : annualView(chart, now)), [chart, now]);
  const shown: View = luck ? view : "seun";

  // The current 대운 in the middle of its row, without moving the page.
  const row = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = row.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && current) list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [luck, shown]);

  if (now === null) return null;

  return (
    <section className={s.box} aria-labelledby="luck-title">
      <h2 id="luck-title" className={s.title}>
        대운과 세운
      </h2>
      <p className={s.lead}>대운은 10년마다, 세운은 한 해마다 바뀌는 흐름이에요. 글자 아래는 나와의 관계 이름(십성)이에요.</p>
      {luck ? (
        <Segmented<View> label="대운과 세운 보기" options={VIEWS} value={shown} onChange={setView} />
      ) : (
        <p className={s.note}>태어난 해나 달의 기둥이 확실하지 않아 대운은 세우지 않았어요.</p>
      )}

      {luck && shown === "daewoon" ? (
        <>
          <ol ref={row} className={s.row} aria-label="대운, 10년마다">
            {luck.cycles.map((c) => (
              <li key={c.gz} className={c.current ? `${s.card} ${s.current}` : s.card} aria-current={c.current ? "true" : undefined}>
                {c.current ? NOW_BADGE : null}
                <span className={s.when}>
                  {c.from ? `${luck.approximate ? "약 " : ""}${c.from.getUTCFullYear()}.${c.from.getUTCMonth() + 1}~` : "시기 모름"}
                </span>
                {c.startAge !== null ? <span className={s.age}>{`만 ${c.startAge}세`}</span> : null}
                <Ganzhi gz={c.gz} ko={c.ko} />
                <Gods stemGod={c.stemGod} branchGod={c.branchGod} />
                {c.current ? <span className="sr-only">, 지금 대운</span> : null}
              </li>
            ))}
          </ol>
          {luck.approximate ? <p className={s.note}>태어난 시를 몰라 대운이 바뀌는 때는 앞뒤로 몇 달 달라질 수 있어요.</p> : null}
        </>
      ) : (
        <ol className={`${s.row} ${s.years}`} aria-label="세운, 한 해마다">
          {years.map((y) => (
            <li key={y.year} className={y.current ? `${s.card} ${s.current}` : s.card} aria-current={y.current ? "true" : undefined}>
              {y.current ? NOW_BADGE : null}
              <span className={s.when}>{`${y.year}년`}</span>
              <Ganzhi gz={y.gz} ko={y.ko} />
              <Gods stemGod={y.stemGod} branchGod={y.branchGod} />
              {y.current ? <span className="sr-only">, 지금 세운</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
