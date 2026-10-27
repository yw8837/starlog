// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import FaqPage from "@/app/faq/page";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideLayout from "@/app/guide/layout";
import GuideSajuPage from "@/app/guide/saju/page";
import GuideTarotPage from "@/app/guide/tarot/page";
import { SiteJsonLd } from "@/components/seo/JsonLd";
import { SITE } from "./config";
import { GUIDE_ARTICLES, articlesIn, findArticle, guideSectionText } from "./guide";
import { guideReview } from "./guideReview";
import { GUIDE_WEBSITE_ID, ORGANIZATION_ID, guideArticleJsonLd, guideQuestions, jsonLdScript, rankingItemListJsonLd } from "./jsonld";

afterEach(cleanup);

type Node = Record<string, unknown>;

/** Every JSON-LD script the rendered page carries, parsed (a parse error fails the test). */
function jsonLdOf(ui: ReactElement): Node[] {
  const { container } = render(ui);
  return [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent ?? "") as Node);
}

const byType = (nodes: Node[], type: string) => nodes.filter((node) => node["@type"] === type);

/** The app host's URLs (the publisher, the site, images, rankings) and the guide's, on the root domain. */
const isSiteUrl = (value: unknown) => typeof value === "string" && value.startsWith(`${SITE.url}/`);
const isGuideUrl = (value: unknown) => typeof value === "string" && value.startsWith(`${SITE.guideUrl}/guide/`);
/** The guide's home, the tarot tab, is the root domain's own "/". */
const isGuideHome = (value: unknown) => value === `${SITE.guideUrl}/`;
const isOwnUrl = (value: unknown) => isSiteUrl(value) || isGuideUrl(value) || isGuideHome(value);
const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const isoDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Required properties per type, after Google's structured data docs (Article, BreadcrumbList,
 * FAQPage, ItemList, Organization) and schema.org (HowTo, WebSite). Returns the problems found.
 */
function problems(node: Node): string[] {
  const out: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) out.push(`${String(node["@type"])}: ${what}`);
  };
  need(node["@context"] === "https://schema.org", "@context");
  const list = (key: string) => (Array.isArray(node[key]) ? (node[key] as Node[]) : []);
  switch (node["@type"]) {
    case "Organization": {
      need(nonEmpty(node.name), "name");
      need(isSiteUrl(node.url), "url");
      const logo = node.logo as Node | undefined;
      need(isSiteUrl(logo?.url) && Number(logo?.width) >= 112 && Number(logo?.height) >= 112, "logo 112px+");
      need(list("contactPoint").every((point) => nonEmpty(point.email) && nonEmpty(point.contactType)), "contactPoint");
      break;
    }
    case "WebSite":
      need(nonEmpty(node.name), "name");
      need(Array.isArray(node.alternateName) && (node.alternateName as unknown[]).every(nonEmpty), "alternateName");
      need(node.url === `${SITE.url}/`, "url is the home");
      break;
    case "Article": {
      need(nonEmpty(node.headline) && String(node.headline).length <= 110, "headline");
      need(nonEmpty(node.description), "description");
      need(isoDate(node.datePublished) && isoDate(node.dateModified), "dates");
      need(String(node.dateModified) >= String(node.datePublished), "dateModified >= datePublished");
      need(list("image").length > 0 && (node.image as unknown[]).every(isSiteUrl), "image");
      // The author is the editor responsible for every article, a Person (owner decision 2026-10-23), his page the
      // editorial page's 책임 편집; the publisher is the business he works for.
      const author = node.author as Node | undefined;
      need(author?.["@type"] === "Person" && nonEmpty(author.name) && nonEmpty(author.jobTitle) && isGuideUrl(author.url), "author");
      need((author?.worksFor as Node | undefined)?.["@id"] === ORGANIZATION_ID, "author worksFor the publisher");
      const publisher = node.publisher as Node | undefined;
      need(publisher?.["@type"] === "Organization" && nonEmpty(publisher.name) && isSiteUrl(publisher.url), "publisher");
      // The article itself is a guide page: on the root domain.
      need(isGuideUrl(node.url), "url");
      need(isGuideUrl((node.mainEntityOfPage as Node | undefined)?.["@id"]), "mainEntityOfPage");
      break;
    }
    case "BreadcrumbList": {
      const items = list("itemListElement");
      need(items.length >= 2, "2+ items");
      items.forEach((item, i) => need(item.position === i + 1 && nonEmpty(item.name) && isOwnUrl(item.item), `item ${i + 1}`));
      break;
    }
    case "ItemList": {
      const items = list("itemListElement");
      need(items.length > 0 && node.numberOfItems === items.length, "items");
      need(isOwnUrl(node.url), "url");
      items.forEach((item, i) => need(item.position === i + 1 && nonEmpty(item.name) && isOwnUrl(item.url), `item ${i + 1}`));
      break;
    }
    case "FAQPage": {
      const questions = list("mainEntity");
      need(questions.length > 0, "questions");
      for (const q of questions) {
        need(q["@type"] === "Question" && nonEmpty(q.name), "Question.name");
        const answer = q.acceptedAnswer as Node | undefined;
        need(answer?.["@type"] === "Answer" && nonEmpty(answer.text), `answer of ${String(q.name)}`);
      }
      break;
    }
    case "HowTo": {
      const steps = list("step");
      need(nonEmpty(node.name), "name");
      need(isGuideUrl(node.url), "url");
      need(steps.length >= 3, "3+ steps");
      steps.forEach((step, i) => need(step["@type"] === "HowToStep" && step.position === i + 1 && nonEmpty(step.text), `step ${i + 1}`));
      break;
    }
    default:
      out.push(`unexpected @type ${String(node["@type"])}`);
  }
  return out;
}

