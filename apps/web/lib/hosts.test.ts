import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "./config";
import { guideIndexPath } from "./guideMeta";
import { FEED_URL, GUIDE_HOME, absoluteUrl, appHref, guideHref, hostOfPath, isGuidePath, linkHref, originOf, siteOfRequest, splitHosts } from "./hosts";

/** The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; every other build, dev server and test leaves it off. */
const FLAG = "NEXT_PUBLIC_SPLIT_HOSTS";

beforeEach(() => vi.stubEnv(FLAG, ""));
afterEach(() => vi.unstubAllEnvs());

describe("the two hosts", () => {
  it("keeps the app on starlog and the guides on the root domain", () => {
    expect(SITE.url).toBe("https://starlog.yeolmaeapps.kr");
    expect(SITE.guideUrl).toBe("https://yeolmaeapps.kr");
    expect(originOf("app")).toBe(SITE.url);
    expect(originOf("guide")).toBe(SITE.guideUrl);
  });

  it("calls /guide and everything under it a guide page, and nothing else", () => {
    for (const path of ["/guide", "/guide/tarot", "/guide/saju", "/guide/the-fool", "/guide/a/b"]) {
      expect(isGuidePath(path), path).toBe(true);
      expect(hostOfPath(path), path).toBe("guide");
    }
    for (const path of ["/", "/me", "/story", "/faq", "/tarot/new", "/guidebook", "/guide-x", "/en/guide/tarot", "/rss.xml", "/api/guide"]) {
      expect(isGuidePath(path), path).toBe(false);
      expect(hostOfPath(path), path).toBe("app");
    }
  });
});

describe("absoluteUrl", () => {
  it("names the one real home of a page: guide pages on the root domain, the rest on the app host", () => {
    expect(absoluteUrl("/guide/the-fool")).toBe("https://yeolmaeapps.kr/guide/the-fool");
    expect(absoluteUrl("/tarot/new")).toBe("https://starlog.yeolmaeapps.kr/tarot/new");
    expect(absoluteUrl("/")).toBe("https://starlog.yeolmaeapps.kr/");
    expect(absoluteUrl("/#organization")).toBe("https://starlog.yeolmaeapps.kr/#organization");
  });

  it("names the root domain's own / for the guide's home, the tarot tab, and its full path for every other tab", () => {
    expect(GUIDE_HOME).toBe(guideIndexPath("tarot"));
    expect(absoluteUrl("/guide/tarot")).toBe("https://yeolmaeapps.kr/");
    expect(absoluteUrl("/guide/saju")).toBe("https://yeolmaeapps.kr/guide/saju");
    expect(absoluteUrl("/guide")).toBe("https://yeolmaeapps.kr/guide");
  });

  it("does not depend on the build flag: canonicals, JSON-LD, sitemaps and feeds always name the real home", () => {
    expect(absoluteUrl("/guide/saju")).toBe("https://yeolmaeapps.kr/guide/saju");
    expect(absoluteUrl("/guide/tarot")).toBe("https://yeolmaeapps.kr/");
    vi.stubEnv(FLAG, "1");
    expect(absoluteUrl("/guide/saju")).toBe("https://yeolmaeapps.kr/guide/saju");
    expect(absoluteUrl("/guide/tarot")).toBe("https://yeolmaeapps.kr/");
    expect(absoluteUrl("/faq")).toBe("https://starlog.yeolmaeapps.kr/faq");
  });

  it("puts the guide's feed on the root domain, next to its articles", () => {
    expect(FEED_URL).toBe("https://yeolmaeapps.kr/rss.xml");
  });
});

describe("splitHosts", () => {
  it("is on for NEXT_PUBLIC_SPLIT_HOSTS=1 and nothing else", () => {
    expect(splitHosts("1")).toBe(true);
    for (const value of [undefined, "", "0", "true", "yes", " 1", "on"]) expect(splitHosts(value), String(value)).toBe(false);
  });

  it("reads the build flag when it is called, so a test can turn it on", () => {
    expect(splitHosts()).toBe(false);
    vi.stubEnv(FLAG, "1");
    expect(splitHosts()).toBe(true);
  });
});

