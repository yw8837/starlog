// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutPage, { metadata as aboutMeta } from "@/app/about/page";
import FaqPage, { metadata as faqMeta } from "@/app/faq/page";
import HelpPage, { metadata as helpMeta } from "@/app/help/page";
import HowPage, { metadata as howMeta } from "@/app/how/page";
import sitemap from "@/app/sitemap";
import { AI_TELL_THRESHOLD, aiTells } from "@/lib/ai/style";
import { SITE, won } from "@/lib/config";
import { faqGroups } from "@/lib/faq";
import { helpGroups } from "@/lib/helpGuide";
import { INFO_PAGES, type InfoPageId } from "@/lib/infoPages";

const PAGES: Record<InfoPageId, { Page: ComponentType; metadata: Metadata }> = {
  about: { Page: AboutPage, metadata: aboutMeta },
  how: { Page: HowPage, metadata: howMeta },
  help: { Page: HelpPage, metadata: helpMeta },
  faq: { Page: FaqPage, metadata: faqMeta },
};

/** Every won amount SITE defines (prices, packs); a page may show these and no other. */
function configPrices(): Set<string> {
  const amounts = new Set<string>();
  const walk = (value: unknown, key = "") => {
    if (typeof value === "number" && /krw/i.test(key)) amounts.add(won(value));
    else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(SITE.price, "price");
  walk(SITE.moonPacks, "moonPacks");
  return amounts;
}

/** Street-address shapes: "…로 12", "…길 3", "…시 …구". */
const ADDRESS = /주소|[가-힣]+(?:로|길)\s?\d+|[가-힣]+(?:시|도)\s[가-힣]+(?:구|군|시)\b/;

/** The page text without the configured business address and its label (footer notice, business facts). */
function withoutNotice(text: string): string {
  const address = SITE.business.address.trim();
  const rest = text.replaceAll("사업장 주소", "");
  return address ? rest.replaceAll(address, "") : rest;
}

function textOf(Page: ComponentType): { text: string; container: HTMLElement } {
  const { container } = render(<Page />);
  return { text: container.textContent ?? "", container };
}

describe("service pages", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  for (const [id, { Page, metadata }] of Object.entries(PAGES) as Array<[InfoPageId, (typeof PAGES)[InfoPageId]]>) {
    const info = INFO_PAGES[id];

    it(`${id}: one h1, its own title, description and canonical`, () => {
      const { container } = textOf(Page);
      const h1s = container.querySelectorAll("h1");
      expect(h1s).toHaveLength(1);
      expect(h1s[0]?.textContent).toBe(info.title);
      expect(metadata.title).toBe(info.title);
      expect(metadata.description).toBe(info.description);
      expect(metadata.alternates?.canonical).toBe(info.path);
    });

    it(`${id}: no address anywhere, and only prices from SITE`, () => {
      const { text, container } = textOf(Page);
      const scripts = [...container.querySelectorAll("script")].map((script) => script.textContent ?? "").join(" ");
      for (const body of [withoutNotice(text), scripts, info.description]) {
        expect(body).not.toMatch(ADDRESS);
        const allowed = configPrices();
        for (const price of body.match(/[\d,]+원/g) ?? []) expect(allowed).toContain(price);
      }
    });

    it(`${id}: no product meta copy or not-yet-open features`, () => {
      const { text } = textOf(Page);
      expect(text).not.toMatch(/예시예요|같은 품질|곧 열려요|준비 중|별자리 인연|켈틱/);
    });
  }

  it("reads like a person wrote it (under the readings' AI-tell threshold)", () => {
    const lines = (parts: Array<string | undefined>) => parts.filter(Boolean).join("\n");
    const faq = faqGroups().flatMap((group) => group.entries.map((entry) => lines([entry.q, ...entry.a])));
    const help = helpGroups().flatMap((group) => group.items.map((item) => lines([item.title, item.sub, item.body, ...(item.steps ?? []), item.tip])));
    for (const unit of [...faq, ...help]) expect(aiTells(unit).map((tell) => tell.id), unit).toEqual([]);
    for (const Page of [AboutPage, HowPage]) {
      const { container } = render(<Page />);
      const blocks = [...container.querySelectorAll("article p, article li")].map((el) => el.textContent ?? "");
      expect(aiTells(lines(blocks)).length).toBeLessThan(AI_TELL_THRESHOLD);
      cleanup();
    }
  });

  it("lists the four pages in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const info of Object.values(INFO_PAGES)) expect(urls).toContain(`${SITE.url}${info.path}`);
  });
});

