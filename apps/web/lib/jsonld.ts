import { CONSTELLATIONS, cardImage } from "@starlog/core";
import { SITE } from "./config";
import { GUIDE_ABOUT_PATH, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath, guideSectionText, lastReviewed, type GuideArticle, type GuideCategory } from "./guide";
import { guidePlainText } from "./guideLinks";
import { GUIDE_EDITOR, guideReview } from "./guideReview";
import { GUIDE_HOME, absoluteUrl } from "./hosts";

/**
 * schema.org JSON-LD for search and answer engines (rendered as <script type="application/ld+json">,
 * see components/seo/JsonLd.tsx). Every URL is absolute on the host that serves the page: guide pages
 * (/guide/…) on the root domain, everything else, the publisher and the site included, on the app host
 * (lib/hosts.ts absoluteUrl). Every text is the same text the page shows. lib/jsonld.test.tsx parses
 * each page's scripts and checks the shapes.
 */

const CONTEXT = "https://schema.org";

export const ORGANIZATION_ID = absoluteUrl("/#organization");
export const WEBSITE_ID = absoluteUrl("/#website");
/** The root domain's own site, the guides (its home is the root domain's "/"). */
export const GUIDE_WEBSITE_ID = `${absoluteUrl(GUIDE_HOME)}#website`;

/** Square brand mark (public/logo.png, scripts/build-icons.mjs). */
export const LOGO = { url: absoluteUrl("/logo.png"), width: 512, height: 512 } as const;

/** The site's shared Open Graph image (app/opengraph-image.tsx). */
export const SHARE_IMAGE = { url: absoluteUrl("/opengraph-image"), width: 1200, height: 630 } as const;

/** One line on what the service is, used by WebSite and llms.txt. */
export const SITE_SUMMARY = `${SITE.nameKo}(${SITE.name})는 내 질문과 상황에 맞춘 타로와 사주 풀이를 보는 곳이에요. 타로는 1909년 원판의 구도를 따른 스타로그 카드로 고양이 점성술사 타로로가, 사주는 만세력으로 세운 명식으로 한복 입은 토끼 선생님 사주주가 읽어 줘요.`;

/** JSON for a <script type="application/ld+json">, with "<" escaped so no text can close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The publisher as embedded in other nodes: enough to stand on its own when read without the site graph. */
function organizationRef() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE.business.name,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: LOGO.url, width: LOGO.width, height: LOGO.height },
  };
}

/** 열매스튜디오, which makes and runs 스타로그. */
export function organizationJsonLd() {
  const email = SITE.business.email.trim();
  return {
    "@context": CONTEXT,
    ...organizationRef(),
    legalName: SITE.business.name,
    ...(email
      ? { email, contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email, availableLanguage: ["Korean"] }] }
      : {}),
    brand: { "@type": "Brand", name: SITE.nameKo, alternateName: SITE.name, logo: LOGO.url },
  };
}

/** The site's name in results: 스타로그, also known as Starlog. On the app's home only (app/page.tsx), where Google reads it. */
export function websiteJsonLd() {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.nameKo,
    alternateName: [SITE.name, `${SITE.nameKo} ${SITE.name}`],
    url: absoluteUrl("/"),
    description: SITE_SUMMARY,
    inLanguage: "ko-KR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * The root domain's own site, the guides: 스타로그 가이드, published by the same 열매스튜디오. Carried by
 * every guide page (app/guide/layout.tsx), the only WebSite there (the app's is on the app's home). No sameAs:
 * there is no real profile to list.
 */
export function guideWebsiteJsonLd() {
  const home = absoluteUrl(GUIDE_HOME);
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": GUIDE_WEBSITE_ID,
    name: `${SITE.nameKo} 가이드`,
    url: home,
    inLanguage: "ko-KR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[]) {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: absoluteUrl(crumb.path) })),
  };
}

const HOME_CRUMB: Crumb = { name: SITE.nameKo, path: "/" };

const guideTabCrumb = (category: GuideCategory): Crumb => ({ name: `${GUIDE_CATEGORY_LABEL[category]} 가이드`, path: guideIndexPath(category) });

export const guideArticlePath = (article: Pick<GuideArticle, "slug">) => `/guide/${article.slug}`;

/** An article's trail: 스타로그 (the app's home), its tab, the article. The visible breadcrumb (GuideBreadcrumbs) shows the same. */
export const guideArticleCrumbs = (article: GuideArticle): Crumb[] => [HOME_CRUMB, guideTabCrumb(article.category), { name: article.title, path: guideArticlePath(article) }];

export function guideArticleBreadcrumbJsonLd(article: GuideArticle) {
  return breadcrumbJsonLd(guideArticleCrumbs(article));
}

/** The editorial page's trail: 스타로그, the guide's home, the page. */
export const guideAboutCrumbs = (title: string): Crumb[] => [HOME_CRUMB, { name: "가이드", path: GUIDE_HOME }, { name: title, path: GUIDE_ABOUT_PATH }];

export function guideIndexBreadcrumbJsonLd(category: GuideCategory) {
  return breadcrumbJsonLd([HOME_CRUMB, guideTabCrumb(category)]);
}

