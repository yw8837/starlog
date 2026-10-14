import Link from "next/link";
import { SAJU_SOURCE_LINE, cardQuote, cardSourceLine, evidenceHref } from "@/lib/evidence";
import type { GuideArticle } from "@/lib/guideMeta";
import { appHref } from "@/lib/hosts";
import { INFO_PAGES } from "@/lib/infoPages";
import { koreanDate } from "@/lib/legal";
import s from "./guide.module.css";

/**
 * The evidence on a guide article, server-rendered (lib/evidence.ts is server-only): a card article
 * quotes Waite on its picture under the card and names its sources after the body; a saju article
 * names its calendar. Each line opens 스타로그의 근거, an app page, so it goes through appHref.
 */

/** 웨이트 원전에서는: Waite's sentence about the card's picture, and where it stands in his book. */
export function CardQuote({ cardId }: { cardId: string }) {
  const quote = cardQuote(cardId);
  if (!quote) return null;
  return (
    <figure className={s.quote}>
      <p className={s.answerLabel}>웨이트 원전에서는</p>
      <blockquote className={s.quoteText}>
        <p>{quote.ko}</p>
      </blockquote>
      <figcaption className={s.cite}>
        {`${quote.author}, `}
        <cite>{quote.title}</cite>
        {`, ${quote.loc}`}
      </figcaption>
    </figure>
  );
}

/** One line after the body: a card article's picture, book and modern references, or a saju article's calendar. */
export function GuideSourceLine({ article }: { article: GuideArticle }) {
  const line = article.cardId ? cardSourceLine(article.cardId) : article.category === "saju" ? SAJU_SOURCE_LINE : null;
  if (!line) return null;
  return (
    <p className={s.sources}>
      <Link href={appHref(evidenceHref(article.cardId ? "tarot" : "saju"))} className={s.sourcesLink}>
        {line}
      </Link>
    </p>
  );
}

/**
 * Under the title: who makes the guide, when this article was first posted and last updated (the dates
 * the Article JSON-LD carries), and a link to how the guide is made. The evidence page is an app page,
 * so it goes through appHref.
 */
export function GuideByline({ article }: { article: Pick<GuideArticle, "published" | "updated"> }) {
  const { published, updated } = article;
  return (
    <p className={s.dates}>
      열매스튜디오
      {published ? (
        <>
          {" · 처음 올린 날 "}
          <time dateTime={published}>{koreanDate(published)}</time>
        </>
      ) : null}
      {updated ? (
        <>
          {" · 업데이트 "}
          <time dateTime={updated}>{koreanDate(updated)}</time>
        </>
      ) : null}
      {" · "}
      <Link href={appHref(INFO_PAGES.evidence.path)} className={s.sourcesLink}>
        근거와 방법
      </Link>
    </p>
  );
}
