# Starlog SEO / AEO / GEO audit (read-only, pre-launch)

- Date: 2026-10-14. Live commit under test: main = 72c35ec. Hosts: app `https://starlog.yeolmaeapps.kr`, guide `https://yeolmaeapps.kr` (apex).
- Method: GET/HEAD only against production, sequential with pauses, no cookies, no POST, no /api calls except one GET of `/api/version` (200 JSON). Audit UA `Mozilla/5.0 (compatible; StarlogSEOAudit/1.0)`. Crawler-UA probes were sent from my own IP (spoofed UA, see SEO-02 caveat). No repo file was edited.
- Raw captures: `C:\Users\최용우\AppData\Local\Temp\claude\D--Money-apps\013ec1b2-b9fa-4ac8-9b03-125ade5c49ca\scratchpad\` (cache/, P.pkl, sitemap_*.xml, llms*_*.txt).
- Headline: no Critical. All 86 sitemap URLs return 200 in one hop, are self-canonical on the right host, indexable, unique title and description, one `lang="ko"`, valid JSON-LD, and the article body is in the raw HTML. The issues are edge/config (http, PerplexityBot, www), content consistency (login vs no-login), a few thin sitemap entries, and AEO heading polish.

## 1. Summary table

| id | severity | host | finding |
|---|---|---|---|
| SEO-01 | Medium | both | `http://` is served as 200 with no redirect to https (no "Always Use HTTPS") |
| SEO-02 | Medium | both | PerplexityBot gets 403 at the edge although robots.txt names and welcomes it |
| SEO-03 | Medium | app (+llms) | Pages disagree on whether login/accounts exist and whether the server stores readings; llms.txt, FAQ, help, about say "no login, nothing on the server", pricing, tarot/new, terms, privacy, refund say login + account storage |
| SEO-04 | Medium | app | `/lucky` and `/ranking` are in the sitemap but are empty "loading/empty-state" shells with zero inbound internal links |
| SEO-05 | Medium | guide | AEO: 20 of 22 major-arcana articles use generic H2s ("정방향으로 읽을 때") with no card name or question; 30 of 68 articles have no question-form heading; 54 of 446 H2s are questions |
| SEO-06 | Low | app | `/today` has no H1 in the server HTML (it appears only after hydration) |
| SEO-07 | Low | guide | Entity markup on the apex names the app host: WebSite/Organization `@id`/`url` are starlog.*, no WebSite node for yeolmaeapps.kr, no `sameAs` anywhere |
| SEO-08 | Low | guide | E-E-A-T on articles: author/publisher is the Organization only; no visible byline, no visible first-published date, no in-article link to /evidence |
| SEO-09 | Low | guide | 693 of 716 `<img>` have `alt=""`; card grids (suit pages, overview, court cards, guide home) carry no per-card alt |
| SEO-10 | Low | both | Snippet tuning: guide meta descriptions are short (55 to 70 chars), 4 titles are long enough to truncate, `/how` description is long |
| SEO-11 | Low | both | Two-hop redirect chains for trailing-slash guide URLs and apex `/pricing/`; the apex 404 page uses relative app links that 307 |
| SEO-12 | Low | www | `www.yeolmaeapps.kr` does not resolve (DNS error) |
| SEO-13 | Low | app | `/tarot` and `/saju` return 404; the entries are `/tarot/new` and `/saju/new` |
| SEO-14 | Low | app | Pages that are both robots-disallowed and noindex (`/me`, `/story`, `/bonds`); `/me` and `/story` are linked from the nav on 78 of 86 pages |
| SEO-15 | Low (unverified) | both | Bing meta (`msvalidate.01`) absent from live HTML and `/BingSiteAuth.xml` is 404; a single Naver code is served on both hosts; no Daum line in robots.txt |
| SEO-16 | Low | guide | No `max-image-preview:large`; one shared OG image for every page; non-card Article JSON-LD has only that one image |
| SEO-17 | Low | guide | BreadcrumbList has no visible counterpart and its first crumb is on the other host |
| SEO-18 | Low | both | Internal linking from guide to the free tools is thin (`/today` 2 pages, `/now` 3), and 3 articles have a single inbound link |
| SEO-19 | Info | both | Training crawlers (GPTBot, ClaudeBot, Google-Extended, ...) are blocked by design; search/answer bots are allowed |
| SEO-20 | Info | both | Existing FAQPage (15 pages) and HowTo (5 articles) JSON-LD: valid, no SERP benefit; do not extend |
| SEO-21 | Info | both | robots.txt carries two `User-agent: *` groups (Cloudflare managed + app); merged by RFC 9309 parsers |
| SEO-22 | Info | both | llms.txt, llms-full.txt, rss.xml are byte-identical on both hosts; llms-full.txt is 415 KB |
| SEO-23 | Info | both | HTML has no ETag/Last-Modified (only `s-maxage=31536000`); no conditional crawling |
| SEO-24 | Info | both | `/googledd9706d0d479c62e.html` 307s to the extensionless path (meta verification also present) |
| SEO-25 | Info | both | Performance as measured, and what could not be measured |

