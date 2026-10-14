import { getCard } from "@starlog/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Script from "next/script";
import { AdSlot } from "@/components/ads/AdSlot";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { NightSky } from "@/components/sky/NightSky";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { adsConfig, adsScriptSrc } from "@/lib/ads";
import { GUIDE_ARTICLES, GUIDE_CATEGORY_LABEL, findArticle, guideIndexPath } from "@/lib/guide";
import { appHref, linkHref } from "@/lib/hosts";
import { guideArticleBreadcrumbJsonLd, guideArticleJsonLd, guideFaqJsonLd, guideHowToJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { GuideBlocks } from "../GuideBlocks";
import { CardQuote, GuideByline, GuideSourceLine } from "../GuideEvidence";
import { GuideThumb } from "../GuideThumb";
import s from "../guide.module.css";
import { NEW_TAROT_HREF, NEW_SAJU_HREF } from "@/lib/freshStart";

export const dynamicParams = false;

/** The ad unit sits after this many sections of the body, so a reader has met some of the text before it and the rest still follows. */
const SECTIONS_BEFORE_AD = 2;

export function generateStaticParams() {
  return GUIDE_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) return {};
  return pageMetadata({
    title: article.title,
    description: article.description,
    path: `/guide/${article.slug}`,
    type: "article",
    publishedTime: article.published,
    modifiedTime: article.updated,
  });
}

const CTA = {
  tarot: { text: "카드 3장으로 지금을 봐요", label: "타로 보기", href: NEW_TAROT_HREF },
  saju: { text: "타고난 결로 나를 봐요", label: "사주 보기", href: NEW_SAJU_HREF },
} as const;

export default async function GuideArticlePage({ params }: PageProps<"/guide/[slug]">) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();
  const card = article.cardId ? getCard(article.cardId) : null;
  const cta = CTA[article.category];
  const tab = GUIDE_CATEGORY_LABEL[article.category];
  // The article's own picks; an article without them falls back to the first others in its tab.
  const picked = (article.related ?? []).map((other) => findArticle(other)).filter((other) => other !== undefined);
  const others = picked.length ? picked : GUIDE_ARTICLES.filter((other) => other.category === article.category && other.slug !== article.slug).slice(0, 4);
  const ads = adsConfig();
  // Where the ad goes in the body, or null: with the unit set, and sections left after it.
  const adAt = ads?.guideSlot && article.sections.length > SECTIONS_BEFORE_AD ? SECTIONS_BEFORE_AD : null;
  const sections = (from: number, to: number) =>
    article.sections.slice(from, to).map((section, i) => (
      <section key={section.heading} className={s.section}>
        <h2 className={s.sectionTitle}>{section.heading}</h2>
        <p className={s.prose}>{section.body}</p>
        {section.blocks ? <GuideBlocks blocks={section.blocks} id={`s${from + i + 1}`} /> : null}
      </section>
    ));

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} moon={false} />
      <TabBar active="guide" host="guide" />
      <main className="page-col page-wide">
        <JsonLd data={guideArticleJsonLd(article)} />
        <JsonLd data={guideArticleBreadcrumbJsonLd(article)} />
        <JsonLd data={guideFaqJsonLd(article)} />
        <JsonLd data={guideHowToJsonLd(article)} />
        <article className={s.article}>
          <Stepper label={`${tab} 가이드`} backHref={linkHref(guideIndexPath(article.category), "guide")} backLabel={`${tab} 가이드 목록으로`} />

          <header className={s.head}>
            <p className={s.eyebrow}>{GUIDE_CATEGORY_LABEL[article.category]}</p>
            <h1 className={s.title}>{article.title}</h1>
            {/* The answer first (요약), so a reader, a search snippet or an AI answer gets it in one place. */}
            {article.summary ? (
              <div className={s.answer}>
                <p className={s.answerLabel}>요약</p>
                <p className={s.answerText}>{article.summary}</p>
              </div>
            ) : (
              <p className={s.lead}>{article.description}</p>
            )}
            {article.keyPoints ? (
              <div className={s.keyPoints}>
                <p id="key-points" className={s.answerLabel}>
                  한눈에 보기
                </p>
                <ul className={s.keyList} aria-labelledby="key-points">
                  {article.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <GuideByline article={article} />
          </header>

          {card && article.cardId ? (
            <figure className={s.figure}>
              <TarotCard cardId={article.cardId} faceUp size="lg" className={s.figureCard} alt={`${card.names.ko} 타로 카드`} deck="rws1909" />
              <figcaption className={s.caption}>{`${card.arcana === "major" ? `${card.roman} ` : ""}${card.names.ko} · 라이더-웨이트-스미스 덱(1909)`}</figcaption>
            </figure>
          ) : null}
          {article.cardId ? <CardQuote cardId={article.cardId} /> : null}

          <Paper className={s.body}>{sections(0, adAt ?? article.sections.length)}</Paper>
          {/* On the sky, between two sheets of paper: the label is light ink, which the cream paper would hide. */}
          {adAt !== null && ads?.guideSlot ? (
            <>
              <AdSlot client={ads.client} slot={ads.guideSlot} />
              <Paper className={s.body}>{sections(adAt, article.sections.length)}</Paper>
            </>
          ) : null}
          <GuideSourceLine article={article} />

          <aside className={s.cta} aria-label={cta.label}>
            <p className={s.ctaText}>{cta.text}</p>
            <Button href={appHref(cta.href)} block trailing="→">
              {cta.label}
            </Button>
          </aside>

          <nav className={s.more} aria-labelledby="more-title">
            <h2 id="more-title" className={s.moreTitle}>
              같이 읽어 볼 글
            </h2>
            <ul className={s.list}>
              {others.map((other) => (
                <li key={other.slug}>
                  <Link href={`/guide/${other.slug}`} className={`${s.item} ${s.itemCompact}`}>
                    <GuideThumb article={other} />
                    <span className={s.itemText}>
                      <span className={s.itemTitle}>{other.title}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
      <Footer host="guide" />
      {/* Article pages only: the hubs are lists to find an article by (app/guide/layout.tsx). */}
      {ads ? <Script async src={adsScriptSrc(ads.client)} crossOrigin="anonymous" strategy="afterInteractive" /> : null}
    </div>
  );
}