describe("/faq", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  function readJsonLd(container: HTMLElement) {
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    return JSON.parse(scripts[0]?.textContent ?? "") as {
      "@context": string;
      "@type": string;
      mainEntity: Array<{ "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }>;
    };
  }

  it("carries valid FAQPage JSON-LD that says exactly what the page shows", () => {
    const { container } = render(<FaqPage />);
    const data = readJsonLd(container);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("FAQPage");

    const cards = [...container.querySelectorAll("details")];
    expect(cards.length).toBeGreaterThanOrEqual(10);
    expect(cards.length).toBeLessThanOrEqual(14);
    expect(data.mainEntity).toHaveLength(cards.length);

    data.mainEntity.forEach((question, i) => {
      expect(question["@type"]).toBe("Question");
      expect(question.acceptedAnswer["@type"]).toBe("Answer");
      const card = cards[i];
      expect(card?.querySelector("summary")?.textContent).toContain(question.name);
      const paragraphs = [...(card?.querySelectorAll("p") ?? [])].map((p) => p.textContent).join(" ");
      expect(paragraphs).toBe(question.acceptedAnswer.text);
      expect(question.name.trim()).not.toBe("");
      expect(question.acceptedAnswer.text.trim()).not.toBe("");
    });
  });

  it("escapes < so no answer can close the script tag", () => {
    const { container } = render(<FaqPage />);
    const raw = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? "";
    expect(raw).not.toContain("<");
  });

  it("answers the doubts people have before paying", () => {
    const questions = faqGroups().flatMap((group) => group.entries.map((entry) => entry.q));
    for (const topic of ["무료", "열기 전에", "AI 챗봇", "매번", "저장", "태어난 시간", "환불", "기록", "미성년자", "광고"]) {
      expect(questions.some((q) => q.includes(topic))).toBe(true);
    }
  });

  it("says ads appear on guide articles only, and that there are none while AdSense is off", () => {
    const ads = (on: boolean) => faqGroups({ ads: on }).flatMap((group) => group.entries).find((entry) => entry.id === "ads")?.a.join(" ") ?? "";
    expect(ads(true)).toContain("가이드 글 페이지에만");
    expect(ads(true)).toContain("풀이");
    expect(ads(false)).toContain("지금은 광고가 없어요");

    vi.stubEnv("ADSENSE_CLIENT", "");
    expect(render(<FaqPage />).container.textContent).toContain("지금은 광고가 없어요");
  });

  it("gives the contact email from SITE", () => {
    const { container } = render(<FaqPage />);
    expect(container.textContent).toContain(SITE.business.email);
  });
});

describe("/help", () => {
  afterEach(() => {
    cleanup();
  });

  it("has the five category chips, each jumping to its group", () => {
    const { container } = render(<HelpPage />);
    const chips = [...container.querySelectorAll('nav[aria-label="이용 가이드 분류"] a')];
    expect(chips.map((chip) => chip.textContent)).toEqual(["시작하기", "타로", "사주", "기록과 공유", "혜택"]);
    for (const chip of chips) {
      const id = chip.getAttribute("href")?.slice(1) ?? "";
      expect(container.querySelector(`section[id="${id}"]`)).not.toBeNull();
    }
  });

  it("gives every card an icon, a title and a one-line subtitle", () => {
    const { container } = render(<HelpPage />);
    const cards = [...container.querySelectorAll("details")];
    expect(cards).toHaveLength(helpGroups().reduce((n, group) => n + group.items.length, 0));
    for (const card of cards) {
      const summary = card.querySelector("summary");
      expect(summary?.querySelector("svg")).not.toBeNull();
      expect(summary?.textContent?.trim()).not.toBe("");
    }
  });

  it("covers the features that work today", () => {
    const titles = helpGroups().flatMap((group) => group.items.map((item) => item.title));
    for (const title of ["질문 만들기", "직접 쓰기 칸", "카드 고르기", "다시 섞기", "사주 보기", "시간 몰라도 돼요", "상태 칩", "지금의 한 장", "오늘의 한 장", "이어서 물어보기", "내 기록", "돌아보기", "공유하기", "가격과 무료 범위"]) {
      expect(titles).toContain(title);
    }
  });
});