## 2. Findings

### SEO-01 Medium, both hosts: http:// not redirected to https
- Evidence: `curl -I http://starlog.yeolmaeapps.kr/` returns `HTTP/1.1 200 OK` with `Strict-Transport-Security: max-age=63072000; includeSubDomains` (browsers ignore HSTS received over http). `curl -I http://yeolmaeapps.kr/guide/the-hermit` returns `HTTP/1.1 200 OK`. Python requests, no redirect following: `http://starlog.yeolmaeapps.kr/` 200, `http://yeolmaeapps.kr/` 200, `http://yeolmaeapps.kr/guide/the-hermit` 200.
- Impact: every URL has an indexable http twin. Canonicals point at https so Google will consolidate, but Naver/Daum/Bing and any http backlink may keep the http copy, and link equity from http links is not forwarded by a 301.
- Fix: Cloudflare dashboard, SSL/TLS, Edge Certificates, "Always Use HTTPS" on the zone (or a Redirect Rule http to https, 301). No repo change. Effort S.

### SEO-02 Medium, both hosts: PerplexityBot 403 vs robots.txt welcome
- Evidence (GET, UA `...compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot`): `https://yeolmaeapps.kr/guide/the-hermit` 403, body `Your request was blocked.` (text/plain, 25 B); `https://starlog.yeolmaeapps.kr/` 403 same body; `https://yeolmaeapps.kr/robots.txt` 200. Same article URL with other UAs: OAI-SearchBot 200, ChatGPT-User 200, Claude-SearchBot 200, Claude-User 200, Perplexity-User 200, Googlebot 200, Bingbot 200, Yeti 200, Daumoa 200, Applebot 200, all returning the identical 140,934-byte HTML (no cloaking; the only diff against a curl UA is Cloudflare's analytics beacon). GPTBot 403, ClaudeBot 403 (intended, SEO-19). `apps/web/lib/robots.ts:38` lists `"PerplexityBot"` in NAMED_CRAWLERS ("AI search crawlers the owner wants citing the site"), and live robots.txt has `User-agent: PerplexityBot` in the Allow group.
- Caveat: the probe came from my IP with a spoofed UA, so it shows a UA-based edge rule, not what the real Perplexity IPs get. Confirm in Cloudflare Security, Events (filter UA contains PerplexityBot).
- Impact: robots.txt promises access that the edge denies; Perplexity cannot cite the guides.
- Fix: Cloudflare, Security, Bots / AI Crawl Control: allow PerplexityBot (keep the training crawlers blocked), or delete PerplexityBot from `NAMED_CRAWLERS` if blocking is intended. Effort S.

### SEO-03 Medium, app host and llms files: contradictory product facts
- Evidence (live text):
  - No login / nothing on server: `/faq` "지금은 로그인 없이 모든 기능을 쓸 수 있어요" and "로그인이 없어서 다른 기기나 다른 브라우저에서는 보이지 않아요"; `/about` "스타로그 서버에는 풀이 기록을 쌓지 않아요"; `/help` "가입이나 로그인 없이 모든 기능을 쓸 수 있어요"; llms.txt and llms-full.txt "서버에는 풀이 기록을 쌓지 않아요" (sources: `lib/faq.ts:97`, `lib/helpGuide.ts:104-106`, `lib/llms.ts:25`).
  - Login + account storage: `/pricing` "로그인해서 연 풀이는 계정에도 보관돼 다른 기기에서 볼 수 있어요" (`app/pricing/page.tsx:98`); `/tarot/new` same sentence (`components/seo/toolGuides.tsx:243`) plus "계정 하나에 한 번이고, 90일 안에 쓸 수 있어요"; `/terms` (카카오/Google 로그인, 가입 선물); `/privacy` ("로그인해서 연 풀이는 ... 운영자의 저장소(Cloudflare D1)에 보관", 시행일 2026년 10월 15일); `/refund` ("계정에 저장되면"). Meanwhile `/login` returns 404 (not live yet) and `config.ts` `features.payments=false` while `/pricing` and `/refund` describe purchase and refund terms as if live and llms.txt says "결제 기능은 준비 중이에요".
- Impact: AI engines and users quote whichever page they hit; a policy that says readings are stored in a database next to FAQ text that says the server stores nothing is a trust and compliance problem, and llms.txt is the file models read first.
- Fix: decide the launch state, then align `lib/faq.ts`, `lib/helpGuide.ts`, `lib/llms.ts`, `app/about`, `app/pricing/page.tsx`, `components/seo/toolGuides.tsx` and the policy pages in one commit. HTML is sent with `s-maxage=31536000` and is OpenNext-cached, so confirm the deploy refreshes prerendered pages. Effort S to M (copy), owner decision needed.

### SEO-04 Medium, app host: `/lucky` and `/ranking` thin, orphaned, in sitemap
- Evidence: `/lucky` server text is 108 non-space chars ("... 번호를 불러오는 중이에요 ..."), canonical self, no robots meta. `/ranking` shows the same empty state twelve times ("첫 1위 자리 아직 완성한 별자리가 없어요"). Across the 86 sitemap pages no `<a>` points to `/lucky` or `/ranking` (they appear only in sitemap.xml and llms.txt). `lib/seo.ts:146-148` adds both when `features.bonds` is on; the comment above `sitemapEntries` already excludes `/ranking/<sign>` for the identical "불러오는 중 shell" reason.
- Impact: "Crawled, currently not indexed" or soft-404 treatment for 2 of the 16 app URLs; no link equity.
- Fix: drop both from `sitemapEntries` until they have server-rendered content, or SSR an explanatory paragraph and link them from the home/footer. Effort S.

### SEO-05 Medium, guide: AEO headings in card articles
- Evidence: `the-fool` H2s are `그림 속 장면 / 정방향으로 읽을 때 / 역방향으로 읽을 때 / 연애·일·돈 질문에서 / 비슷한 카드와 헷갈릴 때`; `the-hermit` and `the-star` already use `은둔자 카드 정방향은 어떤 뜻인가요`. Articles with zero question-form H2: 30 of 68 (the 20 major arcana except hermit/star, `celtic-cross-spread`, `minor-arcana-suits`, `major-and-minor-arcana`, `major-arcana-overview`, `ten-gods`, `saju-compatibility`, `jasi-birth`, `saju-birth-info`, `wolun-iljin`, `saju-glossary`). Overall 54 of 446 H2s read as questions. Source: `lib/guide-articles/tarot.ts:26,30,74,78,122,126,...`.
- What is good (68 of 68): a 요약 block first (120 to 228 chars, median 171), 3 "한눈에 보기" bullets, `<time datetime>` update date, first sentence is usually definitional ("은둔자는 메이저 아르카나 9번 카드로, ..."). Card articles have a 270-char first paragraph per section; guide-topic articles have short (about 70 chars) lead paragraphs followed by lists/tables.
- Impact: passage retrievers and answer engines chunk by heading; "정방향으로 읽을 때" has no entity, so the chunk is not self-contained, and these are the highest-demand queries ("바보 카드 정방향 뜻").
- Fix: template the headings as `<카드명> 카드 정방향은 어떤 뜻인가요` / `역방향은 ...` (isQuestion in `lib/jsonld.ts` already recognises 나요/까요/가요). Effort M (scriptable over tarot.ts).

### SEO-06 Low, app: `/today` has no H1 in server HTML
- Evidence: raw HTML of `https://starlog.yeolmaeapps.kr/today`: first heading is `<h2 ... id="today-guide">오늘의 한 장은 이렇게 봐요</h2>`; the page title is `<p class="Stepper-...__title">오늘의 한 장</p>`. After hydration (browser pane) there is one H1 "오늘의 타로 카드를 골라 볼까요?". Code: `app/today/TodayView.tsx:198` renders `content = null` while `saved === undefined`, so the server output has no H1 and no interactive area.
- Impact: non-JS crawlers (most AI fetchers) see no H1; Googlebot's rendered DOM is fine.
- Fix: in the `saved === undefined` branch render `<h1 className="sr-only">오늘의 한 장</h1>` (or the visible h1). Effort S.

### SEO-07 Low, guide: entity markup tied to the app host
- Evidence: on `https://yeolmaeapps.kr/` the JSON-LD is Organization `@id https://starlog.yeolmaeapps.kr/#organization`, WebSite `@id https://starlog.yeolmaeapps.kr/#website` with `url https://starlog.yeolmaeapps.kr/`, BreadcrumbList, ItemList. All 86 pages carry both nodes (`components/seo/JsonLd.tsx:11-18`, `lib/jsonld.ts:16-17,45,58`). 0 of 86 Organization nodes have `sameAs`. Logo is present and resolves (512x512 PNG, 200).
- Impact: yeolmaeapps.kr has no WebSite node of its own, so the site name Google shows for the apex falls back to title/og:site_name or the bare domain; no external profile ties 열매스튜디오 / 스타로그 together.
- Fix: emit a guide-host WebSite (`@id https://yeolmaeapps.kr/#website`, name "스타로그 가이드", `isPartOf`/`publisher` the shared Organization) on guide pages; add `sameAs` once real profiles exist (e.g. the Threads account); do not invent profiles. Effort S.

### SEO-08 Low, guide: visible E-E-A-T
- Evidence: article header shows only `<time datetime="2026-10-08">2026년 10월 8일</time> 업데이트`; no byline, no first-published date on the page (JSON-LD has `datePublished` 2026-09-30/10-01/10-06), no reviewer. `Article.author` and `publisher` are both the Organization `열매스튜디오` (no Person). Strong points: Waite page citations in card articles, a separate `/evidence` page, full business registration in the footer.
- Impact: weak author signal for answer engines that weigh named experts.
- Fix: visible line "열매스튜디오 · 최초 게시 ... · 업데이트 ..." with a link to `/evidence` and `/how`; optionally a named editor/reviewer in the Article author. Effort S to M.

### SEO-09 Low, guide: image alt text
- Evidence: 716 `<img>` across the 86 pages, 693 with `alt=""`, 23 distinct non-empty alts (main card on each card article, e.g. "은둔자 타로 카드"). `wands-suit` has 14 card images plus 19 card backs, all `alt=""`; guide home has 59 `<img>`, all empty. All images have width/height, and 657 are `loading=lazy`.
- Impact: decorative treatment is defensible where the name sits next to the image, but the card grids lose image-search signal.
- Fix: alt = card name for the face images in suit/overview/court grids; keep `""` for backs. Effort S.

### SEO-10 Low, both: snippet length
- Evidence (heuristic: Hangul = 2 width units, about 60 units for a title and about 155 for a description): descriptions on 68 guide pages are 55 to 70 chars (95 to 125 units, under-using the snippet); `/how` is 163 units, `/about` 159 (likely cut); 4 titles exceed 60 units, e.g. "자시 출생 사주, 밤 11시와 자정 사이는 어느 날로 볼까요? · 스타로그" (66), where the brand is cut first. Titles and descriptions are all unique (0 duplicates), brand-last on subpages, brand-first on the app home.
- Fix: lengthen guide descriptions toward 80 to 110 chars; shorten the 4 long titles. Effort S.

### SEO-11 Low, both: redirect chains
- Evidence (status per hop): `https://starlog.yeolmaeapps.kr/guide/the-hermit/` 308 -> `/guide/the-hermit` 308 -> `https://yeolmaeapps.kr/guide/the-hermit` 200; `.../guide/` 308 -> `/guide` 308 -> `https://yeolmaeapps.kr/` 200; `.../guide/tarot/` and `/guide/saju/` the same; on the apex `/guide/` 308 -> `/guide` 308 -> `/`, `/guide/tarot/` 308 -> `/guide/tarot` 308 -> `/`, `/pricing/` 308 -> `/pricing` 307 -> app. One-hop and correct: app `/guide`, `/guide/tarot`, `/guide/saju`, `/guide/<slug>` 308 to apex; apex app paths (`/pricing`, `/today`, `/about`, `/now`, `/faq`, `/tarot/new`, query kept: `/pricing?x=1`) 307 to app; app `/pricing/`, `/today/` 308 single hop. Guide 404s are real 404 (`/guide/does-not-exist` apex 404, app 308 then 404). The apex 404 page links `/about /how /evidence /pricing ...` as relative paths, each a 307 on the apex.
- Impact: low (trailing-slash URLs are rare), but chains waste crawl and leak equity on external links with a slash.
- Fix: in `lib/hostRoutes.ts:77-85` add slash-tolerant sources (`/guide/:path+/`), and render the 404/footer links with `appHref()`. Effort S.

### SEO-12 Low: www does not resolve
- Evidence: `curl https://www.yeolmaeapps.kr/` -> `curl: (6) Could not resolve host`; `http://www.yeolmaeapps.kr/` same.
- Impact: anyone who types or links `www.` gets a browser error; no sitemap, llms file or `apps/web/lib` source references www.
- Fix: proxied DNS record for www plus a 301 to the apex. Effort S.

### SEO-13 Low, app: `/tarot` and `/saju` 404
- Evidence: `https://starlog.yeolmaeapps.kr/tarot` 404 and `/saju` 404 (`noindex`, no canonical); the product entries are `/tarot/new`, `/saju/new`. `/login` and `/pay` also 404 (unlaunched). On the apex `/tarot` 307s to the app `/tarot` and 404s.
- Impact: people and press guessing the obvious URL land on a 404.
- Fix: 308 `/tarot` to `/tarot/new` and `/saju` to `/saju/new` in `next.config.ts` redirects. Effort S.

### SEO-14 Low, app: robots Disallow + noindex on the same URLs
- Evidence: `lib/robots.ts:15` disallows `/me`, `/story`, `/bonds`, `/b/`, `/chapter`, `/invite`, `/pay`, `/dev`, `/api/`; `/me`, `/story`, `/bonds` also return `<meta name="robots" content="noindex, nofollow">`. The nav links `/me` and `/story` on 78 of 86 pages. `/owner` (200, noindex) is not disallowed.
- Impact: Google cannot fetch a disallowed URL to see noindex; with 78 internal links it may list `/me` or `/story` as "URL only".
- Fix: drop `/me`, `/story`, `/bonds` from `ROBOTS_DISALLOW` (the pages are already noindex and their server HTML is a client shell: `/story` 3 chars, `/me` 187 chars of text), or accept the URL-only risk. Effort S.

### SEO-15 Low (unverified), both: search-console verification
- Evidence: 86 of 86 pages carry `google-site-verification` (one value) and `naver-site-verification` (one value `3be26781...`, identical on both hosts); 0 of 86 carry `msvalidate.01`; `/BingSiteAuth.xml` 404 on both hosts. The Bing/Naver/Daum codes are build-time `NEXT_PUBLIC_*` (`lib/seo.ts:76-80`, `lib/robots.ts:46`); live robots.txt has no `#DaumWebMasterTool` line.
- Impact: the brief says Naver and Bing were added. Bing can be verified by Search Console import or DNS, in which case this is fine; if the meta tag was intended, the live build lacks it. Naver Search Advisor issues a code per registered site, and `siteVerification` supports a comma list, but only one code is served.
- Confirm: Bing Webmaster Tools site list shows `yeolmaeapps.kr` and `starlog.yeolmaeapps.kr` verified; Naver 서치어드바이저 shows both hosts verified. Effort S.

### SEO-16 Low, guide: preview images
- Evidence: no `<meta name="robots" ...max-image-preview:large>` on any page; every page's og:image is the same `/opengraph-image` (1200x630 JPEG, 104 KB, 200); non-card articles list only that image in `Article.image` (`lib/jsonld.ts:~108`).
- Fix: set `robots: { googleBot: { "max-image-preview": "large", "max-snippet": -1 } }` in the root metadata (Discover/large previews); per-card og:image for the 22 major-arcana articles (card scans already exist at 600x1040). Effort S.

### SEO-17 Low, guide: BreadcrumbList
- Evidence: article breadcrumb = `스타로그 -> https://starlog.yeolmaeapps.kr/`, `사주 가이드 -> https://yeolmaeapps.kr/guide/saju` (tarot articles: `https://yeolmaeapps.kr/`), article URL; last item equals the page URL on all 70 pages and positions are 1..n. Consistent with the root guide home. But the page shows no breadcrumb (only a back arrow "타로 가이드 목록으로" and the tab bar), and crumb 1 is on the other host.
- Fix: add a visible breadcrumb row, or make crumb 1 the guide home (`https://yeolmaeapps.kr/`). Effort S.

### SEO-18 Low: internal linking
- Evidence (from 86 pages): inbound links to `/today` from 2 pages, `/now` 3, `/tarot/new` 2 (plus 39 with `?new=1`), `/saju/new` only as `?new=1` (33; canonical handles it). Articles with one inbound link: `saju-vs-astrology`, `wolun-iljin`, `bond-score`. 112 distinct internal link targets, all 200.
- Fix: contextual links from the 22 card articles to `/now`, from day-master articles to `/saju/new`; add the three weak articles to "같이 읽어 볼 글". Effort S.

### SEO-19 Info: AI crawler policy
- robots.txt (both hosts) = Cloudflare managed block (Content-Signal `search=yes,ai-train=no,use=reference`; Disallow for GPTBot, ClaudeBot, anthropic-ai, Claude-Web, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, meta-externalagent, GoogleOther, cohere-ai, ...) followed by the app group that allows Googlebot, Googlebot-Image, Yeti, NaverBot, Bingbot, Daumoa, Applebot, DuckDuckBot, YandexBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, MistralAI-User. This matches the stated owner decision (2026-10-08, `lib/robots.ts:1-9`). Note (from my knowledge of Google's crawler docs, not re-verified here): Google-Extended governs Gemini training and grounding use, not Search or AI Overviews. No action beyond SEO-02.

### SEO-20 Info: existing FAQPage / HowTo
- FAQPage on 15 pages (`/faq` plus 14 articles; median 2.5 KB, `/faq` 10 KB), HowTo on `how-to-read-tarot`, `three-card-spread`, `one-card-yes-no`, `now-card-how-to`, `manseryeok`. All parse and match visible text (`app/guide/[slug]/page.tsx:70-71`). No SERP benefit now; harmless; do not add more. If trimming payload, these are the first to go.

### SEO-21 Info: duplicate `*` groups in robots.txt
- Cloudflare's block opens `User-agent: *` (Allow: /), then the app group repeats `User-agent: *` with the Disallow list. RFC 9309 and Google merge them; the named crawlers (Googlebot, Yeti, Bingbot, Daumoa...) use the app group. A parser that stops at the first `*` group would ignore the Disallows. No action.

### SEO-22 Info: llms files
- llms.txt 22,505 B and llms-full.txt 415,089 B (about 180K characters) are identical on both hosts, `text/plain; charset=utf-8`. llms.txt follows the spec (H1, blockquote, H2 link lists, `## Optional`). All 86 links resolve 200; guide URLs are on the apex, app URLs on starlog, no mismatch; it omits only `https://starlog.yeolmaeapps.kr/` (the home) and adds `llms-full.txt`. Content mismatch: SEO-03. llms-full is too large for most context windows; fine as an archive.

### SEO-23 Info: no validators on HTML
- Response headers on `/guide/the-hermit`: `cache-control: s-maxage=31536000, stale-while-revalidate=2592000`, `x-opennext-cache: HIT`, `content-encoding: br`, `server-timing: cfEdge;dur=10,cfOrigin;dur=0,cfWorker;dur=259`; no ETag, no Last-Modified, no cf-cache-status. Crawlers cannot make conditional requests. Optional: ETag from the build id.

### SEO-24 Info: Google verification file
- `GET /googledd9706d0d479c62e.html` -> 307 `Location: /googledd9706d0d479c62e` -> 200 (Workers Static Assets html handling), both hosts. The `google-site-verification` meta is also on all pages, and the owner is already verified. No action.

### SEO-25 Info: performance (measured) and gaps
- curl, 3 tries each, `--compressed`, HTTP/1.1 from Windows curl (server advertises h3). Time in seconds; TTFB includes DNS, TCP and about 0.10 to 0.14 s TLS:

| URL | TTFB (3 tries) | total | wire HTML (br) | HTML decoded |
|---|---|---|---|---|
| app `/` | 0.192 / 0.168 / 0.241 | 0.203 / 0.171 / 0.305 | 18.3 to 19.0 KB | 144 KB |
| app `/tarot/new` | 0.248 / 0.273 / 0.179 | 0.419 / 0.322 / 0.181 | 13.9 KB | 89 KB |
| app `/pricing` | 0.277 / 0.253 / 0.265 | 0.547 / 0.522 / 0.320 | 16.0 to 16.1 KB | 109 KB |
| apex `/` | 0.243 / 0.264 / 0.307 | 0.430 / 0.367 / 0.403 | 21.8 KB | 213 KB |
| apex `/guide/the-hermit` | 0.263 / 0.261 / 0.280 | 0.329 / 0.326 / 0.344 | 20.5 to 20.6 KB | 141 KB |

- Article page head: 5 render-blocking stylesheets (458 KB decoded; the three largest are 17.7 + 26.2 + 21.0 KB over the wire, the two small ones not measured), 16 async JS files (791 KB decoded, wire size not measured), AdSense script preloaded, 19 `<img>` (apex home 59, lazy). Static assets: `_next/static` immutable 1 year, `/cards/*` 7 days.
- One browser-pane navigation (single run, hidden pane): article TTFB 204 ms, DOMContentLoaded 460 ms, load 1,610 ms, 63 resources, 22,097 B transferred; `/today` TTFB 150 ms, DCL 464 ms, load 665 ms, 14,543 B.
- Not measured: LCP, INP, CLS and any Lighthouse score. PageSpeed Insights API returned 429 (keyless quota exhausted) and the browser pane has a 0x0 viewport so no paint or LCP entries exist. Also not measured: Search Console coverage/index status, real-IP behaviour of AI bots, Naver/Bing consoles. CrUX field data does not exist yet for a pre-launch site (unverified).

## 3. GEO and Korean-search notes (no extra findings)
- Citability: every article opens with a self-contained 요약 of 120 to 228 chars (roughly 40 to 70 English-word equivalents) that restates the title question, then "한눈에 보기" bullets. Card articles quote Waite with page numbers. These are good passages to cite; SEO-05 is the main gap.
- Brand entity: "스타로그" (title suffix, WebSite name), "Starlog" (alternateName, og:site_name "Starlog · 스타로그", footer), "열매스튜디오" (Organization/publisher, footer registration) are used consistently on all 86 pages and in llms.txt. The wordmark renders as `Starl<svg>g` with `aria-label="Starlog"`, so plain-text extraction reads "Starl g"; the brand is intact in title, JSON-LD and body copy.
- Naver/Daum: Yeti and Daumoa UAs get 200 and are named in robots.txt; RSS (68 items, valid) is advertised on every page via `<link rel="alternate" type="application/rss+xml">`; Korean titles lead with the topic and end with the brand. Daum 웹마스터도구 line absent (SEO-15).

## 4. Checked and fine
- robots.txt (both hosts): 200 text/plain, correct per-host `Sitemap:` and llms.txt comment line, Disallow list only covers personal/dev paths, `/api/og/` allowed.
- Sitemaps: both 200 `application/xml`; app 16 URLs, apex 70 URLs; every URL 200 in one hop (0 redirects, 0 noindex, 0 canonical mismatch, 0 host mismatch); guide URLs only in the apex sitemap, app URLs only in the app one; lastmod all ≤ 2026-10-08 (no future dates), identical to JSON-LD `dateModified`, `article:modified_time` and the page's `<time>` on all 70 guide URLs; `priority`/`changefreq` present (ignored by Google, harmless).
- RSS `/rss.xml` (both hosts): well-formed RSS 2.0 with atom:link self, 68 items each with title/link/guid(isPermaLink)/pubDate/description/category, all links are sitemap article URLs, none missing, pubDates 2026-09-29T15:00Z to 2026-10-05T15:00Z, lastBuildDate 2026-10-07T15:00Z.
- On-page, all 86 URLs: `<html lang="ko">`, exactly one self-referencing absolute canonical on the right host, unique title and description (0 duplicates), og:title/description/url/type/site_name/locale/image(+width,height,alt) and twitter:card summary_large_image/title/description/image, viewport, doctype, no mixed content, no X-Robots-Tag, no noindex in the sitemap set; exactly one H1 on 85 of 86 (SEO-06 for `/today`); no heading-level skips; JSON-LD: 86 Organization + 86 WebSite + 70 BreadcrumbList + 68 Article + 3 ItemList parsed with no errors, Article has headline (≤110), description, image, datePublished, dateModified, author, publisher, mainEntityOfPage, url == page URL, ISO dates.
- og:image `/opengraph-image` (1200x630 JPEG), `/logo.png` (512x512), favicon.ico, icon.png (192), apple-icon.png (180) all 200 with correct content-types; 107 distinct image URLs (card scans included) all 200 image/*.
- Internal links: 112 distinct targets on the two hosts from 86 pages, all 200 (the 12 `/bonds?sign=<sign>` variants share one route; fetched `/bonds`, `/bonds?sign=aries|leo`, `/me`, `/story`, all 12 `/ranking/<sign>` and both `?new=1` variants: all 200, the sign/personal pages noindex). `?new=1` variants canonicalise to the clean URL. 7 external links all resolve (adssettings.google.com via 6 redirects to 200).
- Server-rendered text without JS: the 68 articles carry 1,544 to 2,354 non-space chars (Hangul 1,437 to 2,208, median 1,676), the full article body, headings, tables, `<time>` and JSON-LD are in the first HTML response.
- Duplicates: no HTML reachable on both hosts without a redirect (guide paths 308 from app, app paths 307 from apex); word-3-gram Jaccard between articles: day-master series avg 0.073 (max 0.113), major arcana avg 0.046, suits 0.015 to 0.027, so the template-driven series are not near-duplicates; no page under 1,400 Hangul chars.
- AEO structure: summary-first on 68 of 68; dates visible and in JSON-LD; Organization publisher and full business registration in the footer; `/faq`, `/about`, `/how`, `/evidence`, `/help` exist and are in the sitemap and llms.txt.
- 404 handling: unknown paths return a real 404 with `noindex`, title "페이지를 찾을 수 없어요 · 스타로그", H1 "찾는 페이지가 없어요"; `/s/<invalid>` 404 uses the Next error shell (no `lang`, no body text) with noindex; shared readings `/s/[id]` are noindex by code (`app/s/[id]/page.tsx:43`, valid id not tested).
- Crawler access with crawler UAs on `/guide/the-hermit`: 200 for OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, Perplexity-User, Googlebot, Bingbot, Yeti, Daumoa, Applebot; training bots GPTBot/ClaudeBot 403 as designed. HSTS 2 years (apex without includeSubDomains), security headers present, br compression, `alt-svc h3`.
- Redirect rules per design: `/guide`, `/guide/tarot` (either host) -> 308 `https://yeolmaeapps.kr/` in one hop; `/guide/<slug>` and `/guide/saju` app -> apex 308; apex app paths 307; trailing slash on app pages 308 single hop.

## 5. Counts
- URLs listed in sitemaps: 86 (app 16, apex 70 = guide root 1 + saju tab 1 + 68 articles).
- Sitemap URLs fetched: 86 of 86; non-200: 0; redirects: 0; canonical mismatches: 0; noindex: 0.
- All requests: about 385 GET/HEAD to production across 334 distinct URLs (86 sitemap, redirect/trailing-slash/host probes, 107 images, 112 internal link targets overlapping the sitemap set, 7 external). Status mix across the 334: 200 281, 404 29, 308 20, 307 10, 302 6 (external adssettings), 403 only for GPTBot/ClaudeBot/PerplexityBot UA probes, DNS failure 3 (www).
- The 29 404s are deliberate probes (nonexistent paths, /.well-known, manifest, BingSiteAuth, wrong-case guide slugs) plus `/tarot`, `/saju`, `/login`, `/pay`, `/chapter`, `/invite`, `/dev`.
- Findings: 0 Critical, 0 High, 5 Medium, 13 Low (one unverified), 7 Info.
