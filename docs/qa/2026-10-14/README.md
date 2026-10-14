# Launch QA, 2026-10-14 (live 72c35ec at the start)

Owner request: "SEO 최적화하고 AEO GEO 최적화 그리고 가이드페이지 애드센스 심사통과기준 맞춰서 잘 되어있나 확인하고 사이트 전체 QA랑 보안점검 제로데이검사 (제공서비스들 다 되었는지, 위계랑 UIUX 등등 (추가된 프리미엄 서비스 위치도 잘 잡아야하니까) 까지 전부 포함) /ultraqa /code-review".

Reports in this folder (written by the audit agents, read-only runs, production GET/HEAD only, mock AI locally):
- `seo-aeo-geo.md`: SEO, AEO, GEO on both hosts (86 sitemap URLs, all 200 and self-canonical).
- `adsense.md`: the guide domain against Google's AdSense/Publisher policies, with sources and a 70-URL inventory.
- `functional-ux.md`: every service at 390 and 1280 px, information hierarchy, premium placement proposal.
- The security review (OWASP + attacker-minded probing of our own code, ~45 live probes, no generation calls) and the two-axis code review of 10/12–10/14 were returned in chat; their findings are summarized below.

## Fixed (commits ef5c0e7, 5ea904e, afd5105, 64ddbc5)
- **QA-01 (Critical):** production /login was a prerendered static 404 (payments mode read before any request API). `await connection()`; the gate fails if /login is in the prerender manifest; deploy smoke checks /login.
- **Security**
  - SEC-01 free-budget exhaustion by one client: per-network share of the daily budget (20%, `BETA_NETWORK_BUDGET_SHARE`), bond lines included.
  - SEC-02 paid-credit replay: a reading the client left after the model began answering is given back to reopen (at most 3 times, `restore-left:` ledger rows) and is no longer refundable; server failures always give it back; account deletion revokes such lots; premium parts claim by compare-and-set (migration 0007) and a token's twin waits.
  - SEC-03 share leaks: words matched as the prompt saw them; single quotes, picked situations, names (also inside longer phrases, given names), contact sentences, saju birth dates/times/ages hidden.
  - SEC-04 http served without redirect: 301 to https in worker.mjs (skipped under wrangler dev via `mf-original-hostname`).
  - SEC-05/06 owner and review logins: same-origin, global failures alert only (no global lockout).
  - SEC-08 share lifecycle (migration 0006 owner column, deletion, stop on delete/clear), SEC-09 follow-up race, SEC-10 OG limiter, SEC-11 review filters/real readers, SEC-13 readJson order.
- **Code review:** share deck fallback to 1909, account copy keeps the deck, hidden-review repost bypass, owner review desk on /owner, 도움돼요 state from the server.
- **SEO/AdSense:** /tarot and /saju redirect, trailing slash in one hop, apex serves /about /privacy /terms, sitemap/llms drop /lucky /ranking, robots, guide WebSite node, max-image-preview, ad script on articles only and away from the CTA, guide footer disclaimer, aboutads.info in privacy, article byline, storage copy consistent everywhere, question headings for 20 card articles, card alt text.
- **UX:** cross-device chapter ids, 오늘의 한 장 deck, free-used next steps, result CTA link, 누구 length, login back loop, demo invite outside production, 문의하기 mailto, /today H1.

## Recorded, not fixed (owner decision or later)
- **Refund policy vs the abandon rule (blocker before payments open to everyone):** app/refund says a reading not completed is not used and is refundable; the code now treats a paid reading the client left after the model began answering as given back to reopen but not refundable. Align one with the other.
- SEC-01 needs a real bot check for strong attackers (Cloudflare Turnstile widget: owner creates it, or approves us doing it). The daily budget (wrangler var) is the owner's cost cap and is small for launch traffic.
- SEC-05: rotate `STARLOG_OWNER_CODE` to a long random value.
- SEC-12: `next` 16.3.7 → 16.3.8 (advisories judged unreachable here; bump with a gate).
- SEO-02 PerplexityBot gets 403 at the Cloudflare edge although robots.txt allows it (dashboard: AI Crawl Control). SEO-12 www.yeolmaeapps.kr has no DNS record. Cloudflare "Always Use HTTPS" can back up the worker redirect.
- ADS-03/04: the six shortest articles (≈1,150–1,280 Hangul characters) could be expanded; card articles still share three template headings; AdSense dashboard (auto ads off, site entry) is the owner's to check.
- QA-06: 별자리 인연 shows numeric points and a points ranking, which sits uneasily with "no fortune scores".
- QA-10: the 30 s silence timer starts at the first byte, not at send (left as is: moving it could cut non-streamed answers).
- QA-12 naming variants (가이드/이용 가이드, saju names), QA-17 px font sizes (browser text-size ignored), SEO-10 description lengths, SEO-17 visible breadcrumb, SEO-18 in-article links (the article model has no link block).
- Premium placement: recommendation A (home "더 깊게 보기" row under the quick cards, /pricing as a three-step ladder with 프리미엄 타로×사주 21,900원 as the full-width top tier, upsell only after a finished reading) vs B (/pricing as the only hub). Build with P5.
