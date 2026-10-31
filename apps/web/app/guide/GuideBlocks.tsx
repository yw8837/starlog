import { getCard } from "@starlog/core";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { GuideBlock, GuideCalloutTone } from "@/lib/guideMeta";
import { GuideDiagram } from "./GuideDiagram";
import { GuideText } from "./GuideText";
import s from "./GuideBlocks.module.css";

/**
 * A guide section's rich blocks, after its body paragraph (app/guide/[slug]/page.tsx). Server-rendered
 * on the cream paper; `id` is unique per section and keeps the ids inside each block unique.
 */

const TONE_LABEL: Record<GuideCalloutTone, string> = { tip: "도움말", note: "참고", caution: "주의" };

/** A column with a cell longer than this wraps; shorter columns keep each cell on one line. */
const LONG_CELL = 12;
/** On a phone only columns this short stay on one line ("수(水)", "완드"); the rest wrap at word breaks. */
const TIGHT_CELL = 5;

function Block({ block, id }: { block: GuideBlock; id: string }) {
  switch (block.kind) {
    case "p":
      return (
        <p className={`${s.block} ${s.p}`}>
          <GuideText text={block.text} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={`${s.block} ${s.list}`}>
          {block.items.map((item) => (
            <li key={item}>
              <GuideText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "table": {
      // Short cells stay on one line (a column of "수(水)" never breaks into two); long ones wrap, headers and the first
      // column too (2026-10-31: headers that never wrapped pushed 49 of 141 tables past a 375px phone). Still wider than
      // the paper (a ten-column grid), the table scrolls sideways in its own box (focusable for the keyboard).
      const widest = block.head.map((head, column) => Math.max(head.length, ...block.rows.map((row) => (row[column] ?? "").length)));
      const wraps = widest.map((length) => length > LONG_CELL);
      // On a phone three short columns side by side still overflow: there only the tightest stay on one line.
      const keep = (column: number) => (wraps[column] ? undefined : widest[column]! <= TIGHT_CELL ? `${s.nowrap} ${s.tight}` : s.nowrap);
      return (
        <div className={`${s.block} ${s.tableWrap}`} role="region" aria-labelledby={`${id}-caption`} tabIndex={0}>
          <table className={s.table}>
            <caption id={`${id}-caption`} className={s.tableCaption}>
              {block.caption}
            </caption>
            <thead>
              <tr>
                {block.head.map((cell, column) => (
                  <th key={cell} scope="col" className={keep(column)}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map(([first, ...rest], r) => (
                <tr key={r}>
                  <th scope="row" className={keep(0)}>
                    {first}
                  </th>
                  {rest.map((cell, i) => (
                    <td key={i} className={keep(i + 1)}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "figure":
      return (
        <figure className={`${s.block} ${s.figure}`}>
          <img
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            className={block.height > block.width ? `${s.image} ${s.imagePortrait}` : s.image}
          />
          {block.caption ? <figcaption className={s.caption}>{block.caption}</figcaption> : null}
        </figure>
      );
    case "callout":
      return (
        <div className={`${s.block} ${s.callout}`} data-tone={block.tone} role="note">
          <p className={s.calloutTitle}>
            <span className={s.calloutTone}>{TONE_LABEL[block.tone]}</span>
            {block.title}
          </p>
          <p className={s.calloutText}>
            <GuideText text={block.text} />
          </p>
        </div>
      );
    case "steps":
      // list-style none drops list semantics in Safari; role="list" keeps them.
      return (
        <ol className={`${s.block} ${s.steps}`} role="list">
          {block.items.map((step, i) => (
            <li key={step.title} className={s.step}>
              <span className={s.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <p className={s.stepTitle}>{step.title}</p>
              <p className={s.stepText}>
                <GuideText text={step.text} />
              </p>
            </li>
          ))}
        </ol>
      );
    case "cardRow":
      return (
        <figure className={`${s.block} ${s.cardRow}`}>
          <ul className={s.cards}>
            {block.cards.map((cardId) => (
              <li key={cardId} className={s.cardItem}>
                <TarotCard cardId={cardId} faceUp size="sm" className={s.card} imageSizes="96px" loading="lazy" deck="rws1909" alt={getCard(cardId).names.ko} />
                <span className={s.cardName}>{getCard(cardId).names.ko}</span>
              </li>
            ))}
          </ul>
          {block.caption ? <figcaption className={s.caption}>{block.caption}</figcaption> : null}
        </figure>
      );
    case "diagram":
      return <GuideDiagram block={block} id={id} />;
  }
}

export function GuideBlocks({ blocks, id }: { blocks: readonly GuideBlock[]; id: string }) {
  return blocks.map((block, i) => <Block key={i} block={block} id={`${id}-${i}`} />);
}
