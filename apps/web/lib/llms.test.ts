import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GET as llmsFullRoute } from "@/app/llms-full.txt/route";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { GET as rssRoute } from "@/app/rss.xml/route";
import { buildPayloads, findKey, groupBySite, MAX_URLS, parseSitemap, plan, SITES } from "../../../scripts/indexnow.mjs";
import { MODEL_NAMES } from "./ai/style";
import { SITE, won } from "./config";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES } from "./guide";
import { FEED_URL } from "./hosts";
import { serviceFacts } from "./llms";

const llms = await llmsRoute().text();
const llmsFull = await llmsFullRoute().text();

describe("llms.txt", () => {
  it("follows llmstxt.org: one H1, a blockquote summary, then sections of links", () => {
    const lines = llms.split("\n");
    expect(lines[0]).toBe(`# ${SITE.nameKo} (${SITE.name})`);
    expect(lines.filter((line) => line.startsWith("# "))).toHaveLength(1);
    expect(lines[2]?.startsWith("> ")).toBe(true);
    expect(llms).toContain("## 주요 페이지");
    expect(llms).toContain("## Optional");
    for (const line of lines.filter((l) => l.startsWith("- ["))) expect(line).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)]+\): .+/);
  });

  it("links every guide article and tab on the root domain, and the entry pages on the app host", () => {
    for (const article of GUIDE_ARTICLES) expect(llms).toContain(`(${SITE.guideUrl}/guide/${article.slug})`);
    for (const category of GUIDE_CATEGORIES) expect(llms).toContain(`(${SITE.guideUrl}/guide/${category})`);
    for (const path of ["/tarot/new", "/saju/new", "/now", "/today", "/faq", "/how", "/about", "/pricing", "/llms-full.txt"]) {
      expect(llms).toContain(`(${SITE.url}${path})`);
    }
    // No guide address is left on the app host (it redirects), and the app's pages are not on the root domain.
    expect(llms).not.toContain(`${SITE.url}/guide`);
    expect(llms).not.toContain(`${SITE.guideUrl}/tarot`);
  });

  it("states the facts from SITE: the free daily reading, the price, the follow-ups", () => {
    const facts = serviceFacts().join("\n");
    expect(facts).toContain(won(SITE.price.tarotStandardKrw));
    expect(facts).toContain("하루 한 번 무료");
    expect(facts).toContain(`이어서 물어보기를 ${SITE.reading.followUps}번`);
    expect(facts).toContain("1909년");
    expect(facts).toContain("만세력");
  });

  it("llms-full.txt carries every article in full, its 요약 first, and the FAQ", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(llmsFull).toContain(`### ${article.title}`);
      expect(llmsFull).toContain(`주소: ${SITE.guideUrl}/guide/${article.slug}`);
      expect(llmsFull).toContain(`요약: ${article.summary}`);
      for (const section of article.sections) expect(llmsFull).toContain(section.body);
    }
    expect(llmsFull).toContain("## 자주 묻는 질문");
  });

  it("never names the model or vendor behind readings, and never says 베타", () => {
    for (const text of [llms, llmsFull]) {
      // The file names /llms.txt and /llms-full.txt are the convention's, not a model name.
      expect(text.replace(/\/llms(-full)?\.txt/g, "")).not.toMatch(MODEL_NAMES);
      expect(text).not.toContain("베타");
    }
  });
});

const rss = rssRoute();
const xml = await rss.text();

