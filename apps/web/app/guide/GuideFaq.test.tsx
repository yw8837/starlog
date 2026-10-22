// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { GUIDE_ARTICLES } from "@/lib/guide";

/**
 * FAQPage JSON-LD on a guide article: every question of the article's 자주 묻는 질문 section, word for word as the page
 * shows it (the step's title, its text with each link read as its words), next to the question-style headings it
 * already carried; nothing the page does not show.
 */

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

type Faq = { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };

const renderSlug = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

function faqOf(container: HTMLElement): Faq | null {
  const nodes = [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent ?? "null") as { "@type"?: string } | null);
  return (nodes.find((node) => node?.["@type"] === "FAQPage") as Faq | undefined) ?? null;
}

/** The 자주 묻는 질문 section on the page, as [question, answer] pairs read from the rendered steps. */
function shownFaq(container: HTMLElement): Array<[string, string]> {
  const heading = [...container.querySelectorAll("article h2")].find((h) => h.textContent?.includes("자주 묻는 질문"));
  const section = heading?.closest("section");
  if (!section) return [];
  return [...section.querySelectorAll("ol > li")].map((li) => {
    const [title, text] = [...li.querySelectorAll("p")];
    return [squash(title?.textContent ?? ""), squash(text?.textContent ?? "")];
  });
}

const WITH_FAQ = GUIDE_ARTICLES.filter((article) => article.sections.some((section) => section.heading.includes("자주 묻는 질문")));

describe("FAQPage on a guide article", () => {
  it("covers the articles with a 자주 묻는 질문 section: the 22 card articles", () => {
    expect(WITH_FAQ.filter((article) => article.cardId)).toHaveLength(22);
  });

  it.each(WITH_FAQ.map((article) => [article.slug] as const))("%s: every question of 자주 묻는 질문, word for word as shown", async (slug) => {
    const { container } = await renderSlug(slug);
    const shown = shownFaq(container);
    expect(shown.length, slug).toBeGreaterThanOrEqual(2);
    const ld = faqOf(container);
    expect(ld, slug).not.toBeNull();
    const pairs = (ld?.mainEntity ?? []).map((q) => [q.name, squash(q.acceptedAnswer.text)]);
    for (const [question, answer] of shown) expect(pairs, question).toContainEqual([question, answer]);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug] as const))("%s: nothing the page does not show", async (slug) => {
    const { container } = await renderSlug(slug);
    const ld = faqOf(container);
    if (!ld) return;
    const page = squash(container.querySelector("article")?.textContent ?? "");
    const asked = [...container.querySelectorAll("article h1, article h2, article ol > li > p:first-of-type")].map((el) => squash(el.textContent ?? ""));
    for (const { name, acceptedAnswer } of ld.mainEntity) {
      // The question is a heading, the title, or a step's title on the page (a heading may gain a closing "?").
      expect(asked.some((text) => text === name || `${text}?` === name), name).toBe(true);
      // The answer's first sentence is on the page as it is.
      const first = squash(acceptedAnswer.text).split(/(?<=[.?!])\s/)[0] as string;
      expect(page, `${name}: ${first}`).toContain(first.replace(/:$/, ""));
    }
  });
});
