import { getCard } from "@starlog/core";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { GuideBlock, GuideCalloutTone } from "@/lib/guideMeta";
import { GuideDiagram } from "./GuideDiagram";
import s from "./GuideBlocks.module.css";

/**
 * A guide section's rich blocks, after its body paragraph (app/guide/[slug]/page.tsx). Server-rendered
 * on the cream paper; `id` is unique per section and keeps the ids inside each block unique.
 */

const TONE_LABEL: Record<GuideCalloutTone, string> = { tip: "도움말", note: "참고", caution: "주의" };

/** A column with a cell longer than this wraps; shorter columns keep each cell on one line. */
const LONG_CELL = 12;

function Block({ block, id }: { block: GuideBlock; id: string }) {
  switch (block.kind) {
    case "p":
      return <p className={`${s.block} ${s.p}`}>{block.text}</p>;
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={`${s.block} ${s.list}`}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </List>
      );
    }
    case "table": {
      // Short cells stay on one line (a column of "수(水)" never breaks into two); long ones wrap. Wider
      // than the paper on a phone, the table scrolls sideways in its own box (focusable for the keyboard).
      const wraps = block.head.map((_, column) => block.rows.some((row) => (row[column] ?? "").length > LONG_CELL));
      return (
        <div className={`${s.block} ${s.tableWrap}`} role="region" aria-labelledby={`${id}-caption`} tabIndex={0}>
          <table className={s.table}>
            <caption id={`${id}-caption`} className={s.tableCaption}>
              {block.caption}
            </caption>
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map(([first, ...rest], r) => (
                <tr key={r}>
                  <th scope="row">{first}</th>
                  {rest.map((cell, i) => (
                    <td key={i} className={wraps[i + 1] ? undefined : s.nowrap}>
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
          <p className={s.calloutText}>{block.text}</p>
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
              <p className={s.stepText}>{step.text}</p>
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