const renderArticle = async (slug: string) => GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">);

describe("JSON-LD", () => {
  it("site-wide: the publisher with its legal name, logo and contact email; the app's WebSite is on its home only (app/page.tsx), so a root-domain page names one site (SEO P1-9)", () => {
    const nodes = jsonLdOf(<SiteJsonLd />);
    expect(nodes.map((node) => node["@type"])).toEqual(["Organization"]);
    for (const node of nodes) expect(problems(node)).toEqual([]);
    expect(nodes[0]).toMatchObject({ name: SITE.business.name, legalName: SITE.business.name, email: SITE.business.email });
    expect(JSON.stringify(nodes)).not.toContain("sameAs");
  });

  it.each([
    ["the tarot hub, the root domain's /", <GuideTarotPage key="tarot" />],
    ["the saju hub", <GuideSajuPage key="saju" />],
  ] as const)("a guide page under the guide layout (%s) also names the root domain's own site: a WebSite with the shared publisher, and no sameAs", (_name, page) => {
    const nodes = jsonLdOf(<GuideLayout>{page}</GuideLayout>);
    const sites = byType(nodes, "WebSite");
    expect(sites).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE.guideUrl}/#website`,
        name: "스타로그 가이드",
        url: `${SITE.guideUrl}/`,
        inLanguage: "ko-KR",
        publisher: { "@id": ORGANIZATION_ID },
      },
    ]);
    expect(JSON.stringify(sites)).not.toContain("sameAs");
  });

  it("a guide page under the root layout's site nodes and the guide layout carries exactly one WebSite, the root domain's", () => {
    const nodes = jsonLdOf(
      <>
        <SiteJsonLd />
        <GuideLayout>
          <GuideTarotPage />
        </GuideLayout>
      </>,
    );
    expect(byType(nodes, "WebSite").map((site) => site["@id"])).toEqual([GUIDE_WEBSITE_ID]);
    expect(GUIDE_WEBSITE_ID).toBe(`${SITE.guideUrl}/#website`);
  });

  // SEO audit 2026-10-27 [M7]: a reading has no product picture to give a Product, so the two entry pages carry none.
  it("/tarot/new and /saju/new carry no Product markup: there is no product image to give it", async () => {
    const jsonld = await import("./jsonld");
    expect("standardProductJsonLd" in jsonld).toBe(false);
    // jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web.
    const web = ["apps/web", "."].map((dir) => resolve(process.cwd(), dir)).find((dir) => existsSync(resolve(dir, "app/tarot/new/page.tsx"))) ?? "";
    for (const page of ["app/tarot/new/page.tsx", "app/saju/new/page.tsx"]) {
      const source = readFileSync(resolve(web, page), "utf8");
      expect(source, page).not.toMatch(/Product/);
    }
  });

  it("/faq: an FAQPage with every question on the page", () => {
    const nodes = jsonLdOf(<FaqPage />);
    const [faq] = byType(nodes, "FAQPage");
    expect(faq && problems(faq)).toEqual([]);
    expect((faq?.mainEntity as unknown[]).length).toBeGreaterThanOrEqual(8);
  });

  /** A guide tab's one address: the tarot tab is the guide's home, the root domain's own "/". */
  const tabUrl = (category: "tarot" | "saju") => (category === "tarot" ? `${SITE.guideUrl}/` : `${SITE.guideUrl}/guide/${category}`);

  it.each([
    ["tarot", GuideTarotPage],
    ["saju", GuideSajuPage],
  ] as const)("/guide/%s: a breadcrumb and an ItemList of the tab's articles in order", (category, Page) => {
    const nodes = jsonLdOf(<Page />);
    for (const node of nodes) expect(problems(node)).toEqual([]);
    expect(byType(nodes, "BreadcrumbList")).toHaveLength(1);
    const [list] = byType(nodes, "ItemList");
    const urls = (list?.itemListElement as Node[]).map((item) => item.url);
    // The guide lives on the root domain: its tab, its articles and its trail say so.
    expect(urls).toEqual(articlesIn(category).map((article) => `${SITE.guideUrl}/guide/${article.slug}`));
    expect(list?.url).toBe(tabUrl(category));
    const crumbs = (byType(nodes, "BreadcrumbList")[0]?.itemListElement as Node[]).map((item) => item.item);
    expect(crumbs).toEqual([`${SITE.url}/`, tabUrl(category)]);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug] as const))("/guide/%s: Article and breadcrumb, plus FAQPage and HowTo where the article has them", async (slug) => {
    const article = findArticle(slug);
    if (!article) throw new Error(slug);
    const nodes = jsonLdOf(await renderArticle(slug));
    for (const node of nodes) expect(problems(node), slug).toEqual([]);

    const address = `${SITE.guideUrl}/guide/${slug}`;
    const [articleNode] = byType(nodes, "Article");
    expect(articleNode).toMatchObject({ headline: article.title, datePublished: article.published, dateModified: article.updated, abstract: article.summary });
    expect(articleNode).toMatchObject({ url: address, "@id": `${address}#article`, mainEntityOfPage: { "@type": "WebPage", "@id": address } });
    // The publisher stays the app's (스타로그's home is the app host); the article is part of the root domain's site, the guides (SEO P1-9).
    expect(articleNode).toMatchObject({ publisher: { url: `${SITE.url}/` }, isPartOf: { "@id": GUIDE_WEBSITE_ID, url: `${SITE.guideUrl}/` } });
    // Written under the owner's name as its editor; reviewed only where he has read it (lib/guideReview.ts).
    expect(articleNode).toMatchObject({ author: { "@type": "Person", name: SITE.business.ceo, jobTitle: `${SITE.business.name} 대표` } });
    const review = guideReview(slug);
    const page = articleNode?.mainEntityOfPage as Node;
    if (review) expect(page).toMatchObject({ reviewedBy: { "@type": "Person", name: review.by }, lastReviewed: review.on });
    else expect(Object.keys(page)).toEqual(["@type", "@id"]);
    const crumbs = (byType(nodes, "BreadcrumbList")[0]?.itemListElement as Node[]).map((item) => item.item);
    expect(crumbs).toEqual([`${SITE.url}/`, tabUrl(article.category), address]);

    const questions = guideQuestions(article);
    expect(byType(nodes, "FAQPage")).toHaveLength(questions.length >= 2 ? 1 : 0);
    expect(byType(nodes, "HowTo")).toHaveLength(article.howTo ? 1 : 0);
    // The answer every Q&A node quotes is on the page as written (in the article, not only in the scripts):
    // every line of it, and for a line that joins a table row, a step or a card row, every part of it.
    const text = document.querySelector("article")?.textContent ?? "";
    expect(text).toContain(article.summary);
    const onPage = (line: string) => text.includes(line) || line.split(/: |, | · /).every((part) => text.includes(part));
    for (const { a } of questions) for (const line of a.split("\n")) expect(onPage(line), line).toBe(true);
  });

  it("keeps a card article's image on the 1909 scan the article describes, never the Starlog deck", () => {
    const article = findArticle("the-fool");
    if (!article) throw new Error("the-fool");
    expect(guideArticleJsonLd(article).image).toEqual([`${SITE.url}/cards/major-00-fool.webp`, `${SITE.url}/opengraph-image`]);
  });

  it("answers a question section with its blocks too: the suits table of 타로 카드 읽는 법, not only its first paragraph", () => {
    const article = findArticle("how-to-read-tarot");
    const section = article?.sections.find((s) => s.heading === "타로 카드는 모두 몇 장인가요");
    if (!article || !section?.blocks) throw new Error("how-to-read-tarot: the section with the suits table");
    const answer = guideQuestions(article).find(({ q }) => q === "타로 카드는 모두 몇 장인가요?")?.a;
    expect(answer).toBe(guideSectionText(section));
    expect(answer?.startsWith(section.body)).toBe(true);
    expect(answer).toContain("벌: 완드, 원소: 불, 주로 읽는 영역: 의욕과 움직임");
  });

  it("marks the how-to articles: 원카드로 묻는 법 and 타로 카드 읽는 법", async () => {
    for (const slug of ["one-card-yes-no", "how-to-read-tarot"]) {
      const nodes = jsonLdOf(await renderArticle(slug));
      expect(byType(nodes, "HowTo"), slug).toHaveLength(1);
      expect(byType(nodes, "HowTo")[0]?.url, slug).toBe(`${SITE.guideUrl}/guide/${slug}`);
      cleanup();
    }
  });

  it("gives /ranking an ItemList of the twelve sign rankings", () => {
    const list = rankingItemListJsonLd();
    expect(problems(list)).toEqual([]);
    expect(list.itemListElement).toHaveLength(12);
    expect(list.itemListElement[0]).toMatchObject({ name: "양자리 랭킹", url: `${SITE.url}/ranking/aries` });
  });

  it("escapes < so no text can close the script tag", () => {
    expect(jsonLdScript({ text: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});
