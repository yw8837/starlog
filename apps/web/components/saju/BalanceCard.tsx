import type { SajuChart, SajuElement } from "@starlog/core";
import { PLAIN_WORDS } from "@/lib/ai/plainWords";
import { ELEMENT_WORD, elementAxes, groupShares, type GroupShare } from "@/lib/sajuBalance";
import { ElementRadar } from "./ElementRadar";
import { TenGodDonut } from "./TenGodDonut";
import { ELEMENT_KEY } from "./elements";
import s from "./BalanceCard.module.css";

/** "나무(목)": the plain word, the element's name in brackets. */
const named = (element: SajuElement) => `${ELEMENT_WORD[element]}(${element})`;

/** What a group missing from the surface still has: a 지장간 that holds it, or nothing. */
function missingLine(g: GroupShare): string {
  const surface = g.group === "비겁" ? "나 말고는 겉 글자에 없고" : "겉 글자에는 없고";
  return `${surface}, ${g.hiddenOnly ? "글자 속(지장간)에 숨어 있어요." : "글자 속(지장간)에도 없어요."}`;
}

/**
 * 오행과 나의 힘 (owner 2026-10-23, after a competitor's 명식): how many visible glyphs each element has, as a radar, and
 * how the glyphs around the day master fall into the five ten-god groups, as a donut, with the 개운 line the 오행 bars
 * carried. Numbers only from lib/sajuBalance.ts (the readings' own); no 격국 or 신강·신약 label, which the engine does not
 * compute. 비율 자세히 보기 says how it was counted and what each group is, in plain words.
 */
export function BalanceCard({ chart, note }: { chart: SajuChart; note?: string }) {
  const axes = elementAxes(chart);
  const visible = axes.reduce((sum, a) => sum + a.count, 0);
  const { total, items } = groupShares(chart);
  const day = chart.dayMaster;

  return (
    <section className={s.card} aria-labelledby="balance-title">
      <div className={s.head}>
        <h2 id="balance-title" className={s.title}>
          오행과 나의 힘
        </h2>
        <p className={s.dayLabel}>{`일간 ${day.stem} · ${ELEMENT_WORD[day.element]}`}</p>
      </div>

      <div className={s.body}>
        <div className={s.charts}>
          <figure className={s.figure}>
            <figcaption className={s.caption}>
              <span className={s.captionTitle}>오행 · 글자 수</span>
              <span className={s.captionSub}>{`보이는 ${visible}글자`}</span>
            </figcaption>
            <ElementRadar axes={axes} total={visible} />
            <div className="sr-only">
              <table>
                <caption>오행 글자 수</caption>
                <thead>
                  <tr>
                    <th scope="col">오행</th>
                    <th scope="col">나와의 관계</th>
                    <th scope="col">글자 수</th>
                  </tr>
                </thead>
                <tbody>
                  {axes.map((a) => (
                    <tr key={a.element}>
                      <td>{named(a.element)}</td>
                      <td>{a.group}</td>
                      <td>{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>

          <figure className={s.figure}>
            <figcaption className={s.caption}>
              <span className={s.captionTitle}>십성 · 비율</span>
              <span className={s.captionSub}>{`나를 뺀 ${total}글자`}</span>
            </figcaption>
            <div className={s.donutBody}>
              <TenGodDonut items={items} total={total} />
              <ul className={s.legend} aria-hidden="true">
                {items.map((g) => (
                  <li key={g.group} className={s.legendRow} data-el={ELEMENT_KEY[g.element]} data-empty={g.count === 0 ? "" : undefined}>
                    <span className={s.legendDot} />
                    <span className={s.legendName}>{g.group}</span>
                    <span className={s.legendWord}>{g.word}</span>
                    <span className={s.legendPercent}>{`${g.percent}%`}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sr-only">
              <table>
                <caption>십성 비율</caption>
                <thead>
                  <tr>
                    <th scope="col">묶음</th>
                    <th scope="col">오행</th>
                    <th scope="col">글자 수</th>
                    <th scope="col">비율</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((g) => (
                    <tr key={g.group}>
                      <td>{g.group}</td>
                      <td>{named(g.element)}</td>
                      <td>{g.count}</td>
                      <td>{`${g.percent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        </div>

        {note ? <p className={s.note}>{note}</p> : null}

        <details className={s.more}>
          <summary className={s.summary}>
            <span>비율 자세히 보기</span>
            <svg className={s.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
            </svg>
          </summary>
          <div className={s.moreBody}>
            <p>
              {`오행 글자 수는 보이는 ${visible}글자를 나(일간)까지 넣어 셌고, 십성 비율은 나를 뺀 ${total}글자를 한 글자씩 같은 무게로 셌어요.`}
              {chart.pillars.hour ? "" : " 태어난 시를 몰라 시주는 빼고 셌어요."}
              {" 글자 속에 숨은 기운(지장간)은 숫자에 넣지 않았어요."}
            </p>
            <ul className={s.groups}>
              {items.map((g) => (
                <li key={g.group} className={s.group} data-el={ELEMENT_KEY[g.element]}>
                  <p className={s.groupHead}>
                    <span className={s.groupName}>{`${PLAIN_WORDS[g.group]}(${g.group})`}</span>
                    <span className={s.groupCount}>{`${g.word} · ${g.count}글자 · ${g.percent}%`}</span>
                  </p>
                  <p className={s.groupPlaces}>{g.count > 0 ? g.places.join(" · ") : missingLine(g)}</p>
                </li>
              ))}
            </ul>
            <p>많고 적음은 좋고 나쁨이 아니라 기운이 어느 쪽으로 기울었는지를 보여 줘요.</p>
          </div>
        </details>
      </div>
    </section>
  );
}
