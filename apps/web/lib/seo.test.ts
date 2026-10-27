import { CONSTELLATIONS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { dynamic as robotsDynamic, GET as robotsRoute } from "@/app/robots.txt/route";
import { dynamic as sitemapDynamic, GET as sitemapRoute } from "@/app/sitemap.xml/route";
import { SITE } from "./config";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES } from "./guide";
import { FEED_URL, absoluteUrl } from "./hosts";
import { NAMED_CRAWLERS, daumWebmasterLine, robotsTxt } from "./robots";
import { pageMetadata, siteVerification, sitemapEntries, sitemapEntriesFor, sitemapXml } from "./seo";

/** The two real hosts, and a host that is neither (localhost, a preview): that one gets the app. */
const APP = SITE.url;
const GUIDE = SITE.guideUrl;
const request = (origin: string, path: string) => new Request(`${origin}${path}`);

interface Listed {
  url: string;
  lastModified?: string;
  changeFrequency?: string;
  priority?: number;
}

/** The <url> blocks of a sitemap, as the route wrote them. */
function parseSitemap(xml: string): Listed[] {
  return [...xml.matchAll(/<url>\n([\s\S]*?)<\/url>/g)].map(([, body = ""]) => {
    const field = (name: string) => new RegExp(`<${name}>(.*)</${name}>`).exec(body)?.[1];
    const priority = field("priority");
    return { url: field("loc") ?? "", lastModified: field("lastmod"), changeFrequency: field("changefreq"), priority: priority === undefined ? undefined : Number(priority) };
  });
}

const appResponse = await sitemapRoute(request(APP, "/sitemap.xml"));
const appXml = await appResponse.text();
const guideXml = await (await sitemapRoute(request(GUIDE, "/sitemap.xml"))).text();

describe("sitemap on the app host", () => {
  const entries = parseSitemap(appXml);
  const urls = entries.map((entry) => entry.url);
  const entry = (path: string) => entries.find((e) => e.url === absoluteUrl(path));

  it("lists the entry points, the free daily cards, pricing and every policy page on the app host", () => {
    for (const path of ["/tarot/new", "/saju/new", "/now", "/today", "/pricing", "/refund", "/terms", "/privacy"]) {
      expect(urls).toContain(`${SITE.url}${path}`);
    }
    for (const path of ["/about", "/how", "/help", "/faq"]) expect(urls).toContain(`${SITE.url}${path}`);
    expect(urls).toContain(`${SITE.url}/`);
    expect(urls.every((url) => url.startsWith(`${SITE.url}/`))).toBe(true);
  });

  it("lists no guide page: they live on the root domain, and /guide on this host redirects there", () => {
    expect(urls.filter((url) => new URL(url).pathname.startsWith("/guide"))).toEqual([]);
    expect(urls).not.toContain(`${SITE.url}/guide`);
    expect(urls).not.toContain(`${GUIDE}/guide/tarot`);
    expect(urls).not.toContain(`${GUIDE}/`);
  });

  it("leaves lastmod off the policies (their only date is the 시행일, which is still ahead) and off pages without a content date", () => {
    for (const path of ["/refund", "/terms", "/privacy"]) {
      expect(entry(path), path).toBeDefined();
      expect(entry(path)?.lastModified, path).toBeUndefined();
    }
    for (const path of ["/", "/now", "/today", "/faq"]) expect(entry(path)?.lastModified).toBeUndefined();
  });

  it("lists neither /lucky nor /ranking, nor the twelve sign rankings: their lists load in the browser, so the server sends a loading state, and no page links to them", () => {
    expect(SITE.features.bonds).toBe(true);
    for (const path of ["/lucky", "/ranking"]) expect(urls).not.toContain(`${SITE.url}${path}`);
    expect(CONSTELLATIONS).toHaveLength(12);
    for (const sign of CONSTELLATIONS) expect(urls, sign.id).not.toContain(`${SITE.url}/ranking/${sign.id}`);
    expect(urls.filter((url) => /^\/(lucky|ranking)(\/|$)/.test(new URL(url).pathname))).toEqual([]);
    expect(sitemapEntries().some((e) => e.path === "/lucky" || e.path.startsWith("/ranking"))).toBe(false);
  });

  it("lists each page once and leaves out personal and in-progress pages", () => {
    expect(new Set(urls).size).toBe(urls.length);
    const personal = /^\/(chapter|story|me|invite|dev|api|b|bonds|login|owner)(\/|$)|^\/tarot\/(draw|result|new\/situation)|^\/saju\/chart/;
    expect(urls.filter((url) => personal.test(new URL(url).pathname))).toEqual([]);
  });
});