describe("guideHref and appHref", () => {
  it("stay relative with the flag off: next dev, the OpenNext preview and the e2e suite run on one origin", () => {
    expect(guideHref("/guide/saju")).toBe("/guide/saju");
    expect(guideHref("/guide/tarot")).toBe("/guide/tarot");
    expect(guideHref("/guide/the-fool")).toBe("/guide/the-fool");
    expect(appHref("/tarot/new")).toBe("/tarot/new");
    expect(appHref("/tarot/new?new=1")).toBe("/tarot/new?new=1");
    expect(appHref("/")).toBe("/");
  });

  it("are absolute on their own host with the flag on (the real deploy build)", () => {
    vi.stubEnv(FLAG, "1");
    expect(guideHref("/guide/saju")).toBe("https://yeolmaeapps.kr/guide/saju");
    expect(guideHref("/guide/tarot")).toBe("https://yeolmaeapps.kr/");
    expect(guideHref("/guide/redrawing-same-question")).toBe("https://yeolmaeapps.kr/guide/redrawing-same-question");
    expect(appHref("/tarot/new")).toBe("https://starlog.yeolmaeapps.kr/tarot/new");
    expect(appHref("/saju/new?new=1")).toBe("https://starlog.yeolmaeapps.kr/saju/new?new=1");
    expect(appHref("/")).toBe("https://starlog.yeolmaeapps.kr/");
  });
});

describe("linkHref", () => {
  const paths = ["/", "/story", "/faq", "/guide/tarot", "/guide/the-fool"];

  it("keeps every link a path with the flag off, on either host", () => {
    for (const from of ["app", "guide"] as const) for (const path of paths) expect(linkHref(path, from), `${from} ${path}`).toBe(path);
  });

  it("with the flag on, makes only the links that cross hosts absolute, and sends the guide's home to the root domain's /", () => {
    vi.stubEnv(FLAG, "1");
    // A page on the app host: its own links stay paths, a guide link goes to the root domain.
    expect(linkHref("/", "app")).toBe("/");
    expect(linkHref("/story", "app")).toBe("/story");
    expect(linkHref("/guide/tarot", "app")).toBe("https://yeolmaeapps.kr/");
    expect(linkHref("/guide/saju", "app")).toBe("https://yeolmaeapps.kr/guide/saju");
    // The default is the app host.
    expect(linkHref("/guide/the-fool")).toBe("https://yeolmaeapps.kr/guide/the-fool");
    expect(linkHref("/faq")).toBe("/faq");
    // A guide page: its own links stay paths (the guide's home is the root domain's "/"), an app link goes to the app host.
    expect(linkHref("/guide/tarot", "guide")).toBe("/");
    expect(linkHref("/guide/saju", "guide")).toBe("/guide/saju");
    expect(linkHref("/guide/the-fool", "guide")).toBe("/guide/the-fool");
    expect(linkHref("/", "guide")).toBe("https://starlog.yeolmaeapps.kr/");
    expect(linkHref("/story", "guide")).toBe("https://starlog.yeolmaeapps.kr/story");
    expect(linkHref("/faq", "guide")).toBe("https://starlog.yeolmaeapps.kr/faq");
  });
});

describe("siteOfRequest", () => {
  const site = (url: string) => siteOfRequest(new Request(url));

  it("tells the root domain's guide from the app by the request's host", () => {
    expect(site("https://yeolmaeapps.kr/robots.txt")).toBe("guide");
    expect(site("https://yeolmaeapps.kr/")).toBe("guide");
    expect(site("https://starlog.yeolmaeapps.kr/robots.txt")).toBe("app");
  });

  it("takes every other host (localhost, previews, the Worker's own) for the app", () => {
    for (const url of ["http://localhost:3100/robots.txt", "http://localhost:8787/sitemap.xml", "http://127.0.0.1:3100/", "https://starlog.example.workers.dev/", "https://evil-yeolmaeapps.kr/", "https://yeolmaeapps.kr.example.com/"]) {
      expect(site(url), url).toBe("app");
    }
  });
});
