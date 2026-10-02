// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import FaqPage from "@/app/faq/page";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideSajuPage from "@/app/guide/saju/page";
import GuideTarotPage from "@/app/guide/tarot/page";
import { SiteJsonLd } from "@/components/seo/JsonLd";
import { SITE } from "./config";
import { GUIDE_ARTICLES, articlesIn, findArticle } from "./guide";
import { guideQuestions, jsonLdScript, rankingItemListJsonLd } from "./jsonld";

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
const isOwnUrl = (value: unknown) => isSiteUrl(value) || isGuideUrl(value);
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
      for (const role of ["author", "publisher"]) {
        const who = node[role] as Node | undefined;
        need(who?.["@type"] === "Organization" && nonEmpty(who.name) && isSiteUrl(who.url), role);
      }
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
  it("site-wide: the publisher with logo and contact email, and the site's name with its alternate", () => {
    const nodes = jsonLdOf(<SiteJsonLd />);
    expect(nodes.map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    for (const node of nodes) expect(problems(node)).toEqual([]);
    expect(nodes[0]).toMatchObject({ name: SITE.business.name, email: SITE.business.email });
    expect(nodes[1]).toMatchObject({ name: SITE.nameKo, alternateName: expect.arrayContaining([SITE.name]) });
  });

  it("/faq: an FAQPage with every question on the page", () => {
    const nodes = jsonLdOf(<FaqPage />);
    const [faq] = byType(nodes, "FAQPage");
    expect(faq && problems(faq)).toEqual([]);
    expect((faq?.mainEntity as unknown[]).length).toBeGreaterThanOrEqual(8);
  });

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
    expect(list?.url).toBe(`${SITE.guideUrl}/guide/${category}`);
    const crumbs = (byType(nodes, "BreadcrumbList")[0]?.itemListElement as Node[]).map((item) => item.item);
    expect(crumbs).toEqual([`${SITE.url}/`, `${SITE.guideUrl}/guide/${category}`]);
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
    // The publisher and the site stay the app's: 스타로그's home is the app host. The trail goes home, to the tab, to the article.
    expect(articleNode).toMatchObject({ publisher: { url: `${SITE.url}/` }, isPartOf: { url: `${SITE.url}/` } });
    const crumbs = (byType(nodes, "BreadcrumbList")[0]?.itemListElement as Node[]).map((item) => item.item);
    expect(crumbs).toEqual([`${SITE.url}/`, `${SITE.guideUrl}/guide/${article.category}`, address]);

    const questions = guideQuestions(article);
    expect(byType(nodes, "FAQPage")).toHaveLength(questions.length >= 2 ? 1 : 0);
    expect(byType(nodes, "HowTo")).toHaveLength(article.howTo ? 1 : 0);
    // The answer every Q&A node quotes is on the page as written (in the article, not only in the scripts).
    const text = document.querySelector("article")?.textContent ?? "";
    expect(text).toContain(article.summary);
    for (const { a } of questions) expect(text).toContain(a);
  });

  it("marks the how-to articles: 지금의 한 장 사용법 and 타로 카드 읽는 법", async () => {
    for (const slug of ["now-card-how-to", "how-to-read-tarot"]) {
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
