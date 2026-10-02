# Starlog P6: Languages (KO · EN · JA · 繁中) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve Starlog in Korean (default, unchanged URLs), English (`/en`), Japanese (`/ja`) and Traditional Chinese (`/zh-hant`), with every screen string, every free and paid standard reading, and the public content in the chosen language, switchable from a header chip on desktop and from 내 정보 and the footer on phones.

**Architecture:**
- Pages move under `app/[lang]`; `next.config` rewrites unprefixed paths to `/ko/...` and redirects `/ko/...` back, so Korean URLs stay as they are. No `proxy.ts`. Server components read the locale from `next/root-params`, client components from a context, API routes from the `X-Starlog-Locale` header.
- Strings live in typed JSON dictionaries (`lib/i18n/messages/{locale}/{ns}.json`) read through a 200-line ICU-lite formatter (`{x}`, plural, Korean josa). Long-form content (guides, policies, FAQ, help) lives in per-locale JSON content files with the Korean types. A review ledger marks every translated unit `draft | reviewed` and flags it stale when the Korean source changes.
- Korean readings keep their prompts and validators byte for byte. en/ja/zh-hant readings use a shared English core system prompt (cached once for all three) plus a per-locale style block (cached per locale), locale validation profiles, and language-independent fidelity checks (card ids, KB fact ids, hanja glyphs, years).

**Tech Stack:** Next.js 16.3.7 App Router on Cloudflare Workers (OpenNext ^1.20.7, static-assets incremental cache), TypeScript 6, zod 4, Vitest 5 (+ jsdom, Testing Library), Playwright, `@anthropic-ai/sdk` 0.129, `Intl` (PluralRules, NumberFormat, DateTimeFormat with tzdata). **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-02-starlog-p6-languages-design.md` (read §0 decisions, §4 routing, §5 strings, §7 readings before any task). Related: P4 plan `docs/superpowers/plans/2026-10-01-starlog-p4-accounts-payments.md`, P5 plan `docs/superpowers/plans/2026-10-01-starlog-p5-premium-readings.md` (Task 5 is the AI plumbing Phase AI builds on).

## Global Constraints

- Everything in `.superpowers/sdd/2026-09-30-starlog-p2b/global-constraints.md` and the P4 and P5 plans' Global Constraints holds. In particular:
  - no fs at runtime; data is imported statically (bundled);
  - `SITE` for names, prices and URLs;
  - one gold primary per screen; 44px targets; visible text ≥13px; contrast ≥4.5:1; `prefers-reduced-motion`; CSS Modules + tokens in `app/globals.css`;
  - model blinding in every language; no "베타" framing on premium screens.
- Next.js 16 differs from training data: read `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`, `03-api-reference/04-functions/next-root-params.md`, `generate-static-params.md`, `generate-metadata.md` (alternates), `03-file-conventions/not-found.md` (global-not-found) before touching routing or metadata.
- **Do not add npm dependencies.** Do not run `next build`, `pnpm cf:build`, dev servers or Playwright unless the task says so. The controller runs builds, e2e, the Worker size gate and real-API runs.
- Verification you run (repo root): `pnpm typecheck`; `npx vitest run <paths>`; the full suite `npx vitest run --maxWorkers=3` once before committing.
- Git: other agents edit the same tree.
  - Stage and commit **only your paths**: `git add <paths>` then `git commit -m "<msg>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`.
  - Never `git add -A`, never push.
- **Korean stays byte-identical.** No P6 task may change Korean text, markup or prompts, except where the task names the change (the move's file paths and icon links, Task 21).
  - Never change what an existing test **expects**: its Korean strings, its markup assertions, its snapshots. If one fails, your change is wrong.
  - You may change only how a test **calls** the code when a page becomes async (`render(<Page />)` → `render(await Page())`, `metadata` → `await generateMetadata()`). List each such harness change in the commit message.
- **Locale codes:** URL codes `ko | en | ja | zh-hant`; BCP 47 tags, `og:locale` and `Intl` locales come from `LOCALE_INFO` (`apps/web/lib/i18n/locales.ts`). Never write a locale list anywhere else: import `LOCALES`.
- **Messages** are JSON without comments. Korean defines the keys. Non-Korean values never contain Hangul and never use `josa`. Pass years, ids and counts that must not get digit grouping as **strings** (numbers are formatted with grouping: `2026` → `2,026`).
- **Phase gates (files P4/P5 are editing):**
  - Phase 0 tasks (1–13) never touch `apps/web/app/**`, `lib/api/{inputs,http,tarotRequest,sajuRequest}.ts`, `lib/storage/chapters.ts`, `lib/seo.ts`, `lib/ai/{provider,config,anthropic,validate,mock,generate}.ts`, `lib/ai/prompts/{tarot,saju}.ts` or `packages/core/src/tarot/templates.ts`.
  - Named exceptions: `lib/ai/style.ts` (Task 10), `packages/core/src/index.ts` (one export line, Task 8), `packages/core/src/saju/{chart,policy}.ts` (Task 12).
  - Phase AI (14–19) starts only when P5 Task 5 is at HEAD.
  - Phase A (20–34) starts only at gate G1 (P4 and P5 merged, no pending edits under `apps/web/app`).
- **Translations written by agents are drafts.** Every translated unit gets a ledger entry with status `draft` (`pnpm i18n:ledger`). Never set `reviewed`; only the owner's reviewers do, with `pnpm i18n:review`.
- **Voice per locale** (`content/i18n/style/*.md`):
  - ja: です・ます, almost no `あなた`;
  - zh-hant: Taiwan written vocabulary, `你`, 「」 quotes;
  - en: US spelling, `you`, contractions fine.
- **Brand and names in non-Korean locales:** "Starlog" in Latin letters. Characters, currencies, card and saju terms come from `content/i18n/glossary.json` and `packages/core/src/i18n/data/*.json`.
- **Crisis numbers** come only from `apps/web/lib/i18n/crisis.ts`. Each hotline carries its official source URL and the date it was checked.
- **Worker budget:** P6 in total stays within **+600 KiB gzip** over the Task 1 baseline (`pnpm check:worker`, controller).

---

## File Structure

```
scripts/check-worker-size.mjs              Worker gzip size vs baseline + budget (Task 1)
scripts/worker-size-baseline.json          plan, limit, budget, measured baseline
scripts/i18n/ledger.mjs                    review-ledger pure functions (hash, update, summarize)
scripts/i18n/status.test.ts                `pnpm i18n:status` / `--gate` (vitest job, no API)
scripts/i18n/review.test.ts                `pnpm i18n:review` marks units reviewed
scripts/i18n/ledger-write.test.ts          `pnpm i18n:ledger` writes draft entries for new or changed units
scripts/i18n/draft.test.ts                 `pnpm i18n:draft` model drafts (Phase AI, Task 14)
scripts/i18n/units/*.ts                    translation units per kind (messages, core, kb, decision, guides, info, legal)
scripts/i18n/move-to-lang.mjs              the one-off move into app/[lang] (Task 21)
scripts/build-kb-i18n.mjs                  content/kb/i18n → apps/web/lib/kb/i18n.generated.json
vitest.i18n.config.ts                      vitest config for the i18n jobs (like vitest.smoke.config.ts)

content/i18n/glossary.json                 brand, characters, currencies, product names per locale
content/i18n/style/{en,ja,zh-hant}.md      translator and reviewer style guides + review checklist
content/i18n/review/{en,ja,zh-hant}.json   review ledgers
content/i18n/{en,ja,zh-hant}/info/{faq,help,about,how,pricing}.json   long-form info pages
content/i18n/{en,ja,zh-hant}/legal/{terms,privacy,refund}.json        reference translations
content/i18n/{en,ja,zh-hant}/guides.json   translated guide articles (Phase B)
content/kb/i18n/{en,ja,zh-hant}/{cardId}.json  KB names, keywords, facts, glosses, misdescriptions
content/kb/decision.{en,ja,zh-hant}.json   지금의 한 장 per locale (Phase B)
content/eval/i18n/{en,ja,zh-hant}/golden.json, content/eval/i18n/judge-rubric.md

packages/core/src/i18n/index.ts            card names (zh-hant), aliases, positions, topics, conditions, when, signs, saju glossary
packages/core/src/i18n/data/{en,ja,zh-hant}.json
packages/core/src/saju/zones.ts            IANA zone offsets and wall-clock → instants (Intl/tzdb)
packages/core/src/saju/abroadPlaces.ts     Japan, Taiwan, Hong Kong birthplaces

apps/web/lib/i18n/locales.ts               LOCALES, LOCALE_INFO, public/preview/routed locales
apps/web/lib/i18n/format.ts                ICU-lite parser and formatter
apps/web/lib/i18n/shape.ts                 Shape<T>, Leaves<T>, lookup()
apps/web/lib/i18n/messages/{ko,en,ja,zh-hant}/*.json, messages/index.ts   catalogs + registry
apps/web/lib/i18n/translate.ts             translator(), pickMessages() (server and tests only)
apps/web/lib/i18n/routing.ts               rewrite pattern, rewrites/redirects for next.config (no aliases)
apps/web/lib/i18n/paths.ts                 localePath, splitLocale, localizeHref, switchPath
apps/web/lib/i18n/intl.ts                  numbers, KRW, dates, KST reset in local time
apps/web/lib/i18n/crisis.ts                crisis patterns (all languages) and hotlines per locale
apps/web/lib/i18n/availability.ts          which bare paths exist in which locale (Phase A)
apps/web/lib/i18n/preference.ts            sl_lang cookie + localStorage (Phase A)
apps/web/lib/i18n/suggest.ts               first-visit suggestion rule (Phase A)
apps/web/lib/i18n/server.ts                currentLocale(), getT(), localeRedirect() via next/root-params (Phase A)
apps/web/lib/i18n/content.ts               per-locale info/legal/guide content loaders (Phase A/B)
apps/web/components/i18n/LocaleProvider.tsx   context, useLocale(), useT()
apps/web/components/i18n/LocaleLink.tsx       next/link with the locale prefix
apps/web/components/i18n/navigation.ts        useLocaleRouter(), useBarePathname()
apps/web/components/i18n/Messages.tsx         server component: passes namespaces to the client (Phase A)
apps/web/components/i18n/LangSwitch.tsx (+ .module.css)   header chip, /me row, footer row (Phase A)
apps/web/components/i18n/LanguageSuggestion.tsx (+ .module.css)   first-visit band (Phase A)

apps/web/lib/ai/locale/{text,script,safety,tells,index}.ts   locale validation profiles
apps/web/lib/ai/prompts/intl/{core,style,tarot,saju}.ts       en/ja/zh-hant prompts (Phase AI)
apps/web/lib/ai/intlSchemas.ts, validateIntl.ts, mockIntl.ts, generateIntl.ts (Phase AI)
apps/web/lib/kb/i18n.ts (+ i18n.generated.json)   per-locale KB text
apps/web/lib/bonds/todayLineIntl.ts                today-line prompt/validator per locale (Phase AI)

apps/web/app/[lang]/**                     every page route after the move (Phase A)
apps/web/app/global-not-found.tsx          unmatched URLs (Phase A)
```

## Task order

| # | Task | Phase | Needs | Parallel-safe with |
|---|---|---|---|---|
| 1 | Worker size gate and baseline (controller) | 0 | — | everything |
| 2 | Locale registry | 0 | — | 1 |
| 3 | ICU-lite formatter | 0 | 2 | 5, 6, 8–13 |
| 4 | Message catalogs, translator, client provider | 0 | 3 | 5, 6, 8–13 |
| 5 | Routing pattern, paths, LocaleLink, navigation hooks | 0 | 2 (4 for the hooks' context) | 3, 6, 8–13 |
| 6 | Intl formatting | 0 | 2 | 3–5, 8–13 |
| 7 | Glossary, style guides, review ledger tooling | 0 | 4 | 5, 6, 8–13 |
| 8 | Core locale data (cards, positions, topics, conditions, signs, saju terms) | 0 | 7 | 9–13 |
| 9 | Validation text and script utilities | 0 | 2 | 8, 11–13 |
| 10 | Safety lists, AI tells, profiles (+ `style.ts`) | 0 | 9 | 8, 11–13 |
| 11 | Crisis patterns and hotlines | 0 | 2 | 8–10, 12, 13 |
| 12 | Births in Japan, Taiwan, Hong Kong (core engine) | 0 | — | 2–11, 13 |
| 13 | KB i18n (names, keywords, facts, glosses, misdescriptions) | 0 | 7, 8 | 9–12 |
| 14 | `systemLocale` block, `i18n-draft` task, draft job | AI | P5 Task 5 | 15 after it |
| 15 | Intl tarot prompts | AI | 8, 10, 13, 14 | 17 |
| 16 | Intl tarot schemas and validators | AI | 15 | 17 |
| 17 | Intl saju prompts and validators | AI | 8, 10, 14 | 15, 16 |
| 18 | Intl mocks | AI | 16, 17 | — |
| 19 | Intl generators and today-line | AI | 18 | — |
| G1 | **Gate:** P4 and P5 merged; nothing pending under `apps/web/app` | — | — | — |
| 20 | Routing spike on `cf:preview` (controller) | A | G1, 5 | — |
| 21 | The move into `app/[lang]` (controller, alone) | A | 20 | nothing |
| 22 | Locale context and chrome strings, html lang, fonts | A | 21 | — |
| 23 | Language switch, persistence, suggestion band | A | 22 | 24, 25 |
| 24 | SEO: metadata alternates, sitemap, JSON-LD, llms.txt | A | 22 | 23, 25 |
| 25 | API locale plumbing, crisis, chapters, route dispatch | A | 19, 22 | 23, 24 |
| 26 | Extract: home and tarot question flow | A | 22, 25 | 27–30 |
| 27 | Extract: tarot draw, result, chapter, reading components | A | 22, 25 | 26, 28–30 |
| 28 | Extract: saju flow and birthplaces abroad | A | 12, 22, 25 | 26, 27, 29, 30 |
| 29 | Extract: today, story, me, bonds, ranking, lucky, invites | A | 22, 25 | 26–28, 30 |
| 30 | Info pages, pricing, policies, login/pay chrome, premium notices | A | 22 | 26–29 |
| 31 | Payments and money formatting | A | 30 | 32 |
| 32 | Share buttons and OG images per locale | A | 22 | 31 |
| 33 | Eval, smoke and length calibration per locale (controller runs the API) | A | 19, 25 | 34 |
| 34 | Link and literal lint, e2e i18n spec | A | 26–32 | 33 |
| 35 | 지금의 한 장 per locale | B | 34 | 36 |
| 36 | Guides: per-locale infrastructure and B1 (15 articles) | B | 34 | 35 |
| 37 | Guides B2 (27 articles), after 4–6 weeks of B1 data | B | 36 | — |
| 38 | QA run, runbook, rollout | release | 33–36 | — |

Phase 0 tasks touch only new files, `packages/core`, `content`, `scripts` and the named exceptions, so they run beside P4 and P5. Lanes inside Phase 0 after Task 2:
- 3 → 4 → 7 → 8 → 13
- 5
- 6
- 9 → 10
- 11
- 12

---

## Phase 0 — beside P4 and P5

### Task 1: Worker size gate and baseline (controller)

**Files:**
- Create: `scripts/check-worker-size.mjs`, `scripts/worker-size-baseline.json`
- Modify: `package.json` (root, `check:worker` script)
- Test: `apps/web/lib/i18n/workerSize.test.ts`

**Interfaces:**
- Produces: `parseUploadSize(text): { rawKiB: number; gzipKiB: number } | null`, `budgetProblems(gzipKiB, baseline): string[]`, and `pnpm check:worker` (exit 1 over budget). Tasks 13, 34, 36 and 38 run it.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/workerSize.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { budgetProblems, parseUploadSize } from "../../../../scripts/check-worker-size.mjs";

describe("worker size gate", () => {
  it("reads wrangler's summary line, commas included", () => {
    expect(parseUploadSize("…\nTotal Upload: 12,345.67 KiB / gzip: 2,201.50 KiB\n…")).toEqual({ rawKiB: 12345.67, gzipKiB: 2201.5 });
    expect(parseUploadSize("no summary")).toBeNull();
  });

  it("fails above baseline + budget and above the plan limit", () => {
    const baseline = { plan: "free", limitKiB: 3072, budgetKiB: 614, gzipKiB: 2200 };
    expect(budgetProblems(2700, baseline)).toEqual([]);
    expect(budgetProblems(2900, baseline)).toHaveLength(1);
    expect(budgetProblems(3100, { ...baseline, budgetKiB: 2000 })[0]).toMatch(/free plan limit/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/workerSize.test.ts`
Expected: FAIL (cannot resolve `scripts/check-worker-size.mjs`).

- [ ] **Step 3: Write `scripts/check-worker-size.mjs`**

```js
// Worker upload-size gate (P6 spec §4.4). Bundles the Worker as `wrangler deploy` would (--dry-run:
// nothing is uploaded), reads wrangler's "Total Upload … / gzip …" line and compares the gzip size with
// scripts/worker-size-baseline.json. Fails above baseline + budget, or above the plan's limit.
// usage (after `pnpm cf:build`):
//   node scripts/check-worker-size.mjs              measure and check
//   node scripts/check-worker-size.mjs --baseline   measure and record the baseline (Task 1 only)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselineFile = join(root, "scripts/worker-size-baseline.json");

/** KiB figures from wrangler's summary line, or null when the line is missing. */
export function parseUploadSize(output) {
  const m = /Total Upload:\s*([\d.,]+)\s*KiB\s*\/\s*gzip:\s*([\d.,]+)\s*KiB/i.exec(output);
  if (!m) return null;
  const num = (s) => Number(s.replace(/,/g, ""));
  return { rawKiB: num(m[1]), gzipKiB: num(m[2]) };
}

/** What is wrong with `gzipKiB` against the baseline; empty when it is within budget. */
export function budgetProblems(gzipKiB, baseline) {
  const problems = [];
  const ceiling = baseline.gzipKiB + baseline.budgetKiB;
  if (gzipKiB > ceiling) problems.push(`gzip ${gzipKiB} KiB > baseline ${baseline.gzipKiB} + budget ${baseline.budgetKiB} KiB`);
  if (gzipKiB > baseline.limitKiB) problems.push(`gzip ${gzipKiB} KiB > the ${baseline.plan} plan limit ${baseline.limitKiB} KiB`);
  return problems;
}

function measure() {
  const out = mkdtempSync(join(tmpdir(), "starlog-worker-"));
  try {
    const run = spawnSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", out], {
      cwd: join(root, "apps/web"),
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    const size = parseUploadSize(text);
    if (!size) throw new Error(`wrangler printed no "Total Upload" line:\n${text}`);
    return size;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const size = measure();
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  if (process.argv.includes("--baseline")) {
    const next = { ...baseline, gzipKiB: size.gzipKiB, rawKiB: size.rawKiB, measuredAt: new Date().toISOString().slice(0, 10) };
    writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`baseline recorded: gzip ${size.gzipKiB} KiB (raw ${size.rawKiB} KiB)`);
  } else {
    const problems = budgetProblems(size.gzipKiB, baseline);
    console.log(`worker gzip ${size.gzipKiB} KiB (raw ${size.rawKiB}); baseline ${baseline.gzipKiB} + budget ${baseline.budgetKiB}; ${baseline.plan} limit ${baseline.limitKiB}`);
    if (problems.length) {
      console.error(problems.join("\n"));
      process.exit(1);
    }
  }
}
```

`scripts/worker-size-baseline.json`:

```json
{
  "plan": "paid",
  "limitKiB": 10240,
  "budgetKiB": 614,
  "gzipKiB": 0,
  "rawKiB": 0,
  "measuredAt": ""
}
```

Root `package.json` scripts: add `"check:worker": "node scripts/check-worker-size.mjs"`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/web/lib/i18n/workerSize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Record the baseline (controller)**
  1. Check the Cloudflare account's Workers plan in the dashboard. Set `plan` to `"free"` or `"paid"` and `limitKiB` to `3072` (free) or `10240` (paid). The owner's brief says 10 MB and 5.1 MB; the P2b constraints say 3 MiB and 2.15 MiB (spec §2). The dashboard decides.
  2. Run `pnpm cf:build && node scripts/check-worker-size.mjs --baseline`.
  3. Note in the commit message: the number of prerendered pages (`find apps/web/.open-next/assets/cdn-cgi/_next_cache -name '*.cache' | wc -l`), the size of that folder (`du -sh`), and the build's wall time.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-worker-size.mjs scripts/worker-size-baseline.json package.json apps/web/lib/i18n/workerSize.test.ts
git commit -m "chore(i18n): Worker gzip size gate with a recorded baseline and the P6 budget" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/check-worker-size.mjs scripts/worker-size-baseline.json package.json apps/web/lib/i18n/workerSize.test.ts
```

---

### Task 2: Locale registry

**Files:**
- Create: `apps/web/lib/i18n/locales.ts`
- Test: `apps/web/lib/i18n/locales.test.ts`

**Interfaces:**
- Produces:
  - `LOCALES: readonly ["ko","en","ja","zh-hant"]`, `type Locale`, `DEFAULT_LOCALE = "ko"`;
  - `LOCALE_INFO: Record<Locale, { tag; og; intl; chip; endonym }>`;
  - `isLocale(v: unknown): v is Locale`;
  - `publicLocales(raw?) / previewLocales(raw?, pub?) / routedLocales(pub?, preview?) / isPublicLocale(l)`.
  - Pure, no imports: `next.config.ts` imports it through `routing.ts`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/locales.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, isLocale, previewLocales, publicLocales, routedLocales } from "./locales";

describe("locales", () => {
  it("puts Korean first as the default, then en, ja, zh-hant", () => {
    expect(LOCALES).toEqual(["ko", "en", "ja", "zh-hant"]);
    expect(DEFAULT_LOCALE).toBe("ko");
  });

  it("tags Traditional Chinese with its script and spells the owner's chip row", () => {
    expect(LOCALE_INFO["zh-hant"].tag).toBe("zh-Hant");
    expect(LOCALE_INFO["zh-hant"].intl).toBe("zh-Hant-TW");
    expect(LOCALES.map((l) => LOCALE_INFO[l].chip).join(" · ")).toBe("KO · EN · JA · 繁中");
    expect(LOCALES.map((l) => LOCALE_INFO[l].endonym)).toEqual(["한국어", "English", "日本語", "繁體中文"]);
  });

  it("recognises exactly the four URL codes", () => {
    expect(isLocale("ja")).toBe(true);
    for (const value of ["JA", "zh-Hant", "zh", "fr", "", undefined, 3]) expect(isLocale(value)).toBe(false);
  });

  it("always keeps Korean public and ignores unknown, repeated or upper-case codes", () => {
    expect(publicLocales(undefined)).toEqual(["ko"]);
    expect(publicLocales("ja, fr ,ja,EN")).toEqual(["ko", "en", "ja"]);
  });

  it("previews only locales that are not public, and routes both in LOCALES order", () => {
    expect(previewLocales("zh-hant,ja", ["ko", "ja"])).toEqual(["zh-hant"]);
    expect(routedLocales(["ko", "ja"], ["zh-hant"])).toEqual(["ko", "ja", "zh-hant"]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/locales.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/web/lib/i18n/locales.ts`**

```ts
/**
 * The locales of P6 (spec §3). Korean is the default and the source of truth, served at the root with
 * no prefix; the others live under /en, /ja and /zh-hant. Pure and import-free: next.config.ts reaches
 * it through ./routing.ts, so it must not use the "@/" alias.
 */

export const LOCALES = ["ko", "en", "ja", "zh-hant"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

export interface LocaleInfo {
  /** <html lang>, hreflang and JSON-LD inLanguage (BCP 47) */
  tag: string;
  /** og:locale */
  og: string;
  /** Intl.* locale */
  intl: string;
  /** the header chip and the /me row (owner's reference row: KO · EN · JA · 繁中) */
  chip: string;
  /** the language's own name */
  endonym: string;
}

export const LOCALE_INFO: Readonly<Record<Locale, LocaleInfo>> = {
  ko: { tag: "ko", og: "ko_KR", intl: "ko-KR", chip: "KO", endonym: "한국어" },
  en: { tag: "en", og: "en_US", intl: "en-US", chip: "EN", endonym: "English" },
  ja: { tag: "ja", og: "ja_JP", intl: "ja-JP", chip: "JA", endonym: "日本語" },
  "zh-hant": { tag: "zh-Hant", og: "zh_TW", intl: "zh-Hant-TW", chip: "繁中", endonym: "繁體中文" },
};

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

function parseList(raw: string | undefined): Locale[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isLocale);
}

const ordered = (set: ReadonlySet<Locale>): Locale[] => LOCALES.filter((locale) => set.has(locale));

/**
 * Public locales (NEXT_PUBLIC_LOCALES, read at build time): indexed, in the switch, the sitemap and
 * hreflang. Korean always.
 */
export function publicLocales(raw: string | undefined = process.env.NEXT_PUBLIC_LOCALES): Locale[] {
  return ordered(new Set<Locale>(["ko", ...parseList(raw)]));
}

/**
 * Preview locales (NEXT_PUBLIC_LOCALES_PREVIEW): routes exist, but they are noindex and stay out of
 * the switch, the sitemap and hreflang. For the owner's and native reviewers' checks.
 */
export function previewLocales(raw: string | undefined = process.env.NEXT_PUBLIC_LOCALES_PREVIEW, pub: readonly Locale[] = publicLocales()): Locale[] {
  return ordered(new Set(parseList(raw).filter((locale) => !pub.includes(locale))));
}

/** Every locale that gets routes in this build. */
export function routedLocales(pub: readonly Locale[] = publicLocales(), preview: readonly Locale[] = previewLocales(undefined, pub)): Locale[] {
  return ordered(new Set<Locale>([...pub, ...preview]));
}

export const isPublicLocale = (locale: Locale): boolean => publicLocales().includes(locale);
```

> `previewLocales(undefined, pub)` in `routedLocales` relies on the default parameter: `undefined` makes JavaScript use the default, which reads `NEXT_PUBLIC_LOCALES_PREVIEW`.

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/lib/i18n/locales.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/locales.ts apps/web/lib/i18n/locales.test.ts
git commit -m "feat(i18n): locale registry — ko default, en, ja, zh-hant; public and preview flags" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/locales.ts apps/web/lib/i18n/locales.test.ts
```

---

### Task 3: ICU-lite formatter

**Files:**
- Create: `apps/web/lib/i18n/format.ts`
- Test: `apps/web/lib/i18n/format.test.ts`

**Interfaces:**
- Consumes: `withParticle`, `type Particle` (`apps/web/lib/korean.ts`); `LOCALE_INFO`, `type Locale` (Task 2).
- Produces:
  - `type MessageValues = Readonly<Record<string, string | number>>`;
  - `type MessageNode`;
  - `parseMessage(source): MessageNode[]` (cached; throws `MessageSyntaxError`);
  - `formatMessage(source, values?, locale?): string`;
  - `argumentNames(nodes): string[]` (sorted, unique), `hasJosa(nodes): boolean`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/format.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MessageSyntaxError, argumentNames, formatMessage, hasJosa, parseMessage } from "./format";

describe("formatMessage", () => {
  it("interpolates strings and formats numbers for the locale", () => {
    expect(formatMessage("안녕, {name}", { name: "민지" })).toBe("안녕, 민지");
    expect(formatMessage("{n}개", { n: 2900 })).toBe("2,900개");
    expect(formatMessage("{n} readings", { n: 1234 }, "en")).toBe("1,234 readings");
    expect(formatMessage("{year}年", { year: "2026" }, "ja")).toBe("2026年");
  });

  it("picks plural cases: exact first, then the locale's category, then other; # is the count", () => {
    const en = "{n, plural, =0 {No readings} one {# reading} other {# readings}}";
    expect(formatMessage(en, { n: 0 }, "en")).toBe("No readings");
    expect(formatMessage(en, { n: 1 }, "en")).toBe("1 reading");
    expect(formatMessage(en, { n: 1000 }, "en")).toBe("1,000 readings");
    expect(formatMessage("{n, plural, other {#回}}", { n: 1 }, "ja")).toBe("1回");
    expect(formatMessage("남은 횟수 {n, plural, other {#번}}", { n: 3 })).toBe("남은 횟수 3번");
  });

  it("keeps arguments inside plural cases", () => {
    expect(formatMessage("{n, plural, one {{who} has # star} other {{who} has # stars}}", { n: 2, who: "Mina" }, "en")).toBe("Mina has 2 stars");
  });

  it("adds Korean particles only in Korean", () => {
    expect(formatMessage("{card, josa, 을/를} 골랐어요", { card: "바보" })).toBe("바보를 골랐어요");
    expect(formatMessage("{card, josa, 을/를} 골랐어요", { card: "별" })).toBe("별을 골랐어요");
    expect(formatMessage("{card, josa, 이/가}", { card: "The Fool" }, "en")).toBe("The Fool");
  });

  it("rejects malformed messages", () => {
    for (const bad of ["{", "}", "{1x}", "{n, plural, one {x}}", "{n, select, a {x} other {y}}", "{n, josa, 에/에서}", "{n, plural, one {x} other {y}"]) {
      expect(() => parseMessage(bad), bad).toThrow(MessageSyntaxError);
    }
  });

  it("throws on a missing value outside production", () => {
    expect(() => formatMessage("{name}님", {})).toThrow(/missing value "name"/);
  });

  it("reports argument names and josa use", () => {
    expect(argumentNames(parseMessage("{b} {a, josa, 을/를} {n, plural, other {{c}}}"))).toEqual(["a", "b", "c", "n"]);
    expect(hasJosa(parseMessage("{a, josa, 을/를}"))).toBe(true);
    expect(hasJosa(parseMessage("{a}"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/web/lib/i18n/format.ts`**

```ts
import { withParticle, type Particle } from "@/lib/korean";
import { LOCALE_INFO, type Locale } from "./locales";

/**
 * ICU-lite (spec §5.1): `{name}`, `{n, plural, =0 {…} one {…} other {…}}` with `#` for the count, and
 * `{name, josa, 을/를}` (Korean only). Numbers get the locale's digit grouping, so pass years and ids as
 * strings. Pure; safe on server and client.
 */

export type MessageValues = Readonly<Record<string, string | number>>;

export type MessageNode =
  | { kind: "text"; text: string }
  | { kind: "arg"; name: string }
  | { kind: "josa"; name: string; pair: Particle }
  | { kind: "plural"; name: string; cases: Readonly<Record<string, MessageNode[]>> };

export class MessageSyntaxError extends Error {
  override name = "MessageSyntaxError";
}

const PARTICLES: readonly string[] = ["을/를", "은/는", "이/가", "과/와"];
const NAME = /^[A-Za-z_]\w*$/;
const PLURAL_KEY = /^(=\d+|zero|one|two|few|many|other)$/;
const parsed = new Map<string, MessageNode[]>();

export function parseMessage(source: string): MessageNode[] {
  const hit = parsed.get(source);
  if (hit) return hit;
  let i = 0;
  const fail = (why: string): never => {
    throw new MessageSyntaxError(`${why} at ${i} in "${source}"`);
  };
  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i]!)) i++;
  };
  const readUntil = (stops: string): string => {
    const start = i;
    while (i < source.length && !stops.includes(source[i]!)) i++;
    return source.slice(start, i).trim();
  };
  const expect = (ch: string) => {
    if (source[i] !== ch) fail(`expected "${ch}"`);
    i++;
  };

  function sequence(inCase: boolean): MessageNode[] {
    const out: MessageNode[] = [];
    let text = "";
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === "}") {
        if (inCase) break;
        fail("unmatched }");
      }
      if (ch === "{") {
        if (text) out.push({ kind: "text", text });
        text = "";
        out.push(placeholder());
        continue;
      }
      text += ch;
      i++;
    }
    if (text) out.push({ kind: "text", text });
    return out;
  }

  function placeholder(): MessageNode {
    expect("{");
    const name = readUntil(",}");
    if (!NAME.test(name)) fail(`bad argument name "${name}"`);
    if (source[i] === "}") {
      i++;
      return { kind: "arg", name };
    }
    expect(",");
    const type = readUntil(",}");
    expect(",");
    if (type === "josa") {
      const pair = readUntil("}");
      if (!PARTICLES.includes(pair)) fail(`unknown josa pair "${pair}"`);
      expect("}");
      return { kind: "josa", name, pair: pair as Particle };
    }
    if (type === "plural") {
      const cases: Record<string, MessageNode[]> = {};
      for (;;) {
        skipSpace();
        if (i >= source.length) fail("unterminated plural");
        if (source[i] === "}") {
          i++;
          break;
        }
        const key = readUntil("{");
        if (!PLURAL_KEY.test(key)) fail(`bad plural case "${key}"`);
        expect("{");
        cases[key] = sequence(true);
        expect("}");
      }
      if (!cases.other) fail("plural without other");
      return { kind: "plural", name, cases };
    }
    return fail(`unknown type "${type}"`);
  }

  const nodes = sequence(false);
  parsed.set(source, nodes);
  return nodes;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();

function plural(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(LOCALE_INFO[locale].intl)));
  return rules;
}

function numbers(locale: Locale): Intl.NumberFormat {
  let format = numberFormats.get(locale);
  if (!format) numberFormats.set(locale, (format = new Intl.NumberFormat(LOCALE_INFO[locale].intl)));
  return format;
}

function valueOf(values: MessageValues, name: string, source: string): string | number {
  const value = values[name];
  if (value !== undefined) return value;
  if (process.env.NODE_ENV !== "production") throw new MessageSyntaxError(`missing value "${name}" for "${source}"`);
  return "";
}

function render(nodes: readonly MessageNode[], values: MessageValues, locale: Locale, source: string, hash?: string): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += hash === undefined ? node.text : node.text.replaceAll("#", hash);
    } else if (node.kind === "arg") {
      const value = valueOf(values, node.name, source);
      out += typeof value === "number" ? numbers(locale).format(value) : value;
    } else if (node.kind === "josa") {
      const word = String(valueOf(values, node.name, source));
      out += locale === "ko" ? withParticle(word, node.pair) : word;
    } else {
      const n = Number(valueOf(values, node.name, source));
      const branch = node.cases[`=${n}`] ?? node.cases[plural(locale).select(n)] ?? node.cases.other!;
      out += render(branch, values, locale, source, numbers(locale).format(n));
    }
  }
  return out;
}

export function formatMessage(source: string, values: MessageValues = {}, locale: Locale = "ko"): string {
  return render(parseMessage(source), values, locale, source);
}

export function argumentNames(nodes: readonly MessageNode[]): string[] {
  const names = new Set<string>();
  const visit = (list: readonly MessageNode[]) => {
    for (const node of list) {
      if (node.kind === "text") continue;
      names.add(node.name);
      if (node.kind === "plural") Object.values(node.cases).forEach(visit);
    }
  };
  visit(nodes);
  return [...names].sort();
}

export function hasJosa(nodes: readonly MessageNode[]): boolean {
  return nodes.some((node) => node.kind === "josa" || (node.kind === "plural" && Object.values(node.cases).some(hasJosa)));
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/lib/i18n/format.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/format.ts apps/web/lib/i18n/format.test.ts
git commit -m "feat(i18n): ICU-lite messages — arguments, plurals by Intl.PluralRules, Korean josa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/format.ts apps/web/lib/i18n/format.test.ts
```

---

### Task 4: Message catalogs, translator, client provider

**Files:**
- Create:
  - `apps/web/lib/i18n/shape.ts`, `apps/web/lib/i18n/translate.ts`
  - `apps/web/lib/i18n/messages/index.ts`, `apps/web/lib/i18n/messages/{ko,en,ja,zh-hant}/common.json`
  - `apps/web/components/i18n/LocaleProvider.tsx`
- Test: `apps/web/lib/i18n/parity.test.ts`, `apps/web/lib/i18n/clientImports.test.ts`, `apps/web/components/i18n/LocaleProvider.test.tsx`

**Interfaces:**
- Consumes: `formatMessage`, `parseMessage`, `argumentNames`, `hasJosa` (Task 3); `LOCALES`, `type Locale` (Task 2).
- Produces:
  - `shape.ts`: `Shape<T>`, `Leaves<T>`, `lookup(tree, key)`;
  - `messages/index.ts`: `MESSAGES`, `NAMESPACES`, `type Namespace`, `type KoCatalog`;
  - `translate.ts`: `type Translate<N>`, `translator(locale, ns)`, `pickMessages(locale, namespaces)` (never import `translate.ts` or `messages/` from a `"use client"` file);
  - `LocaleProvider.tsx`: `LocaleProvider({ locale, messages, children })` (nested providers merge namespaces), `useLocale()`, `useT(ns)`.
- How later tasks add a namespace:
  1. create `messages/<locale>/<ns>.json` for all four locales;
  2. import them in `messages/index.ts`, add `<ns>` to the `ko` object and `<ns>: <en import> satisfies Shape<typeof ko<Ns>>` to each other locale;
  3. the parity test picks it up through `NAMESPACES`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/i18n/parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { argumentNames, hasJosa, parseMessage } from "./format";
import { LOCALES } from "./locales";
import { MESSAGES, NAMESPACES } from "./messages";

function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}
const HANGUL = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/;

describe.each(NAMESPACES)("messages: %s", (ns) => {
  const ko = new Map(leaves(MESSAGES.ko[ns]));

  it.each(LOCALES.filter((l) => l !== "ko"))("%s has exactly the Korean keys", (locale) => {
    expect([...new Map(leaves(MESSAGES[locale][ns])).keys()].sort()).toEqual([...ko.keys()].sort());
  });

  it.each(LOCALES)("%s parses, keeps the Korean argument names, has no empty values", (locale) => {
    for (const [key, value] of leaves(MESSAGES[locale][ns])) {
      const where = `${locale} ${ns}.${key}`;
      expect(value.trim(), where).not.toBe("");
      const nodes = parseMessage(value);
      expect(argumentNames(nodes), where).toEqual(argumentNames(parseMessage(ko.get(key) ?? "")));
      if (locale !== "ko") {
        expect(hasJosa(nodes), `${where} uses josa`).toBe(false);
        expect(HANGUL.test(value), `${where} contains Hangul`).toBe(false);
      }
    }
  });
});
```

`apps/web/lib/i18n/clientImports.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const WEB = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".open-next", "test-results", "e2e"]);
/**
 * Value imports of the server-side catalog modules: from a client file they would ship all four
 * languages. `import type` lines are erased at build time and are allowed.
 */
const SERVER_ONLY = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](?:@\/lib\/i18n\/(?:messages|translate|server)(?:\/[^"']*)?|(?:\.{1,2}\/)+(?:[\w-]+\/)*(?:messages|translate)(?:\/index)?)["']/m;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

it("no client component imports the full message catalogs", () => {
  const offenders: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of sources(join(WEB, dir))) {
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(text) && SERVER_ONLY.test(text)) offenders.push(relative(WEB, file));
    }
  }
  expect(offenders).toEqual([]);
});
```

`apps/web/components/i18n/LocaleProvider.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pickMessages } from "@/lib/i18n/translate";
import { LocaleProvider, useLocale, useT } from "./LocaleProvider";

function Probe() {
  const t = useT("common");
  return <p data-locale={useLocale()}>{`${t("nav.home")} · ${t("site.homeLabel", { site: t("site.name") })}`}</p>;
}

describe("LocaleProvider", () => {
  it("reads the provided locale's messages", () => {
    render(
      <LocaleProvider locale="ja" messages={pickMessages("ja", ["common"])}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText("ホーム · Starlog ホーム").getAttribute("data-locale")).toBe("ja");
  });

  it("keeps Korean exactly as the components wrote it", () => {
    render(
      <LocaleProvider locale="ko" messages={pickMessages("ko", ["common"])}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText("홈 · 스타로그 홈")).toBeTruthy();
  });

  it("merges a nested provider's namespaces over the layout's", () => {
    render(
      <LocaleProvider locale="en" messages={pickMessages("en", ["common"])}>
        <LocaleProvider locale="en" messages={{}}>
          <Probe />
        </LocaleProvider>
      </LocaleProvider>,
    );
    expect(screen.getByText("Home · Starlog home")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run apps/web/lib/i18n/parity.test.ts apps/web/lib/i18n/clientImports.test.ts apps/web/components/i18n/LocaleProvider.test.tsx`
Expected: FAIL (modules not found). `clientImports` may PASS already; that is fine.

- [ ] **Step 3: Write `apps/web/lib/i18n/shape.ts`**

```ts
/** The shape every locale's catalog must have: the Korean one's keys, with string leaves. */
export type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

/** Dotted paths to the string leaves of a catalog: "nav.home", "site.homeLabel", … */
export type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}
```

- [ ] **Step 4: Write the `common` catalogs.** Strings come from `components/layout/TabBar.tsx`, `Footer.tsx`, `components/home/HomeTopBar.tsx` and `app/not-found.tsx` (Task 22 wires them). Korean values are copied exactly.

`apps/web/lib/i18n/messages/ko/common.json`:

```json
{
  "site": { "name": "스타로그", "tagline": "카드와 사주로 쌓는 나의 이야기", "homeLabel": "{site} 홈" },
  "nav": { "home": "홈", "story": "내 기록", "guide": "가이드", "faq": "FAQ", "me": "내 정보", "mainMenu": "주요 메뉴" },
  "footer": { "siteInfo": "사이트 안내", "business": "사업자 정보", "how": "풀이 과정", "faq": "FAQ" },
  "currency": { "paid": "달빛", "free": "별조각", "balance": "내 재화: {paidName} {paid}개, {freeName} {free}개" },
  "language": { "label": "언어", "current": "언어: {name}", "menu": "언어 고르기" },
  "notFound": { "title": "찾는 페이지가 없어요", "body": "주소가 바뀌었거나 아직 열리지 않은 페이지예요.", "home": "홈으로" }
}
```

`apps/web/lib/i18n/messages/en/common.json`:

```json
{
  "site": { "name": "Starlog", "tagline": "Your story, told in tarot cards and the Four Pillars", "homeLabel": "{site} home" },
  "nav": { "home": "Home", "story": "My readings", "guide": "Guides", "faq": "FAQ", "me": "Me", "mainMenu": "Main menu" },
  "footer": { "siteInfo": "About this site", "business": "Business information", "how": "How readings work", "faq": "FAQ" },
  "currency": { "paid": "Moonlight", "free": "Stardust", "balance": "Your balance: {paid} {paidName}, {free} {freeName}" },
  "language": { "label": "Language", "current": "Language: {name}", "menu": "Choose a language" },
  "notFound": { "title": "We couldn't find that page", "body": "The address may have changed, or the page isn't open yet.", "home": "Go home" }
}
```

`apps/web/lib/i18n/messages/ja/common.json`:

```json
{
  "site": { "name": "Starlog", "tagline": "タロットと四柱推命でつづる、わたしの物語", "homeLabel": "{site} ホーム" },
  "nav": { "home": "ホーム", "story": "記録", "guide": "ガイド", "faq": "FAQ", "me": "マイページ", "mainMenu": "メインメニュー" },
  "footer": { "siteInfo": "サイト案内", "business": "事業者情報", "how": "鑑定のしくみ", "faq": "FAQ" },
  "currency": { "paid": "月あかり", "free": "星のかけら", "balance": "残高：{paidName} {paid}、{freeName} {free}" },
  "language": { "label": "言語", "current": "言語：{name}", "menu": "言語を選ぶ" },
  "notFound": { "title": "ページが見つかりません", "body": "アドレスが変わったか、まだ公開前のページです。", "home": "ホームへ" }
}
```

`apps/web/lib/i18n/messages/zh-hant/common.json`:

```json
{
  "site": { "name": "Starlog", "tagline": "用塔羅與八字，寫下我的故事", "homeLabel": "{site} 首頁" },
  "nav": { "home": "首頁", "story": "我的紀錄", "guide": "指南", "faq": "常見問題", "me": "我的", "mainMenu": "主選單" },
  "footer": { "siteInfo": "網站說明", "business": "商家資訊", "how": "解讀流程", "faq": "常見問題" },
  "currency": { "paid": "月光", "free": "星屑", "balance": "我的餘額：{paidName} {paid}、{freeName} {free}" },
  "language": { "label": "語言", "current": "語言：{name}", "menu": "選擇語言" },
  "notFound": { "title": "找不到這個頁面", "body": "網址可能已經變更，或頁面還沒開放。", "home": "回到首頁" }
}
```

- [ ] **Step 5: Write `apps/web/lib/i18n/messages/index.ts`**

```ts
import type { Locale } from "../locales";
import type { Shape } from "../shape";
import enCommon from "./en/common.json";
import jaCommon from "./ja/common.json";
import koCommon from "./ko/common.json";
import zhHantCommon from "./zh-hant/common.json";

/**
 * Every catalog, every locale (server side and tests only: a client file that imports this ships all
 * four languages; clientImports.test.ts forbids it). Korean defines the keys; `satisfies` fails the
 * typecheck when a locale misses one, and parity.test.ts catches extra keys and broken placeholders.
 */
const ko = { common: koCommon };
export type KoCatalog = typeof ko;
export type Namespace = keyof KoCatalog;
export const NAMESPACES = Object.keys(ko) as Namespace[];

type Catalog = { readonly [N in Namespace]: Shape<KoCatalog[N]> };

export const MESSAGES: Readonly<Record<Locale, Catalog>> = {
  ko,
  en: { common: enCommon satisfies Shape<typeof koCommon> },
  ja: { common: jaCommon satisfies Shape<typeof koCommon> },
  "zh-hant": { common: zhHantCommon satisfies Shape<typeof koCommon> },
};
```

- [ ] **Step 6: Write `apps/web/lib/i18n/translate.ts`**

```ts
import { formatMessage, type MessageValues } from "./format";
import type { Locale } from "./locales";
import { MESSAGES, type KoCatalog, type Namespace } from "./messages";
import { lookup, type Leaves } from "./shape";

export type MessageKey<N extends Namespace> = Leaves<KoCatalog[N]>;
export type Translate<N extends Namespace> = (key: MessageKey<N>, values?: MessageValues) => string;
export type PickedMessages = Partial<Record<Namespace, unknown>>;

/** t() for one namespace. A key missing from a locale falls back to Korean (types make that unreachable). */
export function translator<N extends Namespace>(locale: Locale, ns: N): Translate<N> {
  const catalog = MESSAGES[locale][ns];
  const fallback = MESSAGES.ko[ns];
  return (key, values) => {
    const own = lookup(catalog, key);
    return formatMessage(own ?? lookup(fallback, key) ?? key, values, own === undefined ? "ko" : locale);
  };
}

/** The namespaces a client subtree needs, for one locale only (what a page hands to LocaleProvider). */
export function pickMessages(locale: Locale, namespaces: readonly Namespace[]): PickedMessages {
  return Object.fromEntries(namespaces.map((ns) => [ns, MESSAGES[locale][ns]]));
}
```

- [ ] **Step 7: Write `apps/web/components/i18n/LocaleProvider.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { formatMessage, type MessageValues } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import type { Namespace } from "@/lib/i18n/messages";
import { lookup } from "@/lib/i18n/shape";
import type { MessageKey, PickedMessages, Translate } from "@/lib/i18n/translate";

interface LocaleState {
  locale: Locale;
  messages: PickedMessages;
}

const LocaleContext = createContext<LocaleState>({ locale: "ko", messages: {} });

/**
 * The page's locale and the namespaces its client components read. A nested provider (a page that
 * needs more namespaces) merges its namespaces over the layout's.
 */
export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: PickedMessages; children: ReactNode }) {
  const parent = useContext(LocaleContext);
  const value = useMemo(() => ({ locale, messages: { ...parent.messages, ...messages } }), [locale, parent.messages, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext).locale;

export function useT<N extends Namespace>(ns: N): Translate<N> {
  const { locale, messages } = useContext(LocaleContext);
  const catalog = messages[ns];
  if (catalog === undefined) throw new Error(`Message namespace "${ns}" was not provided to this client tree`);
  return useCallback((key: MessageKey<N>, values?: MessageValues) => formatMessage(lookup(catalog, key) ?? key, values, locale), [catalog, locale]);
}
```

> `import type` from `@/lib/i18n/messages` and `@/lib/i18n/translate` is erased at build time, so no catalog reaches the client bundle, and `clientImports.test.ts` allows `import type` lines. Keep these imports as `import type`.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run apps/web/lib/i18n/parity.test.ts apps/web/lib/i18n/clientImports.test.ts apps/web/components/i18n/LocaleProvider.test.tsx && pnpm typecheck`
Expected:
- PASS: parity runs 3 + 4 cases for `common`, clientImports 1, LocaleProvider 3;
- typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/i18n/shape.ts apps/web/lib/i18n/translate.ts apps/web/lib/i18n/messages apps/web/components/i18n/LocaleProvider.tsx apps/web/lib/i18n/parity.test.ts apps/web/lib/i18n/clientImports.test.ts apps/web/components/i18n/LocaleProvider.test.tsx
git commit -m "feat(i18n): typed JSON catalogs with parity tests, translator, client LocaleProvider" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/shape.ts apps/web/lib/i18n/translate.ts apps/web/lib/i18n/messages apps/web/components/i18n/LocaleProvider.tsx apps/web/lib/i18n/parity.test.ts apps/web/lib/i18n/clientImports.test.ts apps/web/components/i18n/LocaleProvider.test.tsx
```

---

### Task 5: Routing pattern, paths, LocaleLink, navigation hooks

**Files:**
- Create:
  - `apps/web/lib/i18n/routing.ts`, `apps/web/lib/i18n/paths.ts`
  - `apps/web/components/i18n/LocaleLink.tsx`, `apps/web/components/i18n/navigation.ts`
- Test: `apps/web/lib/i18n/paths.test.ts`, `apps/web/components/i18n/LocaleLink.test.tsx`

**Interfaces:**
- Consumes: `LOCALES`, `DEFAULT_LOCALE`, `type Locale` (Task 2); `useLocale` (Task 4).
- Produces:
  - `routing.ts` (relative imports only, for `next.config.ts`): `KO_REWRITE_PATTERN`, `localeRewrites()`, `localeRedirects()`;
  - `paths.ts`: `localePath(locale, path)`, `splitLocale(pathname)`, `isLocalizable(href)`, `localizeHref(locale, href)`, `switchPath(pathname, to)`;
  - `LocaleLink.tsx` (default export, same props as `next/link`);
  - `navigation.ts`: `useLocaleRouter()`, `useBarePathname()`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/i18n/paths.test.ts`:

```ts
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
```

`apps/web/components/i18n/LocaleLink.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Link from "./LocaleLink";
import { LocaleProvider } from "./LocaleProvider";

it("prefixes internal links with the page's locale and leaves Korean links unchanged", () => {
  render(
    <>
      <LocaleProvider locale="ja" messages={{}}>
        <Link href="/tarot/new">ja</Link>
        <Link href="/api/version">api</Link>
      </LocaleProvider>
      <LocaleProvider locale="ko" messages={{}}>
        <Link href="/tarot/new">ko</Link>
      </LocaleProvider>
    </>,
  );
  expect(screen.getByText("ja").getAttribute("href")).toBe("/ja/tarot/new");
  expect(screen.getByText("api").getAttribute("href")).toBe("/api/version");
  expect(screen.getByText("ko").getAttribute("href")).toBe("/tarot/new");
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run apps/web/lib/i18n/paths.test.ts apps/web/components/i18n/LocaleLink.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/i18n/routing.ts`**

```ts
import { DEFAULT_LOCALE, LOCALES } from "./locales";

/**
 * Locale routing for next.config.ts (spec §4.2). Relative imports only: the config is compiled
 * without the "@/" alias. Korean pages live at app/[lang]/… with lang = "ko", reached by rewriting
 * every path that is not a locale prefix (ko included, so /ko/… reaches its redirect), not the API,
 * not Next's own files and not a file (a dot in the last segment).
 */
export const KO_REWRITE_PATTERN = `(?!(?:${LOCALES.join("|")})(?:/|$)|api/|_next/|.*\\.[^/]*$).+`;

export function localeRewrites() {
  return {
    beforeFiles: [
      { source: "/", destination: `/${DEFAULT_LOCALE}` },
      { source: `/:path(${KO_REWRITE_PATTERN})`, destination: `/${DEFAULT_LOCALE}/:path` },
    ],
    afterFiles: [],
    fallback: [],
  };
}

/** /ko and /ko/… are never canonical: 308 to the unprefixed URL. Each prefixed /guide goes to its first tab, like /guide. */
export function localeRedirects() {
  return [
    { source: `/${DEFAULT_LOCALE}`, destination: "/", permanent: true },
    { source: `/${DEFAULT_LOCALE}/:path*`, destination: "/:path*", permanent: true },
    ...LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => ({ source: `/${locale}/guide`, destination: `/${locale}/guide/tarot`, permanent: true })),
  ];
}
```

- [ ] **Step 4: Write `apps/web/lib/i18n/paths.ts`**

```ts
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

const PREFIXED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** "/tarot/new" in `locale`: Korean as it is, the others under their prefix ("/" → "/en"). */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) throw new Error(`localePath needs an absolute path, got "${path}"`);
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The locale of a browser pathname and the path without its prefix. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const locale of PREFIXED) {
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** An internal page link that takes the locale prefix (not the API, not a file, not already prefixed). */
export function isLocalizable(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/)[0] ?? "";
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return false;
  if ((path.split("/").at(-1) ?? "").includes(".")) return false;
  if (/^\/ko(?:\/|$)/.test(path)) return false;
  return splitLocale(path).locale === DEFAULT_LOCALE;
}

export function localizeHref(locale: Locale, href: string): string {
  if (locale === DEFAULT_LOCALE || !isLocalizable(href)) return href;
  const cut = href.search(/[?#]/);
  const path = cut < 0 ? href : href.slice(0, cut);
  const rest = cut < 0 ? "" : href.slice(cut);
  return localePath(locale, path) + rest;
}

/** The same page in another locale (the language switch). Whether it exists there: availability.ts (Task 23). */
export function switchPath(pathname: string, to: Locale): string {
  return localePath(to, splitLocale(pathname).path);
}
```

- [ ] **Step 5: Write `apps/web/components/i18n/LocaleLink.tsx` and `navigation.ts`**

```tsx
"use client";

import NextLink from "next/link";
import type { ComponentPropsWithRef } from "react";
import { localizeHref } from "@/lib/i18n/paths";
import { useLocale } from "./LocaleProvider";

/**
 * next/link with the page's locale prefix (spec §4.2). Task 21's codemod points every
 * `import Link from "next/link"` here; Korean hrefs come out unchanged.
 */
export default function LocaleLink({ href, ...rest }: ComponentPropsWithRef<typeof NextLink>) {
  const locale = useLocale();
  const localized =
    typeof href === "string"
      ? localizeHref(locale, href)
      : href.pathname
        ? { ...href, pathname: localizeHref(locale, href.pathname) }
        : href;
  return <NextLink href={localized} {...rest} />;
}
```

```ts
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { localizeHref, splitLocale } from "@/lib/i18n/paths";
import { useLocale } from "./LocaleProvider";

type Router = ReturnType<typeof useRouter>;

/** useRouter() whose push, replace and prefetch keep the page's locale. */
export function useLocaleRouter(): Router {
  const router = useRouter();
  const locale = useLocale();
  return useMemo<Router>(
    () => ({
      ...router,
      push: (href, options) => router.push(localizeHref(locale, href), options),
      replace: (href, options) => router.replace(localizeHref(locale, href), options),
      prefetch: (href, options) => router.prefetch(localizeHref(locale, href), options),
    }),
    [router, locale],
  );
}

/** usePathname() without the locale prefix, for code that compares paths ("/tarot/draw"). */
export function useBarePathname(): string {
  return splitLocale(usePathname() ?? "/").path;
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run apps/web/lib/i18n/paths.test.ts apps/web/components/i18n/LocaleLink.test.tsx && pnpm typecheck`
Expected: PASS; typecheck exit 0. If `router.prefetch`'s options type differs in Next 16.3, keep the signature `(href: string, options?: Parameters<Router["prefetch"]>[1])`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/routing.ts apps/web/lib/i18n/paths.ts apps/web/lib/i18n/paths.test.ts apps/web/components/i18n/LocaleLink.tsx apps/web/components/i18n/LocaleLink.test.tsx apps/web/components/i18n/navigation.ts
git commit -m "feat(i18n): Korean rewrite pattern, /ko redirects, locale paths, LocaleLink and router hooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/routing.ts apps/web/lib/i18n/paths.ts apps/web/lib/i18n/paths.test.ts apps/web/components/i18n/LocaleLink.tsx apps/web/components/i18n/LocaleLink.test.tsx apps/web/components/i18n/navigation.ts
```

---

### Task 6: Intl formatting

**Files:**
- Create: `apps/web/lib/i18n/intl.ts`
- Test: `apps/web/lib/i18n/intl.test.ts`

**Interfaces:**
- Consumes: `won` (`lib/config.ts`), `koreanDate` (`lib/legal.ts`), `kstMonthDay` (`lib/kst.ts`), `LOCALE_INFO` (Task 2).
- Produces:
  - `formatNumber(locale, n)`, `formatKrw(locale, krw)` (ko: exactly `won()`);
  - `formatIsoDate(locale, "YYYY-MM-DD")` (ko: exactly `koreanDate()`);
  - `formatKstMonthDay(locale, ms)` (ko: exactly `kstMonthDay()`);
  - `nextKstMidnight(ms)`, `clockIn(timeZone, ms)` ("HH:mm", 24h).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/intl.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { clockIn, formatIsoDate, formatKrw, formatKstMonthDay, formatNumber, nextKstMidnight } from "./intl";

describe("intl", () => {
  it("formats Korean money and dates exactly as before", () => {
    expect(formatKrw("ko", 2900)).toBe("2,900원");
    expect(formatIsoDate("ko", "2026-10-01")).toBe("2026년 10월 1일");
    expect(formatKstMonthDay("ko", Date.UTC(2026, 9, 1, 3))).toBe("10월 1일");
  });

  it("shows KRW with the won sign in the other locales, never a converted amount", () => {
    for (const locale of ["en", "ja", "zh-hant"] as const) {
      const text = formatKrw(locale, 2900);
      expect(text, locale).toMatch(/2,900/);
      expect(text, locale).toMatch(/[₩￦]|KRW/);
    }
  });

  it("writes dates the way each language does", () => {
    expect(formatIsoDate("en", "2026-10-01")).toBe("October 1, 2026");
    expect(formatIsoDate("ja", "2026-10-01")).toBe("2026年10月1日");
    expect(formatIsoDate("zh-hant", "2026-10-01")).toBe("2026年10月1日");
    expect(formatKstMonthDay("en", Date.UTC(2026, 8, 30, 16))).toBe("Oct 1");
    expect(formatNumber("en", 12345)).toBe("12,345");
  });

  it("tells when the next KST midnight falls on the reader's clock", () => {
    const now = Date.UTC(2026, 9, 1, 12);
    expect(nextKstMidnight(now)).toBe(Date.UTC(2026, 9, 1, 15));
    expect(clockIn("Asia/Tokyo", nextKstMidnight(now))).toBe("00:00");
    expect(clockIn("Asia/Taipei", nextKstMidnight(now))).toBe("23:00");
    expect(clockIn("America/New_York", nextKstMidnight(now))).toBe("11:00");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/intl.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/web/lib/i18n/intl.ts`**

```ts
import { won } from "@/lib/config";
import { kstMonthDay } from "@/lib/kst";
import { koreanDate } from "@/lib/legal";
import { LOCALE_INFO, type Locale } from "./locales";

/**
 * Numbers, KRW, dates and the KST business clock per locale (spec §8). Korean goes through the
 * existing helpers, so its output stays byte for byte. Prices are KRW in every locale: no conversion.
 */

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const intl = (locale: Locale) => LOCALE_INFO[locale].intl;

export const formatNumber = (locale: Locale, n: number): string => new Intl.NumberFormat(intl(locale)).format(n);

export function formatKrw(locale: Locale, krw: number): string {
  return locale === "ko" ? won(krw) : new Intl.NumberFormat(intl(locale), { style: "currency", currency: "KRW" }).format(krw);
}

/** A calendar date ("2026-10-01"): 시행일, published and updated dates. */
export function formatIsoDate(locale: Locale, iso: string): string {
  if (locale === "ko") return koreanDate(iso);
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(intl(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

/** The KST calendar day that contains `ms`, as month and day ("10월 1일", "Oct 1", "10月1日"). */
export function formatKstMonthDay(locale: Locale, ms: number): string {
  if (locale === "ko") return kstMonthDay(ms);
  return new Intl.DateTimeFormat(intl(locale), { month: locale === "en" ? "short" : "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(ms));
}

/** The next 00:00 KST after `ms` (quotas and 오늘의 한 장 reset then). */
export function nextKstMidnight(ms: number): number {
  return (Math.floor((ms + KST_MS) / DAY_MS) + 1) * DAY_MS - KST_MS;
}

/** "HH:mm" (24 h) on `timeZone`'s clock. */
export function clockIn(timeZone: string, ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/lib/i18n/intl.test.ts`
Expected: PASS (4 tests). If the en month-day differs on this Node's ICU (for example `Oct 1` vs `Oct. 1`), check `process.versions.icu`. Workers run current ICU: keep the expectation and record the Node version in the commit if you needed a newer Node.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/intl.ts apps/web/lib/i18n/intl.test.ts
git commit -m "feat(i18n): numbers, KRW, dates and the KST reset on the reader's clock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/intl.ts apps/web/lib/i18n/intl.test.ts
```

---

### Task 7: Glossary, style guides, review ledger tooling

**Files:**
- Create:
  - `content/i18n/glossary.json`, `content/i18n/style/{en,ja,zh-hant}.md`
  - `content/i18n/review/{en,ja,zh-hant}.json`
  - `scripts/i18n/ledger.mjs`, `scripts/i18n/units/index.ts`, `scripts/i18n/units/messages.ts`
  - `scripts/i18n/status.test.ts`, `scripts/i18n/review.test.ts`, `scripts/i18n/ledger-write.test.ts`
  - `vitest.i18n.config.ts`
- Modify: root `package.json` (scripts `i18n:ledger`, `i18n:status`, `i18n:review`)
- Test: `apps/web/lib/i18n/ledger.test.ts`

**Interfaces:**
- Produces:
  - `ledger.mjs`:
    - `hashKo(text): string` (sha256, first 16 hex);
    - `emptyLedger(locale)`;
    - `recordDrafts(ledger, units): ledger` (new or changed units → `draft` with the current hash; unchanged `reviewed` stays);
    - `markReviewed(ledger, units, match, reviewer, date): ledger` (only units whose hash is current);
    - `summarize(ledger, units, present): { reviewed, draft, stale, missing, total }`;
    - `unitStatus(entry, unit, present): "reviewed" | "draft" | "stale" | "missing"`.
  - `units/index.ts`: `type Unit = { id: string; kind: UnitKind; ko: string; phase: "A" | "B" }`, `type UnitKind`, `allUnits(): Unit[]`, `presentIn(locale, unit): boolean`. Later tasks register kinds: `core` (Task 8), `kb` (Task 13), `info` and `legal` (Task 30), `decision` (Task 35), `guide` (Task 36).
  - Commands:
    - `pnpm i18n:ledger -- ja` records drafts for `ja`;
    - `pnpm i18n:status` prints counts; `I18N_GATE=ja pnpm i18n:status` fails unless every Phase A unit (plus Phase B units of enabled features) is reviewed;
    - `I18N_REVIEW=ja I18N_MATCH='messages:common:*' I18N_REVIEWER='name' pnpm i18n:review` marks reviewed.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/ledger.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { emptyLedger, hashKo, markReviewed, recordDrafts, summarize, unitStatus } from "../../../../scripts/i18n/ledger.mjs";

const units = [
  { id: "messages:common:nav.home", kind: "messages", ko: "홈", phase: "A" },
  { id: "messages:common:nav.me", kind: "messages", ko: "내 정보", phase: "A" },
];
const present = () => true;

describe("review ledger", () => {
  it("records drafts with the Korean hash and keeps reviewed units whose Korean did not change", () => {
    let ledger = recordDrafts(emptyLedger("ja"), units);
    expect(ledger.entries["messages:common:nav.home"]).toEqual({ koHash: hashKo("홈"), status: "draft", reviewer: null, date: null });
    ledger = markReviewed(ledger, units, "messages:common:nav.*", "Aoi", "2026-10-10");
    ledger = recordDrafts(ledger, units);
    expect(ledger.entries["messages:common:nav.home"]!.status).toBe("reviewed");
  });

  it("calls a reviewed unit stale once its Korean changes, and missing when the locale lacks it", () => {
    const ledger = markReviewed(recordDrafts(emptyLedger("en"), units), units, "*", "Sam", "2026-10-10");
    const changed = { ...units[0]!, ko: "처음으로" };
    expect(unitStatus(ledger.entries[changed.id], changed, present)).toBe("stale");
    expect(unitStatus(undefined, units[1]!, () => false)).toBe("missing");
    expect(summarize(ledger, [changed, units[1]!], present)).toEqual({ reviewed: 1, draft: 0, stale: 1, missing: 0, total: 2 });
  });

  it("never marks a stale unit reviewed", () => {
    const ledger = recordDrafts(emptyLedger("en"), units);
    const changed = [{ ...units[0]!, ko: "처음으로" }, units[1]!];
    const marked = markReviewed(ledger, changed, "*", "Sam", "2026-10-10");
    expect(marked.entries["messages:common:nav.home"]!.status).toBe("draft");
    expect(marked.entries["messages:common:nav.me"]!.status).toBe("reviewed");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/ledger.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `scripts/i18n/ledger.mjs`**

```js
// Review ledger (P6 spec §5.3, §6.1): one JSON per locale, content/i18n/review/<locale>.json, mapping a
// translation unit id to the hash of the Korean it was translated from, its status and its reviewer.
// A unit is "stale" when its Korean changed after the entry was written. Pure functions; the vitest
// jobs in scripts/i18n/*.test.ts do the file reading and writing.
import { createHash } from "node:crypto";

export const hashKo = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

export const emptyLedger = (locale) => ({ schema: "starlog-i18n-review/1", locale, entries: {} });

/** New or changed units become drafts with the current hash; an unchanged entry keeps its status. */
export function recordDrafts(ledger, units) {
  const entries = { ...ledger.entries };
  for (const unit of units) {
    const koHash = hashKo(unit.ko);
    const entry = entries[unit.id];
    if (!entry || entry.koHash !== koHash) entries[unit.id] = { koHash, status: "draft", reviewer: null, date: null };
  }
  return { ...ledger, entries };
}

const globToRegex = (glob) => new RegExp(`^${glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** Marks matching units reviewed, only where the entry's hash is the current Korean's. */
export function markReviewed(ledger, units, match, reviewer, date) {
  const re = globToRegex(match);
  const entries = { ...ledger.entries };
  for (const unit of units) {
    const entry = entries[unit.id];
    if (!re.test(unit.id) || !entry || entry.koHash !== hashKo(unit.ko)) continue;
    entries[unit.id] = { ...entry, status: "reviewed", reviewer, date };
  }
  return { ...ledger, entries };
}

export function unitStatus(entry, unit, present) {
  if (!present(unit)) return "missing";
  if (!entry) return "draft";
  if (entry.koHash !== hashKo(unit.ko)) return "stale";
  return entry.status === "reviewed" ? "reviewed" : "draft";
}

export function summarize(ledger, units, present) {
  const counts = { reviewed: 0, draft: 0, stale: 0, missing: 0, total: units.length };
  for (const unit of units) counts[unitStatus(ledger.entries[unit.id], unit, present)]++;
  return counts;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/lib/i18n/ledger.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the units registry and the jobs**

`scripts/i18n/units/messages.ts`:

```ts
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { MESSAGES, NAMESPACES } from "@/lib/i18n/messages";
import { lookup } from "@/lib/i18n/shape";
import type { Unit } from "./index";

function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}

export const messageUnits = (): Unit[] =>
  NAMESPACES.flatMap((ns) => leaves(MESSAGES.ko[ns]).map(([key, ko]): Unit => ({ id: `messages:${ns}:${key}`, kind: "messages", ko, phase: "A" })));

export function messagePresent(locale: Locale, unit: Unit): boolean {
  const [, ns, key] = unit.id.split(":") as [string, (typeof NAMESPACES)[number], string];
  return LOCALES.includes(locale) && lookup(MESSAGES[locale][ns], key) !== undefined;
}
```

`scripts/i18n/units/index.ts`:

```ts
import type { Locale } from "@/lib/i18n/locales";
import { messagePresent, messageUnits } from "./messages";

/** One translatable piece with its Korean source. Phase B kinds only gate a locale once their feature ships there. */
export type UnitKind = "messages" | "core" | "kb" | "info" | "legal" | "decision" | "guide";
export interface Unit {
  id: string;
  kind: UnitKind;
  ko: string;
  phase: "A" | "B";
}

interface Source {
  units: () => Unit[];
  present: (locale: Locale, unit: Unit) => boolean;
}

/** Later tasks add their kind here (core: Task 8, kb: Task 13, info/legal: Task 30, decision: Task 35, guide: Task 36). */
const SOURCES: Partial<Record<UnitKind, Source>> = {
  messages: { units: messageUnits, present: messagePresent },
};

export const allUnits = (): Unit[] => Object.values(SOURCES).flatMap((source) => source!.units());

export function presentIn(locale: Locale, unit: Unit): boolean {
  return SOURCES[unit.kind]?.present(locale, unit) ?? false;
}
```

`vitest.i18n.config.ts` (repo root):

```ts
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The i18n jobs (P6 Task 7): `pnpm i18n:ledger`, `i18n:status`, `i18n:review`, and (Task 14) `i18n:draft`,
// which calls the API and costs money. Never part of `pnpm test`.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const resolveModule = createRequire(import.meta.url).resolve;

export default defineConfig({
  resolve: {
    alias: {
      "@starlog/core": fromRoot("./packages/core/src/index.ts"),
      "@": fromRoot("./apps/web"),
      "@content": fromRoot("./content"),
      "server-only": resolveModule("next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    // Each package script names its one job file (a CLI filter), so no env prefix is needed on Windows.
    include: ["scripts/i18n/*.test.ts"],
    environment: "node",
    env: { ...loadEnv("", fromRoot("./apps/web"), ""), ...process.env } as Record<string, string>,
    testTimeout: 3_600_000,
    silent: false,
  },
});
```

`scripts/i18n/status.test.ts`:

```ts
// `pnpm i18n:status`: counts per locale and kind. `I18N_GATE=<locale>` fails unless every Phase A unit
// and every Phase B unit listed in I18N_GATE_B (comma list of kinds, e.g. "decision,guide") is reviewed.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { emptyLedger, summarize, unitStatus } from "./ledger.mjs";
import { allUnits, presentIn, type Unit } from "./units";

const ledgerFile = (locale: Locale) => new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
const readLedger = (locale: Locale) => (existsSync(ledgerFile(locale)) ? JSON.parse(readFileSync(ledgerFile(locale), "utf8")) : emptyLedger(locale));

test("translation status", () => {
  const units = allUnits();
  const kinds = [...new Set(units.map((u) => u.kind))];
  for (const locale of LOCALES.filter((l) => l !== "ko")) {
    const ledger = readLedger(locale);
    const present = (unit: Unit) => presentIn(locale, unit);
    for (const kind of kinds) {
      console.log(locale.padEnd(8), kind.padEnd(9), JSON.stringify(summarize(ledger, units.filter((u) => u.kind === kind), present)));
    }
  }
  const gate = process.env.I18N_GATE?.trim();
  if (!gate) return;
  const locale = gate as Locale;
  const phaseB = new Set((process.env.I18N_GATE_B ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const ledger = readLedger(locale);
  const blocking = units
    .filter((unit) => unit.phase === "A" || phaseB.has(unit.kind))
    .filter((unit) => unitStatus(ledger.entries[unit.id], unit, (u: Unit) => presentIn(locale, u)) !== "reviewed")
    .map((unit) => unit.id);
  if (blocking.length) console.error(`${locale}: ${blocking.length} units not reviewed, e.g.\n${blocking.slice(0, 40).join("\n")}`);
  expect(blocking).toEqual([]);
});
```

`scripts/i18n/ledger-write.test.ts`:

```ts
// `pnpm i18n:ledger -- <locale>`: after writing or changing translations, record them as drafts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { isLocale } from "@/lib/i18n/locales";
import { emptyLedger, recordDrafts } from "./ledger.mjs";
import { allUnits, presentIn } from "./units";

test("record drafts", () => {
  const locale = process.env.I18N_LOCALE?.trim();
  if (!isLocale(locale) || locale === "ko") throw new Error("Set I18N_LOCALE to en, ja or zh-hant");
  const file = new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
  mkdirSync(new URL("../../content/i18n/review/", import.meta.url), { recursive: true });
  const ledger = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : emptyLedger(locale);
  const units = allUnits().filter((unit) => presentIn(locale, unit));
  const next = recordDrafts(ledger, units);
  const sorted = { ...next, entries: Object.fromEntries(Object.entries(next.entries).sort(([a], [b]) => a.localeCompare(b))) };
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${locale}: ${units.length} units present, ledger written`);
});
```

`scripts/i18n/review.test.ts`:

```ts
// `I18N_REVIEW=ja I18N_MATCH='messages:common:*' I18N_REVIEWER='name' pnpm i18n:review` — for reviewers,
// after they read (and fixed) the matching translations. Units whose Korean changed stay draft.
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { isLocale } from "@/lib/i18n/locales";
import { markReviewed } from "./ledger.mjs";
import { allUnits } from "./units";

test("mark reviewed", () => {
  const locale = process.env.I18N_REVIEW?.trim();
  const match = process.env.I18N_MATCH?.trim();
  const reviewer = process.env.I18N_REVIEWER?.trim();
  if (!isLocale(locale) || locale === "ko" || !match || !reviewer) throw new Error("Set I18N_REVIEW, I18N_MATCH and I18N_REVIEWER");
  const file = new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
  const ledger = JSON.parse(readFileSync(file, "utf8"));
  const next = markReviewed(ledger, allUnits(), match, reviewer, new Date().toISOString().slice(0, 10));
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
});
```

Root `package.json` scripts (the file argument is Vitest's path filter, so each script runs one job and no env prefix is needed in cmd.exe):

```json
"i18n:status": "vitest run -c vitest.i18n.config.ts scripts/i18n/status.test.ts",
"i18n:ledger": "vitest run -c vitest.i18n.config.ts scripts/i18n/ledger-write.test.ts",
"i18n:review": "vitest run -c vitest.i18n.config.ts scripts/i18n/review.test.ts"
```

The jobs read their settings from the environment: `I18N_LOCALE=ja pnpm i18n:ledger` in Git Bash, or `$env:I18N_LOCALE="ja"; pnpm i18n:ledger` in PowerShell.

- [ ] **Step 6: Write the glossary and the style guides**

`content/i18n/glossary.json`:

```json
{
  "schema": "starlog-glossary/1",
  "terms": {
    "brand": { "ko": "스타로그", "en": "Starlog", "ja": "Starlog", "zh-hant": "Starlog" },
    "catAstrologer": { "ko": "고양이 점성술사", "en": "the cat astrologer", "ja": "猫の占星術師", "zh-hant": "貓咪占星師" },
    "rabbitLibrarian": { "ko": "흰 토끼 사서", "en": "the white rabbit librarian", "ja": "白うさぎの司書", "zh-hant": "白兔圖書館員" },
    "rabbitTeacher": { "ko": "한복 입은 토끼 선생님", "en": "the rabbit teacher in hanbok", "ja": "韓服姿のうさぎ先生", "zh-hant": "穿韓服的兔子老師" },
    "moonlight": { "ko": "달빛", "en": "Moonlight", "ja": "月あかり", "zh-hant": "月光" },
    "stardust": { "ko": "별조각", "en": "Stardust", "ja": "星のかけら", "zh-hant": "星屑" },
    "tarot": { "ko": "타로", "en": "tarot", "ja": "タロット", "zh-hant": "塔羅" },
    "saju": { "ko": "사주", "en": "Saju (Four Pillars)", "ja": "四柱推命", "zh-hant": "八字" },
    "nowCard": { "ko": "지금의 한 장", "en": "One Card for Now", "ja": "いまの一枚", "zh-hant": "此刻一牌" },
    "todayCard": { "ko": "오늘의 한 장", "en": "Today's Card", "ja": "今日の一枚", "zh-hant": "今日一牌" },
    "bonds": { "ko": "별자리 인연", "en": "Constellation Bonds", "ja": "星座の縁", "zh-hant": "星座緣分" },
    "luckyNumbers": { "ko": "이번 주 행운 번호", "en": "This week's lucky numbers", "ja": "今週のラッキーナンバー", "zh-hant": "本週幸運數字" },
    "upright": { "ko": "정방향", "en": "upright", "ja": "正位置", "zh-hant": "正位" },
    "reversed": { "ko": "역방향", "en": "reversed", "ja": "逆位置", "zh-hant": "逆位" },
    "fullReading": { "ko": "전체 풀이", "en": "full reading", "ja": "全文の鑑定", "zh-hant": "完整解讀" },
    "followUp": { "ko": "이어서 물어보기", "en": "Ask a follow-up", "ja": "続けて聞く", "zh-hant": "繼續追問" },
    "rws1909": { "ko": "1909년 원판 라이더-웨이트-스미스", "en": "the original 1909 Rider–Waite–Smith deck", "ja": "1909年版ライダー・ウェイト・スミス", "zh-hant": "1909年原版萊德偉特史密斯" }
  }
}
```

> Do not use the em dash in `rws1909.en` if a validator scans it; it is glossary data, not model output. Keep it exactly as written.

`content/i18n/style/ja.md` (the en and zh-hant files follow the same five headings with their own rules from spec §3 and §7.3):

```markdown
# 日本語スタイルガイド（Starlog）

## 声
- です・ます調。親しい占い師が隣で話すような、やわらかく具体的な文。
- 「あなた」はほとんど使わない。主語は省く。
- だ・である調で文を終えない（引用・送る文の例は除く）。体言止めはときどき可。

## 避けること（AIっぽさ）
- まとめると／結論として／総じて／要するに で文を始めない。
- 「重要です」「大切です」「欠かせません」を繰り返さない。
- 「〜でしょう。」を3文続けない。同じ文末を4回続けない。
- 「このカードは〜と教えてくれます」のようにカードを主語にしない。絵の場面を描いて、自分の状況に重ねる。
- ポジティブ・エネルギー・ステージ・チャレンジなどのカタカナ語を重ねない。「寄り添う」を使わない。
- 箇条書き・太字・絵文字・「！！」を文中に使わない。

## 約束しない
- 必ず・絶対・間違いなく・100％ を使わない。「運命」は「運命の輪」というカード名だけ。
- 相手の気持ちを事実として言わない（「彼はあなたを好きです」×）。結婚の成否や時期を断定しない。
- 病気・寿命・妊娠・事故を占わない。投資・借入を勧めない。

## 用語
- content/i18n/glossary.json と packages/core/src/i18n/data/ja.json の用語を使う（正位置・逆位置、日干、通変星、十二運、大運）。

## レビュー確認表
意味が同じ／約束・断定がない／他人の気持ちを断定しない／ネイティブが書いた文に読める／用語表どおり／絵の描写がKBの事実どおり／数字・価格・日付／です・ます／ボタンが360px幅で折り返さない／ブランド・キャラクター名／相談窓口の番号と出典
```

Write `content/i18n/style/en.md` and `content/i18n/style/zh-hant.md` with the same five headings:
- **en.**
  - Voice: warm, plain second person, contractions fine, US spelling, mix sentence lengths.
  - Avoid: the en list of spec §7.3, word for word.
  - No promises: guaranteed, definitely will, 100%, destiny or fate (except the card name), others' feelings as fact, marriage verdicts, illness, death, pregnancy, accidents, investment or loan advice.
  - Terms: glossary + `en.json`.
  - Review checklist: the same eleven checks, in English.
- **zh-hant.**
  - Voice: Taiwan written vocabulary, 你 not 您, 「」 quotes, warm friend-to-friend tone.
  - Avoid: the zh-hant list of spec §7.3 and mainland words (視頻 → 影片, 信息 → 資訊, 質量 → 品質, 默認 → 預設); never simplified characters.
  - No promises: 一定會、絕對、保證、百分之百, 命中注定 (except 命運之輪), and the same topics as en.
  - Terms: glossary + `zh-hant.json`.
  - Review checklist: the same eleven checks.

Create the three ledgers empty: `{"schema":"starlog-i18n-review/1","locale":"<locale>","entries":{}}` plus a final newline.

- [ ] **Step 7: Run the jobs once**

Run: `I18N_LOCALE=ja pnpm i18n:ledger && I18N_LOCALE=en pnpm i18n:ledger && I18N_LOCALE=zh-hant pnpm i18n:ledger && pnpm i18n:status`
Expected:
- each ledger now lists 22 `messages:common:*` entries as `draft`;
- the status run prints `{"reviewed":0,"draft":22,…}` per locale and passes;
- `I18N_GATE=ja pnpm i18n:status` fails, listing the 22 ids. That is correct: drafts block a public launch.

- [ ] **Step 8: Commit**

```bash
git add scripts/i18n vitest.i18n.config.ts package.json content/i18n apps/web/lib/i18n/ledger.test.ts
git commit -m "feat(i18n): glossary, style guides and review ledger with draft, stale and launch-gate status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/i18n vitest.i18n.config.ts package.json content/i18n apps/web/lib/i18n/ledger.test.ts
```

---

### Task 8: Core locale data

**Files:**
- Create: `packages/core/src/i18n/index.ts`, `packages/core/src/i18n/data/{en,ja,zh-hant}.json`, `scripts/i18n/units/core.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./i18n";`), `scripts/i18n/units/index.ts` (register `core`)
- Test: `packages/core/tests/i18n.test.ts`

**Interfaces:**
- Consumes: `CARDS`, `getCard`, `TEMPLATES`, `TOPICS_BY_WHO`, `CONSTELLATIONS` (core).
- Produces (core exports):
  - `CORE_LOCALES`, `type CoreLocale`, `type CoreLocaleData`;
  - `TEN_GOD_KEYS`, `STAGE_KEYS`, `ELEMENT_KEYS`, `SAJU_TERM_KEYS`;
  - `cardNameIn(id, locale)`, `cardAliasesIn(id, locale)`;
  - `positionLabel(locale, koPosition)`;
  - `topicLabel(locale, who, topic)`, `topicQuestion(locale, who, topic)`;
  - `conditionText(locale, who, topicId, condition) → { label, options }`;
  - `whenLabel(locale, when)`, `unsureWords(locale)`, `signName(locale, id)`;
  - `sajuGlossary(locale)` → the `saju` block, or Korean identity for `ko`.

- [ ] **Step 1: Write the failing test** — `packages/core/tests/i18n.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  CARDS, CONSTELLATIONS, CORE_LOCALES, ELEMENT_KEYS, STAGE_KEYS, TEMPLATES, TEN_GOD_KEYS, TOPICS_BY_WHO,
  cardAliasesIn, cardNameIn, conditionText, positionLabel, sajuGlossary, signName, topicLabel, topicQuestion, unsureWords, whenLabel,
  type Who,
} from "../src/index";

const FOREIGN = CORE_LOCALES.filter((locale) => locale !== "ko");
const HANGUL = /[\uac00-\ud7a3]/;

describe.each(FOREIGN)("core i18n: %s", (locale) => {
  it("names all 78 cards without Hangul", () => {
    for (const card of CARDS) expect(cardNameIn(card.id, locale), card.id).toMatch(/^[^\uac00-\ud7a3]+$/);
  });

  it("labels every spread position", () => {
    for (const template of Object.values(TEMPLATES)) for (const position of template.positions) expect(positionLabel(locale, position), `${template.id}: ${position}`).not.toMatch(HANGUL);
  });

  it("labels and asks every topic, keeping the {when} slot", () => {
    for (const [who, topics] of Object.entries(TOPICS_BY_WHO) as Array<[Who, (typeof TOPICS_BY_WHO)[Who]]>) {
      for (const topic of topics) {
        expect(topicLabel(locale, who, topic), `${who}.${topic.id}`).not.toMatch(HANGUL);
        const question = topicQuestion(locale, who, topic);
        expect(question, `${who}.${topic.id}`).not.toMatch(HANGUL);
        expect(question, `${who}.${topic.id}`).toContain("{when}");
      }
    }
  });

  it("translates every condition with the same options, the unsure one last", () => {
    for (const [who, topics] of Object.entries(TOPICS_BY_WHO) as Array<[Who, (typeof TOPICS_BY_WHO)[Who]]>) {
      for (const topic of topics) {
        for (const condition of topic.conditions) {
          const text = conditionText(locale, who, topic.id, condition);
          const where = `${who}.${topic.id}.${condition.id}`;
          expect(text.label, where).not.toMatch(HANGUL);
          expect(text.options, where).toHaveLength(condition.options.length);
          for (const option of text.options) expect(option, where).not.toMatch(HANGUL);
          expect(unsureWords(locale), where).toContain(text.options.at(-1));
        }
      }
    }
  });

  it("names the four times, the twelve signs and every saju term", () => {
    for (const when of ["today", "week", "month", "year"] as const) expect(whenLabel(locale, when)).not.toMatch(HANGUL);
    for (const sign of CONSTELLATIONS) expect(signName(locale, sign.id)).not.toMatch(HANGUL);
    const glossary = sajuGlossary(locale);
    for (const key of TEN_GOD_KEYS) expect(glossary.tenGods[key]).not.toMatch(HANGUL);
    for (const key of STAGE_KEYS) expect(glossary.stages[key]).not.toMatch(HANGUL);
    for (const key of ELEMENT_KEYS) expect(glossary.elements[key]).not.toMatch(HANGUL);
  });
});

it("builds Traditional Chinese card names from their parts and knows the common aliases", () => {
  expect(cardNameIn("major-00-fool", "zh-hant")).toBe("愚者");
  expect(cardNameIn("cups-03", "zh-hant")).toBe("聖杯三");
  expect(cardNameIn("wands-11", "zh-hant")).toBe("權杖侍從");
  expect(cardNameIn("pentacles-01", "zh-hant")).toBe("錢幣王牌");
  expect(cardNameIn("major-02-high-priestess", "ja")).toBe("女教皇");
  expect(cardAliasesIn("pentacles-03", "en")).toContain("Three of Coins");
  expect(cardAliasesIn("major-20-judgement", "en")).toContain("Judgment");
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run packages/core/tests/i18n.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Write `packages/core/src/i18n/index.ts`**

```ts
import { CONSTELLATIONS, type SignId } from "../bonds/constellations";
import { getCard, type Suit } from "../tarot/cards";
import { TEMPLATES, type ConditionDef, type TopicDef, type When, type Who } from "../tarot/templates";
import enData from "./data/en.json";
import jaData from "./data/ja.json";
import zhHantData from "./data/zh-hant.json";

/**
 * Card, spread, topic, condition, sign and saju words per locale (P6 spec §6.4–6.7). Korean comes
 * from the definitions themselves; en and ja card names from cards.ts; the rest from data/*.json,
 * which the review ledger tracks (scripts/i18n/units/core.ts).
 */

export const CORE_LOCALES = ["ko", "en", "ja", "zh-hant"] as const;
export type CoreLocale = (typeof CORE_LOCALES)[number];
type Foreign = Exclude<CoreLocale, "ko">;

export const TEN_GOD_KEYS = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"] as const;
export const STAGE_KEYS = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"] as const;
export const ELEMENT_KEYS = ["목", "화", "토", "금", "수"] as const;
export const SAJU_TERM_KEYS = ["saju", "dayMaster", "tenGods", "stages", "luck", "manseryeok", "stems", "branches", "elements"] as const;

export interface SajuGlossary {
  terms: Record<(typeof SAJU_TERM_KEYS)[number], string>;
  tenGods: Record<(typeof TEN_GOD_KEYS)[number], string>;
  stages: Record<(typeof STAGE_KEYS)[number], string>;
  elements: Record<(typeof ELEMENT_KEYS)[number], string>;
  /** hanja stem → how the locale writes it (en "Yang Fire"; ja and zh keep the hanja) */
  stems: Record<string, string>;
  /** hanja branch → how the locale writes it (en "Tiger"; ja and zh keep the hanja) */
  branches: Record<string, string>;
}

export interface CoreLocaleData {
  /** zh-hant only: names built from parts (en and ja names live in cards.ts) */
  cards?: { majors: string[]; suits: Record<Suit, string>; ranks: Record<string, string>; pattern: string };
  suitNames: Record<Suit, string>;
  majorAliases: Record<string, string[]>;
  suitAliases: Partial<Record<Suit, string[]>>;
  /** Korean position → label (ja falls back to positionsJa) */
  positions: Record<string, string>;
  /** "<who>.<topicId>" → label and question with {when} (ja falls back to the topic's ja fields) */
  topics: Record<string, { label: string; question: string }>;
  /** "<who>.<topicId>.<conditionId>" → label and options (same count and order as Korean) */
  conditions: Record<string, { label: string; options: string[] }>;
  when: Record<When, string>;
  /** the locale's 잘 모르겠어요 and 아직 모르겠어요 */
  unsure: string[];
  constellations: Record<SignId, string>;
  saju: SajuGlossary;
}

const DATA: Readonly<Record<Foreign, CoreLocaleData>> = {
  en: enData satisfies CoreLocaleData,
  ja: jaData satisfies CoreLocaleData,
  "zh-hant": zhHantData satisfies CoreLocaleData,
};

const KO_UNSURE = ["잘 모르겠어요", "아직 모르겠어요"];
const JA_POSITION: ReadonlyMap<string, string> = new Map(
  Object.values(TEMPLATES).flatMap((template) => template.positions.map((position, i) => [position, template.positionsJa[i] ?? position] as const)),
);

export function cardNameIn(id: string, locale: CoreLocale): string {
  const card = getCard(id);
  if (locale !== "zh-hant") return card.names[locale];
  const parts = DATA["zh-hant"].cards!;
  if (card.arcana === "major") return parts.majors[card.number] ?? card.names.en;
  return parts.pattern.replace("{suit}", parts.suits[card.suit!]).replace("{rank}", parts.ranks[String(card.number)] ?? String(card.number));
}

/** Other names a reading may use for the card (validators: foreign-card detection). */
export function cardAliasesIn(id: string, locale: CoreLocale): string[] {
  if (locale === "ko") return [];
  const data = DATA[locale];
  const card = getCard(id);
  if (card.arcana === "major") return data.majorAliases[id] ?? [];
  const name = cardNameIn(id, locale);
  const suit = data.suitNames[card.suit!];
  return (data.suitAliases[card.suit!] ?? []).map((alias) => name.replace(suit, alias));
}

export function positionLabel(locale: CoreLocale, position: string): string {
  if (locale === "ko") return position;
  return DATA[locale].positions[position] ?? (locale === "ja" ? JA_POSITION.get(position) : undefined) ?? position;
}

const topicKey = (who: Who, id: string) => `${who}.${id}`;

export function topicLabel(locale: CoreLocale, who: Who, topic: TopicDef): string {
  if (locale === "ko") return topic.ko;
  return DATA[locale].topics[topicKey(who, topic.id)]?.label ?? (locale === "ja" ? topic.ja : topic.ko);
}

export function topicQuestion(locale: CoreLocale, who: Who, topic: TopicDef): string {
  if (locale === "ko") return topic.questionKo;
  return DATA[locale].topics[topicKey(who, topic.id)]?.question ?? (locale === "ja" ? topic.questionJa : topic.questionKo);
}

export function conditionText(locale: CoreLocale, who: Who, topicId: string, condition: ConditionDef): { label: string; options: string[] } {
  if (locale === "ko") return { label: condition.label, options: condition.options };
  return DATA[locale].conditions[`${who}.${topicId}.${condition.id}`] ?? { label: condition.label, options: condition.options };
}

const KO_WHEN: Record<When, string> = { today: "오늘", week: "이번 주", month: "이번 달", year: "올해" };
export const whenLabel = (locale: CoreLocale, when: When): string => (locale === "ko" ? KO_WHEN[when] : DATA[locale].when[when]);
export const unsureWords = (locale: CoreLocale): string[] => (locale === "ko" ? KO_UNSURE : DATA[locale].unsure);

export function signName(locale: CoreLocale, id: SignId): string {
  const sign = CONSTELLATIONS.find((s) => s.id === id)!;
  return locale === "ko" ? sign.ko : DATA[locale].constellations[id];
}

const identity = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, key])) as Record<K, string>;

export function sajuGlossary(locale: CoreLocale): SajuGlossary {
  if (locale !== "ko") return DATA[locale].saju;
  return {
    terms: { saju: "사주", dayMaster: "일간", tenGods: "십성", stages: "12운성", luck: "대운", manseryeok: "만세력", stems: "천간", branches: "지지", elements: "오행" },
    tenGods: identity(TEN_GOD_KEYS),
    stages: identity(STAGE_KEYS),
    elements: identity(ELEMENT_KEYS),
    stems: {},
    branches: {},
  };
}
```

`packages/core/src/index.ts`: append `export * from "./i18n";`.

- [ ] **Step 4: Write the data files.**
  - The fixed parts are given below.
  - `topics` (en, zh-hant; ja may stay `{}`) and `conditions` (all three, 57 conditions) you write yourself from `TOPICS_BY_WHO`, following `content/i18n/style/<locale>.md`. Keys are `"<who>.<topicId>"` and `"<who>.<topicId>.<conditionId>"`.
  - Questions keep `{when}`. In en it usually goes last ("How will my love life go {when}?"); in zh-hant first ("{when}我的感情會怎麼發展？").
  - Options keep the Korean order, and the last option is one of `unsure`.

`packages/core/src/i18n/data/zh-hant.json` (fixed parts; add `topics` and `conditions`):

```json
{
  "cards": {
    "majors": ["愚者", "魔術師", "女祭司", "皇后", "皇帝", "教皇", "戀人", "戰車", "力量", "隱者", "命運之輪", "正義", "吊人", "死神", "節制", "惡魔", "高塔", "星星", "月亮", "太陽", "審判", "世界"],
    "suits": { "wands": "權杖", "cups": "聖杯", "swords": "寶劍", "pentacles": "錢幣" },
    "ranks": { "1": "王牌", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九", "10": "十", "11": "侍從", "12": "騎士", "13": "皇后", "14": "國王" },
    "pattern": "{suit}{rank}"
  },
  "suitNames": { "wands": "權杖", "cups": "聖杯", "swords": "寶劍", "pentacles": "錢幣" },
  "majorAliases": { "major-02-high-priestess": ["女教皇"], "major-12-hanged-man": ["倒吊人"], "major-16-tower": ["塔"], "major-17-star": ["星"], "major-18-moon": ["月"] },
  "suitAliases": { "pentacles": ["星幣", "金幣"], "wands": ["權仗"], "swords": ["寶劍"], "cups": ["聖杯"] },
  "positions": {
    "나의 마음": "我的心意", "두 사람 사이": "兩人之間", "먼저 움직이면": "如果先行動",
    "상대에게 비친 나": "對方眼中的我", "두 사람의 흐름": "兩人的走向",
    "지금 상황": "目前的狀況", "막힌 곳": "卡住的地方", "나아갈 방향": "前進的方向",
    "이쪽을 고르면": "選這一邊", "저쪽을 고르면": "選另一邊", "놓치고 있는 것": "忽略的事",
    "지금의 나": "現在的我", "필요한 것": "需要的東西", "이 시기의 흐름": "這段時間的走向",
    "모임의 분위기": "團體的氣氛", "나의 자리": "我的位置", "도움이 될 태도": "有幫助的態度",
    "오늘의 한 장": "今日一牌",
    "가로막는 것": "阻擋的事", "바탕": "根基", "지나온 것": "走過的路", "바라는 것": "期望的事", "다가올 것": "即將到來的事",
    "나의 태도": "我的態度", "주변": "周遭", "바람과 걱정": "期待與擔憂", "결과의 방향": "結果的方向",
    "그 사람 쪽 흐름": "對方那邊的走向", "엇갈리는 지점": "錯開的地方", "함께 가꿀 방향": "一起經營的方向"
  },
  "when": { "today": "今天", "week": "這週", "month": "這個月", "year": "今年" },
  "unsure": ["不太確定", "還不確定"],
  "constellations": { "aries": "牡羊座", "taurus": "金牛座", "gemini": "雙子座", "cancer": "巨蟹座", "leo": "獅子座", "virgo": "處女座", "libra": "天秤座", "scorpio": "天蠍座", "sagittarius": "射手座", "capricorn": "摩羯座", "aquarius": "水瓶座", "pisces": "雙魚座" },
  "saju": {
    "terms": { "saju": "八字", "dayMaster": "日主", "tenGods": "十神", "stages": "十二長生", "luck": "大運", "manseryeok": "萬年曆", "stems": "天干", "branches": "地支", "elements": "五行" },
    "tenGods": { "비견": "比肩", "겁재": "劫財", "식신": "食神", "상관": "傷官", "편재": "偏財", "정재": "正財", "편관": "七殺", "정관": "正官", "편인": "偏印", "정인": "正印" },
    "stages": { "장생": "長生", "목욕": "沐浴", "관대": "冠帶", "건록": "臨官", "제왕": "帝旺", "쇠": "衰", "병": "病", "사": "死", "묘": "墓", "절": "絕", "태": "胎", "양": "養" },
    "elements": { "목": "木", "화": "火", "토": "土", "금": "金", "수": "水" },
    "stems": { "甲": "甲", "乙": "乙", "丙": "丙", "丁": "丁", "戊": "戊", "己": "己", "庚": "庚", "辛": "辛", "壬": "壬", "癸": "癸" },
    "branches": { "子": "子", "丑": "丑", "寅": "寅", "卯": "卯", "辰": "辰", "巳": "巳", "午": "午", "未": "未", "申": "申", "酉": "酉", "戌": "戌", "亥": "亥" }
  }
}
```

`packages/core/src/i18n/data/ja.json` (fixed parts; add `conditions`; `positions` and `topics` may stay `{}` because the core ja fields cover them):

```json
{
  "suitNames": { "wands": "ワンド", "cups": "カップ", "swords": "ソード", "pentacles": "ペンタクル" },
  "majorAliases": { "major-02-high-priestess": ["女司祭"], "major-12-hanged-man": ["吊された男"], "major-13-death": ["死"], "major-21-world": ["世界"] },
  "suitAliases": { "pentacles": ["金貨", "コイン"], "wands": ["棒", "杖"], "swords": ["剣"], "cups": ["杯", "聖杯"] },
  "positions": {},
  "topics": {},
  "when": { "today": "今日", "week": "今週", "month": "今月", "year": "今年" },
  "unsure": ["よくわからない", "まだわからない"],
  "constellations": { "aries": "牡羊座", "taurus": "牡牛座", "gemini": "双子座", "cancer": "蟹座", "leo": "獅子座", "virgo": "乙女座", "libra": "天秤座", "scorpio": "蠍座", "sagittarius": "射手座", "capricorn": "山羊座", "aquarius": "水瓶座", "pisces": "魚座" },
  "saju": {
    "terms": { "saju": "四柱推命", "dayMaster": "日干", "tenGods": "通変星", "stages": "十二運", "luck": "大運", "manseryeok": "万年暦", "stems": "天干", "branches": "地支", "elements": "五行" },
    "tenGods": { "비견": "比肩", "겁재": "劫財", "식신": "食神", "상관": "傷官", "편재": "偏財", "정재": "正財", "편관": "偏官", "정관": "正官", "편인": "偏印", "정인": "印綬" },
    "stages": { "장생": "長生", "목욕": "沐浴", "관대": "冠帯", "건록": "建禄", "제왕": "帝旺", "쇠": "衰", "병": "病", "사": "死", "묘": "墓", "절": "絶", "태": "胎", "양": "養" },
    "elements": { "목": "木", "화": "火", "토": "土", "금": "金", "수": "水" },
    "stems": { "甲": "甲", "乙": "乙", "丙": "丙", "丁": "丁", "戊": "戊", "己": "己", "庚": "庚", "辛": "辛", "壬": "壬", "癸": "癸" },
    "branches": { "子": "子", "丑": "丑", "寅": "寅", "卯": "卯", "辰": "辰", "巳": "巳", "午": "午", "未": "未", "申": "申", "酉": "酉", "戌": "戌", "亥": "亥" }
  }
}
```

`packages/core/src/i18n/data/en.json` (fixed parts; add `topics` and `conditions`):

```json
{
  "suitNames": { "wands": "Wands", "cups": "Cups", "swords": "Swords", "pentacles": "Pentacles" },
  "majorAliases": { "major-20-judgement": ["Judgment"], "major-08-strength": ["Fortitude"] },
  "suitAliases": { "pentacles": ["Coins", "Disks"], "wands": ["Rods", "Staves"], "cups": ["Chalices"] },
  "positions": {
    "나의 마음": "My heart", "두 사람 사이": "Between the two of you", "먼저 움직이면": "If you move first",
    "상대에게 비친 나": "How they see you", "두 사람의 흐름": "Where the two of you are heading",
    "지금 상황": "Where things stand", "막힌 곳": "What's stuck", "나아갈 방향": "The way forward",
    "이쪽을 고르면": "If you choose this", "저쪽을 고르면": "If you choose that", "놓치고 있는 것": "What you may be missing",
    "지금의 나": "You right now", "필요한 것": "What you need", "이 시기의 흐름": "The flow of this time",
    "모임의 분위기": "The group's mood", "나의 자리": "Your place in it", "도움이 될 태도": "A stance that helps",
    "오늘의 한 장": "Today's card",
    "가로막는 것": "What stands in the way", "바탕": "The foundation", "지나온 것": "What's behind you", "바라는 것": "What you hope for", "다가올 것": "What's coming",
    "나의 태도": "Your stance", "주변": "Your surroundings", "바람과 걱정": "Hopes and worries", "결과의 방향": "Where it leads",
    "그 사람 쪽 흐름": "Their side of things", "엇갈리는 지점": "Where you miss each other", "함께 가꿀 방향": "What to grow together"
  },
  "when": { "today": "today", "week": "this week", "month": "this month", "year": "this year" },
  "unsure": ["Not sure", "Not sure yet"],
  "constellations": { "aries": "Aries", "taurus": "Taurus", "gemini": "Gemini", "cancer": "Cancer", "leo": "Leo", "virgo": "Virgo", "libra": "Libra", "scorpio": "Scorpio", "sagittarius": "Sagittarius", "capricorn": "Capricorn", "aquarius": "Aquarius", "pisces": "Pisces" },
  "saju": {
    "terms": { "saju": "Saju (Four Pillars)", "dayMaster": "Day Master", "tenGods": "Ten Gods", "stages": "Twelve Life Stages", "luck": "10-year Luck Pillar", "manseryeok": "perpetual calendar", "stems": "Heavenly Stems", "branches": "Earthly Branches", "elements": "Five Elements" },
    "tenGods": { "비견": "Companion", "겁재": "Rob Wealth", "식신": "Eating God", "상관": "Hurting Officer", "편재": "Indirect Wealth", "정재": "Direct Wealth", "편관": "Seven Killings", "정관": "Direct Officer", "편인": "Indirect Resource", "정인": "Direct Resource" },
    "stages": { "장생": "Birth", "목욕": "Bath", "관대": "Crown", "건록": "Coming of Age", "제왕": "Peak", "쇠": "Decline", "병": "Sickness", "사": "Death", "묘": "Tomb", "절": "Extinction", "태": "Conception", "양": "Nurture" },
    "elements": { "목": "Wood", "화": "Fire", "토": "Earth", "금": "Metal", "수": "Water" },
    "stems": { "甲": "Yang Wood", "乙": "Yin Wood", "丙": "Yang Fire", "丁": "Yin Fire", "戊": "Yang Earth", "己": "Yin Earth", "庚": "Yang Metal", "辛": "Yin Metal", "壬": "Yang Water", "癸": "Yin Water" },
    "branches": { "子": "Rat", "丑": "Ox", "寅": "Tiger", "卯": "Rabbit", "辰": "Dragon", "巳": "Snake", "午": "Horse", "未": "Goat", "申": "Monkey", "酉": "Rooster", "戌": "Dog", "亥": "Pig" }
  }
}
```

- [ ] **Step 5: Register the `core` units.** Create `scripts/i18n/units/core.ts`: one unit per Korean string that a data file translates, with ids:
  - `core:position:<ko>`
  - `core:topic:<who>.<id>` (Korean = `ko + "\n" + questionKo`)
  - `core:condition:<who>.<id>.<cid>` (Korean = label + options joined by `\n`)
  - `core:when:<w>`, `core:sign:<id>`, `core:saju:<group>.<key>`
  - `core:card:<id>` (zh-hant only matters, but register for all)

  `present(locale, unit)` is true when the accessor returns a value without Hangul. Register it in `units/index.ts` as `core: { units: coreUnits, present: corePresent }`, then run `I18N_LOCALE=<l> pnpm i18n:ledger` for en, ja and zh-hant.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run packages/core/tests && pnpm typecheck`
Expected: every core test passes, the new i18n file included (5 × 3 + 1 cases); typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/i18n packages/core/src/index.ts packages/core/tests/i18n.test.ts scripts/i18n/units content/i18n/review
git commit -m "feat(core): card, spread, topic, condition, sign and saju words for en, ja and zh-hant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/core/src/i18n packages/core/src/index.ts packages/core/tests/i18n.test.ts scripts/i18n/units content/i18n/review
```

---

### Task 9: Validation text and script utilities

**Files:**
- Create: `apps/web/lib/ai/locale/text.ts`, `apps/web/lib/ai/locale/script.ts`
- Test: `apps/web/lib/ai/locale/text.test.ts`

**Interfaces:**
- Consumes: `type Locale` (Task 2).
- Produces (all for `IntlLocale = Exclude<Locale, "ko">`):
  - `text.ts`:
    - `measure(locale, text)`: en = words; ja and zh = characters without whitespace;
    - `sentencesOf(locale, text)`;
    - `tokens(locale, text)`: en = lower-case stems minus stop words; ja and zh = CJK/kana character bigrams;
    - `overlap(locale, text, phrase)`: share of the phrase's tokens found in the text, 0..1;
    - `mentionsIn(locale, text, phrase, share = 0.5)`;
    - `beyondUser(pattern, text, userText)`: matches the user did not write.
  - `script.ts`:
    - `HANGUL`, `KANA`;
    - `SIMPLIFIED_ONLY: ReadonlySet<string>`;
    - `scriptViolations(locale, text, userText): string[]` (hard, English, prefixed `[script]`).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/locale/text.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { scriptViolations } from "./script";
import { beyondUser, measure, mentionsIn, overlap, sentencesOf, tokens } from "./text";

describe("locale text", () => {
  it("measures English in words and CJK in characters without spaces", () => {
    expect(measure("en", "The lamp is held high, isn't it?")).toBe(7);
    expect(measure("ja", "ランプを 高く掲げる。")).toBe(10);
    expect(measure("zh-hant", "高舉 燈籠。")).toBe(5);
  });

  it("splits sentences on the language's own punctuation", () => {
    expect(sentencesOf("ja", "崖の端に立っています。空を見上げて！どうしますか？")).toHaveLength(3);
    expect(sentencesOf("en", "He stands. He looks up! Now?")).toHaveLength(3);
  });

  it("matches phrases by stems in English and by bigrams in CJK", () => {
    expect(tokens("en", "The dogs were jumping")).toEqual(["dog", "jump"]);
    expect(mentionsIn("en", "Your crush texted back yesterday.", "my crush texts")).toBe(true);
    expect(mentionsIn("ja", "片思い中の気持ちが揺れています。", "片思い中")).toBe(true);
    expect(overlap("zh-hant", "他站在懸崖邊，抬頭看天空。", "站在懸崖的邊緣，抬頭看著天空")).toBeGreaterThan(0.5);
    expect(overlap("zh-hant", "今天適合整理房間。", "站在懸崖的邊緣，抬頭看著天空")).toBeLessThan(0.15);
  });

  it("counts only what the user did not write", () => {
    expect(beyondUser(/guaranteed/i, "It's not guaranteed.", "is it guaranteed?")).toEqual([]);
    expect(beyondUser(/guaranteed/i, "It's guaranteed.", "")).toEqual(["guaranteed"]);
  });
});

describe("script checks", () => {
  it("rejects Hangul outside the user's own words in every locale", () => {
    expect(scriptViolations("en", "Your 연애 card is bright.", "")).toHaveLength(1);
    expect(scriptViolations("en", "You wrote '민지', and the card agrees.", "민지랑")).toEqual([]);
  });

  it("asks for kana in Japanese and rejects kana and simplified characters in Traditional Chinese", () => {
    expect(scriptViolations("ja", "愚者正位置。", "")).toHaveLength(1);
    expect(scriptViolations("ja", "愚者が正位置で出ました。", "")).toEqual([]);
    expect(scriptViolations("zh-hant", "這張牌說明你們的关系会变。", "")).toHaveLength(1);
    expect(scriptViolations("zh-hant", "這張牌是正位。ありがとう", "")).toHaveLength(1);
    expect(scriptViolations("zh-hant", "這張牌是正位，畫面很明亮。", "")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/ai/locale/text.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/ai/locale/text.ts`**

```ts
import type { Locale } from "@/lib/i18n/locales";

/** Length, sentences and phrase matching for en, ja and zh-hant readings (spec §7.4). */
export type IntlLocale = Exclude<Locale, "ko">;

const isCjk = (locale: IntlLocale) => locale !== "en";

export function measure(locale: IntlLocale, text: string): number {
  if (isCjk(locale)) return text.replace(/\s/g, "").length;
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function sentencesOf(locale: IntlLocale, text: string): string[] {
  const parts = isCjk(locale) ? text.split(/(?<=[。！？!?])|\n+/) : text.split(/(?<=[.?!])\s+|\n+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "my", "your", "with", "for", "is", "are", "was", "were", "be", "it", "this", "that", "i", "me", "you", "he", "she", "they", "we", "do", "does", "did", "not", "so", "but", "if", "as", "by", "from"]);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** en: lower-case stems without stop words; ja and zh: bigrams of each run of letters (CJK, kana, Latin). */
export function tokens(locale: IntlLocale, text: string): string[] {
  if (!isCjk(locale)) {
    return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/'s$|'/g, "")).filter((w) => w && !STOP.has(w)).map(stem))];
  }
  const out = new Set<string>();
  for (const run of text.split(/[^\p{L}\p{N}]+/u)) {
    const chars = Array.from(run);
    if (chars.length === 1) out.add(chars[0]!);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i]! + chars[i + 1]!);
  }
  return [...out];
}

/** Share (0..1) of the phrase's tokens that appear among the text's tokens. */
export function overlap(locale: IntlLocale, text: string, phrase: string): number {
  const want = tokens(locale, phrase);
  if (want.length === 0) return 1;
  const have = new Set(tokens(locale, text));
  return want.filter((token) => have.has(token)).length / want.length;
}

/** The phrase verbatim (case-insensitive) or at least `share` of its tokens. */
export function mentionsIn(locale: IntlLocale, text: string, phrase: string, share = 0.5): boolean {
  if (text.toLowerCase().includes(phrase.toLowerCase())) return true;
  return overlap(locale, text, phrase) >= share;
}

/** Matches of `pattern` that the user did not write themselves (their own words may be quoted back). */
export function beyondUser(pattern: RegExp, text: string, userText: string): string[] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const user = userText.toLowerCase();
  return [...text.matchAll(global)].map((m) => m[0]).filter((hit) => !user.includes(hit.toLowerCase()));
}
```

- [ ] **Step 4: Write `apps/web/lib/ai/locale/script.ts`**

```ts
import type { IntlLocale } from "./text";

export const HANGUL = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/;
export const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;

/** Characters that exist only in Simplified Chinese (each has a different Traditional form). */
export const SIMPLIFIED_ONLY: ReadonlySet<string> = new Set(
  Array.from("这们时会说对发过还没问应关现实经动认运气东车长门见让给爱欢难题头体点钱业开机觉学习书写读话语识谁请谢边远进选择断恋梦宝剑权圣币骑个为来国么"),
);

const without = (text: string, userText: string) => (userText ? text.split(userText).join(" ") : text);

/** Hard: text that is not in the locale's script (spec §7.4). Messages go back to the model in English. */
export function scriptViolations(locale: IntlLocale, text: string, userText: string): string[] {
  const out: string[] = [];
  const own = without(text, userText);
  const userHangul = new Set(Array.from(userText).filter((ch) => HANGUL.test(ch)));
  if (Array.from(own).some((ch) => HANGUL.test(ch) && !userHangul.has(ch))) {
    out.push("[script] Korean letters appeared. Write every sentence in the output language; never copy Korean words from the reference data.");
  }
  if (locale === "ja" && own.trim() && !KANA.test(own)) out.push("[script] Write natural Japanese with kana, not kanji-only phrases.");
  if (locale === "zh-hant") {
    if (KANA.test(own)) out.push("[script] Japanese kana appeared. Write Traditional Chinese only.");
    const simplified = new Set(Array.from(own).filter((ch) => SIMPLIFIED_ONLY.has(ch)));
    if (simplified.size >= 2) out.push(`[script] Simplified characters appeared (${[...simplified].join("")}). Write Traditional Chinese (Taiwan).`);
  }
  return out;
}
```

- [ ] **Step 5: Run it**

Run: `npx vitest run apps/web/lib/ai/locale/text.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/ai/locale/text.ts apps/web/lib/ai/locale/script.ts apps/web/lib/ai/locale/text.test.ts
git commit -m "feat(ai): locale text utilities — words or characters, sentences, stems or bigrams, script checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/locale/text.ts apps/web/lib/ai/locale/script.ts apps/web/lib/ai/locale/text.test.ts
```

---

### Task 10: Safety lists, AI tells, locale profiles

**Files:**
- Create: `apps/web/lib/ai/locale/safety.ts`, `apps/web/lib/ai/locale/tells.ts`, `apps/web/lib/ai/locale/index.ts`
- Modify: `apps/web/lib/ai/style.ts`:
  - extend `MODEL_NAMES` with Japanese and Chinese spellings;
  - add `SOFT_PREFIX_INTL = "[style] "`;
  - `isSoftViolation` accepts both prefixes;
  - export `repeatedEndingsBy(sentences)`.
- Test: `apps/web/lib/ai/locale/safety.test.ts`; `apps/web/lib/ai/style.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: Task 9.
- Produces:
  - `safetyViolations(locale, text, userText): string[]` (hard, `[safety:<code>] …`);
  - `voiceViolations(locale, text): string[]` (soft, `[style] …`);
  - `TELLS: Record<IntlLocale, Tell[]>`, `aiTellViolationsIntl(locale, texts, out)` (one soft finding at ≥3 distinct tells);
  - `PROFILES: Record<IntlLocale, LocaleProfile>` with `languageName`, `lengthFactor` (initial values; Task 33 calibrates), `factOverlap`, `measure`, `sentences`, `mentions`, `script`, `safety`, `voice`;
  - `style.ts`: `SOFT_PREFIX_INTL`, the extended `MODEL_NAMES` (all locales use it).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/locale/safety.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MODEL_NAMES, isSoftViolation } from "../style";
import { PROFILES, aiTellViolationsIntl } from "./index";
import { safetyViolations, voiceViolations } from "./safety";

const hard = (locale: "en" | "ja" | "zh-hant", text: string, user = "") => safetyViolations(locale, text, user);

describe("safety per locale", () => {
  it.each([
    ["en", "This will definitely work out, 100% guaranteed."],
    ["en", "It is your destiny to meet them."],
    ["en", "He secretly loves you."],
    ["en", "You will get married this year."],
    ["en", "Buy crypto this week."],
    ["en", "Text them on Friday at 3 pm."],
    ["ja", "必ずうまくいきます。"],
    ["ja", "これは運命です。"],
    ["ja", "彼はあなたのことが好きです。"],
    ["ja", "来年結婚します。"],
    ["ja", "株を買ってください。"],
    ["ja", "10月3日に連絡しましょう。"],
    ["zh-hant", "一定會成功，百分之百。"],
    ["zh-hant", "你們是命中注定。"],
    ["zh-hant", "他其實喜歡你。"],
    ["zh-hant", "你們明年會結婚。"],
    ["zh-hant", "去買股票吧。"],
    ["zh-hant", "星期五下午三點聯絡他。"],
  ] as const)("%s flags: %s", (locale, text) => {
    expect(hard(locale, text).length, text).toBeGreaterThan(0);
  });

  it.each([
    ["en", "The Wheel of Fortune turns: when a reply comes fast, keep it light; when it is slow, give it room."],
    ["en", "Rather than investing, check this month's spending first."],
    ["en", "It's hard to know what they feel; watch how the next chat goes."],
    ["ja", "運命の輪が回っています。返事が早ければ軽く、遅ければ少し待ってみましょう。"],
    ["ja", "相手の気持ちはわかりませんが、次の会話の流れを見てみましょう。"],
    ["zh-hant", "命運之輪正在轉動。回覆來得快就輕鬆回應，慢一點就多給一些時間。"],
    ["zh-hant", "對方的心意無法確定，可以看看下次聊天的氣氛。"],
  ] as const)("%s allows: %s", (locale, text) => {
    expect(hard(locale, text), text).toEqual([]);
  });

  it("lets users' own words be quoted back", () => {
    expect(hard("en", "You asked whether it's guaranteed. Let's look at what is building instead.", "is it guaranteed?")).toEqual([]);
  });
});

describe("voice and tells", () => {
  it("flags plain-form Japanese endings as soft, outside quotes", () => {
    const soft = voiceViolations("ja", "崖の端に立っている。空を見上げる。");
    expect(soft).toHaveLength(1);
    expect(isSoftViolation(soft[0]!)).toBe(true);
    expect(voiceViolations("ja", "崖の端に立っています。「今行く」と送ってみましょう。")).toEqual([]);
  });

  it("adds one soft finding at three distinct tells", () => {
    const out: string[] = [];
    aiTellViolationsIntl("en", ["In conclusion, it's important to note this card. Delve into the tapestry of your journey — the card tells you so."], out);
    expect(out).toHaveLength(1);
    expect(isSoftViolation(out[0]!)).toBe(true);
    const calm: string[] = [];
    aiTellViolationsIntl("en", ["The man lifts his lamp and looks at the path under his feet. Check the one step in front of you today."], calm);
    expect(calm).toEqual([]);
  });

  it("blinds model and vendor names in every script", () => {
    for (const name of ["Claude", "クロード", "アンソロピック", "チャットGPT", "克勞德", "语言模型", "語言模型", "言語モデル"]) expect(MODEL_NAMES.test(name), name).toBe(true);
  });

  it("gives every profile a language name and starting length factors", () => {
    expect(PROFILES.ja.languageName).toBe("Japanese");
    expect(PROFILES["zh-hant"].languageName).toBe("Traditional Chinese (Taiwan)");
    expect(PROFILES.en.lengthFactor).toBeCloseTo(0.42);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/ai/locale/safety.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/ai/locale/safety.ts`**

```ts
import { SOFT_PREFIX_INTL } from "../style";
import { beyondUser, sentencesOf, type IntlLocale } from "./text";

/**
 * Hard safety checks for en, ja and zh-hant (spec §7.4), the same intents as the Korean BLOCKLIST,
 * money, other-mind, marriage and date rules in validate.ts. Card names that sound like fate or death
 * (Wheel of Fortune, 運命の輪, 命運之輪, Death, 死神) are allowed.
 */

type Rule = { code: string; pattern: RegExp; message: string };

const RULES: Record<IntlLocale, Rule[]> = {
  en: [
    { code: "guarantee", pattern: /\b(guarantee[sd]?|definitely will|for sure you will|certainly will|without (?:a )?doubt)\b|100\s?%/i, message: "Remove guarantees and certainty words." },
    { code: "fate", pattern: /\b(destin(?:y|ed)|fated|meant to be)\b|\bfate\b/i, message: "Do not talk about fate or destiny (the card name Wheel of Fortune is fine)." },
    { code: "illness", pattern: /\b(?:will|going to) (?:get|become|fall) (?:sick|ill)\b|\b(?:illness|disease|cancer)\b[^.?!]{0,30}\b(?:will|coming|ahead)\b/i, message: "Do not predict illness." },
    { code: "death", pattern: /\b(?:will|going to|'ll) (?:die|pass away)\b|\blife ?(?:span|expectancy)\b/i, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /\b(pregnan(?:t|cy)|give birth|childbirth)\b/i, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /\b(?:will|'ll|going to) (?:have|be in) an accident\b/i, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /\b(?:buy|pay|purchase|unlock) (?:it )?(?:now|today|right away)\b/i, message: "No pressure to pay." },
    { code: "date", pattern: /\b(?:on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i, message: "Do not name dates, weekdays or clock times; speak in conditions within the chosen period." },
  ],
  ja: [
    { code: "guarantee", pattern: /必ず|絶対(?:に)?|間違いなく|確実に|100\s?[%％]/, message: "Remove guarantees (必ず, 絶対, 間違いなく)." },
    { code: "fate", pattern: /運命(?!の輪)|宿命/, message: "Do not talk about fate (運命の輪 as a card name is fine)." },
    { code: "illness", pattern: /(?:病気|がん|癌)(?:に|が)?(?:なる|なります|かかる|かかります|見つかる)/, message: "Do not predict illness." },
    { code: "death", pattern: /死(?:ぬ|にます|んで)|寿命|亡くな(?:る|ります)/, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /妊娠|出産/, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /事故(?:に遭|が起き|に巻き込まれ)/, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /今すぐ(?:購入|課金|決済)/, message: "No pressure to pay." },
    { code: "date", pattern: /\d{1,2}月\d{1,2}日|[月火水木金土日]曜(?:日)?|\d{1,2}時(?:に|ごろ|頃|まで|から)/, message: "Do not name dates, weekdays or clock times." },
  ],
  "zh-hant": [
    { code: "guarantee", pattern: /一定(?:會|能)|絕對|保證|百分之百|肯定會|100\s?[%％]/, message: "Remove guarantees (一定會, 絕對, 保證)." },
    { code: "fate", pattern: /命中注定|宿命|命運(?!之輪)/, message: "Do not talk about fate (命運之輪 as a card name is fine)." },
    { code: "illness", pattern: /(?:生病|疾病|癌症?)[^。！？]{0,6}(?:會|將)|(?:會|將)(?:生病|得病)/, message: "Do not predict illness." },
    { code: "death", pattern: /(?:會|將)(?:死|過世|去世)|壽命|死期/, message: "Do not predict death or lifespan." },
    { code: "pregnancy", pattern: /懷孕|分娩|生小孩/, message: "Do not mention pregnancy or childbirth." },
    { code: "accident", pattern: /(?:會|將)(?:發生|遇到)(?:車禍|意外)/, message: "Do not predict accidents." },
    { code: "pay-pressure", pattern: /(?:現在|立刻|馬上)(?:購買|付款|儲值)/, message: "No pressure to pay." },
    { code: "date", pattern: /\d{1,2}月\d{1,2}日|(?:星期|週|禮拜)[一二三四五六日天]|\d{1,2}點(?:左右|前|後|時)?/, message: "Do not name dates, weekdays or clock times." },
  ],
};

const MONEY_ORDER: Record<IntlLocale, RegExp> = {
  en: /\b(?:invest in|buy (?:stocks?|shares|crypto|bitcoin|lottery tickets?)|take (?:out )?a loan|borrow money)\b/i,
  ja: /(?:株|仮想通貨|暗号資産|宝くじ|FX)[^。！？]{0,10}(?:買って|始めて|しましょう|するべき|してください)|借金(?:して|しましょう)|ローンを組(?:んで|みましょう)/,
  "zh-hant": /去(?:買|投資)(?:股票|樂透|彩券|加密貨幣)|(?:買進|買入|投資)(?:吧|看看|就對了)|(?:借錢|貸款)(?:吧|看看)/,
};
const MONEY_PROMISE: Record<IntlLocale, RegExp> = {
  en: /\byou(?:'ll| will) (?:make|earn|win) (?:money|a fortune|big)\b|\b(?:prices?|stocks?) will (?:rise|go up)\b|\bjackpot\b/i,
  ja: /(?:お金|利益|収入)が(?:入る|増える|手に入る)でしょう|儲か(?:る|ります)|大金/,
  "zh-hant": /(?:會|將)(?:賺(?:大)?錢|發財|進帳)|(?:股價|價格)(?:會|將)(?:上漲|漲)/,
};
const MONEY_CONTRAST: Record<IntlLocale, RegExp> = {
  en: /\b(?:rather than|instead of|before you|don't|do not)\b/i,
  ja: /より|代わりに|前に|ないで/,
  "zh-hant": /與其|而不是|之前|不要|先別/,
};
const OTHER_MIND: Record<IntlLocale, RegExp> = {
  en: /\b(?:he|she|they|your (?:partner|ex|crush|boyfriend|girlfriend))\b[^.?!]{0,25}\b(?:loves?|likes?|misses|hates|wants|regrets) you\b/i,
  ja: /(?:あの人|相手|彼|彼女)(?:は|が)[^。！？]{0,20}(?:好き|愛して|恋しい|嫌って|後悔して)(?:いる|います|です)/,
  "zh-hant": /(?:他|她|對方|那個人)[^。！？]{0,20}(?:喜歡|愛|想念|討厭|後悔)你/,
};
const HEDGE: Record<IntlLocale, RegExp> = {
  en: /\b(?:might|may|could|perhaps|maybe|hard to know|can't know|cannot know|if)\b/i,
  ja: /かもしれ|可能性|わかりません|わからない|もし|かどうか/,
  "zh-hant": /可能|也許|或許|無法確定|不確定|如果|是否/,
};
const MARRIAGE: Record<IntlLocale, RegExp> = {
  en: /\byou(?:'ll| will| won't| will not) (?:get married|marry)\b|\bmarriage (?:is|will be) (?:certain|guaranteed|delayed|soon)\b/i,
  ja: /結婚(?:する|します|できる|できます|しない|できない)(?:でしょう)?[。！]|(?:今年|来年|\d+年|\d+か月)[^。]{0,8}結婚(?:する|します)/,
  "zh-hant": /(?:會|將|能|不會|無法)(?:結婚|成婚)|(?:今年|明年|\d+年|\d+個月)[^。]{0,8}結婚/,
};

export function safetyViolations(locale: IntlLocale, text: string, userText: string): string[] {
  const out: string[] = [];
  for (const rule of RULES[locale]) {
    if (beyondUser(rule.pattern, text, userText).length) out.push(`[safety:${rule.code}] ${rule.message} Not even in a negative sentence.`);
  }
  const sentences = sentencesOf(locale, text);
  if (sentences.some((s) => (MONEY_ORDER[locale].test(s) || MONEY_PROMISE[locale].test(s)) && !MONEY_CONTRAST[locale].test(s))) {
    out.push("[safety:money] Do not tell the reader to invest, buy or borrow, and do not promise money. Stay with the flow and what to check.");
  }
  if (sentences.some((s) => OTHER_MIND[locale].test(s) && !HEDGE[locale].test(s))) {
    out.push("[safety:other-mind] Do not state another person's feelings as fact. Speak of mood and possibilities.");
  }
  if (beyondUser(MARRIAGE[locale], text, userText).length) {
    out.push("[safety:marriage] Do not state whether or when a marriage will happen. Speak of the flow, preparation and mindset around it.");
  }
  return out;
}

const QUOTES = /「[^」]*」|『[^』]*』|"[^"\n]*"|“[^”]*”/g;
const JA_PLAIN_END = /(?:だ|である|だった|のだ|だろう|する|した|しない|ない|いる|ある|れる|せる)$/;

/** Soft: Japanese sentences that end in the plain form (quotes excluded). Other locales have no voice check. */
export function voiceViolations(locale: IntlLocale, text: string): string[] {
  if (locale !== "ja") return [];
  const plain = sentencesOf("ja", text.replace(QUOTES, "「」"))
    .map((s) => s.replace(/[。！？!?…」』）)\s]+$/, ""))
    .filter((s) => s.length > 0 && JA_PLAIN_END.test(s));
  return plain.length ? [`${SOFT_PREFIX_INTL}Sentences end in the plain form ("${plain[0]!.slice(-12)}"). Use です・ます endings; noun endings now and then are fine.`] : [];
}
```

- [ ] **Step 4: Write `apps/web/lib/ai/locale/tells.ts`**

```ts
import { AI_TELL_THRESHOLD, SOFT_PREFIX_INTL, repeatedEndingsBy } from "../style";
import { sentencesOf, type IntlLocale } from "./text";

/** Per-language AI tells (spec §7.3): prompts list them, and three or more distinct ones cost one regeneration. */
export interface Tell {
  id: string;
  hint: string;
  test: (text: string) => boolean;
}

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;
const distinct = (text: string, pattern: RegExp) => new Set([...text.matchAll(pattern)].map((m) => m[0].toLowerCase())).size;
const FORMAT = /^\s*[-*•]\s|^\s*\d+[.)]\s|\*\*|—|\p{Extended_Pictographic}/mu;

export const TELLS: Record<IntlLocale, Tell[]> = {
  en: [
    { id: "E1", hint: "Do not open sentences with In conclusion, Ultimately, Overall, In summary", test: (t) => /(^|[.!?]\s+)(In conclusion|Ultimately|Overall|In summary|All in all),/m.test(t) },
    { id: "E2", hint: "Drop stock words (delve, tapestry, embark, journey, navigate, unlock, testament, realm, beacon, transformative)", test: (t) => distinct(t, /\b(delve|tapestry|embark|journey|navigate|unlock|unleash|testament|realm|beacon|transformative|profound)\b/gi) >= 2 },
    { id: "E3", hint: "Skip 'it's important to note' and 'plays a crucial role'", test: (t) => /\bit'?s (?:important|crucial|essential) to (?:note|remember)\b|\bplays? a (?:crucial|vital|pivotal) role\b/i.test(t) },
    { id: "E4", hint: "No bullets, bold, emoji or em dashes inside sentences", test: (t) => FORMAT.test(t) },
    { id: "E5", hint: "Avoid the 'not just X, but Y' formula", test: (t) => /\bnot (?:just|only) [^.?!]{1,40}, but\b/i.test(t) },
    { id: "E6", hint: "One hedge at most: no 'might possibly' or 'could potentially'", test: (t) => /\b(?:might|may|could) (?:possibly|perhaps|potentially)\b/i.test(t) },
    { id: "E7", hint: "Do not make the card or the universe the speaker; describe the picture", test: (t) => /\b(?:the card|this card|the cards|the universe) (?:tells|says|whispers|is telling|wants)\b/i.test(t) },
    { id: "E8", hint: "Do not stack lists of three again and again", test: (t) => count(t, /\b\w+, \w+,? and \w+\b/g) >= 3 },
    { id: "E9", hint: "Do not open with 'Remember,'", test: (t) => /(^|[.!?]\s+)Remember,/m.test(t) },
  ],
  ja: [
    { id: "J1", hint: "まとめると／結論として／総じて／要するに で文を始めない", test: (t) => /(^|[。！？]\s*)(まとめると|結論として|総じて|要するに)/m.test(t) },
    { id: "J2", hint: "「重要です」「大切です」を繰り返さない", test: (t) => count(t, /重要です|大切です|欠かせません|鍵となります/g) >= 2 },
    { id: "J3", hint: "「あなた」を使わず主語を省く", test: (t) => count(t, /あなた/g) >= 3 },
    { id: "J4", hint: "「〜でしょう。」を続けない", test: (t) => sentencesOf("ja", t).some((_, i, all) => all.slice(i, i + 3).length === 3 && all.slice(i, i + 3).every((s) => /でしょう[。！？]?$/.test(s))) },
    { id: "J5", hint: "箇条書き・太字・絵文字・「！！」を使わない", test: (t) => FORMAT.test(t) || /！！|!!/.test(t) },
    { id: "J6", hint: "カードを主語にしない（「このカードは〜と教えてくれます」）", test: (t) => /(?:この)?カード(?:は|が)[^。]{0,30}(?:教えて|語りかけ|伝えて|告げて)/.test(t) },
    { id: "J7", hint: "ポジティブ・エネルギー・ステージ・チャレンジを重ねない", test: (t) => distinct(t, /ポジティブ|エネルギー|ステージ|チャレンジ|マインド/g) >= 2 },
    { id: "J8", hint: "同じ文末を4回続けない", test: (t) => repeatedEndingsBy(sentencesOf("ja", t)) },
    { id: "J9", hint: "「寄り添う」を使わない", test: (t) => /寄り添/.test(t) },
  ],
  "zh-hant": [
    { id: "Z1", hint: "不要用總而言之、綜上所述、總的來說開頭", test: (t) => /(^|[。！？]\s*)(總而言之|綜上所述|總的來說|總之)/m.test(t) },
    { id: "Z2", hint: "少用至關重要、不可或缺、值得注意的是、旅程、賦能", test: (t) => distinct(t, /至關重要|不可或缺|值得注意的是|深入探討|旅程|賦能|全方位/g) >= 2 },
    { id: "Z3", hint: "不要反覆用「不僅…更…」", test: (t) => count(t, /不僅[^。]{1,30}更/g) >= 2 },
    { id: "Z4", hint: "不要說「讓我們」", test: (t) => /讓我們/.test(t) },
    { id: "Z5", hint: "不用項目符號、粗體、表情符號、破折號", test: (t) => FORMAT.test(t) },
    { id: "Z6", hint: "不要讓牌當主詞（「這張牌告訴你」），描述畫面", test: (t) => /(?:這張牌|牌面|卡牌)[^。]{0,20}(?:告訴你|在說|提醒你|想說)/.test(t) },
    { id: "Z7", hint: "用「你」，不用「您」；用台灣用語（影片、資訊、品質、預設）", test: (t) => count(t, /您/g) >= 2 || /視頻|信息|默認|質量/.test(t) },
    { id: "Z8", hint: "同樣的句尾不要連續四次", test: (t) => repeatedEndingsBy(sentencesOf("zh-hant", t)) },
  ],
};

export function aiTellViolationsIntl(locale: IntlLocale, texts: string[], out: string[]): void {
  const text = texts.join("\n");
  const hits = TELLS[locale].filter((tell) => tell.test(text));
  if (hits.length >= AI_TELL_THRESHOLD) out.push(`${SOFT_PREFIX_INTL}The text reads as machine-written: ${hits.map((h) => `${h.id} ${h.hint}`).join(" / ")}.`);
}
```

- [ ] **Step 5: Write `apps/web/lib/ai/locale/index.ts`**

```ts
import { scriptViolations } from "./script";
import { safetyViolations, voiceViolations } from "./safety";
import { measure, mentionsIn, sentencesOf, type IntlLocale } from "./text";

export type { IntlLocale } from "./text";
export { TELLS, aiTellViolationsIntl } from "./tells";

export interface LocaleProfile {
  locale: IntlLocale;
  /** how prompts name the output language */
  languageName: string;
  /** a Korean length target (characters without spaces) × this = the target in `measure` units; Task 33 calibrates */
  lengthFactor: number;
  /** minimum overlap (0..1) between a section and a cited KB fact's text in this language */
  factOverlap: number;
  measure: (text: string) => number;
  sentences: (text: string) => string[];
  mentions: (text: string, phrase: string, share?: number) => boolean;
  script: (text: string, userText: string) => string[];
  safety: (text: string, userText: string) => string[];
  voice: (text: string) => string[];
}

const profile = (locale: IntlLocale, languageName: string, lengthFactor: number, factOverlap: number): LocaleProfile => ({
  locale,
  languageName,
  lengthFactor,
  factOverlap,
  measure: (text) => measure(locale, text),
  sentences: (text) => sentencesOf(locale, text),
  mentions: (text, phrase, share) => mentionsIn(locale, text, phrase, share),
  script: (text, userText) => scriptViolations(locale, text, userText),
  safety: (text, userText) => safetyViolations(locale, text, userText),
  voice: (text) => voiceViolations(locale, text),
});

export const PROFILES: Readonly<Record<IntlLocale, LocaleProfile>> = {
  en: profile("en", "English", 0.42, 0.4),
  ja: profile("ja", "Japanese", 1.15, 0.35),
  "zh-hant": profile("zh-hant", "Traditional Chinese (Taiwan)", 0.7, 0.35),
};
```

- [ ] **Step 6: Edit `apps/web/lib/ai/style.ts`** (the only Phase 0 edit to an existing AI file)

Replace the `MODEL_NAMES` line with:

```ts
/** Model, vendor and technology names in Korean, English, Japanese and Chinese that no generated text may contain: a hard violation. */
export const MODEL_NAMES =
  /클로드|claude|앤트로픽|anthropic|오푸스|opus|소네트|sonnet|하이쿠|haiku|챗\s?gpt|chat\s?gpt|gpt|오픈\s?ai|open\s?ai|gemini|제미나이|llm|언어\s?모델|クロード|アンソロピック|チャット\s?gpt|ジェミニ|言語モデル|克勞德|克劳德|語言模型|语言模型|大型語言模型/i;
```

Add after `SOFT_PREFIX`:

```ts
/** The soft marker for en, ja and zh-hant feedback (P6). */
export const SOFT_PREFIX_INTL = "[style] ";
```

Change `isSoftViolation`:

```ts
export const isSoftViolation = (violation: string) => violation.startsWith(SOFT_PREFIX) || violation.startsWith(SOFT_PREFIX_INTL);
```

Export the run detector for sentence lists (Korean keeps calling `repeatedEndings(text)` as before):

```ts
/** Four or more sentences in a row with the same last two characters. */
export function repeatedEndingsBy(sentences: readonly string[]): boolean {
  let run = 1;
  let previous = "";
  for (const sentence of sentences) {
    const ending = sentence.replace(/[.?!…"'’”)\s。！？」』）]+$/, "").slice(-2);
    run = ending && ending === previous ? run + 1 : 1;
    if (run >= 4) return true;
    previous = ending;
  }
  return false;
}
```

Leave `repeatedEndings` and `TELLS` exactly as they are: Korean behaviour must not change.

- [ ] **Step 7: Run the new and the existing style tests**

Run: `npx vitest run apps/web/lib/ai/locale apps/web/lib/ai/style.test.ts apps/web/lib/ai/validate.test.ts`
Expected: all PASS. The existing Korean tests pass unchanged. If a safety case misfires, fix the pattern, not the case, and add the sentence as a new allowed or flagged case.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/ai/locale apps/web/lib/ai/style.ts
git commit -m "feat(ai): en, ja and zh-hant safety rules, AI tells and validation profiles; model blinding in every script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/locale apps/web/lib/ai/style.ts
```

---

### Task 11: Crisis patterns and hotlines

**Files:**
- Create: `apps/web/lib/i18n/crisis.ts`
- Test: `apps/web/lib/i18n/crisis.test.ts`

**Interfaces:**
- Consumes: `CRISIS_CONTACTS`, `CRISIS_LEAD` (`lib/crisis.ts`, unchanged); `type Locale`.
- Produces:
  - `CRISIS_PATTERNS: Record<Locale, RegExp>` (ko equal to `lib/api/http.ts` `CRISIS`);
  - `isCrisisAnyLanguage(text): boolean`;
  - `type Hotline`;
  - `HOTLINES: Record<Locale, readonly Hotline[]>`;
  - `crisisLead(locale)`, `hotlineLines(locale): string[]`.
  - Task 25 swaps `http.ts` to the union; Task 29 renders `CrisisContacts` per locale.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/crisis.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CRISIS_CONTACTS } from "@/lib/crisis";
import { HOTLINES, crisisLead, hotlineLines, isCrisisAnyLanguage } from "./crisis";
import { LOCALES } from "./locales";

describe("crisis", () => {
  it.each(["죽고 싶어", "I want to die", "thinking about suicide", "死にたい", "消えたい", "想死", "不想活了", "我想自殺"])("detects %s in any locale", (text) => {
    expect(isCrisisAnyLanguage(text)).toBe(true);
  });

  it.each(["죽음 카드가 나왔어요", "The Death card came up", "死神のカード", "死神牌出現了", "I'm dying to know"])("lets %s through", (text) => {
    expect(isCrisisAnyLanguage(text)).toBe(false);
  });

  it("keeps the Korean lines exactly and adds Korea's 109 to every other locale", () => {
    expect(HOTLINES.ko.map((h) => h.number)).toEqual(CRISIS_CONTACTS.map((c) => c.number));
    for (const locale of LOCALES.filter((l) => l !== "ko")) expect(HOTLINES[locale].some((h) => h.number === "109"), locale).toBe(true);
  });

  it("cites an official source and a check date for every number outside the Korean list", () => {
    for (const locale of LOCALES.filter((l) => l !== "ko")) {
      for (const line of HOTLINES[locale]) {
        expect(line.source, `${locale} ${line.name}`).toMatch(/^https:\/\//);
        expect(line.checked, `${locale} ${line.name}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("writes the lead and the lines in each language", () => {
    expect(crisisLead("ja")).toContain("人と話して");
    expect(hotlineLines("en")[0]).toContain("988");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/i18n/crisis.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Verify the numbers, then write `apps/web/lib/i18n/crisis.ts`**

Before writing `checked`, open each `source` URL and confirm the number, its hours and its name. Write the date you checked as `checked`. If a page disagrees with the table below, use the page and tell the controller in your report. Known sources from the spec (§7.7):
- Japan: 厚生労働省 「まもろうよ こころ」 telephone page;
- Hong Kong: info.gov.hk press release for 18111 (2023-12-27);
- Taiwan: 衛生福利部 (1925);
- US: 988lifeline.org;
- UK and Ireland: samaritans.org;
- other countries: findahelpline.com.

```ts
import { CRISIS_CONTACTS, CRISIS_LEAD } from "@/lib/crisis";
import type { Locale } from "./locales";

/**
 * Crisis words in every language, checked on every user text whatever the UI language (spec §7.7),
 * and the helplines shown per UI language, each with Korea's 109 for readers in Korea. Numbers outside
 * the Korean list carry their official source and the date someone checked it; re-check before launch.
 */

export const CRISIS_PATTERNS: Readonly<Record<Locale, RegExp>> = {
  ko: /죽고\s?싶|자살|자해|극단적\s?(인\s?)?선택|살기\s?싫|사라지고\s?싶/,
  en: /\b(kill(?:ing)? myself|suicid(?:e|al)|end(?:ing)? my life|want(?:ed)? to die|wanna die|self[-\s]?harm|hurt(?:ing)? myself|don'?t want to (?:live|be alive)|no reason to live)\b/i,
  ja: /死にたい|自殺|自死|自傷|リスカ|消えたい|生きていたくない|生きるのがつらい|命を絶/,
  "zh-hant": /想死|自殺|自杀|自殘|自残|輕生|轻生|不想活|活不下去|結束(?:自己的)?生命|结束(?:自己的)?生命/,
};

export const isCrisisAnyLanguage = (text: string): boolean => Object.values(CRISIS_PATTERNS).some((pattern) => pattern.test(text));

export interface Hotline {
  name: string;
  /** as dialled and shown; empty for a web directory */
  number: string;
  note?: string;
  url?: string;
  source: string;
  /** YYYY-MM-DD the source was last checked */
  checked: string;
}

const KR_SOURCE = "https://www.mohw.go.kr/";

export const HOTLINES: Readonly<Record<Locale, readonly Hotline[]>> = {
  ko: CRISIS_CONTACTS.map((c) => ({ name: c.name, number: c.number, ...(c.note ? { note: c.note } : {}), source: KR_SOURCE, checked: "" })),
  ja: [
    { name: "よりそいホットライン", number: "0120-279-338", note: "24時間・無料", source: "https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/", checked: "" },
    { name: "いのちの電話", number: "0570-783-556", note: "10時〜22時", source: "https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/", checked: "" },
    { name: "こころの健康相談統一ダイヤル", number: "0570-064-556", source: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/kokoro_dial.html", checked: "" },
    { name: "韓国にいる場合：自殺予防相談電話", number: "109", note: "24時間", source: KR_SOURCE, checked: "" },
  ],
  "zh-hant": [
    { name: "安心專線（台灣）", number: "1925", note: "24小時", source: "https://www.mohw.gov.tw/", checked: "" },
    { name: "生命線（台灣）", number: "1995", source: "https://www.life1995.org.tw/", checked: "" },
    { name: "張老師（台灣）", number: "1980", source: "https://www.1980.org.tw/", checked: "" },
    { name: "情緒通（香港）", number: "18111", note: "24小時", source: "https://www.info.gov.hk/gia/general/202312/27/P2023122700235.htm", checked: "" },
    { name: "撒瑪利亞防止自殺會（香港）", number: "2389 2222", note: "24小時", source: "https://www.sbhk.org.hk/", checked: "" },
    { name: "在韓國時：自殺預防諮詢專線", number: "109", note: "24小時", source: KR_SOURCE, checked: "" },
  ],
  en: [
    { name: "988 Suicide & Crisis Lifeline (US)", number: "988", note: "call or text, 24/7", source: "https://988lifeline.org/", checked: "" },
    { name: "Samaritans (UK and Ireland)", number: "116 123", note: "24/7", source: "https://www.samaritans.org/", checked: "" },
    { name: "Find a helpline in your country", number: "", url: "https://findahelpline.com/", source: "https://findahelpline.com/", checked: "" },
    { name: "In Korea: suicide prevention line", number: "109", note: "24/7", source: KR_SOURCE, checked: "" },
  ],
};

const LEADS: Readonly<Record<Locale, string>> = {
  ko: CRISIS_LEAD,
  en: "If things feel very hard right now, please talk to a person before any reading.",
  ja: "とてもつらいときは、占いより先に、人と話してください。",
  "zh-hant": "如果現在真的很難受，請先找人聊聊，再來看解讀。",
};

export const crisisLead = (locale: Locale): string => LEADS[locale];

/**
 * "988 Suicide & Crisis Lifeline (US) 988 · call or text, 24/7": what the FAQ and structured data
 * repeat. Korean comes out exactly as lib/crisis.ts contactLine writes it.
 */
export const hotlineLines = (locale: Locale): string[] =>
  HOTLINES[locale].map((h) => `${h.name} ${h.number || h.url}${h.note ? ` · ${h.note}` : ""}`);
```

Replace every `checked: ""` with the date you checked the source, ko included (the Korean list is unchanged; its date only records the check).

> The test asks for `^https://` and a date on non-Korean lines. Korean lines also get a date, so the next reviewer knows when they were last confirmed.

- [ ] **Step 4: Run it**

Run: `npx vitest run apps/web/lib/i18n/crisis.test.ts`
Expected: PASS (13 cases). Also run `npx vitest run apps/web/lib/reading apps/web/app/api` to confirm nothing Korean moved: the Korean pattern is a copy, not a replacement, until Task 25.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/crisis.ts apps/web/lib/i18n/crisis.test.ts
git commit -m "feat(i18n): crisis words in four languages and checked helplines per locale, Korea 109 everywhere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n/crisis.ts apps/web/lib/i18n/crisis.test.ts
```

---

### Task 12: Births in Japan, Taiwan and Hong Kong (core engine)

**Files:**
- Create: `packages/core/src/saju/zones.ts`, `packages/core/src/saju/abroadPlaces.ts`
- Modify:
  - `packages/core/src/saju/policy.ts`: `SajuErrorCode` gains `"UNSUPPORTED_CALENDAR"`; add `SUPPORTED_TIME_ZONES` and `ZONE_LONGITUDE_RANGE`; keep `SUPPORTED_TIME_ZONE` and `KOREA_LONGITUDE_RANGE`;
  - `packages/core/src/saju/chart.ts`: `validatePlace`, the civil frame, `wallClockInstants`, `civilOffsetMinutesAt`;
  - `packages/core/src/index.ts`: export the two new modules.
- Test: `packages/core/tests/saju-abroad.test.ts`; `packages/core/tests/saju.test.ts` must stay green unchanged.

**Interfaces:**
- Produces:
  - `zoneOffsetMsAt(instantMs, timeZone): number`;
  - `zoneWallClockInstants(wallMs, timeZone): ResolvedCivilTime[]` (earliest first; none in a gap, two in an overlap);
  - `ABROAD_ZONES = ["Asia/Tokyo","Asia/Taipei","Asia/Hong_Kong"]`;
  - `type AbroadPlace = { id; country: "JP"|"TW"|"HK"; timeZone; longitude; names: Record<CoreLocale, string> }`;
  - `ABROAD_PLACES` (13 places).
  - `computeChart` accepts `place.timeZone` in `SUPPORTED_TIME_ZONES`. Lunar input with an abroad zone throws `SajuError("UNSUPPORTED_CALENDAR")`.
  - Korean births are computed exactly as before.

- [ ] **Step 1: Write the failing test** — `packages/core/tests/saju-abroad.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ABROAD_PLACES, SajuError, computeChart, zoneOffsetMsAt, zoneWallClockInstants, type SajuInput } from "../src/index";

const H = 3_600_000;
const wall = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe("zone offsets from the runtime's tzdata", () => {
  it.each([
    ["Asia/Tokyo", wall(1950, 7, 1, 3), 10],
    ["Asia/Tokyo", wall(1952, 7, 1, 3), 9],
    ["Asia/Taipei", wall(1974, 7, 1, 3), 9],
    ["Asia/Taipei", wall(1980, 7, 1, 3), 8],
    ["Asia/Hong_Kong", wall(1970, 7, 1, 3), 9],
    ["Asia/Hong_Kong", wall(1980, 1, 1, 3), 8],
  ])("%s at %i is UTC+%i", (zone, instant, hours) => {
    expect(zoneOffsetMsAt(instant, zone)).toBe(hours * H);
  });

  it("finds no instant in a spring-forward gap and two in a fall-back overlap", () => {
    expect(zoneWallClockInstants(wall(2021, 3, 14, 2, 30), "America/New_York")).toEqual([]);
    expect(zoneWallClockInstants(wall(2021, 11, 7, 1, 30), "America/New_York")).toHaveLength(2);
    expect(zoneWallClockInstants(wall(1950, 7, 1, 12), "Asia/Tokyo").map((r) => r.instantMs)).toEqual([wall(1950, 7, 1, 2)]);
  });
});

const tokyo = ABROAD_PLACES.find((p) => p.id === "jp-tokyo")!;
const input = (place: SajuInput["place"], hour: number, minute: number, extra: Partial<SajuInput> = {}): SajuInput => ({
  calendar: "solar", year: 1990, month: 6, day: 15, time: { hour, minute }, gender: "female", place, ...extra,
});

describe("charts for births abroad", () => {
  it("reads a Tokyo birth on Tokyo's clock and longitude", () => {
    const chart = computeChart(input({ name: tokyo.names.en, longitude: tokyo.longitude, timeZone: tokyo.timeZone }, 12, 0));
    expect(chart.instantUTC).toBe("1990-06-15T03:00:00.000Z");
    expect(chart.correctedLocalTime).toBe("12:18");
  });

  it("gives a Tokyo noon birth the pillars of a Seoul birth at the same local mean time", () => {
    const t = computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0));
    const s = computeChart(input({ name: "서울", longitude: 126.978 }, 12, 51));
    expect(t.correctedLocalTime).toBe(s.correctedLocalTime);
    expect(t.pillars).toEqual(s.pillars);
  });

  it("applies Japan's 1950 summer time", () => {
    const chart = computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0, { year: 1950, month: 7, day: 1 }));
    expect(chart.instantUTC).toBe("1950-07-01T02:00:00.000Z");
  });

  it("refuses lunar dates, other zones and longitudes outside the zone", () => {
    const code = (fn: () => unknown) => {
      try { fn(); } catch (e) { return (e as SajuError).code; }
      return null;
    };
    expect(code(() => computeChart(input({ name: "Tokyo", longitude: tokyo.longitude, timeZone: "Asia/Tokyo" }, 12, 0, { calendar: "lunar" })))).toBe("UNSUPPORTED_CALENDAR");
    expect(code(() => computeChart(input({ name: "NYC", longitude: -74, timeZone: "America/New_York" }, 12, 0)))).toBe("UNSUPPORTED_PLACE");
    expect(code(() => computeChart(input({ name: "x", longitude: 100, timeZone: "Asia/Tokyo" }, 12, 0)))).toBe("UNSUPPORTED_PLACE");
  });

  it("lists 13 places with names in all four languages", () => {
    expect(ABROAD_PLACES).toHaveLength(13);
    for (const place of ABROAD_PLACES) for (const name of Object.values(place.names)) expect(name.length, place.id).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run packages/core/tests/saju-abroad.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Write `packages/core/src/saju/zones.ts`**

```ts
import type { ResolvedCivilTime } from "./policy";

/**
 * Civil time for births outside Korea (P6 spec §8), from the runtime's IANA tzdata through Intl
 * (Node and Workers ship full ICU). Korea keeps its own checked table in policy.ts.
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** UTC offset (ms, LMT seconds included) in `timeZone` at `instantMs`. */
export function zoneOffsetMsAt(instantMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallMs - Math.floor(instantMs / 1000) * 1000;
}

/** Every instant a wall-clock reading (fields as UTC ms) denotes in `timeZone`, earliest first. */
export function zoneWallClockInstants(wallMs: number, timeZone: string): ResolvedCivilTime[] {
  const candidates = new Set<number>();
  for (const probe of [wallMs - DAY_MS, wallMs, wallMs + DAY_MS]) candidates.add(wallMs - zoneOffsetMsAt(probe, timeZone));
  return [...candidates]
    .filter((instantMs) => instantMs + zoneOffsetMsAt(instantMs, timeZone) === wallMs)
    .sort((a, b) => a - b)
    .map((instantMs) => {
      const offsetMinutes = zoneOffsetMsAt(instantMs, timeZone) / 60_000;
      return { instantMs, offsetMinutes, standardOffsetMinutes: standardOffsetMinutes(instantMs, timeZone) };
    });
}

/** The year's standard offset: the smaller of the January and July offsets (only the ERA_STANDARD clock uses it). */
function standardOffsetMinutes(instantMs: number, timeZone: string): number {
  const year = new Date(instantMs).getUTCFullYear();
  return Math.min(zoneOffsetMsAt(Date.UTC(year, 0, 15), timeZone), zoneOffsetMsAt(Date.UTC(year, 6, 15), timeZone)) / 60_000;
}
```

- [ ] **Step 4: Write `packages/core/src/saju/abroadPlaces.ts`**

```ts
import type { CoreLocale } from "../i18n";

export const ABROAD_ZONES = ["Asia/Tokyo", "Asia/Taipei", "Asia/Hong_Kong"] as const;

export interface AbroadPlace {
  id: string;
  country: "JP" | "TW" | "HK";
  timeZone: (typeof ABROAD_ZONES)[number];
  /** degrees east, city centre */
  longitude: number;
  names: Record<CoreLocale, string>;
}

const p = (id: string, country: AbroadPlace["country"], timeZone: AbroadPlace["timeZone"], longitude: number, ko: string, en: string, ja: string, zh: string): AbroadPlace =>
  ({ id, country, timeZone, longitude, names: { ko, en, ja, "zh-hant": zh } });

/** Birthplaces abroad in P6 Phase A (spec §8); solar dates only. */
export const ABROAD_PLACES: readonly AbroadPlace[] = Object.freeze([
  p("jp-tokyo", "JP", "Asia/Tokyo", 139.692, "도쿄", "Tokyo", "東京", "東京"),
  p("jp-osaka", "JP", "Asia/Tokyo", 135.502, "오사카", "Osaka", "大阪", "大阪"),
  p("jp-nagoya", "JP", "Asia/Tokyo", 136.907, "나고야", "Nagoya", "名古屋", "名古屋"),
  p("jp-sapporo", "JP", "Asia/Tokyo", 141.354, "삿포로", "Sapporo", "札幌", "札幌"),
  p("jp-sendai", "JP", "Asia/Tokyo", 140.872, "센다이", "Sendai", "仙台", "仙台"),
  p("jp-hiroshima", "JP", "Asia/Tokyo", 132.455, "히로시마", "Hiroshima", "広島", "廣島"),
  p("jp-fukuoka", "JP", "Asia/Tokyo", 130.402, "후쿠오카", "Fukuoka", "福岡", "福岡"),
  p("jp-naha", "JP", "Asia/Tokyo", 127.681, "나하", "Naha", "那覇", "那霸"),
  p("tw-taipei", "TW", "Asia/Taipei", 121.565, "타이베이", "Taipei", "台北", "臺北"),
  p("tw-taichung", "TW", "Asia/Taipei", 120.674, "타이중", "Taichung", "台中", "臺中"),
  p("tw-tainan", "TW", "Asia/Taipei", 120.227, "타이난", "Tainan", "台南", "臺南"),
  p("tw-kaohsiung", "TW", "Asia/Taipei", 120.302, "가오슝", "Kaohsiung", "高雄", "高雄"),
  p("hk-hong-kong", "HK", "Asia/Hong_Kong", 114.169, "홍콩", "Hong Kong", "香港", "香港"),
]);
```

- [ ] **Step 5: Edit `policy.ts` and `chart.ts`**

`policy.ts`: add `| "UNSUPPORTED_CALENDAR"` to `SajuErrorCode`, and below `KOREA_LONGITUDE_RANGE`:

```ts
/** Korea plus the P6 zones abroad (abroadPlaces.ts). Korea keeps its checked table; the others read tzdata. */
export const SUPPORTED_TIME_ZONES = ["Asia/Seoul", "Asia/Tokyo", "Asia/Taipei", "Asia/Hong_Kong"] as const;
export const ZONE_LONGITUDE_RANGE: Readonly<Record<(typeof SUPPORTED_TIME_ZONES)[number], { min: number; max: number }>> = {
  "Asia/Seoul": KOREA_LONGITUDE_RANGE,
  "Asia/Tokyo": { min: 122, max: 146 },
  "Asia/Taipei": { min: 118, max: 123 },
  "Asia/Hong_Kong": { min: 113.8, max: 114.5 },
};
```

`chart.ts` (import `zoneOffsetMsAt`, `zoneWallClockInstants` from `./zones` and the two constants from `./policy`):
- `validatePlace` returns `{ longitude, timeZone }`:

```ts
type SupportedZone = (typeof SUPPORTED_TIME_ZONES)[number];

function validatePlace(place: SajuInput["place"]): { longitude: number; timeZone: SupportedZone } {
  if (!place || !Number.isFinite(place.longitude)) throw invalidInput();
  const timeZone = place.timeZone ?? SUPPORTED_TIME_ZONE;
  const range = (ZONE_LONGITUDE_RANGE as Readonly<Record<string, { min: number; max: number }>>)[timeZone];
  if (!range || place.longitude < range.min || place.longitude > range.max) {
    // Korean inputs keep their sentence byte for byte; only other zones get the new one.
    const message = timeZone === SUPPORTED_TIME_ZONE ? "지금은 한국에서 태어난 경우만 계산할 수 있어요." : "지금은 한국, 일본, 대만, 홍콩에서 태어난 경우만 계산할 수 있어요.";
    throw new SajuError("UNSUPPORTED_PLACE", message);
  }
  return { longitude: place.longitude, timeZone: timeZone as SupportedZone };
}
```
- In `computeChart`:
  - `const { longitude, timeZone } = validatePlace(input.place);`
  - before `toSolarDate`: `if (timeZone !== "Asia/Seoul" && input.calendar === "lunar") throw new SajuError("UNSUPPORTED_CALENDAR", "해외 출생은 양력 생일로만 계산할 수 있어요.");`
  - `const pre1908 = timeZone === "Asia/Seoul" && compareDates(date, STANDARD_TIME_START) < 0;`
  - `const frame: CivilFrame = { longitude, timeZone, policy, pre1908 };`
- `interface CivilFrame { longitude: number; timeZone: string; policy: SajuPolicy; pre1908: boolean }`
- First line of `wallClockInstants`: `if (frame.timeZone !== "Asia/Seoul") return zoneWallClockInstants(wallMs, frame.timeZone);`
- First line of `civilOffsetMinutesAt`: `if (frame.timeZone !== "Asia/Seoul") return zoneOffsetMsAt(instantMs, frame.timeZone) / 60_000;`
- Abroad zones ignore `applyHistoricalDst` (tzdata is the history). Say so in the doc comment above `wallClockInstants`.
- Find any other place in `chart.ts` that assumes KST for the *input* clock (search `KST_OFFSET_MINUTES`). `runEngine` keeps using KST fields on purpose: it only hands the instant to the engine. Leave it alone.

`packages/core/src/index.ts`: add `export * from "./saju/zones";` and `export * from "./saju/abroadPlaces";`.

- [ ] **Step 6: Run the new and the existing saju tests**

Run: `npx vitest run packages/core/tests`
Expected: all PASS; `saju.test.ts` unchanged and green.
- If a tzdata case fails, print `process.versions.tz` and the computed offset.
- Keep the expectation if it matches tzdb's published rule for that zone and year; if this Node's data is older, record the version in your report.
- A zone that cannot be verified stays out of `ABROAD_PLACES` (spec §8).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/saju/zones.ts packages/core/src/saju/abroadPlaces.ts packages/core/src/saju/policy.ts packages/core/src/saju/chart.ts packages/core/src/index.ts packages/core/tests/saju-abroad.test.ts
git commit -m "feat(saju): births in Japan, Taiwan and Hong Kong on tzdata clocks and local longitude; solar dates only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/core/src/saju/zones.ts packages/core/src/saju/abroadPlaces.ts packages/core/src/saju/policy.ts packages/core/src/saju/chart.ts packages/core/src/index.ts packages/core/tests/saju-abroad.test.ts
```

---

### Task 13: KB i18n

**Files:**
- Create:
  - `content/kb/i18n/{en,ja,zh-hant}/{cardId}.json` (78 × 3)
  - `scripts/build-kb-i18n.mjs`, `apps/web/lib/kb/i18n.generated.json` (generated)
  - `apps/web/lib/kb/i18n.ts`, `scripts/i18n/units/kb.ts`
- Modify: root `package.json` (`kb:i18n` script), `scripts/i18n/units/index.ts` (register `kb`)
- Test: `apps/web/lib/kb/i18n.test.ts`

**Interfaces:**
- Consumes: `KB_CARDS`, `kbCard` (`lib/kb`); `cardNameIn`, `cardAliasesIn` (Task 8).
- Produces:
  - `type KbText = { name; aliases; keywords; facts: Record<factId, string>; glosses: Record<factId, string>; reversedGloss: Partial<Record<ReversedMode, string>>; misdescriptions: Array<{ wrong; regex }> }`;
  - `kbText(locale: IntlLocale, cardId): KbText`;
  - `KB_I18N_LOCALES`.
- Card file schema `starlog-tarot-kb-i18n/1`:
  - `{ schema, id, locale, sourceHash, name, aliases, keywords, facts, glosses, reversedGloss, misdescriptions }`;
  - `sourceHash` = `hashKo` of the Korean fields it translates (`names.ko`, `keywordsKo`, facts, glosses, reversed glosses, misdescriptions), serialized with `JSON.stringify` in that order.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/kb/i18n.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cardNameIn } from "@starlog/core";
import { KB_CARDS } from "./index";
import { KB_I18N_LOCALES, kbText } from "./i18n";

const HANGUL = /[\uac00-\ud7a3]/;

describe.each(KB_I18N_LOCALES)("KB text: %s", (locale) => {
  it("covers all 78 cards with every fact, gloss and reversed-mode gloss of the Korean KB", () => {
    for (const card of KB_CARDS) {
      const text = kbText(locale, card.id);
      expect(text.name, card.id).toBe(cardNameIn(card.id, locale));
      expect(Object.keys(text.facts).sort(), card.id).toEqual(card.imagery.facts.map((f) => f.id).sort());
      expect(Object.keys(text.glosses).sort(), card.id).toEqual(card.imagery.glosses.map((g) => g.factId).sort());
      expect(Object.keys(text.reversedGloss).sort(), card.id).toEqual(Object.keys(card.reversedModes.gloss).sort());
      expect(text.keywords.length, card.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no Hangul and only compiling misdescription regexes that its own facts never match", () => {
    for (const card of KB_CARDS) {
      const text = kbText(locale, card.id);
      expect(JSON.stringify(text), card.id).not.toMatch(HANGUL);
      const facts = Object.values(text.facts).join("\n");
      for (const m of text.misdescriptions) {
        const re = new RegExp(m.regex, "i");
        expect(re.test(facts), `${card.id}: ${m.regex}`).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/kb/i18n.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `scripts/build-kb-i18n.mjs`**

```js
// Builds apps/web/lib/kb/i18n.generated.json from content/kb/i18n/<locale>/<id>.json (P6 Task 13):
// the fields prompts and validators read, per locale and card. Fails on a missing card or locale.
// Stale translations (sourceHash ≠ the Korean now) are listed, not fatal: the review gate decides.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { hashKo } from "./i18n/ledger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "ja", "zh-hant"];

/** The Korean a card's translation is made from, in a fixed order. */
export function koSource(card) {
  return JSON.stringify([
    card.names.ko, card.keywordsKo,
    card.imagery.facts.map((f) => [f.id, f.ko]),
    card.imagery.glosses.map((g) => [g.factId, g.ko]),
    card.reversedModes.gloss,
    card.imagery.commonMisdescriptions.map((m) => m.wrong),
  ]);
}

/** The 78 card ids, in the KB index's order. */
export function cardIds() {
  const { ids } = JSON.parse(readFileSync(join(root, "content/kb/cards/_index.json"), "utf8"));
  if (!Array.isArray(ids) || ids.length !== 78) throw new Error("content/kb/cards/_index.json: expected 78 ids");
  return ids;
}

function build() {
  const ids = cardIds();
  const out = {};
  const stale = [];
  for (const locale of LOCALES) {
    out[locale] = {};
    const dir = join(root, "content/kb/i18n", locale);
    const files = new Set(readdirSync(dir));
    for (const id of ids) {
      if (!files.has(`${id}.json`)) throw new Error(`content/kb/i18n/${locale}/${id}.json is missing`);
      const t = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
      const card = JSON.parse(readFileSync(join(root, "content/kb/cards", `${id}.json`), "utf8"));
      if (t.sourceHash !== hashKo(koSource(card))) stale.push(`${locale}/${id} (now ${hashKo(koSource(card))})`);
      out[locale][id] = { name: t.name, aliases: t.aliases, keywords: t.keywords, facts: t.facts, glosses: t.glosses, reversedGloss: t.reversedGloss, misdescriptions: t.misdescriptions };
    }
  }
  const json = `${JSON.stringify(out)}\n`;
  writeFileSync(join(root, "apps/web/lib/kb/i18n.generated.json"), json);
  console.log(`kb i18n: ${(json.length / 1024).toFixed(0)} KiB raw, ${(gzipSync(json).length / 1024).toFixed(0)} KiB gzip; ${stale.length} stale`);
  if (stale.length) console.log(stale.join("\n"));
}

// Importing this file (scripts/i18n/units/kb.ts uses koSource) must not rebuild anything.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) build();
```

`pnpm kb:i18n` prints each stale card with its current hash (`now <hash>`), so a translator copies it into `sourceHash` after updating the file.

Field names as of 2026-10-02:
- `_index.json` lists the cards in `ids`;
- the source card files hold misdescriptions in `imagery.commonMisdescriptions` (`{ wrong, correct, regex }`; the runtime copy renames them `misdescriptions`);
- glosses in `imagery.glosses` (`{ factId, ko, school }`);
- reversed glosses in `reversedModes.gloss`.

Root `package.json`: `"kb:i18n": "node scripts/build-kb-i18n.mjs"`.

- [ ] **Step 4: Write `apps/web/lib/kb/i18n.ts`**

```ts
import "server-only";
import type { IntlLocale } from "@/lib/ai/locale";
import type { ReversedMode } from "./index";
import data from "./i18n.generated.json";

/** Per-locale KB text: names, keywords, image facts, glosses, reversed-mode glosses, misdescriptions (spec §6.4, D10). */
export interface KbText {
  name: string;
  aliases: string[];
  keywords: string[];
  facts: Record<string, string>;
  glosses: Record<string, string>;
  reversedGloss: Partial<Record<ReversedMode, string>>;
  misdescriptions: Array<{ wrong: string; regex: string }>;
}

export const KB_I18N_LOCALES = ["en", "ja", "zh-hant"] as const satisfies readonly IntlLocale[];
const DATA = data as unknown as Record<IntlLocale, Record<string, KbText>>;

export function kbText(locale: IntlLocale, cardId: string): KbText {
  const text = DATA[locale]?.[cardId];
  if (!text) throw new Error(`No ${locale} KB text for ${cardId}`);
  return text;
}
```

- [ ] **Step 5: Write the 234 card files** (three lanes, one per locale; each lane may split by suit).
  - For each card, read `content/kb/cards/<id>.json` and write `content/kb/i18n/<locale>/<id>.json`.
  - **name**: `cardNameIn(id, locale)` exactly. **aliases**: `cardAliasesIn(id, locale)` plus common names you know in that language.
  - **keywords**: 3–6 short keywords in the language.
  - **facts**: every fact id → one sentence describing exactly what the 1909 scan shows. Keep positions, directions and counts; viewer-relative left and right as in `imagery.sideConvention`. Add nothing.
  - **glosses**: every gloss → its meaning.
  - **reversedGloss**: every mode → its gloss.
  - **misdescriptions**: for each Korean misdescription, a case-insensitive regex in the language that matches the wrong claim and **never** the facts. Japanese and Chinese have no word spaces, so keep the regexes short and specific.
  - **sourceHash**: run `node -e` with the `koSource` and `hashKo` exports to compute it, or let `pnpm kb:i18n` print the stale list and copy the hash.
  - Then run `pnpm kb:i18n`, register the `kb` units (`scripts/i18n/units/kb.ts`: one unit per card and locale, id `kb:<id>`, Korean = `koSource(card)`, `present` = the file exists) and run `I18N_LOCALE=<l> pnpm i18n:ledger` for each locale.

- [ ] **Step 6: Run the tests, the typecheck and the size note**

Run: `npx vitest run apps/web/lib/kb && pnpm typecheck`
Expected: PASS (2 × 3 cases); typecheck exit 0. Report the `kb i18n: … KiB gzip` line from `pnpm kb:i18n`. Above 250 KiB, tell the controller (spec §4.4 budget).

- [ ] **Step 7: Commit** (one commit per locale lane; this is the `ja` one)

```bash
git add content/kb/i18n/ja scripts/build-kb-i18n.mjs apps/web/lib/kb/i18n.ts apps/web/lib/kb/i18n.generated.json apps/web/lib/kb/i18n.test.ts scripts/i18n/units package.json content/i18n/review/ja.json
git commit -m "feat(kb): Japanese card names, keywords, image facts, glosses and misdescriptions (draft)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- content/kb/i18n/ja scripts/build-kb-i18n.mjs apps/web/lib/kb/i18n.ts apps/web/lib/kb/i18n.generated.json apps/web/lib/kb/i18n.test.ts scripts/i18n/units package.json content/i18n/review/ja.json
```

The lanes share `i18n.generated.json`. The last lane to commit rebuilds it with `pnpm kb:i18n` after pulling the others' files, and the test only passes once all three locales are complete. Until then, run the test per locale with `-t "KB text: ja"`.

---

## Phase AI — after P5 Task 5 is at HEAD

Before Task 14 the controller checks the P5 Task 5 exports:
- `git log --oneline -- apps/web/lib/ai/prompts/tarot.ts` shows the "rule/format split" commit;
- `grep -n "export const TAROT_PREAMBLE\|export function cardBrief\|export function spreadFacts" apps/web/lib/ai/prompts/tarot.ts` lists all three;
- `grep -n "export function modelNameViolations" apps/web/lib/ai/validate.ts` matches.

### Task 14: `systemLocale` block, `i18n-draft` task, draft job

**Files:**
- Modify:
  - `apps/web/lib/ai/provider.ts`: `GenerationTask.systemLocale?: string`; `TaskName` gains `"i18n-draft"`;
  - `apps/web/lib/ai/config.ts`: `KIND_ENV`, `DEFAULT_EFFORT`, `BASE_MAX_TOKENS` for `"i18n-draft"`;
  - `apps/web/lib/ai/anthropic.ts`: `buildRequest` sends a second cached system block;
  - root `package.json`: `i18n:draft`.
- Create: `scripts/i18n/draftJson.ts`, `scripts/i18n/draft.test.ts`
- Test: `apps/web/lib/ai/intlPlumbing.test.ts` (+ `__snapshots__/`)

**Interfaces:**
- Produces:
  - `GenerationTask.systemLocale` (Tasks 15–19 set it);
  - `generationSetting("i18n-draft")` = `{ model: "claude-opus-5-5", effort: "medium", maxTokens: 24000 }`;
  - `draftJson({ locale, kind, source, instructions, messages? })`: drafts one JSON document shaped like `source` (string leaves translated) and validates it with parity, script, safety and length checks;
  - `pnpm i18n:draft` runs the job named by `I18N_JOB`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/intlPlumbing.test.ts`

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildRequest } from "./anthropic";
import { KIND_ENV, generationSetting } from "./config";
import { SAJU_SYSTEM } from "./prompts/saju";
import { TAROT_SYSTEM } from "./prompts/tarot";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("P6 plumbing", () => {
  it("keeps the Korean systems byte for byte", () => {
    expect(hash(TAROT_SYSTEM)).toMatchSnapshot();
    expect(hash(SAJU_SYSTEM)).toMatchSnapshot();
  });

  it("sends a locale block as a second cached system block, and nothing extra without one", () => {
    const base = { name: "tarot-reading" as const, system: "CORE", user: "U", schema: z.object({ a: z.string() }), effort: "medium" as const, maxTokens: 16000, mock: () => ({ a: "" }) };
    expect(buildRequest({ ...base, systemLocale: "JA" }, 16000).system).toEqual([
      { type: "text", text: "CORE", cache_control: { type: "ephemeral" } },
      { type: "text", text: "JA", cache_control: { type: "ephemeral" } },
    ]);
    expect(buildRequest(base, 16000).system).toHaveLength(1);
  });

  it("gives translation drafts their own setting", () => {
    expect(KIND_ENV["i18n-draft"]).toBe("I18N_DRAFT");
    expect(generationSetting("i18n-draft", {} as NodeJS.ProcessEnv)).toEqual({ model: "claude-opus-5-5", effort: "medium", maxTokens: 24000 });
  });
});
```

- [ ] **Step 2: Run it once** to write the Korean snapshot, then see the other two fail

Run: `npx vitest run apps/web/lib/ai/intlPlumbing.test.ts`
Expected: the hash case PASSES and writes 2 snapshots; the other two FAIL.

- [ ] **Step 3: Implement**

`provider.ts`: add `| "i18n-draft"` to `TaskName`, and to `GenerationTask`:

```ts
  /**
   * en, ja and zh-hant only (P6): the locale's style and glossary block, sent as a second cached system
   * block after `system` (the shared English core), so the core's cache serves all three locales.
   */
  systemLocale?: string;
```

`config.ts`: `KIND_ENV["i18n-draft"] = "I18N_DRAFT"`, `DEFAULT_EFFORT["i18n-draft"] = "medium"`, `BASE_MAX_TOKENS["i18n-draft"] = 24000`.

`anthropic.ts` in `buildRequest`, replace the `system` line with:

```ts
    system: [
      { type: "text" as const, text: task.system, cache_control: { type: "ephemeral" as const } },
      ...(task.systemLocale ? [{ type: "text" as const, text: task.systemLocale, cache_control: { type: "ephemeral" as const } }] : []),
    ],
```

- [ ] **Step 4: Write `scripts/i18n/draftJson.ts`**

```ts
import { readFileSync } from "node:fs";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { generationSetting } from "@/lib/ai/config";
import { PROFILES, type IntlLocale } from "@/lib/ai/locale";
import { generateValidated } from "@/lib/ai/provider";
import { MODEL_BLIND_RULE } from "@/lib/ai/style";
import { modelNameViolations } from "@/lib/ai/validate";
import { argumentNames, hasJosa, parseMessage } from "@/lib/i18n/format";

/** zod schema with the shape of `value`: every string leaf stays a string to translate. */
export function schemaOf(value: unknown): z.ZodType {
  if (typeof value === "string") return z.string();
  if (typeof value === "number") return z.number();
  if (typeof value === "boolean") return z.boolean();
  if (Array.isArray(value)) return z.array(schemaOf(value[0] ?? ""));
  return z.object(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, schemaOf(v)])));
}

function pairs(a: unknown, b: unknown, path = ""): Array<[string, string, string]> {
  if (typeof a === "string") return [[path, a, typeof b === "string" ? b : ""]];
  if (Array.isArray(a)) return a.flatMap((item, i) => pairs(item, Array.isArray(b) ? b[i] : undefined, `${path}[${i}]`));
  if (a && typeof a === "object") return Object.entries(a).flatMap(([k, v]) => pairs(v, (b as Record<string, unknown> | undefined)?.[k], path ? `${path}.${k}` : k));
  return [];
}

/** Hard problems with a draft: placeholders, josa, script, safety, model names, and length within ×0.5–×2 of the scaled Korean. */
export function draftProblems(locale: IntlLocale, source: unknown, draft: unknown, messages: boolean): string[] {
  const out: string[] = [];
  const profile = PROFILES[locale];
  for (const [path, ko, text] of pairs(source, draft)) {
    if (!text.trim()) {
      out.push(`${path}: empty`);
      continue;
    }
    if (messages) {
      try {
        const nodes = parseMessage(text);
        if (hasJosa(nodes)) out.push(`${path}: josa is Korean only`);
        if (argumentNames(nodes).join() !== argumentNames(parseMessage(ko)).join()) out.push(`${path}: keep the placeholders {…} exactly`);
      } catch (error) {
        out.push(`${path}: ${(error as Error).message}`);
      }
    }
    out.push(...profile.script(text, "").map((v) => `${path}: ${v}`));
    out.push(...profile.safety(text, ko).map((v) => `${path}: ${v}`));
    const koLength = ko.replace(/\s/g, "").length;
    if (koLength >= 40) {
      const ratio = profile.measure(text) / (koLength * profile.lengthFactor);
      if (ratio < 0.5 || ratio > 2) out.push(`${path}: length ${profile.measure(text)} is far from the source's (${koLength} Korean characters)`);
    }
  }
  modelNameViolations(draft, out);
  return out;
}

export async function draftJson<T>(args: { locale: IntlLocale; kind: string; source: T; instructions: string; messages?: boolean }): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (apps/web/.env.local or the shell)");
  const style = readFileSync(new URL(`../../content/i18n/style/${args.locale}.md`, import.meta.url), "utf8");
  const glossary = readFileSync(new URL("../../content/i18n/glossary.json", import.meta.url), "utf8");
  const system = [
    `You localize Starlog, a Korean tarot and saju web service, into ${PROFILES[args.locale].languageName}. Return the same JSON shape with every string translated; keys, ids, numbers and {placeholders} stay exactly as they are.`,
    "Write as a native writer would, not as a translation. Keep every meaning; add no claims; keep promises and certainty out exactly as the Korean does.",
    args.instructions,
    "# Style guide",
    style,
    "# Glossary (use these words)",
    glossary,
    MODEL_BLIND_RULE,
  ].join("\n\n");
  const { data } = await generateValidated(
    anthropicProvider(key),
    {
      name: "i18n-draft",
      system,
      user: `<source kind="${args.kind}">\n${JSON.stringify(args.source, null, 2)}\n</source>`,
      schema: schemaOf(args.source) as z.ZodType<T>,
      ...generationSetting("i18n-draft"),
      mock: () => args.source,
    },
    (draft) => draftProblems(args.locale, args.source, draft, args.messages ?? false),
  );
  return data;
}
```

- [ ] **Step 5: Write `scripts/i18n/draft.test.ts`.** This is the job runner: messages now; later tasks add their kinds to `JOBS`.

```ts
// `I18N_JOB=messages:ja:common pnpm i18n:draft` — model drafts (costs money). Writes the target file;
// then run `I18N_LOCALE=<l> pnpm i18n:ledger`. Jobs: messages:<locale>:<ns>; Tasks 30, 35 and 36 add
// info, legal, decision and guide. Never part of `pnpm test`.
import { writeFileSync } from "node:fs";
import { test } from "vitest";
import type { IntlLocale } from "@/lib/ai/locale";
import { isLocale } from "@/lib/i18n/locales";
import { MESSAGES, NAMESPACES, type Namespace } from "@/lib/i18n/messages";
import { draftJson } from "./draftJson";

type Job = (locale: IntlLocale, id: string | undefined) => Promise<void>;

const JOBS: Record<string, Job> = {
  async messages(locale, ns) {
    if (!ns || !NAMESPACES.includes(ns as Namespace)) throw new Error(`messages:<locale>:<namespace>, one of ${NAMESPACES.join(", ")}`);
    const draft = await draftJson({
      locale,
      kind: `messages/${ns}`,
      source: MESSAGES.ko[ns as Namespace],
      messages: true,
      instructions: "These are UI strings: buttons, labels, short notices. Keep them as short as the Korean; buttons stay buttons.",
    });
    const file = new URL(`../../apps/web/lib/i18n/messages/${locale}/${ns}.json`, import.meta.url);
    writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
    console.log(`wrote ${file.pathname}`);
  },
};

test("draft", async () => {
  const [kind, locale, id] = (process.env.I18N_JOB ?? "").split(":");
  const job = kind ? JOBS[kind] : undefined;
  if (!job || !isLocale(locale) || locale === "ko") throw new Error(`Set I18N_JOB to <kind>:<en|ja|zh-hant>[:<id>]; kinds: ${Object.keys(JOBS).join(", ")}`);
  await job(locale, id);
});
```

Root `package.json`: `"i18n:draft": "vitest run -c vitest.i18n.config.ts scripts/i18n/draft.test.ts"`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/lib/ai/intlPlumbing.test.ts apps/web/lib/ai/anthropic.test.ts apps/web/lib/ai/config.test.ts apps/web/lib/ai/premiumPlumbing.test.ts && pnpm typecheck`
Expected: all PASS; P5's snapshot unchanged. No API call is made: the draft job runs only from `pnpm i18n:draft`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/ai/provider.ts apps/web/lib/ai/config.ts apps/web/lib/ai/anthropic.ts apps/web/lib/ai/intlPlumbing.test.ts apps/web/lib/ai/__snapshots__ scripts/i18n/draftJson.ts scripts/i18n/draft.test.ts package.json
git commit -m "feat(ai): locale system block cached apart from the shared core; i18n-draft task and draft job" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/provider.ts apps/web/lib/ai/config.ts apps/web/lib/ai/anthropic.ts apps/web/lib/ai/intlPlumbing.test.ts apps/web/lib/ai/__snapshots__ scripts/i18n/draftJson.ts scripts/i18n/draft.test.ts package.json
```

---

### Task 15: Intl tarot prompts

**Files:**
- Create:
  - `apps/web/lib/ai/prompts/intl/style.ts` (locale blocks)
  - `apps/web/lib/ai/prompts/intl/core.ts` (`TAROT_CORE_INTL`)
  - `apps/web/lib/ai/prompts/intl/lengths.ts`
  - `apps/web/lib/ai/prompts/intl/tarot.ts`
  - `apps/web/lib/i18n/messages/{ko,en,ja,zh-hant}/reading.json` (code-owned headings; register `reading` in `messages/index.ts`)
- Test: `apps/web/lib/ai/prompts/intl/tarot.test.ts`

**Interfaces:**
- Consumes:
  - `TAROT_SYSTEM`, `cardBrief`, `spreadFacts`, `buildTarotContext`, `type TarotContext`, `type TarotCardContext`, `type FollowUpTurn` (`prompts/tarot.ts`, P5-exported);
  - `kbText` (Task 13); `positionLabel`, `cardNameIn`, `whenLabel` (Task 8); `PROFILES` (Task 10).
- Produces:
  - `STYLE`, `WHO_AM_I`, `localeBlock(locale, kind: "tarot" | "saju")`;
  - `TAROT_CORE_INTL`;
  - `TAROT_LENGTHS` (Korean character targets copied from `validate.ts` and the Korean task formats), `scaledRange(locale, [min, max])`;
  - `intlCardBlock`, `intlTarotTeaserPrompt(ctx, locale)`, `intlTarotReadingPrompt(ctx, locale)`, `intlDailyPrompt(ctx, locale)`, `intlTarotFollowUpPrompt(ctx, locale, reading, turns, question)`;
  - `tarotHeadingsIn(locale, ctx)`, `tarotLockedTocIn(locale, ctx)`, `cardLabelIn(locale, card)`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/prompts/intl/tarot.test.ts`

```ts
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { TAROT_SYSTEM, buildTarotContext } from "../tarot";
import { TAROT_CORE_INTL } from "./core";
import { TAROT_LENGTHS, scaledRange } from "./lengths";
import { localeBlock } from "./style";
import { intlTarotReadingPrompt, tarotHeadingsIn } from "./tarot";

const HANGUL = /[가-힣]/;
const bullets = (s: string) => s.split("\n").filter((l) => /^\s*-\s/.test(l)).length;
const headings = (s: string) => s.split("\n").filter((l) => /^#{1,3}\s/.test(l)).length;
const ctx = () =>
  buildTarotContext("self-flow", pickCards(createDeck("p6-intl", DEFAULT_REVERSAL_RATE), TEMPLATES["self-flow"], [3, 17, 40]), {
    topicId: "love", whoId: "me", whenId: "month", question: "", conditions: [],
  });

describe("intl tarot prompts", () => {
  it("renders every Korean rule in English, plus the five reference-data rules, with no Korean", () => {
    expect(headings(TAROT_CORE_INTL)).toBe(headings(TAROT_SYSTEM) + 1);
    expect(bullets(TAROT_CORE_INTL)).toBe(bullets(TAROT_SYSTEM) + 5);
    expect(TAROT_CORE_INTL).not.toMatch(HANGUL);
    expect(TAROT_CORE_INTL).toContain("factIds");
  });

  it.each(["en", "ja", "zh-hant"] as const)("%s block has no Korean and carries its scaled lengths", (locale) => {
    const block = localeBlock(locale, "tarot");
    expect(block).not.toMatch(HANGUL);
    const [min, max] = scaledRange(locale, TAROT_LENGTHS.reading.total);
    expect(block).toContain(`${min}–${max}`);
  });

  it.each(["en", "ja", "zh-hant"] as const)("%s reading prompt gives each card its id and fact ids; headings have no Korean", (locale) => {
    const c = ctx();
    const prompt = intlTarotReadingPrompt(c, locale);
    for (const card of c.cards) {
      expect(prompt).toContain(`"cardId": "${card.cardId}"`);
      expect(prompt).toContain(`"id": "${card.kb.imagery.facts[0]!.id}"`);
    }
    expect(Object.values(tarotHeadingsIn(locale, c)).join(" ")).not.toMatch(HANGUL);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/ai/prompts/intl/tarot.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `lengths.ts`.** Every number is copied from `apps/web/lib/ai/validate.ts` (read 2026-10-02, line numbers in comments). If P5 changed any of them, copy the current values: the Korean validator is the source.

```ts
import { PROFILES, type IntlLocale } from "@/lib/ai/locale";

/** Korean length targets (characters without spaces) of every tarot field, copied from validate.ts. */
export const TAROT_LENGTHS = {
  // validateTarotTeaser: keyword 6–18, first card 250–350
  teaser: { keyword: [6, 18], firstCard: [250, 350] },
  // validateTarotReading: verdict ≤60, card section 150–250, minimums for connection 100, timing 60,
  // alternatives 80, action 40, scenario 40–120, follow-up ≤30, total 1,200–1,800; observation 60–200
  reading: {
    verdict: [1, 60], cardSection: [150, 250], connection: [100, 400], timing: [60, 300], alternatives: [80, 300], action: [40, 200],
    scenarioItem: [40, 120], followUp: [1, 30], total: [1200, 1800], observation: [60, 200],
  },
  // validateDaily: summary 5–30, keyword 6–18, body 250–400, areas 15–50, tip 20–80
  daily: { summary: [5, 30], keyword: [6, 18], body: [250, 400], area: [15, 50], tip: [20, 80] },
  // validateTarotFollowUp: answer 150–450
  followUp: { answer: [150, 450] },
} as const satisfies Record<string, Record<string, readonly [number, number]>>;

/** A Korean [min, max] in the locale's unit (words for en, characters for ja and zh-hant), rounded. */
export function scaledRange(locale: IntlLocale, [min, max]: readonly [number, number]): [number, number] {
  const f = PROFILES[locale].lengthFactor;
  return [Math.max(1, Math.round(min * f)), Math.max(1, Math.round(max * f))];
}
```

  The Korean validator checks only minimums for connection, timing, alternatives and action. The maxima above are generous ceilings, so the length table gives the model a range; `validateTarotReadingIntl` checks those four against their minimum only, as the Korean one does.

- [ ] **Step 4: Write `core.ts`.** `TAROT_CORE_INTL` is a faithful English rendering of `TAROT_SYSTEM`:
  - the same `#` headings in the same order;
  - one `- ` bullet for every Korean `- ` bullet;
  - Korean examples replaced by neutral English ones;
  - length numbers replaced by "see the length table in the language block";
  - the `##` task names kept in English (`## teaser`, `## reading`, `## daily`, `## followup`, matching the Korean task headings one to one);
  - plus this section, placed just before the task formats:

```text
# Output language and reference data
- Write every sentence in the language the language block names. Never copy Korean words from the reference data.
- The <cards> data is Korean reference material for meaning. Picture facts come with their id and in the output language: describe the picture only with those facts.
- In every card section, list in "factIds" the ids of the picture facts that section describes, at least one with salience 1 or 2.
- Use the glossary's words for cards, positions and terms; the app writes the headings, so do not write them.
- The user's own words may be in any language: quote them as they wrote them.
```

  Keep `MODEL_BLIND_RULE`'s English rendering inside the core with the same bullet count. The Step 1 test compares heading and bullet counts with `TAROT_SYSTEM`, so a dropped rule fails it.

- [ ] **Step 5: Write `style.ts`.** `localeBlock(locale, kind)` returns, joined by blank lines:
  1. `STYLE[locale]`;
  2. `# Lengths` with one line per field of `TAROT_LENGTHS` (`SAJU_LENGTHS` for `kind === "saju"`, Task 17), written as ``- ${task} ${field}: ${min}–${max} ${unit}`` with `scaledRange` and `unit` = `words` for en or `文字` / `字` for ja / zh-hant;
  3. `WHO_AM_I[locale]`.

```ts
import type { IntlLocale } from "@/lib/ai/locale";

export const STYLE: Record<IntlLocale, string> = {
  en: `# Output language: English
Write everything in natural American English, the way a warm friend who reads tarot talks across the table: second person, contractions are fine, plain words.
- Mix short and long sentences. Do not end three sentences in a row the same way.
- Say what the picture shows and what it means for this person. Hedge once, only where you are truly unsure; never stack hedges.
- Split uncertainty into conditions instead of "balance" or "both sides": if the reply comes fast, …; if it is slow, ….
- Never open a sentence with In conclusion, Ultimately, Overall, In summary or Remember.
- Avoid delve, tapestry, embark, journey, navigate, unlock, unleash, testament, realm, beacon, transformative, profound, "it's important to note", "plays a crucial role", "not just X, but Y".
- Do not make the card or the universe the speaker. Describe the scene, then read it against the situation.
- No bullets, numbering, bold, emoji or em dashes inside strings. JSON arrays are the lists.
- No guarantees or fate talk: guaranteed, definitely will, 100%, destiny, fate, meant to be. Wheel of Fortune and Death are card names and fine.

Good and bad
- Bad: "In conclusion, the Hermit card suggests it's time to embark on an inner journey."
  Good: "An old man holds his lantern high and looks down at the path under his feet. Before chasing a far-off answer, check the ground you're standing on."
- Bad: "This week is a crucial time financially, and a careful approach may be needed."
  Good: "This week leans toward finding a new source of income. Signing a contract can wait until next week."`,
  ja: `# 出力言語：日本語
すべて自然な日本語で書きます。隣でカードを一緒に見ている占い師が話すような、やわらかい「です・ます」です。
- 「あなた」はほとんど使わず、主語は省きます。
- だ・である調で文を終えません（引用や送る文の例は除く）。体言止めはときどき使えます。
- 文の長さを混ぜ、同じ文末を3回以上続けません。「〜でしょう。」を続けません。
- 絵に描かれていることを先に書き、それをこの人の状況に重ねて読みます。「〜かもしれません」は本当に不確かな一か所だけ。
- どちらとも言えない話は条件に分けます（返事が早ければ〜、遅ければ〜）。
- まとめると・結論として・総じて・要するに で文を始めません。「重要です」「大切です」を繰り返しません。
- カードを主語にしません（「このカードは〜と教えてくれます」）。
- ポジティブ・エネルギー・ステージ・チャレンジなどのカタカナ語を重ねず、「寄り添う」も使いません。
- 文字列の中で箇条書き・番号・太字・絵文字・「！！」・ダッシュ（—）を使いません。
- 必ず・絶対・間違いなく・100％・運命・宿命を使いません。「運命の輪」「死神」はカード名なので使えます。

良い例と悪い例
- 悪い例：「結論として、隠者のカードはあなたが内なる声に耳を傾けるべき時であることを示唆しています。」
  良い例：「ランタンを高く掲げた老人が、足もとの道を見下ろしています。遠くの答えを探す前に、いま立っている場所を確かめる絵です。」
- 悪い例：「今週は金銭面で非常に重要な時期であり、慎重なアプローチが必要となるでしょう。」
  良い例：「今週は新しい収入源を探すほうに力が向いています。契約書へのサインは来週に回しても遅くありません。」`,
  "zh-hant": `# 輸出語言：繁體中文（台灣）
全部用自然的台灣繁體中文書寫，像一起看牌的朋友在旁邊說話：溫暖、具體，稱呼用「你」，不用「您」。
- 長短句交錯，同樣的句尾不要連續三次。
- 先描述畫面上畫了什麼，再對照這個人的處境解讀。「可能」只用在真的不確定的一處。
- 說不準的地方分成條件來講（回覆來得快就……，慢的話就……），不要用「平衡」「兩方面」帶過。
- 不用「總而言之、綜上所述、總的來說」開頭；少用「至關重要、不可或缺、值得注意的是、深入探討、旅程、賦能」；不要反覆用「不僅……更……」；不說「讓我們」。
- 不讓牌當主詞（「這張牌告訴你」），描述畫面就好。
- 用台灣用語：影片、資訊、品質、預設。不要出現簡體字。引號用「」。
- 字串裡不用項目符號、編號、粗體、表情符號、破折號（—）。
- 不用「一定會、絕對、保證、百分之百、命中注定、宿命」。「命運之輪」「死神」是牌名，可以用。

好例子與壞例子
- 壞例子：「總而言之，隱者牌暗示你該傾聽內在的聲音了。」
  好例子：「一位老人高舉提燈，低頭看著腳下的路。與其追尋遠方的答案，不如先確認自己現在站的地方。」
- 壞例子：「這週在財務方面是至關重要的時期，需要謹慎的態度。」
  好例子：「這週的力氣比較往尋找新收入的方向走。簽約的事延到下週也不遲。」`,
};

export const WHO_AM_I: Record<IntlLocale, string> = {
  en: `# If asked what you are\nAnswer in one warm sentence, such as "I'm Starlog's reading guide, and I don't share what technology I'm built with.", then go straight back to their reading.`,
  ja: `# 何者かと聞かれたら\n「わたしはStarlogの鑑定ガイドです。どんな技術で作られているかはお伝えしていません。」のように、あたたかい一文だけで答えて、すぐにその人の鑑定の話に戻ります。`,
  "zh-hant": `# 被問到你是誰時\n用一句溫暖的話回答，例如「我是Starlog的解讀小幫手，不會透露是用什麼技術做的。」然後馬上回到對方的解讀。`,
};
```

  The bad examples contain words the validators flag. That is intended: they are labelled bad, and validators only read model output.

- [ ] **Step 6: Write `reading.json` and `tarot.ts`.**
  - `reading.json` (ko) holds every code-owned heading of `tarotHeadings()` and `tarotLockedToc()` in `prompts/tarot.ts`, copied exactly, plus the saju prologue section titles (`SAJU_PROLOGUE_SECTIONS` in `lib/sajuPrologue.ts`) and `SAJU_OBSERVATION_HEADING` under `saju.*` for Task 17:

```json
{
  "whenPrefix": "{when}, ",
  "whenCustom": "정한 때까지, ",
  "tarot": {
    "verdict": "한 줄 결론",
    "connection3": "세 장을 이어 읽으면",
    "connectionMany": "여러 장을 이어 읽으면",
    "connectionOne": "카드를 이어 읽으면",
    "timing": "{when}언제 움직이면 좋을지",
    "observation": "며칠 안에 확인해 볼 신호",
    "scenarios": "상황에 따라 달라지는 길",
    "scenariosRelational": "상대 반응에 따라 달라지는 길",
    "messages": "그대로 해 볼 실행 예시 2가지",
    "messagesRelational": "보내기 좋은 첫 문장 2가지",
    "avoid": "피하면 좋은 것",
    "alternatives": "다르게 볼 수 있는 부분",
    "action": "오늘 해볼 작은 행동"
  },
  "saju": {}
}
```

  Fill `saju` with one key per prologue section, `s1`…`s5`, in `SAJU_PROLOGUE_SECTIONS` order, plus `observation`. The en, ja and zh-hant files carry the same keys. Their `whenPrefix` places the time naturally (en `"{when}: "`, ja `"{when}、"`, zh-hant `"{when}，"`), and their `timing` puts `{when}` where the language wants it (en `"{when}When to move"`).

  `tarot.ts`:

```ts
import "server-only";
import { cardNameIn, positionLabel, whenLabel } from "@starlog/core";
import { PROFILES, type IntlLocale } from "@/lib/ai/locale";
import { translator } from "@/lib/i18n/translate";
import { kbText } from "@/lib/kb/i18n";
import { cardBrief, spreadFacts, type FollowUpTurn, type TarotCardContext, type TarotContext } from "../tarot";

/** One card for the intl prompts: the Korean brief, plus the local name, position label and picture facts with ids. */
export function intlCardBlock(card: TarotCardContext, ctx: TarotContext, locale: IntlLocale): Record<string, unknown> {
  const text = kbText(locale, card.cardId);
  return {
    cardId: card.cardId,
    name: cardNameIn(card.cardId, locale),
    position: positionLabel(locale, card.position),
    orientation: card.orientation,
    pictureFacts: card.kb.imagery.facts.map((fact) => ({ id: fact.id, salience: fact.salience, text: text.facts[fact.id] })),
    reversedGloss: card.reversedMode ? (text.reversedGloss[card.reversedMode] ?? null) : null,
    koreanReference: cardBrief(card, ctx),
  };
}

export function tarotHeadingsIn(locale: IntlLocale, ctx: TarotContext) {
  const t = translator(locale, "reading");
  const when = ctx.when ? t("whenPrefix", { when: whenLabel(locale, ctx.when) }) : ctx.custom.when ? t("whenCustom") : "";
  const connection = ctx.cards.length === 3 ? t("tarot.connection3") : ctx.cards.length > 1 ? t("tarot.connectionMany") : t("tarot.connectionOne");
  return {
    verdict: t("tarot.verdict"),
    connection,
    timing: t("tarot.timing", { when }),
    observation: t("tarot.observation"),
    scenarios: ctx.relational ? t("tarot.scenariosRelational") : t("tarot.scenarios"),
    messages: ctx.relational ? t("tarot.messagesRelational") : t("tarot.messages"),
    avoid: t("tarot.avoid"),
    alternatives: t("tarot.alternatives"),
    action: t("tarot.action"),
  };
}

export const cardLabelIn = (locale: IntlLocale, card: TarotCardContext) => `${positionLabel(locale, card.position)} · ${cardNameIn(card.cardId, locale)}`;

export function tarotLockedTocIn(locale: IntlLocale, ctx: TarotContext): string[] {
  const h = tarotHeadingsIn(locale, ctx);
  return [h.verdict, ...ctx.cards.map((card) => cardLabelIn(locale, card)), h.connection, h.timing, h.observation, h.scenarios, h.messages, h.avoid, h.alternatives, h.action];
}

const userBlock = (ctx: TarotContext) => `<user>\n${JSON.stringify({ question: ctx.question, conditions: ctx.conditions, note: ctx.note, custom: ctx.custom }, null, 2)}\n</user>`;

const cardsBlockIntl = (ctx: TarotContext, locale: IntlLocale) =>
  `<cards>\n${JSON.stringify(ctx.cards.map((card) => intlCardBlock(card, ctx, locale)), null, 2)}\n</cards>\n<spread>\n${spreadFacts(ctx)}\n</spread>`;

const task = (name: string, locale: IntlLocale) => `<task>${name}: follow the "${name}" format of the system prompt. Write in ${PROFILES[locale].languageName}; use the length table of the language block.</task>`;

export const intlTarotTeaserPrompt = (ctx: TarotContext, locale: IntlLocale) => [userBlock(ctx), cardsBlockIntl(ctx, locale), task("teaser", locale)].join("\n\n");
export const intlTarotReadingPrompt = (ctx: TarotContext, locale: IntlLocale) => [userBlock(ctx), cardsBlockIntl(ctx, locale), task("reading", locale)].join("\n\n");
export const intlDailyPrompt = (ctx: TarotContext, locale: IntlLocale) => [cardsBlockIntl(ctx, locale), task("daily", locale)].join("\n\n");

export function intlTarotFollowUpPrompt(ctx: TarotContext, locale: IntlLocale, reading: unknown, turns: FollowUpTurn[], question: string): string {
  return [userBlock(ctx), cardsBlockIntl(ctx, locale), `<reading>\n${JSON.stringify(reading)}\n</reading>`, `<turns>\n${JSON.stringify(turns)}\n</turns>`, `<question>${question}</question>`, task("followup", locale)].join("\n\n");
}
```

  Register `reading` in `messages/index.ts` as described in Task 4.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run apps/web/lib/ai/prompts/intl apps/web/lib/i18n/parity.test.ts && pnpm typecheck`
Expected: PASS (1 + 3 + 3 cases; parity now covers `reading`); typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/ai/prompts/intl apps/web/lib/i18n/messages
git commit -m "feat(ai): English core tarot prompt, en/ja/zh-hant style blocks with scaled lengths, local card blocks and headings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/prompts/intl apps/web/lib/i18n/messages
```

---

### Task 16: Intl tarot schemas and validators

**Files:**
- Create: `apps/web/lib/ai/intlSchemas.ts`, `apps/web/lib/ai/validateIntl.ts`
- Test: `apps/web/lib/ai/validateIntl.test.ts`

**Interfaces:**
- Consumes: Tasks 8–10, 13, 15; `modelNameViolations` (`validate.ts`); `KB_CARDS`.
- Produces:
  - `TarotTeaserIntlDraftSchema`, `TarotReadingIntlDraftSchema`, `DailyIntlDraftSchema` (Korean shapes plus `factIds`);
  - `stripFactIds(draft)`;
  - `commonIntl(locale, texts, userText, draft, out)`, `factViolationsIntl`, `foreignCardsIntl`;
  - `validateTarotTeaserIntl(draft, ctx, locale)`, `validateTarotReadingIntl(draft, ctx, locale)`, `validateDailyIntl(draft, ctx, locale)`, `validateTarotFollowUpIntl(answer, ctx, locale, question)`: English violations, soft ones prefixed `[style] `.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/validateIntl.test.ts`

```ts
import { TEMPLATES, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { kbText } from "@/lib/kb/i18n";
import { buildTarotContext } from "./prompts/tarot";
import { isSoftViolation } from "./style";
import { validateDailyIntl, validateTarotTeaserIntl } from "./validateIntl";

const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));
const daily = () => buildTarotContext("daily", pickCards(createDeck("p6-daily", 0), TEMPLATES.daily, [5]), null);

describe("intl validators", () => {
  it("passes a Japanese daily draft that cites the card's facts in Japanese", () => {
    const ctx = daily();
    const card = ctx.cards[0]!;
    const facts = card.kb.imagery.facts.filter((f) => f.salience <= 2).slice(0, 2);
    const text = kbText("ja", card.cardId);
    // body: the two facts plus neutral sentences, so it lands inside the scaled 250–400 band (≈290–460 characters)
    const filler = "今日は手もとの小さな用事から順に片づけると、気持ちが軽くなります。".repeat(8);
    const draft = {
      keyword: "足もとを整える一日",
      summary: "足もとから整える一日です。",
      body: `${facts.map((f) => text.facts[f.id]).join("。")}。${filler}`,
      areas: { love: "返事は急がず、相手の調子に合わせて送ってみましょう。", money: "財布の中のレシートを一度整理してみましょう。", work: "午前のうちに一番小さな作業を終わらせましょう。" },
      color: "青",
      tip: "寝る前に明日の予定を一行だけ見直してみましょう。",
      factIds: facts.map((f) => f.id),
    };
    expect(hard(validateDailyIntl(draft, ctx, "ja"))).toEqual([]);
  });

  it("rejects Hangul and a fact id the card does not have", () => {
    const ctx = daily();
    const draft = {
      keyword: "출발", summary: "A light day.", body: "Today is a good day to tidy the small things on your desk and keep the evening free.",
      areas: { love: "Keep replies easy.", money: "Check one receipt.", work: "Finish the smallest task first." },
      color: "blue", tip: "Look over tomorrow's plan once before bed.", factIds: ["not-a-fact-id"],
    };
    const violations = hard(validateDailyIntl(draft, ctx, "en"));
    expect(violations.some((v) => v.startsWith("[script]"))).toBe(true);
    expect(violations.some((v) => v.startsWith("[fact]"))).toBe(true);
  });

  it("asks a reversed card to be read reversed in the reader's language", () => {
    const ctx = buildTarotContext("self-flow", pickCards(createDeck("p6-rev", 1), TEMPLATES["self-flow"], [0, 1, 2]), null);
    const first = ctx.cards[0]!;
    const facts = first.kb.imagery.facts.filter((f) => f.salience === 1);
    const text = kbText("zh-hant", first.cardId);
    const draft = {
      cards: ctx.cards.map((c) => ({ position: c.position, cardId: c.cardId, keyword: "整理步伐" })),
      firstCard: { heading: "", body: `${facts.map((f) => text.facts[f.id]).join("，")}。這週先把手上最小的一件事做完。`, factIds: facts.map((f) => f.id) },
    };
    expect(first.orientation).toBe("reversed");
    expect(hard(validateTarotTeaserIntl(draft, ctx, "zh-hant")).some((v) => v.startsWith("[reversed]"))).toBe(true);
  });
});
```

  `createDeck(seed, reversalRate)` (`packages/core/src/tarot/draw.ts`): rate `0` deals every card upright and `1` every card reversed, which keeps the two cases deterministic. `buildTarotContext(templateId, drawn, input: TarotInput | null)` accepts `null` as the daily route passes it.

- [ ] **Step 2: Run it**

Run: `npx vitest run apps/web/lib/ai/validateIntl.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/ai/intlSchemas.ts`**

```ts
import { z } from "zod";
import { DailyDraftSchema, TarotReadingSchema, TarotTeaserDraftSchema } from "./schemas";

/** Ids of the KB picture facts a section describes (language-independent fidelity, spec §7.5). Never stored. */
const FactIds = z.array(z.string()).max(8);

export const TarotTeaserIntlDraftSchema = TarotTeaserDraftSchema.extend({
  firstCard: z.object({ heading: z.string(), body: z.string(), factIds: FactIds }),
});
export const TarotReadingIntlDraftSchema = TarotReadingSchema.extend({
  cards: z.array(z.object({ position: z.string(), cardId: z.string(), heading: z.string(), body: z.string(), factIds: FactIds })),
});
export const DailyIntlDraftSchema = DailyDraftSchema.extend({ factIds: FactIds });

export type TarotTeaserIntlDraft = z.infer<typeof TarotTeaserIntlDraftSchema>;
export type TarotReadingIntlDraft = z.infer<typeof TarotReadingIntlDraftSchema>;
export type DailyIntlDraft = z.infer<typeof DailyIntlDraftSchema>;

/** The stored shapes are the Korean ones: fact ids go before anything is saved or shown. */
export function stripFactIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "factIds" ? undefined : v))) as T;
}
```

- [ ] **Step 4: Write `apps/web/lib/ai/validateIntl.ts`**

```ts
import "server-only";
import { cardAliasesIn, cardNameIn, unsureWords } from "@starlog/core";
import { KB_CARDS } from "@/lib/kb";
import { kbText } from "@/lib/kb/i18n";
import type { DailyIntlDraft, TarotReadingIntlDraft, TarotTeaserIntlDraft } from "./intlSchemas";
import { PROFILES, aiTellViolationsIntl, type IntlLocale } from "./locale";
import { TAROT_LENGTHS, scaledRange } from "./prompts/intl/lengths";
import type { TarotCardContext, TarotContext } from "./prompts/tarot";
import type { FollowUpAnswer } from "./schemas";
import { modelNameViolations } from "./validate";

/** Same band as the Korean validators (±25%). */
const TOLERANCE = 0.25;

function lengthIntl(locale: IntlLocale, label: string, text: string, range: readonly [number, number], out: string[]): void {
  const [min, max] = scaledRange(locale, range);
  const n = PROFILES[locale].measure(text);
  if (n < Math.floor(min * (1 - TOLERANCE)) || n > Math.ceil(max * (1 + TOLERANCE))) {
    out.push(`[length] ${label} is ${n} ${locale === "en" ? "words" : "characters"}; write ${min}–${max}.`);
  }
}

const userTextOf = (ctx: TarotContext) => [ctx.question, ...ctx.conditions.map((c) => c.value), ctx.note, ctx.custom.topic, ctx.custom.who, ctx.custom.when].filter(Boolean).join(" ");

/** Script, safety, voice, AI tells and model names over every text of a draft. */
export function commonIntl(locale: IntlLocale, texts: string[], userText: string, draft: unknown, out: string[]): void {
  const profile = PROFILES[locale];
  const all = texts.join("\n");
  out.push(...profile.script(all, userText), ...profile.safety(all, userText), ...profile.voice(all));
  aiTellViolationsIntl(locale, texts, out);
  modelNameViolations(draft, out);
}

const REVERSED_WORD: Record<IntlLocale, RegExp> = { en: /\breversed\b|upside[- ]down/i, ja: /逆位置/, "zh-hant": /逆位/ };

/** Card names that are everyday words in the locale and cannot be checked by string match. */
const AMBIGUOUS: Record<IntlLocale, ReadonlySet<string>> = {
  en: new Set(["Strength", "Fortitude", "Justice", "Death", "Temperance", "Judgement", "Judgment", "The Sun", "The Moon", "The Star", "The World", "The Lovers", "The Tower", "The Fool", "The Chariot"]),
  ja: new Set(["力", "星", "月", "太陽", "世界", "正義", "節制", "審判", "恋人", "塔", "死神", "死", "愚者", "戦車"]),
  "zh-hant": new Set(["力量", "星星", "月亮", "太陽", "世界", "正義", "節制", "審判", "戀人", "高塔", "死神", "愚者", "戰車", "塔", "星", "月"]),
};

/** The largest share in a fixed ladder at which `fact` is mentioned in `text` (0 when none). */
function factShare(locale: IntlLocale, text: string, fact: string): number {
  return [1, 0.9, 0.7, 0.5, 0.35, 0.2].find((share) => PROFILES[locale].mentions(text, fact, share)) ?? 0;
}

/** Hard: picture facts by id and by text, misdescriptions, orientation (spec §7.5). */
export function factViolationsIntl(locale: IntlLocale, label: string, body: string, factIds: readonly string[], card: TarotCardContext, out: string[]): void {
  const facts = new Map(card.kb.imagery.facts.map((fact) => [fact.id, fact]));
  const text = kbText(locale, card.cardId);
  const unknown = factIds.filter((id) => !facts.has(id));
  if (unknown.length) out.push(`[fact] ${label}: factIds ${unknown.join(", ")} are not facts of this card. Cite only this card's picture facts.`);
  const cited = factIds.filter((id) => facts.has(id));
  if (!cited.some((id) => (facts.get(id)?.salience ?? 3) <= 2)) out.push(`[fact] ${label}: cite at least one main picture fact (salience 1 or 2) in factIds and describe it.`);
  const best = Math.max(0, ...cited.map((id) => (text.facts[id] ? factShare(locale, body, text.facts[id]!) : 0)));
  if (cited.length && best < PROFILES[locale].factOverlap) out.push(`[fact] ${label}: the text does not describe the cited picture fact. Describe it nearly as given.`);
  for (const m of text.misdescriptions) if (new RegExp(m.regex, "i").test(body)) out.push(`[fact] ${label}: "${m.wrong}" is not in the picture. Follow the picture facts.`);
  const saysReversed = REVERSED_WORD[locale].test(body);
  const gloss = card.reversedMode ? text.reversedGloss[card.reversedMode] : undefined;
  if (card.orientation === "reversed" && !saysReversed && !(gloss && PROFILES[locale].mentions(body, gloss, 0.5))) {
    out.push(`[reversed] ${label}: this card is reversed. Say so in the first sentence and read it through its reversed meaning.`);
  }
  if (card.orientation === "upright" && saysReversed) out.push(`[reversed] ${label}: this card is upright; do not read it as reversed.`);
}

/** Hard: names of cards that were not drawn (unambiguous names and aliases only). */
export function foreignCardsIntl(locale: IntlLocale, text: string, drawnIds: readonly string[], out: string[]): void {
  const drawn = new Set(drawnIds);
  const found = new Set<string>();
  for (const card of KB_CARDS) {
    if (drawn.has(card.id)) continue;
    for (const name of [cardNameIn(card.id, locale), ...cardAliasesIn(card.id, locale)]) {
      if (!AMBIGUOUS[locale].has(name) && text.includes(name)) found.add(name);
    }
  }
  if (found.size) out.push(`[cards] Cards that were not drawn appeared: ${[...found].join(", ")}. Mention only the drawn cards.`);
}

/** Soft: the chips and the note the user chose show up (unsure answers excluded). */
function inputUseIntl(locale: IntlLocale, text: string, ctx: TarotContext, out: string[]): void {
  const unsure = new Set(unsureWords(locale));
  const missing = ctx.conditions.filter((c) => !unsure.has(c.value) && !PROFILES[locale].mentions(text, c.value)).map((c) => c.value);
  if (missing.length) out.push(`[style] Reflect what the user chose: ${missing.join(", ")}.`);
  if (ctx.note && !PROFILES[locale].mentions(text, ctx.note, 0.3)) out.push("[style] Reflect the note the user wrote, in your own words.");
}

export function validateTarotTeaserIntl(draft: TarotTeaserIntlDraft, ctx: TarotContext, locale: IntlLocale): string[] {
  const out: string[] = [];
  draft.cards.forEach((c, i) => lengthIntl(locale, `keyword ${i + 1}`, c.keyword, TAROT_LENGTHS.teaser.keyword, out));
  lengthIntl(locale, "first card", draft.firstCard.body, TAROT_LENGTHS.teaser.firstCard, out);
  factViolationsIntl(locale, "first card", draft.firstCard.body, draft.firstCard.factIds, ctx.cards[0]!, out);
  foreignCardsIntl(locale, draft.firstCard.body, ctx.cards.map((c) => c.cardId), out);
  commonIntl(locale, [draft.firstCard.body, ...draft.cards.map((c) => c.keyword)], userTextOf(ctx), draft, out);
  inputUseIntl(locale, draft.firstCard.body, ctx, out);
  return out;
}

export function validateTarotReadingIntl(r: TarotReadingIntlDraft, ctx: TarotContext, locale: IntlLocale): string[] {
  const out: string[] = [];
  lengthIntl(locale, "verdict", r.verdict, TAROT_LENGTHS.reading.verdict, out);
  r.cards.forEach((section, i) => {
    const card = ctx.cards[i];
    if (!card) return;
    lengthIntl(locale, `card ${i + 1}`, section.body, TAROT_LENGTHS.reading.cardSection, out);
    factViolationsIntl(locale, `card ${i + 1}`, section.body, section.factIds, card, out);
  });
  for (const key of ["connection", "timing", "alternatives", "action"] as const) {
    const [min] = scaledRange(locale, TAROT_LENGTHS.reading[key]);
    if (PROFILES[locale].measure(r[key].body) < Math.floor(min * (1 - TOLERANCE))) out.push(`[length] ${key} is too short or empty.`);
  }
  r.scenarios.items.forEach((item, i) => lengthIntl(locale, `scenario ${i + 1}`, item.body, TAROT_LENGTHS.reading.scenarioItem, out));
  r.followUps.forEach((q, i) => lengthIntl(locale, `follow-up ${i + 1}`, q, TAROT_LENGTHS.reading.followUp, out));
  lengthIntl(locale, "observation", r.observation.body, TAROT_LENGTHS.reading.observation, out);
  const texts = [
    r.verdict, ...r.cards.map((c) => c.body), r.connection.body, r.timing.body, ...r.scenarios.items.map((i) => i.body),
    ...r.messages.items, r.messages.hint, ...r.avoid.items, r.alternatives.body, r.action.body, r.observation.body, ...r.followUps,
  ];
  lengthIntl(locale, "the whole reading", texts.join("\n"), TAROT_LENGTHS.reading.total, out);
  foreignCardsIntl(locale, texts.join("\n"), ctx.cards.map((c) => c.cardId), out);
  commonIntl(locale, texts, userTextOf(ctx), r, out);
  inputUseIntl(locale, texts.join("\n"), ctx, out);
  return out;
}

export function validateDailyIntl(d: DailyIntlDraft, ctx: TarotContext, locale: IntlLocale): string[] {
  const out: string[] = [];
  lengthIntl(locale, "summary", d.summary, TAROT_LENGTHS.daily.summary, out);
  lengthIntl(locale, "keyword", d.keyword, TAROT_LENGTHS.daily.keyword, out);
  for (const key of ["love", "money", "work"] as const) lengthIntl(locale, `areas.${key}`, d.areas[key], TAROT_LENGTHS.daily.area, out);
  lengthIntl(locale, "tip", d.tip, TAROT_LENGTHS.daily.tip, out);
  lengthIntl(locale, "body", d.body, TAROT_LENGTHS.daily.body, out);
  factViolationsIntl(locale, "body", d.body, d.factIds, ctx.cards[0]!, out);
  commonIntl(locale, [d.summary, d.body, d.areas.love, d.areas.money, d.areas.work, d.tip, d.keyword, d.color], "", d, out);
  return out;
}

export function validateTarotFollowUpIntl(a: FollowUpAnswer, ctx: TarotContext, locale: IntlLocale, question: string): string[] {
  const out: string[] = [];
  lengthIntl(locale, "answer", a.answer, TAROT_LENGTHS.followUp.answer, out);
  foreignCardsIntl(locale, a.answer, ctx.cards.map((c) => c.cardId), out);
  commonIntl(locale, [a.answer], `${userTextOf(ctx)} ${question}`, a, out);
  return out;
}
```

  The Korean validators also check card-subject count, repeated input, action variety, invented amounts and topic drift. Add each intl twin, with an allowed case and a flagged case in this test file, when the Task 33 smoke review shows that failure in a language.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run apps/web/lib/ai/validateIntl.test.ts apps/web/lib/ai/validate.test.ts && pnpm typecheck`
Expected: PASS; the Korean validator tests unchanged and green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/ai/intlSchemas.ts apps/web/lib/ai/validateIntl.ts apps/web/lib/ai/validateIntl.test.ts
git commit -m "feat(ai): en/ja/zh-hant tarot validators — fact ids, local fact text, orientation, foreign cards, scaled lengths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/intlSchemas.ts apps/web/lib/ai/validateIntl.ts apps/web/lib/ai/validateIntl.test.ts
```

---

### Task 17: Intl saju prompts and validators

**Files:**
- Create: `apps/web/lib/ai/prompts/intl/saju.ts`, `apps/web/lib/ai/validateSajuIntl.ts`
- Modify: `apps/web/lib/ai/prompts/intl/core.ts` (add `SAJU_CORE_INTL`), `apps/web/lib/ai/prompts/intl/lengths.ts` (add `SAJU_LENGTHS`), `apps/web/lib/i18n/messages/*/reading.json` (the `saju.*` keys)
- Test: `apps/web/lib/ai/prompts/intl/saju.test.ts`, `apps/web/lib/ai/validateSajuIntl.test.ts`

**Interfaces:**
- Consumes: `SAJU_SYSTEM`, `factsBlock`, `userContextBlock`, `buildFactSet`, `type SajuFactSet` (`prompts/saju.ts`); `sajuGlossary`, `TEN_GOD_KEYS`, `STEMS`, `BRANCHES` (core); Task 15's `localeBlock`; Task 16's `commonIntl`.
- Produces:
  - `SAJU_CORE_INTL`, `SAJU_LENGTHS`;
  - `sajuGlossaryBlock(locale, facts)`, `sajuHeadingsIn(locale)` → `{ sections: string[]; observation: string }`;
  - `intlSajuTeaserPrompt(facts, locale)`, `intlSajuReadingPrompt(facts, locale)`, `intlSajuFollowUpPrompt(facts, locale, reading, turns, question)`;
  - `allowedGlyphs(facts)`, `glyphViolationsIntl`, `termViolationsIntl`, `timeUnknownViolationIntl`;
  - `validateSajuTeaserIntl`, `validateSajuReadingIntl`, `validateSajuFollowUpIntl`.

- [ ] **Step 1: Write the failing tests.**
  - `saju.test.ts` repeats Task 15's core test for `SAJU_CORE_INTL` against `SAJU_SYSTEM` (headings + 1, bullets + 5, no Hangul). It also checks that the en glossary block of the default chart writes the day master as `<hanja> <Yin|Yang> <Element>`: `expect(sajuGlossaryBlock("en", facts)).toMatch(/[甲乙丙丁戊己庚辛壬癸] Y(?:in|ang) (?:Wood|Fire|Earth|Metal|Water)/)`.
  - `validateSajuIntl.test.ts`:

```ts
import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { buildFactSet } from "./prompts/saju";
import { allowedGlyphs, glyphViolationsIntl, termViolationsIntl, timeUnknownViolationIntl } from "./validateSajuIntl";

const facts = () => buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.UTC(2026, 9, 2));

describe("intl saju checks", () => {
  it("allows the chart's own stems and rejects a ganzhi pair it does not have", () => {
    const f = facts();
    const own = [...allowedGlyphs(f)].find((g) => /^[甲乙丙丁戊己庚辛壬癸]$/.test(g))!;
    const ok: string[] = [];
    glyphViolationsIntl("ja", `日干は${own}です。`, f, "", ok);
    expect(ok).toEqual([]);
    const missing = ["甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳"].find((pair) => !JSON.stringify(f).includes(pair))!;
    const stray: string[] = [];
    glyphViolationsIntl("ja", `${missing}の年です。`, f, "", stray);
    expect(stray.some((v) => v.startsWith("[glyph]"))).toBe(true);
  });

  it("does not mistake ordinary Japanese words for ganzhi", () => {
    const out: string[] = [];
    glyphViolationsIntl("ja", "丁寧に自己紹介をして、午後は未来の予定を辛抱強く考えましょう。", facts(), "", out);
    expect(out).toEqual([]);
  });

  it("asks for hanja beside English stems", () => {
    const out: string[] = [];
    glyphViolationsIntl("en", "Your Day Master is Yang Fire.", facts(), "", out);
    expect(out.some((v) => v.startsWith("[glyph]"))).toBe(true);
  });

  it("rejects a ten god the chart lacks, and asks for the missing-hour limit", () => {
    const f = facts();
    const absent = (["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"] as const).find((g) => !JSON.stringify(f).includes(g))!;
    const words = { 비견: "比肩", 겁재: "劫財", 식신: "食神", 상관: "傷官", 편재: "偏財", 정재: "正財", 편관: "七殺", 정관: "正官", 편인: "偏印", 정인: "正印" } as const;
    const out: string[] = [];
    termViolationsIntl("zh-hant", `你的命盤裡有${words[absent]}。`, f, out);
    expect(out.some((v) => v.startsWith("[term]"))).toBe(true);
    const limit: string[] = [];
    timeUnknownViolationIntl("en", "Your chart reads the pillars clearly.", f, limit);
    expect(f.input.timeKnown).toBe(false);
    expect(limit).toHaveLength(1);
  });
});
```

  `SajuFactSet.input.timeKnown` (`prompts/saju.ts`) is the time flag both the test and the validator read.

- [ ] **Step 2: Run them** — FAIL (modules not found).

- [ ] **Step 3: Write `SAJU_CORE_INTL`, `SAJU_LENGTHS` and `prompts/intl/saju.ts`.**
  - `SAJU_CORE_INTL`: the method of Task 15 Step 4, from `SAJU_SYSTEM`. Its five reference-data bullets:
    1. Write every sentence in the language the language block names; never copy Korean words from the reference data.
    2. The <facts> block is Korean reference data computed by the server: interpret it, never recompute it.
    3. Write stems and branches with their hanja exactly as the glossary shows.
    4. Never introduce a glyph, ten god, stage or year the facts do not have.
    5. The user's own words may be in any language: quote them as written.
  - `SAJU_LENGTHS`, copied from `validate.ts` (read 2026-10-02):

```ts
export const SAJU_LENGTHS = {
  // validateSajuTeaser: title 4–12, summary 250–400
  teaser: { title: [4, 12], summary: [250, 400] },
  // validateSajuReading: section 300–550 (hard band 150–900), total 2,500–3,500, follow-up ≤30; observation 60–200
  reading: { section: [300, 550], total: [2500, 3500], followUp: [1, 30], observation: [60, 200] },
  // validateSajuFollowUp: answer 150–450
  followUp: { answer: [150, 450] },
} as const satisfies Record<string, Record<string, readonly [number, number]>>;
```
  - `sajuGlossaryBlock(locale, facts)` lists, from `sajuGlossary(locale)`:
    - the term names;
    - each ten god and stage that appears in the facts (Korean → locale);
    - the five elements;
    - for en, every stem and branch in the facts as `丙 Yang Fire` and `寅 Tiger`, with the line "Always write the hanja beside the English name."
  - `sajuHeadingsIn(locale)` reads `reading.saju.s1…s5` and `reading.saju.observation`.
  - The prompts mirror Task 15's: `<facts>` is the Korean `factsBlock(facts)`, `<user>` is `userContextBlock(facts)`, then the glossary block and the task (`teaser`, `reading`, `followup`). `localeBlock(locale, "saju")` uses `SAJU_LENGTHS`.

- [ ] **Step 4: Write `validateSajuIntl.ts`**

```ts
import "server-only";
import { BRANCHES, STEMS, TEN_GOD_KEYS, sajuGlossary } from "@starlog/core";
import type { IntlLocale } from "./locale";
import type { SajuFactSet } from "./prompts/saju";

const STEM = `[${STEMS.join("")}]`;
const BRANCH = `[${BRANCHES.join("")}]`;
const PAIR = new RegExp(`${STEM}${BRANCH}`, "g");
const SINGLE = new RegExp(`${STEM}|${BRANCH}`, "g");

/** Every stem and branch the facts contain, singles and pairs (spec §7.5). */
export function allowedGlyphs(facts: SajuFactSet): Set<string> {
  const json = JSON.stringify(facts);
  return new Set([...(json.match(PAIR) ?? []), ...(json.match(SINGLE) ?? [])]);
}

/**
 * Hard: ganzhi the chart does not have. ja and zh-hant check stem+branch pairs only, because single
 * characters (丁, 辛, 己, 子, 午, 未, 申) are ordinary words there. en checks every hanja, and asks for
 * hanja beside English stem names.
 */
export function glyphViolationsIntl(locale: IntlLocale, text: string, facts: SajuFactSet, userText: string, out: string[]): void {
  const allowed = allowedGlyphs(facts);
  const found = locale === "en" ? (text.match(SINGLE) ?? []) : (text.match(PAIR) ?? []);
  const stray = [...new Set(found)].filter((g) => !allowed.has(g) && !userText.includes(g));
  if (stray.length) out.push(`[glyph] ${stray.join(", ")} are not in this chart. Use only the glyphs in <facts>.`);
  if (locale === "en" && /\b(?:Yang|Yin) (?:Wood|Fire|Earth|Metal|Water)\b/.test(text) && !new RegExp(STEM).test(text)) {
    out.push("[glyph] Write the hanja beside each stem, e.g. 丙 Yang Fire.");
  }
}

/** Hard: ten gods (in the locale's words) that the facts do not list. */
export function termViolationsIntl(locale: IntlLocale, text: string, facts: SajuFactSet, out: string[]): void {
  const glossary = sajuGlossary(locale);
  const json = JSON.stringify(facts);
  const stray = TEN_GOD_KEYS.filter((ko) => !json.includes(ko) && text.includes(glossary.tenGods[ko]));
  if (stray.length) out.push(`[term] ${stray.map((ko) => glossary.tenGods[ko]).join(", ")} are not in this chart.`);
}

const HOUR_UNKNOWN: Record<IntlLocale, RegExp> = {
  en: /birth (?:time|hour)|hour pillar|without the hour|time of birth/i,
  ja: /生まれた時刻|出生時刻|時柱/,
  "zh-hant": /出生時間|出生時辰|時柱/,
};

/** Hard when the time is unknown: say it was read without the hour pillar. */
export function timeUnknownViolationIntl(locale: IntlLocale, text: string, facts: SajuFactSet, out: string[]): void {
  if (!facts.input.timeKnown && !HOUR_UNKNOWN[locale].test(text)) out.push("[limit] Say in one sentence that the birth time is unknown, so the hour pillar was left out.");
}
```

  Then write `validateSajuTeaserIntl`, `validateSajuReadingIntl` and `validateSajuFollowUpIntl`. Each combines:
  - the three checks above;
  - Task 16's `commonIntl`;
  - lengths from `SAJU_LENGTHS` (copy `lengthIntl` into a small shared `lib/ai/locale/length.ts` and import it from both validators);
  - the time-unknown rule where the Korean validator has it (the teaser summary; the reading's first section);
  - two sentence-level rules, flagged unless the sentence negates (en `not|don't|won't`, ja `ません|しない|ない`, zh `不|沒`):
    - school labels: en `/\b(?:strong|weak) Day Master\b|\bUseful God\b|\bFavorable Element\b/`, ja and zh `/身強|身弱|用神|格局/`;
    - compatibility claims: en `/\bcompatib(?:le|ility)\b[^.]{0,20}\b(?:good|bad|high|low|great|poor)\b/i`, ja `/相性(?:が|は)?[^。]{0,6}(?:良い|いい|悪い|最高|最悪)/`, zh `/合得來|很相配|速配|八字(?:很)?合/`.

- [ ] **Step 5: Run the tests** — `npx vitest run apps/web/lib/ai/prompts/intl apps/web/lib/ai/validateSajuIntl.test.ts apps/web/lib/ai/saju.test.ts && pnpm typecheck` → PASS; Korean saju tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/ai/prompts/intl apps/web/lib/ai/validateSajuIntl.ts apps/web/lib/ai/validateSajuIntl.test.ts apps/web/lib/ai/validateIntl.ts apps/web/lib/ai/locale apps/web/lib/i18n/messages
git commit -m "feat(ai): en/ja/zh-hant saju prompts and validators — ganzhi pairs, hanja beside English, ten gods, missing-hour limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/prompts/intl apps/web/lib/ai/validateSajuIntl.ts apps/web/lib/ai/validateSajuIntl.test.ts apps/web/lib/ai/validateIntl.ts apps/web/lib/ai/locale apps/web/lib/i18n/messages
```

---

### Task 18: Intl mocks

**Files:**
- Create: `apps/web/lib/ai/mockIntl.ts`
- Test: `apps/web/lib/ai/mockIntl.test.ts`

**Interfaces:**
- Consumes: Tasks 15–17; `kbText`; `cardNameIn`; `sajuGlossary`.
- Produces (deterministic drafts that pass the intl validators with no hard violation; the mock provider returns them in e2e and key-less dev):
  - `mockTarotTeaserIntl(ctx, locale)`, `mockTarotReadingIntl(ctx, locale)`, `mockDailyIntl(ctx, locale)`, `mockTarotFollowUpIntl(ctx, locale, question)`;
  - `mockSajuTeaserIntl(facts, locale)`, `mockSajuReadingIntl(facts, locale)`, `mockSajuFollowUpIntl(facts, locale, question)`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai/mockIntl.test.ts`

```ts
import { DEFAULT_REVERSAL_RATE, TEMPLATES, TOPICS_BY_WHO, computeChart, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { mockDailyIntl, mockSajuReadingIntl, mockSajuTeaserIntl, mockTarotReadingIntl, mockTarotTeaserIntl } from "./mockIntl";
import { buildFactSet } from "./prompts/saju";
import { buildTarotContext } from "./prompts/tarot";
import { isSoftViolation } from "./style";
import { validateDailyIntl, validateTarotReadingIntl, validateTarotTeaserIntl } from "./validateIntl";
import { validateSajuReadingIntl, validateSajuTeaserIntl } from "./validateSajuIntl";

const hard = (v: string[]) => v.filter((x) => !isSoftViolation(x));

describe.each(["en", "ja", "zh-hant"] as const)("intl mocks pass their validators: %s", (locale) => {
  it("tarot teaser, reading and daily for 30 draws", () => {
    for (let seed = 0; seed < 30; seed++) {
      const topic = TOPICS_BY_WHO.me[seed % TOPICS_BY_WHO.me.length]!;
      const template = TEMPLATES[topic.template];
      const picks = [seed % 78, (seed + 7) % 78, (seed + 19) % 78].slice(0, template.positions.length);
      const ctx = buildTarotContext(topic.template, pickCards(createDeck(`m${seed}`, DEFAULT_REVERSAL_RATE), template, picks), {
        topicId: topic.id, whoId: "me", whenId: "week", question: "", conditions: [],
      });
      expect(hard(validateTarotTeaserIntl(mockTarotTeaserIntl(ctx, locale), ctx, locale)), `teaser ${seed}`).toEqual([]);
      expect(hard(validateTarotReadingIntl(mockTarotReadingIntl(ctx, locale), ctx, locale)), `reading ${seed}`).toEqual([]);
      const day = buildTarotContext("daily", pickCards(createDeck(`d${seed}`, DEFAULT_REVERSAL_RATE), TEMPLATES.daily, [seed % 78]), null);
      expect(hard(validateDailyIntl(mockDailyIntl(day, locale), day, locale)), `daily ${seed}`).toEqual([]);
    }
  });

  it("saju teaser and reading", () => {
    const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.UTC(2026, 9, 2));
    expect(hard(validateSajuTeaserIntl(mockSajuTeaserIntl(facts, locale), facts, locale))).toEqual([]);
    expect(hard(validateSajuReadingIntl(mockSajuReadingIntl(facts, locale), facts, locale))).toEqual([]);
  });
});
```

  Signatures as of 2026-10-02: `pickCards(deck, template, pickedIndexes)`, `buildTarotContext(templateId, drawn, input | null)`, `buildFactSet(chart, nowMs)`.

- [ ] **Step 2: Run it** — FAIL (module not found).

- [ ] **Step 3: Write `mockIntl.ts`.** Card sections:
  - open with the reversed word when the card is reversed ("Reversed, ", "逆位置で、", "逆位，");
  - quote the card's first salience-1 fact verbatim from `kbText(locale, id).facts`, and put its id in `factIds`;
  - fill length from a fixed per-locale phrasebook of neutral, rule-abiding sentences, appended until `scaledRange(min)` is reached and never past `max`, measured with `PROFILES[locale].measure`. For example: "Take one small step today and see how it feels." / 「今日は小さな一歩をひとつだけ試してみましょう。」 / 「今天先試著踏出一小步。」;
  - card and saju words only from `cardNameIn` and `sajuGlossary`;
  - saju mocks name the day master with its hanja from the facts and include the missing-hour sentence when the time is unknown;
  - no Hangul, no tells, no safety words.

- [ ] **Step 4: Run it** — PASS. If a draft fails, fix the mock, never the validator.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/ai/mockIntl.ts apps/web/lib/ai/mockIntl.test.ts
git commit -m "test(ai): deterministic en/ja/zh-hant drafts that pass the intl validators (mock provider)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/mockIntl.ts apps/web/lib/ai/mockIntl.test.ts
```

---

### Task 19: Intl generators and the today-line

**Files:**
- Create: `apps/web/lib/ai/generateIntl.ts`, `apps/web/lib/bonds/todayLineIntl.ts`
- Test: `apps/web/lib/ai/generateIntl.test.ts`, `apps/web/lib/bonds/todayLineIntl.test.ts`

**Interfaces:**
- Consumes: Tasks 14–18; `generateValidated`, `generationSetting`, `type GenerationHooks`, `type ReadingProvider` (`provider.ts`); `type Result` (`generate.ts`).
- Produces:
  - `generateTarotTeaserIntl`, `generateTarotReadingIntl`, `generateDailyIntl`, `generateTarotFollowUpIntl`, `generateSajuTeaserIntl`, `generateSajuReadingIntl`, `generateSajuFollowUpIntl`, each `(provider, ctx | facts, locale, …, hooks?) → Result<Korean data shape>`:
    - `system` = the English core, `systemLocale` = `localeBlock(locale, kind)` + the glossary block;
    - code-owned headings and TOC from `tarotHeadingsIn` / `sajuHeadingsIn`;
    - `factIds` stripped;
    - `cardId` and `position` overwritten as in `generate.ts`.
  - `validateTodayLineIntl(line, locale)`, `todayLinePromptIntl(cardId, orientation, locale)`, `fallbackTodayLine(cardId, orientation, locale)`: the rule-based line from `kbText` keywords and a per-locale template.

- [ ] **Step 1: Write the failing tests.**
  - `generateIntl.test.ts`: with `mockProvider` (it calls `task.mock(attempt)`, so the intl tasks' mocks are used as they are), `generateTarotReadingIntl(mockProvider, ctx, "ja")` returns:
    - `cards[i].cardId === ctx.cards[i].cardId`;
    - `timing.heading === tarotHeadingsIn("ja", ctx).timing`;
    - no `"factIds"` in `JSON.stringify(result.data)`.
    - Wrap `mockProvider.generate` with a spy and assert the task it received has `systemLocale` containing `日本語`.
  - `todayLineIntl.test.ts`:
    - `validateTodayLineIntl` rejects Hangul, lottery words (`lottery`, `宝くじ`, `樂透`), reunion words (`get back together`, `復縁`, `復合`), marriage words (`married`, `結婚`), and lines outside the scaled 30–90 range;
    - it accepts one calm two-sentence line per locale;
    - `fallbackTodayLine` passes `validateTodayLineIntl` for 20 card sides per locale.

- [ ] **Step 2: Run them** — FAIL.

- [ ] **Step 3: Write `generateIntl.ts`.** One function per kind, shaped like `generate.ts`, for example:

```ts
export async function generateTarotReadingIntl(provider: ReadingProvider, ctx: TarotContext, locale: IntlLocale, hooks?: GenerationHooks): Promise<Result<TarotReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-reading",
    system: TAROT_CORE_INTL,
    systemLocale: localeBlock(locale, "tarot"),
    user: intlTarotReadingPrompt(ctx, locale),
    schema: TarotReadingIntlDraftSchema,
    ...generationSetting("tarot-reading"),
    mock: () => mockTarotReadingIntl(ctx, locale),
  }, (reading) => validateTarotReadingIntl(reading, ctx, locale), hooks);
  const h = tarotHeadingsIn(locale, ctx);
  const clean = stripFactIds(data);
  return {
    data: {
      ...clean,
      cards: clean.cards.map((section, i) => ({ ...section, position: ctx.cards[i]!.position, cardId: ctx.cards[i]!.cardId })),
      connection: { ...clean.connection, heading: h.connection },
      timing: { ...clean.timing, heading: h.timing },
      scenarios: { ...clean.scenarios, heading: h.scenarios },
      messages: { ...clean.messages, heading: h.messages },
      avoid: { ...clean.avoid, heading: h.avoid },
      alternatives: { ...clean.alternatives, heading: h.alternatives },
      action: { ...clean.action, heading: h.action },
      observation: { ...clean.observation, heading: h.observation },
    },
    usage,
  };
}
```

  The other six follow the same pattern:
  - the teaser takes `lockedToc` from `tarotLockedTocIn` and the first card's heading from `cardLabelIn`, exactly where the Korean `generateTarotTeaser` uses `cardLabel`;
  - daily returns `stripFactIds(data)`;
  - saju overwrites section headings and the observation heading from `sajuHeadingsIn`, as `generateSajuReading` does with `SAJU_PROLOGUE_SECTIONS`.

- [ ] **Step 4: Write `todayLineIntl.ts`.**
  - The prompt: the Korean `SYSTEM` of `lib/bonds/todayLine.ts` rendered in English, plus the locale's `STYLE` block and its length (30–90 Korean characters, scaled).
  - The validator mirrors `validateTodayLine`: length, script, per-locale forbidden words with the Korean list's intents (probability, certainty, fate, lottery, reunion, marriage, breakup), formatting, voice and model names.
  - The fallback: per-locale templates from `kbText(locale, id).keywords[0]` and the card name, e.g. en upright `"{card} is upright today. Between the two of you, {keyword} sets the mood; a short hello is enough."`, with ja and zh-hant equivalents and reversed variants.
  - `todayLine.ts` itself stays as it is; Task 25 routes by locale.

- [ ] **Step 5: Run the tests** — `npx vitest run apps/web/lib/ai apps/web/lib/bonds && pnpm typecheck` → PASS; Korean tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/ai/generateIntl.ts apps/web/lib/ai/generateIntl.test.ts apps/web/lib/bonds/todayLineIntl.ts apps/web/lib/bonds/todayLineIntl.test.ts
git commit -m "feat(ai): en/ja/zh-hant generators with code-owned local headings, and the bonds today-line per locale" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/ai/generateIntl.ts apps/web/lib/ai/generateIntl.test.ts apps/web/lib/bonds/todayLineIntl.ts apps/web/lib/bonds/todayLineIntl.test.ts
```

---

## Gate G1 (controller)

All of these must hold before Task 20:
- P4 and P5 report done.
- `git status --short -- apps/web/app apps/web/components apps/web/lib` is empty.
- No agent is assigned work under `apps/web/app`.

Tell the P4 and P5 owners that page files move to `apps/web/app/[lang]/…` in Task 21, and that later fixes go to the new paths.

## Phase A — after G1

### Task 20: Move script, config and routing spike (controller)

**Files:**
- Create: `scripts/i18n/move-to-lang.mjs`, `scripts/i18n/compare-html.mjs`
- Test: `apps/web/lib/i18n/moveScript.test.ts`
- Spike only, in a throwaway worktree: everything Task 21 does.

**Interfaces:**
- Produces:
  - `planMove(appEntries) → { move, toPublic, stay }`;
  - `rewriteImports(text, moved, isLocaleLink) → string`;
  - the CLI `node scripts/i18n/move-to-lang.mjs`, which refuses to run on a dirty `apps/web/app`;
  - `node scripts/i18n/compare-html.mjs <baseA> <baseB> <paths…>`: a normalized HTML diff with asset hashes, build ids and RSC chunk ids removed.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/i18n/moveScript.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { planMove, rewriteImports } from "../../../../scripts/i18n/move-to-lang.mjs";

describe("move into app/[lang]", () => {
  it("moves pages, keeps route handlers and app-wide files, and sends icons to public/", () => {
    const plan = planMove(["about", "api", "ads.txt", "favicon.ico", "globals.css", "global-error.tsx", "icon.png", "layout.tsx", "llms.txt", "not-found.tsx", "page.tsx", "robots.txt", "rss.xml", "sitemap.ts", "tarot", "apple-icon.png", "opengraph-image.tsx"]);
    expect(plan.move).toEqual(["about", "layout.tsx", "not-found.tsx", "page.tsx", "tarot", "opengraph-image.tsx"]);
    expect(plan.toPublic).toEqual(["favicon.ico", "icon.png", "apple-icon.png"]);
    expect(plan.stay).toEqual(["api", "ads.txt", "globals.css", "global-error.tsx", "llms.txt", "robots.txt", "rss.xml", "sitemap.ts"]);
  });

  it("points moved imports at app/[lang] and next/link at LocaleLink", () => {
    const text = 'import Link from "next/link";\nimport x from "@/app/pricing/page";\nimport r from "@/app/robots.txt/route";\nimport "./globals.css";';
    expect(rewriteImports(text, ["pricing"], false)).toBe('import Link from "@/components/i18n/LocaleLink";\nimport x from "@/app/[lang]/pricing/page";\nimport r from "@/app/robots.txt/route";\nimport "./globals.css";');
    expect(rewriteImports('import Link from "next/link";', [], true)).toBe('import Link from "next/link";');
  });
});
```

- [ ] **Step 2: Run it** — FAIL (module not found).

- [ ] **Step 3: Write `scripts/i18n/move-to-lang.mjs`**

```js
// One-off (P6 Task 21): moves every page route of apps/web/app under app/[lang], sends metadata icons to
// public/ (dotted paths are not rewritten to /ko), points "@/app/<moved>" imports at the new paths and
// every `import Link from "next/link"` at LocaleLink. Controller only, on a clean apps/web/app.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STAY = new Set(["api", "ads.txt", "llms.txt", "llms-full.txt", "robots.txt", "rss.xml", "sitemap.ts", "global-error.tsx", "global-not-found.tsx", "globals.css", "[lang]"]);
const TO_PUBLIC = ["favicon.ico", "icon.png", "apple-icon.png"];

export function planMove(entries) {
  return {
    move: entries.filter((e) => !STAY.has(e) && !TO_PUBLIC.includes(e)),
    toPublic: TO_PUBLIC.filter((e) => entries.includes(e)),
    stay: entries.filter((e) => STAY.has(e)),
  };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function rewriteImports(text, moved, isLocaleLink) {
  let out = text;
  if (moved.length) out = out.replace(new RegExp(`(["'])@/app/(${moved.map(escape).join("|")})(?=[/"'])`, "g"), "$1@/app/[lang]/$2");
  if (!isLocaleLink) out = out.replace(/import Link from "next\/link";/g, 'import Link from "@/components/i18n/LocaleLink";');
  return out;
}

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".open-next", "test-results", ".wrangler"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) yield path;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const web = join(root, "apps/web");
  const app = join(web, "app");
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "apps/web/app"], { cwd: root, encoding: "utf8" });
  if (dirty.trim()) {
    console.error(`apps/web/app has uncommitted changes; land them first:\n${dirty}`);
    process.exit(1);
  }
  const plan = planMove(readdirSync(app));
  mkdirSync(join(app, "[lang]"), { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "inherit" });
  for (const name of plan.move) git("mv", `apps/web/app/${name}`, `apps/web/app/[lang]/${name}`);
  for (const name of plan.toPublic) git("mv", `apps/web/app/${name}`, `apps/web/public/${name}`);
  for (const file of [...sources(web), ...sources(join(root, "scripts"))]) {
    const text = readFileSync(file, "utf8");
    const next = rewriteImports(text, plan.move, file.endsWith(`components${sep}i18n${sep}LocaleLink.tsx`));
    if (next !== text) writeFileSync(file, next);
  }
  const layout = join(app, "[lang]", "layout.tsx");
  writeFileSync(layout, readFileSync(layout, "utf8").replace('import "./globals.css";', 'import "../globals.css";'));
  console.log(`moved ${plan.move.length} entries, ${plan.toPublic.length} icons to public/`);
}
```

- [ ] **Step 4: Write `scripts/i18n/compare-html.mjs`**

```js
// usage: node scripts/i18n/compare-html.mjs http://localhost:3100 http://localhost:3101 / /tarot/new /faq …
// Fetches each path from both servers and diffs the HTML after removing build-specific noise
// (/_next/static paths, the build id, long hashes, RSC chunk ids). Exit 1 on any difference.
const [a, b, ...paths] = process.argv.slice(2);
const normalize = (html) =>
  html
    .replace(/\/_next\/static\/[^"'\s)]+/g, "/_next/static/X")
    .replace(/"buildId":"[^"]+"/g, '"buildId":"X"')
    .replace(/\b[0-9a-f]{16,}\b/g, "H")
    .replace(/self\.__next_f\.push\(\[1,"[0-9a-z]+:/g, 'self.__next_f.push([1,"N:');
let failed = 0;
for (const path of paths) {
  const [x, y] = await Promise.all([a, b].map((base) => fetch(new URL(path, base)).then((r) => r.text())));
  const nx = normalize(x);
  const ny = normalize(y);
  if (nx !== ny) {
    failed++;
    const i = [...nx].findIndex((ch, k) => ch !== ny[k]);
    console.error(`${path}: differs at ${i}\n  A: …${nx.slice(Math.max(0, i - 80), i + 120)}\n  B: …${ny.slice(Math.max(0, i - 80), i + 120)}`);
  }
}
console.log(`${paths.length - failed}/${paths.length} identical`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 5: Run the test** — `npx vitest run apps/web/lib/i18n/moveScript.test.ts` → PASS.

- [ ] **Step 6: Spike in a throwaway worktree.**
  1. `git worktree add ../saju-tarot-spike HEAD`; in it, run `node scripts/i18n/move-to-lang.mjs`.
  2. Apply Task 21 Steps 2–5 there.
  3. `NEXT_PUBLIC_LOCALES_PREVIEW=en,ja,zh-hant pnpm cf:build`, then `pnpm --filter @starlog/web cf:preview` (port 8787).
  4. Check, and record each result:

| Check | Expected |
|---|---|
| `curl -s localhost:8787/ \| grep -o '<html lang="[^"]*"'` | `lang="ko"`, and a response header shows the prerendered copy (`x-nextjs-cache: HIT` or OpenNext's equivalent; note which) |
| `/en`, `/ja`, `/zh-hant` | 200 with `lang="en"`, `"ja"`, `"zh-Hant"` |
| `curl -sI localhost:8787/ko/tarot/new` | 308, `location: /tarot/new` |
| `/fr/x`, `/en/owner` | the 404 page |
| `/sitemap.xml /robots.txt /llms.txt /rss.xml /ads.txt /favicon.ico /icon.png /apple-icon.png /cards/major-00-fool.webp /api/version` | 200 each |
| Browser: open `/`, click 타로 보기 | URL `/tarot/new` (never `/ko/…`); the `?_rsc=` request answers 200 |
| Browser: open `/en`, click the tarot entry | URL `/en/tarot/new` |
| `pnpm check:worker` | within budget; note the gzip KiB |
| Prerendered page count and `cdn-cgi` size | note both against Task 1's |
| `cf:build` wall time | note it against Task 1's |

  5. **Decision.**
     - Every row passes: go to Task 21 as written.
     - A rewrite row fails: put the same rule in `apps/web/proxy.ts`. It rewrites to `/ko${path}` when `new RegExp("^(?:" + KO_REWRITE_PATTERN + ")$")` matches the path without its leading slash, with `config.matcher = ["/((?!api|_next|.*\\..*).*)"]`. Drop `rewrites()` from next.config, rebuild and rerun the table. OpenNext ≥1.20.3 supports `proxy.ts` (spec §4.2). Record the decision in the Task 21 commit message.
  6. `git worktree remove ../saju-tarot-spike --force`.

- [ ] **Step 7: Report** the table and the decision to the owner (spec §15 question 1, and the build-time and asset-size risks in §13).

- [ ] **Step 8: Commit** (the scripts and the test only)

```bash
git add scripts/i18n/move-to-lang.mjs scripts/i18n/compare-html.mjs apps/web/lib/i18n/moveScript.test.ts
git commit -m "chore(i18n): move script into app/[lang] and a normalized HTML compare for the Korean pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/i18n/move-to-lang.mjs scripts/i18n/compare-html.mjs apps/web/lib/i18n/moveScript.test.ts
```

---

### Task 21: The move into `app/[lang]` (controller, alone)

**Files:**
- Move: every page route under `apps/web/app/` → `apps/web/app/[lang]/`; `favicon.ico`, `icon.png`, `apple-icon.png` → `apps/web/public/`
- Create: `apps/web/app/global-not-found.tsx`, `apps/web/lib/i18n/server.ts`, `apps/web/components/i18n/Messages.tsx`
- Modify:
  - `apps/web/next.config.ts`: rewrites, redirects, `experimental.globalNotFound`;
  - `apps/web/app/[lang]/layout.tsx`: html lang, static params, provider, icons;
  - the path-dependent client files (Step 5);
  - every `next/link` import (codemod).
- Test: `apps/web/lib/i18n/routingConfig.test.ts`; the whole existing suite must pass unchanged.

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 20.
- Produces:
  - `currentLocale(): Promise<Locale>` (`next/root-params`; a locale this build does not route is a 404);
  - `getT(ns)`, `localeRedirect(path)`;
  - `<Messages ns={[…]}>`: a server component that adds namespaces for a client subtree.
  - The locale tree is live. Only Korean is routed until `NEXT_PUBLIC_LOCALES` or `NEXT_PUBLIC_LOCALES_PREVIEW` names more.

- [ ] **Step 1: Run the move**

Run: `node scripts/i18n/move-to-lang.mjs`
Expected: `moved N entries, 3 icons to public/`; `git status` shows renames plus import edits only.

- [ ] **Step 2: Edit `apps/web/next.config.ts`**

```ts
import { localeRedirects, localeRewrites } from "./lib/i18n/routing";
// …
  experimental: {
    turbopackFileSystemCacheForDev: process.env.STARLOG_DEV_FS_CACHE !== "0",
    // P6: the root layout is app/[lang]/layout.tsx, so URLs that match no route render app/global-not-found.tsx.
    globalNotFound: true,
  },
// …
  async redirects() {
    return [{ source: "/guide", destination: "/guide/tarot", permanent: true }, ...localeRedirects()];
  },
  // P6 (spec §4.2): Korean pages live at app/[lang] with lang=ko and keep their unprefixed URLs.
  async rewrites() {
    return localeRewrites();
  },
```

`apps/web/lib/i18n/routingConfig.test.ts`:

```ts
import { expect, it } from "vitest";
import config from "@/next.config";
import { localeRedirects, localeRewrites } from "./routing";

it("wires the locale rewrites, the /ko redirects and the global not-found page", async () => {
  expect(await config.rewrites!()).toEqual(localeRewrites());
  expect(await config.redirects!()).toEqual(expect.arrayContaining(localeRedirects()));
  expect(config.experimental?.globalNotFound).toBe(true);
});
```

- [ ] **Step 3: Write `lib/i18n/server.ts`, `components/i18n/Messages.tsx` and `app/global-not-found.tsx`**

```ts
import { notFound, redirect } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, routedLocales, type Locale } from "./locales";
import type { Namespace } from "./messages";
import { localePath } from "./paths";
import { translator, type Translate } from "./translate";

/** The page's locale (server components only). A locale this build does not route is a 404. */
export async function currentLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value) || !routedLocales().includes(value)) notFound();
  return value;
}

export async function getT<N extends Namespace>(ns: N): Promise<Translate<N>> {
  return translator(await currentLocale(), ns);
}

/** redirect() that keeps the page's locale. */
export async function localeRedirect(path: string): Promise<never> {
  redirect(localePath(await currentLocale(), path));
}
```

```tsx
import type { ReactNode } from "react";
import type { Namespace } from "@/lib/i18n/messages";
import { currentLocale } from "@/lib/i18n/server";
import { pickMessages } from "@/lib/i18n/translate";
import { LocaleProvider } from "./LocaleProvider";

/** Hands one locale's namespaces to the client components below it (they read them with useT). */
export async function Messages({ ns, children }: { ns: readonly Namespace[]; children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <LocaleProvider locale={locale} messages={pickMessages(locale, ns)}>
      {children}
    </LocaleProvider>
  );
}
```

```tsx
// app/global-not-found.tsx — URLs that match no route at all (spec §4.2). No layout runs here.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요 · Page not found", robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return (
    <html lang="ko">
      <body>
        <main className="page-col" style={{ paddingBlock: "20vh", textAlign: "center" }}>
          <h1>찾는 페이지가 없어요</h1>
          <p lang="en">We couldn&apos;t find that page.</p>
          <p>
            <a href="/">스타로그 홈</a>
          </p>
        </main>
      </body>
    </html>
  );
}
```

  Task 24 adds the public locales' home links here.

- [ ] **Step 4: Edit `app/[lang]/layout.tsx`.** Keep every existing line, then:
  - add `export const dynamicParams = false;` and `export function generateStaticParams() { return routedLocales().map((lang) => ({ lang })); }`;
  - make the component `async` and read `const locale = await currentLocale();`;
  - render `<html lang={LOCALE_INFO[locale].tag} …>`;
  - wrap the body's children in `<LocaleProvider locale={locale} messages={pickMessages(locale, ["common"])}>`;
  - add `icons: { icon: "/icon.png", apple: "/apple-icon.png" }` to `metadata`.

  `metadata` stays Korean for now; Task 24 localizes it. `app/[lang]/not-found.tsx` stays as it is; Task 22 localizes its copy.

- [ ] **Step 5: Fix the path-dependent client code.** These were found on 2026-10-02; rerun the greps to catch P4 and P5 additions.
  - `grep -rln "useRouter" apps/web/app apps/web/components apps/web/lib`: replace `import { useRouter } from "next/navigation"` with `import { useLocaleRouter as useRouter } from "@/components/i18n/navigation"`. Split mixed imports: `useSearchParams` and the rest stay on `next/navigation`.
  - `components/layout/RouteTracker.tsx`: `usePathname()` → `useBarePathname()`.
  - `lib/useFlowVisit.ts` and `lib/freshStart.ts`: compare `splitLocale(window.location.pathname).path`.
  - `grep -rn "redirect(" apps/web/app`: in server pages, `redirect("/x")` → `await localeRedirect("/x")`.
  - `grep -rn '<a [^>]*href="/' apps/web/app apps/web/components`: raw anchors to internal pages become `<Link>`.

- [ ] **Step 6: Verify**
  1. `pnpm typecheck`. It runs `next typegen`, which writes the `next/root-params` types.
  2. `npx vitest run --maxWorkers=3`: the whole suite passes. Test files that imported `@/app/…` were rewritten by the script; no assertion changes.
  3. `pnpm --filter @starlog/web e2e`: every spec passes unchanged.
  4. Compare the Korean HTML. Build the pre-move tree (`git stash`), then `pnpm build && pnpm --filter @starlog/web start` (port 3100). Unstash, then `pnpm build && pnpm --filter @starlog/web exec next start --port 3101`. Run:

     `node scripts/i18n/compare-html.mjs http://localhost:3100 http://localhost:3101 / /tarot/new /saju/new /now /today /guide/tarot /guide/the-fool /about /how /help /faq /pricing /terms /privacy /refund /lucky /ranking /ranking/aries`

     Expected: identical. The one accepted difference is the `<link rel="icon">` lines (icons now come from `public/`); name it in the commit message.
  5. `pnpm cf:build && pnpm check:worker`.

- [ ] **Step 7: Commit** (one commit; rename detection keeps history)

```bash
git add -A apps/web/app apps/web/public apps/web/next.config.ts apps/web/lib apps/web/components
git commit -m "refactor(i18n): pages under app/[lang], Korean at unprefixed URLs (rewrites, /ko redirects), LocaleLink everywhere" -m "Korean HTML identical except the icon links (now public/). Spike results: <paste the Task 20 table>." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

This is the only commit that stages with `-A`, and only on the listed folders. Run it at gate G1, with nobody else editing.

---

### Extraction recipe (Tasks 22 and 26–31 follow it)

Each extraction task names its files and namespaces. For every file:

1. **List the Korean.** `node scripts/i18n/hangul-lines.mjs <paths…>` (Task 22 creates it) prints every line with Hangul outside comments.
2. **Move each string to `messages/ko/<ns>.json`, exactly as it is.**
   - A template literal becomes a placeholder: `` `${name}님` `` → `"{name}님"`.
   - A particle chosen by `withParticle` becomes `{x, josa, 을/를}`.
   - A count that changes the wording becomes a plural.
   - Numbers the Korean prints without digit grouping go in as strings (`String(n)`).
3. **Read it back.**
   - Pages (`page.tsx`, `layout.tsx`, `not-found.tsx`): `const t = await getT("<ns>")`; the page becomes `async`. `export const metadata` becomes `export async function generateMetadata()`, built with `pageMetadata(…, await currentLocale())` (Task 24).
   - Client components and small shared components that existing tests render synchronously: `const t = useT("<ns>")`, adding `"use client"` if needed. The page wraps them once in `<Messages ns={["<ns>"]}>`.
   - Module-level Korean constants (label arrays, maps) become keys, translated where they are rendered.
4. **Do not move to messages** what has a home already:
   - card, position, topic, condition, sign and saju words → core accessors (Task 8);
   - crisis lines → `lib/i18n/crisis.ts`;
   - prices and dates → `lib/i18n/intl.ts`;
   - business information values → `SITE.business`, which stays Korean (mark the block `data-i18n-allow="ko"`);
   - anything the user typed.
5. **Fill en, ja and zh-hant.** Either `I18N_JOB=messages:<l>:<ns> pnpm i18n:draft` or by hand, following `content/i18n/style/<l>.md`. Then `I18N_LOCALE=<l> pnpm i18n:ledger` for each locale.
6. **Test.**
   - Existing tests pass with unchanged expectations (harness-only changes allowed, see Global Constraints).
   - Add one test per changed screen that renders it in `ja` (or `en`): set `setTestLocale("ja")` (Task 22) and wrap client parts in `LocaleProvider` with `pickMessages("ja", […])`. Assert the translated text is shown and that `container.textContent` has no Hangul outside `[data-i18n-allow]`.
7. **Run** `npx vitest run <the folders you touched> apps/web/lib/i18n && pnpm typecheck`, then commit only your paths.

---

### Task 22: Locale test harness, chrome strings, fonts

**Files:**
- Create: `apps/web/test/rootParams.ts`, `apps/web/test/i18nSetup.ts`, `scripts/i18n/hangul-lines.mjs`
- Modify:
  - `vitest.config.ts` (web project: `next/root-params` alias, `setupFiles`);
  - `apps/web/components/i18n/LocaleProvider.tsx` (`setFallbackMessages`);
  - `apps/web/components/layout/TabBar.tsx`, `apps/web/components/home/HomeTopBar.tsx`;
  - `apps/web/app/[lang]/not-found.tsx`, `apps/web/app/[lang]/error.tsx`;
  - `apps/web/app/globals.css`;
  - `apps/web/lib/i18n/messages/*/common.json` (the error-page strings).
- Test: `apps/web/components/layout/TabBar.i18n.test.tsx`; `components/layout/layout.test.tsx` and `Footer.test.tsx` stay green unchanged.

**Interfaces:**
- Produces:
  - `setTestLocale(locale)` (tests); `setFallbackMessages(messages)` (tests only: the Korean catalogs components see without a provider);
  - `TabBar` and `HomeTopBar` read `common` through `useT` (client components);
  - CSS: `html:lang(ja)` and `html:lang(zh-Hant)` font stacks.

- [ ] **Step 1: Write the test harness.**

`apps/web/test/rootParams.ts`:

```ts
/** Test stand-in for next/root-params (vitest alias in vitest.config.ts). */
let current = "ko";
export const setTestLocale = (locale: string): void => {
  current = locale;
};
export async function lang(): Promise<string> {
  return current;
}
```

`apps/web/test/i18nSetup.ts`:

```ts
import { afterEach } from "vitest";
import { setFallbackMessages } from "@/components/i18n/LocaleProvider";
import { NAMESPACES } from "@/lib/i18n/messages";
import { pickMessages } from "@/lib/i18n/translate";
import { setTestLocale } from "./rootParams";

// Components rendered without a provider (every existing test) see the Korean catalogs.
setFallbackMessages(pickMessages("ko", NAMESPACES));
afterEach(() => setTestLocale("ko"));
```

`vitest.config.ts`, web project: add `"next/root-params": fromRoot("./apps/web/test/rootParams.ts")` to `resolve.alias`, and `setupFiles: [fromRoot("./apps/web/test/i18nSetup.ts")]` to `test`.

`LocaleProvider.tsx`:
- add `let fallback: PickedMessages = {};` and

```ts
/** Tests only (apps/web/test/i18nSetup.ts): catalogs for components rendered without a provider. */
export function setFallbackMessages(messages: PickedMessages): void {
  fallback = messages;
}
```

- in `useT`, read `const catalog = messages[ns] ?? fallback[ns];`.

`scripts/i18n/hangul-lines.mjs`:

```js
// usage: node scripts/i18n/hangul-lines.mjs <file or folder>… — lines with Hangul outside comments (extraction inventory).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const HANGUL = /[가-힣]/;
function* files(path) {
  if (statSync(path).isDirectory()) for (const name of readdirSync(path)) yield* files(join(path, name));
  else if (/\.(tsx?|mjs)$/.test(path) && !/\.test\./.test(path)) yield path;
}
let total = 0;
for (const arg of process.argv.slice(2)) {
  for (const file of files(arg)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (HANGUL.test(line) && !/^(\/\/|\*|\/\*)/.test(t)) {
        total++;
        console.log(`${file}:${i + 1}: ${t.slice(0, 140)}`);
      }
    });
  }
}
console.log(`${total} lines`);
```

- [ ] **Step 2: Write the failing test** — `apps/web/components/layout/TabBar.i18n.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { pickMessages } from "@/lib/i18n/translate";
import { TabBar } from "./TabBar";

it("labels the tabs in Japanese and links within /ja", () => {
  const { container } = render(
    <LocaleProvider locale="ja" messages={pickMessages("ja", ["common"])}>
      <TabBar active="home" />
    </LocaleProvider>,
  );
  expect(screen.getAllByText("ホーム").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "マイページ" })[0]!.getAttribute("href")).toBe("/ja/me");
  expect(container.textContent).not.toMatch(/[가-힣]/);
});
```

- [ ] **Step 3: Run it** — FAIL (Korean labels).

- [ ] **Step 4: Localize the chrome.**
  - **Client bundle trap:** a client `TabBar` must not import `lib/guide.ts`, which builds all 42 Korean articles at module load and would ship them to every page. Create `apps/web/lib/guidePaths.ts` with `export const guideIndexPath = (category: "tarot" | "saju") => \`/guide/${category}\`;` and import that in `TabBar`. Let `lib/guide.ts` re-export it so other callers keep working. The controller confirms with `pnpm build && pnpm check:bundle` that no guide text reaches client chunks.
  - `TabBar.tsx`: add `"use client"`, `const t = useT("common")`. Build the tab list inside the component from keys (`nav.home`, `nav.story`, `nav.guide`, `nav.faq`, `nav.me`); `aria-label`s from `nav.mainMenu` and `site.homeLabel` (`{ site: t("site.name") }`). Hide the guide tab when `!localeHasGuides(locale)`; that helper comes from Task 23's `features.ts`, so until then keep the tab visible.
  - `HomeTopBar.tsx`: `"use client"`, `useT("common")`; the balance label comes from `currency.balance` with `{ paidName: t("currency.paid"), paid: String(wallet.moonlight), freeName: t("currency.free"), free: String(wallet.stardust) }`.
  - `not-found.tsx`: `async`, `getT("common")`, keys `notFound.*`.
  - `error.tsx`: `useT("common")`; add its strings under `common.error.*` in all four catalogs.
- [ ] **Step 5: Fonts** — append to `apps/web/app/globals.css`:

```css
/* P6 (spec D25): Japanese and Traditional Chinese use the reader's system fonts, so Han characters take
   their own language's shapes (the Korean webfonts would draw them the Korean way) and no extra
   unicode-range CSS ships with every page. `html:lang()` outranks next/font's variable class. */
html:lang(ja) {
  --font-body: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans CJK JP", "Noto Sans JP", sans-serif;
  --font-display: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", "Noto Serif JP", serif;
}
html:lang(zh-Hant) {
  --font-body: "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", sans-serif;
  --font-display: "Songti TC", PMingLiU, "Noto Serif CJK TC", "Noto Serif TC", serif;
}
```

  Check in `globals.css` that the body and display families read `var(--font-body)` and `var(--font-display)`. If they read the next/font variables under other names, apply the override to those names.

- [ ] **Step 6: Run** — `npx vitest run apps/web/components apps/web/app apps/web/lib/i18n && pnpm typecheck` → all PASS, `layout.test.tsx` unchanged.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts apps/web/test apps/web/components/i18n/LocaleProvider.tsx apps/web/components/layout/TabBar.tsx apps/web/components/layout/TabBar.i18n.test.tsx apps/web/components/home/HomeTopBar.tsx "apps/web/app/[lang]/not-found.tsx" "apps/web/app/[lang]/error.tsx" apps/web/app/globals.css apps/web/lib/i18n/messages scripts/i18n/hangul-lines.mjs content/i18n/review
git commit -m "feat(i18n): locale test harness, tab bar and error pages in four languages, system CJK fonts for ja and zh-hant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- vitest.config.ts apps/web/test apps/web/components/i18n/LocaleProvider.tsx apps/web/components/layout/TabBar.tsx apps/web/components/layout/TabBar.i18n.test.tsx apps/web/components/home/HomeTopBar.tsx "apps/web/app/[lang]/not-found.tsx" "apps/web/app/[lang]/error.tsx" apps/web/app/globals.css apps/web/lib/i18n/messages scripts/i18n/hangul-lines.mjs content/i18n/review
```

---

### Task 23: Language switch, persistence, suggestion band

**Files:**
- Create:
  - `apps/web/lib/i18n/{features,availability,preference,suggest,switcherCopy}.ts`
  - `apps/web/components/i18n/LangSwitch.tsx` (+ `.module.css`), `apps/web/components/i18n/LanguageSuggestion.tsx` (+ `.module.css`)
- Modify: `apps/web/components/layout/TabBar.tsx` (header chip), `apps/web/app/[lang]/me/MeView.tsx` (language row), `apps/web/components/layout/Footer.tsx` (endonym row), `apps/web/app/[lang]/layout.tsx` (mount the band)
- Test: `apps/web/lib/i18n/suggest.test.ts`, `apps/web/lib/i18n/availability.test.ts`, `apps/web/components/i18n/LangSwitch.test.tsx`, `apps/web/components/i18n/LanguageSuggestion.test.tsx`

**Interfaces:**
- Produces:
  - `features.ts`: `NOW_LOCALES` (empty until Task 35), `guideSlugsIn(locale)` ([] until Task 36), `localeHasGuides(locale)`;
  - `availability.ts`: `localeHasPath(locale, barePath)`, `fallbackPath(locale, barePath)`;
  - `preference.ts`: `readPreference()`, `savePreference(locale)`;
  - `suggest.ts`: `localeOfLanguage(tag)`, `suggestLocale(input)`;
  - `switcherCopy.ts`: `SUGGEST_COPY` (all four languages; the only strings shipped in every language);
  - `<LangSwitch variant="header" | "row" | "footer" />`, `<LanguageSuggestion />`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/i18n/suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localeOfLanguage, suggestLocale } from "./suggest";

const base = { pageLocale: "ko" as const, saved: null, publicLocales: ["ko", "en", "ja", "zh-hant"] as const, available: ["ko", "en", "ja", "zh-hant"] as const };

describe("first-visit suggestion (spec §10)", () => {
  it("maps browser languages to locales; Simplified Chinese gets none", () => {
    expect(localeOfLanguage("ja-JP")).toBe("ja");
    expect(localeOfLanguage("zh-TW")).toBe("zh-hant");
    expect(localeOfLanguage("zh-Hant-HK")).toBe("zh-hant");
    expect(localeOfLanguage("zh-HK")).toBe("zh-hant");
    expect(localeOfLanguage("zh-CN")).toBeNull();
    expect(localeOfLanguage("fr-FR")).toBeNull();
  });

  it("offers the first supported browser language when it differs from the page", () => {
    expect(suggestLocale({ ...base, browser: ["fr-FR", "ja-JP", "en"] })).toBe("ja");
    expect(suggestLocale({ ...base, browser: ["ko-KR", "ja"] })).toBeNull();
  });

  it("follows a saved choice over the browser, and offers nothing when it matches the page", () => {
    expect(suggestLocale({ ...base, pageLocale: "ja", saved: "en", browser: ["ja"] })).toBe("en");
    expect(suggestLocale({ ...base, pageLocale: "ja", saved: "ja", browser: ["en"] })).toBeNull();
  });

  it("never offers a preview locale or a locale without this page", () => {
    expect(suggestLocale({ ...base, publicLocales: ["ko", "en"], browser: ["ja"] })).toBeNull();
    expect(suggestLocale({ ...base, available: ["ko"], browser: ["en"] })).toBeNull();
  });
});
```

`apps/web/lib/i18n/availability.test.ts`:

```ts
import { expect, it } from "vitest";
import { fallbackPath, localeHasPath } from "./availability";

it("keeps Korean-only pages and untranslated content out of other locales", () => {
  expect(localeHasPath("ko", "/owner")).toBe(true);
  expect(localeHasPath("ja", "/owner")).toBe(false);
  expect(localeHasPath("ja", "/premium/match")).toBe(false);
  expect(localeHasPath("en", "/now")).toBe(false);
  expect(localeHasPath("en", "/guide/the-fool")).toBe(false);
  expect(localeHasPath("en", "/tarot/new")).toBe(true);
  expect(fallbackPath("en", "/guide/the-fool")).toBe("/");
  expect(fallbackPath("en", "/faq")).toBe("/faq");
});
```

`apps/web/components/i18n/LangSwitch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickMessages } from "@/lib/i18n/translate";
import { LangSwitch } from "./LangSwitch";
import { LocaleProvider } from "./LocaleProvider";

let pathname = "/ja/tarot/new";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
vi.stubEnv("NEXT_PUBLIC_LOCALES", "ko,en,ja,zh-hant");

const view = (variant: "header" | "row" | "footer") =>
  render(
    <LocaleProvider locale="ja" messages={pickMessages("ja", ["common"])}>
      <LangSwitch variant={variant} />
    </LocaleProvider>,
  );

describe("LangSwitch", () => {
  beforeEach(() => {
    pathname = "/ja/tarot/new";
    localStorage.clear();
  });

  it("links to the same page in every public language, endonyms in their own lang", () => {
    view("row");
    expect(screen.getByRole("link", { name: "KO" }).getAttribute("href")).toBe("/tarot/new");
    expect(screen.getByRole("link", { name: "EN" }).getAttribute("href")).toBe("/en/tarot/new");
    expect(screen.getByRole("link", { name: "JA" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "繁中" }).getAttribute("hreflang")).toBe("zh-Hant");
  });

  it("opens and closes the header menu from the chip, Escape included, and remembers the pick", () => {
    view("header");
    const chip = screen.getByRole("button", { name: /言語/ });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("link", { name: "English" }));
    expect(localStorage.getItem("starlog.lang")).toBe("en");
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("asks before leaving a reading in progress", () => {
    pathname = "/ja/tarot/draw";
    view("row");
    fireEvent.click(screen.getByRole("link", { name: "EN" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
```

`LanguageSuggestion.test.tsx`:
- set `navigator.languages` with `Object.defineProperty(navigator, "languages", { value: ["ja-JP"], configurable: true })` on a ko page (`pathname = "/faq"`);
- expect the band `このページは日本語でも読めます。` with a link to `/ja/faq`;
- clicking ×, expect the band gone and `localStorage["starlog.lang"] === "ko"`;
- a second render with that preference shows nothing.

- [ ] **Step 2: Run them** — FAIL (modules not found).

- [ ] **Step 3: Write the libraries**

`apps/web/lib/i18n/features.ts`:

```ts
import type { Locale } from "./locales";

/** 지금의 한 장 per locale (Phase B, Task 35 adds locales here once their DB is reviewed). */
export const NOW_LOCALES: readonly Locale[] = ["ko"];

/** Translated guide slugs per locale (Task 36 fills this from the guide registry). Korean has all of them. */
const GUIDE_SLUGS: Partial<Record<Locale, readonly string[]>> = {};
export const guideSlugsIn = (locale: Locale): readonly string[] | "all" => (locale === "ko" ? "all" : GUIDE_SLUGS[locale] ?? []);
export const localeHasGuides = (locale: Locale): boolean => locale === "ko" || (GUIDE_SLUGS[locale]?.length ?? 0) > 0;
```

`apps/web/lib/i18n/availability.ts`:

```ts
import { guideSlugsIn, localeHasGuides, NOW_LOCALES } from "./features";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/** Pages only Korean has in P6 (spec §4.3): owner and dev screens, premium (D15). */
const KO_ONLY = [/^\/owner(?:\/|$)/, /^\/dev(?:\/|$)/, /^\/premium(?:\/|$)/];

/** Whether the bare path (no locale prefix) exists in `locale` in this build. */
export function localeHasPath(locale: Locale, path: string): boolean {
  if (locale === DEFAULT_LOCALE) return true;
  if (KO_ONLY.some((re) => re.test(path))) return false;
  if (/^\/now(?:\/|$)/.test(path)) return NOW_LOCALES.includes(locale);
  if (/^\/guide\/(?:tarot|saju)$/.test(path)) return localeHasGuides(locale);
  const article = /^\/guide\/([^/]+)$/.exec(path);
  if (article) {
    const slugs = guideSlugsIn(locale);
    return slugs === "all" || slugs.includes(article[1]!);
  }
  return true;
}

/** The nearest page that exists in `locale`: the path itself, the guide index, or the home. */
export function fallbackPath(locale: Locale, path: string): string {
  if (localeHasPath(locale, path)) return path;
  if (path.startsWith("/guide/") && localeHasPath(locale, "/guide/tarot")) return "/guide/tarot";
  return "/";
}
```

`apps/web/lib/i18n/preference.ts`:

```ts
import { isLocale, type Locale } from "./locales";

const KEY = "starlog.lang";
const COOKIE = "sl_lang";
const YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The reader's explicit language choice: localStorage first, the cookie second (spec §10). */
export function readPreference(): Locale | null {
  try {
    const stored = localStorage.getItem(KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage blocked: fall back to the cookie
  }
  const match = /(?:^|;\s*)sl_lang=([^;]+)/.exec(typeof document === "undefined" ? "" : document.cookie);
  return match && isLocale(match[1]) ? match[1] : null;
}

/** Remembers a choice for a year. The cookie holds only the code; the server never redirects on it. */
export function savePreference(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // storage blocked: the cookie still remembers
  }
  document.cookie = `${COOKIE}=${locale}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax; Secure`;
}
```

`apps/web/lib/i18n/suggest.ts`:

```ts
import type { Locale } from "./locales";

/** The supported locale a browser language tag asks for; Simplified and unspecified Chinese get none. */
export function localeOfLanguage(tag: string): Locale | null {
  const t = tag.toLowerCase();
  if (t.startsWith("ko")) return "ko";
  if (t.startsWith("en")) return "en";
  if (t.startsWith("ja")) return "ja";
  if (/^zh-(?:hant|tw|hk|mo)\b/.test(t)) return "zh-hant";
  return null;
}

export interface SuggestInput {
  pageLocale: Locale;
  saved: Locale | null;
  browser: readonly string[];
  publicLocales: readonly Locale[];
  /** locales in which this page exists */
  available: readonly Locale[];
}

/** The locale to offer in the band, or null. Never a redirect (spec §10). */
export function suggestLocale({ pageLocale, saved, browser, publicLocales, available }: SuggestInput): Locale | null {
  const offer = (locale: Locale | null) => (locale && locale !== pageLocale && publicLocales.includes(locale) && available.includes(locale) ? locale : null);
  if (saved) return offer(saved);
  for (const tag of browser) {
    const locale = localeOfLanguage(tag);
    if (locale) return offer(locale);
  }
  return null;
}
```

`apps/web/lib/i18n/switcherCopy.ts`:

```ts
import type { Locale } from "./locales";

/** The band speaks the language it offers, so these ship in all four languages (a few hundred bytes). */
export const SUGGEST_COPY: Readonly<Record<Locale, { text: string; go: string; dismiss: string; restart: string; restartGo: string; cancel: string }>> = {
  ko: { text: "이 페이지는 한국어로도 볼 수 있어요.", go: "한국어로 보기", dismiss: "닫기", restart: "언어를 바꾸면 이 질문을 처음부터 다시 해요.", restartGo: "바꾸기", cancel: "그대로 두기" },
  en: { text: "This page is also available in English.", go: "Switch to English", dismiss: "Dismiss", restart: "Changing the language starts this question over.", restartGo: "Switch", cancel: "Stay" },
  ja: { text: "このページは日本語でも読めます。", go: "日本語で見る", dismiss: "閉じる", restart: "言語を変えると、この質問は最初からやり直しになります。", restartGo: "変える", cancel: "このまま" },
  "zh-hant": { text: "這個頁面也有繁體中文版。", go: "切換成繁體中文", dismiss: "關閉", restart: "切換語言後，這個問題要從頭開始。", restartGo: "切換", cancel: "先不要" },
};
```

  The restart dialog speaks the **target** language (the reader picked it), so its copy lives here too.

- [ ] **Step 4: Write the components.**
  - `LangSwitch` (client):
    - Items come from `publicLocales()`, each linking to `localePath(l, fallbackPath(l, splitLocale(usePathname()).path))`, with `lang={LOCALE_INFO[l].tag}`, `hrefLang` the same, and `aria-current="true"` on the page's locale. Labels: `chip` for `row` and the header chip, `endonym` for the header menu items and `footer`.
    - On click: `savePreference(l)`. If the bare path matches `^/(?:tarot/(?:draw|result)|saju/chart|pay/)`, prevent the navigation and open the existing `Modal` with `SUGGEST_COPY[l].restart`. Confirm runs `clearFlow()` and `router.push(localePath(l, startOf(bare)))`, where `startOf` maps `/tarot/*` → `/tarot/new`, `/saju/*` → `/saju/new`, else `/`; use the plain `next/navigation` router here, not `useLocaleRouter`.
    - `header`: a `<button aria-expanded aria-controls aria-label={t("language.current", { name: LOCALE_INFO[locale].endonym })}>` with a 16px globe SVG, the chip text and a caret. It toggles a `<ul id>` of links. Escape and outside clicks close it and focus returns to the button.
    - Styles reuse the TabBar pill tokens (`.pill`, translucent); 44px targets; visible text ≥13px; motion only under `prefers-reduced-motion: no-preference`.
  - `TabBar`: render `<LangSwitch variant="header" />` after the pills `<nav>` inside `.top` (desktop header only; phones keep the bottom bar unchanged, spec D21).
  - `MeView`: a "language" row at the top (`t("language.label")` from `common`) with `<LangSwitch variant="row" />`.
  - `Footer`: `<LangSwitch variant="footer" />` as its last row.
  - `LanguageSuggestion` (client), mounted in `app/[lang]/layout.tsx` after `children`:
    - on mount, compute `suggestLocale({ pageLocale, saved: readPreference(), browser: navigator.languages, publicLocales: publicLocales(), available: LOCALES.filter((l) => localeHasPath(l, bare)) })`;
    - render nothing when null; otherwise a bottom band with `SUGGEST_COPY[s].text`, a link `SUGGEST_COPY[s].go` (saves `s`) and a × button `SUGGEST_COPY[s].dismiss` (saves the page locale, hides);
    - the band has `lang={LOCALE_INFO[s].tag}` and `role="region"` with an `aria-label` in its own language.

- [ ] **Step 5: Run** — `npx vitest run apps/web/lib/i18n apps/web/components/i18n apps/web/components/layout "apps/web/app/[lang]/me" && pnpm typecheck` → PASS; existing tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n apps/web/components/i18n apps/web/components/layout/TabBar.tsx apps/web/components/layout/Footer.tsx "apps/web/app/[lang]/me/MeView.tsx" "apps/web/app/[lang]/layout.tsx" apps/web/lib/i18n/messages content/i18n/review
git commit -m "feat(i18n): language chip in the desktop header, KO·EN·JA·繁中 row in 내 정보 and the footer, remembered choice, first-visit suggestion band" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/i18n apps/web/components/i18n apps/web/components/layout/TabBar.tsx apps/web/components/layout/Footer.tsx "apps/web/app/[lang]/me/MeView.tsx" "apps/web/app/[lang]/layout.tsx" content/i18n/review
```

---

### Task 24: SEO — metadata alternates, sitemap, JSON-LD, llms.txt

**Files:**
- Modify:
  - `apps/web/lib/seo.ts`: `pageMetadata(input, locale = "ko", locales = publicLocales())`, `alternatesFor`, `X_DEFAULT_LOCALE`, `sitemapEntries` per locale;
  - `apps/web/app/sitemap.ts`, `apps/web/lib/jsonld.ts` (`inLanguage`, names per locale), `apps/web/lib/llms.ts` (per locale);
  - `apps/web/app/[lang]/layout.tsx`: `generateMetadata` with localized title template, description, `og:locale`, preview noindex;
  - every indexable page's `metadata` → `generateMetadata` (titles and descriptions in the `seo` namespace);
  - `apps/web/app/global-not-found.tsx` (public locales' home links).
- Create: `apps/web/app/[lang]/llms.txt/route.ts` (non-Korean public locales), `apps/web/lib/i18n/messages/*/seo.json`, `content/i18n/{en,ja,zh-hant}/info/llms.json` (service facts)
- Test: `apps/web/lib/seo.i18n.test.ts`; `lib/seo.test.ts`, `lib/jsonld.test.tsx`, `lib/llms.test.ts`, `lib/seo.pages.test.ts` keep their expectations (harness-only changes allowed)

**Interfaces:**
- Produces:
  - `alternatesFor(path, locales): Record<string, string> | undefined`: undefined while fewer than two public locales have the page, so Korean output does not change before launch;
  - `pageMetadata(input, locale, locales)`;
  - `X_DEFAULT_LOCALE = "ko"` (spec D23; one constant to flip).

- [ ] **Step 1: Write the failing test** — `apps/web/lib/seo.i18n.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import { alternatesFor, pageMetadata, sitemapEntries } from "./seo";

const url = (path: string) => new URL(path, SITE.url).toString();

describe("hreflang and canonicals per locale (spec §11)", () => {
  it("adds nothing while Korean is the only public locale", () => {
    expect(alternatesFor("/faq", ["ko"])).toBeUndefined();
    expect(pageMetadata({ description: "d", path: "/faq" }, "ko", ["ko"]).alternates).not.toHaveProperty("languages");
  });

  it("lists every public locale that has the page, itself included, and x-default to Korean", () => {
    expect(alternatesFor("/faq", ["ko", "en", "ja"])).toEqual({ ko: url("/faq"), en: url("/en/faq"), ja: url("/ja/faq"), "x-default": url("/faq") });
    expect(alternatesFor("/guide/the-fool", ["ko", "ja"])).toBeUndefined();
  });

  it("gives a Japanese page its own canonical, og:locale and the shared alternates", () => {
    const m = pageMetadata({ title: "t", description: "d", path: "/faq" }, "ja", ["ko", "ja"]);
    expect(m.alternates?.canonical).toBe("/ja/faq");
    expect(m.openGraph?.locale).toBe("ja_JP");
    expect(m.alternates?.languages).toEqual(alternatesFor("/faq", ["ko", "ja"]));
  });

  it("puts every locale's URLs in the sitemap, with their alternates", () => {
    const entries = sitemapEntries(SITE, ["ko", "en"]);
    expect(entries.some((e) => e.path === "/en/faq")).toBe(true);
    expect(entries.some((e) => e.path === "/en/guide/the-fool")).toBe(false);
    expect(entries.find((e) => e.path === "/en/faq")?.alternates).toEqual(alternatesFor("/faq", ["ko", "en"]));
  });
});
```

- [ ] **Step 2: Run it** — FAIL.

- [ ] **Step 3: Implement.**
  - `seo.ts`:
    - `alternatesFor` as the test describes, using `localeHasPath`, `localePath`, `LOCALE_INFO[l].tag` keys and `new URL(…, SITE.url)`;
    - `pageMetadata` keeps its Korean output exactly when `alternatesFor` is undefined. Otherwise it adds `alternates.languages`, sets `canonical` to `localePath(locale, path)` and the OG `url` to the same, `openGraph.locale` to `LOCALE_INFO[locale].og`, and `alternateLocale` to the other locales' `og`;
    - `sitemapEntries(site, locales)` returns, for each public locale where `localeHasPath`, the entry with `path: localePath(l, path)` and `alternates`. `SitemapEntry` gains `alternates?: Record<string, string>`;
    - `SITEMAP_PATHS` stays Korean-only, so `robots.ts`, `rss.ts` and `indexnow` keep working.
  - `app/sitemap.ts` passes `alternates: { languages: entry.alternates }` when present.
  - `jsonld.ts`: `websiteJsonLd`, the `WebPage`/`Article`/`FAQPage` builders take a `locale` (default `"ko"`). Add `inLanguage: LOCALE_INFO[locale].tag` only when more than one locale is public, so Korean output stays put before launch. `organizationJsonLd`'s `availableLanguage` lists the public locales' English names when more than one is public.
  - `[lang]/layout.tsx`:
    - `generateMetadata()` reads `currentLocale()`, takes `title.default`, `title.template` and `description` from `seo.home.*`, sets `openGraph.locale`;
    - adds `robots: { index: false, follow: false }` when the locale is a preview locale;
    - for ko returns exactly today's `metadata` object.
  - Pages: each indexable page's `metadata` becomes `generateMetadata()` with `pageMetadata({ title: t("…title"), description: t("…description"), path }, locale)`. Korean `seo.json` values are copied from today's literals. Pages that are `NOINDEX` keep `robots: NOINDEX` in every locale.
  - `llms.ts`: `llmsTxt(site, locale = "ko")` with the facts from `content/i18n/<l>/info/llms.json` (the Korean array as today for ko). `/llms.txt` (ko) ends with an `## Other languages` list of the public locales' `/xx/llms.txt` when there are any. `app/[lang]/llms.txt/route.ts` has `generateStaticParams` = public non-Korean locales, `dynamic = "force-static"`, and returns `llmsTxt(SITE, lang)`.
  - `global-not-found.tsx`: a home link per public locale (`/`, `/en`, …), each with its `lang`.
- [ ] **Step 4: Run** — `npx vitest run apps/web/lib apps/web/app && pnpm typecheck` → PASS. The Korean SEO tests keep their expectations; only harness edits are allowed, listed in the commit.
- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/seo.ts apps/web/lib/seo.i18n.test.ts apps/web/app apps/web/lib/jsonld.ts apps/web/lib/llms.ts apps/web/lib/i18n/messages content/i18n content/i18n/review
git commit -m "feat(seo): hreflang with x-default, per-locale canonicals and og:locale, sitemap alternates, inLanguage, llms.txt per language" -m "Korean output unchanged while Korean is the only public locale. Harness-only test edits: <list>." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/seo.ts apps/web/lib/seo.i18n.test.ts apps/web/app apps/web/lib/jsonld.ts apps/web/lib/llms.ts apps/web/lib/i18n/messages content/i18n
```

---

### Task 25: API locale plumbing, crisis, chapters, route dispatch

**Files:**
- Create: `apps/web/lib/api/locale.ts`, `apps/web/lib/i18n/messages/*/api.json`
- Modify:
  - `apps/web/lib/reading/api.ts`: send `X-Starlog-Locale`;
  - `apps/web/lib/api/http.ts`: crisis union, error copy per locale;
  - the generation routes: tarot teaser, reading, daily and follow-up; saju teaser and reading; `bonds/today-card`;
  - `apps/web/lib/bonds/todayLine.ts`: locale routing and cache key;
  - `apps/web/lib/storage/chapters.ts`, `apps/web/lib/storage/daily.ts`, `apps/web/lib/reading/types.ts`: `locale?`;
  - `apps/web/lib/api/inputs.ts` (abroad place ids behind the flag), `apps/web/lib/sajuForm.ts` (`toSajuInput` for abroad places).
- Test: `apps/web/app/api/locale.test.ts`; every existing API test stays green unchanged.

**Interfaces:**
- Produces:
  - `requestLocale(req: Request): Locale` (header `X-Starlog-Locale`, validated, default `ko`);
  - `localeHeader(override?)` on the client (from `document.documentElement.lang`, or a chapter's locale for follow-ups);
  - `errorResponse(code, locale?)` and `crisisResponse(locale, …texts)` with per-locale copy;
  - `StoredChapter.locale?: Locale` and `DailyResult.locale?: Locale` (absent means Korean);
  - abroad birthplaces accepted when `NEXT_PUBLIC_SAJU_ABROAD === "1"`.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/locale.test.ts`. Use the request helpers the existing `routes.test.ts` uses, with `STARLOG_AI=mock`:
  - A tarot reading request with `X-Starlog-Locale: ja` answers 200, its text has no Hangul, and `cards[0].heading` contains the Japanese position label.
  - The same request without the header answers exactly like the existing Korean test.
  - A saju teaser with header `en` and a `jp-tokyo` birthplace, with `NEXT_PUBLIC_SAJU_ABROAD=1` (`vi.stubEnv`), answers 200; with the flag off it answers 400.
  - A tarot teaser whose note says `死にたい`, with no header (Korean page), answers with the care response, and its message is Korean.
  - The same with header `ja` answers with `crisisLead("ja")`.
  - A beta-limit error with header `zh-hant` carries Chinese copy and the same error code as the Korean one.
- [ ] **Step 2: Run it** — FAIL.
- [ ] **Step 3: Implement.**
  - `locale.ts`: `export function requestLocale(req: Request): Locale { const v = req.headers.get("x-starlog-locale")?.trim(); return isLocale(v) ? v : "ko"; }`.
  - `reading/api.ts`: every `fetch` the helpers make adds `"X-Starlog-Locale": override ?? localeOfTag(document.documentElement.lang)`, where `localeOfTag` maps `zh-Hant` → `zh-hant` and anything unknown → `ko`. Follow-up calls pass the chapter's `locale`.
  - `http.ts`:
    - replace the `CRISIS` test with `isCrisisAnyLanguage`; Korean behaviour stays, and other languages are now also caught (spec D12);
    - move the Korean error strings into `messages/ko/api.json` exactly, then take them through `translator(locale, "api")`;
    - `errorResponse` and `crisisResponse` take the locale; every call site passes `requestLocale(req)`.
  - Routes: `const locale = requestLocale(req);` then `locale === "ko" ? generateX(…) : generateXIntl(…, locale)`. Spend, limits, tokens and logs stay as they are, plus `locale` in the log fields. The follow-up route picks `generateTarotFollowUpIntl` or `generateSajuFollowUpIntl` the same way.
  - `todayLine.ts`: for `locale !== "ko"` use Task 19's prompt and validator, and key the stored line `${existingKey}:${locale}` (Korean keys unchanged). The per-owner daily count is shared across locales (spec §7.1).
  - Storage: `saveChapter` and `saveDaily` record `locale` when it is not Korean, so Korean records stay identical.
  - Saju input: `BirthBody.placeId` accepts `ABROAD_PLACES` ids when `process.env.NEXT_PUBLIC_SAJU_ABROAD === "1"`. `toSajuInput` maps an abroad place to `{ name: place.names.en, longitude, timeZone }`.
- [ ] **Step 4: Run** — `npx vitest run apps/web/app/api apps/web/lib && pnpm typecheck` → PASS, existing API tests unchanged.
- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api apps/web/lib/reading apps/web/lib/storage apps/web/lib/bonds/todayLine.ts apps/web/lib/sajuForm.ts apps/web/app/api apps/web/lib/i18n/messages content/i18n/review
git commit -m "feat(i18n): readings in the request's language (X-Starlog-Locale), crisis words in every language, locale on saved chapters, births abroad behind a flag" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/lib/api apps/web/lib/reading apps/web/lib/storage apps/web/lib/bonds/todayLine.ts apps/web/lib/sajuForm.ts apps/web/app/api apps/web/lib/i18n/messages content/i18n/review
```

> The flag is `NEXT_PUBLIC_SAJU_ABROAD`: public because the form must show the places; the server reads the same build-time value (spec §8, §12.2).

---

### Task 26: Extract — home and the tarot question flow

**Files:**
- Modify:
  - `apps/web/app/[lang]/page.tsx`, `apps/web/components/home/{HomeEntries,HomeCheckin}.tsx`;
  - `apps/web/app/[lang]/tarot/new/{page,QuestionBuilder}.tsx`, `apps/web/app/[lang]/tarot/new/situation/{page,SituationPicker}.tsx`;
  - `apps/web/lib/question.ts` (`composeQuestionIn`), `apps/web/lib/flowState.ts` (localized condition values), `apps/web/lib/notePlaceholder.ts`.
- Create: `messages/*/home.json`, `messages/*/tarot.json`
- Test: `apps/web/lib/question.i18n.test.ts`, `apps/web/app/[lang]/tarot/new/QuestionBuilder.i18n.test.tsx`

**Interfaces:**
- Produces:
  - `composeQuestionIn(locale, parts): string`. For ko it is today's `composeQuestion` (unchanged). For en, ja and zh-hant, a chip topic gives `topicQuestion(locale, who, topic)` with `{when}` filled by `whenLabel` (or removed when no time was picked). A typed topic gives the typed text with a final `?` / `？` added when missing.
  - Condition chips send `{ label, value }` in the page's language. The unsure option is one of `unsureWords(locale)`.

- [ ] **Step 1: Failing tests.**
  - `question.i18n.test.ts`:
    - `composeQuestionIn("en", { who: "me", topic: <love>, when: "week" })` equals `topicQuestion("en","me",love)` with `{when}` → `this week`;
    - ja without a time has no leftover `{when}` and no stray `、`;
    - a typed zh-hant topic `換工作` gets `？`;
    - Korean cases equal `composeQuestion` for the same inputs.
  - `QuestionBuilder.i18n.test.tsx`: rendered in `en`, the who and topic chips and the question sentence are English, and there is no Hangul.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per the extraction recipe:
  - chips use `topicLabel`, `conditionText` and `whenLabel`;
  - the home's `/now` quick card shows only when `NOW_LOCALES.includes(locale)`;
  - the home guide row shows only when `localeHasGuides(locale)`;
  - note placeholders become `tarot.notePlaceholder.*`.
- [ ] **Step 4: Run** — `npx vitest run "apps/web/app/[lang]/tarot/new" apps/web/components/home apps/web/lib/question.i18n.test.ts apps/web/lib/question.test.ts apps/web/lib/flowState.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** (paths above, message `feat(i18n): home and the tarot question flow in en, ja and zh-hant`).

---

### Task 27: Extract — tarot draw, result, chapter, reading components

**Files:**
- Modify:
  - `apps/web/app/[lang]/tarot/draw/*`, `apps/web/app/[lang]/tarot/result/*`, `apps/web/app/[lang]/chapter/[id]/*`;
  - `apps/web/components/tarot/*` (TarotCard names via `cardNameIn`, SpreadRow position labels via `positionLabel`, UnlockSheet, LockedToc, FollowUp, Feedback, GeneratingState, CopyButton, SharePreview);
  - `apps/web/components/reading/*`, `apps/web/lib/reading/{errors,progress}.ts`.
- Create: `messages/*/chapter.json`; additions to `tarot.json`
- Test: `apps/web/app/[lang]/chapter/[id]/LocalChapter.i18n.test.tsx`, `apps/web/components/tarot/TarotCard.i18n.test.tsx`

**Interfaces:**
- A saved chapter shows in its own `locale` (spec D13). The page chrome follows the page's locale.
- The follow-up box sends the chapter's locale header.
- If the chapter's locale differs from the page's, a one-line note `chapter.otherLanguage` names the chapter's language by its endonym.

- [ ] **Step 1: Failing tests:**
  - a `ja` chapter rendered on an `en` page shows English chrome, the Japanese reading text, and the note;
  - `TarotCard` in `zh-hant` shows `聖杯三` for `cups-03`.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement per the recipe. Generation progress copy (`progress.ts`) moves to `tarot.progress.*`.
- [ ] **Step 4: Run** — the touched folders' tests and the existing `DrawStage`, `LocalChapter` and `reading` tests unchanged → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** (`feat(i18n): tarot drawing, results and saved chapters in four languages`).

---

### Task 28: Extract — saju flow and births abroad

**Files:**
- Modify:
  - `apps/web/app/[lang]/saju/new/page.tsx`, `apps/web/app/[lang]/saju/chart/*`;
  - `apps/web/components/saju/*` (SajuForm place picker, ChartTable labels via `sajuGlossary`, ElementBar, ChartCriteria, InputLine);
  - `apps/web/lib/sajuForm.ts` (place labels per locale, abroad places, errors by code), `apps/web/lib/sajuCriteria.ts`, `apps/web/lib/sajuPrologue.ts` (titles from `reading.saju.*` for non-ko).
- Create: `messages/*/saju.json`
- Test: `apps/web/components/saju/SajuForm.i18n.test.tsx`, `apps/web/lib/sajuForm.i18n.test.ts`

**Interfaces:**
- With `NEXT_PUBLIC_SAJU_ABROAD=1` the place picker has a country step: 대한민국 / Japan / Taiwan / Hong Kong, each named in the page's language. The cities follow, with names from `ABROAD_PLACES[].names[locale]`.
- Picking a place abroad hides the lunar option and shows `saju.solarOnly`.
- Without the flag the picker is exactly today's Korean list.
- `SajuError` codes map to `saju.errors.<code>`, the new `UNSUPPORTED_CALENDAR` included. Chart warnings map by `code` to `saju.warnings.<code>`; Korean keeps the engine's own message text.

- [ ] **Step 1: Failing tests:**
  - in `ja` with the flag on, the picker lists 東京 and hides 陰暦 once Tokyo is chosen;
  - with the flag off, the place list equals `BIRTH_PLACES`;
  - `toSajuInput` for `tw-taipei` gives `timeZone: "Asia/Taipei"`.
- [ ] **Step 2–4:** run (FAIL), implement per the recipe, run (PASS) together with the existing `sajuForm`, `sajuFlow` and `BirthFields` tests unchanged.
- [ ] **Step 5: Commit** (`feat(i18n): saju input and chart in four languages; births in Japan, Taiwan and Hong Kong behind NEXT_PUBLIC_SAJU_ABROAD`).

---

### Task 29: Extract — today, story, me, bonds, ranking, lucky, invites

**Files:**
- Modify:
  - `apps/web/app/[lang]/{today,story,me,bonds,b,invite,ranking,lucky}/**`;
  - `apps/web/components/bonds/*` (sign names via `signName`), `apps/web/components/ui/CrisisContacts.tsx` (`HOTLINES[locale]`, `crisisLead`);
  - `apps/web/lib/bonds/{text,client,bondCardText}.ts`, `apps/web/lib/storage/betaUsage.ts` (copy only).
- Create: `messages/*/{today,story,me,bonds}.json`
- Test: `apps/web/app/[lang]/today/TodayView.i18n.test.tsx`, `apps/web/app/[lang]/ranking/[sign]/RankingView.i18n.test.tsx`, `apps/web/components/ui/CrisisContacts.i18n.test.tsx`

**Interfaces:**
- 오늘의 한 장 in another locale: the stored reading stays in the language it was read in. When it differs, `today.otherLanguage` says so; the card name and screen chrome follow the page.
- The reset line is `today.resets` with `{ kst: "00:00", local: clockIn(Intl.DateTimeFormat().resolvedOptions().timeZone, nextKstMidnight(Date.now())) }`, shown only outside Korean.
- `CrisisContacts` renders `HOTLINES[locale]` with `tel:` links (the web directory as a link). Korean renders exactly as today.
- Constellation and ranking pages use `signName(locale, id)`. Lucky-number copy never names a lottery (spec §6.7).

- [ ] **Steps 1–5:**
  - Tests:
    - `TodayView` in `en` with a stored `ja` daily shows the note and the reset line;
    - `RankingView` in `zh-hant` shows `牡羊座`;
    - `CrisisContacts` in `ja` lists `0120-279-338` and `109` and Korean renders unchanged.
  - Implement per the recipe; run the folders' tests and the existing bonds tests unchanged.
  - Commit `feat(i18n): today, my records, me, constellation bonds, rankings and lucky numbers in four languages`.

---

### Task 30: Info pages, pricing, policies, footer, login and pay chrome, premium notices

**Files:**
- Create:
  - `content/i18n/{en,ja,zh-hant}/info/{about,how,help,faq,pricing}.json`, `content/i18n/{en,ja,zh-hant}/legal/{terms,privacy,refund}.json`
  - `apps/web/lib/i18n/content.ts`, `apps/web/components/legal/LegalDocument.tsx`
  - `scripts/i18n/units/{info,legal}.ts`
- Modify:
  - `apps/web/app/[lang]/{about,how,help,faq,pricing,terms,privacy,refund}/page.tsx`;
  - `apps/web/lib/{faq,helpGuide,infoPages,legal}.ts` (Korean stays in place; loaders pick per locale);
  - `apps/web/components/info/InfoPage.tsx`, `apps/web/components/layout/Footer.tsx` (labels and links per locale; business block `data-i18n-allow="ko"`);
  - `apps/web/app/[lang]/login/*`, `apps/web/app/[lang]/pay/*` (P4 chrome);
  - the pricing page's premium rows: Korean only in other locales, linking to the Korean landing;
  - `scripts/i18n/draft.test.ts` (`info` and `legal` jobs).
- Create: `messages/*/{info,pricing,legal,account,pay}.json`
- Test: `apps/web/components/legal/LegalDocument.test.tsx`, `apps/web/app/[lang]/faq/faq.i18n.test.tsx`, `apps/web/app/[lang]/pricing/pricing.i18n.test.tsx`

**Interfaces:**
- `infoContent(locale, "faq" | "help" | "about" | "how" | "pricing")` and `legalContent(locale, "terms" | "privacy" | "refund")`. Korean returns today's modules; other locales return the JSON. Same TypeScript types: `FaqGroup[]`, the help sections, the policy section list.
- `LegalDocument` renders a translated policy with, at the top in its language, `legal.referenceNotice` ("This translation is for reference; the Korean original governs.") and a link to the Korean page (`hrefLang="ko"`). 시행일 comes from `formatIsoDate(locale, LEGAL_EFFECTIVE_DATE)`.
- FAQ JSON-LD per locale uses that locale's questions and `hotlineLines(locale)`.
- Login (P4): a note `account.kakaoNote` outside Korean: Kakao login works with Kakao accounts created anywhere, and needs one. Pay pages (P4): copy only here; amounts and notices are Task 31.

- [ ] **Step 1: Failing tests:**
  - `LegalDocument` in `en` shows the reference notice and a link to `/terms` with `hrefLang="ko"`;
  - the FAQ page in `ja` renders Japanese questions, and its JSON-LD `inLanguage` is `ja` when two locales are public;
  - the pricing page in `zh-hant` shows `₩2,900` (or `￦2,900`) and marks each premium row as Korean only.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - Draft the JSON with `I18N_JOB=info:<l>:faq` and the like (add the `info` and `legal` jobs to `draft.test.ts`: source = the Korean module's exported data, `instructions` = "long-form help content" / "a legal policy: translate precisely, keep every obligation and number; do not soften or add").
  - Register the `info` and `legal` unit kinds (one unit per document, Korean = `JSON.stringify` of the Korean data, phase `A`).
  - Run `pnpm i18n:ledger` for each locale.
- [ ] **Step 4: Run** the touched tests and the existing `InfoPages`, `LegalPages`, `PolicyContent`, `legal`, `pricing` and `Footer` tests unchanged (harness-only edits allowed) → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** (`feat(i18n): about, how, help, FAQ, pricing and reference translations of the policies; footer, login and pay chrome in four languages`).

---

### Task 31: Payments and money formatting

**Files:**
- Modify:
  - every UI use of `won(` outside `lib/config.ts`, `lib/pricing.ts` and the Korean-only legal text (`grep -rn "won(" apps/web/app apps/web/components apps/web/lib`) → `formatKrw(locale, …)`;
  - `apps/web/app/[lang]/pay/checkout/CheckoutView.tsx` and `apps/web/components/tarot/UnlockSheet.tsx`: notices;
  - `apps/web/lib/reading/errors.ts`: reset time per locale;
  - `apps/web/.env.example`: `NEXT_PUBLIC_INTL_CARDS`, `NEXT_PUBLIC_SAJU_ABROAD`, `NEXT_PUBLIC_LOCALES`, `NEXT_PUBLIC_LOCALES_PREVIEW`, names only.
- Test: `apps/web/app/[lang]/pay/checkout/CheckoutView.i18n.test.tsx`, `apps/web/lib/reading/errors.i18n.test.ts`

**Interfaces:**
- Outside Korean, before the Toss widget, the checkout shows `pay.krwNote` ("charged in Korean won; your card issuer converts") and `pay.windowKorean` ("the payment window opens in Korean").
- While `NEXT_PUBLIC_INTL_CARDS !== "1"`, it also shows `pay.koreanCardsOnly`. Korean checkout is unchanged.
- Server-decided amounts stay as they are (P4 §5.4); only their display changes.

- [ ] **Steps 1–5:**
  - Failing tests:
    - `CheckoutView` in `en` shows the three notices with the flag off and two with it on;
    - in `ko` it shows none;
    - `describeApiError` for `BETA_LIMIT` in `ja` names 00:00 KST and the reader's local time.
  - Implement; run with P4's `CheckoutView`, `UnlockSheet` and `errors` tests unchanged.
  - Commit `feat(i18n): KRW shown per language with conversion and card notices; reset times on the reader's clock`.

---

### Task 32: Share buttons and OG images per locale

**Files:**
- Modify:
  - `apps/web/lib/og/googleFont.ts`: `OgFontFamily` adds `"Noto Sans JP" | "Noto Sans TC" | "Noto Serif JP" | "Noto Serif TC"`;
  - `apps/web/app/api/og/*/route.tsx`: `?lang=`, text from messages, the family per locale;
  - `apps/web/app/[lang]/opengraph-image.tsx`: the site image per locale;
  - `apps/web/components/ui/ShareButton.tsx`, `ShareImageButton.tsx`, `apps/web/lib/kakaoShare.ts`.
- Test: `apps/web/lib/og/og.i18n.test.ts`, `apps/web/components/ui/ShareButton.i18n.test.tsx`

**Interfaces:**
- `ogFontFor(locale, kind)` picks the family: ko keeps Gowun Batang and Noto Sans KR; ja Noto Serif JP and Noto Sans JP; zh-hant Noto Serif TC and Noto Sans TC; en keeps the Korean families, whose Latin glyphs today's images already use.
- Share links built for other locales append `?lang=<locale>` to OG URLs.
- Share buttons:
  - Kakao only in `ko`;
  - `ja` and `zh-hant`: LINE (`https://social-plugins.line.me/lineit/share?url=<encoded>`), the Web Share API when available, and copy link;
  - `en`: Web Share and copy link.

- [ ] **Steps 1–5:**
  - Failing tests:
    - `fontCssUrl("Noto Sans JP", 700, "星")` builds the Google Fonts URL with `family=Noto+Sans+JP`;
    - the daily OG route with `lang=zh-hant` asks for Noto Sans TC (fetch mocked);
    - `ShareButton` in `ja` has a LINE link and no Kakao button, and in `ko` renders unchanged.
  - Implement; run the existing OG and share tests unchanged.
  - Commit `feat(i18n): share images in each language's fonts; LINE for ja and zh-hant, Kakao for Korean`.

---

### Task 33: Eval, smoke and length calibration per locale (controller runs the API)

**Files:**
- Create:
  - `content/eval/i18n/{en,ja,zh-hant}/golden.json` (14 inputs each, spec §7.10)
  - `content/eval/i18n/judge-rubric.md`
  - `content/samples/i18n/{en,ja,zh-hant}/{tarot-contact,saju-prologue}.json`: reviewed translations of the Korean gold samples, used for calibration
- Modify:
  - `scripts/ai-smoke.test.ts`: `SMOKE_LOCALE` runs the intl generators with intl validators and records `locale`;
  - `apps/web/lib/ai/locale/index.ts`: calibrated `lengthFactor` and `factOverlap`.
- Test: `apps/web/lib/ai/locale/calibration.test.ts`

**Interfaces:**
- `calibration.test.ts` loads each locale's translated gold samples and the Korean originals. It asserts `PROFILES[l].lengthFactor` is within ±15% of `mean(measure(l, text) / charCount(ko))` over the samples' long fields. The calibrated values pass it.

- [ ] **Step 1:** write `golden.json` per locale:
  - 6 tarot topics (love, contact, work, money, choice, self), each with a chip set and a note in that language;
  - 4 saju charts: Korea-born time known, Korea-born time unknown, Tokyo-born, Taipei-born;
  - 1 daily, 1 follow-up question;
  - 2 crisis inputs in that language, whose expected outcome is the care response.
- [ ] **Step 2:** translate the two Korean gold samples per locale and run `pnpm i18n:ledger`. They must be reviewed before Step 3 counts.
- [ ] **Step 3:** write `calibration.test.ts`, run it (FAIL with the initial factors), and set the factors to the measured means → PASS.
- [ ] **Step 4 (controller, real API):** `SMOKE_RUNS=3 SMOKE_LOCALE=ja pnpm ai:smoke` per locale. Record, per locale and kind:
  - validation pass rate, regeneration rate, mean and median USD per reading, latency;
  - the AI-tell soft-hit rate.
  - Gates:
    - pass rate ≥ the Korean baseline − 5 points;
    - median cost ≤ 1.3 × Korean (spec §7.8);
    - no Hangul, no model names.
- [ ] **Step 5:** blind review. Send 10 outputs per locale with `judge-rubric.md` to the owner's native reviewers. Every failure they mark becomes a new validator case (Task 16 or 17 tests) or a style-block line (Task 15), never a silent prompt tweak.
- [ ] **Step 6: Commit** the content, the smoke changes and the calibrated profiles (`test(ai): golden inputs, smoke per language and calibrated length factors`). Paste the smoke table in the commit message.

---

### Task 34: Link and literal lint, e2e i18n spec

**Files:**
- Create: `apps/web/lib/i18n/lint.test.ts`, `apps/web/e2e/i18n.spec.ts`
- Modify: `apps/web/playwright.config.ts` (webServer env `NEXT_PUBLIC_LOCALES_PREVIEW=en,ja,zh-hant`)

**Interfaces:**
- `lint.test.ts` fails on:
  - an `import … from "next/link"` outside `components/i18n/LocaleLink.tsx`;
  - `<a href="/…">` to an internal page;
  - `useRouter` imported from `next/navigation` in app code (use `useLocaleRouter`);
  - Hangul in string literals or JSX text under `apps/web/app` and `apps/web/components`, outside:
    - comments, tests and `messages/ko`;
    - `app/[lang]/{owner,dev}/**` (Korean-only);
    - `lib/**` Korean data modules (faq, guide, legal, help, prompts, validators, mocks, `config.ts`);
    - `data-i18n-allow="ko"` blocks;
    - an explicit allowlist with a reason per line.
- `i18n.spec.ts` (Playwright, controller runs), per locale:
  - `<html lang>`, hreflang (self + x-default), canonical;
  - the header chip on desktop (1280px) and the `/me` row on a phone (390px);
  - a full mock-provider tarot flow in `ja` ending on a Japanese reading with no Hangul in `main`;
  - the suggestion band with a `ja-JP` browser on `/`;
  - `/ko/faq` → `/faq`;
  - `/fr/faq` → 404.

- [ ] **Steps 1–5:**
  - Write the tests. Run the lint; fix every offender by extraction, not by allowlisting, unless the file is Korean-only by design.
  - Controller runs `pnpm --filter @starlog/web e2e` → PASS.
  - Commit `test(i18n): no bare links or Korean literals outside messages; e2e per language`.

---

## Phase B

### Task 35: 지금의 한 장 per locale

**Files:**
- Create: `content/kb/decision.{en,ja,zh-hant}.json`, `apps/web/lib/decision.{en,ja,zh-hant}.generated.json`
- Modify:
  - `scripts/check-decision-db.mjs` (`--locale <l>`: per-locale limits, forbidden words, no Hangul, `lean` equal to Korean);
  - `apps/web/lib/decision.ts` (`loadDecisionDb(locale)`: dynamic import per locale);
  - `apps/web/app/[lang]/now/*`, `apps/web/lib/i18n/features.ts` (`NOW_LOCALES`);
  - `scripts/i18n/draft.test.ts` (`decision` job), `scripts/i18n/units/decision.ts`.
- Test: `apps/web/lib/decision.i18n.test.ts`

**Interfaces:**
- `loadDecisionDb(locale): Promise<DecisionDb>` imports `./decision.<locale>.generated.json` only for that locale, so each language is its own client chunk. Korean keeps today's static import, so the Korean bundle is unchanged.
- `drawNow` takes the loaded DB.
- `NOW_LOCALES` gains a locale only when its DB is reviewed (`I18N_GATE_B=decision`).

- [ ] **Step 1: Failing test:** for each locale whose generated file exists, every card side has 3 answers, a why and a tip; no Hangul; the same `lean` as Korean; the Korean limits scaled by `lengthFactor` (answer 20, why 70, tip 40).
- [ ] **Step 2:** draft with `I18N_JOB=decision:<l>`. Instructions: "Write oracle lines in the language; the same picture and the same lean; short, rhythmic, not a translation". Then `node scripts/check-decision-db.mjs --locale <l>` and the ledger.
- [ ] **Step 3:** implement `loadDecisionDb` and the page's locale switch. Add the locale to `NOW_LOCALES` only after review.
- [ ] **Step 4:** run the new test with the existing `decision.test.ts`, `NowOracle.test.tsx` and `now.spec.ts` unchanged → PASS. Controller: `pnpm check:worker`.
- [ ] **Step 5: Commit** per locale (`feat(now): 지금의 한 장 in Japanese (reviewed)`).

---

### Task 36: Guides — per-locale infrastructure and B1 (15 articles)

**Files:**
- Create: `content/i18n/{en,ja,zh-hant}/guides.json`, `apps/web/lib/guide-articles/i18n.ts`, `scripts/i18n/units/guide.ts`
- Modify:
  - `apps/web/app/[lang]/guide/[slug]/page.tsx` (`generateStaticParams` per locale: translated slugs only);
  - `apps/web/app/[lang]/guide/{tarot,saju}/page.tsx`, `apps/web/app/[lang]/guide/GuideIndex.tsx`;
  - `apps/web/lib/i18n/features.ts` (`GUIDE_SLUGS` from the registry);
  - `apps/web/lib/jsonld.ts` (Article in the locale);
  - `scripts/i18n/draft.test.ts` (`guide` job).
- Test: `apps/web/lib/guide-articles/i18n.test.ts`, `apps/web/app/[lang]/guide/guide.i18n.test.tsx`

**Interfaces:**
- `guideArticlesIn(locale): readonly GuideArticle[]`: ko → `GUIDE_ARTICLES`; others → the reviewed entries of `guides.json`, same type, with a localized title and description (the locale's search phrasing, spec §6.2) and the translation's own `published` and `updated`.
- `guide/[slug]` builds, per locale, only the slugs it has. `dynamicParams = false`, so the rest are 404 there, have no hreflang, and are absent from that locale's index.
- B1 slugs:
  - how-to-read-tarot, upright-and-reversed, three-card-spread, one-card-yes-no, now-card-how-to, redrawing-same-question, minor-arcana-suits, court-cards;
  - five-elements, saju-without-birth-time, heavenly-stems, earthly-branches, day-master, ten-gods, saju-vs-astrology.

- [ ] **Step 1: Failing tests:**
  - every translated article has the Korean article's section count, a summary, no Hangul, `cardId` unchanged and `related` slugs only within the locale's set;
  - its picture claims pass `factViolationsIntl` against the card's KB facts when it has a `cardId`;
  - `/ja/guide/how-to-read-tarot` renders in Japanese;
  - `/ja/guide/the-fool` is not generated.
- [ ] **Step 2:** draft each B1 article with `I18N_JOB=guide:<l>:<slug>`. Instructions: "localize for search in <language>: the title uses the phrase people search for; keep every fact; pictures only from the KB facts; no promises". Then the ledger, then **native review**: an article ships only when reviewed.
- [ ] **Step 3:** implement the registry and the routes; the guide tab appears once a locale has an article (`localeHasGuides`).
- [ ] **Step 4:** run the new tests with the existing `guide.test.tsx` and `library.test.ts` unchanged → PASS. Controller: `pnpm check:worker`, e2e guide checks.
- [ ] **Step 5: Commit** per locale; submit the new URLs with `pnpm indexnow`, and record the date for the 4–6 week B2 review.

---

### Task 37: Guides B2 (27 articles), after B1's data

Start only after the owner reviews 4–6 weeks of Search Console data for B1 (impressions and clicks per locale) and confirms B2 (spec D8).

The B2 slugs:
- the 22 major-arcana articles (the-fool … the-world, the-hermit and the-star included);
- daewoon, manseryeok, saju-compatibility, new-year-fortune, celtic-cross-spread.

The steps are Task 36 Steps 1–5 with these slugs. The tests from Task 36 already cover them once they are in `guides.json`.

---

## Release

### Task 38: QA run, runbook, rollout

**Files:**
- Create: `docs/runbook-i18n.md`
- Modify: `apps/web/.env.example` (final flag list with comments)

- [ ] **Step 1:** write `docs/runbook-i18n.md`:
  - the flags and what each controls;
  - the per-locale launch order (spec §12.3);
  - the commands: `pnpm i18n:status`, `I18N_GATE=<l> I18N_GATE_B=… pnpm i18n:status`, `pnpm i18n:review`, `pnpm i18n:draft`, `pnpm kb:i18n`, `pnpm check:worker`, `SMOKE_LOCALE=<l> pnpm ai:smoke`;
  - how to re-check crisis numbers;
  - the Search Console steps: submit the sitemap; Google and Bing per locale; Naver and Daum Korean only;
  - rollback: remove the locale from `NEXT_PUBLIC_LOCALES` and redeploy; its URLs then answer 404. Keep it in preview rather than removing it, if possible, to avoid soft-404 churn.
- [ ] **Step 2 (controller):** for the first locale (default `ja`, spec D24):
  1. build with it in `NEXT_PUBLIC_LOCALES_PREVIEW`, deploy, and run spec §12.4's 20-item QA checklist on the live preview;
  2. record each item as pass or fail, with a screenshot for UI items;
  3. fix fails through the owning task's files.
- [ ] **Step 3 (controller):**
  1. `I18N_GATE=ja pnpm i18n:status` passes;
  2. Task 33's gates pass for ja;
  3. move ja to `NEXT_PUBLIC_LOCALES` and deploy;
  4. submit the sitemap and run `pnpm indexnow`;
  5. watch the §12.3 metrics for two weeks.
- [ ] **Step 4:** repeat Steps 2–3 for en, then zh-hant.
- [ ] **Step 5: Commit** the runbook and `.env.example`.

---

## Self-review against the spec

| Spec | Where |
|---|---|
| §0 D1–D3 URLs, routing, flags | Tasks 2, 5, 20, 21 |
| §0 D4, §4.3 prerender per locale | Tasks 21 (static params), 23 (`availability`), 35, 36 |
| §0 D5, §5.1 typed dictionaries, ICU-lite, josa | Tasks 3, 4 |
| §0 D6, §6.3 long-form content per locale | Task 30 (info, legal), 36 (guides) |
| §0 D7, §5.3, §6.1 review ledger, stale, launch gate | Tasks 7, 14 (draft job), 38 |
| §0 D8, §6.2 guides B1/B2 | Tasks 36, 37 |
| §0 D9 legal reference translations | Task 30 |
| §0 D10, §6.4 KB i18n and card names | Tasks 8, 13 |
| §0 D11, §7.2 prompts per locale, caching | Tasks 14, 15, 17 |
| §0 D12, §7.7 crisis | Tasks 11, 25, 29 |
| §0 D13–D14, §7.1 reading language, daily, today-line | Tasks 19, 25, 27, 29 |
| §0 D15, §7.9 premium Korean-only | Tasks 23 (`KO_ONLY`), 30 (pricing rows) |
| §0 D16–D17, §8 KST clock, KRW display | Tasks 6, 29, 31 |
| §0 D18, §8 births abroad | Tasks 12, 25, 28 |
| §0 D19–D20, §9 payments, login | Tasks 30, 31 |
| §0 D21–D22, §10 switch, persistence, suggestion, mid-flow | Task 23 |
| §0 D23, §11 SEO | Task 24 |
| §0 D24, §12 rollout and QA | Task 38 |
| §0 D25 fonts | Task 22 |
| §0 D26 share | Task 32 |
| §4.4 Worker budget, assets, build time | Tasks 1, 20, 21, 35, 36, 38 |
| §6.5 saju terms | Tasks 8, 17, 28 |
| §6.6 지금의 한 장 | Task 35 |
| §6.7 signs, characters, currencies | Tasks 7 (glossary), 8, 29 |
| §7.3–7.6 style rules, validators, fidelity, model blinding | Tasks 9, 10, 15–18 |
| §7.8 cost | Task 33 |
| §7.10 eval and smoke | Task 33 |
| §13 risks | Tasks 1, 20 (spike, fallback), 33 (cost), 34 (lint) |
| §14 P4/P5 coexistence | Phase gates (Global Constraints), G1, Task 21 |

Type and name consistency, defined once and reused with the same signature:
- `Locale`, `LOCALES`, `LOCALE_INFO`, `publicLocales` / `previewLocales` / `routedLocales` (Task 2);
- `formatMessage` (3); `MESSAGES`, `Namespace`, `translator`, `pickMessages`, `useT`, `useLocale` (4);
- `localePath`, `splitLocale`, `localizeHref`, `switchPath`, `KO_REWRITE_PATTERN`, `LocaleLink`, `useLocaleRouter`, `useBarePathname` (5);
- `formatKrw`, `formatIsoDate`, `formatKstMonthDay`, `nextKstMidnight`, `clockIn` (6);
- `hashKo`, `recordDrafts`, `markReviewed`, `summarize`, `unitStatus`, `allUnits`, `presentIn` (7);
- `cardNameIn`, `cardAliasesIn`, `positionLabel`, `topicLabel`, `topicQuestion`, `conditionText`, `whenLabel`, `unsureWords`, `signName`, `sajuGlossary` (8);
- `IntlLocale`, `measure`, `sentencesOf`, `mentionsIn`, `overlap`, `beyondUser`, `scriptViolations` (9);
- `safetyViolations`, `voiceViolations`, `TELLS`, `aiTellViolationsIntl`, `PROFILES`, `SOFT_PREFIX_INTL` (10);
- `isCrisisAnyLanguage`, `HOTLINES`, `crisisLead`, `hotlineLines` (11);
- `zoneOffsetMsAt`, `zoneWallClockInstants`, `ABROAD_PLACES` (12);
- `kbText`, `KB_I18N_LOCALES` (13);
- `GenerationTask.systemLocale`, `draftJson` (14);
- `localeBlock`, `TAROT_CORE_INTL`, `TAROT_LENGTHS`, `scaledRange`, `tarotHeadingsIn`, `cardLabelIn` (15);
- `stripFactIds`, `commonIntl`, `factViolationsIntl`, `validate*Intl` (16, 17);
- `generate*Intl` (19);
- `currentLocale`, `getT`, `localeRedirect`, `Messages` (21);
- `setTestLocale`, `setFallbackMessages` (22);
- `localeHasPath`, `fallbackPath`, `NOW_LOCALES`, `guideSlugsIn`, `localeHasGuides`, `suggestLocale`, `readPreference` / `savePreference` (23);
- `alternatesFor`, `X_DEFAULT_LOCALE` (24);
- `requestLocale` (25).

The births-abroad flag is `NEXT_PUBLIC_SAJU_ABROAD` in both documents (read by the form and the server at build time).
