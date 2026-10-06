// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutPage, { metadata as aboutMeta } from "@/app/about/page";
import FaqPage, { metadata as faqMeta } from "@/app/faq/page";
import HelpPage, { metadata as helpMeta } from "@/app/help/page";
import HowPage, { metadata as howMeta } from "@/app/how/page";
import { AI_TELL_THRESHOLD, aiTells } from "@/lib/ai/style";
import { SITE, won } from "@/lib/config";
import { faqGroups } from "@/lib/faq";
import { helpGroups } from "@/lib/helpGuide";
import { INFO_PAGES, type InfoPageId } from "@/lib/infoPages";
import { sitemapXml } from "@/lib/seo";

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

/** Street-address shapes: "…로 12", "…길 3", "…시 …구". The particle in "바탕으로 78장" is not a road name. */
const ADDRESS = /주소|[가-힣]+(?:(?<!으)로|길)\s?\d+|[가-힣]+(?:시|도)\s[가-힣]+(?:구|군|시)\b/;

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
      expect(text).not.toMatch(/예시예요|같은 품질|곧 열려요|준비 중|켈틱/);
      // 별자리 인연 may be named only while it is open: SITE.features.bonds, the flag the FAQ copy and the policies follow.
      if (!SITE.features.bonds) expect(text).not.toContain("별자리 인연");
    });
  }

  it("the address check catches road addresses, not the particle 으로 before a number", () => {
    for (const address of ["동삼서로 51-7", "테헤란로 152", "충무로 3", "사업장 주소"]) expect(address).toMatch(ADDRESS);
    expect("요즘 해석을 바탕으로 78장을 한 장씩 정리해요").not.toMatch(ADDRESS);
  });

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

  it("lists the four pages in the app host's sitemap", () => {
    const xml = sitemapXml("app");
    for (const info of Object.values(INFO_PAGES)) expect(xml).toContain(`<loc>${SITE.url}${info.path}</loc>`);
  });
});

/** The four answers that build trust, word for word as the owner approved them, in the order /faq opens with. */
const TRUST = [
  {
    q: "풀이는 어떻게 만들어지나요?",
    a: "타로는 원본 카드와 공식 해설서, 요즘 해석을 바탕으로 78장을 한 장씩 정리한 카드 데이터로 읽어요. 사주는 만세력으로 명식을 계산해요. 풀이 문장은 AI가 이 근거 안에서만 내 질문과 상황에 맞춰 쓰고, 내보내기 전에 정해 둔 규칙으로 한 번 더 검사해요.",
  },
  {
    q: "내 생년월일은 어디에 저장되나요?",
    a: "생년월일은 이 기기(브라우저)에만 저장되고, 내 정보에서 언제든 지울 수 있어요. 별자리 인연에 넣은 친구의 생년월일은 점수를 계산할 때만 쓰고 저장하지 않아요. 비밀번호는 받지 않아요.",
  },
  {
    q: "사주 계산은 믿을 수 있나요?",
    a: "해와 달이 바뀌는 기준은 달력의 1일이 아니라 절기라서, 절기가 바뀌는 시각까지 계산해요. 생년월일 1만 4천여 개를 다른 만세력 계산과 대조했고, 절기 시각은 독립적인 천문 계산과 따로 비교해 1분 안으로 맞는 것을 확인했어요. 절기가 바뀌는 시각 바로 앞뒤에 태어났다면 그 사실도 알려 드려요.",
  },
  {
    q: "결과를 장담하나요?",
    a: '아니요. "다시 만나요", "합격해요" 같은 장담이나 "그 사람도 같은 마음이에요" 같은 남의 마음 단정, 건강·투자 판단은 하지 않아요. 대신 지금의 흐름과 내가 해 볼 수 있는 것을 이야기해요.',
  },
] as const;

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
    expect(cards.length).toBeLessThanOrEqual(18);
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

  it("opens with the four trust questions, in this order, on the page and in the JSON-LD", () => {
    const questions = TRUST.map((entry) => entry.q);
    const { container } = render(<FaqPage />);
    [...container.querySelectorAll("details")].slice(0, questions.length).forEach((card, i) => {
      expect(card.querySelector("summary")?.textContent).toContain(questions[i]);
    });
    expect(readJsonLd(container).mainEntity.slice(0, questions.length).map((question) => question.name)).toEqual(questions);
  });

  it("answers them word for word, and gives every entry an id of its own", () => {
    const entries = faqGroups().flatMap((group) => group.entries);
    for (const { q, a } of TRUST) expect(entries.find((entry) => entry.q === q)?.a.join(" "), q).toBe(a);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names 별자리 인연 in the birth-date answer only while it is open", () => {
    const entries = (bonds: boolean) => faqGroups({ site: { ...SITE, features: { ...SITE.features, bonds } } }).flatMap((group) => group.entries);
    const birthDate = (bonds: boolean) => entries(bonds).find((entry) => entry.q === TRUST[1].q)?.a.join(" ");
    expect(birthDate(true)).toBe(TRUST[1].a);
    expect(birthDate(false)).toBe("생년월일은 이 기기(브라우저)에만 저장되고, 내 정보에서 언제든 지울 수 있어요. 비밀번호는 받지 않아요.");
    expect(entries(false).flatMap((entry) => [entry.q, ...entry.a]).join(" ")).not.toContain("별자리 인연");
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

  it("never asks for a one-line concern on the saju side", () => {
    const saju = helpGroups().find((group) => group.id === "saju")!;
    expect(JSON.stringify(saju)).not.toMatch(/고민 한 줄|고민을 한 줄/);
  });

  it("explains 다른 운 보기 only while the topics are on (saju-topics owner cut §0)", () => {
    const sajuOf = (sajuTopics: "on" | "off") => helpGroups({ ...SITE, features: { ...SITE.features, sajuTopics } }).find((group) => group.id === "saju")!;
    const on = sajuOf("on");
    expect(on.items.map((item) => item.title)).toEqual(["사주 보기", "다른 운 보기", "시간 몰라도 돼요", "상태 칩", "맛보기와 전체 풀이"]);
    expect(JSON.stringify(on)).toContain("다른 운도 볼 수 있어요");
    const off = sajuOf("off");
    expect(off.items.map((item) => item.title)).toEqual(["사주 보기", "시간 몰라도 돼요", "상태 칩", "첫 장과 전체 풀이"]);
    expect(JSON.stringify(off)).not.toMatch(/다른 운|사주팔자|직장운|고민 한 줄|고민을 한 줄/);
  });
});
