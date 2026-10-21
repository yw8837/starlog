import { describe, expect, it } from "vitest";
import { GA_CONFIG, gaLocation, gaPage, gaReferrer } from "./analytics";

const APP = "https://starlog.yeolmaeapps.kr";
const GUIDES = "https://yeolmaeapps.kr";

describe("GA_CONFIG: no page_view of its own, no Google signals, no ad personalization", () => {
  it("is exactly the three switches", () => {
    expect(GA_CONFIG).toEqual({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  });
});

describe("gaLocation: the address GA may see", () => {
  const cases: Array<[string, string]> = [
    // An id, a code or a token in the path: the bare prefix.
    [`${APP}/s/abc123?x=1#top`, `${APP}/s/`],
    [`${APP}/b/K7Q2ZP`, `${APP}/b/`],
    [`${APP}/b/K7Q2ZP?utm_source=kakao`, `${APP}/b/?utm_source=kakao`],
    [`${APP}/chapter/8f2c1d`, `${APP}/chapter/`],
    [`${APP}/chapter/sample`, `${APP}/chapter/`],
    [`${APP}/invite/abc123`, `${APP}/invite/`],
    // /pay: the path only (Toss returns paymentKey, orderId and amount; checkout carries returnTo).
    [`${APP}/pay/success?paymentKey=tgen_1&orderId=o1&amount=2900&utm_source=x`, `${APP}/pay/success`],
    [`${APP}/pay/fail?code=PAY_PROCESS_CANCELED&message=x`, `${APP}/pay/fail`],
    [`${APP}/pay/checkout?product=tarot&returnTo=%2Fchapter%2F8f2c1d`, `${APP}/pay/checkout`],
    // Everywhere else: utm_* kept in order, every other parameter and the hash dropped.
    [`${APP}/tarot/new?utm_source=threads&fbclid=x&utm_medium=social&ref=y&utm_campaign=launch#top`, `${APP}/tarot/new?utm_source=threads&utm_medium=social&utm_campaign=launch`],
    [`${APP}/?visit=first`, `${APP}/`],
    [`${APP}/s`, `${APP}/s`],
    [`${APP}/ranking/aries`, `${APP}/ranking/aries`],
    [`${GUIDES}/guide/the-hermit?q=1`, `${GUIDES}/guide/the-hermit`],
    ["http://localhost:3100/b/K7Q2ZP?code=1", "http://localhost:3100/b/"],
    // Compared in lower case: another spelling of an id path is still redacted.
    [`${APP}/S/abc123`, `${APP}/s/`],
    [`${APP}/Chapter/8f2c1d`, `${APP}/chapter/`],
    [`${APP}/PAY/success?paymentKey=tgen_1&utm_source=x`, `${APP}/PAY/success`],
  ];
  for (const [href, expected] of cases) {
    it(`${href} → ${expected}`, () => expect(gaLocation(href)).toBe(expected));
  }
});

describe("gaReferrer: our pages redacted the same way, other sites as their origin, none omitted", () => {
  const cases: Array<[string, string, string | undefined]> = [
    ["", APP, undefined],
    [`${APP}/s/abc123?x=1`, APP, `${APP}/s/`],
    [`${GUIDES}/guide/the-fool?utm_source=x&q=1`, APP, `${GUIDES}/guide/the-fool?utm_source=x`],
    [`${APP}/b/K7Q2ZP`, GUIDES, `${APP}/b/`],
    ["http://localhost:3100/chapter/8f2c1d", "http://localhost:3100", "http://localhost:3100/chapter/"],
    ["https://www.google.com/search?q=%ED%83%80%EB%A1%9C", APP, "https://www.google.com"],
    ["https://m.search.naver.com/search.naver?query=x", APP, "https://m.search.naver.com"],
    ["android-app://com.google.android.gm/", APP, undefined],
    ["not a url", APP, undefined],
  ];
  for (const [referrer, here, expected] of cases) {
    it(`${referrer || "(none)"} on ${here} → ${expected ?? "(omitted)"}`, () => expect(gaReferrer(referrer, here)).toBe(expected));
  }
});

describe("gaPage: one page_view's fields, never a raw title that can carry a reading", () => {
  it("first page: the redacted location, the document's referrer, the document's title", () => {
    expect(gaPage(`${APP}/tarot/new?utm_source=threads&x=1`, "타로 · 스타로그", "https://www.google.com/search?q=x", null).fields).toEqual({
      page_location: `${APP}/tarot/new?utm_source=threads`,
      page_title: "타로 · 스타로그",
      page_referrer: "https://www.google.com",
    });
    expect(gaPage(`${APP}/`, "스타로그", "", null).fields).toEqual({ page_location: `${APP}/`, page_title: "스타로그" });
  });

  it("pages with an id in the path get a fixed title (a share's title names its cards; the PDF's title is set on /chapter)", () => {
    const title = (path: string, raw: string) => gaPage(`${APP}${path}`, raw, "", null).fields.page_title;
    expect(title("/s/abc123", "친구가 뽑은 카드 · 바보, 마법사 · 스타로그")).toBe("공유된 풀이 · 스타로그");
    expect(title("/b/K7Q2ZP", "별자리 인연 초대 · 스타로그")).toBe("별자리 인연 초대 · 스타로그");
    expect(title("/chapter/8f2c1d", "스타로그-타로-2026-10-30")).toBe("내 기록 · 스타로그");
    expect(title("/invite/abc123", "카드 한 장 부탁 · 스타로그")).toBe("카드 한 장 부탁 · 스타로그");
    expect(title("/ranking/aries", "양자리 랭킹 · 스타로그")).toBe("양자리 랭킹 · 스타로그");
    expect(title("/S/abc123", "친구가 뽑은 카드 · 바보 · 스타로그")).toBe("공유된 풀이 · 스타로그");
  });

  it("later pages: the page before as referrer, and a title still the one hidden on the page before is not sent", () => {
    const share = gaPage(`${APP}/s/abc123`, "친구가 뽑은 카드 · 바보 · 스타로그", "https://www.instagram.com/", null);
    expect(share.fields.page_referrer).toBe("https://www.instagram.com");
    // The next page's title has not replaced the share's yet.
    const early = gaPage(`${APP}/tarot/new`, "친구가 뽑은 카드 · 바보 · 스타로그", "https://www.instagram.com/", share);
    expect(early.fields).toEqual({ page_location: `${APP}/tarot/new`, page_title: "스타로그", page_referrer: `${APP}/s/` });
    const settled = gaPage(`${APP}/tarot/new`, "타로 · 스타로그", "https://www.instagram.com/", share);
    expect(settled.fields.page_title).toBe("타로 · 스타로그");
    expect(gaPage(`${APP}/me`, "내 정보 · 스타로그", "", settled).fields).toEqual({ page_location: `${APP}/me`, page_title: "내 정보 · 스타로그", page_referrer: `${APP}/tarot/new` });
  });

  it("an empty document title goes as the site's name", () => {
    expect(gaPage(`${APP}/now`, "", "", null).fields.page_title).toBe("스타로그");
  });
});
