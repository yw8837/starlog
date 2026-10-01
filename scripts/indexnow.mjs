// IndexNow: tells the IndexNow search engines (Bing, Naver, Yandex, Seznam, Yep and others share one
// endpoint) that the site's pages changed, so they recrawl them soon. Google does not take IndexNow;
// use Search Console there (docs/seo/indexing-runbook.md).
//
// usage (after a production deploy):
//   pnpm indexnow                    every URL in the live sitemap
//   pnpm indexnow --dry-run          print what would be sent, send nothing
//   pnpm indexnow <url> [<url> ...]  only these URLs (e.g. one updated guide article)
//   pnpm indexnow --sitemap <url>    another sitemap (default: <site>/sitemap.xml)
//
// The key is the 32-hex file in apps/web/public (<key>.txt, served at /<key>.txt); INDEXNOW_KEY
// overrides it. The script checks that the live key file answers with the key before sending.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const DEFAULT_SITE = "https://starlog.yeolmaeapps.kr";
/** The protocol's limit per request. */
export const MAX_URLS = 10_000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = join(root, "apps/web/public");

const KEY_FILE = /^([0-9a-f]{32})\.txt$/;

/** The key from the one <32 hex>.txt in public/, whose content must be the key itself. */
export function findKey(publicDir = PUBLIC_DIR) {
  const keys = readdirSync(publicDir).flatMap((name) => {
    const match = KEY_FILE.exec(name);
    return match ? [match[1]] : [];
  });
  if (keys.length !== 1) throw new Error(`expected one IndexNow key file (<32 hex>.txt) in ${publicDir}, found ${keys.length}`);
  const [key] = keys;
  const content = readFileSync(join(publicDir, `${key}.txt`), "utf8").trim();
  if (content !== key) throw new Error(`${key}.txt must contain exactly the key`);
  return key;
}

const decodeXml = (text) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Every <loc> of a sitemap (or sitemap index), in order, without duplicates. */
export function parseSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => decodeXml(match[1]));
  return [...new Set(locs)];
}

/** IndexNow JSON bodies: same-host URLs only, at most MAX_URLS per request. */
export function buildPayloads({ site = DEFAULT_SITE, key, urls }) {
  const { host, origin } = new URL(site);
  const foreign = urls.filter((url) => new URL(url).host !== host);
  if (foreign.length) throw new Error(`URLs outside ${host}: ${foreign.join(", ")}`);
  const payloads = [];
  for (let i = 0; i < urls.length; i += MAX_URLS) {
    payloads.push({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls.slice(i, i + MAX_URLS) });
  }
  return payloads;
}

/** What each IndexNow status means, for the owner reading the output. */
export const STATUS_HELP = {
  200: "접수됐어요.",
  202: "접수됐어요. 키 파일 확인은 아직 진행 중이에요.",
  400: "요청 형식이 잘못됐어요.",
  403: "키가 맞지 않아요. 배포된 /<key>.txt 내용을 확인해 주세요.",
  422: "주소가 이 사이트(host)에 속하지 않거나 키와 맞지 않아요.",
  429: "너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요.",
};

function parseArgs(argv) {
  const args = { dryRun: false, sitemap: null, urls: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sitemap") args.sitemap = argv[++i];
    else if (arg.startsWith("http")) args.urls.push(arg);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const site = process.env.INDEXNOW_SITE || DEFAULT_SITE;
  const key = process.env.INDEXNOW_KEY || findKey();

  let urls = args.urls;
  if (urls.length === 0) {
    const sitemapUrl = args.sitemap || new URL("/sitemap.xml", site).toString();
    const response = await fetch(sitemapUrl);
    if (!response.ok) throw new Error(`sitemap ${sitemapUrl}: HTTP ${response.status}`);
    urls = parseSitemap(await response.text());
    console.log(`sitemap ${sitemapUrl}: ${urls.length}개 주소`);
  }
  if (urls.length === 0) throw new Error("보낼 주소가 없어요.");

  const payloads = buildPayloads({ site, key, urls });
  if (args.dryRun) {
    for (const payload of payloads) console.log(JSON.stringify(payload, null, 2));
    console.log(`dry run: ${urls.length}개 주소, 요청 ${payloads.length}번 (보내지 않았어요)`);
    return;
  }

  const keyLocation = payloads[0].keyLocation;
  const keyResponse = await fetch(keyLocation);
  const served = keyResponse.ok ? (await keyResponse.text()).trim() : "";
  if (served !== key) {
    throw new Error(`${keyLocation} 가 키를 돌려주지 않아요 (HTTP ${keyResponse.status}). 배포가 끝났는지 확인해 주세요.`);
  }

  let failed = false;
  for (const payload of payloads) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const help = STATUS_HELP[response.status] ?? "";
    console.log(`IndexNow ${response.status}: ${payload.urlList.length}개 주소. ${help}`);
    if (response.status >= 400) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`indexnow: ${error.message}`);
    process.exit(1);
  });
}
