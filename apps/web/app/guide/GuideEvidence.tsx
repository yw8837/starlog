import Link from "next/link";
import { SITE } from "@/lib/config";
import { SAJU_SOURCE_LINE, cardQuote, cardSourceLine, evidenceHref, guideReferences } from "@/lib/evidence";
import { GUIDE_ABOUT_PATH, lastReviewed, type GuideArticle } from "@/lib/guideMeta";
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
 * Under the title: who writes and checks the guide, when this article was first written and last checked (the dates
 * the Article JSON-LD carries, lastReviewed), and a link to the editorial page, a guide page on the same host.
 */
export function GuideByline({ article }: { article: Pick<GuideArticle, "published" | "updated"> }) {
  const { published } = article;
  const reviewed = lastReviewed(article);
  return (
    <p className={s.dates}>
      {`글·검토 ${SITE.business.name}`}
      {published ? (
        <>
          {" · 처음 쓴 날 "}
          <time dateTime={published}>{koreanDate(published)}</time>
        </>
      ) : null}
      {reviewed ? (
        <>
          {" · 마지막 검토 "}
          <time dateTime={reviewed}>{koreanDate(reviewed)}</time>
        </>
      ) : null}
      {" · "}
      <Link href={GUIDE_ABOUT_PATH} className={s.sourcesLink}>
        편집 원칙
      </Link>
    </p>
  );
}

/** How an article is made, per category: the editorial page's own facts (app/guide/about), nothing it does not say. */
const MADE_HOW: Record<GuideArticle["category"], string> = {
  tarot: "AI 도구로 초안을 쓰고 1909년 원판 그림과 웨이트 해설서에 대조해 다듬었어요.",
  saju: "AI 도구로 초안을 쓰고 만세력 계산 규칙에 대조해 다듬었어요.",
};

/**
 * 이 글에 대해, after the body (the ad never sits inside it): who writes and checks the article, its two dates, the
 * sources its category rests on (guideReferences, never typed per article), and how to report an error. The
 * evidence page is an app page, so it goes through appHref; the editorial page is the guide's own.
 */
export function GuideTrustBox({ article }: { article: GuideArticle }) {
  const { published } = article;
  const reviewed = lastReviewed(article);
  const email = SITE.business.email.trim();
  return (
    <section className={s.trust} aria-labelledby="trust-title">
      <h2 id="trust-title" className={s.trustTitle}>
        이 글에 대해
      </h2>
      <dl className={s.trustFacts}>
        <div className={s.trustRow}>
          <dt>글·검토</dt>
          <dd>{SITE.business.name}</dd>
        </div>
        <div className={s.trustRow}>
          <dt>만든 방법</dt>
          <dd>{MADE_HOW[article.category]}</dd>
        </div>
        {published ? (
          <div className={s.trustRow}>
            <dt>처음 쓴 날</dt>
            <dd>
              <time dateTime={published}>{koreanDate(published)}</time>
            </dd>
          </div>
        ) : null}
        {reviewed ? (
          <div className={s.trustRow}>
            <dt>마지막 검토</dt>
            <dd>
              <time dateTime={reviewed}>{koreanDate(reviewed)}</time>
            </dd>
          </div>
        ) : null}
      </dl>
      <h3 className={s.trustSub}>참고한 자료</h3>
      <ul className={s.trustList}>
        {guideReferences(article.category).map((row) => (
          <li key={row.title}>
            {row.href ? (
              <a href={row.href} className={s.sourcesLink}>
                {row.title}
              </a>
            ) : (
              <span className={s.trustSource}>{row.title}</span>
            )}{" "}
            <span className={s.trustNote}>{row.note}</span>
          </li>
        ))}
      </ul>
      {email ? (
        <p className={s.trustNote}>
          틀린 곳이나 오래된 내용이 보이면 글 주소를 적어 이메일로 알려 주세요. 확인해서 고치면 마지막 검토 날짜도 바꿔요.{" "}
          <a href={`mailto:${email}`} className={s.sourcesLink}>
            {email}
          </a>
        </p>
      ) : null}
      <p className={s.trustNote}>
        <Link href={GUIDE_ABOUT_PATH} className={s.sourcesLink}>
          편집 원칙
        </Link>
        {" · "}
        <Link href={appHref(INFO_PAGES.evidence.path)} prefetch={false} className={s.sourcesLink}>
          근거와 방법
        </Link>
      </p>
    </section>
  );
}
