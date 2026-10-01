import { getCard } from "@starlog/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ads/AdSlot";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { adsConfig } from "@/lib/ads";
import { SITE } from "@/lib/config";
import { GUIDE_ARTICLES, GUIDE_CATEGORY_LABEL, findArticle, guideIndexPath } from "@/lib/guide";
import { OG_ALT } from "@/lib/og";
import { GuideThumb } from "../GuideThumb";
import s from "../guide.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `/guide/${article.slug}` },
    // A page-level openGraph replaces the root one, so the site name, locale and shared image are repeated here.
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: `/guide/${article.slug}`,
      siteName: `${SITE.name} · ${SITE.nameKo}`,
      locale: "ko_KR",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_ALT }],
    },
  };
}

const CTA = {
  tarot: { text: "카드 3장으로 지금을 봐요", label: "타로 보기", href: "/tarot/new" },
  saju: { text: "타고난 결로 나를 봐요", label: "사주 보기", href: "/saju/new" },
} as const;

export default async function GuideArticlePage({ params }: PageProps<"/guide/[slug]">) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();
  const card = article.cardId ? getCard(article.cardId) : null;
  const cta = CTA[article.category];
  const tab = GUIDE_CATEGORY_LABEL[article.category];
  const others = GUIDE_ARTICLES.filter((other) => other.slug !== article.slug);
  const ads = adsConfig();

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} moon={false} />
      <TabBar active="guide" />
      <main className="page-col page-wide">
        <article className={s.article}>
          <Stepper label={`${tab} 가이드`} backHref={guideIndexPath(article.category)} backLabel={`${tab} 가이드 목록으로`} />

          <header className={s.head}>
            <p className={s.eyebrow}>{GUIDE_CATEGORY_LABEL[article.category]}</p>
            <h1 className={s.title}>{article.title}</h1>
            <p className={s.lead}>{article.description}</p>
          </header>

          {card && article.cardId ? (
            <figure className={s.figure}>
              <TarotCard cardId={article.cardId} faceUp size="lg" className={s.figureCard} label={`${card.names.ko} 카드 그림`} />
              <figcaption className={s.caption}>{`${card.arcana === "major" ? `${card.roman} ` : ""}${card.names.ko} · 라이더-웨이트-스미스 덱(1909)`}</figcaption>
            </figure>
          ) : null}

          <Paper className={s.body}>
            {article.sections.map((section) => (
              <section key={section.heading} className={s.section}>
                <h2 className={s.sectionTitle}>{section.heading}</h2>
                <p className={s.prose}>{section.body}</p>
              </section>
            ))}
          </Paper>

          {ads?.guideSlot ? <AdSlot client={ads.client} slot={ads.guideSlot} /> : null}

          <aside className={s.cta} aria-label={cta.label}>
            <p className={s.ctaText}>{cta.text}</p>
            <Button href={cta.href} block trailing="→">
              {cta.label}
            </Button>
          </aside>

          <nav className={s.more} aria-labelledby="more-title">
            <h2 id="more-title" className={s.moreTitle}>
              다른 글
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
      <Footer />
    </div>
  );
}