/** The guide's editor (lib/guideReview.ts) as a Person who works for the publisher; his page is the editorial page's 책임 편집. */
function editorRef() {
  return { "@type": "Person", name: GUIDE_EDITOR.name, jobTitle: GUIDE_EDITOR.title, url: absoluteUrl(`${GUIDE_ABOUT_PATH}#editor`), worksFor: organizationRef() };
}

/**
 * Article for a guide: dates from answers.ts (dateModified is the page's 마지막 수정), the card scan first for a card
 * article, then the share image; the editor as its author and the business as its publisher; publishingPrinciples is
 * the guide's editorial page. Only an article the owner has read (guideReview) marks its page reviewedBy and
 * lastReviewed, which schema.org defines on WebPage.
 */
export function guideArticleJsonLd(article: GuideArticle) {
  const url = absoluteUrl(guideArticlePath(article));
  const modified = lastReviewed(article);
  const review = guideReview(article.slug);
  const images = [...(article.cardId ? [absoluteUrl(cardImage(article.cardId, "lg"))] : []), SHARE_IMAGE.url];
  return {
    "@context": CONTEXT,
    "@type": "Article",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.description,
    ...(article.summary ? { abstract: article.summary } : {}),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url, ...(review ? { reviewedBy: editorRef(), lastReviewed: review.on } : {}) },
    inLanguage: "ko-KR",
    articleSection: `${GUIDE_CATEGORY_LABEL[article.category]} 가이드`,
    ...(article.published ? { datePublished: article.published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    image: images,
    author: editorRef(),
    publisher: organizationRef(),
    publishingPrinciples: absoluteUrl(GUIDE_ABOUT_PATH),
    isPartOf: { "@type": "WebSite", "@id": GUIDE_WEBSITE_ID, name: `${SITE.nameKo} 가이드`, url: absoluteUrl(GUIDE_HOME) },
  };
}

/** A heading written as a question (…나요, …까요, …가요, or a question mark). */
export const isQuestion = (text: string): boolean => /(\?|나요|까요|가요)$/.test(text.trim());

const asQuestion = (text: string) => (text.trim().endsWith("?") ? text.trim() : `${text.trim()}?`);

/**
 * Question-and-answer pairs the page shows: the title when it asks a question (answered by the 요약),
 * then, in page order, every section whose heading is a question (answered by its text: the body, then its blocks) and
 * every question of a 자주 묻는 질문 section (a step whose title asks, answered by its text as the page shows it).
 */
export function guideQuestions(article: GuideArticle): Array<{ q: string; a: string }> {
  const fromTitle = isQuestion(article.title) && article.summary ? [{ q: asQuestion(article.title), a: article.summary }] : [];
  const fromSections = article.sections.flatMap((section) => {
    if (isQuestion(section.heading)) return [{ q: asQuestion(section.heading), a: guideSectionText(section) }];
    if (!FAQ_HEADING.test(section.heading)) return [];
    return (section.blocks ?? []).flatMap((block) =>
      block.kind === "steps" ? block.items.filter((step) => isQuestion(step.title)).map((step) => ({ q: step.title.trim(), a: guidePlainText(step.text) })) : [],
    );
  });
  return [...fromTitle, ...fromSections];
}

/** A section of questions and answers, one step per question (the card articles' "<카드> 카드 자주 묻는 질문"). */
const FAQ_HEADING = /자주 묻는 질문/;

/** FAQPage for an article with at least two question-style parts; null otherwise. */
export function guideFaqJsonLd(article: GuideArticle) {
  const questions = guideQuestions(article);
  if (questions.length < 2) return null;
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** HowTo for the step-by-step articles (lib/guide-articles/answers.ts); null for the rest. */
export function guideHowToJsonLd(article: GuideArticle) {
  if (!article.howTo) return null;
  const url = absoluteUrl(guideArticlePath(article));
  return {
    "@context": CONTEXT,
    "@type": "HowTo",
    name: article.howTo.name,
    description: article.summary ?? article.description,
    inLanguage: "ko-KR",
    url,
    step: article.howTo.steps.map((step, i) => ({ "@type": "HowToStep", position: i + 1, name: step.name, text: step.text })),
  };
}

export interface ListEntry {
  name: string;
  path: string;
}

export function itemListJsonLd(name: string, path: string, entries: readonly ListEntry[]) {
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    name,
    url: absoluteUrl(path),
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, i) => ({ "@type": "ListItem", position: i + 1, name: entry.name, url: absoluteUrl(entry.path) })),
  };
}

/** A guide tab's articles, in the tab's order. */
export function guideIndexItemListJsonLd(category: GuideCategory) {
  return itemListJsonLd(
    `${GUIDE_CATEGORY_LABEL[category]} 가이드`,
    guideIndexPath(category),
    articlesIn(category).map((article) => ({ name: article.title, path: guideArticlePath(article) })),
  );
}

/** /ranking: the twelve sign rankings, in calendar order from 양자리. */
export function rankingItemListJsonLd() {
  return itemListJsonLd(
    "별자리 인연 랭킹",
    "/ranking",
    CONSTELLATIONS.map((sign) => ({ name: `${sign.ko} 랭킹`, path: `/ranking/${sign.id}` })),
  );
}