describe("rss.xml", () => {
  it("is RSS 2.0 with one item per guide article, each with its 요약 and date", () => {
    expect(rss.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<item>/g)).toHaveLength(GUIDE_ARTICLES.length);
    for (const article of GUIDE_ARTICLES) expect(xml).toContain(`<link>${SITE.guideUrl}/guide/${article.slug}</link>`);
    expect(xml.match(/<pubDate>/g)).toHaveLength(GUIDE_ARTICLES.length);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("keeps the whole feed on the root domain: its guids, its channel link and its own address", () => {
    expect(xml).not.toContain(`${SITE.url}/guide`);
    for (const article of GUIDE_ARTICLES) expect(xml).toContain(`<guid isPermaLink="true">${SITE.guideUrl}/guide/${article.slug}</guid>`);
    expect(xml).toContain(`<link>${SITE.guideUrl}/guide/tarot</link>`);
    expect(xml).toContain(`<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>`);
    expect(FEED_URL).toBe(`${SITE.guideUrl}/rss.xml`);
  });
});

describe("IndexNow", () => {
  const publicDir = fileURLToPath(new URL("../public", import.meta.url));

  it("serves exactly one 32-hex key file whose content is the key", () => {
    const key = findKey(publicDir);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(readdirSync(publicDir).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name))).toEqual([`${key}.txt`]);
    expect(readFileSync(`${publicDir}/${key}.txt`, "utf8")).toBe(key);
  });

  it("reads every <loc> from a sitemap, decoding entities and dropping duplicates", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>${SITE.url}/</loc></url><url><loc> ${SITE.url}/guide/the-fool </loc></url><url><loc>${SITE.url}/a?b=1&amp;c=2</loc></url><url><loc>${SITE.url}/</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([`${SITE.url}/`, `${SITE.url}/guide/the-fool`, `${SITE.url}/a?b=1&c=2`]);
  });

  it("sends same-host URLs with the key location, in requests of at most 10,000", () => {
    const urls = Array.from({ length: MAX_URLS + 5 }, (_, i) => `${SITE.url}/p${i}`);
    const payloads = buildPayloads({ site: SITE.url, key: "k".repeat(32), urls });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ host: new URL(SITE.url).host, key: "k".repeat(32), keyLocation: `${SITE.url}/${"k".repeat(32)}.txt` });
    expect(payloads[0]?.urlList).toHaveLength(MAX_URLS);
    expect(() => buildPayloads({ site: SITE.url, key: "k", urls: ["https://example.com/"] })).toThrow(/outside/);
  });

  it("knows both hosts: the app's and the guide's on the root domain, as SITE has them", () => {
    expect(SITES).toEqual([SITE.url, SITE.guideUrl]);
  });

  it("groups URLs by the host they are on, the app first, so each goes out under its own host and key location", () => {
    const urls = [`${SITE.guideUrl}/guide/the-fool`, `${SITE.url}/tarot/new`, `${SITE.guideUrl}/guide/tarot`, `${SITE.url}/`];
    const groups = groupBySite(urls);
    expect(groups).toEqual([
      { site: SITE.url, urls: [`${SITE.url}/tarot/new`, `${SITE.url}/`] },
      { site: SITE.guideUrl, urls: [`${SITE.guideUrl}/guide/the-fool`, `${SITE.guideUrl}/guide/tarot`] },
    ]);
    for (const { site, urls: group } of groups) {
      const [payload] = buildPayloads({ site, key: "k".repeat(32), urls: group });
      expect(payload).toMatchObject({ host: new URL(site).host, keyLocation: `${site}/${"k".repeat(32)}.txt`, urlList: group });
    }
    expect(groupBySite([`${SITE.guideUrl}/guide/tarot`])).toEqual([{ site: SITE.guideUrl, urls: [`${SITE.guideUrl}/guide/tarot`] }]);
    expect(() => groupBySite(["https://example.com/", `${SITE.url}/`])).toThrow(/outside/);
    expect(() => groupBySite([`${SITE.url}.evil.example/`])).toThrow(/outside/);
  });

  describe("plan", () => {
    const sitemaps: Record<string, string> = {
      [`${SITE.url}/sitemap.xml`]: `<urlset><url><loc>${SITE.url}/</loc></url><url><loc>${SITE.url}/tarot/new</loc></url></urlset>`,
      [`${SITE.guideUrl}/sitemap.xml`]: `<urlset><url><loc>${SITE.guideUrl}/guide/tarot</loc></url><url><loc>${SITE.guideUrl}/guide/saju</loc></url></urlset>`,
      "https://preview.example/sitemap.xml": "<urlset><url><loc>https://preview.example/a</loc></url></urlset>",
    };
    const fetched: string[] = [];
    const fetchSitemap = async (url: string) => {
      fetched.push(url);
      const xml = sitemaps[url];
      if (xml === undefined) throw new Error(`no sitemap at ${url}`);
      return xml;
    };
    const run = (options: { urls?: string[]; sitemap?: string | null; sites?: string[] }) => {
      fetched.length = 0;
      return plan({ urls: [], sitemap: null, sites: SITES, ...options }, fetchSitemap);
    };

    it("reads the sitemap of both hosts by default and sends each host's URLs under that host", async () => {
      expect(await run({})).toEqual([
        { site: SITE.url, urls: [`${SITE.url}/`, `${SITE.url}/tarot/new`] },
        { site: SITE.guideUrl, urls: [`${SITE.guideUrl}/guide/tarot`, `${SITE.guideUrl}/guide/saju`] },
      ]);
      expect(fetched).toEqual([`${SITE.url}/sitemap.xml`, `${SITE.guideUrl}/sitemap.xml`]);
    });

    it("sends only the URLs it is given, grouped by host, without fetching a sitemap", async () => {
      expect(await run({ urls: [`${SITE.guideUrl}/guide/the-fool`, `${SITE.url}/faq`] })).toEqual([
        { site: SITE.url, urls: [`${SITE.url}/faq`] },
        { site: SITE.guideUrl, urls: [`${SITE.guideUrl}/guide/the-fool`] },
      ]);
      expect(fetched).toEqual([]);
    });

    it("narrows a run to one host (INDEXNOW_SITE) or to one sitemap (--sitemap)", async () => {
      expect(await run({ sites: [SITE.guideUrl] })).toEqual([{ site: SITE.guideUrl, urls: [`${SITE.guideUrl}/guide/tarot`, `${SITE.guideUrl}/guide/saju`] }]);
      expect(fetched).toEqual([`${SITE.guideUrl}/sitemap.xml`]);
      expect(await run({ sitemap: "https://preview.example/sitemap.xml" })).toEqual([{ site: "https://preview.example", urls: ["https://preview.example/a"] }]);
      expect(fetched).toEqual(["https://preview.example/sitemap.xml"]);
      // Explicit URLs outside the allowed hosts are refused.
      await expect(run({ urls: [`${SITE.url}/faq`], sites: [SITE.guideUrl] })).rejects.toThrow(/outside/);
    });
  });
});
