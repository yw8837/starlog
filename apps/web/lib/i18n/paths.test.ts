import { describe, expect, it } from "vitest";
import { KO_REWRITE_PATTERN, localeRedirects, localeRewrites } from "./routing";
import { isLocalizable, localePath, localizeHref, splitLocale, switchPath } from "./paths";

describe("the Korean rewrite", () => {
  const rewritten = new RegExp(`^(?:${KO_REWRITE_PATTERN})$`);

  it("sends unprefixed page paths to /ko", () => {
    for (const path of ["tarot/new", "guide/the-fool", "b/K7Q2ZX", "english-guide", "japan", "zh-hantx", "ranking/aries"]) {
      expect(rewritten.test(path), path).toBe(true);
    }
  });

  it("leaves locale prefixes, the API, Next internals and files alone", () => {
    for (const path of ["en", "en/tarot/new", "ja", "zh-hant", "zh-hant/guide/tarot", "ko", "ko/tarot", "api/tarot/draw", "_next/static/chunks/a.js", "sitemap.xml", "cards/major-00-fool.webp", "llms.txt", "favicon.ico"]) {
      expect(rewritten.test(path), path).toBe(false);
    }
  });

  it("rewrites / and /:path before files, and redirects /ko back to the root for good", () => {
    expect(localeRewrites().beforeFiles).toEqual([
      { source: "/", destination: "/ko" },
      { source: `/:path(${KO_REWRITE_PATTERN})`, destination: "/ko/:path" },
    ]);
    expect(localeRedirects().slice(0, 2)).toEqual([
      { source: "/ko", destination: "/", permanent: true },
      { source: "/ko/:path*", destination: "/:path*", permanent: true },
    ]);
    expect(localeRedirects()).toContainEqual({ source: "/ja/guide", destination: "/ja/guide/tarot", permanent: true });
  });
});

describe("paths", () => {
  it("keeps Korean paths as they are and prefixes the others", () => {
    expect(localePath("ko", "/tarot/new")).toBe("/tarot/new");
    expect(localePath("en", "/tarot/new")).toBe("/en/tarot/new");
    expect(localePath("zh-hant", "/")).toBe("/zh-hant");
  });

  it("splits a browser pathname into its locale and bare path", () => {
    expect(splitLocale("/ja/guide/tarot")).toEqual({ locale: "ja", path: "/guide/tarot" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/english-guide")).toEqual({ locale: "ko", path: "/english-guide" });
  });

  it("localizes internal page links only", () => {
    expect(localizeHref("ja", "/tarot/new?topic=love#top")).toBe("/ja/tarot/new?topic=love#top");
    for (const href of ["/api/version", "/rss.xml", "https://example.com/", "//cdn.example.com/a", "#faq", "?keep=1", "/en/tarot/new"]) {
      expect(localizeHref("ja", href), href).toBe(href);
      expect(isLocalizable(href), href).toBe(false);
    }
  });

  it("finds the same page in another locale", () => {
    expect(switchPath("/ja/tarot/new", "en")).toBe("/en/tarot/new");
    expect(switchPath("/tarot/new", "zh-hant")).toBe("/zh-hant/tarot/new");
    expect(switchPath("/en/faq", "ko")).toBe("/faq");
  });
});