describe("sitemap on the root domain", () => {
  const entries = parseSitemap(guideXml);
  const urls = entries.map((entry) => entry.url);
  const entry = (path: string) => entries.find((e) => e.url === absoluteUrl(path));

  it("lists both guide tabs (the tarot tab at the root domain's /), the editorial page and every article on the root domain, and nothing else", () => {
    expect(urls).toEqual(expect.arrayContaining([`${GUIDE}/`, `${GUIDE}/guide/saju`, `${GUIDE}/guide/about`]));
    for (const article of GUIDE_ARTICLES) expect(urls, article.slug).toContain(`${GUIDE}/guide/${article.slug}`);
    expect(urls).toHaveLength(3 + GUIDE_ARTICLES.length);
    expect(urls.filter((url) => url !== `${GUIDE}/`).every((url) => url.startsWith(`${GUIDE}/guide/`))).toBe(true);
  });

  it("includes every guide article with its updated date as lastmod, and each tab with its newest article's", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(entry(`/guide/${article.slug}`)?.lastModified, article.slug).toBe(article.updated);
    }
    for (const category of GUIDE_CATEGORIES) {
      const newest = GUIDE_ARTICLES.filter((article) => article.category === category).map((article) => article.updated ?? "").sort().at(-1);
      expect(entry(`/guide/${category}`)?.lastModified, category).toBe(newest);
    }
  });

  it("leaves out /guide and /guide/tarot, which permanently redirect to the root domain's /", () => {
    expect(urls).not.toContain(`${GUIDE}/guide`);
    expect(urls).not.toContain(`${GUIDE}/guide/tarot`);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("sitemap.xml route", () => {
  it("answers the root domain with the guide's sitemap, and every other host with the app's", async () => {
    expect(await (await sitemapRoute(request(GUIDE, "/sitemap.xml"))).text()).toBe(sitemapXml("guide"));
    for (const origin of [APP, "http://localhost:3100", "http://localhost:8787", "http://127.0.0.1:3100", "https://starlog.example.workers.dev"]) {
      expect(await (await sitemapRoute(request(origin, "/sitemap.xml"))).text(), origin).toBe(sitemapXml("app"));
    }
    expect(sitemapXml("app")).not.toBe(sitemapXml("guide"));
  });

  it("keeps the shape Next's own sitemap route wrote: XML declaration, urlset, one <url> per entry in loc, lastmod, changefreq, priority order", () => {
    for (const host of ["app", "guide"] as const) {
      const xml = sitemapXml(host);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>')).toBe(true);
      expect(xml.endsWith("</url>\n</urlset>\n")).toBe(true);
      expect(xml.match(/<url>/g)).toHaveLength(sitemapEntriesFor(host).length);
    }
    const guideEntry = sitemapEntriesFor("guide")[0];
    expect(sitemapXml("guide")).toContain(
      `<url>\n<loc>${absoluteUrl(guideEntry?.path ?? "")}</loc>\n<lastmod>${guideEntry?.lastModified}</lastmod>\n<changefreq>${guideEntry?.changeFrequency}</changefreq>\n<priority>${guideEntry?.priority}</priority>\n</url>\n`,
    );
    expect(sitemapXml("app")).toContain("<url>\n<loc>https://starlog.yeolmaeapps.kr/</loc>\n<changefreq>daily</changefreq>\n<priority>1</priority>\n</url>\n");
  });

  it("splits the entries by host and together they are every indexable page", () => {
    const app = sitemapEntriesFor("app").map((e) => e.path);
    const guide = sitemapEntriesFor("guide").map((e) => e.path);
    expect(guide.every((path) => path.startsWith("/guide/"))).toBe(true);
    expect(app.some((path) => path.startsWith("/guide"))).toBe(false);
    expect([...app, ...guide].sort()).toEqual(sitemapEntries().map((e) => e.path).sort());
  });

  it("never lists a lastmod that is still ahead, on either host", () => {
    const now = Date.now();
    const dated = [...parseSitemap(appXml), ...parseSitemap(guideXml)].filter((listed) => listed.lastModified !== undefined);
    expect(dated.length).toBeGreaterThanOrEqual(GUIDE_ARTICLES.length);
    for (const { url, lastModified } of dated) {
      // A date is the start of that day in Korea, where the dates are written.
      expect(Date.parse(`${lastModified}T00:00:00+09:00`), `${url} ${lastModified}`).toBeLessThanOrEqual(now);
    }
  });

  it("depends on the request's host, so it is never prerendered, and says it can be revalidated", () => {
    expect(sitemapDynamic).toBe("force-dynamic");
    expect(appResponse.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(appResponse.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });
});

const robotsOf = async (origin: string) => (await robotsRoute(request(origin, "/robots.txt"))).text();
const response = await robotsRoute(request(APP, "/robots.txt"));
const text = await response.text();

/** Crawlers that only gather training data: Cloudflare's managed robots block and the edge keep them out (owner, 2026-10-08), so no group of ours may let them in. */
const TRAINING_ONLY = ["Google-Extended", "Applebot-Extended", "GPTBot", "ClaudeBot", "Amazonbot", "Meta-ExternalAgent", "CCBot"];

/** The User-agent names (lower case) of every group that has an Allow rule; a group is its User-agent lines and the rules after them. */
function allowedAgents(robots: string): string[] {
  const agents: string[] = [];
  let group: string[] = [];
  let hasRules = false;
  let hasAllow = false;
  const close = () => {
    if (hasAllow) agents.push(...group);
    group = [];
    hasRules = false;
    hasAllow = false;
  };
  for (const line of robots.split("\n")) {
    const agent = /^User-agent:\s*(\S+)/i.exec(line)?.[1];
    if (agent !== undefined) {
      if (hasRules) close();
      group.push(agent.toLowerCase());
    } else if (/^(Allow|Disallow):/i.test(line)) {
      hasRules = true;
      if (/^Allow:/i.test(line)) hasAllow = true;
    }
  }
  close();
  return agents;
}

describe("robots.txt", () => {
  const lines = text.split("\n");
  const values = (field: string) => lines.filter((line) => line.startsWith(`${field}: `)).map((line) => line.slice(field.length + 2));

  it("is plain text with one group for every search and answer crawler", () => {
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const agents = values("User-agent");
    expect(agents[0]).toBe("*");
    for (const bot of ["Googlebot", "Yeti", "NaverBot", "Bingbot", "Daumoa", "Applebot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User", "MistralAI-User"]) {
      expect(agents, bot).toContain(bot);
    }
    expect(agents).toEqual(["*", ...NAMED_CRAWLERS]);
    // One group: no rule line comes before the last User-agent line.
    const lastAgent = lines.findLastIndex((line) => line.startsWith("User-agent: "));
    const firstRule = lines.findIndex((line) => /^(Allow|Disallow): /.test(line));
    expect(firstRule).toBeGreaterThan(lastAgent);
  });

  it("lets no training-only crawler into an allow group, on either host: Cloudflare's block and the edge keep them out", async () => {
    for (const origin of [APP, GUIDE]) {
      const allowed = allowedAgents(await robotsOf(origin));
      expect(allowed, origin).toEqual(expect.arrayContaining(["googlebot", "oai-searchbot", "claude-searchbot"]));
      for (const bot of TRAINING_ONLY) expect(allowed, `${origin} ${bot}`).not.toContain(bot.toLowerCase());
    }
    for (const bot of TRAINING_ONLY) expect(NAMED_CRAWLERS, bot).not.toContain(bot);
  });

  it("keeps the API and personal pages out, but lets link previews fetch /api/og/", () => {
    const disallow = values("Disallow");
    for (const path of ["/api/", "/chapter", "/dev", "/invite", "/pay"]) expect(disallow).toContain(path);
    expect(values("Allow")).toEqual(["/", "/api/og/"]);
  });

  it("leaves /me, /story, /bonds and the /b invites crawlable: they carry noindex (lib/seo.pages.test.ts), and a crawler that may not fetch a page never reads it", () => {
    const disallow = values("Disallow");
    for (const path of ["/me", "/story", "/bonds", "/b", "/b/ABC234"]) expect(disallow.some((rule) => path.startsWith(rule)), path).toBe(false);
    expect(disallow).toEqual(["/api/", "/chapter", "/dev", "/invite", "/pay"]);
  });

  it("does not block the public pages, the rankings included", () => {
    const disallow = values("Disallow");
    const publicPaths = ["/", "/pricing", "/refund", "/terms", "/privacy", "/guide/tarot", "/guide/the-fool", "/now", "/today", "/ranking", "/ranking/aries", "/lucky", "/llms.txt", "/tarot/new", "/saju/new"];
    for (const path of publicPaths) expect(disallow.some((rule) => path.startsWith(rule)), path).toBe(false);
  });

  it("points at its own host's sitemap and llms.txt: the root domain's for the guide, the app's for every other host", async () => {
    const pointers = async (origin: string) => (await robotsOf(origin)).split("\n").filter((line) => line.startsWith("Sitemap: ") || line.includes("/llms.txt"));
    expect(await pointers(GUIDE)).toEqual([`# About the service for language models: ${GUIDE}/llms.txt`, `Sitemap: ${GUIDE}/sitemap.xml`]);
    expect(await pointers(APP)).toEqual([`# About the service for language models: ${APP}/llms.txt`, `Sitemap: ${APP}/sitemap.xml`]);
    expect(values("Sitemap")).toEqual([`${SITE.url}/sitemap.xml`]);
    for (const origin of ["http://localhost:3100", "http://localhost:8787", "https://starlog.example.workers.dev"]) expect(await pointers(origin), origin).toEqual(await pointers(APP));
  });

  it("gives both hosts the same rules, and depends on the request's host, so it is never prerendered", async () => {
    const rules = async (origin: string) => (await robotsOf(origin)).split("\n").filter((line) => /^(User-agent|Allow|Disallow): /.test(line));
    expect(await rules(GUIDE)).toEqual(await rules(APP));
    expect(robotsDynamic).toBe("force-dynamic");
  });

  it("adds the Daum 웹마스터도구 line only when its code is set, whole line or code alone", () => {
    expect(robotsTxt({ daum: "" })).not.toContain("DaumWebMasterTool");
    const code = "2e3b08a507e2acc3f28c65113723c370:oqGG0QNteBAx1EjTM8fgkA==";
    for (const value of [code, `#DaumWebMasterTool:${code}`, `  #DaumWebMasterTool:${code}\n`]) {
      expect(robotsTxt({ daum: value }).trimEnd().split("\n").at(-1)).toBe(`#DaumWebMasterTool:${code}`);
    }
    expect(daumWebmasterLine("not a code\nUser-agent: *")).toBeNull();
  });
});

describe("search console verification", () => {
  it("writes each engine's meta tag only for the codes that are set", () => {
    expect(siteVerification({})).toBeUndefined();
    expect(siteVerification({ google: " g-code ", naver: "n-code", bing: "b-code" })).toEqual({
      google: "g-code",
      other: { "naver-site-verification": "n-code", "msvalidate.01": "b-code" },
    });
    expect(siteVerification({ naver: "n-code" })).toEqual({ other: { "naver-site-verification": "n-code" } });
  });

  it("takes one code per registered site, comma-separated (guide domain and app host)", () => {
    expect(siteVerification({ naver: " n-apex , n-app ", bing: "b-code," })).toEqual({
      other: { "naver-site-verification": ["n-apex", "n-app"], "msvalidate.01": "b-code" },
    });
    expect(siteVerification({ google: ",", naver: " " })).toBeUndefined();
  });
});

describe("pageMetadata", () => {
  it("sets the canonical, og:url, the shared image and the feed link", () => {
    const meta = pageMetadata({ title: "제목", description: "설명", path: "/faq" });
    expect(meta.alternates?.canonical).toBe("/faq");
    expect(meta.alternates?.types).toHaveProperty("application/rss+xml");
    expect(meta.openGraph).toMatchObject({ type: "website", url: "/faq", locale: "ko_KR", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] });
  });

  it("marks articles with their dates and their editor, the owner by name (the Article JSON-LD's author)", () => {
    const meta = pageMetadata({ title: "제목", description: "설명", path: "/guide/the-fool", type: "article", publishedTime: "2026-10-01", modifiedTime: "2026-10-02" });
    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-01", modifiedTime: "2026-10-02", authors: [SITE.business.ceo] });
  });

  it("gives a guide page the root domain's address in full as its canonical and og:url, whatever host serves it", () => {
    for (const path of ["/guide/saju", "/guide/the-fool"]) {
      const meta = pageMetadata({ title: "제목", description: "설명", path });
      expect(meta.alternates?.canonical, path).toBe(`${GUIDE}${path}`);
      expect(meta.openGraph, path).toMatchObject({ url: `${GUIDE}${path}` });
    }
    // The guide's home, the tarot tab, is the root domain's own "/".
    const home = pageMetadata({ title: "제목", description: "설명", path: "/guide/tarot" });
    expect(home.alternates?.canonical).toBe(`${GUIDE}/`);
    expect(home.openGraph).toMatchObject({ url: `${GUIDE}/` });
    expect(pageMetadata({ title: "제목", description: "설명", path: "/guide/the-fool", type: "article" }).openGraph).toMatchObject({ type: "article", url: `${GUIDE}/guide/the-fool` });
  });

  it("points every page's feed link at the guide's feed on the root domain", () => {
    expect(FEED_URL).toBe(`${GUIDE}/rss.xml`);
    for (const path of ["/faq", "/guide/tarot"]) {
      expect(pageMetadata({ title: "제목", description: "설명", path }).alternates?.types).toEqual({ "application/rss+xml": [{ url: FEED_URL, title: `${SITE.nameKo} 가이드` }] });
    }
  });
});
