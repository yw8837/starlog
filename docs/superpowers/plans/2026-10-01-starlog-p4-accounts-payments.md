# Starlog P4: Accounts and Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revision 2 (2026-10-02), written against `aa70830`.** This revision answers the critic's REVISE verdict:
- C1, M1–M9 and minors 1–14.
- The coordinator's scope cut: no device→account claim flow and no 인연 link. Readings bought while logged in are still kept in the account.

**Goal:** Sell the standard tarot and saju full readings at 2,900원 each through Kakao login and the Toss Payments widget.
- A paid reading is charged only when it is delivered.
- A failed generation leaves it unused: open again for free, or refund it in one tap.
- New accounts get one reading's worth of 별조각.
- Everything sits behind `STARLOG_PAYMENTS`.

**Architecture:**
- **Storage:** Cloudflare D1 (binding `DB`, shared with P3) holds users, sessions, orders, payments, credit lots, unlock reservations, an append-only ledger, encrypted saved readings and a `meta` row that pins the account secret.
- **Money rules live in SQL:** CHECK constraints, UNIQUE idempotency keys, guards against deleted accounts, and one D1 `batch()` per state change. Tests run the same SQL on `node:sqlite` in memory, and on local D1 (workerd) in `*.int.test.ts`.
- **Reading routes:**
  - credit is reserved before a stream starts;
  - inside `respondGeneration`'s `keepAlive` work, the reading is saved and the reservation spent before the body or `done` leaves;
  - every failure releases the reservation;
  - a save whose answer was lost is recovered by re-reading.
- **Cost books:** paid model cost goes to its own `paidcost:` book, so it never trips the free budget. 별조각 readings count as free.
- **Toss is the source of truth** (confirm, look-up, cancel with attempt-scoped Idempotency-Keys, webhook re-query). A Cron Trigger settles what users leave behind.

**Tech Stack:**
- Existing: Next.js 16.3.7 (App Router) on Cloudflare Workers via OpenNext 1.20.7, TypeScript 6, zod 4, WebCrypto (`lib/security/sign.ts`), Vitest 5, Playwright.
- New, with no new npm dependencies: Cloudflare D1, Node's built-in `node:sqlite` (tests only), the Toss JS SDK v2 by script tag (`https://js.tosspayments.com/v2/standard`), and a Workers Cron Trigger through a custom OpenNext worker entry.

**Spec:** `docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md` (read sections 4, 5.4, 5.5, 5.8, 5.9 and 14 before any task). Parent spec: `docs/superpowers/specs/2026-09-29-saju-tarot-story-app-design.md`.

## Global Constraints

- Everything in `.superpowers/sdd/2026-09-30-starlog-p2b/global-constraints.md` holds:
  - no fs at runtime; 해요체; no product meta copy;
  - one gold primary per screen; 44px targets; visible text ≥13px (tab labels 12px); contrast ≥4.5:1; `prefers-reduced-motion`; CSS Modules + tokens in `app/globals.css`;
  - `SITE` for names, prices and URLs (never hard-coded);
  - commit only your own paths.
- Next.js 16 differs from training data. Read `apps/web/node_modules/next/dist/docs/` (or the root `node_modules/next/dist/docs/`) before using an API you are unsure of.
- **Do not add npm dependencies.** Do not run `next build`, `pnpm cf:build`, dev servers or Playwright unless the task says so; the controller runs builds and e2e.
- Verification you run:
  - `pnpm typecheck` from the repo root;
  - `npx vitest run <paths>` from the repo root;
  - the full suite `npx vitest run --maxWorkers=3` once before committing.
- Git:
  - `git add <explicit paths>` (never `-A`); other agents edit the same tree;
  - the commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - never push.
- Owner orders on copy:
  - The word "베타" appears nowhere a user can see. The free daily full reading is the "오픈 기념" offer: reuse the wording already in `components/tarot/UnlockSheet.tsx`, `/pricing`, `lib/faq.ts`. After payments open for everyone, the signup gift replaces it.
  - No model names (Claude, Opus…) on user screens or in the terms. The privacy policy names the company "Anthropic, PBC" only in its 국외 이전 table (개인정보보호법 제28조의8).
- Money (spec 5.4–5.5):
  - The server decides every amount from `lib/pay/catalog.ts`; a client never sends one that is used.
  - Credit is spent only when a validated reading is saved to the account. Every failure path releases the reservation.
  - Every ledger row has a UNIQUE `idem_key`, and every multi-step change is one `db.batch([...])`. A batch whose writes depend on each other checks `meta.changes`.
  - Nothing is granted, reserved or saved for an account with `deleted_at` set.
- Toss (docs.tosspayments.com):
  - API base `https://api.tosspayments.com`; `Authorization: Basic base64(TOSS_SECRET_KEY + ":")`.
  - `Idempotency-Key` goes on POST only. A key replays its first answer, errors included, for 15 days. **409 `IDEMPOTENT_REQUEST_PROCESSING`, 5xx and no answer mean "unknown": never treat them as a refusal.**
  - After any other non-success, look the payment up before deciding. Use a new attempt-scoped key only after a look-up shows the payment is still `DONE`.
  - Order ids are 24 chars of `[A-Za-z0-9_-]`; confirm within 10 minutes; never trust a webhook body.
- Kakao:
  - authorize `https://kauth.kakao.com/oauth/authorize`;
  - token `POST https://kauth.kakao.com/oauth/token` (form, with `client_secret`);
  - profile `https://kapi.kakao.com/v2/user/me` (Bearer);
  - unlink `POST https://kapi.kakao.com/v1/user/unlink` (Bearer).
  - Never store Kakao tokens or the raw Kakao id.
- Secrets (env names only):
  - `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY` (read at run time through `tossClientKey()`);
  - `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`;
  - `STARLOG_ACCOUNT_SECRET` (32+ chars, pinned by the D1 `meta` check; never rotated in P4);
  - `STARLOG_CRON_SECRET` (32+ chars), and the existing `STARLOG_SIGNING_SECRET`.
- Flags: `STARLOG_PAYMENTS` (`off` | `owner` | `on`), `STARLOG_PAY` (`toss` | `mock`), `STARLOG_KAKAO` (`kakao` | `mock`), `STARLOG_CF_DEV` (`1` = local D1 in `next dev`). Mocks are refused in production.
- `lib/api/stream.ts` and `lib/api/spend.ts` are owned by the P2b accounting work.
  - Tasks 9–10 start from them as they are at `aa70830`: unchanged since `1d1e7c0` apart from the `"line"` spend kind. That means generation under `keepAlive`, `SpendLedger` reserve/release/bill/finish settling into the reserving KST day, and the `spend` option charged before the start.
  - If they changed since, keep the newer code and add only the lines this plan marks `// P4`.
- Rate limits at aa70830: `GEN_LIMITER` 60/min, `FULL_LIMITER` 20/min, network day caps (full 60, teaser 240, …). P4 does not change them.
- Never log user text, birth data, Kakao ids, nicknames, tokens, payment keys or IPs. Log `evt`, order ids, codes and counts only. No personal data in URLs.
- The 10-card product is never called "켈틱 크로스" (or any spelling of it) anywhere.
- P3 coexistence (spec section 4; P3 Task 4 landed in acf4599):
  - Use P3's `apps/web/lib/db/d1.ts` types (`D1Binding`, `D1Statement`, `D1Result`) and `getDb()`.
  - Do not touch P3's `sl_uid`/`sl_fid` cookies, P3's tables or the `d1_databases` entry.
  - P4 migrations are `apps/web/migrations/0002_…` and later. `0001_bonds.sql` is applied in production and is never edited.
  - Rate-limit namespaces are 1101–1103 (P3 uses up to 1008).

## File Structure

```
apps/web/migrations/0002_accounts_payments.sql     P4 tables (meta, users, sessions, gift_claims, orders, payments, credit_lots, unlocks, ledger, readings)
apps/web/lib/db/d1.ts                               (P3, unchanged) D1Binding / D1Statement / D1Result, getDb()
apps/web/lib/db/index.ts                            (P3's factory) + accountDb(), setTestDb(); header comment updated (M6)
apps/web/lib/db/sqlErrors.ts                        isConstraintError()
apps/web/lib/db/testing/sqliteD1.ts                 D1Binding over node:sqlite in memory (tests only)
apps/web/lib/db/testing/migrate.ts                  migratedTestD1(): fresh test DB with every migration applied
apps/web/lib/db/testing/localD1.ts                  openLocalD1(): real local D1 (workerd via getPlatformProxy) with every migration
apps/web/lib/pay/catalog.ts                         products, prices, GIFT_DAYS (client-safe)
apps/web/lib/pay/mode.ts                            STARLOG_PAYMENTS / STARLOG_PAY, Toss key checks
apps/web/lib/pay/ledger.ts                          lots, reserve / deliver / release, gift, expiry, refund lock (one batch), revoke, wallet summary
apps/web/lib/pay/tossTypes.ts                       TossPayment, TossError, isPendingTossError, TossClient, parsePayment
apps/web/lib/pay/toss.ts                            real Toss client + tossClient() selector
apps/web/lib/pay/tossMock.ts                        in-memory Toss (STARLOG_PAY=mock)
apps/web/lib/pay/orders.ts                          create, confirm (M2 rules, no session), markPaid (deleted-account guard), reconcile confirming, history
apps/web/lib/pay/refunds.ts                         refund unused, orphan refund, reconcile refunding, applyCancel, webhook sync
apps/web/lib/pay/maintenance.ts                     runMaintenance(): the Cron Trigger's work
apps/web/lib/pay/offer.ts                           UnlockOffer, unlockOffer(), checkoutHref() (client-safe)
apps/web/lib/pay/unlockMethod.ts                    UNLOCK_METHODS, UnlockMethod (client-safe, Task 2)
apps/web/lib/pay/tossSdk.ts                         browser loader for the Toss v2 script
apps/web/lib/account/secrets.ts                     account secret, HKDF subkeys, kakaoKey(), sealJson()/openJson(), ReadingKeys
apps/web/lib/account/secretCheck.ts                 accountSecretMatches(): the D1 meta check (M8)
apps/web/lib/account/users.ts                       users: login upsert, lookups
apps/web/lib/account/session.ts                     sl_sid cookie + D1 sessions
apps/web/lib/account/request.ts                     openAccount(), openAccountRoute(), requireSession(), sameOrigin()
apps/web/lib/account/redirect.ts                    303 helper for GET routes
apps/web/lib/account/returnTo.ts                    safeReturnTo(), withQuery() (client-safe)
apps/web/lib/account/oauthState.ts                  sl_oauth state cookie
apps/web/lib/account/kakao.ts                       Kakao OAuth (real + mock), unlink
apps/web/lib/account/deletion.ts                    delete intent token, deleteAccount(), eraseDeletedAccount()
apps/web/lib/account/client.ts                      browser: /api/me store, useAccount(), logout(), loginHref(), loginMessage()
apps/web/lib/readings/store.ts                      encrypted saved readings (paged, versioned keys)
apps/web/lib/readings/chapters.ts                   server-side chapter builders (tarot, saju)
apps/web/lib/readings/turns.ts                      follow-up turns into the saved copy
apps/web/lib/api/unlock.ts                          planUnlock() + settlementFor() for the reading routes
apps/web/lib/storage/sync.ts                        browser: pull account readings, check a delivery after a cut (M4)
apps/web/app/api/me/route.ts
apps/web/app/api/auth/kakao/start/route.ts, callback/route.ts, apps/web/app/api/auth/logout/route.ts
apps/web/app/api/account/delete-intent/route.ts
apps/web/app/api/pay/{checkout,orders,confirm,refund,webhook}/route.ts
apps/web/app/api/readings/route.ts
apps/web/app/api/internal/maintenance/route.ts      cron-only route (STARLOG_CRON_SECRET)
apps/web/worker.mjs                                 custom OpenNext entry: fetch + scheduled
apps/web/app/pay/{checkout,success,fail}/…          payment pages
apps/web/app/me/AccountPanel.tsx, OrderHistory.tsx, meStatus.ts
docs/runbook-payments.md                            rollout, secrets, checks, ops queries
```

Modified:
- `next.config.ts` (opt-in local bindings), `wrangler.jsonc` (`main`, `triggers.crons`, ratelimits);
- `lib/api/http.ts` (error codes), `lib/api/stream.ts` (settlement, paid cost book), `lib/api/spend.ts` (cost sinks), `lib/api/inputs.ts`, `lib/api/tarotRequest.ts`;
- the tarot/saju reading routes and the follow-up route;
- `lib/security/rateLimit.ts`, `lib/cloudflare.ts`;
- `components/tarot/UnlockSheet.tsx`, the result/chart/login/me pages, `lib/storage/chapters.ts`, `lib/reading/{api,errors,types}.ts`;
- the legal pages, `lib/robots.ts`, `scripts/check-client-bundle.mjs`, `apps/web/playwright.config.ts`, `apps/web/.env.example`, `apps/web/package.json`.

## Task order, files and parallel lanes

Written against `aa70830` (2026-10-02) and re-checked at `ba7e843`: the five P5 commits after aa70830 touch, among P4's files, only `lib/api/inputs.ts` (two new draw templates, up to 10 picks) and `lib/api/tarotRequest.ts` (premium templates refused on the standard route). Tasks 10 and 11 add to those two files and keep the P5 lines. P5 work runs in the same tree: never reformat or reorder those files. Every task lists the exact files it creates or modifies in its own **Files** block. The table repeats them so two implementers can be scheduled without overlapping files.

| # | Task | Depends on | Files (create / modify) | Lane |
|---|---|---|---|---|
| 0 | Preconditions (controller) | — | none | — |
| 1 | Test D1 and the P4 schema | — | `migrations/0002_accounts_payments.sql`; `lib/db/{sqlErrors.ts, index.ts, accountDb.test.ts, accountSchema.int.test.ts}`; `lib/db/testing/{sqliteD1,migrate,localD1}.ts`; `next.config.ts`; `apps/web/package.json` | S |
| 2 | Catalog, payment modes, unlock methods | — | `lib/pay/{catalog,mode,unlockMethod}.ts` (+ `catalog.test.ts`, `mode.test.ts`); `apps/web/.env.example` | C |
| 3 | Account core: secrets (HKDF, D1 check), users, sessions, guards, error codes, limiters | 1 | `lib/account/{secrets,secretCheck,users,session,request,redirect,returnTo}.ts`, `lib/account/account.test.ts`; `lib/api/http.ts`; `lib/security/rateLimit.ts`; `lib/cloudflare.ts`; `wrangler.jsonc` (`ratelimits` only) | S |
| 4 | Ledger | 1, 2 | `lib/pay/{ledger,ledgerContract}.ts`, `lib/pay/{ledger.test,ledger.int.test}.ts` | S |
| 5 | Kakao login, `/api/me`, logout | 2, 3, 4 | `lib/account/{oauthState,kakao}.ts`, `lib/account/kakao.test.ts`; `app/api/auth/{kakao/start,kakao/callback,logout}/route.ts`, `app/api/auth/auth.test.ts`; `app/api/me/route.ts`; `lib/testing/p4.ts` | S |
| 6 | Toss client and mock | 2 | `lib/pay/{tossTypes,toss,tossMock}.ts`, `lib/pay/toss.test.ts` | C |
| 7 | Orders, checkout info, confirm (no session) | 4, 5, 6 | `lib/pay/orders.ts`; `app/api/pay/{checkout,orders,confirm}/route.ts`, `app/api/pay/pay.test.ts`; `lib/testing/p4.ts` (append `buy`) | S |
| 8 | Refunds, reconciliation, webhook | 7 | `lib/pay/refunds.ts`; `app/api/pay/{refund,webhook}/route.ts`, `app/api/pay/refund.test.ts`; modify `app/api/pay/{orders,confirm}/route.ts`, `app/api/pay/pay.test.ts` | S |
| 9 | Saved readings, cost books, stream settlement | 3 | `lib/readings/store.ts`, `lib/readings/store.test.ts`; `lib/api/{spend,stream}.ts`, `lib/api/settle.test.ts` | S |
| 10 | Paid, 별조각 and owner unlocks on the reading routes | 4, 7, 9 | `lib/api/unlock.ts`; `lib/readings/chapters.ts`; `lib/api/{inputs,tarotRequest}.ts`; `app/api/tarot/reading/route.ts`; `app/api/saju/reading/route.ts`; `app/api/unlock.test.ts` | S |
| 11 | Readings API: pages, delete, follow-up turns | 9, 10 | `app/api/readings/route.ts`, `app/api/readings/readings.test.ts`; `lib/readings/turns.ts`; `lib/api/inputs.ts` (`FollowUpBody`); `app/api/followup/route.ts` | S |
| 12 | Account deletion | 5, 8, 9 | `lib/account/deletion.ts`; `app/api/account/delete-intent/route.ts`, `app/api/account/deletion.test.ts`; modify `app/api/auth/kakao/{start,callback}/route.ts` | S |
| 13 | Scheduled maintenance (Cron Trigger) | 8, 12 | `lib/pay/maintenance.ts`; `app/api/internal/maintenance/{route.ts, maintenance.test.ts}`; `worker.mjs`; `wrangler.jsonc` (`main`, `triggers`) | S |
| 14 | Client account layer, offers, error copy, UnlockSheet | 2 | `lib/account/client.ts` (+ test); `lib/pay/offer.ts` (+ test); `lib/reading/{api,errors}.ts`, `lib/reading/errors.p4.test.ts`; `components/tarot/UnlockSheet.{tsx,module.css,test.tsx}` | C |
| 15 | Result pages, delivery check after a cut, login page | 3, 14 | `lib/storage/{sync.ts, sync.test.ts, serverId.test.ts, chapters.ts}`; `lib/reading/types.ts`; `app/tarot/result/{FreeResult.tsx,page.tsx}`; `app/saju/chart/{SajuChartView.tsx,page.tsx}`; `app/chapter/[id]/LocalChapter.tsx`; `app/login/{page.tsx,LoginPanel.tsx,LoginPanel.test.tsx}` | C |
| 16 | Checkout, success and fail pages | 3, 14 | `lib/pay/tossSdk.ts`; `app/pay/**` (checkout, success, fail, `pay.module.css`, tests); `lib/robots.ts`; `lib/seo.test.ts` | C |
| 17 | 내 정보: account, purchases, receipts, deletion | 14, 15 | `lib/storage/sync.ts` (append), `lib/storage/pull.test.ts`; `app/me/**` (AccountPanel, OrderHistory, meStatus, account.module.css, MeView, page; delete MoonPackSheet); `app/story/StoryView.tsx` | C |
| 18 | Legal pages | 2, 14 | `components/legal/{PaymentsNote.tsx, p4Policies.test.tsx}`; `app/{pricing,refund,terms,privacy}/page.tsx`; `lib/legal.ts` (+ test); the legal and info tests that pin removed text | C |
| 19 | Bundle guard, e2e pay flow, runbook | all | `scripts/check-client-bundle.mjs`; `apps/web/playwright.config.ts`; `apps/web/e2e/{global-setup.ts, pay-flow.spec.ts}`; `apps/web/package.json`; `docs/runbook-payments.md` | — |

All paths are under `apps/web/` unless they start with `scripts/` or `docs/`.

**Two implementers at once.** Lane S (server and money) and lane C (client, Toss SDK side, legal) never touch the same file:
- Lane S, in order: 1 → 3 → 4 → 5 → 7 → 8 → 9 → 10 → 11 → 12 → 13.
- Lane C, in order: 2 → 6 → 14 → 18 → 15 → 16 → 17.
- Cross-lane waits:
  - Task 4 needs Task 2 (lane C goes first with it).
  - Task 7 needs Task 6.
  - Tasks 15 and 16 need Task 3 (`returnTo.ts`). Lane C reaches them after 2, 6, 14 and 18, by which time Task 3 is long done.
- Task 9 needs only Task 3, so lane S may take it right after 3 if 4 is waiting on 2.
- Task 19 runs alone at the end, after both lanes.
- Shared files are always in one lane and in order:
  - `wrangler.jsonc`: 3 then 13;
  - `lib/testing/p4.ts`: 5 then 7;
  - `app/api/pay/*`: 7 then 8;
  - `lib/api/inputs.ts`: 10 then 11;
  - `app/api/auth/kakao/*`: 5 then 12;
  - `lib/storage/sync.ts`: 15 then 17;
  - `apps/web/package.json`: 1 now, 19 last.
- Lane C's tests mock `fetch` for the account and payment APIs, so they pass before the lane S routes exist. The controller's e2e (Task 19) is where the two meet.
- Other agents edit the tree too. `apps/web/lib/cloudflare.ts` had an uncommitted change at aa70830. Task 3 adds three optional bindings to it: keep whatever else is there.

Dropped in revision 2 (the coordinator's scope cut): the device→account claim flow, and the P3 인연 link.

---

### Task 0: Preconditions (controller, no code)

- [ ] **Step 1: Check the baseline is committed** (at `aa70830` or later):
  - P2b accounting: `apps/web/lib/api/spend.ts` with `SpendLedger`, `addCost` and `budgetState`; `apps/web/lib/api/stream.ts` with `keepAlive` and the `spend` option;
  - `keyedHash` in `lib/security/sign.ts`; `ipGroup` and `checkServerLimits` in `lib/api/http.ts`; `getJson` in `lib/reading/api.ts`; `ROBOTS_DISALLOW` in `lib/robots.ts`;
  - `SITE.price.premium` in `lib/config.ts`;
  - P3: `apps/web/migrations/0001_bonds.sql` (applied in production), `apps/web/lib/db/{d1,index}.ts`, and the `d1_databases` entry (`binding` DB, `database_id` 78c6fb07-ee97-42d5-9633-21801fe596eb, `migrations_dir` migrations). No `0002_*` exists yet.

Run: `git -C D:/Money/apps/saju-tarot ls-tree -r --name-only HEAD apps/web/migrations apps/web/lib/api/spend.ts apps/web/lib/db/index.ts apps/web/lib/db/d1.ts apps/web/lib/robots.ts`
Expected: `0001_bonds.sql` as the only migration, and the four files.

Run: `git -C D:/Money/apps/saju-tarot grep -n "class SpendLedger\|function keepAlive\|export async function getJson" HEAD -- apps/web/lib`
Expected: all three found.

Run: `git -C D:/Money/apps/saju-tarot status --short apps/web/migrations apps/web/lib/db apps/web/lib/api/stream.ts apps/web/lib/api/spend.ts`
Expected: nothing printed. Uncommitted edits there would leak into P4's tests.

- [ ] **Step 2: Check the suite is green.**

Run: `npx vitest run --maxWorkers=3` (repo root)
Expected: every file passes, exit 0.

If Step 1 or Step 2 fails, stop. Report what is missing, and do not start Task 1 until the owning agent has committed it.

---

### Task 1: Test D1 and the P4 schema

**Files:**
- Create: `apps/web/lib/db/sqlErrors.ts`, `apps/web/lib/db/testing/sqliteD1.ts`, `apps/web/lib/db/testing/migrate.ts`, `apps/web/lib/db/testing/localD1.ts`, `apps/web/migrations/0002_accounts_payments.sql`
- Modify: `apps/web/lib/db/index.ts` (append `accountDb`, `setTestDb`), `apps/web/next.config.ts` (opt-in local bindings), `apps/web/package.json` (scripts)
- Test: `apps/web/lib/db/accountDb.test.ts`, `apps/web/lib/db/accountSchema.int.test.ts`

**Interfaces:**
- Consumes (P3, acf4599, unchanged): from `apps/web/lib/db/d1.ts`:
  - `interface D1Binding { prepare(query): D1Statement; batch(s: D1Statement[]): Promise<D1Result[]> }`
  - `interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(); all<T>(); run() }`
  - `interface D1Result<T> { results: T[]; success: boolean; meta?: { changes?: number } }`
  - `getDb(): D1Binding | null` (null outside Workers)
- Produces:
  - `sqlErrors.ts`: `isConstraintError(error: unknown): boolean`
  - `index.ts`: `accountDb(): D1Binding | null` (the test database when set, else `getDb()`), `setTestDb(db: D1Binding | null): void`
  - `testing/sqliteD1.ts`: `interface TestD1 extends D1Binding { exec(sql): void }`, `createTestD1(): TestD1`
  - `testing/migrate.ts`: `migratedTestD1(): TestD1`
  - `testing/localD1.ts`: `migrationStatements(): string[]`, `openLocalD1(): Promise<{ db: D1Binding; dispose(): Promise<void> }>`, `P4_TABLES_CHILD_FIRST: string[]`

**Why two test databases:**
- P3's pattern is memory repos plus a contract suite run again on local D1.
- P4 keeps the second half (local D1 through `getPlatformProxy`, as `d1BondsRepo.int.test.ts` does).
- It replaces the Map-based memory store with node:sqlite in memory running the same SQL (spec section 4). The money rules are SQL constraints and batch atomicity, and a Map store would not exercise them.
- `next dev` has no D1 unless `STARLOG_CF_DEV=1` (Step 8). Without it the account and payment routes answer 503, and the site works as it does today (no login, no payments).

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/db/accountDb.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { D1Binding } from "./d1";
import { accountDb, setTestDb } from "./index";
import { isConstraintError } from "./sqlErrors";
import { migratedTestD1 } from "./testing/migrate";

const insertUser = (db: D1Binding, id: string, key: string | null) =>
  db
    .prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)")
    .bind(id, key, `c_${id}`);

const count = async (db: D1Binding, table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe("test D1 with every migration applied", () => {
  afterEach(() => setTestDb(null));

  it("creates the P4 tables next to P3's", async () => {
    const db = migratedTestD1();
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["owners", "meta", "credit_lots", "gift_claims", "ledger", "orders", "payments", "readings", "sessions", "unlocks", "users"]),
    );
  });

  it("rolls a whole batch back when one statement breaks a constraint", async () => {
    const db = migratedTestD1();
    await expect(db.batch([insertUser(db, "u_1", "k1"), insertUser(db, "u_2", "k1")])).rejects.toSatisfy(isConstraintError);
    expect(await count(db, "users")).toBe(0);
  });

  it("keeps a lot's units between 0 and its total", async () => {
    const db = migratedTestD1();
    await insertUser(db, "u_1", "k1").run();
    await db
      .prepare("INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_1', 'u_1', 'free', 'gift', 10, 10, 0)")
      .run();
    await expect(db.prepare("UPDATE credit_lots SET units_left = units_left - 11 WHERE id = 'lot_1'").run()).rejects.toSatisfy(isConstraintError);
    await expect(db.prepare("UPDATE credit_lots SET units_left = units_left + 1 WHERE id = 'lot_1'").run()).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT units_left FROM credit_lots WHERE id = 'lot_1'").first()).toEqual({ units_left: 10 });
  });

  it("enforces foreign keys, as D1 does", async () => {
    const db = migratedTestD1();
    await expect(
      db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('s1', 'nobody', 0, 1)").run(),
    ).rejects.toSatisfy(isConstraintError);
  });

  it("returns RETURNING rows and counts changes", async () => {
    const db = migratedTestD1();
    await insertUser(db, "u_1", "k1").run();
    const row = await db.prepare("UPDATE users SET nickname = '달' WHERE id = ? RETURNING id, nickname").bind("u_1").first();
    expect(row).toEqual({ id: "u_1", nickname: "달" });
    const none = await db.prepare("UPDATE users SET nickname = '해' WHERE id = ? RETURNING id").bind("nobody").first();
    expect(none).toBeNull();
    const [first, second] = await db.batch([
      db.prepare("UPDATE users SET nickname = '별' WHERE id = 'u_1'"),
      db.prepare("UPDATE users SET nickname = '별' WHERE id = 'nobody'"),
    ]);
    expect([first!.meta?.changes, second!.meta?.changes]).toEqual([1, 0]);
  });

  it("refuses undefined like D1", async () => {
    const db = migratedTestD1();
    await expect(db.prepare("SELECT ?").bind(undefined).first()).rejects.toThrow(/undefined/);
  });

  it("accountDb() is the test database while one is set, and null without Workers", () => {
    expect(accountDb()).toBeNull();
    const db = migratedTestD1();
    setTestDb(db);
    expect(accountDb()).toBe(db);
  });
});
```

`apps/web/lib/db/accountSchema.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { D1Binding } from "./d1";
import { isConstraintError } from "./sqlErrors";
import { openLocalD1 } from "./testing/localD1";

/** The same constraint behaviour on real local D1 (workerd). Skipped with CI_NO_WORKERD=1, like P3's int test. */
describe.skipIf(process.env.CI_NO_WORKERD === "1")("P4 schema on local D1", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ db, dispose } = await openLocalD1());
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  it("rolls back a reservation batch whose lot would go below zero, and upserts with RETURNING", async () => {
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k1', '별', 'c_1', 0, 0)").run();
    await db.prepare("INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_1', 'u_1', 'free', 'gift', 10, 10, 0)").run();
    await expect(
      db.batch([
        db.prepare("INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at) VALUES ('ul_1', 'u_1', 'tarot', 'free', '[]', 'reserved', 1, 0)"),
        db.prepare("UPDATE credit_lots SET units_left = CASE WHEN status = 'active' THEN units_left - 11 ELSE -1 END WHERE id = 'lot_1'"),
      ]),
    ).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM unlocks").first()).toEqual({ n: 0 });
    const upsert = await db
      .prepare(
        `INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_2', 'k1', '달', 'c_2', 1, 1)
         ON CONFLICT (kakao_key) DO UPDATE SET nickname = excluded.nickname RETURNING id, nickname`,
      )
      .first();
    expect(upsert).toEqual({ id: "u_1", nickname: "달" });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/db/accountDb.test.ts apps/web/lib/db/accountSchema.int.test.ts`
Expected: FAIL, `Cannot find module './sqlErrors'` (or `./testing/migrate`).

- [ ] **Step 3: Write `apps/web/lib/db/sqlErrors.ts`**

```ts
/** A UNIQUE, CHECK, NOT NULL or FOREIGN KEY failure. D1 ("D1_ERROR: … constraint failed") and SQLite both say "constraint failed". */
export function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint failed/i.test(error.message);
}
```

- [ ] **Step 4: Write `apps/web/lib/db/testing/sqliteD1.ts`**

```ts
import { DatabaseSync } from "node:sqlite";
import type { D1Binding, D1Result, D1Statement } from "../d1";

/**
 * P3's D1Binding over node:sqlite in memory, for Vitest. Foreign keys are on, as D1 enforces them.
 * batch() is one transaction that rolls back and rejects on the first failing statement, as D1's
 * does. Tests only: app code never imports this file (node:sqlite does not exist on Workers).
 */
export interface TestD1 extends D1Binding {
  /** raw SQL, several statements allowed (migrations, fixtures) */
  exec(sql: string): void;
}

type SqlValue = string | number | null;

/** D1 refuses undefined and stores booleans as 0/1. */
function sqlValue(value: unknown): SqlValue {
  if (value === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error(`D1_TYPE_ERROR: Type '${typeof value}' not supported`);
}

/** Statements that hand rows back: reads, and writes with RETURNING. */
const RETURNS_ROWS = /^\s*(select|with|pragma)\b|\breturning\b/i;
const READ_ONLY = /^\s*(select|with|pragma)\b/i;

interface TestStatement extends D1Statement {
  execute(): D1Result;
}

export function createTestD1(): TestD1 {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const execute = (sql: string, raw: unknown[]): D1Result => {
    const values = raw.map(sqlValue);
    const statement = db.prepare(sql);
    if (RETURNS_ROWS.test(sql)) {
      const results = statement.all(...values).map((row) => ({ ...row }));
      const changes = READ_ONLY.test(sql) ? 0 : Number((db.prepare("SELECT changes() AS n").get() as { n: number }).n);
      return { results, success: true, meta: { changes } };
    }
    const info = statement.run(...values);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  };

  const prepared = (sql: string, values: unknown[]): TestStatement => ({
    bind: (...next: unknown[]) => prepared(sql, next),
    first: async <T>() => (execute(sql, values).results[0] as T | undefined) ?? null,
    all: async <T>() => execute(sql, values) as unknown as D1Result<T>,
    run: async () => execute(sql, values),
    execute: () => execute(sql, values),
  });

  return {
    prepare: (sql) => prepared(sql, []),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) => (statement as TestStatement).execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: (sql) => db.exec(sql),
  };
}
```

If Vitest reports `Failed to load url node:sqlite`, replace the import with `import { createRequire } from "node:module";` and `const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");`, and note it in your report.

- [ ] **Step 5: Write `apps/web/lib/db/testing/migrate.ts` and `apps/web/lib/db/testing/localD1.ts`**

```ts
// apps/web/lib/db/testing/migrate.ts
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTestD1, type TestD1 } from "./sqliteD1";

const MIGRATIONS = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** A fresh in-memory test D1 with every apps/web/migrations/NNNN_*.sql applied in name order, as wrangler does. */
export function migratedTestD1(): TestD1 {
  const db = createTestD1();
  for (const name of readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()) {
    db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
  }
  return db;
}
```

```ts
// apps/web/lib/db/testing/localD1.ts
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Binding } from "../d1";

const MIGRATIONS = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** P4 tables, children before parents, for emptying a shared local D1 between tests. */
export const P4_TABLES_CHILD_FIRST = ["readings", "ledger", "unlocks", "credit_lots", "payments", "orders", "gift_claims", "sessions", "users", "meta"];

/** Every migration's statements in file order (comment-only lines dropped, split at a ";" that ends a line). */
export function migrationStatements(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .flatMap((name) => readFileSync(join(MIGRATIONS, name), "utf8").replace(/^--.*$/gm, "").split(/;\s*(?:\n|$)/))
    .map((sql) => sql.trim())
    .filter(Boolean);
}

/**
 * A real local D1 (workerd through wrangler's getPlatformProxy, in memory) with every migration
 * applied: the same approach as P3's d1BondsRepo.int.test.ts. Tests only; *.int.test.ts files skip
 * themselves with CI_NO_WORKERD=1.
 */
export async function openLocalD1(): Promise<{ db: D1Binding; dispose: () => Promise<void> }> {
  const { getPlatformProxy } = await import("wrangler");
  // A config with only the D1 binding: the app's own config also names assets and services the test does not run.
  const dir = mkdtempSync(join(tmpdir(), "starlog-p4-d1-"));
  const configPath = join(dir, "wrangler.jsonc");
  writeFileSync(configPath, JSON.stringify({
    name: "starlog-p4-d1-test",
    compatibility_date: "2026-09-01",
    d1_databases: [{ binding: "DB", database_name: "starlog", database_id: "local-test" }],
  }));
  const proxy = await getPlatformProxy<{ DB: D1Binding }>({ configPath, persist: false });
  for (const sql of migrationStatements()) await proxy.env.DB.prepare(sql).run();
  return {
    db: proxy.env.DB,
    dispose: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 6: Write `apps/web/migrations/0002_accounts_payments.sql`** (same `migrations_dir` as P3's `0001_bonds.sql`)

Keep comments on their own lines or after a column (never after the final `;` of a statement), and never put a semicolon inside a comment: `migrationStatements()` splits at line-ending semicolons.

```sql
-- P4: accounts, payments, the credit ledger and saved readings.
-- Spec: docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md (sections 5.4 and 7).
-- Times are epoch milliseconds. Money is whole KRW. Units are 달빛 (paid) or 별조각 (free) counts.

-- Values that pin this database to its deploy, such as the account secret check (lib/account/secretCheck.ts).
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  kakao_key TEXT UNIQUE,              -- HMAC of the Kakao user id, NULL once erased
  nickname TEXT,                      -- NULL once erased
  customer_key TEXT NOT NULL UNIQUE,  -- Toss customerKey
  age_confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  deleted_at INTEGER,                 -- 회원 탈퇴: nothing is granted, reserved or saved after this
  erased_at INTEGER                   -- personal data erased (the cron finishes an interrupted erase)
);
CREATE INDEX users_deleted ON users(deleted_at, erased_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- One signup gift per Kakao account. Kept while an account with this key exists, and for a year after it is deleted.
CREATE TABLE gift_claims (
  kakao_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL,
  account_deleted_at INTEGER          -- set when the account is deleted, cleared if the same Kakao account joins again
);
CREATE INDEX gift_claims_deleted ON gift_claims(account_deleted_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,                -- the Toss orderId
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  amount_krw INTEGER NOT NULL CHECK (amount_krw > 0),
  order_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'confirming', 'paid', 'failed', 'refunding', 'refunded')),
  return_to TEXT NOT NULL,
  withdrawal_ack_at INTEGER NOT NULL, -- when the buyer confirmed the 청약철회 notice
  payment_key TEXT,
  fail_code TEXT,
  cancel_attempt INTEGER NOT NULL DEFAULT 1, -- Toss Idempotency-Key cancel-<id>-<attempt>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX orders_user ON orders(user_id, created_at);
CREATE INDEX orders_status ON orders(status, updated_at);

CREATE TABLE payments (
  payment_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  method TEXT,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  approved_at TEXT,
  receipt_url TEXT,
  canceled_amount INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live', 'mock')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE credit_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  source TEXT NOT NULL CHECK (source IN ('order', 'gift', 'admin')),
  order_id TEXT UNIQUE REFERENCES orders(id),
  product_id TEXT,                    -- earmark: only this product may spend it (NULL = any standard reading)
  units_total INTEGER NOT NULL CHECK (units_total > 0),
  units_left INTEGER NOT NULL CHECK (units_left >= 0 AND units_left <= units_total),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunding', 'refunded', 'expired', 'revoked')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX credit_lots_user ON credit_lots(user_id, currency, status);
CREATE INDEX credit_lots_expiry ON credit_lots(status, expires_at);

CREATE TABLE unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  allocations TEXT NOT NULL,          -- JSON [[lotId, units], ...]
  status TEXT NOT NULL CHECK (status IN ('reserved', 'delivered', 'released')),
  reserved_until INTEGER NOT NULL,
  reading_id TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX unlocks_user ON unlocks(user_id, status);
CREATE INDEX unlocks_status ON unlocks(status, reserved_until);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'reserve', 'spend', 'restore', 'refund', 'expire')),
  units INTEGER NOT NULL CHECK (units > 0),
  lot_id TEXT NOT NULL,
  unlock_id TEXT,
  order_id TEXT,
  idem_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX ledger_user ON ledger(user_id, created_at);
CREATE INDEX ledger_lot ON ledger(lot_id);

-- Readings opened while logged in. No digest and no per-user uniqueness: two identical readings are two purchases.
CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju')),
  product_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paid', 'free', 'owner')),
  unlock_id TEXT UNIQUE,
  payload TEXT NOT NULL,              -- AES-GCM sealed chapter JSON (lib/account/secrets.ts)
  key_version INTEGER NOT NULL,       -- which derived key sealed it, for a future key change
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX readings_user ON readings(user_id, created_at, id);
```

- [ ] **Step 7: Update `apps/web/lib/db/index.ts`** (keep everything P3 put there; it already imports `getDb` from `./d1`)

Replace the last bullet of the header comment, `- Never store birth dates, questions or notes.`, with these lines. The privacy policy changes with it in Task 18 (M6).

```ts
 * - Bonds (P3) never store birth dates, questions or notes.
 * - Accounts (P4) keep readings opened while logged in: question, situation, note or birth data,
 *   sealed with AES-256-GCM (lib/account/secrets.ts) and erased on account deletion or on request.
```

Then append:

```ts
import type { D1Binding } from "./d1";

let testDb: D1Binding | null = null;

/**
 * D1 for accounts, payments and saved readings (P4): the test database when one is set, else
 * getDb(). Null outside Workers unless `next dev` runs with STARLOG_CF_DEV=1; account and payment
 * routes then answer 503 PAY_UNAVAILABLE. Unlike the bonds repo there is no Map store: money rules
 * live in SQL constraints, so tests run the same SQL on node:sqlite (testing/sqliteD1.ts) and on
 * local D1 (testing/localD1.ts).
 */
export function accountDb(): D1Binding | null {
  return testDb ?? getDb();
}

/** Tests only: accountDb() returns `db` until this is called again with null. */
export function setTestDb(db: D1Binding | null): void {
  testDb = db;
}
```

If `getDb` is only re-exported (`export { getDb } from "./d1"`) and not imported, add `import { getDb } from "./d1";`.

- [ ] **Step 8: Opt-in local bindings for `next dev`** — at the bottom of `apps/web/next.config.ts`:

```ts
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// STARLOG_CF_DEV=1: `next dev` gets the Worker's bindings from wrangler.jsonc through Miniflare (local
// D1 for accounts and payments, simulated KV and rate limiters). Run `pnpm --filter @starlog/web
// db:migrate:local` first. Off by default, so P3's memory repos keep serving plain `next dev`.
if (process.env.STARLOG_CF_DEV === "1") void initOpenNextCloudflareForDev();
```

(Move the `import` to the top of the file with the other imports.)

- [ ] **Step 9: Add scripts to `apps/web/package.json`** (skip any P3 already added under the same name)

```json
"db:migrate:local": "wrangler d1 migrations apply starlog --local",
"db:migrate:remote": "wrangler d1 migrations apply starlog --remote"
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run apps/web/lib/db/accountDb.test.ts apps/web/lib/db/accountSchema.int.test.ts apps/web/lib/db`
Expected: PASS. accountDb has 7 tests and the int test 1. P3's memory and int suites still pass.

Run: `pnpm --filter @starlog/web db:migrate:local`
Expected:
- `0002_accounts_payments.sql` listed and applied, with `✅` and no SQL error.
- In a non-interactive shell wrangler prints "Using fallback value in non-interactive context: yes".
- It writes only to `apps/web/.wrangler/state` (gitignored).

When the first revision of this plan was written, these were checked on the D1 engine (wrangler 4.143 `d1 execute --local`), against that revision's 0002:
- The migration applied after P3's 0001 with no SQL error.
- A statement that drove `units_left` below 0 rolled its whole multi-statement execute back.
- The guarded `INSERT … SELECT … WHERE EXISTS (… status = 'reserved')` wrote nothing for a released unlock.
- `UPDATE … RETURNING` returned the row.

Revision 2 adds `meta`, `users.erased_at`, `gift_claims.account_deleted_at`, `orders.cancel_attempt` and indexes, and drops `users.bonds_owner_id` and `readings.digest`. The revised file was checked in the planner's scratch folder:
- on node:sqlite after P3's 0001, both whole and split the way `migrationStatements()` splits it (33 statements);
- on the D1 engine with `wrangler d1 execute --local --file` (0001 then 0002): 14 tables, no error.
- `wrangler d1 migrations apply --local` itself answered `read ECONNRESET` in that sandbox, so this step is its first real run: report its output.

`openLocalD1()` (getPlatformProxy) could not start workerd from the planner's sandbox (`fetch failed` / `ECONNRESET`). The coordinator's environment ran P3's `d1BondsRepo.int.test.ts` with it (8 passed). If it fails for you, report it rather than skipping silently. The node:sqlite suites still gate the task.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/db/sqlErrors.ts apps/web/lib/db/index.ts apps/web/lib/db/testing apps/web/lib/db/accountDb.test.ts apps/web/lib/db/accountSchema.int.test.ts apps/web/migrations/0002_accounts_payments.sql apps/web/next.config.ts apps/web/package.json
git commit -m "feat(db): P4 schema, node:sqlite test D1 and local-D1 checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Catalog, payment modes, unlock methods

**Files:**
- Create: `apps/web/lib/pay/catalog.ts`, `apps/web/lib/pay/mode.ts`, `apps/web/lib/pay/unlockMethod.ts`
- Modify: `apps/web/.env.example` (names only)
- Test: `apps/web/lib/pay/catalog.test.ts`, `apps/web/lib/pay/mode.test.ts`

**Interfaces:**
- Consumes: `SITE.price` (`tarotStandardKrw`, `sajuStandardKrw`, `unitsPerReading`, `premium[] {id, name, sub, krw, open, opens}`) from `apps/web/lib/config.ts`
- Produces:
  - `catalog.ts` (client-safe, no `server-only`):
    - `type StandardProductId = "tarot" | "saju"`
    - `type ProductId = StandardProductId | "tarot-deep" | "match" | "newyear-2027"`
    - `interface Product { id; name; orderName; krw; units: number | null; deliverable: boolean; opensAt?: number }`
    - `PRODUCTS`, `productById(id: string): Product | null`, `standardProduct(kind: StandardProductId): Product`, `sellable(p: Product, now: number): boolean`, `unitsFor(p: Product): number`, `NEWYEAR_OPENS_AT`
    - `GIFT_DAYS = 90` (별조각 lifetime; the ledger and the terms page read it here)
  - `mode.ts` (server-only):
    - `type PaymentsMode = "off" | "owner" | "on" | "paused"`, `paymentsMode(env?)`
    - `salesOpen(mode, owner)` (new orders, new accounts, signup gifts), `loginOpen(mode, owner)` (existing accounts may log in), `openingOffer(mode)` (the 오픈 기념 free daily full reading applies)
  - `unlockMethod.ts` (client-safe): `UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const`, `type UnlockMethod` (here rather than in Task 10, so the client tasks 14–17 never wait for the server lane)
    - `type PayProvider = "toss" | "mock"`, `payProvider(env?)`, `tossClientKey(env?)`, `payConfigProblems(env?): string[]`

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/pay/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { GIFT_DAYS, NEWYEAR_OPENS_AT, PRODUCTS, productById, sellable, standardProduct, unitsFor } from "./catalog";

const NOW = Date.parse("2026-10-01T12:00:00+09:00");

describe("catalog", () => {
  it("prices the standard readings from SITE and lets 별조각 open them", () => {
    expect(standardProduct("tarot")).toMatchObject({ id: "tarot", name: "타로 전체 풀이", krw: SITE.price.tarotStandardKrw, units: SITE.price.unitsPerReading, deliverable: true });
    expect(standardProduct("saju")).toMatchObject({ id: "saju", name: "사주 전체 풀이", krw: SITE.price.sajuStandardKrw, units: SITE.price.unitsPerReading, deliverable: true });
    expect(sellable(standardProduct("tarot"), NOW)).toBe(true);
  });

  it("lists every premium reading from SITE at its price, none sellable before its generator exists", () => {
    expect(SITE.price.premium.length).toBeGreaterThan(0);
    for (const premium of SITE.price.premium) {
      const product = productById(premium.id);
      expect(product).toMatchObject({ name: premium.name, krw: premium.krw, units: null, deliverable: false });
      expect(sellable(product!, Date.parse("2027-06-01T00:00:00+09:00"))).toBe(false);
    }
    expect([productById("tarot-deep")?.krw, productById("match")?.krw, productById("newyear-2027")?.krw]).toEqual([5900, 9900, 9900]);
  });

  it("opens 2027 신년운세 at 2026-11-15 00:00 KST", () => {
    expect(NEWYEAR_OPENS_AT).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
    expect(productById("newyear-2027")?.opensAt).toBe(NEWYEAR_OPENS_AT);
    const opened = { ...productById("newyear-2027")!, deliverable: true };
    expect(sellable(opened, NEWYEAR_OPENS_AT - 1)).toBe(false);
    expect(sellable(opened, NEWYEAR_OPENS_AT)).toBe(true);
  });

  it("knows no other ids", () => {
    expect(productById("moon-30")).toBeNull();
    expect(productById("")).toBeNull();
  });

  it("never names the 10-card spread after its tradition", () => {
    expect(JSON.stringify(PRODUCTS)).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("gives Toss an order name of 100 characters or fewer", () => {
    for (const product of PRODUCTS) expect(product.orderName.length).toBeLessThanOrEqual(100);
    expect(standardProduct("tarot").orderName).toBe(`${SITE.nameKo} 타로 전체 풀이`);
  });

  it("puts a standard reading's 별조각 price in a paid lot, one opening for premium", () => {
    expect(unitsFor(standardProduct("tarot"))).toBe(SITE.price.unitsPerReading);
    expect(unitsFor(productById("match")!)).toBe(1);
  });

  it("keeps 별조각 for 90 KST days", () => {
    expect(GIFT_DAYS).toBe(90);
  });
});
```

`apps/web/lib/pay/mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginOpen, openingOffer, payConfigProblems, payProvider, paymentsMode, salesOpen, tossClientKey } from "./mode";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const KEYS = { NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm", TOSS_SECRET_KEY: "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6" };

describe("payment modes", () => {
  it("defaults to off and reads owner, on and paused", () => {
    expect(paymentsMode(env({}))).toBe("off");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: " ON " }))).toBe("on");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "owner" }))).toBe("owner");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "paused" }))).toBe("paused");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "yes" }))).toBe("off");
  });

  it("opens sales for everyone when on, for owner-pass devices when owner, for nobody when off or paused", () => {
    expect([salesOpen("on", false), salesOpen("owner", false), salesOpen("owner", true), salesOpen("off", true), salesOpen("paused", true)]).toEqual([true, false, true, false, false]);
  });

  it("keeps login open for existing accounts while paused, so a rollback never locks buyers out", () => {
    expect([loginOpen("paused", false), loginOpen("on", false), loginOpen("owner", false), loginOpen("owner", true), loginOpen("off", true)]).toEqual([true, true, false, true, false]);
  });

  it("ends the 오픈 기념 free full reading only while sales are on for everyone", () => {
    expect([openingOffer("off"), openingOffer("owner"), openingOffer("on"), openingOffer("paused")]).toEqual([true, true, false, true]);
  });

  it("accepts a matching test or live key pair and reads the client key at run time", () => {
    expect(payConfigProblems(env(KEYS))).toEqual([]);
    expect(payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_gck_a", TOSS_SECRET_KEY: "live_gsk_b" }))).toEqual([]);
    expect(tossClientKey(env(KEYS))).toBe(KEYS.NEXT_PUBLIC_TOSS_CLIENT_KEY);
  });

  it("names missing, malformed and mixed keys, never their values", () => {
    expect(payConfigProblems(env({}))).toEqual(["NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"]);
    expect(payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_x", TOSS_SECRET_KEY: "test_sk_y" }))).toEqual(["NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"]);
    const mixed = payConfigProblems(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_abc", TOSS_SECRET_KEY: "live_gsk_secretvalue" }));
    expect(mixed).toEqual(["TOSS keys mix test and live"]);
    expect(mixed.join(" ")).not.toContain("secretvalue");
  });

  it("allows the mock Toss outside production only", () => {
    expect(payProvider(env({ STARLOG_PAY: "mock" }))).toBe("mock");
    expect(payConfigProblems(env({ STARLOG_PAY: "mock", NODE_ENV: "development" }))).toEqual([]);
    expect(payConfigProblems(env({ STARLOG_PAY: "mock", NODE_ENV: "production" }))).toEqual(["STARLOG_PAY=mock in production"]);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/pay/catalog.test.ts apps/web/lib/pay/mode.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/pay/catalog.ts`**

```ts
import { SITE } from "@/lib/config";

/**
 * What can be bought, at what price. The server takes every amount from here; a request only names
 * a product id. Client-safe (display prices, unlock offers).
 */

export type StandardProductId = "tarot" | "saju";
export type ProductId = StandardProductId | "tarot-deep" | "match" | "newyear-2027";

export interface Product {
  id: ProductId;
  name: string;
  /** Toss orderName, 100 characters at most */
  orderName: string;
  krw: number;
  /** 별조각 (or future 달빛) units one opening costs; only the standard readings take them */
  units: number | null;
  /** a generator exists, so a purchase can be delivered (premium generators arrive in P5) */
  deliverable: boolean;
  /** first moment it may be sold (ms), for a product that opens later */
  opensAt?: number;
}

/** 별조각 from the signup gift last this many KST days after the day they arrive (spec 14, default 1). */
export const GIFT_DAYS = 90;

/** 2027 신년운세 opens mid-November (spec 14, default 9). */
export const NEWYEAR_OPENS_AT = Date.parse("2026-11-15T00:00:00+09:00");

const STANDARD: Product[] = [
  { id: "tarot", name: "타로 전체 풀이", orderName: `${SITE.nameKo} 타로 전체 풀이`, krw: SITE.price.tarotStandardKrw, units: SITE.price.unitsPerReading, deliverable: true },
  { id: "saju", name: "사주 전체 풀이", orderName: `${SITE.nameKo} 사주 전체 풀이`, krw: SITE.price.sajuStandardKrw, units: SITE.price.unitsPerReading, deliverable: true },
];

const PREMIUM: Product[] = SITE.price.premium.map((premium) => ({
  id: premium.id as ProductId,
  name: premium.name,
  orderName: `${SITE.nameKo} ${premium.name}`,
  krw: premium.krw,
  units: null,
  deliverable: false,
  ...(premium.id === "newyear-2027" ? { opensAt: NEWYEAR_OPENS_AT } : {}),
}));

export const PRODUCTS: readonly Product[] = [...STANDARD, ...PREMIUM];

export function productById(id: string): Product | null {
  return PRODUCTS.find((product) => product.id === id) ?? null;
}

export function standardProduct(kind: StandardProductId): Product {
  return productById(kind)!;
}

/** A new order may be created for it now. */
export function sellable(product: Product, now: number): boolean {
  return product.deliverable && (product.opensAt === undefined || product.opensAt <= now);
}

/** Units a paid lot holds for one purchase: the standard 별조각 price, or 1 opening for premium. */
export function unitsFor(product: Product): number {
  return product.units ?? 1;
}
```

If `SITE.price.premium` is missing from `apps/web/lib/config.ts` (Task 0 should have caught it), add it inside `price`, exactly:

```ts
    /**
     * Premium readings, listed on /pricing as 준비 중 until each opens (`open: true`). The 10-card
     * spread is never named after its tradition in the UI.
     */
    premium: [
      { id: "tarot-deep", name: "심층 타로", sub: "카드 10장으로 깊게 보는 흐름", krw: 5900, open: false, opens: "" },
      { id: "match", name: "우리 사이 궁합", sub: "사주와 타로로 함께 보는 두 사람", krw: 9900, open: false, opens: "" },
      { id: "newyear-2027", name: "2027 신년운세", sub: "사주로 미리 보는 2027년 한 해", krw: 9900, open: false, opens: "11월 중순 오픈 예정" },
    ],
```

- [ ] **Step 4: Write `apps/web/lib/pay/mode.ts`**

```ts
import "server-only";

/**
 * Feature flags for accounts and payments (spec section 12):
 * - `STARLOG_PAYMENTS`:
 *   - `off` (default): no login, no payments; the site as it is today;
 *   - `owner`: sales, sign-up and gifts open for owner-pass devices only;
 *   - `on`: open for everyone. The 오픈 기념 free daily full reading ends; the signup gift replaces it;
 *   - `paused` (the rollback): no new orders, accounts or gifts, but existing accounts can still log
 *     in to open, refund or delete what they hold, and the 오픈 기념 reading comes back.
 * - Spending credit a user already holds is never gated by it.
 * - `STARLOG_PAY=mock` swaps Toss for the in-memory mock (tests, e2e, local dev); refused in production.
 */

export type PaymentsMode = "off" | "owner" | "on" | "paused";

export function paymentsMode(env: NodeJS.ProcessEnv = process.env): PaymentsMode {
  const value = env.STARLOG_PAYMENTS?.trim().toLowerCase();
  return value === "on" || value === "owner" || value === "paused" ? value : "off";
}

/** New orders, new accounts and signup gifts are open for this device. */
export function salesOpen(mode: PaymentsMode, owner: boolean): boolean {
  return mode === "on" || (mode === "owner" && owner);
}

/** An existing account may log in on this device (a new one only while salesOpen). */
export function loginOpen(mode: PaymentsMode, owner: boolean): boolean {
  return salesOpen(mode, owner) || mode === "paused";
}

/** The 오픈 기념 free daily full reading applies until sales open for everyone. */
export function openingOffer(mode: PaymentsMode): boolean {
  return mode !== "on";
}

export type PayProvider = "toss" | "mock";

export function payProvider(env: NodeJS.ProcessEnv = process.env): PayProvider {
  return env.STARLOG_PAY?.trim().toLowerCase() === "mock" ? "mock" : "toss";
}

/**
 * The widget client key, read at run time through `env` (a literal `process.env.NEXT_PUBLIC_…` would
 * be inlined at build time). It must change together with TOSS_SECRET_KEY, so the server hands it
 * to the checkout page.
 */
export function tossClientKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
}

/** What stops payments from running, by variable name (never a value); empty when fine. */
export function payConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (payProvider(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_PAY=mock in production"] : [];
  const client = tossClientKey(env);
  const secret = env.TOSS_SECRET_KEY?.trim() ?? "";
  const problems: string[] = [];
  if (!/^(test|live)_gck_\S+$/.test(client)) problems.push("NEXT_PUBLIC_TOSS_CLIENT_KEY");
  if (!/^(test|live)_gsk_\S+$/.test(secret)) problems.push("TOSS_SECRET_KEY");
  if (problems.length === 0 && client.split("_")[0] !== secret.split("_")[0]) problems.push("TOSS keys mix test and live");
  return problems;
}
```

- [ ] **Step 5: Write `apps/web/lib/pay/unlockMethod.ts`** (client-safe)

```ts
/** How a full reading is opened: the 오픈 기념 daily free one, a paid purchase, 별조각, or the owner pass. */
export const UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
```

- [ ] **Step 6: Add the P4 names to `apps/web/.env.example`** (names and comments only, never values)

```bash
# ---- P4 accounts and payments (docs/runbook-payments.md) ----
# off (default: no login or payments) | owner (only owner-pass devices) | on | paused (rollback: no new sales, logins still work)
STARLOG_PAYMENTS=
# toss (default) | mock (in-memory Toss for tests, e2e and local dev; refused in production)
STARLOG_PAY=
# kakao (default) | mock (mock:<name> codes for tests and e2e; refused in production)
STARLOG_KAKAO=
# Toss Payments widget keys: both test_ or both live_ (the server refuses a mixed pair).
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
# Kakao Login: REST API key and client secret (app console > 앱 > 플랫폼 키 > REST API 키).
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
# 32+ random characters. Keys Kakao lookups and encrypts saved readings. NEVER rotate it: D1 pins
# it (meta.account_secret_check) and account routes answer 503 when it changes.
STARLOG_ACCOUNT_SECRET=
# 32+ random characters. The Cron Trigger's bearer token for /api/internal/maintenance.
STARLOG_CRON_SECRET=
# 1 = `next dev` gets local D1, KV and limiters through Miniflare (run db:migrate:local first).
STARLOG_CF_DEV=
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/lib/pay/catalog.test.ts apps/web/lib/pay/mode.test.ts`
Expected: PASS (8 + 7 tests).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/pay/catalog.ts apps/web/lib/pay/mode.ts apps/web/lib/pay/unlockMethod.ts apps/web/lib/pay/catalog.test.ts apps/web/lib/pay/mode.test.ts apps/web/.env.example
git commit -m "feat(pay): product catalog and payment modes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Account core — secrets (HKDF, D1 check), users, sessions, request guards, error codes, limiters

**Files:**
- Create: `apps/web/lib/account/secrets.ts`, `apps/web/lib/account/secretCheck.ts`, `apps/web/lib/account/users.ts`, `apps/web/lib/account/session.ts`, `apps/web/lib/account/request.ts`, `apps/web/lib/account/redirect.ts`, `apps/web/lib/account/returnTo.ts`
- Modify: `apps/web/lib/api/http.ts` (error codes), `apps/web/lib/security/rateLimit.ts` (limiter names), `apps/web/lib/cloudflare.ts` (binding types), `apps/web/wrangler.jsonc` (`ratelimits` entries only)
- Test: `apps/web/lib/account/account.test.ts`

**Interfaces:**
- Consumes:
  - `accountDb()` (Task 1);
  - `signToken`, `verifyToken`, `randomId`, `signingSecret` from `lib/security/sign.ts`;
  - `isOwner`, `OWNER_COOKIE` from `lib/security/owner.ts`;
  - `rateLimit`, `LimiterName` from `lib/security/rateLimit.ts`;
  - `errorResponse`, `parseCookies`, `clientKey`, `serializeCookie`, `CookieSpec` from `lib/api/http.ts`.
- Produces:
  - `secrets.ts`:
    - `accountSecret(env?): string | null`
    - `kakaoKey(kakaoId, secret): Promise<string>`, `secretCheckValue(secret): Promise<string>`
    - `READING_KEY_VERSION = 1`, `sealJson(value, secret, version?): Promise<string>`, `openJson<T>(sealed, secret, version?): Promise<T | null>`
    - every key is an HKDF-SHA256 subkey of the secret with its own purpose (`kakao-lookup`, `secret-check`, `readings-v<n>`)
  - `secretCheck.ts`: `SECRET_CHECK_KEY = "account_secret_check"`, `accountSecretMatches(db, secret, now): Promise<boolean>`, `resetSecretCheck()` (tests)
  - `users.ts`:
    - `interface UserRow { id; kakao_key: string | null; nickname: string | null; customer_key; age_confirmed_at: number | null; created_at; last_login_at; deleted_at: number | null; erased_at: number | null }`
    - `cleanNickname(v: unknown): string`
    - `loginKakaoUser(db, {key, nickname, ageConfirmed, now}): Promise<{user: UserRow; created: boolean} | null>` (null: that Kakao account's previous account is still being erased)
    - `userById(db, id)`, `userByKakaoKey(db, key)`: live accounts only
  - `session.ts`:
    - `SESSION_COOKIE = "sl_sid"`, `SESSION_TTL_MS`, `interface Session { id; user: UserRow }`
    - `createSession(db, userId, secret, now): Promise<{id; cookie: CookieSpec}>`
    - `readSession(db, cookieValue, secret, now): Promise<Session | null>`
    - `revokeSession(db, id, now)`, `CLEAR_SESSION: CookieSpec`
  - `request.ts`:
    - `interface AccountContext { db; secret; accountSecret; now; cookies; owner; session: Session | null }`
    - `openAccount(request, now?)`: 503 `PAY_UNAVAILABLE` without D1 or a secret, or when the account secret does not match D1's check (M8)
    - `openAccountRoute(request, {limiter, write?})`, `requireSession(ctx): Session | Response`, `sameOrigin(request): boolean`
  - `redirect.ts`: `redirectTo(request, target, query?, cookies?: Array<CookieSpec | string>): Response` (303)
  - `returnTo.ts` (client-safe): `safeReturnTo(v): string`, `withQuery(path, query): string`
  - `http.ts` `ErrorCode` gains:
    - `LOGIN_REQUIRED` 401, `PAYMENT_REQUIRED` 402, `NO_CREDIT` 402, `PAY_FAILED` 402;
    - `FORBIDDEN` 403;
    - `NOT_AVAILABLE` 409, `PAY_PENDING` 409, `NOT_REFUNDABLE` 409;
    - `PAY_UNAVAILABLE` 503.
  - limiters: `AUTH_LIMITER` 20/60 s, `PAY_LIMITER` 20/60 s, `WEBHOOK_LIMITER` 60/60 s

**Why the D1 check (M8):**
- A changed `STARLOG_ACCOUNT_SECRET` would not fail loudly. Every Kakao lookup would miss, so returning users would get fresh empty accounts and fresh signup gifts, and no saved reading would open.
- The first request on a database records an HMAC check value in `meta`. After that, a secret that does not produce the same value gets 503 on every account route, logged once by name. It never gets a wrong answer.
- `key_version` on each reading and the `readings-v<n>` purpose leave room for a later key change. P4 never rotates: version 1 only.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/account/account.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorPayload, type ErrorCode } from "@/lib/api/http";
import { setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { signingSecret } from "@/lib/security/sign";
import { openAccount, sameOrigin } from "./request";
import { safeReturnTo, withQuery } from "./returnTo";
import { SECRET_CHECK_KEY, accountSecretMatches, resetSecretCheck } from "./secretCheck";
import { accountSecret, kakaoKey, openJson, sealJson, secretCheckValue } from "./secrets";
import { CLEAR_SESSION, SESSION_COOKIE, SESSION_TTL_MS, createSession, readSession, revokeSession } from "./session";
import { cleanNickname, loginKakaoUser, userByKakaoKey, userById } from "./users";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const ACCOUNT = "account-secret-for-tests-0123456789abcdef";
const SIGNING = "signing-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-01T03:00:00Z");

afterEach(() => {
  setTestDb(null);
  resetSecretCheck();
  vi.restoreAllMocks();
});

async function login(db: ReturnType<typeof migratedTestD1>, key: string, nickname = "별빛", now = NOW) {
  const result = await loginKakaoUser(db, { key, nickname, ageConfirmed: true, now });
  if (!result) throw new Error("no account");
  return result;
}

describe("account secret", () => {
  it("needs 32+ characters in production and falls back outside it", () => {
    expect(accountSecret(env({ NODE_ENV: "production" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: "short" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: ACCOUNT }))).toBe(ACCOUNT);
    expect(accountSecret(env({ NODE_ENV: "development" }))!.length).toBeGreaterThanOrEqual(32);
  });

  it("keeps a keyed hash of the Kakao id, never the id, under its own derived key", async () => {
    const key = await kakaoKey("1234567890", ACCOUNT);
    expect(key).toBe(await kakaoKey("1234567890", ACCOUNT));
    expect(key).not.toContain("1234567890");
    expect(key).not.toBe(await kakaoKey("1234567890", `${ACCOUNT}x`));
    expect(key).not.toBe(await kakaoKey("1234567891", ACCOUNT));
    expect(await secretCheckValue(ACCOUNT)).not.toBe(key);
  });

  it("seals JSON with AES-GCM: round trip, a fresh IV each time, tampering, the wrong key and the wrong version rejected", async () => {
    const value = { question: "이번 주 재물 흐름", birth: { year: 1990 } };
    const sealed = await sealJson(value, ACCOUNT);
    expect(sealed).not.toContain("재물");
    expect(await openJson(sealed, ACCOUNT)).toEqual(value);
    expect(await openJson(sealed, ACCOUNT, 1)).toEqual(value);
    expect(await sealJson(value, ACCOUNT)).not.toBe(sealed);
    const flipped = `${sealed.slice(0, -2)}${sealed.at(-2) === "A" ? "B" : "A"}${sealed.at(-1)}`;
    expect(await openJson(flipped, ACCOUNT)).toBeNull();
    expect(await openJson(sealed, `${ACCOUNT}x`)).toBeNull();
    expect(await openJson(sealed, ACCOUNT, 2)).toBeNull();
    expect(await openJson("", ACCOUNT)).toBeNull();
  });
});

describe("the D1 secret check", () => {
  it("pins a fresh database to the first secret and refuses any other", async () => {
    const db = migratedTestD1();
    expect(await accountSecretMatches(db, ACCOUNT, NOW)).toBe(true);
    expect(await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first()).toEqual({ value: await secretCheckValue(ACCOUNT) });
    expect(await accountSecretMatches(db, ACCOUNT, NOW + 1)).toBe(true);
    resetSecretCheck();
    expect(await accountSecretMatches(db, `${ACCOUNT}-rotated`, NOW + 2)).toBe(false);
    expect((await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first<{ value: string }>())!.value).toBe(await secretCheckValue(ACCOUNT));
  });

  it("closes account routes with 503 when the secret changed, and says so once in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = migratedTestD1();
    setTestDb(db);
    await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, 'made-by-another-secret', 0)").bind(SECRET_CHECK_KEY).run();
    const res = await openAccount(new Request("http://localhost/api/me"));
    expect(res instanceof Response && res.status).toBe(503);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("config.account_secret_mismatch"));
  });
});

describe("users", () => {
  it("cleans nicknames", () => {
    expect(cleanNickname(" 별빛\u0007 ")).toBe("별빛");
    expect(cleanNickname("<별>")).toBe("별");
    expect(cleanNickname("가".repeat(30))).toBe("가".repeat(20));
    expect(cleanNickname("")).toBe("별손님");
    expect(cleanNickname(undefined)).toBe("별손님");
  });

  it("creates an account once per Kakao key and updates it on later logins", async () => {
    const db = migratedTestD1();
    const first = await login(db, "k1");
    expect(first.created).toBe(true);
    expect(first.user).toMatchObject({ kakao_key: "k1", nickname: "별빛", age_confirmed_at: NOW, created_at: NOW, deleted_at: null, erased_at: null });
    expect(first.user.customer_key).toMatch(/^c_[A-Za-z0-9_-]{24}$/);
    const again = await loginKakaoUser(db, { key: "k1", nickname: "달빛", ageConfirmed: false, now: NOW + 1000 });
    expect(again?.created).toBe(false);
    expect(again?.user).toMatchObject({ id: first.user.id, nickname: "달빛", age_confirmed_at: NOW, last_login_at: NOW + 1000, customer_key: first.user.customer_key });
    expect((await userByKakaoKey(db, "k1"))?.id).toBe(first.user.id);
  });

  it("gives an erased account's Kakao key a fresh account, and refuses one still being erased", async () => {
    const db = migratedTestD1();
    const { user } = await login(db, "k1");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(NOW, user.id).run();
    expect(await userById(db, user.id)).toBeNull();
    expect(await userByKakaoKey(db, "k1")).toBeNull();
    expect(await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW + 1 })).toBeNull();
    await db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, erased_at = ? WHERE id = ?").bind(NOW + 2, user.id).run();
    const next = await login(db, "k1", "별빛", NOW + 3);
    expect(next.created).toBe(true);
    expect(next.user.id).not.toBe(user.id);
  });

  it("ties a deleted account's gift claim to the Kakao account again when it rejoins", async () => {
    const db = migratedTestD1();
    await db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k1', 0, 5)").run();
    await login(db, "k1");
    expect(await db.prepare("SELECT account_deleted_at FROM gift_claims WHERE kakao_key = 'k1'").first()).toEqual({ account_deleted_at: null });
  });
});

describe("sessions", () => {
  it("reads a live session, never an expired, revoked, forged or deleted one", async () => {
    const db = migratedTestD1();
    const { user } = await login(db, "k1");
    const { id, cookie } = await createSession(db, user.id, SIGNING, NOW);
    expect(cookie).toMatchObject({ name: SESSION_COOKIE, maxAge: SESSION_TTL_MS / 1000 });
    expect((await readSession(db, cookie.value, SIGNING, NOW + 1000))?.user.id).toBe(user.id);
    expect(await readSession(db, cookie.value, SIGNING, NOW + SESSION_TTL_MS)).toBeNull();
    expect(await readSession(db, cookie.value, `${SIGNING}x`, NOW)).toBeNull();
    expect(await readSession(db, undefined, SIGNING, NOW)).toBeNull();
    await revokeSession(db, id, NOW + 1);
    expect(await readSession(db, cookie.value, SIGNING, NOW + 2)).toBeNull();
    const second = await createSession(db, user.id, SIGNING, NOW);
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(NOW, user.id).run();
    expect(await readSession(db, second.cookie.value, SIGNING, NOW + 1)).toBeNull();
    expect(CLEAR_SESSION).toEqual({ name: SESSION_COOKIE, value: "", maxAge: 0 });
  });
});

describe("request guards", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/api/pay/orders", { method: "POST", headers });

  it("accepts only our own origin, falling back to the referer", () => {
    expect(sameOrigin(request({ origin: "http://localhost" }))).toBe(true);
    expect(sameOrigin(request({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(request({ referer: "http://localhost/tarot/result" }))).toBe(true);
    expect(sameOrigin(request({ referer: "https://evil.example/x" }))).toBe(false);
    expect(sameOrigin(request({}))).toBe(false);
  });

  it("answers 503 without D1, and finds the session with it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const none = await openAccount(request({}));
    expect(none instanceof Response && none.status).toBe(503);
    const db = migratedTestD1();
    setTestDb(db);
    const { user } = await login(db, "k1", "별빛", Date.now());
    const { cookie } = await createSession(db, user.id, signingSecret()!, Date.now());
    const ctx = await openAccount(request({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookie.value)}` }));
    if (ctx instanceof Response) throw new Error(`unexpected ${ctx.status}`);
    expect(ctx.session?.user.id).toBe(user.id);
    expect(ctx.owner).toBe(false);
  });
});

describe("error codes and return paths", () => {
  it("maps the P4 codes to their statuses", () => {
    const codes: ErrorCode[] = ["LOGIN_REQUIRED", "PAYMENT_REQUIRED", "NO_CREDIT", "PAY_FAILED", "FORBIDDEN", "NOT_AVAILABLE", "PAY_PENDING", "NOT_REFUNDABLE", "PAY_UNAVAILABLE"];
    expect(codes.map((code) => errorPayload(code).status)).toEqual([401, 402, 402, 402, 403, 409, 409, 409, 503]);
    for (const code of codes) expect(errorPayload(code).body.message).toMatch(/요\.$/);
  });

  it("keeps return paths on this site", () => {
    expect(safeReturnTo("/tarot/result")).toBe("/tarot/result");
    expect(safeReturnTo("/me?delete=failed")).toBe("/me?delete=failed");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "tarot", "/a b", `/${"x".repeat(200)}`, null, undefined]) {
      expect(safeReturnTo(bad)).toBe("/");
    }
    expect(withQuery("/tarot/result", { unlock: "paid" })).toBe("/tarot/result?unlock=paid");
    expect(withQuery("/me?a=1", { login: "ok" })).toBe("/me?a=1&login=ok");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/lib/account/account.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add the error codes to `apps/web/lib/api/http.ts`.** Extend the `ErrorCode` union with the nine codes. Add these entries to `STATUS` and `MESSAGE` and change nothing else.

```ts
// STATUS
  LOGIN_REQUIRED: 401,
  PAYMENT_REQUIRED: 402,
  NO_CREDIT: 402,
  PAY_FAILED: 402,
  FORBIDDEN: 403,
  NOT_AVAILABLE: 409,
  PAY_PENDING: 409,
  NOT_REFUNDABLE: 409,
  PAY_UNAVAILABLE: 503,

// MESSAGE
  LOGIN_REQUIRED: "로그인이 필요해요. 로그인하고 다시 시도해 주세요.",
  PAYMENT_REQUIRED: "전체 풀이는 결제하거나 별조각으로 열 수 있어요.",
  NO_CREDIT: "쓸 수 있는 결제한 풀이나 별조각이 없어요.",
  PAY_FAILED: "결제를 마치지 못했어요. 청구된 금액은 없어요.",
  FORBIDDEN: "이 요청은 받을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  NOT_AVAILABLE: "지금은 열 수 없는 상품이에요.",
  PAY_PENDING: "결제를 확인하고 있어요. 잠시 뒤에 다시 확인해 주세요.",
  NOT_REFUNDABLE: "이미 연 풀이이거나 환불할 수 없는 결제예요.",
  PAY_UNAVAILABLE: "지금은 로그인과 결제를 쓸 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
```

- [ ] **Step 4: Add the limiters.**
  - `apps/web/lib/security/rateLimit.ts`:
    - add `"AUTH_LIMITER" | "PAY_LIMITER" | "WEBHOOK_LIMITER"` to `LimiterName`;
    - add to `LIMITS_PER_MINUTE`:

```ts
  /** Kakao login start/callback, logout, delete intent, account readings (P4) */
  AUTH_LIMITER: 20,
  /** checkout, orders, confirm, refund (P4) */
  PAY_LIMITER: 20,
  /** Toss webhooks (P4) */
  WEBHOOK_LIMITER: 60,
```

  - `apps/web/lib/cloudflare.ts`: add `AUTH_LIMITER?: RateLimitBinding; PAY_LIMITER?: RateLimitBinding; WEBHOOK_LIMITER?: RateLimitBinding;` to `CloudflareEnv`.
  - `apps/web/wrangler.jsonc`: append to `ratelimits`. P2b uses 1001–1005 and P3 1006–1008 (`BOND_VIEW_LIMITER` is 1008 at aa70830); if an 11xx id is taken by then, pick the next free 11xx and say so in your report.

```jsonc
    { "name": "AUTH_LIMITER", "namespace_id": "1101", "simple": { "limit": 20, "period": 60 } },
    { "name": "PAY_LIMITER", "namespace_id": "1102", "simple": { "limit": 20, "period": 60 } },
    { "name": "WEBHOOK_LIMITER", "namespace_id": "1103", "simple": { "limit": 60, "period": 60 } }
```

- [ ] **Step 5: Write `apps/web/lib/account/secrets.ts`**

```ts
import "server-only";

/** Used only outside production, so local runs work without configuration. */
const DEV_ACCOUNT_SECRET = "starlog-dev-only-account-secret-never-used-in-production";

/**
 * STARLOG_ACCOUNT_SECRET keys the stored Kakao lookup value and encrypts saved readings. Never
 * rotate it: D1 pins it (secretCheck.ts) and account routes close when it changes. Null in
 * production when it is missing or shorter than 32 characters; account routes then answer 503.
 */
export function accountSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.STARLOG_ACCOUNT_SECRET?.trim() ?? "";
  if (secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") return null;
  return DEV_ACCOUNT_SECRET;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Every key is an HKDF-SHA256 subkey of the secret under its own purpose, so no two uses share key
 * material:
 * - `kakao-lookup`: HMAC key for kakaoKey();
 * - `secret-check`: HMAC key for the value D1 keeps to recognise the secret;
 * - `readings-v<n>`: the AES-256-GCM key for saved readings with key_version n.
 */
type Purpose = "kakao-lookup" | "secret-check" | `readings-v${number}`;

const SALT = encoder.encode("starlog-account-v1");
const baseKeys = new Map<string, Promise<CryptoKey>>();
const subkeys = new Map<string, Promise<CryptoKey>>();

function baseKey(secret: string): Promise<CryptoKey> {
  let key = baseKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
    baseKeys.set(secret, key);
  }
  return key;
}

function subkey(secret: string, purpose: Purpose): Promise<CryptoKey> {
  const id = `${purpose}\u0000${secret}`;
  let key = subkeys.get(id);
  if (!key) {
    key = (async () => {
      const params = { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(purpose) };
      return purpose.startsWith("readings-v")
        ? crypto.subtle.deriveKey(params, await baseKey(secret), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
        : crypto.subtle.deriveKey(params, await baseKey(secret), { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    })();
    subkeys.set(id, key);
  }
  return key;
}

async function mac(secret: string, purpose: "kakao-lookup" | "secret-check", text: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await subkey(secret, purpose), encoder.encode(text));
  return toBase64Url(new Uint8Array(signature));
}

/** How a login finds its account: an HMAC of the Kakao member number. The raw id is never stored. */
export function kakaoKey(kakaoId: string, secret: string): Promise<string> {
  return mac(secret, "kakao-lookup", `kakao:${kakaoId}`);
}

/** What D1 keeps (meta.account_secret_check) to recognise this secret. It reveals nothing about it. */
export function secretCheckValue(secret: string): Promise<string> {
  return mac(secret, "secret-check", "starlog-account-secret");
}

/** The key version new readings are sealed with. Each row keeps its own (readings.key_version). */
export const READING_KEY_VERSION = 1;

/** JSON sealed with AES-GCM: base64url of the 12-byte IV followed by the ciphertext and tag. */
export async function sealJson(value: unknown, secret: string, version: number = READING_KEY_VERSION): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await subkey(secret, `readings-v${version}`), encoder.encode(JSON.stringify(value)));
  const out = new Uint8Array(12 + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), 12);
  return toBase64Url(out);
}

/** The sealed JSON, or null when it was altered, or sealed under another secret or key version. */
export async function openJson<T = unknown>(sealed: string, secret: string, version: number = READING_KEY_VERSION): Promise<T | null> {
  const bytes = fromBase64Url(sealed);
  if (!bytes || bytes.length < 29) return null; // 12-byte IV + 16-byte tag + at least 1 byte
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await subkey(secret, `readings-v${version}`), bytes.slice(12));
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}
```

The HKDF calls were run on Node 25 WebCrypto in the planner's scratch folder: the HMAC subkey signed 32 bytes, and the AES-GCM subkey round-tripped.

- [ ] **Step 6: Write `apps/web/lib/account/secretCheck.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { secretCheckValue } from "./secrets";

export const SECRET_CHECK_KEY = "account_secret_check";

/** The secret that matched in this isolate (one check per isolate, not per request). */
let confirmed: string | null = null;

/**
 * True when `secret` is the account secret this database was first used with (M8). The first call
 * on a fresh database records the check value. After that, a different secret is refused: a typo, a
 * rotation, or a dev secret against production data. Callers answer 503 instead of missing every
 * Kakao lookup (fresh accounts and gifts for returning users) and failing to open every saved reading.
 */
export async function accountSecretMatches(db: D1Binding, secret: string, now: number): Promise<boolean> {
  if (confirmed === secret) return true;
  const value = await secretCheckValue(secret);
  await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING").bind(SECRET_CHECK_KEY, value, now).run();
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first<{ value: string }>();
  if (row?.value !== value) return false;
  confirmed = secret;
  return true;
}

/** Tests only: forget the isolate's confirmed secret. */
export function resetSecretCheck(): void {
  confirmed = null;
}
```

- [ ] **Step 7: Write `apps/web/lib/account/users.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { randomId } from "@/lib/security/sign";

export interface UserRow {
  id: string;
  /** HMAC of the Kakao id (secrets.ts kakaoKey); null once erased */
  kakao_key: string | null;
  nickname: string | null;
  /** Toss customerKey: random, 26 characters, includes "_" (Toss requires a special character) */
  customer_key: string;
  age_confirmed_at: number | null;
  created_at: number;
  last_login_at: number;
  /** 회원 탈퇴: from this moment nothing is granted, reserved or saved for the account */
  deleted_at: number | null;
  /** personal data erased (Task 12; the maintenance cron finishes an interrupted erase) */
  erased_at: number | null;
}

/** At most 20 characters, no control characters or angle brackets; "별손님" when Kakao gave none. */
export function cleanNickname(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return [...text].slice(0, 20).join("") || "별손님";
}

/**
 * The account for a Kakao login, in one statement: an existing account gets its nickname and login
 * time updated, otherwise one is created. `created` is true only for a brand-new account.
 * Null when that Kakao key still belongs to a deleted account whose erase has not finished (the
 * maintenance cron finishes it within minutes); the callback answers login=failed.
 * A Kakao account that joins again takes its old gift claim back (no second signup gift, and the
 * claim is no longer purged a year after the old account's deletion).
 */
export async function loginKakaoUser(
  db: D1Binding,
  input: { key: string; nickname: string; ageConfirmed: boolean; now: number },
): Promise<{ user: UserRow; created: boolean } | null> {
  const id = `u_${randomId(12)}`;
  const user = await db
    .prepare(
      `INSERT INTO users (id, kakao_key, nickname, customer_key, age_confirmed_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kakao_key) DO UPDATE SET
         nickname = excluded.nickname,
         last_login_at = excluded.last_login_at,
         age_confirmed_at = COALESCE(users.age_confirmed_at, excluded.age_confirmed_at)
       WHERE users.deleted_at IS NULL
       RETURNING *`,
    )
    .bind(id, input.key, cleanNickname(input.nickname), `c_${randomId(18)}`, input.ageConfirmed ? input.now : null, input.now, input.now)
    .first<UserRow>();
  if (!user) return null;
  await db.prepare("UPDATE gift_claims SET account_deleted_at = NULL WHERE kakao_key = ? AND account_deleted_at IS NOT NULL").bind(input.key).run();
  return { user, created: user.id === id };
}

/** A live (not deleted) account. */
export function userById(db: D1Binding, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").bind(id).first<UserRow>();
}

/** The live account behind a Kakao key, if any (logins while sales are paused). */
export function userByKakaoKey(db: D1Binding, key: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE kakao_key = ? AND deleted_at IS NULL").bind(key).first<UserRow>();
}
```

The guarded upsert (`DO UPDATE … WHERE users.deleted_at IS NULL RETURNING *`) was run on node:sqlite in the planner's scratch folder: a live key returned the updated row, a deleted key returned no row, a new key returned the new row.

- [ ] **Step 8: Write `apps/web/lib/account/session.ts`**

```ts
import "server-only";
import type { CookieSpec } from "@/lib/api/http";
import type { D1Binding } from "@/lib/db/d1";
import { randomId, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";
import type { UserRow } from "./users";

/**
 * The login session: a signed httpOnly cookie naming a D1 session row, so one can be revoked
 * (logout, account deletion). 30 days, not extended (spec 14, default 3). It lives next to P3's
 * device cookies (sl_uid, sl_fid) and changes nothing about them.
 */

export const SESSION_COOKIE = "sl_sid";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionPayload extends SignedPayload {
  k: "session";
  sid: string;
  exp: number;
}

export interface Session {
  id: string;
  user: UserRow;
}

export async function createSession(db: D1Binding, userId: string, secret: string, now: number): Promise<{ id: string; cookie: CookieSpec }> {
  const id = randomId(24);
  const exp = now + SESSION_TTL_MS;
  await db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(id, userId, now, exp).run();
  const payload: SessionPayload = { k: "session", sid: id, exp };
  return { id, cookie: { name: SESSION_COOKIE, value: await signToken(payload, secret), maxAge: SESSION_TTL_MS / 1000 } };
}

/** The session behind a cookie value, or null (missing, forged, expired, revoked, account deleted). */
export async function readSession(db: D1Binding, cookie: string | undefined, secret: string, now: number): Promise<Session | null> {
  const payload = await verifyToken<SessionPayload>(cookie, "session", secret, now);
  if (!payload || typeof payload.sid !== "string") return null;
  const user = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.deleted_at IS NULL`,
    )
    .bind(payload.sid, now)
    .first<UserRow>();
  return user ? { id: payload.sid, user } : null;
}

export async function revokeSession(db: D1Binding, id: string, now: number): Promise<void> {
  await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, id).run();
}

export const CLEAR_SESSION: CookieSpec = { name: SESSION_COOKIE, value: "", maxAge: 0 };
```

- [ ] **Step 9: Write `apps/web/lib/account/returnTo.ts`** (no `server-only`: the login page uses it too)

```ts
/** Paths a login or a payment may come back to: this site only, no "//", no backslashes, 200 characters at most. */
const RETURN_TO = /^\/(?![/\\])[A-Za-z0-9\-._~/]*(\?[A-Za-z0-9\-._~=&%]*)?$/;

export function safeReturnTo(value: string | null | undefined): string {
  return value && value.length <= 200 && RETURN_TO.test(value) ? value : "/";
}

/** `path` with `query` merged into its search string (values encoded). */
export function withQuery(path: string, query: Record<string, string>): string {
  const [base = "/", search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(query)) params.set(key, value);
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}
```

- [ ] **Step 10: Write `apps/web/lib/account/redirect.ts`**

```ts
import "server-only";
import { serializeCookie, type CookieSpec } from "@/lib/api/http";

/**
 * 303 to `target` (a path on this site or an absolute URL) with query flags and cookies. Strings in
 * `cookies` are ready-made Set-Cookie values. Never cached.
 */
export function redirectTo(request: Request, target: string, query: Record<string, string> = {}, cookies: Array<CookieSpec | string> = []): Response {
  const url = new URL(target, request.url);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", typeof cookie === "string" ? cookie : serializeCookie(cookie));
  return new Response(null, { status: 303, headers });
}
```

- [ ] **Step 11: Write `apps/web/lib/account/request.ts`**

```ts
import "server-only";
import { clientKey, errorResponse, parseCookies } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { rateLimit, type LimiterName } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { accountSecretMatches } from "./secretCheck";
import { accountSecret } from "./secrets";
import { SESSION_COOKIE, readSession, type Session } from "./session";

export interface AccountContext {
  db: D1Binding;
  /** signs cookies and tokens (STARLOG_SIGNING_SECRET) */
  secret: string;
  /** keys Kakao lookups and seals saved readings (STARLOG_ACCOUNT_SECRET) */
  accountSecret: string;
  now: number;
  cookies: Record<string, string>;
  owner: boolean;
  session: Session | null;
}

let loggedUnavailable = false;
let loggedMismatch = false;

/**
 * What an account or payment route needs, or 503 PAY_UNAVAILABLE:
 * - D1 or a secret is missing (logged once, by name);
 * - the account secret is not the one D1 was first used with (logged once). Fail closed: a wrong
 *   secret would hand returning users fresh accounts and lose their saved readings.
 */
export async function openAccount(request: Request, now: number = Date.now()): Promise<AccountContext | Response> {
  const db = accountDb();
  const secret = signingSecret();
  const sealing = accountSecret();
  if (!db || !secret || !sealing) {
    if (!loggedUnavailable) {
      loggedUnavailable = true;
      console.error(JSON.stringify({ evt: "config.account_unavailable", db: Boolean(db), signing: Boolean(secret), account: Boolean(sealing) }));
    }
    return errorResponse("PAY_UNAVAILABLE");
  }
  if (!(await accountSecretMatches(db, sealing, now))) {
    if (!loggedMismatch) {
      loggedMismatch = true;
      console.error(JSON.stringify({ evt: "config.account_secret_mismatch" }));
    }
    return errorResponse("PAY_UNAVAILABLE");
  }
  const cookies = parseCookies(request);
  return {
    db,
    secret,
    accountSecret: sealing,
    now,
    cookies,
    owner: await isOwner(cookies[OWNER_COOKIE], secret, now),
    session: await readSession(db, cookies[SESSION_COOKIE], secret, now),
  };
}

/**
 * The per-IP limiter, then for state-changing requests the same-origin check, then openAccount.
 * Every account and payment route starts here.
 */
export async function openAccountRoute(request: Request, options: { limiter: LimiterName; write?: boolean }): Promise<AccountContext | Response> {
  if (!(await rateLimit(options.limiter, clientKey(request)))) return errorResponse("RATE_LIMIT");
  if (options.write && !sameOrigin(request)) return errorResponse("FORBIDDEN");
  return openAccount(request);
}

export function requireSession(ctx: AccountContext): Session | Response {
  return ctx.session ?? errorResponse("LOGIN_REQUIRED");
}

/**
 * A state-changing request from our own pages: Origin, or else Referer, has this request's origin.
 * With SameSite=Lax cookies and JSON-only bodies this closes cross-site request forgery.
 */
export function sameOrigin(request: Request): boolean {
  const own = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === own;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === own;
  } catch {
    return false;
  }
}
```

The "closes account routes with 503" test relies on `loggedMismatch` being false when it runs; it is the only test in this suite that trips the mismatch.

- [ ] **Step 12: Run the tests**

Run: `npx vitest run apps/web/lib/account/account.test.ts apps/web/lib/security`
Expected: PASS (account: 14 tests; security tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 13: Commit**

```bash
git add apps/web/lib/account apps/web/lib/api/http.ts apps/web/lib/security/rateLimit.ts apps/web/lib/cloudflare.ts apps/web/wrangler.jsonc
git commit -m "feat(account): HKDF-derived keys pinned by a D1 check, users, sessions, guards and P4 error codes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ledger

**Files:**
- Create: `apps/web/lib/pay/ledger.ts`, `apps/web/lib/pay/ledgerContract.ts` (the suite, P3's contract pattern)
- Test: `apps/web/lib/pay/ledger.test.ts` (test D1), `apps/web/lib/pay/ledger.int.test.ts` (local D1)

**Interfaces:**
- Consumes: `D1Binding`, `D1Statement` (P3 `lib/db/d1.ts`), `isConstraintError` (Task 1), `GIFT_DAYS` (Task 2), `randomId` from `lib/security/sign.ts`
- Produces (`ledger.ts`):
  - `type Currency = "paid" | "free"`, `type LedgerKind`, `interface Lot` (the `credit_lots` row), `type Allocation = [lotId: string, units: number]`
  - `GIFT_DAYS` (re-exported from the catalog), `RESERVATION_MS = 360_000`, `giftExpiry(now, days?)`
  - `interface NewLot { id; userId; currency; source; orderId; productId; units; expiresAt }`, `grantStatements(db, lot: NewLot, now): D1Statement[]`
  - `grantSignupGift(db, {userId, kakaoKey, units, now}): Promise<boolean>` (one batch: claim, lot, ledger; false when the Kakao account was given one before)
  - `paidLotStatements(db, {userId, orderId, productId, units, now}): D1Statement[]` (lot id `lot_<orderId>`, written only while the order is `paid`)
  - `allocate(lots, units): Allocation[] | null`
  - `reserveStatements(db, {unlockId, userId, productId, currency, allocations, now})`
  - `reserveUnlock(db, {userId, productId, currency, units, now}): Promise<{ok: true; unlockId; allocations} | {ok: false}>`
  - `deliverUnlock(db, {unlockId, readingId, now, before?: D1Statement[]}): Promise<"delivered" | "lost">`
  - `releaseUnlock(db, {unlockId, now}): Promise<boolean>`
  - `sweepUser(db, userId, now)`, `sweepStale(db, now, limit?): Promise<{released; expired}>`, `forfeitStatements(db, lot, status: "expired" | "revoked", now)`
  - `lockPaidLotForRefund(db, orderId, now): Promise<Lot | null>`, `revertRefund(db, orderId, now): Promise<boolean>`, `refundingLot(db, orderId)`, `refundedLotStatements(db, lot, now)`, `revokeLotStatement(db, orderId)`
  - `interface WalletSummary { stardust: number; stardustExpiresAt: number | null; unused: Array<{orderId; productId}> }`, `walletSummary(db, userId, now)`

**What changed in revision 2:**
- Nothing is reserved or spent for a deleted account (M3). Reserving takes the lot to -1 (the CHECK rejects the batch), and the spend rows and the `delivered` switch need the account to be live.
- The refund lock moves the order to `refunding` and the lot out of use in one batch, each statement checking the other's condition, and checks the changes (M1). `revertRefund` is one batch too, and moves the order to its next cancel attempt (M2: a Toss Idempotency-Key replays its first answer for 15 days).
- A release restores units only into a lot that is still `active`. A lot revoked because its payment was cancelled in the Toss dashboard never comes back (minor 1).
- `sweepStale` gives the Cron Trigger (Task 13) every account's stale reservations and expired 별조각.

- [ ] **Step 1: Write the failing tests** — the suite `apps/web/lib/pay/ledgerContract.ts`, then its two runners

```ts
import { expect, it } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import {
  GIFT_DAYS,
  RESERVATION_MS,
  allocate,
  deliverUnlock,
  giftExpiry,
  grantSignupGift,
  grantStatements,
  lockPaidLotForRefund,
  paidLotStatements,
  refundedLotStatements,
  releaseUnlock,
  reserveStatements,
  reserveUnlock,
  revertRefund,
  revokeLotStatement,
  sweepStale,
  walletSummary,
  type Lot,
} from "./ledger";

const NOW = Date.parse("2026-10-01T03:00:00Z"); // 12:00 KST

type Make = () => Promise<D1Binding>;

async function setup(make: Make) {
  const db = await make();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  return db;
}

async function paidOrder(db: D1Binding, orderId: string, productId = "tarot") {
  await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, 'u_1', ?, 2900, '스타로그 타로 전체 풀이', 'paid', '/', 0, 0, 0)`,
    )
    .bind(orderId, productId)
    .run();
  await db.batch(paidLotStatements(db, { userId: "u_1", orderId, productId, units: 10, now: NOW }));
}

const lotById = (db: D1Binding, id: string) => db.prepare("SELECT * FROM credit_lots WHERE id = ?").bind(id).first<Lot>();
const orderOf = (db: D1Binding, id: string) => db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(id).first<{ status: string; cancel_attempt: number }>();
const kinds = async (db: D1Binding, lotId: string) =>
  (await db.prepare("SELECT kind FROM ledger WHERE lot_id = ? ORDER BY id").bind(lotId).all<{ kind: string }>()).results.map((row) => row.kind);
const count = async (db: D1Binding, sql: string) => (await db.prepare(sql).first<{ n: number }>())!.n;

/** Every lot not mid-refund holds exactly what its ledger rows add up to (spec 5.4, invariant 7). */
async function expectLotsMatchLedger(db: D1Binding) {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.units_left,
         COALESCE(SUM(CASE g.kind WHEN 'grant' THEN g.units WHEN 'restore' THEN g.units
           WHEN 'reserve' THEN -g.units WHEN 'refund' THEN -g.units WHEN 'expire' THEN -g.units ELSE 0 END), 0) AS ledger
       FROM credit_lots l LEFT JOIN ledger g ON g.lot_id = l.id
       WHERE l.status <> 'refunding' GROUP BY l.id`,
    )
    .all<{ id: string; units_left: number; ledger: number }>();
  for (const row of results) expect(row.units_left, row.id).toBe(row.ledger);
}

async function giftedUser(make: Make) {
  const db = await setup(make);
  expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", units: 10, now: NOW })).toBe(true);
  return db;
}

async function reserved(db: D1Binding, currency: "paid" | "free", now = NOW) {
  const result = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency, units: 10, now });
  if (!result.ok) throw new Error("not reserved");
  return result;
}

/**
 * Ledger behaviour, run on the node:sqlite test D1 (ledger.test.ts) and on local D1
 * (ledger.int.test.ts). `make` returns an empty, migrated database.
 */
export function ledgerContract(make: Make) {
  it("lets a gift be spent through its 90th KST day", () => {
    expect(GIFT_DAYS).toBe(90);
    expect(giftExpiry(NOW)).toBe(Date.parse("2026-12-30T23:59:59.999+09:00"));
    expect(giftExpiry(Date.parse("2026-10-01T15:30:00Z"))).toBe(Date.parse("2026-12-31T23:59:59.999+09:00")); // 00:30 KST, 10-02
  });

  it("gives the signup gift once per Kakao account", async () => {
    const db = await giftedUser(make);
    expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", units: 10, now: NOW })).toBe(false);
    expect(await walletSummary(db, "u_1", NOW)).toEqual({ stardust: 10, stardustExpiresAt: giftExpiry(NOW), unused: [] });
    await expectLotsMatchLedger(db);
  });

  it("allocates in the given order and refuses a shortfall", () => {
    expect(allocate([{ id: "a", units_left: 5 }, { id: "b", units_left: 5 }], 10)).toEqual([["a", 5], ["b", 5]]);
    expect(allocate([{ id: "a", units_left: 10 }, { id: "b", units_left: 5 }], 10)).toEqual([["a", 10]]);
    expect(allocate([{ id: "a", units_left: 4 }], 10)).toBeNull();
  });

  it("reserves, then spends only on delivery", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect((await walletSummary(db, "u_1", NOW)).stardust).toBe(0);
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 60_000 })).toBe("delivered");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "spend"]);
    expect(await db.prepare("SELECT status, reading_id FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "delivered", reading_id: "r1" });
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 70_000 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 70_000)).stardust).toBe(0);
    await expectLotsMatchLedger(db);
  });

  it("releases a failed opening once, and a late delivery cannot spend it", async () => {
    const db = await giftedUser(make);
    const unlock = await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "free", units: 10, now: NOW });
    if (!unlock.ok) throw new Error("not reserved");
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 2 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 3)).stardust).toBe(10);
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "late", now: NOW + 4 })).toBe("lost");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "restore"]);
    await expectLotsMatchLedger(db);
  });

  it("spends a paid lot only on its own product", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_tarot_1", "tarot");
    expect((await walletSummary(db, "u_1", NOW)).unused).toEqual([{ orderId: "order_tarot_1", productId: "tarot" }]);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "paid", units: 10, now: NOW })).toEqual({ ok: false });
    expect((await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", units: 10, now: NOW })).ok).toBe(true);
    expect((await walletSummary(db, "u_1", NOW)).unused).toEqual([]);
  });

  it("takes 별조각 from the lot that expires first", async () => {
    const db = await setup(make);
    const lot = (id: string, units: number, expiresAt: number) =>
      grantStatements(db, { id, userId: "u_1", currency: "free", source: "admin", orderId: null, productId: null, units, expiresAt }, NOW);
    await db.batch([...lot("lot_late", 5, NOW + 10 * 86_400_000), ...lot("lot_soon", 7, NOW + 86_400_000)]);
    const unlock = await reserved(db, "free");
    expect(unlock.allocations).toEqual([["lot_soon", 7], ["lot_late", 3]]);
    await expectLotsMatchLedger(db);
  });

  it("refuses without enough credit and writes nothing", async () => {
    const db = await setup(make);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW })).toEqual({ ok: false });
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(0);
  });

  it("rolls a stale reservation back whole when its lot changed underneath it", async () => {
    const db = await giftedUser(make);
    const first = await reserved(db, "free");
    // A second device read the lot before the first reservation landed.
    const stale = reserveStatements(db, { unlockId: "ul_stale", userId: "u_1", productId: "tarot", currency: "free", allocations: first.allocations, now: NOW });
    await expect(db.batch(stale)).rejects.toSatisfy(isConstraintError);
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("gives back a reservation nobody settled once it outlives RESERVATION_MS", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS - 1)).stardust).toBe(0);
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS + 1)).stardust).toBe(10);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "released" });
    await expectLotsMatchLedger(db);
  });

  it("expires 별조각 after their last day, with a ledger row", async () => {
    const db = await giftedUser(make);
    expect(await walletSummary(db, "u_1", giftExpiry(NOW) + 1)).toEqual({ stardust: 0, stardustExpiresAt: null, unused: [] });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(1);
    expect(await db.prepare("SELECT status, units_left FROM credit_lots").first()).toEqual({ status: "expired", units_left: 0 });
    await expectLotsMatchLedger(db);
  });

  it("locks an unused paid lot and its order together, never an opened one, and books the refund", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    await paidOrder(db, "order_b");
    const unlock = await reserved(db, "paid");
    const opened = unlock.allocations[0]![0] === "lot_order_a" ? "order_a" : "order_b";
    const unused = opened === "order_a" ? "order_b" : "order_a";
    expect(await lockPaidLotForRefund(db, opened, NOW)).toBeNull();
    expect(await orderOf(db, opened)).toEqual({ status: "paid", cancel_attempt: 1 });
    const locked = await lockPaidLotForRefund(db, unused, NOW);
    expect(locked).toMatchObject({ id: `lot_${unused}`, status: "refunding", units_left: 0 });
    expect(await orderOf(db, unused)).toEqual({ status: "refunding", cancel_attempt: 1 });
    expect(await lockPaidLotForRefund(db, unused, NOW + 1)).toBeNull();
    await db.batch(refundedLotStatements(db, locked!, NOW));
    expect(await lotById(db, `lot_${unused}`)).toMatchObject({ status: "refunded", units_left: 0 });
    expect(await kinds(db, `lot_${unused}`)).toEqual(["grant", "refund"]);
    await expectLotsMatchLedger(db);
  });

  it("puts a refund lock back in one batch and moves the order to its next cancel attempt", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    expect(await lockPaidLotForRefund(db, "order_a", NOW)).not.toBeNull();
    expect(await revertRefund(db, "order_a", NOW + 1)).toBe(true);
    expect(await orderOf(db, "order_a")).toEqual({ status: "paid", cancel_attempt: 2 });
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 10 });
    expect(await revertRefund(db, "order_a", NOW + 2)).toBe(false);
    await expectLotsMatchLedger(db);
  });

  it("never brings a revoked lot back: a later release restores nothing into it", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    const unlock = await reserved(db, "paid");
    await db.batch([revokeLotStatement(db, "order_a")]);
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "revoked", units_left: 0 });
    expect(await kinds(db, "lot_order_a")).toEqual(["grant", "reserve"]);
    expect((await walletSummary(db, "u_1", NOW + 2)).unused).toEqual([]);
    await expectLotsMatchLedger(db);
  });

  it("reserves and spends nothing for a deleted account", async () => {
    const db = await setup(make);
    await db.batch(grantStatements(db, { id: "lot_admin", userId: "u_1", currency: "free", source: "admin", orderId: null, productId: null, units: 20, expiresAt: null }, NOW));
    const unlock = await reserved(db, "free");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = 'u_1'").bind(NOW).run();
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW + 1 })).toEqual({ ok: false });
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 2 })).toBe("lost");
    expect(await kinds(db, "lot_admin")).toEqual(["grant", "reserve"]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("keeps a delivery atomic with the reading it saves", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    const broken = db.prepare(
      "INSERT INTO readings (id, user_id, kind, product_id, source, payload, key_version, created_at, updated_at) VALUES ('r1', 'nobody', 'tarot', 'tarot', 'free', 'p', 1, 0, 0)",
    );
    await expect(deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW, before: [broken] })).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "reserved" });
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve"]);
  });

  it("lets the scheduled sweep return any account's stale reservation and expire old 별조각", async () => {
    const db = await giftedUser(make);
    await reserved(db, "free");
    expect(await sweepStale(db, NOW + RESERVATION_MS + 1)).toEqual({ released: 1, expired: 0 });
    expect(await db.prepare("SELECT status FROM unlocks").first()).toEqual({ status: "released" });
    expect(await sweepStale(db, giftExpiry(NOW) + 1)).toEqual({ released: 0, expired: 1 });
    expect(await sweepStale(db, giftExpiry(NOW) + 2)).toEqual({ released: 0, expired: 0 });
    await expectLotsMatchLedger(db);
  });
}
```

`apps/web/lib/pay/ledger.test.ts`:

```ts
import { describe } from "vitest";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { ledgerContract } from "./ledgerContract";

describe("ledger (test D1)", () => ledgerContract(async () => migratedTestD1()));
```

`apps/web/lib/pay/ledger.int.test.ts`:

```ts
import { afterAll, beforeAll, describe } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { P4_TABLES_CHILD_FIRST, openLocalD1 } from "@/lib/db/testing/localD1";
import { ledgerContract } from "./ledgerContract";

/** The same suite on real local D1 (workerd). Skipped with CI_NO_WORKERD=1. */
describe.skipIf(process.env.CI_NO_WORKERD === "1")("ledger (local D1)", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ db, dispose } = await openLocalD1());
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  ledgerContract(async () => {
    await db.batch(P4_TABLES_CHILD_FIRST.map((table) => db.prepare(`DELETE FROM ${table}`)));
    return db;
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/lib/pay/ledger.test.ts apps/web/lib/pay/ledger.int.test.ts`
Expected: FAIL (`Cannot find module './ledger'`).

- [ ] **Step 3: Write `apps/web/lib/pay/ledger.ts`**

```ts
import "server-only";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { randomId } from "@/lib/security/sign";
import { GIFT_DAYS } from "./catalog";

export { GIFT_DAYS };

/**
 * The one ledger for 달빛 (paid) and 별조각 (free), spec 5.4.
 *
 * - Credit lives in lots: a paid lot per order, earmarked for its product, and a free lot per gift.
 * - Opening a reading reserves units from lots (an unlock). The reservation is then either spent,
 *   when the reading is delivered, or restored when it fails.
 * - Every movement is a ledger row with a UNIQUE idempotency key. Every multi-step change is one
 *   D1 batch, so a retry or a crash never moves credit twice.
 * - Nothing is reserved or spent for a deleted account (users.deleted_at).
 * - Lot invariant (tested): units_left = grant - reserve + restore - refund - expire.
 */

export type Currency = "paid" | "free";
export type LedgerKind = "grant" | "reserve" | "spend" | "restore" | "refund" | "expire";

export interface Lot {
  id: string;
  user_id: string;
  currency: Currency;
  source: "order" | "gift" | "admin";
  order_id: string | null;
  product_id: string | null;
  units_total: number;
  units_left: number;
  status: "active" | "refunding" | "refunded" | "expired" | "revoked";
  expires_at: number | null;
  created_at: number;
}

export type Allocation = [lotId: string, units: number];

/** How long an unlock holds its units: the 240 s generation budget plus margin. Then a sweep returns them. */
export const RESERVATION_MS = 6 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

/** The last moment of the KST day `days` days after `now` (received 10-01 → usable through 12-30). */
export function giftExpiry(now: number, days: number = GIFT_DAYS): number {
  const startOfToday = Math.floor((now + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
  return startOfToday + (days + 1) * DAY_MS - 1;
}

// ---- ledger rows ----

interface Entry {
  userId: string;
  currency: Currency;
  kind: LedgerKind;
  units: number;
  lotId: string;
  unlockId?: string | null;
  orderId?: string | null;
  idem: string;
  now: number;
}

const COLUMNS = "(user_id, currency, kind, units, lot_id, unlock_id, order_id, idem_key, created_at)";
const values = (e: Entry) => [e.userId, e.currency, e.kind, e.units, e.lotId, e.unlockId ?? null, e.orderId ?? null, e.idem, e.now];

function ledgerRow(db: D1Binding, e: Entry): D1Statement {
  return db.prepare(`INSERT INTO ledger ${COLUMNS} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values(e));
}

const RESERVED = "EXISTS (SELECT 1 FROM unlocks WHERE id = ? AND status = 'reserved')";
const USER_LIVE = "EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL)";

// ---- grants ----

export interface NewLot {
  id: string;
  userId: string;
  currency: Currency;
  source: Lot["source"];
  orderId: string | null;
  productId: string | null;
  units: number;
  expiresAt: number | null;
}

export function grantStatements(db: D1Binding, lot: NewLot, now: number): D1Statement[] {
  return [
    db
      .prepare(
        `INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(lot.id, lot.userId, lot.currency, lot.source, lot.orderId, lot.productId, lot.units, lot.units, lot.expiresAt, now),
    ledgerRow(db, { userId: lot.userId, currency: lot.currency, kind: "grant", units: lot.units, lotId: lot.id, orderId: lot.orderId, idem: `grant:${lot.id}`, now }),
  ];
}

/**
 * The signup gift, once per Kakao account (gift_claims outlives the account by a year). The claim,
 * the lot and its ledger row are one batch: a failure leaves no claim behind, so the next login
 * tries again (minor 5). False when it was given before.
 */
export async function grantSignupGift(db: D1Binding, input: { userId: string; kakaoKey: string; units: number; now: number }): Promise<boolean> {
  const claimed = await db.prepare("SELECT 1 AS x FROM gift_claims WHERE kakao_key = ?").bind(input.kakaoKey).first();
  if (claimed) return false;
  const lot: NewLot = {
    id: `lot_${randomId(12)}`,
    userId: input.userId,
    currency: "free",
    source: "gift",
    orderId: null,
    productId: null,
    units: input.units,
    expiresAt: giftExpiry(input.now),
  };
  try {
    await db.batch([
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at) VALUES (?, ?)").bind(input.kakaoKey, input.now),
      ...grantStatements(db, lot, input.now),
    ]);
    return true;
  } catch (error) {
    if (isConstraintError(error)) return false;
    throw error;
  }
}

/**
 * The paid lot an order grants, written only while the order is `paid` (markPaid sets it in the same
 * batch, and leaves a deleted account's order unpaid). Its id comes from the order id, so it can
 * exist only once.
 */
export function paidLotStatements(db: D1Binding, input: { userId: string; orderId: string; productId: string; units: number; now: number }): D1Statement[] {
  const id = `lot_${input.orderId}`;
  const PAID = "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')";
  return [
    db
      .prepare(
        `INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, expires_at, created_at)
         SELECT ?, ?, 'paid', 'order', ?, ?, ?, ?, NULL, ? WHERE ${PAID}`,
      )
      .bind(id, input.userId, input.orderId, input.productId, input.units, input.units, input.now, input.orderId),
    db
      .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${PAID}`)
      .bind(...values({ userId: input.userId, currency: "paid", kind: "grant", units: input.units, lotId: id, orderId: input.orderId, idem: `grant:${id}`, now: input.now }), input.orderId),
  ];
}

// ---- reserve, deliver, release ----

/** Units to take from each lot, in the given order, or null when they do not add up. */
export function allocate(lots: ReadonlyArray<{ id: string; units_left: number }>, units: number): Allocation[] | null {
  const out: Allocation[] = [];
  let need = units;
  for (const lot of lots) {
    if (need === 0) break;
    const take = Math.min(lot.units_left, need);
    if (take > 0) {
      out.push([lot.id, take]);
      need -= take;
    }
  }
  return need === 0 ? out : null;
}

export function reserveStatements(
  db: D1Binding,
  input: { unlockId: string; userId: string; productId: string; currency: Currency; allocations: Allocation[]; now: number },
): D1Statement[] {
  const { unlockId, userId, productId, currency, allocations, now } = input;
  return [
    db
      .prepare(
        `INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at)
         VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)`,
      )
      .bind(unlockId, userId, productId, currency, JSON.stringify(allocations), now + RESERVATION_MS, now),
    ...allocations.flatMap(([lotId, units]) => [
      // A lot that is no longer active, or whose account was deleted, becomes -1, which the CHECK
      // rejects: the whole batch rolls back.
      db
        .prepare(
          `UPDATE credit_lots SET units_left = CASE
             WHEN status = 'active' AND EXISTS (SELECT 1 FROM users u WHERE u.id = credit_lots.user_id AND u.deleted_at IS NULL)
             THEN units_left - ? ELSE -1 END
           WHERE id = ?`,
        )
        .bind(units, lotId),
      ledgerRow(db, { userId, currency, kind: "reserve", units, lotId, unlockId, idem: `reserve:${unlockId}:${lotId}`, now }),
    ]),
  ];
}

export type ReserveResult = { ok: true; unlockId: string; allocations: Allocation[] } | { ok: false };

/**
 * Holds `units` of `currency` for opening `productId`: lots earmarked for the product first, then
 * the ones that expire soonest. A lot changed meanwhile (spent elsewhere, refunded, expired, account
 * deleted) fails the CHECK and rolls the reservation back; one retry from a fresh read, then no credit.
 */
export async function reserveUnlock(
  db: D1Binding,
  input: { userId: string; productId: string; currency: Currency; units: number; now: number },
): Promise<ReserveResult> {
  const { userId, productId, currency, units, now } = input;
  await sweepUser(db, userId, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { results } = await db
      .prepare(
        `SELECT id, units_left FROM credit_lots
         WHERE user_id = ? AND currency = ? AND status = 'active' AND units_left > 0
           AND (expires_at IS NULL OR expires_at > ?) AND (product_id IS NULL OR product_id = ?)
         ORDER BY product_id IS NULL, expires_at IS NULL, expires_at, created_at`,
      )
      .bind(userId, currency, now, productId)
      .all<{ id: string; units_left: number }>();
    const allocations = allocate(results, units);
    if (!allocations) return { ok: false };
    const unlockId = `ul_${randomId(12)}`;
    try {
      await db.batch(reserveStatements(db, { unlockId, userId, productId, currency, allocations, now }));
      return { ok: true, unlockId, allocations };
    } catch (error) {
      if (!isConstraintError(error)) throw error;
    }
  }
  return { ok: false };
}

interface UnlockRow {
  id: string;
  user_id: string;
  currency: Currency;
  allocations: string;
  status: "reserved" | "delivered" | "released";
}

const unlockRow = (db: D1Binding, id: string) =>
  db.prepare("SELECT id, user_id, currency, allocations, status FROM unlocks WHERE id = ?").bind(id).first<UnlockRow>();

const allocationsOf = (row: UnlockRow) => JSON.parse(row.allocations) as Allocation[];

/**
 * Spends a reservation once the reading is saved; `before` (the reading's INSERT) runs in the same
 * batch. "lost" means nothing was spent: the reservation had already been released (it outlived
 * RESERVATION_MS), or the account was deleted. After a release the reading is still saved and the
 * user keeps the units: a slow generation never costs twice.
 */
export async function deliverUnlock(
  db: D1Binding,
  input: { unlockId: string; readingId: string; now: number; before?: D1Statement[] },
): Promise<"delivered" | "lost"> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock) throw new Error("unknown unlock");
  const results = await db.batch([
    ...(input.before ?? []),
    ...allocationsOf(unlock).map(([lotId, units]) =>
      db
        .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RESERVED} AND ${USER_LIVE}`)
        .bind(
          ...values({ userId: unlock.user_id, currency: unlock.currency, kind: "spend", units, lotId, unlockId: unlock.id, idem: `spend:${unlock.id}:${lotId}`, now: input.now }),
          unlock.id,
          unlock.user_id,
        ),
    ),
    db
      .prepare(`UPDATE unlocks SET status = 'delivered', reading_id = ?, settled_at = ? WHERE id = ? AND status = 'reserved' AND ${USER_LIVE}`)
      .bind(input.readingId, input.now, unlock.id, unlock.user_id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1 ? "delivered" : "lost";
}

/**
 * Returns a reservation's units to their lots (failed or abandoned generation). Idempotent; false
 * when it was not reserved. Units go back only into a lot that is still active: one that expired,
 * or was revoked because its payment was cancelled, keeps nothing (minor 1).
 */
export async function releaseUnlock(db: D1Binding, input: { unlockId: string; now: number }): Promise<boolean> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock || unlock.status !== "reserved") return false;
  const results = await db.batch([
    ...allocationsOf(unlock).flatMap(([lotId, units]) => [
      db.prepare(`UPDATE credit_lots SET units_left = units_left + ? WHERE id = ? AND status = 'active' AND ${RESERVED}`).bind(units, lotId, unlock.id),
      db
        .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RESERVED} AND EXISTS (SELECT 1 FROM credit_lots WHERE id = ? AND status = 'active')`)
        .bind(
          ...values({ userId: unlock.user_id, currency: unlock.currency, kind: "restore", units, lotId, unlockId: unlock.id, idem: `restore:${unlock.id}:${lotId}`, now: input.now }),
          unlock.id,
          lotId,
        ),
    ]),
    db.prepare("UPDATE unlocks SET status = 'released', settled_at = ? WHERE id = ? AND status = 'reserved'").bind(input.now, unlock.id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1;
}

// ---- sweeps, expiry, forfeits ----

/** Takes what is left in a lot out of use (expiry, account deletion), with its ledger row, only if the lot did not change meanwhile. */
export function forfeitStatements(db: D1Binding, lot: Lot, status: "expired" | "revoked", now: number): D1Statement[] {
  return [
    db
      .prepare(
        `INSERT INTO ledger ${COLUMNS} SELECT ?, ?, 'expire', ?, ?, NULL, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM credit_lots WHERE id = ? AND units_left = ?)`,
      )
      .bind(lot.user_id, lot.currency, lot.units_left, lot.id, lot.order_id, `expire:${lot.id}:${now}:${lot.units_left}`, now, lot.id, lot.units_left),
    db.prepare("UPDATE credit_lots SET units_left = 0, status = ? WHERE id = ? AND units_left = ?").bind(status, lot.id, lot.units_left),
  ];
}

const EXPIRED_LOTS = "status = 'active' AND expires_at IS NOT NULL AND expires_at <= ? AND units_left > 0";

/** Releases this user's reservations older than RESERVATION_MS and expires their lots past expiry. */
export async function sweepUser(db: D1Binding, userId: string, now: number): Promise<void> {
  const stale = await db.prepare("SELECT id FROM unlocks WHERE user_id = ? AND status = 'reserved' AND reserved_until < ?").bind(userId, now).all<{ id: string }>();
  for (const { id } of stale.results) await releaseUnlock(db, { unlockId: id, now });
  const expired = await db.prepare(`SELECT * FROM credit_lots WHERE user_id = ? AND ${EXPIRED_LOTS}`).bind(userId, now).all<Lot>();
  for (const lot of expired.results) await db.batch(forfeitStatements(db, lot, "expired", now));
}

/** The same sweep over every account, at most `limit` of each per run (the Cron Trigger, Task 13). */
export async function sweepStale(db: D1Binding, now: number, limit = 100): Promise<{ released: number; expired: number }> {
  const stale = await db.prepare("SELECT id FROM unlocks WHERE status = 'reserved' AND reserved_until < ? ORDER BY reserved_until LIMIT ?").bind(now, limit).all<{ id: string }>();
  let released = 0;
  for (const { id } of stale.results) if (await releaseUnlock(db, { unlockId: id, now })) released++;
  const lots = await db.prepare(`SELECT * FROM credit_lots WHERE ${EXPIRED_LOTS} ORDER BY expires_at LIMIT ?`).bind(now, limit).all<Lot>();
  for (const lot of lots.results) await db.batch(forfeitStatements(db, lot, "expired", now));
  return { released, expired: lots.results.length };
}

// ---- refunds ----

/**
 * Marks a paid order `refunding` and takes its unused lot out of use, in one batch (M1). Each
 * statement checks the other's condition, so both change or neither does, and nobody can open the
 * reading while its payment is being cancelled. Null when the order is not paid, or its reading was
 * opened or is being opened.
 */
export async function lockPaidLotForRefund(db: D1Binding, orderId: string, now: number): Promise<Lot | null> {
  const [order, lot] = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = 'refunding', updated_at = ? WHERE id = ? AND status = 'paid'
           AND EXISTS (SELECT 1 FROM credit_lots WHERE order_id = ? AND status = 'active' AND units_left = units_total)`,
      )
      .bind(now, orderId, orderId),
    db
      .prepare(
        `UPDATE credit_lots SET units_left = 0, status = 'refunding'
         WHERE order_id = ? AND status = 'active' AND units_left = units_total
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunding' AND updated_at = ?)
         RETURNING *`,
      )
      .bind(orderId, orderId, now),
  ]);
  const changes = [order?.meta?.changes ?? 0, lot?.meta?.changes ?? 0];
  if (changes[0] === 1 && changes[1] === 1) return (lot!.results[0] as unknown as Lot | undefined) ?? null;
  if (changes[0] !== changes[1]) console.error(JSON.stringify({ evt: "pay.refund_lock_mismatch", orderId, changes }));
  return null;
}

/**
 * Puts a `refunding` order and its lot back in use, in one batch: Toss still shows the payment DONE.
 * The order moves to its next cancel attempt, so the next refund sends a new Idempotency-Key (Toss
 * replays an old key's first answer for 15 days). An order without a lot (a deleted account's
 * payment, Task 7) is never put back. False when nothing changed.
 */
export async function revertRefund(db: D1Binding, orderId: string, now: number): Promise<boolean> {
  const [, order] = await db.batch([
    db
      .prepare(
        `UPDATE credit_lots SET units_left = units_total, status = 'active'
         WHERE order_id = ? AND status = 'refunding' AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunding')`,
      )
      .bind(orderId, orderId),
    db
      .prepare(
        `UPDATE orders SET status = 'paid', cancel_attempt = cancel_attempt + 1, updated_at = ?
         WHERE id = ? AND status = 'refunding' AND EXISTS (SELECT 1 FROM credit_lots WHERE order_id = ? AND status = 'active')`,
      )
      .bind(now, orderId, orderId),
  ]);
  return order?.meta?.changes === 1;
}

export function refundingLot(db: D1Binding, orderId: string): Promise<Lot | null> {
  return db.prepare("SELECT * FROM credit_lots WHERE order_id = ? AND status = 'refunding'").bind(orderId).first<Lot>();
}

/** A cancelled lot's final state and its ledger row (the whole grant leaves as a refund). */
export function refundedLotStatements(db: D1Binding, lot: Lot, now: number): D1Statement[] {
  return [
    db.prepare("UPDATE credit_lots SET status = 'refunded' WHERE id = ? AND status = 'refunding'").bind(lot.id),
    ledgerRow(db, { userId: lot.user_id, currency: lot.currency, kind: "refund", units: lot.units_total, lotId: lot.id, orderId: lot.order_id, idem: `refund:${lot.id}`, now }),
  ];
}

/** A payment cancelled while its reading was open or opening (the Toss dashboard): the lot leaves use for good. */
export function revokeLotStatement(db: D1Binding, orderId: string): D1Statement {
  return db.prepare("UPDATE credit_lots SET status = 'revoked' WHERE order_id = ? AND status = 'active'").bind(orderId);
}

// ---- summary ----

export interface WalletSummary {
  /** 별조각 that can be spent now */
  stardust: number;
  /** when the soonest of them expires (ms); null when there are none */
  stardustExpiresAt: number | null;
  /** paid readings bought and not opened yet */
  unused: Array<{ orderId: string; productId: string }>;
}

export async function walletSummary(db: D1Binding, userId: string, now: number): Promise<WalletSummary> {
  await sweepUser(db, userId, now);
  const { results } = await db
    .prepare(
      `SELECT currency, order_id, product_id, units_left, expires_at FROM credit_lots
       WHERE user_id = ? AND status = 'active' AND units_left > 0 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at`,
    )
    .bind(userId, now)
    .all<Pick<Lot, "currency" | "order_id" | "product_id" | "units_left" | "expires_at">>();
  const free = results.filter((lot) => lot.currency === "free");
  const expiries = free.map((lot) => lot.expires_at).filter((at): at is number => at !== null);
  return {
    stardust: free.reduce((sum, lot) => sum + lot.units_left, 0),
    stardustExpiresAt: expiries.length ? Math.min(...expiries) : null,
    unused: results
      .filter((lot) => lot.currency === "paid" && lot.order_id !== null && lot.product_id !== null)
      .map((lot) => ({ orderId: lot.order_id!, productId: lot.product_id! })),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run apps/web/lib/pay/ledger.test.ts apps/web/lib/pay/ledger.int.test.ts`
Expected: PASS, 17 tests in each runner. The int runner takes a few seconds for workerd.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/pay/ledger.ts apps/web/lib/pay/ledgerContract.ts apps/web/lib/pay/ledger.test.ts apps/web/lib/pay/ledger.int.test.ts
git commit -m "feat(pay): one ledger for 달빛 and 별조각; refund lock in one batch; nothing for deleted accounts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kakao login, `/api/me`, logout

**Files:**
- Create:
  - `apps/web/lib/account/oauthState.ts`, `apps/web/lib/account/kakao.ts`
  - `apps/web/app/api/auth/kakao/start/route.ts`, `apps/web/app/api/auth/kakao/callback/route.ts`, `apps/web/app/api/auth/logout/route.ts`, `apps/web/app/api/me/route.ts`
  - `apps/web/lib/testing/p4.ts` (route-test helpers, never imported by app code)
- Test: `apps/web/lib/account/kakao.test.ts`, `apps/web/app/api/auth/auth.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `paymentsMode`, `salesOpen`, `loginOpen`.
  - Task 3: `openAccount`, `openAccountRoute`, `redirectTo`, `safeReturnTo`, `kakaoKey`, `loginKakaoUser`, `userByKakaoKey`, `createSession`, `revokeSession`, `SESSION_COOKIE`, `CLEAR_SESSION`.
  - Task 4: `grantSignupGift`, `walletSummary`.
  - Existing: `SITE.price.signupGiftFree`; `isOwner`/`OWNER_COOKIE`; `signToken`/`verifyToken`/`safeEqual`/`randomId`; `json`, `parseCookies`, `serializeCookie`, `CookieSpec`.
- Produces:
  - `oauthState.ts`:
    - `OAUTH_COOKIE = "sl_oauth"`, `OAUTH_TTL_MS`, `type OAuthPurpose = "login" | "delete"`
    - `interface OAuthIntent { returnTo; purpose; age: boolean; sid?: string }`
    - `issueOAuthState(intent, secret, now): Promise<{state; cookie: CookieSpec}>`
    - `openOAuthState(cookieValue, stateParam, secret, now): Promise<OAuthIntent | null>`
    - `CLEAR_OAUTH: CookieSpec`
  - `kakao.ts`:
    - `KAKAO_AUTHORIZE_URL`, `KAKAO_TOKEN_URL`, `KAKAO_ME_URL`, `KAKAO_UNLINK_URL`, `MOCK_CODE_PREFIX = "mock:"`
    - `kakaoMode(env?)`, `kakaoConfigProblems(env?)`, `kakaoRedirectUri(env?)`, `authorizeUrl(state, env?)`
    - `interface KakaoProfile { id: string; nickname: string }`, `class KakaoError { step: "token" | "me"; status }`
    - `kakaoLogin(code, env?, fetchImpl?): Promise<{profile; accessToken}>`, `kakaoUnlink(accessToken, env?, fetchImpl?): Promise<boolean>`
  - routes:
    - `GET /api/auth/kakao/start?returnTo&age=1[&mockUser]`, `GET /api/auth/kakao/callback`;
    - `POST /api/auth/logout`;
    - `GET /api/me` → `{ payments: boolean; login: boolean; owner: boolean; user: null | { nickname; stardust; stardustExpiresAt: string | null; unused: Array<{orderId; productId}> } }`
  - Callback outcomes:
    - `?login=ok|cancel|failed|closed|unavailable|busy` appended to the return path;
    - `/?login=failed` when the state is not this browser's.
  - Rules (revision 2):
    - Login is open while `loginOpen` (on; owner mode for owner-pass devices; paused). A new account is created only while `salesOpen`; while paused a Kakao account with no account here gets `login=closed`.
    - The signup gift is tried on every login while sales are open. It is one batch and once per Kakao account, so a gift lost to an error at sign-up arrives on the next login (minor 5).
    - The callback checks the Kakao settings again before using the code (minor 7).
  - `lib/testing/p4.ts`:
    - `type Handler`, `interface Browser { jar; send(handler, url, init?) }`, `browser(ip?)`;
    - `useTestDb(): TestD1`, `loginAs(b, name?, returnTo?)`, `me(b): Promise<MeBody>`, `interface MeBody`.

- [ ] **Step 1: Write the test helpers** — `apps/web/lib/testing/p4.ts`

```ts
import { GET as kakaoCallback } from "@/app/api/auth/kakao/callback/route";
import { GET as kakaoStart } from "@/app/api/auth/kakao/start/route";
import { GET as meGet } from "@/app/api/me/route";
import { setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";

/** Helpers for P4 route tests: a cookie-keeping browser, a test D1 for accountDb(), mock Kakao login. Tests only. */

export type Handler = (request: Request) => Promise<Response>;

export interface SendInit {
  method?: string;
  body?: unknown;
  /** send Origin: http://localhost (our own pages) */
  origin?: boolean;
  accept?: string;
  signal?: AbortSignal;
}

export interface Browser {
  jar: Map<string, string>;
  send(handler: Handler, url: string, init?: SendInit): Promise<Response>;
}

/** Keeps cookies between calls (Max-Age=0 deletes one), sends its IP and, when asked, our Origin. */
export function browser(ip = "203.0.113.9"): Browser {
  const jar = new Map<string, string>();
  return {
    jar,
    async send(handler, url, init = {}) {
      const headers: Record<string, string> = { "cf-connecting-ip": ip };
      if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      if (init.body !== undefined) headers["content-type"] = "application/json";
      if (init.origin) headers.origin = "http://localhost";
      if (init.accept) headers.accept = init.accept;
      const response = await handler(
        new Request(new URL(url, "http://localhost"), {
          method: init.method ?? (init.body === undefined ? "GET" : "POST"),
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: init.signal,
        }),
      );
      for (const line of response.headers.getSetCookie()) {
        const [pair = ""] = line.split(";");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);
        if (/Max-Age=0(;|$)/.test(line)) jar.delete(name);
        else jar.set(name, pair.slice(index + 1));
      }
      return response;
    },
  };
}

/** A fresh migrated test D1 that every accountDb() call returns until setTestDb(null). */
export function useTestDb(): TestD1 {
  const db = migratedTestD1();
  setTestDb(db);
  return db;
}

/** Logs in through the mock Kakao flow (STARLOG_KAKAO=mock); returns the callback's 303. */
export async function loginAs(b: Browser, name = "alice", returnTo = "/tarot/result"): Promise<Response> {
  const start = await b.send(kakaoStart, `/api/auth/kakao/start?age=1&returnTo=${encodeURIComponent(returnTo)}&mockUser=${name}`);
  const location = start.headers.get("location");
  if (!location?.includes("/api/auth/kakao/callback")) throw new Error(`login did not reach the callback: ${start.status} ${location}`);
  return b.send(kakaoCallback, location);
}

export interface MeBody {
  payments: boolean;
  login: boolean;
  owner: boolean;
  user: null | { nickname: string; stardust: number; stardustExpiresAt: string | null; unused: Array<{ orderId: string; productId: string }> };
}

export async function me(b: Browser): Promise<MeBody> {
  return (await (await b.send(meGet, "/api/me")).json()) as MeBody;
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/lib/account/kakao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KAKAO_ME_URL, KAKAO_TOKEN_URL, KakaoError, authorizeUrl, kakaoConfigProblems, kakaoLogin, kakaoRedirectUri } from "./kakao";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const PROD = env({ NODE_ENV: "production", KAKAO_REST_API_KEY: "rest-key", KAKAO_CLIENT_SECRET: "client-secret" });

function fakeFetch(responses: Array<[number, unknown]>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const [status, body] = responses.shift()!;
    return Response.json(body, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("Kakao OAuth", () => {
  it("uses the registered redirect URIs", () => {
    expect(kakaoRedirectUri(PROD)).toBe("https://starlog.yeolmaeapps.kr/api/auth/kakao/callback");
    expect(kakaoRedirectUri(env({ NODE_ENV: "development" }))).toBe("http://localhost:3100/api/auth/kakao/callback");
  });

  it("builds the authorize URL with the state", () => {
    const url = new URL(authorizeUrl("state-123", PROD));
    expect(url.origin + url.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "rest-key",
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/kakao/callback",
      response_type: "code",
      state: "state-123",
    });
  });

  it("trades the code with the client secret and reads the id and nickname", async () => {
    const { calls, fetchImpl } = fakeFetch([
      [200, { access_token: "at-1", token_type: "bearer" }],
      [200, { id: 4242424242, kakao_account: { profile: { nickname: "별빛" } } }],
    ]);
    const { profile, accessToken } = await kakaoLogin("the-code", PROD, fetchImpl);
    expect(profile).toEqual({ id: "4242424242", nickname: "별빛" });
    expect(accessToken).toBe("at-1");
    expect(calls[0]!.url).toBe(KAKAO_TOKEN_URL);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init?.body as URLSearchParams))).toEqual({
      grant_type: "authorization_code",
      client_id: "rest-key",
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/kakao/callback",
      code: "the-code",
      client_secret: "client-secret",
    });
    expect(calls[1]!.url).toBe(KAKAO_ME_URL);
    expect((calls[1]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
  });

  it("names the step that failed", async () => {
    await expect(kakaoLogin("bad", PROD, fakeFetch([[401, { error: "invalid_grant" }]]).fetchImpl)).rejects.toMatchObject({ step: "token", status: 401 });
    await expect(kakaoLogin("ok", PROD, fakeFetch([[200, { access_token: "at" }], [401, { msg: "no" }]]).fetchImpl)).rejects.toBeInstanceOf(KakaoError);
  });

  it("lists missing settings by name and refuses the mock in production", () => {
    expect(kakaoConfigProblems(env({ NODE_ENV: "production" }))).toEqual(["KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET"]);
    expect(kakaoConfigProblems(PROD)).toEqual([]);
    expect(kakaoConfigProblems(env({ NODE_ENV: "production", STARLOG_KAKAO: "mock" }))).toEqual(["STARLOG_KAKAO=mock in production"]);
    expect(kakaoConfigProblems(env({ NODE_ENV: "test", STARLOG_KAKAO: "mock" }))).toEqual([]);
  });
});
```

`apps/web/app/api/auth/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret, kakaoKey } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import { giftExpiry } from "@/lib/pay/ledger";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, me, useTestDb } from "@/lib/testing/p4";
import { POST as ownerPost } from "../owner/route";
import { GET as callback } from "./kakao/callback/route";
import { GET as start } from "./kakao/start/route";
import { POST as logout } from "./logout/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Kakao login", () => {
  it("asks for the 만 14세 check before going to Kakao", async () => {
    useTestDb();
    const res = await browser().send(start, "/api/auth/kakao/start?returnTo=%2Ftarot%2Fresult");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login?next=%2Ftarot%2Fresult");
  });

  it("logs in, gives the signup gift once, shows it in /api/me, and logs out", async () => {
    const db = useTestDb();
    const b = browser();
    const res = await loginAs(b, "alice");
    expect(res.headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(b.jar.has("sl_sid")).toBe(true);
    expect(b.jar.has("sl_oauth")).toBe(false);
    expect(await me(b)).toEqual({
      payments: true,
      login: true,
      owner: false,
      user: { nickname: "테스트 별손님", stardust: 10, stardustExpiresAt: new Date(giftExpiry(T0)).toISOString(), unused: [] },
    });
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    expect((await me(b)).user).toBeNull();
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first()).toEqual({ n: 1 });
  });

  it("gives a gift that did not arrive at sign-up on the next login", async () => {
    const db = useTestDb();
    // An account whose sign-up gift failed: it exists, and no claim or lot was written.
    const key = await kakaoKey("mock-dave", accountSecret()!);
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_dave', ?, '데이브', 'c_dave_000000000000000000', 0, 0)").bind(key).run();
    const b = browser();
    await loginAs(b, "dave");
    expect((await me(b)).user?.stardust).toBe(10);
    await loginAs(b, "dave");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first()).toEqual({ n: 1 });
  });

  it("while paused, logs existing accounts in and creates none", async () => {
    const db = useTestDb();
    const alice = browser("198.51.100.20");
    await loginAs(alice, "alice");
    expect((await alice.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect((await loginAs(alice, "alice")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(alice)).toMatchObject({ payments: false, login: true, user: { stardust: 10 } });
    const bob = browser("198.51.100.21");
    expect((await loginAs(bob, "bob")).headers.get("location")).toBe("http://localhost/tarot/result?login=closed");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n: 1 });
  });

  it("checks the Kakao settings again in the callback", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser();
    const location = (await b.send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme&mockUser=erin")).headers.get("location")!;
    vi.stubEnv("STARLOG_KAKAO", "kakao");
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    expect((await b.send(callback, location)).headers.get("location")).toBe("http://localhost/me?login=unavailable");
    expect(b.jar.has("sl_sid")).toBe(false);
  });

  it("refuses a callback whose state belongs to another browser", async () => {
    useTestDb();
    const first = await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme&mockUser=bob");
    const other = browser();
    const res = await other.send(callback, first.headers.get("location")!);
    expect(res.headers.get("location")).toBe("http://localhost/?login=failed");
    expect(other.jar.has("sl_sid")).toBe(false);
  });

  it("comes back with login=cancel when consent was declined", async () => {
    useTestDb();
    const b = browser();
    const location = new URL((await b.send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")!);
    const res = await b.send(callback, `/api/auth/kakao/callback?error=access_denied&state=${location.searchParams.get("state")}`);
    expect(res.headers.get("location")).toBe("http://localhost/me?login=cancel");
  });

  it("stays closed while payments are off, and opens for the owner pass in owner mode", async () => {
    useTestDb();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")).toBe("http://localhost/me?login=closed");
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    expect((await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")).toBe("http://localhost/me?login=closed");
    const owner = browser("198.51.100.1");
    expect((await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } })).status).toBe(200);
    expect((await loginAs(owner, "owner")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(owner)).toMatchObject({ payments: true, login: true, owner: true, user: { stardust: 10 } });
  });

  it("only comes back to paths on this site", async () => {
    useTestDb();
    expect((await loginAs(browser(), "carol", "//evil.example")).headers.get("location")).toBe("http://localhost/?login=ok");
  });

  it("logs out only from our own pages", async () => {
    useTestDb();
    const b = browser();
    await loginAs(b);
    expect((await b.send(logout, "/api/auth/logout", { method: "POST" })).status).toBe(403);
    expect((await me(b)).user).not.toBeNull();
  });

  it("answers /api/me without D1 when there is no session", async () => {
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect(await me(browser())).toEqual({ payments: false, login: false, owner: false, user: null });
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run apps/web/lib/account/kakao.test.ts apps/web/app/api/auth/auth.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write `apps/web/lib/account/oauthState.ts`**

```ts
import "server-only";
import type { CookieSpec } from "@/lib/api/http";
import { randomId, safeEqual, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";
import { safeReturnTo } from "./returnTo";

/**
 * The OAuth `state`: a random value in a signed, 10-minute, httpOnly SameSite=Lax cookie. The
 * callback must bring the same value back (constant-time compare). This is the CSRF guard of the
 * Kakao flow. The cookie also carries where to return, why we went (login, or the account deletion
 * re-check) and whether the 만 14세 box was ticked.
 */

export const OAUTH_COOKIE = "sl_oauth";
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export type OAuthPurpose = "login" | "delete";

export interface OAuthIntent {
  returnTo: string;
  purpose: OAuthPurpose;
  age: boolean;
  /** delete: the session that asked (Task 12) */
  sid?: string;
}

interface OAuthPayload extends SignedPayload, OAuthIntent {
  k: "oauth";
  state: string;
  exp: number;
}

export async function issueOAuthState(intent: OAuthIntent, secret: string, now: number): Promise<{ state: string; cookie: CookieSpec }> {
  const state = randomId(24);
  const payload: OAuthPayload = { k: "oauth", state, ...intent, exp: now + OAUTH_TTL_MS };
  return { state, cookie: { name: OAUTH_COOKIE, value: await signToken(payload, secret), maxAge: OAUTH_TTL_MS / 1000 } };
}

/** The intent behind a callback, or null when the state is missing, forged, expired or not this browser's. */
export async function openOAuthState(cookie: string | undefined, state: string | null, secret: string, now: number): Promise<OAuthIntent | null> {
  if (!state) return null;
  const payload = await verifyToken<OAuthPayload>(cookie, "oauth", secret, now);
  if (!payload || typeof payload.state !== "string" || !(await safeEqual(payload.state, state, secret))) return null;
  return {
    returnTo: safeReturnTo(payload.returnTo),
    purpose: payload.purpose === "delete" ? "delete" : "login",
    age: payload.age === true,
    ...(typeof payload.sid === "string" ? { sid: payload.sid } : {}),
  };
}

export const CLEAR_OAUTH: CookieSpec = { name: OAUTH_COOKIE, value: "", maxAge: 0 };
```

- [ ] **Step 5: Write `apps/web/lib/account/kakao.ts`**

```ts
import "server-only";
import { SITE } from "@/lib/config";

/**
 * Kakao Login, server-side authorization-code flow (developers.kakao.com/docs/latest/ko/kakaologin/rest-api).
 * The access token is used inside one request and never stored; so is the raw Kakao id (only its
 * HMAC is kept, secrets.ts). STARLOG_KAKAO=mock accepts `mock:<name>` codes for tests and e2e, and
 * is refused in production.
 */

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
export const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
export const KAKAO_ME_URL = "https://kapi.kakao.com/v2/user/me";
export const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";
export const MOCK_CODE_PREFIX = "mock:";

export type KakaoMode = "kakao" | "mock";

export function kakaoMode(env: NodeJS.ProcessEnv = process.env): KakaoMode {
  return env.STARLOG_KAKAO?.trim().toLowerCase() === "mock" ? "mock" : "kakao";
}

/** Missing settings by name (never values). */
export function kakaoConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (kakaoMode(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_KAKAO=mock in production"] : [];
  const problems: string[] = [];
  if (!env.KAKAO_REST_API_KEY?.trim()) problems.push("KAKAO_REST_API_KEY");
  if (!env.KAKAO_CLIENT_SECRET?.trim()) problems.push("KAKAO_CLIENT_SECRET");
  return problems;
}

/** The registered redirect URI: the production site, or localhost:3100 in development. */
export function kakaoRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.NODE_ENV === "production" ? SITE.url : "http://localhost:3100";
  return `${origin}/api/auth/kakao/callback`;
}

export function authorizeUrl(state: string, env: NodeJS.ProcessEnv = process.env): string {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.KAKAO_REST_API_KEY?.trim() ?? "");
  url.searchParams.set("redirect_uri", kakaoRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface KakaoProfile {
  /** the Kakao member number as a string (hash it with kakaoKey before storing) */
  id: string;
  nickname: string;
}

export class KakaoError extends Error {
  constructor(
    readonly step: "token" | "me",
    readonly status: number,
  ) {
    super(`kakao ${step} ${status}`);
  }
}

/** Code → access token (with the client secret) → member number and nickname. */
export async function kakaoLogin(code: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<{ profile: KakaoProfile; accessToken: string }> {
  if (kakaoMode(env) === "mock") {
    if (!code.startsWith(MOCK_CODE_PREFIX)) throw new KakaoError("token", 400);
    const name = code.slice(MOCK_CODE_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "e2e";
    return { profile: { id: `mock-${name}`, nickname: "테스트 별손님" }, accessToken: "mock" };
  }
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.KAKAO_REST_API_KEY?.trim() ?? "",
    redirect_uri: kakaoRedirectUri(env),
    code,
    client_secret: env.KAKAO_CLIENT_SECRET?.trim() ?? "",
  });
  const tokenResponse = await fetchImpl(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!tokenResponse.ok || typeof token?.access_token !== "string") throw new KakaoError("token", tokenResponse.status);
  const meResponse = await fetchImpl(KAKAO_ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const me = (await meResponse.json().catch(() => null)) as { id?: unknown; kakao_account?: { profile?: { nickname?: unknown } } } | null;
  if (!meResponse.ok || (typeof me?.id !== "number" && typeof me?.id !== "string")) throw new KakaoError("me", meResponse.status);
  const nickname = typeof me.kakao_account?.profile?.nickname === "string" ? me.kakao_account.profile.nickname : "";
  return { profile: { id: String(me.id), nickname }, accessToken: token.access_token };
}

/** Disconnects the app from the Kakao account (account deletion). False when Kakao refused. */
export async function kakaoUnlink(accessToken: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (kakaoMode(env) === "mock") return true;
  const response = await fetchImpl(KAKAO_UNLINK_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  return response.ok;
}
```

- [ ] **Step 6: Write the routes**

`apps/web/app/api/auth/kakao/start/route.ts`:

```ts
import { MOCK_CODE_PREFIX, authorizeUrl, kakaoConfigProblems, kakaoMode } from "@/lib/account/kakao";
import { issueOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { loginOpen, paymentsMode } from "@/lib/pay/mode";
import { randomId } from "@/lib/security/sign";

/**
 * GET ?returnTo=/path&age=1 → Kakao's consent screen, with a signed 10-minute state cookie guarding
 * the way back. It works only while login is open for this device (STARLOG_PAYMENTS on, owner mode
 * with the owner pass, or paused for existing accounts), and only after the 만 14세 check on /login. With STARLOG_KAKAO=mock it goes straight to the callback with a
 * `mock:<mockUser>` code (tests, e2e). Without `mockUser` each login is a fresh mock account, so
 * repeated e2e runs on the same local D1 each start with the signup gift.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, returnTo, { login: ctx.status === 429 ? "busy" : "unavailable" });
  if (!loginOpen(paymentsMode(), ctx.owner)) return redirectTo(request, returnTo, { login: "closed" });
  const problems = kakaoConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.kakao_invalid", problems }));
    return redirectTo(request, returnTo, { login: "unavailable" });
  }
  if (url.searchParams.get("age") !== "1") return redirectTo(request, "/login", { next: returnTo });
  const { state, cookie } = await issueOAuthState({ returnTo, purpose: "login", age: true }, ctx.secret, ctx.now);
  const target =
    kakaoMode() === "mock"
      ? `/api/auth/kakao/callback?code=${encodeURIComponent(MOCK_CODE_PREFIX + (url.searchParams.get("mockUser") ?? `e2e${randomId(6)}`))}&state=${state}`
      : authorizeUrl(state);
  return redirectTo(request, target, {}, [cookie]);
}
```

`apps/web/app/api/auth/kakao/callback/route.ts`:

```ts
import type { CookieSpec } from "@/lib/api/http";
import { KakaoError, kakaoConfigProblems, kakaoLogin } from "@/lib/account/kakao";
import { CLEAR_OAUTH, OAUTH_COOKIE, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser, userByKakaoKey } from "@/lib/account/users";
import { SITE } from "@/lib/config";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's sl_oauth cookie.
 * - Login: find the account, or create one while sales are open for this device (paused: existing
 *   accounts only, else ?login=closed). While sales are open the signup gift is tried on every login
 *   (once per Kakao account). Start a session and return with ?login=ok|cancel|failed.
 * - The Kakao settings are checked again here: the code is never used against a half-configured app.
 * - The account-deletion re-check (purpose "delete") is handled in Task 12.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [CLEAR_OAUTH]);
  const intent = await openOAuthState(ctx.cookies[OAUTH_COOKIE], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent) return redirectTo(request, "/", { login: "failed" }, [CLEAR_OAUTH]);
  const back = (flag: string, cookies: Array<CookieSpec | string> = []) => redirectTo(request, intent.returnTo, { login: flag }, [CLEAR_OAUTH, ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  if (intent.purpose !== "login") return redirectTo(request, "/me", { delete: "failed" }, [CLEAR_OAUTH]);
  const problems = kakaoConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.kakao_invalid", problems }));
    return back("unavailable");
  }

  let login: Awaited<ReturnType<typeof kakaoLogin>>;
  try {
    login = await kakaoLogin(code);
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.kakao_failed", step: error instanceof KakaoError ? error.step : "unknown", status: error instanceof KakaoError ? error.status : 0 }));
    return back("failed");
  }
  const key = await kakaoKey(login.profile.id, ctx.accountSecret);
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return back("closed");
  const account = await loginKakaoUser(ctx.db, { key, nickname: login.profile.nickname, ageConfirmed: intent.age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return back("failed");
  }
  const { user, created } = account;
  const gifted = open ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, units: SITE.price.signupGiftFree, now: ctx.now }) : false;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", created, gifted }));
  return back("ok", [session.cookie]);
}
```

`apps/web/app/api/auth/logout/route.ts`:

```ts
import { openAccountRoute } from "@/lib/account/request";
import { CLEAR_SESSION, revokeSession } from "@/lib/account/session";
import { json, serializeCookie } from "@/lib/api/http";

/** POST → ends this device's session (the D1 row is revoked, the cookie cleared). Our own pages only. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  return json({ ok: true }, { cookies: [serializeCookie(CLEAR_SESSION)] });
}
```

`apps/web/app/api/me/route.ts`:

```ts
import { openAccount } from "@/lib/account/request";
import { CLEAR_SESSION, SESSION_COOKIE } from "@/lib/account/session";
import { json, parseCookies, serializeCookie } from "@/lib/api/http";
import { walletSummary } from "@/lib/pay/ledger";
import { loginOpen, paymentsMode, salesOpen } from "@/lib/pay/mode";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → { payments, login, owner, user }:
 * - `payments`: whether sales are open for this device;
 * - `login`: whether this device may log in (also while sales are paused, for existing accounts);
 * - `owner`: whether it holds the owner pass;
 * - `user`: the logged-in user's nickname, 별조각 (with the soonest expiry) and unopened purchases.
 * Without a session cookie it never touches D1, so the site works with no database.
 */
export async function GET(request: Request): Promise<Response> {
  const now = Date.now();
  const cookies = parseCookies(request);
  const secret = signingSecret();
  const owner = secret ? await isOwner(cookies[OWNER_COOKIE], secret, now) : false;
  const mode = paymentsMode();
  const payments = salesOpen(mode, owner);
  const login = loginOpen(mode, owner);
  if (!cookies[SESSION_COOKIE]) return json({ payments, login, owner, user: null });
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response) return json({ payments: false, login: false, owner, user: null });
  if (!ctx.session) return json({ payments, login, owner, user: null }, { cookies: [serializeCookie(CLEAR_SESSION)] });
  const wallet = await walletSummary(ctx.db, ctx.session.user.id, now);
  return json({
    payments,
    login,
    owner,
    user: {
      nickname: ctx.session.user.nickname ?? "별손님",
      stardust: wallet.stardust,
      stardustExpiresAt: wallet.stardustExpiresAt === null ? null : new Date(wallet.stardustExpiresAt).toISOString(),
      unused: wallet.unused,
    },
  });
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/lib/account apps/web/app/api/auth`
Expected: PASS (kakao 5, auth 11, account 14).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account/oauthState.ts apps/web/lib/account/kakao.ts apps/web/lib/account/kakao.test.ts apps/web/app/api/auth apps/web/app/api/me apps/web/lib/testing/p4.ts
git commit -m "feat(auth): Kakao login with signed state, sessions, /api/me and logout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Toss client and mock

**Files:**
- Create: `apps/web/lib/pay/tossTypes.ts`, `apps/web/lib/pay/toss.ts`, `apps/web/lib/pay/tossMock.ts`
- Test: `apps/web/lib/pay/toss.test.ts`

**Interfaces:**
- Consumes: `payConfigProblems`, `payProvider` (Task 2)
- Produces:
  - `tossTypes.ts`:
    - `interface TossPayment { paymentKey; orderId; status; totalAmount; balanceAmount; method: string | null; approvedAt: string | null; receiptUrl: string | null }`
    - `class TossError { status: number; code: string }` (status 0 = no response)
    - `isPendingTossError(error): boolean`: no answer, 5xx or 409 `IDEMPOTENT_REQUEST_PROCESSING` (M2)
    - `interface TossClient { mode: "test" | "live" | "mock"; confirm({paymentKey, orderId, amount}); getPayment(paymentKey); getPaymentByOrder(orderId); cancel(paymentKey, {reason, idempotencyKey}) }`, all `Promise<TossPayment>`
    - `parsePayment(value: unknown): TossPayment`
  - `toss.ts`: `TOSS_API`, `tossAuthorization(secretKey)`, `createTossClient(secretKey, fetchImpl?, timeoutMs?)`, `tossClient(env?): TossClient | null`
  - `tossMock.ts`: `interface MockToss extends TossClient { reset(); failNext(op, error, {applied?}) }`, `createMockToss(): MockToss`, `mockToss` (the one instance `tossClient()` returns under `STARLOG_PAY=mock`)

**Toss's Idempotency-Key, as the mock reproduces it (M2):**
- A POST with a key Toss has seen replays that key's first answer for 15 days, errors included.
- 409 `IDEMPOTENT_REQUEST_PROCESSING` means the first request with that key is still running.
- So a 409, a 5xx or no answer says nothing about the payment. Callers look the payment up before deciding (Tasks 7 and 8), and retry with a new, attempt-scoped key only after a look-up shows it is still `DONE`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/pay/toss.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createTossClient, tossAuthorization, tossClient } from "./toss";
import { mockToss } from "./tossMock";
import { TossError, isPendingTossError } from "./tossTypes";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const SECRET = "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
const PAYMENT = {
  paymentKey: "tgen_20261001",
  orderId: ORDER,
  status: "DONE",
  totalAmount: 2900,
  balanceAmount: 2900,
  method: "카드",
  approvedAt: "2026-10-01T12:00:00+09:00",
  receipt: { url: "https://dashboard.tosspayments.com/receipt/redirection?transactionId=x" },
};

function fakeFetch(responses: Array<{ status: number; body: unknown } | "network">) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift()!;
    if (next === "network") throw new TypeError("fetch failed");
    return Response.json(next.body, { status: next.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("Toss client", () => {
  it("confirms with Basic secret-plus-colon auth, an idempotency key and the amount it is given", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: PAYMENT }]);
    const payment = await createTossClient(SECRET, fetchImpl).confirm({ paymentKey: PAYMENT.paymentKey, orderId: ORDER, amount: 2900 });
    expect(payment).toEqual({
      paymentKey: PAYMENT.paymentKey,
      orderId: ORDER,
      status: "DONE",
      totalAmount: 2900,
      balanceAmount: 2900,
      method: "카드",
      approvedAt: PAYMENT.approvedAt,
      receiptUrl: PAYMENT.receipt.url,
    });
    expect(calls[0]).toMatchObject({ url: "https://api.tosspayments.com/v1/payments/confirm", method: "POST", body: { paymentKey: PAYMENT.paymentKey, orderId: ORDER, amount: 2900 } });
    expect(calls[0]!.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `confirm-${ORDER}`,
    });
    expect(tossAuthorization(SECRET)).toBe(`Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`);
  });

  it("looks payments up by key and by order, without an idempotency key", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: PAYMENT }, { status: 200, body: PAYMENT }]);
    const client = createTossClient(SECRET, fetchImpl);
    await client.getPayment(PAYMENT.paymentKey);
    await client.getPaymentByOrder(ORDER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", `https://api.tosspayments.com/v1/payments/${PAYMENT.paymentKey}`],
      ["GET", `https://api.tosspayments.com/v1/payments/orders/${ORDER}`],
    ]);
    for (const call of calls) expect(Object.keys(call.headers)).toEqual(["Authorization"]);
  });

  it("cancels with the reason and the caller's idempotency key", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: { ...PAYMENT, status: "CANCELED", balanceAmount: 0 } }]);
    const payment = await createTossClient(SECRET, fetchImpl).cancel(PAYMENT.paymentKey, { reason: "열지 않은 풀이 환불", idempotencyKey: `cancel-${ORDER}` });
    expect(payment.status).toBe("CANCELED");
    expect(calls[0]).toMatchObject({ url: `https://api.tosspayments.com/v1/payments/${PAYMENT.paymentKey}/cancel`, method: "POST", body: { cancelReason: "열지 않은 풀이 환불" } });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe(`cancel-${ORDER}`);
  });

  it("turns Toss errors, no response and odd bodies into TossError", async () => {
    const declined = createTossClient(SECRET, fakeFetch([{ status: 403, body: { code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." } }]).fetchImpl);
    await expect(declined.confirm({ paymentKey: "k", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ status: 403, code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    const offline = createTossClient(SECRET, fakeFetch(["network"]).fetchImpl);
    await expect(offline.getPayment("k")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
    const odd = createTossClient(SECRET, fakeFetch([{ status: 200, body: {} }]).fetchImpl);
    await expect(odd.getPayment("k")).rejects.toBeInstanceOf(TossError);
  });

  it("calls an answer unknown when Toss gave none, failed itself, or is still processing the key", () => {
    expect(isPendingTossError(new TossError(0, "NETWORK", ""))).toBe(true);
    expect(isPendingTossError(new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""))).toBe(true);
    expect(isPendingTossError(new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", ""))).toBe(true);
    expect(isPendingTossError(new Error("anything else"))).toBe(true);
    expect(isPendingTossError(new TossError(403, "REJECT_CARD_PAYMENT", ""))).toBe(false);
    expect(isPendingTossError(new TossError(400, "ALREADY_PROCESSED_PAYMENT", ""))).toBe(false);
  });

  it("knows test from live by the secret key", () => {
    expect(createTossClient("test_gsk_x").mode).toBe("test");
    expect(createTossClient("live_gsk_x").mode).toBe("live");
  });

  it("picks the mock with STARLOG_PAY=mock and nothing when the keys are wrong", () => {
    expect(tossClient(env({ STARLOG_PAY: "mock", NODE_ENV: "test" }))).toBe(mockToss);
    expect(tossClient(env({ NODE_ENV: "production" }))).toBeNull();
    expect(tossClient(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_a", TOSS_SECRET_KEY: SECRET }))?.mode).toBe("test");
  });
});

describe("mock Toss", () => {
  beforeEach(() => mockToss.reset());

  it("approves a payment once: the same order replays its answer, another order is refused", async () => {
    const payment = await mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 });
    expect(payment).toMatchObject({ status: "DONE", totalAmount: 2900, orderId: ORDER });
    expect(await mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 })).toEqual(payment);
    await expect(mockToss.confirm({ paymentKey: "mock_1", orderId: "Other_order_000000000001", amount: 2900 })).rejects.toMatchObject({ code: "ALREADY_PROCESSED_PAYMENT" });
    expect(await mockToss.getPaymentByOrder(ORDER)).toEqual(payment);
  });

  it("replays a key's first answer, a refusal included, and cancels once", async () => {
    await expect(mockToss.confirm({ paymentKey: "mock_fail_1", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ status: 403, code: "REJECT_CARD_PAYMENT" });
    // The same order (the same Idempotency-Key) gets the same refusal, whatever it sends now.
    await expect(mockToss.confirm({ paymentKey: "mock_2", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ code: "REJECT_CARD_PAYMENT" });
    const other = "Cc3_dEf-Gh5iJk7Lm9No1Pq2";
    await mockToss.confirm({ paymentKey: "mock_2", orderId: other, amount: 2900 });
    expect(await mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-1" })).toMatchObject({ status: "CANCELED", balanceAmount: 0 });
    expect(await mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-1" })).toMatchObject({ status: "CANCELED" });
    await expect(mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-2" })).rejects.toMatchObject({ code: "ALREADY_CANCELED_PAYMENT" });
    await expect(mockToss.getPayment("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND_PAYMENT" });
  });

  it("can lose an answer after the work, or refuse before it", async () => {
    await mockToss.confirm({ paymentKey: "mock_3", orderId: ORDER, amount: 2900 });
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    await expect(mockToss.cancel("mock_3", { reason: "r", idempotencyKey: "cancel-a" })).rejects.toMatchObject({ status: 0 });
    expect((await mockToss.getPayment("mock_3")).status).toBe("CANCELED");
    expect(await mockToss.cancel("mock_3", { reason: "r", idempotencyKey: "cancel-a" })).toMatchObject({ status: "CANCELED" });
  });

  it("keeps no answer for a key that was still processing", async () => {
    await mockToss.confirm({ paymentKey: "mock_4", orderId: ORDER, amount: 2900 });
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    await expect(mockToss.cancel("mock_4", { reason: "r", idempotencyKey: "cancel-b" })).rejects.toMatchObject({ status: 409 });
    expect((await mockToss.getPayment("mock_4")).status).toBe("DONE");
    expect(await mockToss.cancel("mock_4", { reason: "r", idempotencyKey: "cancel-b" })).toMatchObject({ status: "CANCELED" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/lib/pay/toss.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/pay/tossTypes.ts`**

```ts
/** Shapes shared by the real Toss client and the mock (docs.tosspayments.com/reference). */

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  /** READY, IN_PROGRESS, WAITING_FOR_DEPOSIT, DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED */
  status: string;
  totalAmount: number;
  /** what is left to cancel */
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  receiptUrl: string | null;
}

/** A Toss error answer (`{code, message}`), or status 0 / code NETWORK when nothing came back. */
export class TossError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message || code);
  }
}

/**
 * An answer that says nothing about the payment (M2): no answer, a Toss-side 5xx, or 409
 * IDEMPOTENT_REQUEST_PROCESSING (the first request with this Idempotency-Key is still running).
 * Anything that is not a TossError counts too. Never treat these as a refusal: look the payment up.
 */
export function isPendingTossError(error: unknown): boolean {
  if (!(error instanceof TossError)) return true;
  return error.status === 0 || error.status >= 500 || error.status === 409 || error.code === "IDEMPOTENT_REQUEST_PROCESSING";
}

export interface TossClient {
  readonly mode: "test" | "live" | "mock";
  confirm(input: { paymentKey: string; orderId: string; amount: number }): Promise<TossPayment>;
  getPayment(paymentKey: string): Promise<TossPayment>;
  getPaymentByOrder(orderId: string): Promise<TossPayment>;
  cancel(paymentKey: string, input: { reason: string; idempotencyKey: string }): Promise<TossPayment>;
}

/** The fields we use from a Payment object; anything that is not one is a TossError. */
export function parsePayment(value: unknown): TossPayment {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.paymentKey !== "string" || typeof v.orderId !== "string" || typeof v.status !== "string" || typeof v.totalAmount !== "number") {
    throw new TossError(502, "BAD_RESPONSE", "unexpected payment object");
  }
  const receipt = v.receipt as { url?: unknown } | null | undefined;
  return {
    paymentKey: v.paymentKey,
    orderId: v.orderId,
    status: v.status,
    totalAmount: v.totalAmount,
    balanceAmount: typeof v.balanceAmount === "number" ? v.balanceAmount : v.totalAmount,
    method: typeof v.method === "string" ? v.method : null,
    approvedAt: typeof v.approvedAt === "string" ? v.approvedAt : null,
    receiptUrl: typeof receipt?.url === "string" ? receipt.url : null,
  };
}
```

- [ ] **Step 4: Write `apps/web/lib/pay/tossMock.ts`**

```ts
import "server-only";
import { TossError, type TossClient, type TossPayment } from "./tossTypes";

type Op = "confirm" | "cancel" | "get";

export interface MockToss extends TossClient {
  reset(): void;
  /**
   * The next `op` call fails with `error`. With `applied`, Toss did the work first and only the
   * answer was lost (a timeout after success); without it, nothing happened.
   */
  failNext(op: Op, error: TossError, options?: { applied?: boolean }): void;
}

/**
 * STARLOG_PAY=mock: an in-memory Toss for tests, e2e and local dev. It behaves like the real API
 * where the app depends on it:
 * - a POST replays its Idempotency-Key's first answer, a refusal included (confirm's key is
 *   `confirm-<orderId>`, as the real client sends). 409 processing and no answer are not kept;
 * - a payment is confirmed once (another order with that paymentKey → ALREADY_PROCESSED_PAYMENT);
 * - a paymentKey starting with "mock_fail" is declined;
 * - cancel empties the balance once (a new key afterwards → ALREADY_CANCELED_PAYMENT).
 */
export function createMockToss(): MockToss {
  const payments = new Map<string, TossPayment>();
  const replies = new Map<string, { payment?: TossPayment; error?: TossError }>();
  const planned = new Map<Op, { error: TossError; applied: boolean }>();
  const notFound = () => new TossError(404, "NOT_FOUND_PAYMENT", "존재하지 않는 결제 정보 입니다.");
  const find = (paymentKey: string) => {
    const payment = payments.get(paymentKey);
    if (!payment) throw notFound();
    return payment;
  };
  const kept = (error: TossError) => error.status >= 400 && error.status !== 409;

  /** A POST under `key`: the first answer is kept and replayed; a planned failure goes first. */
  async function post(op: Op, key: string, work: () => TossPayment): Promise<TossPayment> {
    const seen = replies.get(key);
    if (seen?.error) throw seen.error;
    if (seen?.payment) return seen.payment;
    const plan = planned.get(op);
    planned.delete(op);
    if (plan && !plan.applied) {
      if (kept(plan.error)) replies.set(key, { error: plan.error });
      throw plan.error;
    }
    let payment: TossPayment;
    try {
      payment = work();
    } catch (error) {
      if (error instanceof TossError && kept(error)) replies.set(key, { error });
      throw error;
    }
    replies.set(key, { payment });
    if (plan) throw plan.error;
    return payment;
  }

  async function get(work: () => TossPayment): Promise<TossPayment> {
    const plan = planned.get("get");
    planned.delete("get");
    if (plan) throw plan.error;
    return work();
  }

  return {
    mode: "mock",
    confirm: ({ paymentKey, orderId, amount }) =>
      post("confirm", `confirm-${orderId}`, () => {
        if (payments.has(paymentKey)) throw new TossError(400, "ALREADY_PROCESSED_PAYMENT", "이미 처리된 결제 입니다.");
        if (paymentKey.startsWith("mock_fail")) throw new TossError(403, "REJECT_CARD_PAYMENT", "한도초과 혹은 잔액부족으로 결제에 실패했습니다.");
        const payment: TossPayment = { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString(), receiptUrl: null };
        payments.set(paymentKey, payment);
        return payment;
      }),
    getPayment: (paymentKey) => get(() => find(paymentKey)),
    getPaymentByOrder: (orderId) =>
      get(() => {
        for (const payment of payments.values()) if (payment.orderId === orderId) return payment;
        throw notFound();
      }),
    cancel: (paymentKey, { idempotencyKey }) =>
      post("cancel", idempotencyKey, () => {
        const payment = find(paymentKey);
        if (payment.status === "CANCELED") throw new TossError(400, "ALREADY_CANCELED_PAYMENT", "이미 취소된 결제 입니다.");
        const canceled = { ...payment, status: "CANCELED", balanceAmount: 0 };
        payments.set(paymentKey, canceled);
        return canceled;
      }),
    failNext(op, error, options = {}) {
      planned.set(op, { error, applied: options.applied === true });
    },
    reset() {
      payments.clear();
      replies.clear();
      planned.clear();
    },
  };
}

/** The one mock instance (kept on globalThis so every route bundle in `next dev` shares it). */
export const mockToss: MockToss = ((globalThis as unknown as { __starlogMockToss?: MockToss }).__starlogMockToss ??= createMockToss());
```

- [ ] **Step 5: Write `apps/web/lib/pay/toss.ts`**

```ts
import "server-only";
import { payConfigProblems, payProvider } from "./mode";
import { mockToss } from "./tossMock";
import { TossError, parsePayment, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Toss Payments core API (docs.tosspayments.com/reference). Server only: the secret key never
 * leaves the Worker.
 * - Auth is `Basic base64(secretKey + ":")`; the colon is required.
 * - POSTs carry an Idempotency-Key. Toss keeps it 15 days and replays its first answer, errors
 *   included; 409 IDEMPOTENT_REQUEST_PROCESSING means that first request is still running.
 *   Confirm's key is `confirm-<orderId>` (an order is confirmed once); cancel's comes from the
 *   caller (`cancel-<orderId>-<attempt>`, Task 8).
 * - Confirm must run within 10 minutes of the buyer's authentication.
 * - Each call waits at most 30 s. A caller decides nothing from a missing answer: it looks the
 *   payment up (isPendingTossError).
 */

export const TOSS_API = "https://api.tosspayments.com";

export const tossAuthorization = (secretKey: string) => `Basic ${btoa(`${secretKey}:`)}`;

export function createTossClient(secretKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): TossClient {
  const call = async (path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<TossPayment> => {
    const headers: Record<string, string> = { Authorization: tossAuthorization(secretKey) };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    let response: Response;
    try {
      response = await fetchImpl(`${TOSS_API}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TossError(0, "NETWORK", "no response from Toss");
    }
    const data = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
    if (!response.ok) {
      throw new TossError(response.status, typeof data?.code === "string" ? data.code : "UNKNOWN", typeof data?.message === "string" ? data.message : "");
    }
    return parsePayment(data);
  };
  return {
    mode: secretKey.startsWith("live_") ? "live" : "test",
    confirm: ({ paymentKey, orderId, amount }) =>
      call("/v1/payments/confirm", { method: "POST", body: { paymentKey, orderId, amount }, idempotencyKey: `confirm-${orderId}` }),
    getPayment: (paymentKey) => call(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" }),
    getPaymentByOrder: (orderId) => call(`/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
    cancel: (paymentKey, { reason, idempotencyKey }) =>
      call(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { method: "POST", body: { cancelReason: reason }, idempotencyKey }),
  };
}

let loggedProblems = false;

/** This deploy's Toss: the mock under STARLOG_PAY=mock, null when keys are missing or mixed (logged once, by name). */
export function tossClient(env: NodeJS.ProcessEnv = process.env): TossClient | null {
  const problems = payConfigProblems(env);
  if (problems.length) {
    if (!loggedProblems) {
      loggedProblems = true;
      console.error(JSON.stringify({ evt: "config.pay_invalid", problems }));
    }
    return null;
  }
  if (payProvider(env) === "mock") return mockToss;
  return createTossClient(env.TOSS_SECRET_KEY!.trim());
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/lib/pay/toss.test.ts`
Expected: PASS (11 tests). One `config.pay_invalid` line on stderr is expected from the null case.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/tossTypes.ts apps/web/lib/pay/toss.ts apps/web/lib/pay/tossMock.ts apps/web/lib/pay/toss.test.ts
git commit -m "feat(pay): Toss confirm, lookup and cancel client with an in-memory mock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Orders, checkout info, confirm (no session needed)

**Files:**
- Create: `apps/web/lib/pay/orders.ts`, `apps/web/app/api/pay/checkout/route.ts`, `apps/web/app/api/pay/orders/route.ts`, `apps/web/app/api/pay/confirm/route.ts`
- Modify: `apps/web/lib/testing/p4.ts` (add `buy`)
- Test: `apps/web/app/api/pay/pay.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `productById`, `sellable`, `unitsFor`, `paymentsMode`, `salesOpen`, `payProvider`, `tossClientKey`.
  - Task 3: `openAccountRoute`, `requireSession`, `safeReturnTo`.
  - Task 4: `paidLotStatements`. Task 6: `tossClient`, `TossError`, `isPendingTossError`, `TossClient`, `TossPayment`, `mockToss.failNext` (tests).
  - Existing: `isConstraintError`, `randomId`, `json`, `errorResponse`, `readJson`.
- Produces:
  - `orders.ts`:
    - `type OrderStatus`, `interface OrderRow` (the `orders` row, with `cancel_attempt`)
    - `createOrder(db, {userId, product, returnTo, now}): Promise<OrderRow>`
    - `orderById(db, id)`, `orderForUser(db, id, userId)`
    - `type MarkPaidResult = "paid" | "orphaned" | "already"`, `markPaid(db, order, payment, mode, now): Promise<MarkPaidResult>`
    - `ORPHAN_MESSAGE`, `type ConfirmOutcome = {ok: true; order} | {ok: false; code: "PAY_FAILED" | "PAY_PENDING" | "BAD_REQUEST"; message?; orphaned?}`
    - `confirmOrder(db, toss, {order, paymentKey, amount, now})`
    - `RECONCILE_AFTER_MS = 30_000`, `STALE_CONFIRM_MS = 900_000`, `reconcileConfirming(db, toss, order, now, {force?}): Promise<OrderRow>`
    - `interface OrderListItem { orderId; productId; amount; status; createdAt; receiptUrl; method; refundable; opened }`, `orderHistory(db, userId, limit?)`
  - `GET /api/pay/checkout?product=` → `{ productId, name, amount, customerKey, provider: "toss" | "mock", clientKey: string | null }` (session)
  - `POST /api/pay/orders {productId, returnTo?, ack: true}` → `{ orderId, orderName, amount, successUrl, failUrl }` (session)
  - `GET /api/pay/orders?id=` → `{ orderId, productId, status, returnTo, signedIn }` (no session needed); `GET /api/pay/orders` → `{ orders: OrderListItem[] }` (session)
  - `POST /api/pay/confirm {paymentKey, orderId, amount}` → `{ status: "paid", orderId, productId, returnTo, signedIn }` or an error code (no session needed)
  - `lib/testing/p4.ts`: `buy(b, productId?): Promise<string>` (order id)

**Rules (revision 2):**
- **No session for confirm or the status look-up (M5).** A card app or the KakaoTalk in-app browser can bring the buyer back to `/pay/success` in another browser, without the session cookie.
  - The order id (24 random characters) and Toss's paymentKey are the proof. The amount must be the order's. The grant always goes to `order.user_id`.
  - The route keeps the PAY limiter and the same-origin check. `signedIn` tells the success page whether this browser holds the buyer's session (Task 16).
- **Toss answers (M2):**
  - 409 `IDEMPOTENT_REQUEST_PROCESSING`, a 5xx or no answer leave the order `confirming` (`PAY_PENDING`). They are never a refusal.
  - Any other error answer is followed by a look-up of the payment before the order is decided. DONE is granted; a look-up that fails keeps it pending.
  - `reconcileConfirming` decides from the look-up: DONE → paid; ABORTED, EXPIRED or CANCELED → failed. A payment still not done, or not found, 15 minutes later (past Toss's 10-minute confirm window) → failed.
- **A deleted account is never granted anything (M3).** `markPaid` moves such an order to `refunding` with `fail_code` `ACCOUNT_DELETED`, keeps the payment row and writes no lot. Task 8 cancels the payment at once, and the Cron Trigger retries it (Task 13).

- [ ] **Step 1: Add `buy` to `apps/web/lib/testing/p4.ts`**

```ts
import { POST as confirmPost } from "@/app/api/pay/confirm/route";
import { POST as ordersPost } from "@/app/api/pay/orders/route";

let paymentSeq = 0;

/** Buys through the mock Toss (STARLOG_PAY=mock): create the order, then confirm it. Returns the order id. */
export async function buy(b: Browser, productId = "tarot"): Promise<string> {
  const order = await b.send(ordersPost, "/api/pay/orders", { body: { productId, returnTo: "/tarot/result", ack: true }, origin: true });
  if (order.status !== 200) throw new Error(`order answered ${order.status}`);
  const { orderId, amount } = (await order.json()) as { orderId: string; amount: number };
  const confirmed = await b.send(confirmPost, "/api/pay/confirm", { body: { paymentKey: `mock_${++paymentSeq}_${orderId}`, orderId, amount }, origin: true });
  if (confirmed.status !== 200) throw new Error(`confirm answered ${confirmed.status}`);
  return orderId;
}
```

(Put the two imports with the others at the top of the file.)

- [ ] **Step 2: Write the failing test** — `apps/web/app/api/pay/pay.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as checkout } from "./checkout/route";
import { POST as confirm } from "./confirm/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loggedIn(name = "alice"): Promise<Browser> {
  const b = browser();
  await loginAs(b, name);
  return b;
}

const order = (b: Browser, body: Record<string, unknown>) => b.send(ordersPost, "/api/pay/orders", { body, origin: true });
const newOrder = async (b: Browser) => ((await (await order(b, { productId: "tarot", returnTo: "/tarot/result", ack: true })).json()) as { orderId: string }).orderId;
const confirmAs = (b: Browser, orderId: string, paymentKey: string, amount = 2900) => b.send(confirm, "/api/pay/confirm", { body: { paymentKey, orderId, amount }, origin: true });
const statusOf = async (b: Browser, orderId: string) => (await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()) as Record<string, unknown>;

describe("checkout and orders", () => {
  it("gives the checkout page the server's price and the buyer's customer key", async () => {
    useTestDb();
    const b = await loggedIn();
    const res = await b.send(checkout, "/api/pay/checkout?product=tarot");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, provider: "mock", clientKey: null });
    expect(body.customerKey).toMatch(/^c_[A-Za-z0-9_-]{24}$/);
  });

  it("prices an order from the catalog, never from the request, and only after the 청약철회 notice", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    expect((await order(b, { productId: "tarot", returnTo: "/tarot/result" })).status).toBe(400);
    const res = await order(b, { productId: "tarot", returnTo: "/tarot/result", ack: true, amount: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; amount: number; orderName: string; successUrl: string; failUrl: string };
    expect(body).toMatchObject({ amount: 2900, orderName: "스타로그 타로 전체 풀이", successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail" });
    expect(body.orderId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await db.prepare("SELECT amount_krw, status, withdrawal_ack_at, cancel_attempt FROM orders WHERE id = ?").bind(body.orderId).first()).toEqual({ amount_krw: 2900, status: "created", withdrawal_ack_at: T0, cancel_attempt: 1 });
  });

  it("refuses premium readings before P5, unknown products, guests, closed sales and other sites", async () => {
    useTestDb();
    const b = await loggedIn();
    expect((await order(b, { productId: "match", ack: true })).status).toBe(409);
    expect((await order(b, { productId: "moon-30", ack: true })).status).toBe(409);
    expect((await order(browser("192.0.2.1"), { productId: "tarot", ack: true })).status).toBe(401);
    expect((await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true } })).status).toBe(403);
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect((await order(b, { productId: "tarot", ack: true })).status).toBe(409);
  });
});

describe("confirm", () => {
  it("confirms once and grants exactly one unopened reading, however often it is called", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    const again = await confirmAs(b, orderId, "mock_again");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "paid", signedIn: true });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant' AND order_id = ?").bind(orderId).first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT status, mode, total_amount FROM payments WHERE order_id = ?").bind(orderId).first()).toEqual({ status: "DONE", mode: "mock", total_amount: 2900 });
  });

  it("confirms from a browser without the session (an in-app browser handing over), for the order's own account", async () => {
    useTestDb();
    const alice = await loggedIn();
    const orderId = await newOrder(alice);
    const elsewhere = browser("192.0.2.77");
    const res = await confirmAs(elsewhere, orderId, "mock_handover");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "paid", orderId, productId: "tarot", returnTo: "/tarot/result", signedIn: false });
    expect(await statusOf(elsewhere, orderId)).toEqual({ orderId, productId: "tarot", status: "paid", returnTo: "/tarot/result", signedIn: false });
    expect((await me(alice)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect((await elsewhere.send(confirm, "/api/pay/confirm", { body: { paymentKey: "x", orderId, amount: 2900 } })).status).toBe(403);
  });

  it("refuses an amount that is not the order's, and never asks Toss", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    const spy = vi.spyOn(mockToss, "confirm");
    expect((await confirmAs(b, orderId, "mock_x", 100)).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "AMOUNT_MISMATCH" });
  });

  it("looks a declined payment up before failing it, then shows Toss's message", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    const lookUp = vi.spyOn(mockToss, "getPaymentByOrder");
    const res = await confirmAs(b, orderId, "mock_fail_1");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    expect(lookUp).toHaveBeenCalledWith(orderId);
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "REJECT_CARD_PAYMENT" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 0 });
  });

  it("keeps a 5xx answer pending, then settles it from Toss and grants once", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""), { applied: true });
    const lost = await confirmAs(b, orderId, "mock_lost");
    expect(lost.status).toBe(409);
    expect(await lost.json()).toMatchObject({ code: "PAY_PENDING" });
    expect(await statusOf(b, orderId)).toMatchObject({ status: "confirming" });
    vi.setSystemTime(T0 + 31_000);
    expect(await statusOf(b, orderId)).toEqual({ orderId, productId: "tarot", status: "paid", returnTo: "/tarot/result", signedIn: true });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("never reads 409 processing as a refusal: the order waits until Toss's window has surely closed", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    expect((await confirmAs(b, orderId, "mock_busy")).status).toBe(409);
    vi.setSystemTime(T0 + 31_000);
    expect(await statusOf(b, orderId)).toMatchObject({ status: "confirming" });
    vi.setSystemTime(T0 + 15 * 60_000 + 1);
    expect(await statusOf(b, orderId)).toMatchObject({ status: "failed" });
  });

  it("never grants a payment that arrives for a deleted account", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const res = await confirmAs(browser("192.0.2.78"), orderId, "mock_orphan");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: expect.stringContaining("탈퇴") });
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunding", fail_code: "ACCOUNT_DELETED" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM payments").first()).toEqual({ n: 1 });
  });

  it("lists the buyer's paid orders with what can still be refunded", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const { orders } = (await (await b.send(ordersGet, "/api/pay/orders")).json()) as { orders: Array<Record<string, unknown>> };
    expect(orders).toEqual([{ orderId, productId: "tarot", amount: 2900, status: "paid", createdAt: T0, receiptUrl: null, method: "카드", refundable: true, opened: false }]);
    expect((await browser("192.0.2.79").send(ordersGet, "/api/pay/orders")).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/pay/pay.test.ts`
Expected: FAIL (route modules not found).

- [ ] **Step 4: Write `apps/web/lib/pay/orders.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { randomId } from "@/lib/security/sign";
import { productById, unitsFor, type Product } from "./catalog";
import { paidLotStatements } from "./ledger";
import { TossError, isPendingTossError, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Orders and Toss confirmation (spec 5.2, 5.3). The amount always comes from the order row, which
 * came from the catalog. Toss is the source of truth: an unknown answer (409 processing, 5xx, none)
 * is settled by looking the payment up, never by guessing.
 */

export type OrderStatus = "created" | "confirming" | "paid" | "failed" | "refunding" | "refunded";

export interface OrderRow {
  id: string;
  user_id: string;
  product_id: string;
  amount_krw: number;
  order_name: string;
  status: OrderStatus;
  return_to: string;
  withdrawal_ack_at: number;
  payment_key: string | null;
  fail_code: string | null;
  /** the cancel Idempotency-Key is cancel-<id>-<cancel_attempt> (Task 8) */
  cancel_attempt: number;
  created_at: number;
  updated_at: number;
}

/** A new order at the catalog price. The id is 24 chars of [A-Za-z0-9_-], a valid Toss orderId (6–64). */
export async function createOrder(db: D1Binding, input: { userId: string; product: Product; returnTo: string; now: number }): Promise<OrderRow> {
  const row = await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?) RETURNING *`,
    )
    .bind(randomId(18), input.userId, input.product.id, input.product.krw, input.product.orderName, input.returnTo, input.now, input.now, input.now)
    .first<OrderRow>();
  if (!row) throw new Error("order insert returned no row");
  return row;
}

export function orderById(db: D1Binding, id: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
}

export function orderForUser(db: D1Binding, id: string, userId: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(id, userId).first<OrderRow>();
}

async function setStatus(db: D1Binding, id: string, from: OrderStatus[], to: OrderStatus, now: number, failCode: string | null = null): Promise<void> {
  await db
    .prepare(`UPDATE orders SET status = ?, fail_code = ?, updated_at = ? WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`)
    .bind(to, failCode, now, id, ...from)
    .run();
}

/** The Toss payment is the one this order expects: DONE, same order, same amount. */
const matches = (order: OrderRow, payment: TossPayment) => payment.status === "DONE" && payment.orderId === order.id && payment.totalAmount === order.amount_krw;

/** The payment Toss has for this order, "none" when it has none, "unknown" when it could not be asked. */
async function lookUpByOrder(toss: TossClient, orderId: string): Promise<TossPayment | "none" | "unknown"> {
  try {
    return await toss.getPaymentByOrder(orderId);
  } catch (error) {
    return error instanceof TossError && error.code === "NOT_FOUND_PAYMENT" ? "none" : "unknown";
  }
}

export type MarkPaidResult = "paid" | "orphaned" | "already";

const LIVE_ACCOUNT = "EXISTS (SELECT 1 FROM users u WHERE u.id = orders.user_id AND u.deleted_at IS NULL)";

/**
 * Records a DONE payment in one batch:
 * - the order becomes `paid`, or `refunding` with fail_code ACCOUNT_DELETED when its account was
 *   deleted meanwhile ("orphaned": Task 8 cancels the payment; nothing is granted);
 * - the payment row (UNIQUE payment_key and order_id);
 * - the paid lot and its grant, written only if the order became `paid`.
 * A second call (a repeated confirm, or the webhook first) breaks a UNIQUE key and changes nothing.
 */
export async function markPaid(db: D1Binding, order: OrderRow, payment: TossPayment, mode: TossClient["mode"], now: number): Promise<MarkPaidResult> {
  const product = productById(order.product_id);
  if (!product) throw new Error(`unknown product ${order.product_id}`);
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE orders SET
             status = CASE WHEN ${LIVE_ACCOUNT} THEN 'paid' ELSE 'refunding' END,
             fail_code = CASE WHEN ${LIVE_ACCOUNT} THEN NULL ELSE 'ACCOUNT_DELETED' END,
             payment_key = ?, updated_at = ?
           WHERE id = ? AND status IN ('created', 'confirming', 'failed')`,
        )
        .bind(payment.paymentKey, now, order.id),
      db
        .prepare("INSERT INTO payments (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(payment.paymentKey, order.id, payment.method, payment.totalAmount, payment.status, payment.approvedAt, payment.receiptUrl, mode, now),
      ...paidLotStatements(db, { userId: order.user_id, orderId: order.id, productId: order.product_id, units: unitsFor(product), now }),
    ]);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    return "already";
  }
  const after = await orderById(db, order.id);
  if (after?.status === "refunding") {
    console.warn(JSON.stringify({ evt: "pay.paid_for_deleted_account", orderId: order.id, mode }));
    return "orphaned";
  }
  console.info(JSON.stringify({ evt: "pay.paid", orderId: order.id, mode }));
  return "paid";
}

/** Shown when a payment arrives for an account deleted in the meantime. */
export const ORPHAN_MESSAGE = "탈퇴한 계정이라 이 결제는 바로 취소돼요. 청구된 금액은 카드사를 거쳐 환불돼요.";

/** `orphaned`: the payment went through for a deleted account; the caller cancels it (Task 8). */
export type ConfirmOutcome = { ok: true; order: OrderRow } | { ok: false; code: "PAY_FAILED" | "PAY_PENDING" | "BAD_REQUEST"; message?: string; orphaned?: boolean };

async function outcomeOfPaid(db: D1Binding, toss: TossClient, order: OrderRow, payment: TossPayment, now: number): Promise<ConfirmOutcome> {
  const result = await markPaid(db, order, payment, toss.mode, now);
  const current = (await orderById(db, order.id)) ?? order;
  if (result === "orphaned" || current.fail_code === "ACCOUNT_DELETED") return { ok: false, code: "PAY_FAILED", message: ORPHAN_MESSAGE, orphaned: true };
  return { ok: true, order: current };
}

/** The successUrl's confirm (spec 5.3): amount check, one claim per order, Toss confirm, then markPaid. */
export async function confirmOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; paymentKey: string; amount: number; now: number }): Promise<ConfirmOutcome> {
  const { order, paymentKey, amount, now } = input;
  if (order.fail_code === "ACCOUNT_DELETED") return { ok: false, code: "PAY_FAILED", message: ORPHAN_MESSAGE, orphaned: true };
  if (order.status === "paid" || order.status === "refunding" || order.status === "refunded") return { ok: true, order };
  if (order.status === "failed") return { ok: false, code: "PAY_FAILED" };
  if (amount !== order.amount_krw) {
    // Toss lets an unconfirmed payment expire, so nothing is charged.
    await setStatus(db, order.id, ["created"], "failed", now, "AMOUNT_MISMATCH");
    console.warn(JSON.stringify({ evt: "pay.amount_mismatch", orderId: order.id }));
    return { ok: false, code: "BAD_REQUEST" };
  }
  // One confirm per order: a double tap or a reload finds the order already claimed.
  const claimed = await db
    .prepare("UPDATE orders SET status = 'confirming', payment_key = ?, updated_at = ? WHERE id = ? AND status = 'created' RETURNING id")
    .bind(paymentKey, now, order.id)
    .first();
  if (!claimed) {
    const current = await orderById(db, order.id);
    if (current?.status === "paid") return { ok: true, order: current };
    return { ok: false, code: current?.status === "failed" ? "PAY_FAILED" : "PAY_PENDING" };
  }
  let payment: TossPayment;
  try {
    payment = await toss.confirm({ paymentKey, orderId: order.id, amount: order.amount_krw });
  } catch (error) {
    if (isPendingTossError(error)) {
      // 409 processing, 5xx or no answer: the payment may have gone through. The order stays
      // `confirming`; the success page asks again and reconcileConfirming() looks it up.
      console.warn(JSON.stringify({ evt: "pay.confirm_unknown", orderId: order.id, code: error instanceof TossError ? error.code : "UNKNOWN" }));
      return { ok: false, code: "PAY_PENDING" };
    }
    const refusal = error as TossError;
    // A definite answer (a decline, ALREADY_PROCESSED_PAYMENT, …): look the payment up before deciding.
    const found = await lookUpByOrder(toss, order.id);
    if (found === "unknown") return { ok: false, code: "PAY_PENDING" };
    if (found !== "none" && matches(order, found)) return outcomeOfPaid(db, toss, order, found, now);
    await setStatus(db, order.id, ["confirming"], "failed", now, refusal.code);
    console.info(JSON.stringify({ evt: "pay.confirm_declined", orderId: order.id, code: refusal.code }));
    return { ok: false, code: "PAY_FAILED", message: refusal.message };
  }
  if (!matches(order, payment)) {
    await setStatus(db, order.id, ["confirming"], "failed", now, `UNEXPECTED_${payment.status}`);
    console.error(JSON.stringify({ evt: "pay.confirm_mismatch", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_FAILED" };
  }
  return outcomeOfPaid(db, toss, order, payment, now);
}

/** How long a `confirming` order waits before we ask Toss what became of it. */
export const RECONCILE_AFTER_MS = 30_000;
/** After this, a payment Toss has not approved never will be: its 10-minute confirm window is over. */
export const STALE_CONFIRM_MS = 15 * 60_000;

/**
 * A `confirming` order whose confirm answer was lost or unknown: Toss decides.
 * - DONE → paid (or orphaned, for a deleted account).
 * - ABORTED, EXPIRED, CANCELED → failed.
 * - Not found, or still not done, after STALE_CONFIRM_MS → failed; before that it keeps waiting.
 * `force` skips the RECONCILE_AFTER_MS wait (account deletion, the Cron Trigger).
 */
export async function reconcileConfirming(db: D1Binding, toss: TossClient, order: OrderRow, now: number, options: { force?: boolean } = {}): Promise<OrderRow> {
  if (order.status !== "confirming") return order;
  if (!options.force && now - order.updated_at < RECONCILE_AFTER_MS) return order;
  const found = await lookUpByOrder(toss, order.id);
  if (found === "unknown") return order;
  if (found !== "none" && matches(order, found)) await markPaid(db, order, found, toss.mode, now);
  else if (found !== "none" && ["ABORTED", "EXPIRED", "CANCELED"].includes(found.status)) await setStatus(db, order.id, ["confirming"], "failed", now, found.status);
  else if (now - order.updated_at >= STALE_CONFIRM_MS) await setStatus(db, order.id, ["confirming"], "failed", now, found === "none" ? "NOT_FOUND_PAYMENT" : `UNCONFIRMED_${found.status}`);
  return (await orderById(db, order.id)) ?? order;
}

export interface OrderListItem {
  orderId: string;
  productId: string;
  amount: number;
  status: OrderStatus;
  createdAt: number;
  receiptUrl: string | null;
  method: string | null;
  /** paid and never opened: the 환불받기 button */
  refundable: boolean;
  /** paid and opened (or being opened) */
  opened: boolean;
}

/** 결제 내역: the user's orders that reached Toss, newest first. */
export async function orderHistory(db: D1Binding, userId: string, limit = 50): Promise<OrderListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.product_id, o.amount_krw, o.status, o.created_at, p.receipt_url, p.method,
              l.units_left, l.units_total, l.status AS lot_status
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       LEFT JOIN credit_lots l ON l.order_id = o.id
       WHERE o.user_id = ? AND o.status IN ('confirming', 'paid', 'refunding', 'refunded')
       ORDER BY o.created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{
      id: string; product_id: string; amount_krw: number; status: OrderStatus; created_at: number; receipt_url: string | null; method: string | null;
      units_left: number | null; units_total: number | null; lot_status: string | null;
    }>();
  return results.map((row) => {
    const active = row.lot_status === "active";
    return {
      orderId: row.id,
      productId: row.product_id,
      amount: row.amount_krw,
      status: row.status,
      createdAt: row.created_at,
      receiptUrl: row.receipt_url,
      method: row.method,
      refundable: row.status === "paid" && active && row.units_left === row.units_total,
      opened: row.status === "paid" && active && row.units_left === 0,
    };
  });
}
```

- [ ] **Step 5: Write the routes**

`apps/web/app/api/pay/checkout/route.ts`:

```ts
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { productById, sellable } from "@/lib/pay/catalog";
import { payProvider, paymentsMode, salesOpen, tossClientKey } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";

/**
 * GET ?product= → what the checkout page needs before any order exists: the product, the server's
 * price, the buyer's Toss customerKey and the widget client key. The key is read at run time, so it
 * always pairs with TOSS_SECRET_KEY. No order exists until the buyer confirms the 청약철회 notice
 * (POST /api/pay/orders).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (!salesOpen(paymentsMode(), ctx.owner)) return errorResponse("NOT_AVAILABLE");
  if (!tossClient()) return errorResponse("PAY_UNAVAILABLE");
  const product = productById(new URL(request.url).searchParams.get("product") ?? "");
  if (!product || !sellable(product, ctx.now)) return errorResponse("NOT_AVAILABLE");
  const mock = payProvider() === "mock";
  return json({
    productId: product.id,
    name: product.name,
    amount: product.krw,
    customerKey: session.user.customer_key,
    provider: mock ? "mock" : "toss",
    clientKey: mock ? null : tossClientKey(),
  });
}
```

`apps/web/app/api/pay/orders/route.ts`:

```ts
import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { productById, sellable } from "@/lib/pay/catalog";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { createOrder, orderById, orderHistory, reconcileConfirming } from "@/lib/pay/orders";
import { tossClient } from "@/lib/pay/toss";

/** `ack: true` = the buyer ticked the 청약철회 notice on the checkout page (its time is kept on the order). */
const OrderBody = z.object({ productId: z.string().max(40), returnTo: z.string().max(200).optional(), ack: z.literal(true) });

/** POST {productId, returnTo?, ack: true} → a new order at the catalog price, plus Toss's success and fail URLs. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (!salesOpen(paymentsMode(), ctx.owner)) return errorResponse("NOT_AVAILABLE");
  if (!tossClient()) return errorResponse("PAY_UNAVAILABLE");
  const body = OrderBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const product = productById(body.data.productId);
  if (!product || !sellable(product, ctx.now)) return errorResponse("NOT_AVAILABLE");
  const order = await createOrder(ctx.db, { userId: session.user.id, product, returnTo: safeReturnTo(body.data.returnTo), now: ctx.now });
  const origin = new URL(request.url).origin;
  console.info(JSON.stringify({ evt: "pay.order_created", orderId: order.id, productId: product.id }));
  return json({ orderId: order.id, orderName: order.order_name, amount: order.amount_krw, successUrl: `${origin}/pay/success`, failUrl: `${origin}/pay/fail` });
}

/**
 * GET ?id= → one order's status, settling a lost confirm with Toss. No session needed: the success
 * page may run in another browser (spec 5.3); the 24-character order id is the proof.
 * GET → 결제 내역 (session).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const toss = tossClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null) {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return errorResponse("BAD_REQUEST");
    let order = await orderById(ctx.db, id);
    if (!order) return errorResponse("BAD_REQUEST");
    if (toss) order = await reconcileConfirming(ctx.db, toss, order, ctx.now);
    return json({ orderId: order.id, productId: order.product_id, status: order.status, returnTo: order.return_to, signedIn: ctx.session?.user.id === order.user_id });
  }
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  return json({ orders: await orderHistory(ctx.db, session.user.id) });
}
```

`apps/web/app/api/pay/confirm/route.ts`:

```ts
import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { confirmOrder, orderById } from "@/lib/pay/orders";
import { tossClient } from "@/lib/pay/toss";

const ConfirmBody = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  amount: z.coerce.number().int().positive(),
});

/**
 * POST {paymentKey, orderId, amount} from /pay/success (Toss's successUrl query) → confirm with Toss
 * and grant the reading to the order's account, once. Safe to repeat.
 * - No session needed (M5): a card app or KakaoTalk can return the buyer in a browser without it.
 *   The order id and Toss's paymentKey are the proof, the amount must be the order's, and the grant
 *   goes to order.user_id. Rate-limited and same-origin like every payment POST.
 * - Not gated by STARLOG_PAYMENTS: a payment that already started must always be confirmable.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const toss = tossClient();
  if (!toss) return errorResponse("PAY_UNAVAILABLE");
  const body = ConfirmBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderById(ctx.db, body.data.orderId);
  if (!order) return errorResponse("BAD_REQUEST");
  const outcome = await confirmOrder(ctx.db, toss, { order, paymentKey: body.data.paymentKey, amount: body.data.amount, now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({
    status: "paid",
    orderId: outcome.order.id,
    productId: outcome.order.product_id,
    returnTo: outcome.order.return_to,
    signedIn: ctx.session?.user.id === outcome.order.user_id,
  });
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/app/api/pay apps/web/app/api/auth apps/web/lib/pay`
Expected: PASS (pay.test: 11 tests, plus the earlier suites).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/orders.ts apps/web/app/api/pay/checkout apps/web/app/api/pay/orders apps/web/app/api/pay/confirm apps/web/app/api/pay/pay.test.ts apps/web/lib/testing/p4.ts
git commit -m "feat(pay): orders at catalog prices; confirm without a session, unknown Toss answers looked up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Refunds, reconciliation, webhook

**Files:**
- Create: `apps/web/lib/pay/refunds.ts`, `apps/web/app/api/pay/refund/route.ts`, `apps/web/app/api/pay/webhook/route.ts`
- Modify: `apps/web/app/api/pay/orders/route.ts` (also reconcile `refunding` orders), `apps/web/app/api/pay/confirm/route.ts` (cancel a deleted account's payment at once), `apps/web/app/api/pay/pay.test.ts` (that test's expectation)
- Test: `apps/web/app/api/pay/refund.test.ts`

**Interfaces:**
- Consumes:
  - Task 4: `lockPaidLotForRefund`, `revertRefund`, `refundingLot`, `refundedLotStatements`, `revokeLotStatement`, `Lot`, plus `reserveUnlock`/`releaseUnlock` (tests only).
  - Task 6: `tossClient`, `TossError`, `isPendingTossError`, `TossPayment`, `TossClient`, `mockToss.failNext` (tests).
  - Task 7: `markPaid`, `orderById`, `orderForUser`, `reconcileConfirming`, `OrderRow`, `ConfirmOutcome.orphaned`, `buy` (p4 helper).
  - `accountDb`, `rateLimit`, `clientKey`.
- Produces:
  - `refunds.ts`:
    - `type RefundOutcome = {ok: true} | {ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?}`
    - `REFUND_RECONCILE_AFTER_MS = 600_000`, `ORPHAN_MAX_ATTEMPTS = 5`, `cancelKey(order)` = `cancel-<orderId>-<cancel_attempt>`
    - `applyCancel(db, order, lot: Lot | null, payment, now, {revoke?})`
    - `refundUnusedOrder(db, toss, {order, reason, now}): Promise<RefundOutcome>`
    - `refundOrphan(db, toss, order, now): Promise<RefundOutcome>` (a payment that arrived for a deleted account)
    - `reconcileRefunding(db, toss, order, now): Promise<OrderRow>`
    - `syncOrderWithToss(db, toss, order, payment, now): Promise<void>`
  - `POST /api/pay/refund {orderId}` → `{ ok: true, status: "refunded" }` | 409 `NOT_REFUNDABLE` | 402 `PAY_FAILED` | 409 `PAY_PENDING`
  - `POST /api/pay/webhook` (Toss `PAYMENT_STATUS_CHANGED`) → 200 `{ok: true}`; non-200 makes Toss retry

**Rules (revision 2):**
- **M1:** the refund starts with `lockPaidLotForRefund` (order `refunding` and lot out of use, one batch). Every way back is `revertRefund` (one batch).
- **M2:** the cancel goes out with `Idempotency-Key: cancel-<orderId>-<attempt>`.
  - 409 `IDEMPOTENT_REQUEST_PROCESSING`, a 5xx or no answer leave the order `refunding` (`PAY_PENDING`).
  - Any other error is followed by `GET /v1/payments/{paymentKey}`:
    - CANCELED → applied;
    - DONE → the cancel was really refused: `revertRefund` puts the reading back and moves to the next attempt, so a later refund sends a new key;
    - anything else → pending.
  - `reconcileRefunding` waits 10 minutes, far past the client's 30 s timeout, then lets the same look-up decide. It never reverts on time alone: only a look-up that shows DONE puts the reading back.
- **M3:** a payment that arrived for a deleted account (`fail_code = ACCOUNT_DELETED`, no lot) is cancelled at once by the confirm route.
  - If that cancel is refused, the order moves to its next attempt and the Cron Trigger (Task 13) tries again.
  - After `ORPHAN_MAX_ATTEMPTS` it stops and logs `pay.orphan_refund_stuck` for the runbook's manual refund.
- **Minor 1:** a dashboard cancel of a reading that is open or opening revokes its lot in the same batch as the refund record, so a later release never brings it back.
- **Minor 2:** `PARTIAL_CANCELED` comes only from the operator (the Toss dashboard). The payment row records it, no reading changes, and `pay.partial_cancel` is logged for the runbook.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/pay/refund.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as confirm } from "./confirm/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";
import { POST as refund } from "./refund/route";
import { POST as webhook } from "./webhook/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loggedIn(name = "alice"): Promise<Browser> {
  const b = browser();
  await loginAs(b, name);
  return b;
}

type Db = ReturnType<typeof useTestDb>;
const refundOf = (b: Browser, orderId: string) => b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
const hook = (body: unknown) => browser("203.0.113.200").send(webhook, "/api/pay/webhook", { body });
const statusOf = async (b: Browser, orderId: string) => ((await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()) as { status: string }).status;
const orderRow = (db: Db, orderId: string) => db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orderId).first();
const paymentKeyOf = async (db: Db, orderId: string) =>
  (await db.prepare("SELECT payment_key FROM orders WHERE id = ?").bind(orderId).first<{ payment_key: string }>())!.payment_key;
const userIdOf = async (db: Db) => (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;

describe("refunds", () => {
  it("refunds an unopened reading in full, once, under the order's first cancel key", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const cancel = vi.spyOn(mockToss, "cancel");
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded" });
    expect(cancel.mock.calls[0]![1]).toMatchObject({ idempotencyKey: `cancel-${orderId}-1` });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect((await me(b)).user?.unused).toEqual([]);
    expect(await db.prepare("SELECT o.status AS o, p.status AS p, l.status AS l FROM orders o JOIN payments p ON p.order_id = o.id JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", p: "CANCELED", l: "refunded" });
    expect((await refundOf(b, orderId)).status).toBe(409);
  });

  it("will not refund a reading that was opened or is being opened", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", units: 10, now: T0 });
    if (!reserved.ok) throw new Error("not reserved");
    expect((await refundOf(b, orderId)).status).toBe(409);
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 1 });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("DONE");
  });

  it("puts the reading back when Toss refuses, after looking the payment up, and uses a new key next time", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    const lookUp = vi.spyOn(mockToss, "getPayment");
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "취소 할 수 없는 결제 입니다." });
    expect(lookUp).toHaveBeenCalled();
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 2 });
    // The first key would replay the refusal for 15 days; the next refund sends cancel-<id>-2.
    expect((await refundOf(b, orderId)).status).toBe(200);
  });

  it("never reads 409 processing as a refusal, and never reverts on time alone", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PAY_PENDING" });
    vi.setSystemTime(T0 + 61_000);
    expect(await statusOf(b, orderId)).toBe("refunding");
    expect((await me(b)).user?.unused).toEqual([]);
    // Ten minutes on, Toss still shows the payment DONE: only now does the reading come back.
    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await statusOf(b, orderId)).toBe("paid");
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 2 });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("applies a cancel whose answer was lost once Toss shows it cancelled", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    expect((await refundOf(b, orderId)).status).toBe(409);
    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await statusOf(b, orderId)).toBe("refunded");
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("refunds only the buyer's own orders", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    const orderId = await buy(alice);
    const bob = await loggedIn("bob");
    expect((await refundOf(bob, orderId)).status).toBe(409);
  });

  it("cancels at once a payment that arrives for a deleted account", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const res = await browser("192.0.2.80").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_orphan", orderId, amount: 2900 }, origin: true });
    expect(res.status).toBe(402);
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded", fail_code: "ACCOUNT_DELETED" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 0 });
  });
});

describe("webhook", () => {
  it("re-queries Toss and settles a payment whose confirm answer never arrived", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, amount } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string; amount: number };
    await mockToss.confirm({ paymentKey: "mock_webhook", orderId, amount });
    const res = await hook({ eventType: "PAYMENT_STATUS_CHANGED", createdAt: "2026-10-01T12:00:00.000000", data: { paymentKey: "mock_webhook", orderId, status: "DONE" } });
    expect(res.status).toBe(200);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("applies a dashboard cancellation of an unopened reading", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "refunded" });
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("revokes a reading opened while its payment was cancelled: a later release brings nothing back", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", units: 10, now: T0 });
    if (!reserved.ok) throw new Error("not reserved");
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await releaseUnlock(db, { unlockId: reserved.unlockId, now: T0 + 1 })).toBe(true);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l, l.units_left AS left FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "revoked", left: 0 });
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("records a partial cancellation for the operator and leaves the reading alone", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    const done = await mockToss.getPayment(paymentKey);
    vi.spyOn(mockToss, "getPayment").mockResolvedValueOnce({ ...done, status: "PARTIAL_CANCELED", balanceAmount: 900 });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "PARTIAL_CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT status, canceled_amount FROM payments WHERE order_id = ?").bind(orderId).first()).toEqual({ status: "PARTIAL_CANCELED", canceled_amount: 2000 });
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 1 });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("pay.partial_cancel"));
  });

  it("believes Toss, not the body: a forged DONE for an unknown payment changes nothing and asks Toss to retry", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    const res = await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "forged", orderId, status: "DONE" } });
    expect(res.status).not.toBe(200);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "created" });
  });

  it("acknowledges other events and unknown orders", async () => {
    useTestDb();
    expect((await hook({ eventType: "DEPOSIT_CALLBACK", data: { paymentKey: "x", orderId: "y" } })).status).toBe(200);
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "x", orderId: "nobodys-order" } })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/pay/refund.test.ts`
Expected: FAIL (route modules not found).

- [ ] **Step 3: Write `apps/web/lib/pay/refunds.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { lockPaidLotForRefund, refundedLotStatements, refundingLot, revertRefund, revokeLotStatement, type Lot } from "./ledger";
import { markPaid, orderById, type OrderRow } from "./orders";
import { isPendingTossError, type TossClient, type TossError, type TossPayment } from "./tossTypes";

/**
 * Refunds and Toss reconciliation (spec 5.5, 5.6). The order and its lot leave use together before
 * the cancel call (M1), so nobody can open a reading while its payment is being cancelled. An
 * unknown answer is settled by looking the payment up, never by guessing or by the clock (M2).
 */

export type RefundOutcome = { ok: true } | { ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?: string };

/** How long a `refunding` order waits before Toss is asked: far past the 30 s client timeout and Toss's own processing. */
export const REFUND_RECONCILE_AFTER_MS = 10 * 60_000;
/** A deleted account's payment is cancelled at most this many times automatically; then the runbook takes over. */
export const ORPHAN_MAX_ATTEMPTS = 5;

/** Toss replays an Idempotency-Key's first answer for 15 days: each attempt has its own key. */
export const cancelKey = (order: Pick<OrderRow, "id" | "cancel_attempt">) => `cancel-${order.id}-${order.cancel_attempt}`;

/**
 * Records a full cancellation Toss confirmed: order refunded, payment updated, the lot refunded when
 * it was locked for it, or revoked when its reading was open or opening (minor 1). One batch.
 */
export async function applyCancel(db: D1Binding, order: OrderRow, lot: Lot | null, payment: TossPayment, now: number, options: { revoke?: boolean } = {}): Promise<void> {
  await db.batch([
    ...(options.revoke ? [revokeLotStatement(db, order.id)] : []),
    db.prepare("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('paid', 'refunding')").bind(now, order.id),
    db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, canceled_at = ?, updated_at = ? WHERE order_id = ?")
      .bind(payment.status, payment.totalAmount - payment.balanceAmount, new Date(now).toISOString(), now, order.id),
    ...(lot ? refundedLotStatements(db, lot, now) : []),
  ]);
  console.info(JSON.stringify({ evt: "pay.refunded", orderId: order.id }));
}

async function nextAttempt(db: D1Binding, orderId: string, now: number): Promise<void> {
  await db.prepare("UPDATE orders SET cancel_attempt = cancel_attempt + 1, updated_at = ? WHERE id = ? AND status = 'refunding'").bind(now, orderId).run();
}

/**
 * Sends the cancel for a `refunding` order and settles what Toss answers (M2).
 * - CANCELED → applied.
 * - 409 processing, 5xx or no answer → stays `refunding` (PAY_PENDING); reconcileRefunding decides.
 * - Any other error → the payment is looked up first. CANCELED → applied. DONE → the cancel was
 *   refused: the reading comes back with a new attempt (an orphan just moves to its next attempt).
 *   Anything else → pending.
 */
async function sendCancel(db: D1Binding, toss: TossClient, order: OrderRow, lot: Lot | null, reason: string, now: number): Promise<RefundOutcome> {
  let payment: TossPayment;
  try {
    payment = await toss.cancel(order.payment_key!, { reason, idempotencyKey: cancelKey(order) });
  } catch (error) {
    if (isPendingTossError(error)) {
      console.warn(JSON.stringify({ evt: "pay.refund_unknown", orderId: order.id }));
      return { ok: false, code: "PAY_PENDING" };
    }
    const refusal = error as TossError;
    const found = await toss.getPayment(order.payment_key!).catch(() => null);
    if (found?.status === "CANCELED") {
      payment = found;
    } else if (found?.status === "DONE") {
      if (lot) await revertRefund(db, order.id, now);
      else await nextAttempt(db, order.id, now);
      console.info(JSON.stringify({ evt: "pay.refund_refused", orderId: order.id, code: refusal.code }));
      return { ok: false, code: "PAY_FAILED", message: refusal.message || "환불하지 못했어요. 문의해 주세요." };
    } else {
      return { ok: false, code: "PAY_PENDING" };
    }
  }
  if (payment.status !== "CANCELED") {
    console.warn(JSON.stringify({ evt: "pay.refund_unexpected", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_PENDING" };
  }
  await applyCancel(db, order, lot, payment, now);
  return { ok: true };
}

/** Cancels the payment of a paid reading that was never opened (the user's 환불, account deletion). */
export async function refundUnusedOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; reason: string; now: number }): Promise<RefundOutcome> {
  const { order, reason, now } = input;
  if (order.status !== "paid" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  const lot = await lockPaidLotForRefund(db, order.id, now);
  if (!lot) return { ok: false, code: "NOT_REFUNDABLE" };
  return sendCancel(db, toss, (await orderById(db, order.id)) ?? order, lot, reason, now);
}

const ORPHAN_REASON = "탈퇴한 계정에 도착한 결제 자동 취소";

/** A payment that went through for a deleted account (Task 7 left it `refunding`, with no lot): cancel it. */
export async function refundOrphan(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<RefundOutcome> {
  if (order.status !== "refunding" || order.fail_code !== "ACCOUNT_DELETED" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  return sendCancel(db, toss, order, null, ORPHAN_REASON, now);
}

/**
 * A `refunding` order whose cancel answer was unknown, looked up REFUND_RECONCILE_AFTER_MS later.
 * - CANCELED at Toss → refunded.
 * - Still DONE → a refund: the reading comes back (revertRefund, next attempt). An orphan: the
 *   next attempt is sent, up to ORPHAN_MAX_ATTEMPTS.
 * - PARTIAL_CANCELED → logged for the operator. The look-up failing → unchanged.
 */
export async function reconcileRefunding(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<OrderRow> {
  if (order.status !== "refunding" || !order.payment_key || now - order.updated_at < REFUND_RECONCILE_AFTER_MS) return order;
  const payment = await toss.getPayment(order.payment_key).catch(() => null);
  if (!payment) return order;
  const lot = await refundingLot(db, order.id);
  if (payment.status === "CANCELED") {
    await applyCancel(db, order, lot, payment, now);
  } else if (payment.status === "DONE" && lot) {
    await revertRefund(db, order.id, now);
    console.info(JSON.stringify({ evt: "pay.refund_reverted", orderId: order.id }));
  } else if (payment.status === "DONE" && order.fail_code === "ACCOUNT_DELETED") {
    if (order.cancel_attempt >= ORPHAN_MAX_ATTEMPTS) {
      console.error(JSON.stringify({ evt: "pay.orphan_refund_stuck", orderId: order.id }));
    } else {
      await nextAttempt(db, order.id, now);
      const next = await orderById(db, order.id);
      if (next) await refundOrphan(db, toss, next, now);
    }
  } else if (payment.status === "PARTIAL_CANCELED") {
    console.warn(JSON.stringify({ evt: "pay.partial_cancel", orderId: order.id }));
  }
  return (await orderById(db, order.id)) ?? order;
}

/** Brings an order in line with a payment Toss reported (webhook): the one place Toss's word is applied. */
export async function syncOrderWithToss(db: D1Binding, toss: TossClient, order: OrderRow, payment: TossPayment, now: number): Promise<void> {
  if (payment.orderId !== order.id) return;
  if (payment.status === "DONE") {
    if (order.status === "created" || order.status === "confirming" || order.status === "failed") {
      // A deleted account's payment is left `refunding`; the Cron Trigger cancels it (the webhook answers within 10 s).
      if (payment.totalAmount === order.amount_krw) await markPaid(db, order, payment, toss.mode, now);
      else console.error(JSON.stringify({ evt: "pay.webhook_amount_mismatch", orderId: order.id }));
    }
    return;
  }
  if (payment.status === "CANCELED") {
    if (order.status === "paid") {
      const locked = await lockPaidLotForRefund(db, order.id, now);
      if (locked) {
        await applyCancel(db, order, locked, payment, now);
      } else {
        // Cancelled in the dashboard while the reading was open or opening: it leaves use for good.
        await applyCancel(db, order, null, payment, now, { revoke: true });
        console.warn(JSON.stringify({ evt: "pay.canceled_after_open", orderId: order.id }));
      }
    } else if (order.status === "refunding") {
      await applyCancel(db, order, await refundingLot(db, order.id), payment, now);
    }
    return;
  }
  if (payment.status === "PARTIAL_CANCELED") {
    // Only the operator cancels part of a payment (the Toss dashboard). Record it; the operator decides about the reading (runbook).
    await db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, updated_at = ? WHERE order_id = ?")
      .bind(payment.status, payment.totalAmount - payment.balanceAmount, now, order.id)
      .run();
    console.warn(JSON.stringify({ evt: "pay.partial_cancel", orderId: order.id }));
    return;
  }
  if (payment.status === "ABORTED" || payment.status === "EXPIRED") {
    await db
      .prepare("UPDATE orders SET status = 'failed', fail_code = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'confirming')")
      .bind(payment.status, now, order.id)
      .run();
  }
}
```

- [ ] **Step 4: Write the routes**

`apps/web/app/api/pay/refund/route.ts`:

```ts
import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { orderForUser } from "@/lib/pay/orders";
import { refundUnusedOrder } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";

const RefundBody = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/) });

/** POST {orderId} → full refund of a paid reading that was never opened (내 정보 > 결제 내역 > 환불받기). */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const toss = tossClient();
  if (!toss) return errorResponse("PAY_UNAVAILABLE");
  const body = RefundBody.safeParse(await readJson(request, 1_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderForUser(ctx.db, body.data.orderId, session.user.id);
  if (!order) return errorResponse("NOT_REFUNDABLE");
  const outcome = await refundUnusedOrder(ctx.db, toss, { order, reason: "구매자 요청: 열지 않은 풀이 환불", now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({ ok: true, status: "refunded" });
}
```

`apps/web/app/api/pay/webhook/route.ts`:

```ts
import { z } from "zod";
import { clientKey, errorResponse, json, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { orderById } from "@/lib/pay/orders";
import { syncOrderWithToss } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";
import type { TossPayment } from "@/lib/pay/tossTypes";
import { rateLimit } from "@/lib/security/rateLimit";

const WebhookBody = z.object({
  eventType: z.string().max(64),
  data: z.object({ paymentKey: z.string().max(200), orderId: z.string().max(64) }).passthrough(),
}).passthrough();

/**
 * POST from Toss (개발자센터 > 웹훅, event PAYMENT_STATUS_CHANGED). Payment webhooks carry no
 * signature, so the body is only a hint: we re-query the payment by key and apply what Toss answers
 * (spec 5.6). 200 within 10 s; any other status makes Toss retry, up to 7 times.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit("WEBHOOK_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const body = WebhookBody.safeParse(await readJson(request, 64_000));
  if (!body.success || body.data.eventType !== "PAYMENT_STATUS_CHANGED") return json({ ok: true });
  const db = accountDb();
  const toss = tossClient();
  if (!db || !toss) return errorResponse("PAY_UNAVAILABLE");
  const order = await orderById(db, body.data.data.orderId);
  if (!order) return json({ ok: true });
  let payment: TossPayment;
  try {
    payment = await toss.getPayment(body.data.data.paymentKey);
  } catch {
    return errorResponse("PAY_PENDING");
  }
  await syncOrderWithToss(db, toss, order, payment, Date.now());
  return json({ ok: true });
}
```

- [ ] **Step 5: Cancel a deleted account's payment in `apps/web/app/api/pay/confirm/route.ts`.** Right after `confirmOrder` returns, before the `if (!outcome.ok)` line:

```ts
  if (!outcome.ok && outcome.orphaned) {
    // Paid for an account deleted meanwhile: never granted, cancelled now (the Cron Trigger retries a failure).
    const current = await orderById(ctx.db, order.id);
    if (current) await refundOrphan(ctx.db, toss, current, ctx.now);
  }
```

Import `refundOrphan` from `@/lib/pay/refunds`. In `apps/web/app/api/pay/pay.test.ts`, the test "never grants a payment that arrives for a deleted account" now expects `{ status: "refunded", fail_code: "ACCOUNT_DELETED" }`. Change that one expectation and leave the rest of the test.

- [ ] **Step 6: Reconcile refunds in `apps/web/app/api/pay/orders/route.ts`.** In the `GET ?id=` branch, after `reconcileConfirming`, add:

```ts
    if (toss) order = await reconcileRefunding(ctx.db, toss, order, ctx.now);
```

In the history branch, after `requireSession`, settle this user's stale orders first:

```ts
  if (toss) {
    const { results } = await ctx.db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND status IN ('confirming', 'refunding') AND updated_at < ?")
      .bind(session.user.id, ctx.now - RECONCILE_AFTER_MS)
      .all<OrderRow>();
    for (const stale of results) {
      await reconcileConfirming(ctx.db, toss, stale, ctx.now);
      await reconcileRefunding(ctx.db, toss, stale, ctx.now);
    }
  }
```

Import `reconcileRefunding` from `@/lib/pay/refunds`, and `RECONCILE_AFTER_MS` and `type OrderRow` from `@/lib/pay/orders`. Each function checks its own status and wait, so calling both on one row is safe.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api/pay apps/web/lib/pay`
Expected: PASS (refund.test: 13 tests; pay.test 11 with the changed expectation).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/pay/refunds.ts apps/web/app/api/pay/refund apps/web/app/api/pay/webhook apps/web/app/api/pay/orders/route.ts apps/web/app/api/pay/confirm/route.ts apps/web/app/api/pay/pay.test.ts apps/web/app/api/pay/refund.test.ts
git commit -m "feat(pay): refunds with attempt-scoped cancel keys, Toss look-ups before any decision, webhook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Saved readings store, cost books and the stream settlement

**Files:**
- Create: `apps/web/lib/readings/store.ts`
- Modify: `apps/web/lib/api/spend.ts` (a cost sink for `SpendLedger`, the paid book), `apps/web/lib/api/stream.ts` (the `Settlement` and `paidCost` options)
- Test: `apps/web/lib/readings/store.test.ts`, `apps/web/lib/api/settle.test.ts`

**Interfaces:**
- Consumes:
  - `sealJson`, `openJson`, `READING_KEY_VERSION` (Task 3); `D1Binding`, `D1Statement`.
  - `stream.ts` and `spend.ts` as committed at `1d1e7c0` or later:
    - `respondGeneration(request, run, {gate, startCookies, spend, budgetMs, pingMs})`;
    - generation under `keepAlive(work)` (`ctx.waitUntil`);
    - `SpendLedger` (`reserve`/`release`/`bill`/`finish`) writing through `addCost` into `cost:<kstDay>:<shard>`;
    - the network counter charged before the start through the `spend` option;
    - `budgetState`, `spentTodayKrw`, `clientCount`, `resetSpendState`, and `dailyStore`/`resetDailyStore` from `dailyStore.ts`.
- Produces:
  - `store.ts`:
    - `type ReadingSource = "paid" | "free" | "owner"`
    - `interface ServerChapter { kind: "tarot" | "saju"; reading: Record<string, unknown>; chapterToken: string; createdAt: number; turns: Array<{question; answer}>; followUpsLeft: number; [key: string]: unknown }`
    - `interface SavedReading { id; createdAt; chapter: ServerChapter }`
    - `newReadingId(): string` (20 chars `[a-z0-9]`, also a valid device chapter id)
    - `insertReadingStatement(db, secret, {id, userId, productId, source, unlockId, chapter, now}): Promise<D1Statement>`: written only for a live account, and a second insert for the same unlock does nothing
    - `READINGS_PAGE = 50`, `listReadings(db, secret, userId, {before?, limit?}): Promise<{readings: SavedReading[]; next: string | null}>`
    - `readingForUser(db, secret, userId, id)`, `readingExists(db, userId, id)`, `updateReadingChapter(db, secret, userId, id, update, now): Promise<boolean>`
    - `deleteReading(db, userId, id): Promise<boolean>`, `deleteAllReadings(db, userId): Promise<number>`
  - `spend.ts`:
    - `type CostSink = (krw: number, at: number) => Promise<void>`
    - `addPaidCost(krw, now)`: writes `paidcost:<kstDay>:<shard>`, never read by `budgetState`
    - `new SpendLedger(clock?, sink?)`: `sink` defaults to `addCost`
  - `stream.ts`:
    - `interface Settlement { deliver(outcome): Promise<Record<string, unknown>>; recover(): Promise<Record<string, unknown> | null>; release(): Promise<void> }`
    - `RespondOptions` gains `settle?: Settlement` and `paidCost?: boolean`

**How the settlement sits in the current `respondGeneration` (C1):**
- The generation already runs inside `keepAlive(work)`.
- Both paths do this inside that work:
  1. `const outcome = await run(hooks)`;
  2. `settled(outcome)` → `settle.deliver()` saves the reading and spends the credit, and what it returns (the reading id) joins the body;
  3. only then `json(body)` or `write({type: "done", data})`.
- A client that leaves after `run()` cannot stop the save: the work is under `waitUntil`.
- If `deliver()` throws, `settle.recover()` re-reads whether the reading row landed (a D1 answer lost after the commit). If it did, the client still gets the reading with its id (M4, server side). If it did not, the error goes on.
- Both `catch` blocks call `release()`, which is logged and never thrown. It is a no-op once delivered, and a failed release is swept 6 minutes later.
- Cost books:
  - `SpendLedger` gets a sink. A paid opening (`paidCost: true`) books its model cost to `paidcost:` shards, which `budgetState` never reads, so paid usage never closes the free tier.
  - Every other generation keeps `addCost` into `cost:`, the 별조각 reading included (minor 4).
  - The `spend` option is unchanged: whoever passes `spend: "full"` (오픈 기념 and 별조각 readings) is charged on the network counter before the start.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/readings/store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import {
  deleteAllReadings,
  deleteReading,
  insertReadingStatement,
  listReadings,
  newReadingId,
  readingExists,
  readingForUser,
  updateReadingChapter,
  type ServerChapter,
} from "./store";

const SECRET = "account-secret-for-tests-0123456789abcdef";

const chapter = (question: string): ServerChapter => ({
  kind: "tarot",
  question,
  conditions: [],
  note: "",
  cards: [],
  reading: { verdict: `${question}의 결론` },
  chapterToken: "token",
  createdAt: 1,
  turns: [],
  followUpsLeft: 3,
});

async function setup() {
  const db = migratedTestD1();
  for (const id of ["u_1", "u_2"]) {
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)").bind(id, `k_${id}`, `c_${id}`).run();
  }
  return db;
}

async function save(db: D1Binding, userId: string, c: ServerChapter, now = 10, unlockId: string | null = null) {
  const id = newReadingId();
  await (await insertReadingStatement(db, SECRET, { id, userId, productId: "tarot", source: "paid", unlockId, chapter: c, now })).run();
  return id;
}

const count = async (db: D1Binding) => (await db.prepare("SELECT COUNT(*) AS n FROM readings").first<{ n: number }>())!.n;

describe("saved readings", () => {
  it("makes ids that are also valid device chapter ids", () => {
    for (let i = 0; i < 20; i++) expect(newReadingId()).toMatch(/^[a-z0-9]{20}$/);
  });

  it("stores readings sealed and gives them back only to their owner, newest first, a page at a time", async () => {
    const db = await setup();
    const first = await save(db, "u_1", chapter("첫 질문"), 10);
    await save(db, "u_1", chapter("둘째 질문"), 20);
    await save(db, "u_1", chapter("셋째 질문"), 20);
    const raw = await db.prepare("SELECT payload, key_version FROM readings WHERE id = ?").bind(first).first<{ payload: string; key_version: number }>();
    expect(raw!.payload).not.toContain("첫 질문");
    expect(raw!.key_version).toBe(1);
    const page = await listReadings(db, SECRET, "u_1", { limit: 2 });
    expect(page.readings).toHaveLength(2);
    expect(page.next).not.toBeNull();
    const rest = await listReadings(db, SECRET, "u_1", { before: page.next!, limit: 2 });
    expect(rest.next).toBeNull();
    const questions = [...page.readings, ...rest.readings].map((r) => r.chapter.question);
    expect(questions).toHaveLength(3);
    expect(new Set(questions)).toEqual(new Set(["첫 질문", "둘째 질문", "셋째 질문"]));
    expect(questions[2]).toBe("첫 질문");
    expect((await listReadings(db, SECRET, "u_2")).readings).toEqual([]);
    expect(await readingForUser(db, SECRET, "u_2", first)).toBeNull();
    expect((await readingForUser(db, SECRET, "u_1", first))?.chapter.question).toBe("첫 질문");
  });

  it("keeps two identical readings (two purchases), saves nothing twice for one unlock, and nothing for a deleted account", async () => {
    const db = await setup();
    await save(db, "u_1", chapter("같은 질문"));
    await save(db, "u_1", chapter("같은 질문"));
    expect(await count(db)).toBe(2);
    await save(db, "u_1", chapter("한 번"), 10, "ul_1");
    await save(db, "u_1", chapter("한 번"), 11, "ul_1");
    expect(await count(db)).toBe(3);
    await db.prepare("UPDATE users SET deleted_at = 1 WHERE id = 'u_2'").run();
    const id = await save(db, "u_2", chapter("탈퇴한 계정"));
    expect(await count(db)).toBe(3);
    expect(await readingExists(db, "u_2", id)).toBe(false);
  });

  it("updates a saved chapter and deletes one or all", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("질문"));
    expect(await readingExists(db, "u_1", id)).toBe(true);
    const turn = { question: "더 물어볼게요", answer: "답이에요" };
    expect(await updateReadingChapter(db, SECRET, "u_1", id, (c) => ({ ...c, turns: [...c.turns, turn], followUpsLeft: 2 }), 30)).toBe(true);
    expect((await readingForUser(db, SECRET, "u_1", id))?.chapter).toMatchObject({ turns: [turn], followUpsLeft: 2 });
    expect(await updateReadingChapter(db, SECRET, "u_2", id, (c) => c, 31)).toBe(false);
    expect(await deleteReading(db, "u_2", id)).toBe(false);
    expect(await deleteReading(db, "u_1", id)).toBe(true);
    await save(db, "u_1", chapter("하나"));
    await save(db, "u_1", chapter("둘"));
    expect(await deleteAllReadings(db, "u_1")).toBe(2);
  });

  it("skips a payload that does not open (altered, or labelled with another key version), and says so in the log", async () => {
    const db = await setup();
    const altered = await save(db, "u_1", chapter("질문"));
    await db.prepare("UPDATE readings SET payload = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE id = ?").bind(altered).run();
    // Sealed with version 1 but labelled 2: open() asks for the row's own version, whose key differs.
    const relabelled = await save(db, "u_1", chapter("다른 키"));
    await db.prepare("UPDATE readings SET key_version = 2 WHERE id = ?").bind(relabelled).run();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await listReadings(db, SECRET, "u_1")).readings).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readings.unreadable"));
    error.mockRestore();
  });
});
```

`apps/web/lib/api/settle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { kstDay } from "@/lib/security/quota";
import { dailyStore, resetDailyStore } from "./dailyStore";
import type { Gate } from "./http";
import { SpendLedger, addPaidCost, budgetState, clientCount, resetSpendState, spentTodayKrw } from "./spend";
import { NDJSON, respondGeneration, type GenerationOutcome, type Settlement } from "./stream";

/** Priced at 2,800원 with KRW_PER_USD=1400 (Opus 5.5: 100k output tokens = $2). */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];
const HALF = [{ ...EXPENSIVE[0]!, outputTokens: 50_000 }];
const READING_ID = "abcdefghij0123456789";
const BODY = { reading: { verdict: "v" }, chapterToken: "t" };

const gate = (): Gate => ({ secret: "s".repeat(40), provider: mockProvider, owner: false, now: Date.now(), cookies: {}, client: "client-hash" }) as unknown as Gate;

/** A generation that is billed EXPENSIVE through the hooks, as the provider does, then succeeds or fails. */
const billed = (fail = false) => async (hooks: GenerationHooks): Promise<GenerationOutcome> => {
  hooks.onReserve?.(EXPENSIVE);
  hooks.onUsage?.(EXPENSIVE);
  if (fail) throw new GenerationError("UPSTREAM");
  return { body: BODY, cookies: [] };
};

async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}
const freeBook = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);

function settlement(calls: string[], deliver: () => Promise<Record<string, unknown>> = async () => ({ readingId: READING_ID }), recovered: Record<string, unknown> | null = null): Settlement {
  return {
    deliver: async () => {
      calls.push("deliver");
      return deliver();
    },
    recover: async () => {
      calls.push("recover");
      return recovered;
    },
    release: async () => {
      calls.push("release");
    },
  };
}

const post = (stream = false, signal?: AbortSignal) =>
  new Request("http://localhost/api/tarot/reading", { method: "POST", headers: stream ? { accept: NDJSON } : {}, signal });
const events = async (response: Response) => (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
const failedSave = async (): Promise<Record<string, unknown>> => {
  throw new Error("D1 answer lost");
};

beforeEach(() => {
  vi.stubEnv("KRW_PER_USD", "1400");
  resetDailyStore();
  resetSpendState();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cost books", () => {
  it("SpendLedger writes to the sink it is given", async () => {
    const writes: number[] = [];
    const ledger = new SpendLedger(() => Date.now(), async (krw) => {
      writes.push(Math.round(krw));
    });
    ledger.reserve(EXPENSIVE);
    ledger.bill(HALF);
    await ledger.finish();
    expect(writes).toEqual([2800, -1400]);
  });

  it("keeps the paid book out of the free-tier total and the budget", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "1000");
    await addPaidCost(5000, Date.now());
    expect(await paidBook()).toBe(5000);
    expect(await freeBook()).toBe(0);
    expect(await budgetState(Date.now())).toBe("ok");
  });
});

describe("settlement inside the generation's keepAlive work", () => {
  it("JSON: saves before answering, adds the reading id, and books a paid opening on the paid book only", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), paidCost: true, settle: settlement(calls) });
    expect(await res.json()).toEqual({ ...BODY, readingId: READING_ID });
    expect(calls).toEqual(["deliver"]);
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
    expect(await clientCount("client-hash", "full", Date.now())).toBe(0);
  });

  it("JSON: a 별조각 opening books the free total and is charged to the network before it starts", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), spend: "full", settle: settlement(calls) });
    expect(res.status).toBe(200);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount("client-hash", "full", Date.now())).toBe(1);
  });

  it("JSON: releases after a failed generation, and after a save that did not land", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    expect((await respondGeneration(post(), billed(true), { gate: gate(), settle: settlement(calls) })).status).toBe(502);
    expect(calls).toEqual(["release"]);
    const again: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), settle: settlement(again, failedSave, null) });
    expect(res.status).toBe(502);
    expect(again).toEqual(["deliver", "recover", "release"]);
  });

  it("JSON: a save whose answer was lost is recovered, not released", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), settle: settlement(calls, failedSave, { readingId: READING_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...BODY, readingId: READING_ID });
    expect(calls).toEqual(["deliver", "recover"]);
  });

  it("NDJSON: done carries the saved id, so the save came first; paid cost stays off the free book", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), billed(), { gate: gate(), paidCost: true, settle: settlement(calls) }));
    expect(list.at(-1)).toEqual({ type: "done", data: { ...BODY, readingId: READING_ID } });
    expect(calls).toEqual(["deliver"]);
    await vi.waitFor(async () => expect(await paidBook()).toBe(2800));
    expect(await freeBook()).toBe(0);
  });

  it("NDJSON: an error event comes after the release", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), billed(true), { gate: gate(), settle: settlement(calls) }));
    expect(list.at(-1)).toMatchObject({ type: "error", status: 502 });
    expect(calls).toEqual(["release"]);
  });

  it("NDJSON: a client that leaves mid-generation gets its credit back", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const waiting = async (hooks: GenerationHooks): Promise<GenerationOutcome> =>
      new Promise((_, reject) => hooks.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"]))));
    const res = await respondGeneration(post(true, controller.signal), waiting, { gate: gate(), settle: settlement(calls) });
    controller.abort();
    await res.text().catch(() => "");
    await vi.waitFor(() => expect(calls).toEqual(["release"]));
  });

  it("leaves 오픈 기념 responses exactly as before", async () => {
    const res = await respondGeneration(post(), billed(), { gate: gate(), spend: "full" });
    expect(await res.json()).toEqual(BODY);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/readings/store.test.ts apps/web/lib/api/settle.test.ts`
Expected:
- store.test fails with `Cannot find module './store'`.
- settle.test fails: `addPaidCost` is not exported, the `readingId` is missing from the body, and `deliver` is never called.

- [ ] **Step 3: Write `apps/web/lib/readings/store.ts`**

```ts
import "server-only";
import { READING_KEY_VERSION, openJson, sealJson } from "@/lib/account/secrets";
import type { D1Binding, D1Statement } from "@/lib/db/d1";

/**
 * Readings kept in the account (spec 5.7). A reading opened with 결제, 별조각 or the owner pass
 * while logged in is saved automatically (device-only readings are not moved in P4).
 * - The payload is the chapter exactly as the device stores it (lib/storage/chapters.ts), sealed
 *   with AES-GCM under the row's key_version. It holds the question, note or birth data.
 * - Two identical readings are two rows: each is a purchase. One unlock saves at most one row.
 * - Nothing is saved for a deleted account.
 */

export type ReadingSource = "paid" | "free" | "owner";

/** A chapter as the device keeps it (StoredChapter) without its local id. */
export interface ServerChapter {
  kind: "tarot" | "saju";
  reading: Record<string, unknown>;
  chapterToken: string;
  createdAt: number;
  turns: Array<{ question: string; answer: string }>;
  followUpsLeft: number;
  [key: string]: unknown;
}

export interface SavedReading {
  id: string;
  createdAt: number;
  chapter: ServerChapter;
}

/** 20 characters of [a-z0-9]: also a valid device chapter id. */
export function newReadingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * The INSERT for a reading, for a live account only (a deleted one gets nothing). A second insert
 * for the same unlock does nothing (ON CONFLICT DO NOTHING), so a retried delivery never fails on
 * its own first save.
 */
export async function insertReadingStatement(
  db: D1Binding,
  secret: string,
  input: { id: string; userId: string; productId: string; source: ReadingSource; unlockId: string | null; chapter: ServerChapter; now: number },
): Promise<D1Statement> {
  return db
    .prepare(
      `INSERT INTO readings (id, user_id, kind, product_id, source, unlock_id, payload, key_version, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      input.id,
      input.userId,
      input.chapter.kind,
      input.productId,
      input.source,
      input.unlockId,
      await sealJson(input.chapter, secret),
      READING_KEY_VERSION,
      input.now,
      input.now,
      input.userId,
    );
}

interface Row {
  id: string;
  created_at: number;
  payload: string;
  key_version: number;
}

async function open(row: Row, secret: string): Promise<SavedReading | null> {
  const chapter = await openJson<ServerChapter>(row.payload, secret, row.key_version);
  if (!chapter) {
    console.error(JSON.stringify({ evt: "readings.unreadable", id: row.id, keyVersion: row.key_version }));
    return null;
  }
  return { id: row.id, createdAt: row.created_at, chapter };
}

/** Readings per page of GET /api/readings. */
export const READINGS_PAGE = 50;

const cursorOf = (row: Row) => `${row.created_at}.${row.id}`;

function parseCursor(cursor: string | undefined): [number, string] | null {
  const match = cursor ? /^(\d{1,16})\.([a-z0-9]{20})$/.exec(cursor) : null;
  return match ? [Number(match[1]), match[2]!] : null;
}

/** My readings, newest first, a page at a time: `next` continues after the last one (null at the end). */
export async function listReadings(
  db: D1Binding,
  secret: string,
  userId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ readings: SavedReading[]; next: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? READINGS_PAGE, 1), READINGS_PAGE);
  const after = parseCursor(options.before);
  const { results } = await (after
    ? db
        .prepare(
          `SELECT id, created_at, payload, key_version FROM readings
           WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(userId, after[0], after[0], after[1], limit + 1)
    : db.prepare("SELECT id, created_at, payload, key_version FROM readings WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(userId, limit + 1)
  ).all<Row>();
  const page = results.slice(0, limit);
  const readings: SavedReading[] = [];
  for (const row of page) {
    const saved = await open(row, secret);
    if (saved) readings.push(saved);
  }
  return { readings, next: results.length > limit ? cursorOf(page[page.length - 1]!) : null };
}

export async function readingForUser(db: D1Binding, secret: string, userId: string, id: string): Promise<SavedReading | null> {
  const row = await db.prepare("SELECT id, created_at, payload, key_version FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  return row ? open(row, secret) : null;
}

/** The row is there (the settlement's recover(): a save whose answer was lost). */
export async function readingExists(db: D1Binding, userId: string, id: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).first());
}

/** Rewrites a saved chapter (follow-up turns, the newer chapter token). False when it is not this user's. */
export async function updateReadingChapter(
  db: D1Binding,
  secret: string,
  userId: string,
  id: string,
  update: (chapter: ServerChapter) => ServerChapter,
  now: number,
): Promise<boolean> {
  const saved = await readingForUser(db, secret, userId, id);
  if (!saved) return false;
  const result = await db
    .prepare("UPDATE readings SET payload = ?, key_version = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(await sealJson(update(saved.chapter), secret), READING_KEY_VERSION, now, id, userId)
    .run();
  return result.meta?.changes === 1;
}

export async function deleteReading(db: D1Binding, userId: string, id: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return result.meta?.changes === 1;
}

export async function deleteAllReadings(db: D1Binding, userId: string): Promise<number> {
  return (await db.prepare("DELETE FROM readings WHERE user_id = ?").bind(userId).run()).meta?.changes ?? 0;
}
```

- [ ] **Step 4: Give `SpendLedger` a sink and add the paid book in `apps/web/lib/api/spend.ts`.** Change only what is listed; mark each change `// P4`.

Add after `addCost`:

```ts
/** P4: where a SpendLedger writes: the free-tier day total (addCost) or the paid book (addPaidCost). */
export type CostSink = (krw: number, at: number) => Promise<void>;

/** P4: paid book entries live long enough for a monthly look in the runbook. */
const PAID_COST_TTL_SECONDS = 35 * 24 * 60 * 60;

/**
 * P4: the model cost of readings opened with a purchase, in `paidcost:<kstDay>:<shard>`. budgetState
 * never reads these keys, so paid readings never close the free tier; the purchase price covers
 * them (spec 11). A failed write is logged (write()) and does not count toward "unknown".
 */
export async function addPaidCost(krw: number, now: number): Promise<void> {
  if (!Number.isFinite(krw) || krw === 0) return;
  const key = `paidcost:${kstDay(now)}:${Math.floor(Math.random() * COST_SHARDS)}`;
  const current = await read(key);
  if (current !== null) await write(key, current + krw, PAID_COST_TTL_SECONDS);
}
```

In `class SpendLedger`:
- change the constructor to `constructor(private readonly clock: () => number = Date.now, private readonly sink: CostSink = addCost) {} // P4: sink`;
- in `add`, call `this.sink(krw, at)` instead of `addCost(krw, at)`.

Existing callers (`new SpendLedger()`, `new SpendLedger(() => now)` in `app/api/accounting.test.ts`) keep `addCost`.

- [ ] **Step 5: Add the settlement to `apps/web/lib/api/stream.ts`.** Change only what is listed; mark each change `// P4`.

Change the spend import to:

```ts
import { SpendLedger, addCost, addPaidCost, recordClientSpend, type SpendKind } from "./spend";
```

Add after `GenerationOutcome`:

```ts
/**
 * P4: how a credit-backed generation settles (spec 5.4). Everything runs inside the generation's
 * keepAlive work, after run() and before the JSON body or the `done` event leaves.
 * - `deliver` saves the reading and spends the reservation; what it returns joins the body (the
 *   saved reading's id).
 * - `recover` runs when deliver threw: what deliver would have returned if the save landed anyway
 *   (its D1 answer was lost), else null.
 * - `release` runs on every failure: generation error, budget, client gone, a save that did not
 *   land. It must be idempotent and a no-op once delivered.
 */
export interface Settlement {
  deliver(outcome: GenerationOutcome): Promise<Record<string, unknown>>;
  recover(): Promise<Record<string, unknown> | null>;
  release(): Promise<void>;
}
```

Add to `RespondOptions`:

```ts
  /** P4: saves the reading and settles its credit before the client sees it; none for 오픈 기념 readings */
  settle?: Settlement;
  /** P4: a paid opening: its model cost goes to the paid book (addPaidCost), never the free-tier total */
  paidCost?: boolean;
```

In `respondGeneration`:
- destructure `settle` and `paidCost` with the other options;
- create the ledger with its book: `const ledger = new SpendLedger(Date.now, paidCost ? addPaidCost : addCost); // P4: paid book`;
- add these two helpers right after `accounting`:

```ts
  // P4: a failed release is not lost: the reservation expires (RESERVATION_MS) and a sweep returns it.
  const release = async () => {
    if (!settle) return;
    try {
      await settle.release();
    } catch (error) {
      console.error(JSON.stringify({ evt: "settle.release_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
    }
  };
  // P4: the body the client gets: unchanged without a settlement; with one, saved (or found saved) first.
  const settled = async (outcome: GenerationOutcome): Promise<unknown> => {
    if (!settle) return outcome.body;
    let extra: Record<string, unknown>;
    try {
      extra = await settle.deliver(outcome);
    } catch (error) {
      const recovered = await settle.recover().catch(() => null);
      if (!recovered) throw error;
      console.warn(JSON.stringify({ evt: "settle.recovered" }));
      extra = recovered;
    }
    return { ...(outcome.body as Record<string, unknown>), ...extra };
  };
```

JSON path (inside the existing `work`):
- right after `const outcome = await run(accounting);` add `const body = await settled(outcome); // P4`;
- return `json(body, { cookies: cookies.map(serializeCookie) })` instead of `json(outcome.body, …)`;
- make `await release(); // P4` the first line of its `catch`.

Stream path (inside the existing `keepAlive((async () => { … })())`):
- right after `const outcome = await run(hooks);` add `const data = await settled(outcome); // P4: saved and spent before done`;
- write `{ type: "done", data, ...(commit ? { commit } : {}) }` instead of `data: outcome.body`;
- make `await release(); // P4` the first line of its `catch`.

Nothing else moves: `recordClientSpend` before the start, `abort.done()`, `ledger.finish()` in the `finally` blocks, the ping, and `keepAlive` stay as they are.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/lib/readings apps/web/lib/api apps/web/app/api`
Expected:
- PASS: store 5 tests, settle 10 tests.
- streaming.test, routes.test, accounting.test and kv-failure.test pass unchanged: without `settle` and `paidCost` the body and the books are what they were.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/readings/store.ts apps/web/lib/readings/store.test.ts apps/web/lib/api/spend.ts apps/web/lib/api/stream.ts apps/web/lib/api/settle.test.ts
git commit -m "feat(readings): encrypted saved readings, a paid cost book, settlement before done inside keepAlive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Paid, 별조각 and owner unlocks on the reading routes

**Files:**
- Create: `apps/web/lib/api/unlock.ts`, `apps/web/lib/readings/chapters.ts`
- Modify: `apps/web/lib/api/inputs.ts`, `apps/web/lib/api/tarotRequest.ts`, `apps/web/app/api/tarot/reading/route.ts`, `apps/web/app/api/saju/reading/route.ts`
- Test: `apps/web/app/api/unlock.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `standardProduct`, `unitsFor`, `StandardProductId`, `paymentsMode`, `openingOffer`, `UNLOCK_METHODS`, `UnlockMethod`.
  - Task 3: `openAccount`. Task 4: `reserveUnlock`, `deliverUnlock`, `releaseUnlock`.
  - Task 9: `insertReadingStatement`, `newReadingId`, `readingExists`, `ServerChapter`, `ReadingSource`, `Settlement`, `respondGeneration` with `settle` and `paidCost`, `addPaidCost` book (tests read it).
  - Existing: `Gate`, `checkQuota`, `checkServerLimits`, `spendCookies`, `fullReadingLimit`, `issueChapter`, `QuotaState`, `SpendKind`, `SITE.reading.followUps`.
- Produces:
  - `inputs.ts`:
    - `UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) })`; `TarotBody.unlock?`, `SajuBody.unlock?`
    - `SajuBody.display?: { title ≤80, summary ≤400 }` (the teaser's title and summary, saved with the reading)
  - `tarotContextFrom` also returns `unlock?: UnlockMethod`.
  - `unlock.ts`:
    - `interface UnlockPlan { method; productId; quota: QuotaState | null; spend: SpendKind | undefined; paidCost: boolean; save: {db; accountSecret; userId; source; unlockId} | null }`
    - `planUnlock(request, gate, kind, method?): Promise<UnlockPlan | Response>`
    - `settlementFor(plan, chapterOf, now): Settlement | undefined`
  - `chapters.ts`: `tarotChapter(input, cards, body, now): ServerChapter`, `sajuChapter({birth, context, display?}, body, now): ServerChapter`
  - The routes' 200 body gains `readingId` when the reading was saved to an account. New pre-stream errors:
    - 402 `PAYMENT_REQUIRED` (the 오픈 기념 reading asked for while payments are on);
    - 401 `LOGIN_REQUIRED`;
    - 402 `NO_CREDIT`;
    - 403 `FORBIDDEN` (owner method without the pass);
    - 503 `PAY_UNAVAILABLE`.
    - A 별조각 or owner opening also gets the existing 503 `reason: "budget"` and 429 `scope: "network"` answers (minor 4).

**What each method passes to `respondGeneration` (C1, minor 4):**

| method | checks before the start | `spend` | `paidCost` | `settle` |
|---|---|---|---|---|
| `opening` (absent) | `checkQuota(gate, "full")`: free budget, network cap, device cookie. 402 once payments are on for everyone (owner pass excepted) | `"full"` | no (`cost:` book) | none: the device keeps it, as today |
| `free` (별조각) | login; `checkServerLimits(gate, "full")`: free budget and network cap; then the reservation | `"full"` | no (`cost:` book) | save + spend |
| `paid` | login; the reservation. No free-budget or network check: the purchase pays for it | none | yes (`paidcost:` book) | save + spend |
| `owner` | the owner pass; `checkServerLimits(gate, "full")` (owner rules) | `"full"` (owners are not counted) | no | save when logged in |

- A 별조각 reading costs us what a free reading costs. It counts in the free budget and on the network's daily full-reading cap. Signing up many Kakao accounts on one network gets no more than that cap.
- A paid reading stays rate-limited by `FULL_LIMITER` (20 per minute per IP at aa70830), like every full reading.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/unlock.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { NDJSON } from "@/lib/api/stream";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { mockToss } from "@/lib/pay/tossMock";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as ownerPost } from "./owner/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MONEY_INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};
/** 2,800원 with KRW_PER_USD=1400. */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];

let ipSeq = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  vi.stubEnv("KRW_PER_USD", "1400");
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loggedIn(name = "alice"): Promise<{ b: Browser; ip: string }> {
  const ip = `198.51.100.${++ipSeq}`;
  const b = browser(ip);
  await loginAs(b, name);
  return { b, ip };
}

async function open(b: Browser, method?: string, accept?: string, signal?: AbortSignal) {
  const drawn = await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } });
  const { drawToken } = (await drawn.json()) as { drawToken: string };
  return b.send(reading, "/api/tarot/reading", { body: { drawToken, input: MONEY_INPUT, ...(method ? { unlock: { method } } : {}) }, accept, signal });
}

/** The mock provider, reporting EXPENSIVE as billed, like the real one does. */
function billing() {
  const real = mockProvider.generate.bind(mockProvider);
  return vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
    hooks?.onUsage?.(EXPENSIVE);
    return real(task, attempt, feedback, hooks);
  });
}

async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}
const freeBook = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);
const userId = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;
const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

describe("opening a full reading with credit", () => {
  it("ends the free 오픈 기념 reading once payments are on for everyone, before any generation", async () => {
    useTestDb();
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await open(browser("192.0.2.10"));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("asks for login before spending credit, and says when there is none", async () => {
    useTestDb();
    expect((await open(browser("192.0.2.11"), "paid")).status).toBe(401);
    const { b } = await loggedIn();
    const res = await open(b, "paid");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "NO_CREDIT" });
  });

  it("opens with 별조각: saved and spent only then, no quota cookie, counted like a free reading", async () => {
    const db = useTestDb();
    const { b, ip } = await loggedIn();
    billing();
    const res = await open(b, "free");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readingId: string; chapterToken: string };
    expect(body.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sl_q="))).toBe(false);
    expect((await me(b)).user?.stardust).toBe(0);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ id: body.readingId, chapter: { kind: "tarot", question: MONEY_INPUT.question, chapterToken: body.chapterToken, followUpsLeft: 3 } });
    expect((readings[0]!.chapter.cards as unknown[]).length).toBe(3);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount(await keyedHash(`client:${ip}`, signingSecret()!), "full", Date.now())).toBe(1);
  });

  it("stops 별조각 when the free budget is spent, before reserving; a paid reading still opens, on the paid book", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const free = await open(b, "free");
    expect(free.status).toBe(503);
    expect(await free.json()).toMatchObject({ reason: "budget" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    expect((await me(b)).user?.stardust).toBe(10);
    await buy(b);
    billing();
    expect((await open(b, "paid")).status).toBe(200);
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
  });

  it("opens a paid reading once, then there is nothing left to spend", async () => {
    useTestDb();
    const { b } = await loggedIn();
    await buy(b);
    expect((await open(b, "paid")).status).toBe(200);
    expect((await me(b)).user?.unused).toEqual([]);
    expect((await open(b, "paid")).status).toBe(402);
    expect((await me(b)).user?.stardust).toBe(10);
  });

  it("gives the credit back when the generation fails", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mockProvider, "generate").mockRejectedValue(new GenerationError("UPSTREAM"));
    expect((await open(b, "free")).status).toBe(502);
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
  });

  it("gives the credit back when the client leaves mid-stream", async () => {
    useTestDb();
    const { b } = await loggedIn();
    vi.spyOn(mockProvider, "generate").mockImplementation(
      (_task, _attempt, _feedback, hooks) => new Promise((_, reject) => hooks?.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])))),
    );
    const controller = new AbortController();
    const res = await open(b, "free", NDJSON, controller.signal);
    expect(res.status).toBe(200);
    controller.abort();
    await res.text().catch(() => "");
    vi.mocked(mockProvider.generate).mockRestore();
    await vi.waitFor(async () => expect((await me(b)).user?.stardust).toBe(10));
  });

  it("streams: the done event carries the saved reading's id", async () => {
    useTestDb();
    const { b } = await loggedIn();
    const lines = (await (await open(b, "free", NDJSON)).text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: { readingId?: string } });
    const done = lines.find((event) => event.type === "done");
    expect(done?.data?.readingId).toMatch(/^[a-z0-9]{20}$/);
  });

  it("still ends in done when the save landed but its D1 answer was lost, spending the credit once", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const realBatch = db.batch.bind(db);
    let batches = 0;
    // Batch 1 is the reservation, batch 2 the delivery: it commits, then its answer is lost.
    vi.spyOn(db, "batch").mockImplementation(async (statements) => {
      const results = await realBatch(statements);
      if (++batches === 2) throw new Error("D1 answer lost");
      return results;
    });
    const lines = (await (await open(b, "free", NDJSON)).text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: { readingId?: string } });
    expect(lines.at(-1)?.type).toBe("done");
    expect(lines.at(-1)?.data?.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "delivered" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 1 });
    expect((await me(b)).user?.stardust).toBe(0);
  });

  it("lets the owner open free, saved to the account when logged in, with no ledger movement", async () => {
    const db = useTestDb();
    expect((await open(browser("192.0.2.12"), "owner")).status).toBe(403);
    const owner = browser("192.0.2.13");
    await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } });
    await loginAs(owner, "owner");
    const res = await open(owner, "owner");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { readingId?: string }).readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT source FROM readings")).toEqual({ source: "owner" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'")).toEqual({ n: 0 });
  });

  it("never traps credit: it can still be spent after payments are switched off", async () => {
    useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await open(b, "free")).status).toBe(200);
  });

  it("saves the saju teaser's title with a paid saju reading", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    await buy(b, "saju");
    const res = await b.send(sajuReading, "/api/saju/reading", {
      body: { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" }, display: { title: "타고난 결", summary: "요약 한 줄" } },
    });
    expect(res.status).toBe(200);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings[0]?.chapter).toMatchObject({ kind: "saju", title: "타고난 결", summary: "요약 한 줄" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/unlock.test.ts`
Expected: FAIL. The first case answers 200 (the 오픈 기념 reading still opens). Credit methods are ignored and no `readingId` comes back.

- [ ] **Step 3: Extend `apps/web/lib/api/inputs.ts` and `apps/web/lib/api/tarotRequest.ts`**

In `inputs.ts` add the import `import { UNLOCK_METHODS } from "@/lib/pay/unlockMethod";` and:

```ts
/** How the full reading is opened (P4). Absent means the 오픈 기념 daily free reading. */
export const UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) });
```

Add `unlock: UnlockBody.optional(),` to `TarotBody`. Add both of these to `SajuBody`:

```ts
  unlock: UnlockBody.optional(),
  /** the free teaser's title and summary, kept with a reading saved to the account */
  display: z.object({ title: z.string().trim().max(80), summary: z.string().trim().max(400) }).optional(),
```

In `tarotContextFrom`, add `unlock?: UnlockMethod` to the returned object type (import `type UnlockMethod` from `@/lib/pay/unlockMethod`), and add `unlock: body.data.unlock?.method` to the object it returns. Keep everything else in that return as it is (the history filtering included).

- [ ] **Step 4: Write `apps/web/lib/readings/chapters.ts`**

```ts
import "server-only";
import { SITE } from "@/lib/config";
import type { ServerChapter } from "./store";

/**
 * The chapter a device would save for a fresh reading (lib/storage/chapters.ts NewChapter), built on
 * the server so a reading saved to the account matches what the device keeps.
 */

type Body = { reading: unknown; chapterToken: string };

export function tarotChapter(
  input: { question: string; conditions: ReadonlyArray<{ label: string; value: string }>; note?: string },
  cards: ReadonlyArray<{ position: string; cardId: string; orientation: "upright" | "reversed" }>,
  body: Body,
  now: number,
): ServerChapter {
  return {
    kind: "tarot",
    question: input.question,
    conditions: input.conditions.map(({ label, value }) => ({ label, value })),
    note: (input.note ?? "").trim(),
    cards: cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })),
    reading: body.reading as Record<string, unknown>,
    chapterToken: body.chapterToken,
    createdAt: now,
    turns: [],
    followUpsLeft: SITE.reading.followUps,
  };
}

export function sajuChapter(
  input: { birth: unknown; context: { loveStatus?: string; workStatus?: string; concern?: string }; display?: { title: string; summary: string } },
  body: Body,
  now: number,
): ServerChapter {
  const concern = input.context.concern?.trim();
  const context = {
    ...(input.context.loveStatus ? { loveStatus: input.context.loveStatus } : {}),
    ...(input.context.workStatus ? { workStatus: input.context.workStatus } : {}),
    ...(concern ? { concern } : {}),
  };
  return {
    kind: "saju",
    birth: input.birth,
    title: input.display?.title ?? "",
    summary: input.display?.summary ?? "",
    ...(Object.keys(context).length > 0 ? { context } : {}),
    reading: body.reading as Record<string, unknown>,
    chapterToken: body.chapterToken,
    createdAt: now,
    turns: [],
    followUpsLeft: SITE.reading.followUps,
  };
}
```

- [ ] **Step 5: Write `apps/web/lib/api/unlock.ts`**

```ts
import "server-only";
import { openAccount } from "@/lib/account/request";
import type { D1Binding } from "@/lib/db/d1";
import { standardProduct, unitsFor, type StandardProductId } from "@/lib/pay/catalog";
import { deliverUnlock, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { openingOffer, paymentsMode } from "@/lib/pay/mode";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { insertReadingStatement, newReadingId, readingExists, type ReadingSource, type ServerChapter } from "@/lib/readings/store";
import type { QuotaState } from "@/lib/security/quota";
import { checkQuota, checkServerLimits, errorResponse, type Gate } from "./http";
import type { SpendKind } from "./spend";
import type { GenerationOutcome, Settlement } from "./stream";

/**
 * How a full reading is paid for, decided before any generation starts (spec 5.4). See the table in
 * the plan's Task 10:
 * - `opening`: the 오픈 기념 daily free reading, exactly as before P4 (cookie quota, server limits,
 *   network counter). 402 PAYMENT_REQUIRED once payments are on for everyone; never for the owner.
 * - `free` (별조각): login, the free budget and network cap (it costs us what a free reading costs),
 *   then the reservation. Spending is never gated by STARLOG_PAYMENTS.
 * - `paid`: login, then the reservation. Its model cost goes to the paid book.
 * - `owner`: the owner pass and the owner's server limits, no ledger; saved when logged in.
 */

export interface UnlockPlan {
  method: UnlockMethod;
  productId: StandardProductId;
  /** the device's cookie quota: the 오픈 기념 reading spends it after a validated generation */
  quota: QuotaState | null;
  /** RespondOptions.spend: the network day counter, charged before the start (none for a paid opening) */
  spend: SpendKind | undefined;
  /** RespondOptions.paidCost: a paid opening's model cost goes to the paid book */
  paidCost: boolean;
  save: { db: D1Binding; accountSecret: string; userId: string; source: ReadingSource; unlockId: string | null } | null;
}

export async function planUnlock(request: Request, gate: Gate, kind: StandardProductId, method: UnlockMethod = "opening"): Promise<UnlockPlan | Response> {
  const base = { method, productId: kind, quota: null, spend: "full" as const, paidCost: false, save: null };
  if (method === "opening") {
    if (!gate.owner && !openingOffer(paymentsMode())) return errorResponse("PAYMENT_REQUIRED");
    const quota = await checkQuota(gate, "full");
    if (quota instanceof Response) return quota;
    return { ...base, quota };
  }
  if (method === "owner") {
    if (!gate.owner) return errorResponse("FORBIDDEN");
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
    const ctx = await openAccount(request, gate.now);
    const user = ctx instanceof Response ? null : ctx.session?.user;
    if (ctx instanceof Response || !user) return base;
    return { ...base, save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "owner", unlockId: null } };
  }
  const ctx = await openAccount(request, gate.now);
  if (ctx instanceof Response) return ctx;
  const user = ctx.session?.user;
  if (!user) return errorResponse("LOGIN_REQUIRED");
  if (method === "free") {
    // 별조각 readings cost us what free readings cost: the free budget and the network cap apply (minor 4).
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
  }
  const reserved = await reserveUnlock(ctx.db, {
    userId: user.id,
    productId: kind,
    currency: method === "paid" ? "paid" : "free",
    units: unitsFor(standardProduct(kind)),
    now: gate.now,
  });
  if (!reserved.ok) return errorResponse("NO_CREDIT");
  console.info(JSON.stringify({ evt: "unlock.reserved", method, productId: kind }));
  return {
    method,
    productId: kind,
    quota: null,
    spend: method === "free" ? "full" : undefined,
    paidCost: method === "paid",
    save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: method, unlockId: reserved.unlockId },
  };
}

/**
 * Saves the reading to the account, and spends the reservation, before the client sees the reading
 * (stream.ts Settlement, inside the generation's keepAlive work). recover() looks for exactly this
 * generation's row, so a save whose answer was lost still reaches the client. Every failure
 * releases the reservation. Without anything to save (오픈 기념, or an owner not logged in) there is
 * no settlement.
 */
export function settlementFor(plan: UnlockPlan, chapterOf: (body: Record<string, unknown>) => ServerChapter, now: number): Settlement | undefined {
  const save = plan.save;
  if (!save) return undefined;
  const readingId = newReadingId();
  return {
    async deliver(outcome: GenerationOutcome) {
      const insert = await insertReadingStatement(save.db, save.accountSecret, {
        id: readingId,
        userId: save.userId,
        productId: plan.productId,
        source: save.source,
        unlockId: save.unlockId,
        chapter: chapterOf(outcome.body as Record<string, unknown>),
        now,
      });
      if (save.unlockId) {
        const result = await deliverUnlock(save.db, { unlockId: save.unlockId, readingId, now: Date.now(), before: [insert] });
        console.info(JSON.stringify({ evt: result === "delivered" ? "unlock.delivered" : "unlock.reservation_lost", unlockId: save.unlockId }));
        if (result === "lost" && !(await readingExists(save.db, save.userId, readingId))) return {};
      } else {
        const [saved] = await save.db.batch([insert]);
        if (saved?.meta?.changes !== 1) return {};
      }
      return { readingId };
    },
    async recover() {
      return (await readingExists(save.db, save.userId, readingId)) ? { readingId } : null;
    },
    async release() {
      if (save.unlockId && (await releaseUnlock(save.db, { unlockId: save.unlockId, now: Date.now() }))) {
        console.info(JSON.stringify({ evt: "unlock.released", unlockId: save.unlockId }));
      }
    },
  };
}
```

- [ ] **Step 6: Rewire the two reading routes**

`apps/web/app/api/tarot/reading/route.ts` (whole file):

```ts
import { generateTarotReading } from "@/lib/ai/generate";
import { fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - 오픈 기념 (no `unlock`): spends one daily unlock only after a validated generation.
 * - paid / 별조각: reserves credit first, then saves the reading to the account and spends the
 *   credit before the client sees it. Any failure releases the credit (spec 5.4).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const plan = await planUnlock(request, gate, "tarot", parsed.unlock);
  if (plan instanceof Response) return plan;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateTarotReading(gate.provider, parsed.ctx, hooks)).data;
      const chapterToken = await issueChapter(
        { kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]) },
        reading, [], gate.secret, gate.now,
      );
      return { body: { reading, chapterToken }, cookies: plan.quota ? await spendCookies(gate, plan.quota, "full") : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      settle: settlementFor(plan, (body) => tarotChapter(parsed.input, parsed.draw.cards, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
```

`apps/web/app/api/saju/reading/route.ts` (whole file):

```ts
import { generateSajuReading } from "@/lib/ai/generate";
import { fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { sajuChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {birth, loveStatus?, workStatus?, concern?, unlock?, display?} → {reading, chapterToken, readingId?}:
 * the paid prologue.
 * - 오픈 기념: one daily unlock after a validated generation.
 * - paid / 별조각: credit reserved, then saved and spent before the client sees it, released on
 *   failure (spec 5.4).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await sajuRequest(request, gate.now);
  if (parsed instanceof Response) return parsed;
  const plan = await planUnlock(request, gate, "saju", parsed.body.unlock?.method);
  if (plan instanceof Response) return plan;
  const { birth, loveStatus, workStatus, concern, display } = parsed.body;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateSajuReading(gate.provider, parsed.facts, hooks)).data;
      const chapterToken = await issueChapter({ kind: "saju", birth, profile: parsed.profile }, reading, [], gate.secret, gate.now);
      return { body: { reading, chapterToken }, cookies: plan.quota ? await spendCookies(gate, plan.quota, "full") : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      settle: settlementFor(
        plan,
        (body) => sajuChapter({ birth, context: { loveStatus, workStatus, concern }, display }, body as { reading: unknown; chapterToken: string }, gate.now),
        gate.now,
      ),
    },
  );
}
```

If either route changed since `aa70830` (a new argument to `issueChapter`, new outcome fields), keep that change. `inputs.ts` and `tarotRequest.ts` carry P5 lines since `ba7e843` (premium draw templates, the premium-template refusal in `tarotContextFrom`): add next to them, never over them. Add only the plan, the quota condition and the three options. The options keep `spend: "full"` for every opening except a paid one (`plan.spend`).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api apps/web/lib/api`
Expected:
- PASS: unlock.test 12 tests.
- routes.test, streaming.test, accounting.test and kv-failure.test unchanged. They never send `unlock`, and `STARLOG_PAYMENTS` defaults to off, so every reading takes the `opening` path with `spend: "full"`.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/api/unlock.ts apps/web/lib/readings/chapters.ts apps/web/lib/api/inputs.ts apps/web/lib/api/tarotRequest.ts apps/web/app/api/tarot/reading/route.ts apps/web/app/api/saju/reading/route.ts apps/web/app/api/unlock.test.ts
git commit -m "feat(api): open full readings with a purchase, 별조각 or the owner pass; charge only on delivery" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Readings API — pages, delete, follow-up turns

**Files:**
- Create: `apps/web/app/api/readings/route.ts`, `apps/web/lib/readings/turns.ts`
- Modify: `apps/web/lib/api/inputs.ts` (`FollowUpBody.readingId`), `apps/web/app/api/followup/route.ts`
- Test: `apps/web/app/api/readings/readings.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `openAccountRoute`, `requireSession`, `openAccount`.
  - Task 9: `listReadings`, `READINGS_PAGE`, `insertReadingStatement`, `deleteReading`, `deleteAllReadings`, `updateReadingChapter`, `newReadingId`, `ServerChapter`.
  - Task 10's reading routes, in the tests.
- Produces:
  - `GET /api/readings[?before=<cursor>][&limit=1..50]` → `{ readings: Array<{ id; createdAt; chapter: ServerChapter }>, next: string | null }`. Newest first, 50 per page; the client follows `next` to the end (minor 9: no cap at 100 or 300).
  - `DELETE /api/readings?id=<id>` or `?all=1` → `{ deleted: number }`
  - `FollowUpBody.readingId?` (20 chars `[a-z0-9]`): a follow-up answer is also written into that saved reading
  - `saveFollowUpTurn(request, now, readingId, turn, chapterToken, followUpsLeft): Promise<void>`

**Scope (revision 2):** the coordinator cut the device→account claim. Readings reach the account only when they are opened while logged in (Task 10). There is no `POST /api/readings/claim`, no `chapterIsGenuine`, no digest and no per-account cap. A purchase is always saved.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/readings/readings.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { insertReadingStatement, listReadings, newReadingId, type ServerChapter } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as reading } from "../tarot/reading/route";
import { DELETE as remove, GET as list } from "./route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const userIdOf = async (db: D1Binding, nth = 0) => (await db.prepare("SELECT id FROM users ORDER BY created_at, id LIMIT 1 OFFSET ?").bind(nth).first<{ id: string }>())!.id;

const chapterOf = (question: string): ServerChapter => ({
  kind: "tarot", question, conditions: [], note: "", cards: [], reading: { verdict: `${question}의 결론` }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3,
});

async function saveFor(db: D1Binding, userId: string, question: string, now: number): Promise<string> {
  const id = newReadingId();
  await (await insertReadingStatement(db, accountSecret()!, { id, userId, productId: "tarot", source: "paid", unlockId: null, chapter: chapterOf(question), now })).run();
  return id;
}

type Page = { readings: Array<{ id: string; chapter: ServerChapter }>; next: string | null };
const page = async (b: Browser, query = "") => (await (await b.send(list, `/api/readings${query}`)).json()) as Page;

describe("readings in the account", () => {
  it("lists only my saved readings, newest first, a page at a time", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.21");
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000); // bob signs up later, so alice is the first user
    const bob = browser("192.0.2.22");
    await loginAs(bob, "bob");
    const aliceId = await userIdOf(db);
    for (const [i, question] of ["하나", "둘", "셋"].entries()) await saveFor(db, aliceId, question, T0 + i);
    const first = await page(alice, "?limit=2");
    expect(first.readings.map((r) => r.chapter.question)).toEqual(["셋", "둘"]);
    expect(first.next).not.toBeNull();
    const second = await page(alice, `?limit=2&before=${encodeURIComponent(first.next!)}`);
    expect(second).toMatchObject({ readings: [{ chapter: { question: "하나" } }], next: null });
    expect(await page(bob)).toEqual({ readings: [], next: null });
    expect((await browser("192.0.2.23").send(list, "/api/readings")).status).toBe(401);
    expect((await alice.send(list, "/api/readings?before=not-a-cursor")).status).toBe(200);
  });

  it("deletes my saved readings, one or all, never someone else's", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.27");
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000);
    const bob = browser("192.0.2.28");
    await loginAs(bob, "bob");
    const aliceId = await userIdOf(db);
    const one = await saveFor(db, aliceId, "하나", T0);
    await saveFor(db, aliceId, "둘", T0 + 1);
    const del = (b: Browser, query: string, origin = true) => b.send(remove, `/api/readings?${query}`, { method: "DELETE", origin });
    expect((await del(alice, `id=${one}`, false)).status).toBe(403);
    expect(await (await del(bob, `id=${one}`)).json()).toEqual({ deleted: 0 });
    expect(await (await del(alice, `id=${one}`)).json()).toEqual({ deleted: 1 });
    expect(await (await del(alice, "all=1")).json()).toEqual({ deleted: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM readings").first()).toEqual({ n: 0 });
  });

  it("writes a follow-up answer into the saved reading", async () => {
    const db = useTestDb();
    const b = browser("192.0.2.29");
    await loginAs(b);
    const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
    const input = { topicId: "money", whoId: "me", whenId: "week", question: "이번 주 재물 흐름은", conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }] };
    const opened = (await (await b.send(reading, "/api/tarot/reading", { body: { drawToken, input, unlock: { method: "free" } } })).json()) as { reading: unknown; chapterToken: string; readingId: string };
    const answer = await b.send(followup, "/api/followup", { body: { chapterToken: opened.chapterToken, reading: opened.reading, question: "조금 더 알려 주세요", readingId: opened.readingId } });
    expect(answer.status).toBe(200);
    const { chapterToken, remaining } = (await answer.json()) as { chapterToken: string; remaining: number };
    const { readings } = await listReadings(db, accountSecret()!, await userIdOf(db));
    expect(readings[0]?.chapter.turns).toHaveLength(1);
    expect(readings[0]?.chapter).toMatchObject({ chapterToken, followUpsLeft: remaining });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/readings/readings.test.ts`
Expected: FAIL (route module not found).

- [ ] **Step 3: Write `apps/web/lib/readings/turns.ts`**

```ts
import "server-only";
import { openAccount } from "@/lib/account/request";
import { updateReadingChapter } from "./store";

/**
 * Writes a follow-up answer into the account's copy of the reading, so another device sees it.
 * Best effort: a failure is logged and never fails the answer, which the device keeps anyway.
 */
export async function saveFollowUpTurn(
  request: Request,
  now: number,
  readingId: string,
  turn: { question: string; answer: string },
  chapterToken: string,
  followUpsLeft: number,
): Promise<void> {
  try {
    const ctx = await openAccount(request, now);
    if (ctx instanceof Response || !ctx.session) return;
    await updateReadingChapter(ctx.db, ctx.accountSecret, ctx.session.user.id, readingId, (chapter) => ({ ...chapter, turns: [...chapter.turns, turn], chapterToken, followUpsLeft }), now);
  } catch (error) {
    console.error(JSON.stringify({ evt: "readings.turn_not_saved", error: error instanceof Error ? error.constructor.name : typeof error }));
  }
}
```

- [ ] **Step 4: Wire the follow-up route.**
  - In `apps/web/lib/api/inputs.ts`, add to `FollowUpBody`:

```ts
  /** the reading's id in the account (Task 11): the answer is saved there too */
  readingId: z.string().regex(/^[a-z0-9]{20}$/).optional(),
```

  - In `apps/web/app/api/followup/route.ts`, inside the `respondGeneration` callback, right after `remaining` is computed and before `return`:

```ts
    if (body.data.readingId) await saveFollowUpTurn(request, gate.now, body.data.readingId, { question, answer: answer.answer }, chapterToken, remaining);
```

  - Add the import `import { saveFollowUpTurn } from "@/lib/readings/turns";`. Change nothing else in the route: its caps, `spend: "followup"` and the chapter-turn count stay as they are.

- [ ] **Step 5: Write `apps/web/app/api/readings/route.ts`**

```ts
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { READINGS_PAGE, deleteAllReadings, deleteReading, listReadings } from "@/lib/readings/store";

/**
 * GET [?before=<cursor>][&limit=n] → { readings, next }: the readings saved in my account, newest
 * first, READINGS_PAGE at a time. 내 정보 and the result pages follow `next` (lib/storage/sync.ts).
 * A cursor that does not parse starts from the newest.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? READINGS_PAGE);
  return json(await listReadings(ctx.db, ctx.accountSecret, session.user.id, {
    before: params.get("before") ?? undefined,
    limit: Number.isInteger(limit) ? limit : READINGS_PAGE,
  }));
}

/** DELETE ?id=<id> → removes one saved reading; ?all=1 → all of them (개인정보 파기 on request). */
export async function DELETE(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  if (params.get("all") === "1") return json({ deleted: await deleteAllReadings(ctx.db, session.user.id) });
  const id = params.get("id") ?? "";
  if (!/^[a-z0-9]{20}$/.test(id)) return errorResponse("BAD_REQUEST");
  return json({ deleted: (await deleteReading(ctx.db, session.user.id, id)) ? 1 : 0 });
}
```

AUTH_LIMITER allows 20 calls per minute per IP. A full pull of 300 readings is 6 pages, so 내 정보 and a result page sharing the limiter stay well inside it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/app/api apps/web/lib/readings`
Expected: PASS (readings.test 3 tests; the follow-up suites unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/readings apps/web/lib/readings/turns.ts apps/web/lib/api/inputs.ts apps/web/app/api/followup/route.ts
git commit -m "feat(readings): paged account readings, delete, follow-ups saved there too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Account deletion (개인정보 파기)

**Files:**
- Create: `apps/web/lib/account/deletion.ts`, `apps/web/app/api/account/delete-intent/route.ts`
- Modify: `apps/web/app/api/auth/kakao/start/route.ts` (purpose `delete`), `apps/web/app/api/auth/kakao/callback/route.ts` (delete branch, whole file below)
- Test: `apps/web/app/api/account/deletion.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `openAccountRoute`, `requireSession`, `CLEAR_SESSION`, `redirectTo`, `loginKakaoUser`, `userByKakaoKey`.
  - Task 4: `walletSummary`, `forfeitStatements`, `sweepUser`, `reserveUnlock` (tests), `Lot`.
  - Task 5: `issueOAuthState`, `openOAuthState`, `CLEAR_OAUTH`, `kakaoLogin`, `kakaoUnlink`, `kakaoConfigProblems`, `kakaoKey`, `grantSignupGift`, `createSession`.
  - Task 6: `tossClient`, `mockToss`. Task 7: `orderForUser`, `reconcileConfirming`, `OrderRow`, `buy`. Task 8: `refundUnusedOrder`, `reconcileRefunding`.
- Produces:
  - `deletion.ts`:
    - `DELETE_INTENT_TTL_MS`
    - `issueDeleteIntent(sessionId, secret, now): Promise<string>`, `deleteIntentFor(token, sessionId, secret, now): Promise<boolean>`
    - `type DeleteOutcome = {ok: true; refunded: number} | {ok: false; code: "PENDING" | "IN_USE" | "REFUND_FAILED"}`
    - `deleteAccount(db, toss, {userId, now}): Promise<DeleteOutcome>`
    - `eraseDeletedAccount(db, userId, now): Promise<boolean>` (also run by the Cron Trigger, Task 13)
  - `POST /api/account/delete-intent` → `{ url: "/api/auth/kakao/start?purpose=delete&intent=…" }`
  - `GET /api/auth/kakao/start?purpose=delete&intent=…` → Kakao re-check. The callback ends at:
    - `/me?account=deleted` (session cookie cleared), or
    - `/me?delete=failed|mismatch|refund-failed|pending|in-use|cancel|unavailable`.

**Order of the deletion (M3):**
1. Settle what is in flight:
   - this account's stale reservations are swept;
   - its `confirming` orders are looked up at Toss now;
   - its `refunding` orders are reconciled (after their 10-minute wait, Task 8).
2. Refuse while an order is still `confirming` or `refunding` (`pending`), or a reading is being opened (`in-use`). The user tries again later; the page says when.
3. Refund every unopened purchase. Any failure stops here and nothing is deleted.
4. Mark the account deleted with one guarded statement. It runs only if nothing is reserved, no order is in flight and no unopened paid reading is left: a payment that slipped in between makes it `pending`.
   - From this moment nothing is granted, reserved or saved for the account (Tasks 4, 7, 9).
   - A payment that still arrives is cancelled (Task 8).
5. Erase personal data in one batch (`eraseDeletedAccount`). If the worker dies between 4 and 5, the Cron Trigger finishes it (Task 13), and the next login with that Kakao account is refused until then (Task 3).
- The P3 인연 link is out of P4 (scope cut), so deletion touches no P3 table.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/account/deletion.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
import { POST as confirm } from "../pay/confirm/route";
import { POST as ordersPost } from "../pay/orders/route";
import { POST as deleteIntent } from "./delete-intent/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

let ipSeq = 0;
async function loggedIn(name: string): Promise<Browser> {
  const b = browser(`198.51.100.${100 + ++ipSeq}`);
  await loginAs(b, name);
  return b;
}

/** The whole deletion as the 내 정보 page drives it; `kakaoUser` is who re-checks at Kakao. Returns the final redirect. */
async function deleteAs(b: Browser, kakaoUser: string): Promise<string> {
  const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
  const started = await b.send(start, `${url}&mockUser=${kakaoUser}`);
  const location = started.headers.get("location")!;
  if (!location.includes("/api/auth/kakao/callback")) return location;
  return (await b.send(callback, location)).headers.get("location")!;
}

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();
const userIdOf = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;

describe("account deletion", () => {
  it("re-checks with Kakao, refunds unopened purchases, erases personal data and keeps a tombstone", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    const userId = await userIdOf(db);
    const chapter = { kind: "tarot" as const, question: "지울 질문", reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();

    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT kakao_key, nickname, deleted_at, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, deleted_at: T0, erased_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await one(db, "SELECT status, units_left FROM credit_lots WHERE currency = 'free'")).toEqual({ status: "revoked", units_left: 0 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
    expect((await me(b)).user).toBeNull();

    // Joining again with the same Kakao account makes a new account, without a second gift.
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(0);
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 2 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: null });
  });

  it("cannot be started by a link, another session, or another site", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    expect((await alice.send(start, "/api/auth/kakao/start?purpose=delete&mockUser=alice")).headers.get("location")).toBe("http://localhost/me?delete=failed");
    const bob = await loggedIn("bob");
    const { url } = (await (await bob.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect((await alice.send(start, `${url}&mockUser=alice`)).headers.get("location")).toBe("http://localhost/me?delete=failed");
    expect((await alice.send(deleteIntent, "/api/account/delete-intent", { method: "POST" })).status).toBe(403);
    expect((await me(alice)).user).not.toBeNull();
  });

  it("stops when a different Kakao account answers the re-check", async () => {
    useTestDb();
    const b = await loggedIn("alice");
    expect(await deleteAs(b, "mallory")).toBe("http://localhost/me?delete=mismatch");
    expect((await me(b)).user).not.toBeNull();
  });

  it("deletes nothing when a refund is refused", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=refund-failed");
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("waits while a payment is still being confirmed", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    mockToss.failNext("confirm", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    expect((await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_busy", orderId, amount: 2900 }, origin: true })).status).toBe(409);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=pending");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("waits while a reading is being opened", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "free", units: 10, now: T0 });
    expect(reserved.ok).toBe(true);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=in-use");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/account/deletion.test.ts`
Expected: FAIL (`./delete-intent/route` not found).

- [ ] **Step 3: Write `apps/web/lib/account/deletion.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { forfeitStatements, sweepUser, walletSummary, type Lot } from "@/lib/pay/ledger";
import { orderForUser, reconcileConfirming, type OrderRow } from "@/lib/pay/orders";
import { reconcileRefunding, refundUnusedOrder } from "@/lib/pay/refunds";
import type { TossClient } from "@/lib/pay/tossTypes";
import { signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";

/** How long the deletion intent from 내 정보 is good for. */
export const DELETE_INTENT_TTL_MS = 5 * 60 * 1000;

interface DeleteIntentPayload extends SignedPayload {
  k: "delete-intent";
  sid: string;
  exp: number;
}

/**
 * A 5-minute token naming the session that asked to delete its account. Only a same-origin POST
 * hands one out, so a link from another site can never start a deletion (spec 5.8).
 */
export function issueDeleteIntent(sessionId: string, secret: string, now: number): Promise<string> {
  const payload: DeleteIntentPayload = { k: "delete-intent", sid: sessionId, exp: now + DELETE_INTENT_TTL_MS };
  return signToken(payload, secret);
}

export async function deleteIntentFor(token: string | null, sessionId: string, secret: string, now: number): Promise<boolean> {
  const payload = await verifyToken<DeleteIntentPayload>(token, "delete-intent", secret, now);
  return payload?.sid === sessionId;
}

export type DeleteOutcome = { ok: true; refunded: number } | { ok: false; code: "PENDING" | "IN_USE" | "REFUND_FAILED" };

const IN_FLIGHT = "('confirming', 'refunding')";

async function count(db: D1Binding, sql: string, userId: string): Promise<number> {
  return (await db.prepare(sql).bind(userId).first<{ n: number }>())?.n ?? 0;
}

/**
 * 회원 탈퇴 (spec 5.8, M3): settle what is in flight, refuse while anything still is, refund every
 * unopened purchase, mark the account deleted with one guarded statement, then erase.
 */
export async function deleteAccount(db: D1Binding, toss: TossClient | null, input: { userId: string; now: number }): Promise<DeleteOutcome> {
  const { userId, now } = input;
  await sweepUser(db, userId, now);
  if (toss) {
    const { results } = await db.prepare(`SELECT * FROM orders WHERE user_id = ? AND status IN ${IN_FLIGHT}`).bind(userId).all<OrderRow>();
    for (const order of results) {
      if (order.status === "confirming") await reconcileConfirming(db, toss, order, now, { force: true });
      else await reconcileRefunding(db, toss, order, now);
    }
  }
  if (await count(db, `SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN ${IN_FLIGHT}`, userId)) return { ok: false, code: "PENDING" };
  if (await count(db, "SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND status = 'reserved'", userId)) return { ok: false, code: "IN_USE" };

  const wallet = await walletSummary(db, userId, now);
  let refunded = 0;
  for (const { orderId } of wallet.unused) {
    const order = await orderForUser(db, orderId, userId);
    const outcome = order && toss ? await refundUnusedOrder(db, toss, { order, reason: "회원 탈퇴: 열지 않은 풀이 환불", now }) : null;
    if (!outcome?.ok) {
      console.warn(JSON.stringify({ evt: "account.delete_refund_failed", orderId }));
      return { ok: false, code: outcome && !outcome.ok && outcome.code === "PAY_PENDING" ? "PENDING" : "REFUND_FAILED" };
    }
    refunded++;
  }

  // One guarded statement: nothing reserved, nothing in flight, no unopened paid reading left.
  const marked = await db
    .prepare(
      `UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM unlocks WHERE user_id = ? AND status = 'reserved')
         AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = ? AND status IN ${IN_FLIGHT})
         AND NOT EXISTS (SELECT 1 FROM credit_lots WHERE user_id = ? AND currency = 'paid' AND status = 'active' AND units_left > 0 AND units_left = units_total)
       RETURNING id`,
    )
    .bind(now, userId, userId, userId, userId)
    .first();
  if (!marked) {
    const inUse = await count(db, "SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND status = 'reserved'", userId);
    return { ok: false, code: inUse ? "IN_USE" : "PENDING" };
  }
  await eraseDeletedAccount(db, userId, now);
  console.info(JSON.stringify({ evt: "account.deleted", refunded }));
  return { ok: true, refunded };
}

const DELETED = "EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NOT NULL)";

/**
 * Erases a deleted account's personal data in one batch, keeping what the law keeps:
 * - the remaining 별조각 are forfeited (their ledger rows stay);
 * - saved readings and sessions are deleted;
 * - its gift claim is stamped with the deletion time (purged a year later, Task 13);
 * - orders that never reached Toss are closed;
 * - kakao_key and nickname are blanked and erased_at set.
 * Orders, payments, lots and the ledger stay 5 years under the tombstone (전자상거래법 제6조).
 * Idempotent; only for an account already marked deleted. True when this call erased it.
 */
export async function eraseDeletedAccount(db: D1Binding, userId: string, now: number): Promise<boolean> {
  const { results: freeLots } = await db
    .prepare("SELECT * FROM credit_lots WHERE user_id = ? AND currency = 'free' AND status = 'active' AND units_left > 0")
    .bind(userId)
    .all<Lot>();
  const results = await db.batch([
    ...freeLots.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)),
    db.prepare(`DELETE FROM readings WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db
      .prepare(`UPDATE gift_claims SET account_deleted_at = ? WHERE kakao_key = (SELECT kakao_key FROM users WHERE id = ? AND deleted_at IS NOT NULL)`)
      .bind(now, userId),
    db
      .prepare(`UPDATE orders SET status = 'failed', fail_code = 'ACCOUNT_DELETED', updated_at = ? WHERE user_id = ? AND status = 'created' AND ${DELETED}`)
      .bind(now, userId, userId),
    db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, erased_at = ? WHERE id = ? AND deleted_at IS NOT NULL AND erased_at IS NULL").bind(now, userId),
  ]);
  return results[results.length - 1]?.meta?.changes === 1;
}
```

The `NOT EXISTS` on unopened paid lots matches `units_left = units_total`: a lot of a reading already opened (0 left) does not block deletion.

- [ ] **Step 4: Write `apps/web/app/api/account/delete-intent/route.ts`**

```ts
import { issueDeleteIntent } from "@/lib/account/deletion";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { json } from "@/lib/api/http";

/** POST (our own pages only) → the URL that starts the Kakao re-check for deleting this account. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const intent = await issueDeleteIntent(session.id, ctx.secret, ctx.now);
  return json({ url: `/api/auth/kakao/start?purpose=delete&intent=${encodeURIComponent(intent)}` });
}
```

- [ ] **Step 5: Accept the delete purpose in `apps/web/app/api/auth/kakao/start/route.ts`.** Right after the `kakaoConfigProblems` check, and before the `loginOpen` check, insert the block below. A deletion is always allowed, whatever STARLOG_PAYMENTS says. Move the `loginOpen` check below this block.

```ts
  if (url.searchParams.get("purpose") === "delete") {
    // Only with the intent a same-origin POST handed to this very session.
    if (!ctx.session || !(await deleteIntentFor(url.searchParams.get("intent"), ctx.session.id, ctx.secret, ctx.now))) {
      return redirectTo(request, "/me", { delete: "failed" });
    }
    const { state, cookie } = await issueOAuthState({ returnTo: "/me", purpose: "delete", age: false, sid: ctx.session.id }, ctx.secret, ctx.now);
    const target =
      kakaoMode() === "mock"
        ? `/api/auth/kakao/callback?code=${encodeURIComponent(MOCK_CODE_PREFIX + (url.searchParams.get("mockUser") ?? `e2e${randomId(6)}`))}&state=${state}`
        : authorizeUrl(state);
    return redirectTo(request, target, {}, [cookie]);
  }
```

Import `deleteIntentFor` from `@/lib/account/deletion`. The `kakaoConfigProblems` check must run first, so a deletion without Kakao keys ends at `?login=unavailable` on `/`.

- [ ] **Step 6: Replace `apps/web/app/api/auth/kakao/callback/route.ts`** with the version that also handles deletion. It keeps every login rule from Task 5.

```ts
import type { CookieSpec } from "@/lib/api/http";
import { deleteAccount } from "@/lib/account/deletion";
import { KakaoError, kakaoConfigProblems, kakaoLogin, kakaoUnlink } from "@/lib/account/kakao";
import { CLEAR_OAUTH, OAUTH_COOKIE, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute, type AccountContext } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { CLEAR_SESSION, createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser, userByKakaoKey } from "@/lib/account/users";
import { SITE } from "@/lib/config";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";

type Back = (flag: string, cookies?: Array<CookieSpec | string>) => Response;

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's sl_oauth cookie,
 * and the Kakao settings are checked again before the code is used.
 * - login: find the account, or create one while sales are open for this device (paused: existing
 *   accounts only, else ?login=closed). While sales are open the signup gift is tried on every login
 *   (once per Kakao account). Start a session and return with ?login=ok|cancel|failed.
 * - delete: the same Kakao account as the session must answer. Then deleteAccount() settles,
 *   refunds and erases, the app is unlinked from Kakao, and we land on /me?account=deleted (spec 5.8).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [CLEAR_OAUTH]);
  const intent = await openOAuthState(ctx.cookies[OAUTH_COOKIE], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent) return redirectTo(request, "/", { login: "failed" }, [CLEAR_OAUTH]);
  const deleting = intent.purpose === "delete";
  const back: Back = (flag, cookies = []) =>
    deleting
      ? redirectTo(request, "/me", { delete: flag }, [CLEAR_OAUTH, ...cookies])
      : redirectTo(request, intent.returnTo, { login: flag }, [CLEAR_OAUTH, ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const problems = kakaoConfigProblems();
  if (problems.length) {
    console.error(JSON.stringify({ evt: "config.kakao_invalid", problems }));
    return back("unavailable");
  }

  let login: Awaited<ReturnType<typeof kakaoLogin>>;
  try {
    login = await kakaoLogin(code);
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.kakao_failed", step: error instanceof KakaoError ? error.step : "unknown", status: error instanceof KakaoError ? error.status : 0 }));
    return back("failed");
  }
  const key = await kakaoKey(login.profile.id, ctx.accountSecret);
  return deleting ? finishDelete(request, ctx, intent.sid, key, login.accessToken, back) : finishLogin(ctx, key, login.profile.nickname, intent.age, back);
}

async function finishLogin(ctx: AccountContext, key: string, nickname: string, age: boolean, back: Back): Promise<Response> {
  const open = salesOpen(paymentsMode(), ctx.owner);
  if (!open && !(await userByKakaoKey(ctx.db, key))) return back("closed");
  const account = await loginKakaoUser(ctx.db, { key, nickname, ageConfirmed: age, now: ctx.now });
  if (!account) {
    console.warn(JSON.stringify({ evt: "auth.account_still_erasing" }));
    return back("failed");
  }
  const { user, created } = account;
  const gifted = open ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, units: SITE.price.signupGiftFree, now: ctx.now }) : false;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", created, gifted }));
  return back("ok", [session.cookie]);
}

async function finishDelete(request: Request, ctx: AccountContext, sid: string | undefined, key: string, accessToken: string, back: Back): Promise<Response> {
  if (!ctx.session || ctx.session.id !== sid) return back("failed");
  if (ctx.session.user.kakao_key !== key) return back("mismatch");
  const outcome = await deleteAccount(ctx.db, tossClient(), { userId: ctx.session.user.id, now: ctx.now });
  if (!outcome.ok) return back(outcome.code === "PENDING" ? "pending" : outcome.code === "IN_USE" ? "in-use" : "refund-failed");
  if (!(await kakaoUnlink(accessToken))) console.warn(JSON.stringify({ evt: "auth.kakao_unlink_failed" }));
  return redirectTo(request, "/me", { account: "deleted" }, [CLEAR_OAUTH, CLEAR_SESSION]);
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api`
Expected: PASS (deletion.test 6 tests; auth.test still 11).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account/deletion.ts apps/web/app/api/account apps/web/app/api/auth/kakao/start/route.ts apps/web/app/api/auth/kakao/callback/route.ts
git commit -m "feat(account): deletion after a Kakao re-check; settle in-flight payments, refund, mark, erase" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Scheduled maintenance (Cron Trigger)

**Files:**
- Create: `apps/web/lib/pay/maintenance.ts`, `apps/web/app/api/internal/maintenance/route.ts`, `apps/web/worker.mjs`
- Modify: `apps/web/wrangler.jsonc` (`main`, `triggers`), `apps/web/.env.example` (already lists `STARLOG_CRON_SECRET`, Task 2)
- Test: `apps/web/app/api/internal/maintenance/maintenance.test.ts`

**Interfaces:**
- Consumes:
  - Task 4: `sweepStale`. Task 7: `reconcileConfirming`, `RECONCILE_AFTER_MS`, `OrderRow`.
  - Task 8: `reconcileRefunding`, `REFUND_RECONCILE_AFTER_MS`. Task 12: `eraseDeletedAccount`.
  - `accountDb`, `tossClient`, `safeEqual`, `json`, `errorResponse`.
- Produces:
  - `maintenance.ts`:
    - `GIFT_CLAIM_KEEP_MS` (365 days), `RECORD_KEEP_MS` (5 years and a day of margin, 1,827 days)
    - `interface MaintenanceReport { confirming; refunding; released; expired; erased; sessions; giftClaims; purgedAccounts }`
    - `runMaintenance(db, toss, now): Promise<MaintenanceReport>`
  - `POST /api/internal/maintenance` with `Authorization: Bearer <STARLOG_CRON_SECRET>` → the report. 403 for anyone else; 503 without the secret or D1.
  - `apps/web/worker.mjs`: OpenNext's `fetch` plus `scheduled`, which calls the route above through the app's own fetch handler.
  - Cron: `*/10 * * * *`.

**Why a route instead of importing the work into `worker.mjs`:**
- The app code imports `server-only`. That package throws outside the react-server build condition, which a hand-written worker entry is not bundled under.
- Calling `handler.fetch()` with an internal request runs the work through the same Next bundle, bindings and env as any request.
- The bearer secret keeps it private, and the work is the same code the request paths already use.

**What a run does (each step bounded, so one run stays well inside the Workers time limit):**
1. Up to 50 `confirming` orders older than 30 s: `reconcileConfirming` (Toss look-up).
2. Up to 50 `refunding` orders older than 10 minutes: `reconcileRefunding`. This covers refunds whose answer was lost and payments for deleted accounts (orphans).
3. `sweepStale`: every account's stale reservations back, expired 별조각 out (100 each).
4. Up to 50 accounts marked deleted but not erased (a deletion cut short): `eraseDeletedAccount`.
5. Purges (minors 3 and 11):
   - expired or revoked sessions (500 per run);
   - gift claims whose account was deleted more than a year ago (500 per run);
   - erased accounts with no order younger than 5 years: their ledger, unlocks, lots, payments, orders and tombstone (20 per run). Live accounts keep their history. Their gift claim follows its own one-year rule.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/internal/maintenance/maintenance.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS, reserveUnlock } from "@/lib/pay/ledger";
import { GIFT_CLAIM_KEEP_MS, RECORD_KEEP_MS } from "@/lib/pay/maintenance";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as confirm } from "../../pay/confirm/route";
import { POST as ordersPost } from "../../pay/orders/route";
import { POST as refund } from "../../pay/refund/route";
import { POST as maintenance } from "./route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MIN = 60_000;
const CRON = "cron-secret-for-tests-0123456789abcdef";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_CRON_SECRET", CRON);
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const run = (token: string | null = CRON) =>
  maintenance(new Request("https://starlog.yeolmaeapps.kr/api/internal/maintenance", { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` } }));
const report = async () => (await (await run()).json()) as Record<string, number>;
const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

async function loggedIn(name = "alice", ip = "198.51.100.40"): Promise<Browser> {
  const b = browser(ip);
  await loginAs(b, name);
  return b;
}

async function newOrder(b: Browser): Promise<string> {
  return ((await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string }).orderId;
}

describe("the Cron Trigger's route", () => {
  it("runs only for the Cron Trigger's bearer secret", async () => {
    useTestDb();
    expect((await run(null)).status).toBe(403);
    expect((await run("wrong-secret-0123456789abcdef-0123")).status).toBe(403);
    expect((await run()).status).toBe(200);
    vi.stubEnv("STARLOG_CRON_SECRET", "");
    expect((await run()).status).toBe(503);
  });
});

describe("maintenance", () => {
  it("settles a payment Toss approved while nobody was asking", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""), { applied: true });
    expect((await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_left", orderId, amount: 2900 }, origin: true })).status).toBe(409);
    vi.setSystemTime(T0 + 31_000);
    expect(await report()).toMatchObject({ confirming: 1 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("puts back a refund Toss never did, and retries a deleted account's payment until it is cancelled", async () => {
    const db = useTestDb();
    const alice = await loggedIn("alice");
    const refunded = await buy(alice);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", ""));
    expect((await alice.send(refund, "/api/pay/refund", { body: { orderId: refunded }, origin: true })).status).toBe(409);

    const bob = await loggedIn("bob", "198.51.100.41");
    const orphan = await newOrder(bob);
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = (SELECT user_id FROM orders WHERE id = ?)").bind(T0, orphan).run();
    mockToss.failNext("cancel", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""));
    expect((await browser("192.0.2.90").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_orphan", orderId: orphan, amount: 2900 }, origin: true })).status).toBe(402);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orphan).first()).toEqual({ status: "refunding" });

    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await report()).toMatchObject({ refunding: 2 });
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(refunded).first()).toEqual({ status: "paid", cancel_attempt: 2 });
    expect((await me(alice)).user?.unused).toEqual([{ orderId: refunded, productId: "tarot" }]);
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orphan).first()).toEqual({ status: "refunded", cancel_attempt: 2 });
    expect((await mockToss.getPaymentByOrder(orphan)).status).toBe("CANCELED");
  });

  it("returns any account's stale reservation", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    expect((await reserveUnlock(db, { userId, productId: "tarot", currency: "free", units: 10, now: T0 })).ok).toBe(true);
    vi.setSystemTime(T0 + RESERVATION_MS + 1);
    expect(await report()).toMatchObject({ released: 1 });
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect((await me(b)).user?.stardust).toBe(10);
  });

  it("finishes an erase that a deletion did not", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    await buy(b);
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    const chapter = { kind: "tarot" as const, reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(T0, userId).run();
    expect(await report()).toMatchObject({ erased: 1 });
    expect(await one(db, "SELECT kakao_key, nickname, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, erased_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
  });

  it("purges sessions, year-old gift claims of deleted accounts, and records past five years", async () => {
    const db = useTestDb();
    await loggedIn("alice");
    await db.batch([
      db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at, deleted_at, erased_at) VALUES ('u_old', NULL, NULL, 'c_old', 0, 0, 1, 1)"),
      db.prepare("INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at) VALUES ('order_old_000000000000001', 'u_old', 'tarot', 2900, 'x', 'paid', '/', 0, ?, ?)").bind(T0 - RECORD_KEEP_MS - 1, T0 - RECORD_KEEP_MS - 1),
      db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_old', 'order_old_000000000000001', 2900, 'DONE', 'live', 0)"),
      db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at, deleted_at, erased_at) VALUES ('u_recent', NULL, NULL, 'c_recent', 0, 0, 1, 1)"),
      db.prepare("INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at) VALUES ('order_recent_00000000001', 'u_recent', 'tarot', 2900, 'x', 'refunded', '/', 0, ?, ?)").bind(T0 - 1000, T0 - 1000),
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k_gone', 0, ?)").bind(T0 - GIFT_CLAIM_KEEP_MS - 1),
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k_kept', 0, ?)").bind(T0 - 1000),
      db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('s_old', 'u_recent', 0, ?)").bind(T0 - 1),
    ]);
    expect(await report()).toMatchObject({ sessions: 1, giftClaims: 1, purgedAccounts: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM payments WHERE payment_key = 'pk_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_recent'")).toEqual({ n: 1 });
    expect((await db.prepare("SELECT kakao_key FROM gift_claims ORDER BY kakao_key").all<{ kakao_key: string }>()).results.map((r) => r.kakao_key)).toEqual(expect.arrayContaining(["k_kept"]));
    expect(await one(db, "SELECT COUNT(*) AS n FROM gift_claims WHERE kakao_key = 'k_gone'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE nickname IS NOT NULL")).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/internal/maintenance/maintenance.test.ts`
Expected: FAIL (`./route` and `@/lib/pay/maintenance` not found).

- [ ] **Step 3: Write `apps/web/lib/pay/maintenance.ts`**

```ts
import "server-only";
import { eraseDeletedAccount } from "@/lib/account/deletion";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { sweepStale } from "./ledger";
import { RECONCILE_AFTER_MS, reconcileConfirming, type OrderRow } from "./orders";
import { REFUND_RECONCILE_AFTER_MS, reconcileRefunding } from "./refunds";
import type { TossClient } from "./tossTypes";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A deleted account's gift claim is kept this long (no second signup gift), then purged. */
export const GIFT_CLAIM_KEEP_MS = 365 * DAY_MS;
/** 전자상거래법 제6조: contract, withdrawal and payment records 5 years (plus a day of margin). */
export const RECORD_KEEP_MS = 1827 * DAY_MS;
const ORDERS_PER_RUN = 50;
const ERASES_PER_RUN = 50;
const PURGES_PER_RUN = 20;
const ROWS_PER_PURGE = 500;

export interface MaintenanceReport {
  confirming: number;
  refunding: number;
  released: number;
  expired: number;
  erased: number;
  sessions: number;
  giftClaims: number;
  purgedAccounts: number;
}

/** Everything an erased account still has, for when its last order is older than RECORD_KEEP_MS. */
function purgeStatements(db: D1Binding, userId: string): D1Statement[] {
  return [
    db.prepare("DELETE FROM ledger WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM unlocks WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM credit_lots WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)").bind(userId),
    db.prepare("DELETE FROM orders WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ? AND erased_at IS NOT NULL").bind(userId),
  ];
}

/**
 * The Cron Trigger's work, every 10 minutes (worker.mjs → /api/internal/maintenance): settle what
 * users left behind and purge what is past its keeping. Each step is bounded; whatever is left over
 * goes in the next run. Toss steps are skipped when payments are not configured.
 */
export async function runMaintenance(db: D1Binding, toss: TossClient | null, now: number): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { confirming: 0, refunding: 0, released: 0, expired: 0, erased: 0, sessions: 0, giftClaims: 0, purgedAccounts: 0 };
  if (toss) {
    const confirming = await db
      .prepare("SELECT * FROM orders WHERE status = 'confirming' AND updated_at < ? ORDER BY updated_at LIMIT ?")
      .bind(now - RECONCILE_AFTER_MS, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of confirming.results) {
      await reconcileConfirming(db, toss, order, now);
      report.confirming++;
    }
    const refunding = await db
      .prepare("SELECT * FROM orders WHERE status = 'refunding' AND updated_at < ? ORDER BY updated_at LIMIT ?")
      .bind(now - REFUND_RECONCILE_AFTER_MS, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of refunding.results) {
      await reconcileRefunding(db, toss, order, now);
      report.refunding++;
    }
  }
  const swept = await sweepStale(db, now);
  report.released = swept.released;
  report.expired = swept.expired;

  const unerased = await db.prepare("SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL LIMIT ?").bind(ERASES_PER_RUN).all<{ id: string }>();
  for (const { id } of unerased.results) if (await eraseDeletedAccount(db, id, now)) report.erased++;

  report.sessions =
    (await db.prepare("DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL LIMIT ?)").bind(now, ROWS_PER_PURGE).run()).meta?.changes ?? 0;
  report.giftClaims =
    (await db
      .prepare("DELETE FROM gift_claims WHERE kakao_key IN (SELECT kakao_key FROM gift_claims WHERE account_deleted_at < ? LIMIT ?)")
      .bind(now - GIFT_CLAIM_KEEP_MS, ROWS_PER_PURGE)
      .run()).meta?.changes ?? 0;
  const purgeable = await db
    .prepare(
      `SELECT id FROM users u WHERE erased_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.created_at >= ?)
       LIMIT ?`,
    )
    .bind(now - RECORD_KEEP_MS, PURGES_PER_RUN)
    .all<{ id: string }>();
  for (const { id } of purgeable.results) {
    await db.batch(purgeStatements(db, id));
    report.purgedAccounts++;
  }
  return report;
}
```

- [ ] **Step 4: Write `apps/web/app/api/internal/maintenance/route.ts`**

```ts
import { errorResponse, json } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { runMaintenance } from "@/lib/pay/maintenance";
import { tossClient } from "@/lib/pay/toss";
import { safeEqual } from "@/lib/security/sign";

/**
 * POST with `Authorization: Bearer <STARLOG_CRON_SECRET>` → the maintenance report. Called by the
 * Cron Trigger every 10 minutes (apps/web/worker.mjs). Anyone else gets 403; a deploy without the
 * secret (32+ characters) or D1 gets 503.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STARLOG_CRON_SECRET?.trim() ?? "";
  if (secret.length < 32) return errorResponse("PAY_UNAVAILABLE");
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !(await safeEqual(given, secret, secret))) return errorResponse("FORBIDDEN");
  const db = accountDb();
  if (!db) return errorResponse("PAY_UNAVAILABLE");
  const report = await runMaintenance(db, tossClient(), Date.now());
  console.info(JSON.stringify({ evt: "cron.maintenance", ...report }));
  return json(report);
}
```

- [ ] **Step 5: Write `apps/web/worker.mjs`** (the custom OpenNext entry, opennext.js.org/cloudflare/howtos/custom-worker)

```js
// The Worker entry: OpenNext's generated handler for every request, plus the Cron Trigger.
// `.open-next/worker.js` exists after `pnpm cf:build`. The app has no Durable Object caches
// (open-next.config.ts), so nothing else needs re-exporting from it.
import handler from "./.open-next/worker.js";

/** Same host as SITE.url; the request never leaves the Worker (it goes straight to handler.fetch). */
const MAINTENANCE_URL = "https://starlog.yeolmaeapps.kr/api/internal/maintenance";

export default {
  fetch: handler.fetch,

  /**
   * Every 10 minutes (wrangler.jsonc triggers.crons): settle stale payments and refunds, return
   * stale reservations, finish erasures and purge old records (lib/pay/maintenance.ts). It goes
   * through the app's own route so it runs with the same bundle, bindings and env as a request.
   */
  async scheduled(_controller, env, ctx) {
    const secret = env.STARLOG_CRON_SECRET;
    if (!secret) {
      console.error(JSON.stringify({ evt: "cron.no_secret" }));
      return;
    }
    const request = new Request(MAINTENANCE_URL, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then((response) => {
        if (!response.ok) console.error(JSON.stringify({ evt: "cron.maintenance_failed", status: response.status }));
      }),
    );
  },
};
```

- [ ] **Step 6: Point Wrangler at it.** In `apps/web/wrangler.jsonc`:
  - change `"main": ".open-next/worker.js"` to `"main": "worker.mjs"`, with this comment above it: `// worker.mjs wraps OpenNext's .open-next/worker.js and adds the Cron Trigger (lib/pay/maintenance.ts).`;
  - add, after `"workers_dev": true,`:

```jsonc
  // Every 10 minutes: settle stale payments and refunds, stale reservations, unfinished erasures and
  // old records (worker.mjs → /api/internal/maintenance, guarded by STARLOG_CRON_SECRET).
  "triggers": { "crons": ["*/10 * * * *"] },
```

`pnpm cf:build` still writes `.open-next/worker.js`; Wrangler bundles `worker.mjs` with it on deploy. The controller checks it once with `pnpm cf:build` and `npx wrangler deploy --dry-run --outdir .wrangler/dry` from `apps/web`: the bundle must build and the dry run must list the cron schedule. If OpenNext's deploy command refuses a custom `main`, report it. The runbook's fallback is to deploy with `npx wrangler deploy` directly after `pnpm cf:build`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api/internal apps/web/lib/pay`
Expected: PASS (maintenance.test: 6 tests).

Run: `pnpm typecheck`
Expected: exit 0 (`worker.mjs` is not in the TypeScript program).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/pay/maintenance.ts apps/web/app/api/internal apps/web/worker.mjs apps/web/wrangler.jsonc
git commit -m "feat(pay): Cron Trigger maintenance for stale payments, refunds, reservations, erasures and purges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client account layer, unlock offers, error copy, UnlockSheet

**Files:**
- Create: `apps/web/lib/account/client.ts`, `apps/web/lib/pay/offer.ts`
- Modify: `apps/web/lib/reading/api.ts` (error codes), `apps/web/lib/reading/errors.ts` (copy), `apps/web/components/tarot/UnlockSheet.tsx`, `apps/web/components/tarot/UnlockSheet.module.css` (`.price`, `.links`)
- Test: `apps/web/lib/pay/offer.test.ts`, `apps/web/lib/account/client.test.ts`, `apps/web/lib/reading/errors.p4.test.ts`, `apps/web/components/tarot/UnlockSheet.test.tsx`

**Interfaces:**
- Consumes: the `/api/me` and `/api/auth/logout` shapes (Task 5; the tests mock them, so this task does not wait for it); `Product`, `standardProduct`, `StandardProductId`, `UnlockMethod` (Task 2); `getJson` (already in `lib/reading/api.ts` at aa70830); `SITE`, `won`, `times`; `Button`.
- Produces:
  - `client.ts` (browser):
    - `interface AccountUser { nickname; stardust; stardustExpiresAt: string | null; unused: Array<{orderId; productId}> }`, `interface AccountState { payments; login; owner; user: AccountUser | null }`
    - `parseAccount(v): AccountState | null`, `refreshAccount(fetchImpl?): Promise<AccountState | null>`
    - `useAccount(): AccountState | null | undefined` (undefined until loaded, null if it failed)
    - `loginHref(returnTo): string`, `logout(fetchImpl?): Promise<boolean>`
    - `loginMessage(flag: string | null): string | null`, `resetAccountForTests()`
  - `offer.ts` (pure):
    - `type UnlockOffer = {mode: "opening"; login: boolean} | {mode: "login"; priceKrw; giftUnits} | {mode: "open-paid"; orderId} | {mode: "stardust"; units; balance; priceKrw} | {mode: "pay"; priceKrw}`
    - `unlockOffer(account, product, giftUnits): UnlockOffer`, `checkoutHref(productId, returnTo): string`
  - `api.ts`:
    - `ApiErrorCode` gains `LOGIN_REQUIRED`, `PAYMENT_REQUIRED`, `NO_CREDIT`, `PAY_FAILED`, `FORBIDDEN`, `NOT_AVAILABLE`, `PAY_PENDING`, `NOT_REFUNDABLE`, `PAY_UNAVAILABLE` (also added to `CODES`)
  - `errors.ts`:
    - `ErrorContext` gains `"paid"` and `"stardust"`;
    - `CREDIT_CHECKING: ErrorView`, `creditKept(context): ErrorView`, `creditUnknown(context): ErrorView` (M4)
  - `UnlockSheet` gains these optional props, so a caller without them keeps today's 오픈 기념 sheet exactly:
    - `offer` (default `{mode: "opening", login: false}`), `onUnlock(method: UnlockMethod)`;
    - `loginHref`, `payHref`, `owner`, `refundHref`.

**Copy rules (M4, M9):**
- After a paid or 별조각 reading fails mid-way (QUALITY, UPSTREAM, TIMEOUT, INVALID, NETWORK, or a 5xx with an unknown code), nobody yet knows whether the save landed. So the first thing shown is `CREDIT_CHECKING` ("풀이가 열렸는지 확인하고 있어요"), never "그대로 남아 있어요".
- Task 15 then checks the account:
  - the reading was delivered → it opens;
  - the credit is still there → `creditKept`;
  - neither is known yet → `creditUnknown`, which promises nothing it has not seen.
- Errors refused before any reservation (login, no credit, budget, limits, a bad request) say so plainly.
- No "베타" anywhere. The free daily full reading keeps today's wording: "오픈 기념으로 하루 N번 무료예요" (`SITE.beta.fullPerDay`; the config key is internal and is not renamed here).

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/pay/offer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AccountState, AccountUser } from "@/lib/account/client";
import { standardProduct } from "./catalog";
import { checkoutHref, unlockOffer } from "./offer";

const tarot = standardProduct("tarot");
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, login: true, owner: false, user: null, ...over });
const user = (over: Partial<AccountUser> = {}): AccountUser => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], ...over });

describe("unlock offer", () => {
  it("keeps the 오픈 기념 reading while sales are closed for this device and nothing is held", () => {
    expect(unlockOffer(undefined, tarot, 10)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(null, tarot, 10)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ payments: false, login: false }), tarot, 10)).toEqual({ mode: "opening", login: false });
  });

  it("while sales are paused, offers buyers a quiet way to log in", () => {
    expect(unlockOffer(account({ payments: false, login: true }), tarot, 10)).toEqual({ mode: "opening", login: true });
  });

  it("asks a guest to log in once sales are open", () => {
    expect(unlockOffer(account(), tarot, 10)).toEqual({ mode: "login", priceKrw: 2900, giftUnits: 10 });
  });

  it("opens a purchase first, then 별조각, then asks to pay", () => {
    expect(unlockOffer(account({ user: user({ stardust: 10, unused: [{ orderId: "o1", productId: "tarot" }] }) }), tarot, 10)).toEqual({ mode: "open-paid", orderId: "o1" });
    expect(unlockOffer(account({ user: user({ stardust: 10 }) }), tarot, 10)).toEqual({ mode: "stardust", units: 10, balance: 10, priceKrw: 2900 });
    expect(unlockOffer(account({ user: user({ stardust: 9 }) }), tarot, 10)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("does not count a purchase of the other reading", () => {
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "saju" }] }) }), tarot, 10)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("lets held credit open a reading after sales close", () => {
    expect(unlockOffer(account({ payments: false, user: user({ stardust: 10 }) }), tarot, 10)).toMatchObject({ mode: "stardust" });
    expect(unlockOffer(account({ payments: false, user: user() }), tarot, 10)).toEqual({ mode: "opening", login: false });
  });

  it("links the checkout with the product and the way back", () => {
    expect(checkoutHref("saju", "/saju/chart")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart");
  });
});
```

`apps/web/lib/account/client.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { loginHref, loginMessage, parseAccount, refreshAccount, resetAccountForTests } from "./client";

afterEach(() => resetAccountForTests());

describe("account client", () => {
  it("reads /api/me and refuses odd shapes", () => {
    const body = { payments: true, login: true, owner: false, user: { nickname: "별", stardust: 10, stardustExpiresAt: "2026-12-30T14:59:59.999Z", unused: [{ orderId: "o1", productId: "tarot" }] } };
    expect(parseAccount(body)).toEqual(body);
    expect(parseAccount({ payments: false, login: false, owner: false, user: null })).toEqual({ payments: false, login: false, owner: false, user: null });
    expect(parseAccount({ payments: "yes" })).toBeNull();
    expect(parseAccount({ payments: true, login: true, owner: false, user: { nickname: 1 } })).toBeNull();
  });

  it("asks /api/me once for many callers, and treats a failure as unknown", async () => {
    let calls = 0;
    const ok = (async () => {
      calls++;
      return Response.json({ payments: true, login: true, owner: false, user: null });
    }) as typeof fetch;
    const [a, b] = await Promise.all([refreshAccount(ok), refreshAccount(ok)]);
    expect(calls).toBe(1);
    expect(a).toEqual({ payments: true, login: true, owner: false, user: null });
    expect(b).toBe(a);
    const down = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await refreshAccount(down)).toBeNull();
  });

  it("builds the login link and the messages for ?login=", () => {
    expect(loginHref("/tarot/result")).toBe("/login?next=%2Ftarot%2Fresult");
    expect(loginMessage("ok")).toBeNull();
    expect(loginMessage(null)).toBeNull();
    expect(loginMessage("cancel")).toBe("로그인을 취소했어요");
    expect(loginMessage("failed")).toBe("로그인하지 못했어요. 다시 시도해 주세요.");
    expect(loginMessage("closed")).toBe("지금은 새로 가입할 수 없어요");
    expect(loginMessage("unavailable")).toBe("지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.");
    expect(loginMessage("busy")).toBe("요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.");
  });
});
```

`apps/web/lib/reading/errors.p4.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseApiError } from "./api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError } from "./errors";

describe("P4 error copy", () => {
  it("knows the P4 codes", () => {
    expect(parseApiError(401, { code: "LOGIN_REQUIRED" }).code).toBe("LOGIN_REQUIRED");
    expect(parseApiError(402, { code: "NO_CREDIT" }).code).toBe("NO_CREDIT");
    expect(parseApiError(409, { code: "PAY_PENDING" }).code).toBe("PAY_PENDING");
  });

  it("never says a failed paid or 별조각 reading kept its credit before the account was checked", () => {
    for (const context of ["paid", "stardust"] as const) {
      for (const error of [
        { code: "UPSTREAM" as const, status: 502 },
        { code: "QUALITY" as const, status: 502 },
        { code: "NETWORK" as const, status: 0 },
        { code: "TIMEOUT" as const, status: 0 },
        { code: "INVALID" as const, status: 502 },
      ]) {
        const view = describeApiError(error, context);
        expect(view).toEqual(CREDIT_CHECKING);
        expect(`${view.title} ${view.body ?? ""}`).not.toMatch(/그대로/);
      }
    }
  });

  it("says what the check found", () => {
    expect(creditKept("paid")).toMatchObject({ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요.", action: "retry" });
    expect(creditKept("stardust").body).toBe("별조각은 그대로예요. 한 번 더 시도해 주세요.");
    for (const context of ["paid", "stardust"] as const) expect(`${creditUnknown(context).title} ${creditUnknown(context).body}`).not.toMatch(/그대로/);
  });

  it("shows Toss's own message for a declined payment", () => {
    expect(describeApiError({ code: "PAY_FAILED", status: 402, message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." })).toMatchObject({ title: "결제를 마치지 못했어요", body: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    expect(describeApiError({ code: "NO_CREDIT", status: 402 }).title).toBe("쓸 수 있는 결제한 풀이나 별조각이 없어요");
  });
});
```

`apps/web/components/tarot/UnlockSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnlockSheet } from "./UnlockSheet";

afterEach(cleanup);

const base = { kind: "tarot" as const, remaining: undefined, loginHref: "/login?next=%2Ftarot%2Fresult", payHref: "/pay/checkout?product=tarot&returnTo=%2Ftarot%2Fresult" };

describe("UnlockSheet offers", () => {
  it("keeps the owner's scope lines in every mode", () => {
    render(<UnlockSheet {...base} offer={{ mode: "pay", priceKrw: 2900 }} onUnlock={() => {}} />);
    expect(screen.getByText("풀이 전체 · 약 2,000자")).toBeTruthy();
    expect(screen.getByText("이어서 물어보기 3번")).toBeTruthy();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    expect(screen.getByText("전체 풀이 · 2,900원")).toBeTruthy();
  });

  it("guest: log in first, with the gift explained", () => {
    render(<UnlockSheet {...base} offer={{ mode: "login", priceKrw: 2900, giftUnits: 10 }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).getAttribute("href")).toBe(base.loginHref);
    expect(screen.getByText("처음 가입하면 별조각 10개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요")).toBeTruthy();
  });

  it("별조각 first, paying second", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} offer={{ mode: "stardust", units: 10, balance: 10, priceKrw: 2900 }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "별조각 10개로 보기" }));
    expect(onUnlock).toHaveBeenCalledWith("free");
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" }).getAttribute("href")).toBe(base.payHref);
  });

  it("opens a purchase, and lets the owner open free on the side", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} owner offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "결제한 풀이 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    expect(onUnlock.mock.calls).toEqual([["paid"], ["owner"]]);
  });

  it("offers the refund next to the retry after a failed paid reading", () => {
    render(
      <UnlockSheet {...base} offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={() => {}} refundHref="/me#orders"
        error={{ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요.", action: "retry" }} />,
    );
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#orders");
  });

  it("while sales are paused, shows buyers a quiet login link next to the 오픈 기념 reading", () => {
    render(<UnlockSheet {...base} remaining={1} offer={{ mode: "opening", login: true }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "결제한 풀이가 있다면 로그인" }).getAttribute("href")).toBe(base.loginHref);
  });

  it("without an offer it is today's 오픈 기념 sheet, unchanged, with no 베타 anywhere", () => {
    const onUnlock = vi.fn();
    const { container } = render(<UnlockSheet kind="tarot" remaining={1} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: /전체 풀이 보기/ }));
    expect(onUnlock).toHaveBeenCalledWith("opening");
    expect(screen.getByText(/^오픈 기념으로 하루 .+ 무료예요$/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/베타/);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/pay/offer.test.ts apps/web/lib/account/client.test.ts apps/web/lib/reading/errors.p4.test.ts apps/web/components/tarot/UnlockSheet.test.tsx`
Expected: FAIL (modules not found; UnlockSheet has no `offer`).

- [ ] **Step 3: Write `apps/web/lib/account/client.ts`**

```ts
import { useEffect, useSyncExternalStore } from "react";

/**
 * Browser side of accounts: GET /api/me, shared by every component through one small store (one
 * request however many components ask). `undefined` until loaded, `null` when it failed (screens
 * then behave as they do without accounts).
 */

export interface AccountUser {
  nickname: string;
  stardust: number;
  /** ISO time the soonest 별조각 expire; null when there are none */
  stardustExpiresAt: string | null;
  /** paid readings bought and not opened yet */
  unused: Array<{ orderId: string; productId: string }>;
}

export interface AccountState {
  /** sales (new orders, sign-up, gift) are open for this device */
  payments: boolean;
  /** this device may log in (also while sales are paused, for existing accounts) */
  login: boolean;
  owner: boolean;
  user: AccountUser | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseUser(v: unknown): AccountUser | null | undefined {
  if (v === null) return null;
  if (!isRecord(v) || typeof v.nickname !== "string" || typeof v.stardust !== "number" || !Array.isArray(v.unused)) return undefined;
  if (v.stardustExpiresAt !== null && typeof v.stardustExpiresAt !== "string") return undefined;
  const unused = v.unused.filter((u): u is { orderId: string; productId: string } => isRecord(u) && typeof u.orderId === "string" && typeof u.productId === "string");
  return { nickname: v.nickname, stardust: v.stardust, stardustExpiresAt: v.stardustExpiresAt, unused: unused.map(({ orderId, productId }) => ({ orderId, productId })) };
}

export function parseAccount(value: unknown): AccountState | null {
  if (!isRecord(value) || typeof value.payments !== "boolean" || typeof value.login !== "boolean" || typeof value.owner !== "boolean") return null;
  const user = parseUser(value.user);
  return user === undefined ? null : { payments: value.payments, login: value.login, owner: value.owner, user };
}

let snapshot: AccountState | null | undefined;
let inflight: Promise<AccountState | null> | null = null;
const listeners = new Set<() => void>();

/** Asks /api/me again (after login, a payment, an opened reading); concurrent callers share one request. */
export function refreshAccount(fetchImpl: typeof fetch = fetch): Promise<AccountState | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    let next: AccountState | null = null;
    try {
      const response = await fetchImpl("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
      next = response.ok ? parseAccount(await response.json()) : null;
    } catch {
      next = null;
    }
    snapshot = next;
    inflight = null;
    listeners.forEach((listener) => listener());
    return next;
  })();
  return inflight;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useAccount(): AccountState | null | undefined {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => undefined);
  useEffect(() => {
    if (snapshot === undefined) void refreshAccount();
  }, []);
  return value;
}

export function loginHref(returnTo: string): string {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}

export async function logout(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" });
    await refreshAccount(fetchImpl);
    return response.ok;
  } catch {
    return false;
  }
}

const LOGIN_MESSAGES: Record<string, string> = {
  cancel: "로그인을 취소했어요",
  failed: "로그인하지 못했어요. 다시 시도해 주세요.",
  closed: "지금은 새로 가입할 수 없어요",
  unavailable: "지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  busy: "요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.",
};

/** What to say for the ?login= flag a login brought back (nothing for ok). */
export function loginMessage(flag: string | null): string | null {
  return flag ? (LOGIN_MESSAGES[flag] ?? null) : null;
}

/** Tests only. */
export function resetAccountForTests(): void {
  snapshot = undefined;
  inflight = null;
  listeners.clear();
}
```

- [ ] **Step 4: Write `apps/web/lib/pay/offer.ts`**

```ts
import type { AccountState } from "@/lib/account/client";
import type { Product, StandardProductId } from "./catalog";

/**
 * What the unlock sheet offers this device for a standard reading (spec section 9). There is one
 * gold primary per mode:
 * - opening: the 오픈 기념 daily free reading (sales closed here, no credit held). `login` adds a
 *   quiet link for buyers while sales are paused;
 * - login: a guest while sales are open;
 * - open-paid: a purchase of this reading is waiting;
 * - stardust: enough 별조각; paying is the secondary choice;
 * - pay.
 * Credit already held always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "opening"; login: boolean }
  | { mode: "login"; priceKrw: number; giftUnits: number }
  | { mode: "open-paid"; orderId: string }
  | { mode: "stardust"; units: number; balance: number; priceKrw: number }
  | { mode: "pay"; priceKrw: number };

export function unlockOffer(account: AccountState | null | undefined, product: Product, giftUnits: number): UnlockOffer {
  const user = account?.user;
  if (account && user) {
    const bought = user.unused.find((item) => item.productId === product.id);
    if (bought) return { mode: "open-paid", orderId: bought.orderId };
    if (product.units !== null && user.stardust >= product.units) return { mode: "stardust", units: product.units, balance: user.stardust, priceKrw: product.krw };
    return account.payments ? { mode: "pay", priceKrw: product.krw } : { mode: "opening", login: false };
  }
  if (account?.payments) return { mode: "login", priceKrw: product.krw, giftUnits };
  return { mode: "opening", login: Boolean(account?.login) };
}

export function checkoutHref(productId: StandardProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
```

- [ ] **Step 5: Add the codes and the copy.**
  - `apps/web/lib/reading/api.ts`: add the nine codes to the `ApiErrorCode` union and to `CODES`. `getJson` is already there (aa70830); use it as it is.
  - `apps/web/lib/reading/errors.ts`:
    - change `ErrorContext` by adding `| "paid" | "stardust"` to the union it has now;
    - add the three exports below above `describeApiError`;
    - in the `QUALITY`/`UPSTREAM`, `TIMEOUT`, `INVALID` and `NETWORK` cases, add as the first line `if (context === "paid" || context === "stardust") return CREDIT_CHECKING;` (keep the rest of each case as it is). `TIMEOUT` and `INVALID` are the client-side codes `postGeneration` returns since aa70830: the client gave up, or the answer it got did not have the reading's shape. Either way the server may have saved the reading;
    - add the new cases.

```ts
/**
 * A paid or 별조각 reading that failed mid-way: nobody knows yet whether it was saved (M4). Shown
 * until the result page has checked the account (lib/storage/sync.ts checkDelivery).
 */
export const CREDIT_CHECKING: ErrorView = { title: "풀이가 열렸는지 확인하고 있어요", body: "잠시만 기다려 주세요.", action: null };

/** The check found the credit unused: only now may the page say so. */
export function creditKept(context: "paid" | "stardust"): ErrorView {
  return {
    title: "풀이를 다 적지 못했어요",
    body: context === "paid" ? "결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요." : "별조각은 그대로예요. 한 번 더 시도해 주세요.",
    action: "retry",
  };
}

/** The check could not tell yet: point to where the answer will show, promise nothing unseen. */
export function creditUnknown(context: "paid" | "stardust"): ErrorView {
  return {
    title: "풀이가 열렸는지 아직 확인하지 못했어요",
    body:
      context === "paid"
        ? "몇 분 안에 내 정보의 결제한 풀이나 기록에 나타나요. 열리지 않은 결제는 내 정보에서 다시 열거나 환불받을 수 있어요."
        : "몇 분 안에 내 정보의 별조각이나 기록에 나타나요.",
    action: null,
  };
}

// inside the switch, the new cases:
    case "LOGIN_REQUIRED":
      return { title: "로그인이 필요해요", body: "로그인하고 다시 열어 주세요.", action: null };
    case "PAYMENT_REQUIRED":
      return { title: "전체 풀이는 결제하거나 별조각으로 열 수 있어요", action: null };
    case "NO_CREDIT":
      return { title: "쓸 수 있는 결제한 풀이나 별조각이 없어요", body: "결제하고 열 수 있어요.", action: null };
    case "PAY_UNAVAILABLE":
      return { title: "지금은 결제를 쓸 수 없어요", body: "잠시 뒤에 다시 시도해 주세요.", action: "retry" };
    case "FORBIDDEN":
      return { title: "다시 시도해 주세요", body: "화면을 새로 고친 뒤 다시 눌러 주세요.", action: "retry" };
    case "NOT_AVAILABLE":
      return { title: "지금은 열 수 없는 상품이에요", action: "home" };
    case "PAY_FAILED":
      return { title: "결제를 마치지 못했어요", body: error.message || "청구된 금액은 없어요.", action: "retry" };
    case "PAY_PENDING":
      return { title: "결제를 확인하고 있어요", body: "잠시 뒤에 다시 확인해 주세요.", action: "retry" };
    case "NOT_REFUNDABLE":
      return { title: "환불할 수 없는 결제예요", body: "이미 연 풀이이거나 환불을 처리하고 있어요.", action: null };
```

- [ ] **Step 6: Extend `apps/web/components/tarot/UnlockSheet.tsx`.**
  - Keep the 오픈 기념 branch exactly as it is in the file when you start: label, used-up line, caption. The last UnlockSheet test pins it.
  - Add the props and the offer branches below.
  - Add `.price` and `.links` to `UnlockSheet.module.css`. Use the tokens the sheet already uses: `.price` like `.title` but `var(--fs-body)`; `.links` a centered row with `gap: 16px`, links ≥44px tall, `var(--fs-small)`. Both ≥13px.

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import type { UnlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { won } from "@/lib/config";

type UnlockSheetProps = {
  kind: "tarot" | "saju";
  /** What this device may do now (lib/pay/offer.ts). Default: the 오픈 기념 daily free reading. */
  offer?: UnlockOffer;
  /** Full readings left today on this device (오픈 기념 only); undefined until read. */
  remaining: number | undefined;
  onUnlock: (method: UnlockMethod) => void;
  /** The login page with the way back (offer "login", and the paused-sales link). */
  loginHref?: string;
  /** The checkout for this reading (offers "pay" and "stardust"). */
  payHref?: string;
  /** The owner pass: a quiet "운영자로 무료 열기" beside the paid offers. */
  owner?: boolean;
  /** After a failed paid reading: where 환불받기 goes (내 정보 결제 내역). */
  refundHref?: string;
  error?: ErrorView | null;
  redrawHref?: string;
  editHref?: string;
  openedHref?: string;
};
```

Inside the component (with `offer = { mode: "opening", login: false }` defaulted in the destructuring):

```tsx
  const { free } = SITE.currency;
  const priced = offer.mode === "login" || offer.mode === "pay" || offer.mode === "stardust";

  let offerPrimary: ReactNode = null;
  let offerSecondary: ReactNode = null;
  let caption = `오픈 기념으로 하루 ${times(SITE.beta.fullPerDay)} 무료예요`; // today's caption, unchanged
  switch (offer.mode) {
    case "login":
      offerPrimary = <Button href={loginHref ?? "/login"} block>로그인하고 전체 풀이 보기</Button>;
      caption = `처음 가입하면 ${free} ${offer.giftUnits}개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요`;
      break;
    case "open-paid":
      offerPrimary = <Button block onClick={() => onUnlock("paid")}>결제한 풀이 열기</Button>;
      caption = "결제한 풀이는 열기 전까지 언제든 환불할 수 있어요";
      break;
    case "stardust":
      offerPrimary = <Button block onClick={() => onUnlock("free")}>{`${free} ${offer.units}개로 보기`}</Button>;
      offerSecondary = <Button href={payHref ?? "/pricing"} variant="secondary" block>{`${won(offer.priceKrw)} 결제하고 보기`}</Button>;
      caption = `${free} ${offer.balance}개 있어요`;
      break;
    case "pay":
      offerPrimary = <Button href={payHref ?? "/pricing"} block>{`${won(offer.priceKrw)} 결제하고 보기`}</Button>;
      caption = "결제하면 바로 열려요";
      break;
    case "opening":
      break;
  }
```

Where `primary` is chosen:
- keep `openedHref`, then the `redraw` error, then `error?.care` first, as now;
- next, when `offer.mode !== "opening"`, use `offerPrimary`;
- only otherwise run the existing `usedUp` / opening branches. Show the used-up limit line only in the opening mode.

Render changes:
- Under the title, when `priced`: `<p className={s.price}>{`전체 풀이 · ${won(offer.priceKrw)}`}</p>`.
- In `.actions`, after the primary:
  - `{offerSecondary}`;
  - `{owner && offer.mode !== "opening" ? <Button variant="ghost" block onClick={() => onUnlock("owner")}>운영자로 무료 열기</Button> : null}`;
  - when `error && refundHref`: `<div className={s.links}><Link href={refundHref}>환불받기</Link></div>`;
  - when `offer.mode === "opening" && offer.login && loginHref`: `<div className={s.links}><Link href={loginHref}>결제한 풀이가 있다면 로그인</Link></div>`.
- Caption: `<p className={s.caption}>{caption}</p>` replaces the fixed caption.
- The opening primary calls `onUnlock("opening")`. The existing callers pass `() => unlock()`-style handlers that ignore the argument, so they compile unchanged until Task 15.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/lib/pay/offer.test.ts apps/web/lib/account/client.test.ts apps/web/lib/reading apps/web/components/tarot`
Expected: PASS (offer 7, client 3, errors.p4 4, UnlockSheet 7; existing reading and sheet tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account/client.ts apps/web/lib/account/client.test.ts apps/web/lib/pay/offer.ts apps/web/lib/pay/offer.test.ts apps/web/lib/reading/api.ts apps/web/lib/reading/errors.ts apps/web/lib/reading/errors.p4.test.ts apps/web/components/tarot/UnlockSheet.tsx apps/web/components/tarot/UnlockSheet.module.css apps/web/components/tarot/UnlockSheet.test.tsx
git commit -m "feat(unlock): account store, unlock offers, honest copy after a failed credit reading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Result pages, the delivery check after a cut, the login page

**Files:**
- Create: `apps/web/lib/storage/sync.ts`
- Modify:
  - `apps/web/app/tarot/result/FreeResult.tsx`, `apps/web/app/tarot/result/page.tsx`
  - `apps/web/app/saju/chart/SajuChartView.tsx`, `apps/web/app/saju/chart/page.tsx`
  - `apps/web/app/chapter/[id]/LocalChapter.tsx` (send `readingId` with follow-ups)
  - `apps/web/lib/storage/chapters.ts` (`serverId`, `mergeServerReadings`, `forgetServerIds`), `apps/web/lib/reading/types.ts` (`readingId`)
  - `apps/web/app/login/page.tsx`, `apps/web/app/login/LoginPanel.tsx` (real Kakao; Google removed)
- Test: `apps/web/app/login/LoginPanel.test.tsx`, `apps/web/lib/storage/serverId.test.ts`, `apps/web/lib/storage/sync.test.ts`

**Interfaces:**
- Consumes:
  - Task 14: `useAccount`, `refreshAccount`, `loginHref`, `loginMessage`, `unlockOffer`, `checkoutHref`, `CREDIT_CHECKING`, `creditKept`, `creditUnknown`, and the `UnlockSheet` props; `getJson` (already in `lib/reading/api.ts`).
  - `standardProduct`, `UnlockMethod`, `paymentsMode` (Task 2), `safeReturnTo` (Task 3).
  - The reading routes' `unlock`, `display` and `readingId` (Task 10); `GET /api/readings` (Task 11); `FollowUpBody.readingId` (Task 11).
- Produces:
  - `StoredChapter.serverId?: string` (the account copy's id); `TarotReadingResponse.readingId?`, `SajuReadingResponse.readingId?`
  - `chapters.ts`: `mergeServerReadings(readings: Array<{id; createdAt; chapter: unknown}>): number` (chapters added), `forgetServerIds()`
  - `sync.ts`:
    - `type SavedReadingJson = { id: string; createdAt: number; chapter: unknown }`
    - `fetchReadingsPage({before?, limit?}, fetchImpl?): Promise<{readings: SavedReadingJson[]; next: string | null} | null>`
    - `type DeliveryCheck = {status: "delivered"; reading: SavedReadingJson} | {status: "kept"} | {status: "unknown"}`
    - `checkDelivery(input: {startedAt; matches(chapter): boolean; method: "paid" | "free"; productId; units}, options?: {delays?; fetchImpl?; signal?}): Promise<DeliveryCheck>`
    - `FIRST_CHECK_DELAYS`, `LATER_CHECK_DELAYS`
  - `FreeResult({instant, autoUnlock?, loginFlag?})`, `SajuChartView({autoUnlock?, loginFlag?})`
    - `autoUnlock` ("paid" | "free" | null, from `?unlock=`) opens the reading once after checkout or login.
  - `LoginPanel({ next, status, navigate? })`

**After a paid or 별조각 reading is cut off (M4):**
- The server may have saved the reading even though the client saw an error (the work runs under `waitUntil`), so the page never claims the credit is untouched.
- For QUALITY, UPSTREAM, TIMEOUT, INVALID, NETWORK (or a 5xx with an unknown code, which arrives as UPSTREAM) on a `paid` or `free` opening, it shows `CREDIT_CHECKING` and runs `checkDelivery` with the time the request started. Each round:
  1. `GET /api/readings?limit=5`: a reading created at or after that time (2 minutes of clock slack) that matches this flow means it was delivered. It goes into this device's storage and the page opens it.
  2. `GET /api/me`: the purchase still unused (`paid`), or 별조각 enough again (`free`), means the credit was kept. The page shows `creditKept`, and the retry and refund stay available.
  3. Otherwise wait and ask again.
- Rounds after 0, 2 and 4 s; then `creditUnknown` while it keeps asking in the background after 15 s, 30 s, 1 min and 2 min. A cut connection aborts the generation on the server (`enable_request_signal`), but a save already under way still lands, and a release that failed is swept 6 minutes after the reservation. A later answer replaces the message, or opens the reading.
- A flow matches on the tarot question and its exact cards, or on the saju birth data. A reading of the same flow opened twice within two minutes is the same reading to the user, so either match is correct.
- Errors answered before any reservation (login, no credit, budget, limits, bad input) skip the check.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/storage/serverId.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CHAPTERS_KEY, clearChapters, listChapters, parseChapter, saveChapter } from "./chapters";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

describe("serverId on stored chapters", () => {
  it("keeps the account copy's id with the chapter", () => {
    const { chapter } = saveChapter({ kind: "tarot", question: "질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    expect(chapter.serverId).toBe("abcdefghij0123456789");
    expect(listChapters()[0]?.serverId).toBe("abcdefghij0123456789");
    expect(JSON.parse(localStorage.getItem(CHAPTERS_KEY)!).chapters[0].serverId).toBe("abcdefghij0123456789");
  });

  it("drops a malformed serverId instead of the whole chapter", () => {
    const parsed = parseChapter({ id: "abc123", createdAt: 1, chapterToken: "t", kind: "tarot", question: "q", cards: [card], reading, serverId: "../etc" });
    expect(parsed).not.toBeNull();
    expect(parsed?.serverId).toBeUndefined();
  });
});
```

`apps/web/lib/storage/sync.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, mergeServerReadings } from "./chapters";
import { checkDelivery } from "./sync";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const serverChapter = (question = "계정 질문", turns = 0) => ({
  kind: "tarot", question, conditions: [], note: "", cards: [card], reading,
  chapterToken: `t${turns}`, createdAt: 5, turns: Array.from({ length: turns }, (_, i) => ({ question: `q${i}`, answer: `a${i}` })), followUpsLeft: 3 - turns,
});
const ID = "abcdefghij0123456789";
const STARTED = Date.parse("2026-10-01T03:00:00Z");
const me = (user: unknown) => Response.json({ payments: true, login: true, owner: false, user });
const userWith = (over: Record<string, unknown> = {}) => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], ...over });

function stub(readings: unknown[], account: Response) {
  return vi.fn(async (url: string) => (url.startsWith("/api/readings") ? Response.json({ readings, next: null }) : account.clone())) as unknown as typeof fetch;
}

const flow = { startedAt: STARTED, matches: (chapter: unknown) => (chapter as { question?: string }).question === "이번 질문", productId: "tarot", units: 10 };

describe("account readings on this device", () => {
  it("adds readings from the account once, and takes newer follow-ups", () => {
    expect(mergeServerReadings([{ id: ID, createdAt: 5, chapter: serverChapter() }])).toBe(1);
    expect(mergeServerReadings([{ id: ID, createdAt: 5, chapter: serverChapter("계정 질문", 1) }])).toBe(0);
    const [only] = listChapters();
    expect(only).toMatchObject({ id: ID, serverId: ID, chapterToken: "t1", followUpsLeft: 2 });
    expect(only?.turns).toHaveLength(1);
  });

  it("skips what does not parse", () => {
    expect(mergeServerReadings([{ id: "bad", createdAt: 1, chapter: { kind: "tarot" } }])).toBe(0);
    expect(listChapters()).toEqual([]);
  });
});

describe("checking a cut-off paid or 별조각 reading", () => {
  it("finds the reading the server saved after the request started", async () => {
    const saved = { id: ID, createdAt: STARTED + 30_000, chapter: serverChapter("이번 질문") };
    const result = await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([saved], me(userWith())) });
    expect(result).toEqual({ status: "delivered", reading: saved });
  });

  it("ignores an older reading and one of another flow", async () => {
    const older = { id: ID, createdAt: STARTED - 10 * 60_000, chapter: serverChapter("이번 질문") };
    const other = { id: "zzzzzzzzzz0123456789", createdAt: STARTED + 1, chapter: serverChapter("다른 질문") };
    const result = await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([older, other], me(userWith())) });
    expect(result).toEqual({ status: "unknown" });
  });

  it("says kept only when the account shows the credit unused", async () => {
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0], fetchImpl: stub([], me(userWith({ unused: [{ orderId: "o1", productId: "tarot" }] }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0], fetchImpl: stub([], me(userWith({ stardust: 10 }))) })).toEqual({ status: "kept" });
    expect(await checkDelivery({ ...flow, method: "free" }, { delays: [0, 0], fetchImpl: stub([], me(userWith({ stardust: 0 }))) })).toEqual({ status: "unknown" });
  });

  it("asks again until it knows, and stops when told to", async () => {
    let round = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("/api/readings")) {
        round++;
        return Response.json({ readings: round < 3 ? [] : [{ id: ID, createdAt: STARTED + 1, chapter: serverChapter("이번 질문") }], next: null });
      }
      return me(userWith());
    }) as unknown as typeof fetch;
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0, 0, 0], fetchImpl })).toMatchObject({ status: "delivered" });
    const controller = new AbortController();
    controller.abort();
    expect(await checkDelivery({ ...flow, method: "paid" }, { delays: [0, 0], fetchImpl, signal: controller.signal })).toEqual({ status: "unknown" });
  });
});
```

`apps/web/app/login/LoginPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

afterEach(cleanup);

describe("LoginPanel", () => {
  it("offers Kakao only, and goes there only after the 만 14세 check", () => {
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    expect(screen.queryByText(/Google/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("만 14세 이상인지 먼저 확인해 주세요");
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?age=1&returnTo=%2Ftarot%2Fresult");
  });

  it("says what happened on the way back", () => {
    render(<LoginPanel next="/" status="cancel" navigate={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("로그인을 취소했어요");
  });

  it("explains the gift", () => {
    render(<LoginPanel next="/" status={null} navigate={() => {}} />);
    expect(screen.getByText("처음 가입하면 별조각 10개를 드려요")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/storage/serverId.test.ts apps/web/lib/storage/sync.test.ts apps/web/app/login/LoginPanel.test.tsx`
Expected: FAIL. `serverId` is not kept, `sync.ts` does not exist, and LoginPanel has no `next` prop and still shows Google.

- [ ] **Step 3: `serverId`, `readingId` and the merge helpers**
  - In `apps/web/lib/storage/chapters.ts`:
    - add to `ChapterBase`: `/** The account copy's id (Tasks 10–11): follow-ups update it there too. */ serverId?: string;`;
    - in `parseChapter`, after `base` is built: `if (isString(value.serverId) && /^[a-z0-9]{20}$/.test(value.serverId)) base.serverId = value.serverId;`;
    - below `deleteChapter`, add the two helpers below. They work on the stored envelope's raw entries, like `updateChapter`: an entry this version cannot read is kept as it is.

```ts
type AccountReading = { id: string; createdAt: number; chapter: unknown };

const fromAccount = (remote: AccountReading, id: string) =>
  isRecord(remote.chapter) ? parseChapter({ ...remote.chapter, id, serverId: remote.id, createdAt: remote.createdAt }) : null;

/**
 * Brings readings saved in the account onto this device (a reading opened elsewhere, a delivery
 * this page lost, follow-ups answered on another device). A new one keeps its account id as its local
 * id. A known one only takes newer follow-up turns. Returns how many chapters were added.
 */
export function mergeServerReadings(readings: readonly AccountReading[]): number {
  const entries = rawEntries();
  const byServerId = new Map(readings.map((remote) => [remote.id, remote]));
  let changed = false;
  const updated = entries.map((entry) => {
    const chapter = parseChapter(entry);
    const remote = chapter?.serverId ? byServerId.get(chapter.serverId) : undefined;
    const parsed = chapter && remote ? fromAccount(remote, chapter.id) : null;
    if (!chapter || !parsed || parsed.turns.length <= chapter.turns.length) return entry;
    changed = true;
    return { ...chapter, turns: parsed.turns, chapterToken: parsed.chapterToken, followUpsLeft: parsed.followUpsLeft };
  });
  const known = new Set<string>();
  for (const entry of entries) {
    const id = idOf(entry);
    if (id) known.add(id);
    const serverId = isRecord(entry) && isString(entry.serverId) ? entry.serverId : null;
    if (serverId) known.add(serverId);
  }
  const fresh: StoredChapter[] = [];
  for (const remote of readings) {
    if (known.has(remote.id)) continue;
    const parsed = fromAccount(remote, remote.id);
    if (!parsed) continue;
    fresh.push(parsed);
    known.add(remote.id);
  }
  if (changed || fresh.length) store.save({ v: 1, chapters: [...updated, ...fresh] });
  return fresh.length;
}

/** After the account's copies were deleted: this device's chapters stand alone again. */
export function forgetServerIds() {
  store.save({
    v: 1,
    chapters: rawEntries().map((entry) => {
      if (!isRecord(entry) || !("serverId" in entry)) return entry;
      const { serverId: _serverId, ...rest } = entry;
      return rest;
    }),
  });
}
```

  - In `apps/web/lib/reading/types.ts`, add `/** The account copy's id, when the reading was saved to the account. */ readingId?: string;` to `TarotReadingResponse` and `SajuReadingResponse`.
  - In `apps/web/app/chapter/[id]/LocalChapter.tsx`, send the id with follow-ups:

```ts
    const result = await postGeneration<FollowUpData>("/api/followup", {
      chapterToken: chapter.chapterToken,
      reading: chapter.reading,
      question,
      ...(chapter.serverId ? { readingId: chapter.serverId } : {}),
    });
```

- [ ] **Step 4: Write `apps/web/lib/storage/sync.ts`**

```ts
import { parseAccount } from "@/lib/account/client";
import { getJson } from "@/lib/reading/api";

/** The account's saved readings on this device (spec 5.7), and the check after a cut-off paid reading (M4). */

export type SavedReadingJson = { id: string; createdAt: number; chapter: unknown };

/** One page of GET /api/readings, or null when it could not be read. */
export async function fetchReadingsPage(
  query: { before?: string; limit?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ readings: SavedReadingJson[]; next: string | null } | null> {
  const params = new URLSearchParams();
  if (query.before) params.set("before", query.before);
  if (query.limit) params.set("limit", String(query.limit));
  const search = params.toString();
  const res = await getJson<{ readings: SavedReadingJson[]; next: string | null }>(`/api/readings${search ? `?${search}` : ""}`, { fetchImpl });
  return res.ok && Array.isArray(res.data.readings) ? { readings: res.data.readings, next: res.data.next ?? null } : null;
}

export type DeliveryCheck = { status: "delivered"; reading: SavedReadingJson } | { status: "kept" } | { status: "unknown" };

/** The first rounds, while CREDIT_CHECKING shows (ms before each). */
export const FIRST_CHECK_DELAYS = [0, 2_000, 4_000];
/** Then in the background, under creditUnknown: a cut-off generation can still finish for 4 minutes. */
export const LATER_CHECK_DELAYS = [15_000, 30_000, 60_000, 120_000];
/** Server and device clocks differ; a reading this much older than the request still counts. */
const CLOCK_SLACK_MS = 2 * 60_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/**
 * After a paid or 별조각 opening failed mid-way: was it delivered (the account has the reading), was
 * the credit kept (the account shows it unused), or is it not known yet? One round per delay; the
 * first answer wins. Never "kept" on a guess.
 */
export async function checkDelivery(
  input: { startedAt: number; matches: (chapter: unknown) => boolean; method: "paid" | "free"; productId: string; units: number },
  options: { delays?: readonly number[]; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DeliveryCheck> {
  const { delays = FIRST_CHECK_DELAYS, fetchImpl = fetch, signal } = options;
  for (const delay of delays) {
    await sleep(delay, signal);
    if (signal?.aborted) break;
    const page = await fetchReadingsPage({ limit: 5 }, fetchImpl);
    const found = page?.readings.find((reading) => reading.createdAt >= input.startedAt - CLOCK_SLACK_MS && input.matches(reading.chapter));
    if (found) return { status: "delivered", reading: found };
    const me = await getJson<unknown>("/api/me", { fetchImpl });
    const user = me.ok ? parseAccount(me.data)?.user : null;
    if (user && input.method === "paid" && user.unused.some((item) => item.productId === input.productId)) return { status: "kept" };
    if (user && input.method === "free" && user.stardust >= input.units) return { status: "kept" };
  }
  return { status: "unknown" };
}
```

`checkDelivery` asks for 5 readings: a page this small is enough, since the reading it looks for is the newest or nearly so.

- [ ] **Step 5: Wire `FreeResult.tsx`.** Change only these parts and keep everything else as it is when you start.

```tsx
// new imports
import { useRef } from "react";
import { loginHref, loginMessage, refreshAccount, useAccount } from "@/lib/account/client";
import { standardProduct } from "@/lib/pay/catalog";
import { checkoutHref, unlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { CREDIT_CHECKING, creditKept, creditUnknown, type ErrorView } from "@/lib/reading/errors";
import { mergeServerReadings } from "@/lib/storage/chapters";
import { LATER_CHECK_DELAYS, checkDelivery, type DeliveryCheck } from "@/lib/storage/sync";

const RETURN_TO = "/tarot/result";
/** Errors after which the server may still have saved the reading (M4). */
const UNSETTLED = new Set(["QUALITY", "UPSTREAM", "NETWORK", "TIMEOUT", "INVALID"]);

export function FreeResult({ instant, autoUnlock = null, loginFlag = null }: { instant: boolean; autoUnlock?: UnlockMethod | null; loginFlag?: string | null }) {
  // ...existing hooks...
  const account = useAccount();
  const product = standardProduct("tarot");
  const offer = unlockOffer(account, product, SITE.price.signupGiftFree);
  const [method, setMethod] = useState<UnlockMethod>("opening");
  const [creditView, setCreditView] = useState<ErrorView | null>(null);
  const checkAbort = useRef<AbortController | null>(null);
  useEffect(() => () => checkAbort.current?.abort(), []);
  const context = method === "paid" ? "paid" : method === "free" ? "stardust" : "reading";
  const unlockError = creditView ?? (unlockGen.state.status === "error" ? describeApiError(unlockGen.state.error, context) : null);
  const loginNote = loginMessage(loginFlag);

  /** This flow's reading: the same question and the very same cards. */
  const sameFlow = (chapter: unknown) => {
    const c = chapter as { kind?: string; question?: string; cards?: Array<{ cardId: string; orientation: string }> };
    return c.kind === "tarot" && c.question === input?.question && JSON.stringify(c.cards?.map((x) => [x.cardId, x.orientation])) === JSON.stringify(draw?.cards.map((x) => [x.cardId, x.orientation]));
  };

  /** M4: after a cut-off paid or 별조각 opening, find out what happened before saying anything. */
  const settle = async (chosen: "paid" | "free", startedAt: number) => {
    checkAbort.current?.abort();
    const controller = new AbortController();
    checkAbort.current = controller;
    const credit = chosen === "paid" ? "paid" : "stardust";
    const flow = { startedAt, matches: sameFlow, method: chosen, productId: product.id, units: product.units ?? 0 };
    const apply = (check: DeliveryCheck): boolean => {
      if (check.status === "delivered") {
        mergeServerReadings([check.reading]);
        void refreshAccount();
        router.push(`/chapter/${check.reading.id}`);
        return true;
      }
      if (check.status === "kept") {
        setCreditView(creditKept(credit));
        void refreshAccount();
        return true;
      }
      return false;
    };
    setCreditView(CREDIT_CHECKING);
    if (apply(await checkDelivery(flow, { signal: controller.signal }))) return;
    if (controller.signal.aborted) return;
    setCreditView(creditUnknown(credit));
    apply(await checkDelivery(flow, { delays: LATER_CHECK_DELAYS, signal: controller.signal }));
  };

  const unlock = async (chosen: UnlockMethod) => {
    if (!draw || !input || !summary) return;
    setMethod(chosen);
    setCreditView(null);
    checkAbort.current?.abort();
    window.scrollTo(0, 0);
    const plan = progressPlan("tarot-reading", { positions });
    const body = { drawToken: draw.drawToken, input: withHistory(input), ...(chosen === "opening" ? {} : { unlock: { method: chosen } }) };
    const startedAt = Date.now();
    const result = await unlockGen.run("/api/tarot/reading", body, plan, isTarotReadingResponse);
    if (!result) return;
    if (!result.ok) {
      if (result.error.code === "BETA_LIMIT") markDayUsedUp();
      if (result.error.code === "LOGIN_REQUIRED") router.push(loginHref(RETURN_TO));
      if (result.error.code === "NO_CREDIT" || result.error.code === "PAYMENT_REQUIRED") void refreshAccount();
      if ((chosen === "paid" || chosen === "free") && UNSETTLED.has(result.error.code)) void settle(chosen, startedAt);
      return;
    }
    if (chosen === "opening") countFullReading();
    else void refreshAccount();
    // ...the existing saveChapter({...}) call, with one more field:
    //   ...(result.data.readingId ? { serverId: result.data.readingId } : {}),
    // ...then setFlow and router.push as now.
  };

  // After checkout (?unlock=paid) or a 별조각 login (?unlock=free): open once, as soon as the
  // teaser and the account are known and the offer matches. Without a draw (the flow was lost on
  // another browser) nothing runs, and the purchase waits in 내 정보.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoUnlock || autoStarted.current || !teaser || account === undefined || openedId) return;
    if (autoUnlock === "paid" && offer.mode !== "open-paid") return;
    if (autoUnlock === "free" && offer.mode !== "stardust") return;
    autoStarted.current = true;
    router.replace(withFlags(RETURN_TO, { instant }));
    void unlock(autoUnlock);
  });
```

Keep the `isTarotReadingResponse` check the `run` call has at aa70830; the response's extra `readingId` passes it. `UNSETTLED` holds the codes after which the server may have saved the reading. `parseApiError` maps a code it does not know by status (5xx → `UPSTREAM`), so a server failure with an unexpected code is covered too. Every refusal before a reservation has a known code outside `UNSETTLED` (the budget's 503 is `AI_UNAVAILABLE`, a missing account setup is `PAY_UNAVAILABLE`).

Replace the `<UnlockSheet … />` element with:

```tsx
              <UnlockSheet
                kind="tarot"
                offer={offer}
                remaining={remaining}
                onUnlock={(chosen) => void unlock(chosen)}
                loginHref={loginHref(RETURN_TO)}
                payHref={checkoutHref("tarot", RETURN_TO)}
                owner={account?.owner}
                refundHref={method === "paid" && creditView?.action === "retry" ? "/me#orders" : undefined}
                error={unlockError ?? (loginNote ? { title: loginNote, action: null } : null)}
                redrawHref={withFlags("/tarot/draw", { instant })}
                editHref="/tarot/new"
                openedHref={openedId ? `/chapter/${openedId}` : undefined}
              />
```

`refundHref` appears only with `creditKept` (its action is `retry`): the refund link shows once the purchase is known to be unused.

`apps/web/app/tarot/result/page.tsx` passes the flags:

```tsx
        <FreeResult
          instant={query.instant === "1"}
          autoUnlock={query.unlock === "paid" || query.unlock === "free" ? query.unlock : null}
          loginFlag={typeof query.login === "string" ? query.login : null}
        />
```

- [ ] **Step 6: Wire `SajuChartView.tsx` the same way.**
  - Use `standardProduct("saju")` and `RETURN_TO = "/saju/chart"`; the props are `{ autoUnlock?, loginFlag? }`.
  - For a `paid` or `free` method, the request body adds `display: { title: teaser.title, summary: teaser.summary }` next to `unlock`.
  - Pass `checkoutHref("saju", RETURN_TO)` to the sheet, and save `serverId` with the chapter.
  - The same `settle` after a cut-off opening. `sameFlow` matches `c.kind === "saju"` and the same birth data: compare `JSON.stringify(c.birth)` with the birth the request sent.
  - Keep the `isSajuReadingResponse` check the `run` call has at aa70830; the response's extra `readingId` passes it.
  - `apps/web/app/saju/chart/page.tsx` becomes:

```tsx
export default async function SajuChartPage({ searchParams }: PageProps<"/saju/chart">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <SajuChartView
          autoUnlock={query.unlock === "paid" || query.unlock === "free" ? query.unlock : null}
          loginFlag={typeof query.login === "string" ? query.login : null}
        />
      </main>
      <Footer />
    </div>
  );
}
```

Keep whatever wraps `SajuChartView` in the file you start from (`NightSky`, `Footer`, class names). Change only the props.

- [ ] **Step 7: Replace the login page.**

`apps/web/app/login/page.tsx`. At aa70830 the page is a dev-only prototype (`PROTOTYPE_ONLY`, 404 in production builds, commit 964dbce). Replace that gate: the page exists whenever `STARLOG_PAYMENTS` is not `off`. The start route still decides who may log in (`loginOpen`, Task 5), so a visitor in owner mode without the pass gets `login=closed` there.

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { paymentsMode } from "@/lib/pay/mode";
import { NOINDEX } from "@/lib/seo";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인", robots: NOINDEX };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Dark deploy (STARLOG_PAYMENTS=off): no login anywhere, as before P4.
  if (paymentsMode() === "off") notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <LoginPanel next={safeReturnTo(typeof query.next === "string" ? query.next : null)} status={typeof query.login === "string" ? query.login : null} />
      </main>
    </div>
  );
}
```

`apps/web/app/login/LoginPanel.tsx` (keep `LoginPanel.module.css`; its `.google` rule becomes unused and may stay):

```tsx
"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { Stepper } from "@/components/tarot/Stepper";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginMessage } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import s from "./LoginPanel.module.css";

type LoginPanelProps = {
  /** where to come back after Kakao (already a safe same-site path) */
  next: string;
  /** the ?login= flag a previous attempt brought back */
  status: string | null;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * Sign-in right before paying or claiming the gift (spec 5.1). Kakao only. The 만 14세 box must be
 * ticked first; it travels to the server as age=1 and is recorded on the account.
 */
export function LoginPanel({ next, status, navigate = (url) => window.location.assign(url) }: LoginPanelProps) {
  const [adult, setAdult] = useState(false);
  const [showError, setShowError] = useState(false);
  const checkbox = useRef<HTMLInputElement>(null);
  const note = loginMessage(status);

  const kakao = () => {
    if (!adult) {
      setShowError(true);
      checkbox.current?.focus();
      return;
    }
    navigate(`/api/auth/kakao/start?age=1&returnTo=${encodeURIComponent(next)}`);
  };

  return (
    <div className={s.screen}>
      <Stepper label="로그인" backHref={next} backLabel="돌아가기" />

      <div className={s.intro}>
        <div className={s.hero}>
          <p className={s.bubble}>{`이 풀이를 ${SITE.nameKo}에 적어둘게요`}</p>
          <Rabbit outfit="tarot" action="write" size={168} />
        </div>
        <h1 className={s.title}>로그인하고 전체 풀이 보기</h1>
        <p className={s.gift}>{`처음 가입하면 ${SITE.currency.free} ${SITE.price.signupGiftFree}개를 드려요`}</p>
      </div>

      <div className={s.form}>
        <p className="sr-only" role="status">
          {note ?? ""}
        </p>
        {note ? <p className={s.error}>{note}</p> : null}
        <Checkbox
          ref={checkbox}
          checked={adult}
          onChange={(checked) => {
            setAdult(checked);
            if (checked) setShowError(false);
          }}
          invalid={showError}
          describedBy={showError ? "age-error" : undefined}
        >
          만 14세 이상이에요
        </Checkbox>
        {showError ? (
          <p id="age-error" className={s.error} role="alert">
            만 14세 이상인지 먼저 확인해 주세요
          </p>
        ) : null}

        <button type="button" className={`${s.provider} ${s.kakao}`} onClick={kakao}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z" />
          </svg>
          카카오로 계속하기
        </button>

        <p className={s.consent}>
          계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>에 동의하게 돼요
        </p>
      </div>
    </div>
  );
}
```

The status test reads `getByRole("status")`. The visible `.error` line repeats the note for sighted users; the sr-only status region announces it.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run apps/web/lib/storage apps/web/app/login apps/web/app/tarot apps/web/app/saju apps/web/app/chapter apps/web/components`
Expected: PASS (serverId 2, sync 6, LoginPanel 3; the existing storage, DrawStage and chapter tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

The controller runs `pnpm e2e` after this task. Today's flows must stay green: with `STARLOG_PAYMENTS` unset, `/api/me` answers `payments: false, login: false`, so every sheet is the 오픈 기념 sheet. The fresh-start rules of aa70830 (`lib/useFlowVisit.ts`) reset only the question builder, the situation step and the saju form; the result pages keep the tab's flow, so coming back from `/pay/success` to `/tarot/result?unlock=paid` in the same tab still finds the draw. The e2e `screens` case `login` opens `/login`; it renders only with `STARLOG_PAYMENTS` set (Task 19 sets `owner` for e2e).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/tarot/result apps/web/app/saju/chart apps/web/app/chapter/[id]/LocalChapter.tsx apps/web/lib/storage/chapters.ts apps/web/lib/storage/serverId.test.ts apps/web/lib/storage/sync.ts apps/web/lib/storage/sync.test.ts apps/web/lib/reading/types.ts apps/web/app/login
git commit -m "feat(unlock): paid and 별조각 offers on the result pages, a delivery check after a cut, Kakao-only login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Checkout, success and fail pages

**Files:**
- Create:
  - `apps/web/lib/pay/tossSdk.ts`
  - `apps/web/app/pay/checkout/page.tsx`, `apps/web/app/pay/checkout/CheckoutView.tsx`, `apps/web/app/pay/pay.module.css`
  - `apps/web/app/pay/success/page.tsx`, `apps/web/app/pay/success/PaySuccess.tsx`
  - `apps/web/app/pay/fail/page.tsx`, `apps/web/app/pay/fail/PayFail.tsx`
- Modify: `apps/web/lib/robots.ts` (`/pay` in `ROBOTS_DISALLOW`); `apps/web/lib/seo.test.ts` only if it pins the whole list
- Test: `apps/web/app/pay/checkout/CheckoutView.test.tsx`, `apps/web/app/pay/success/PaySuccess.test.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/pay/checkout`, `POST /api/pay/orders`, `POST /api/pay/confirm`, `GET /api/pay/orders?id=` (Task 7).
  - `loginHref`, `refreshAccount` (Task 14); `getJson` (already in `lib/reading/api.ts`); `withQuery`, `safeReturnTo` (Task 3); `standardProduct` (Task 2); `NOINDEX` (`lib/seo.ts`).
  - `postJson`, `describeApiError`, `ErrorView`; `Button`, `Checkbox`, `Stepper`, `NightSky`.
- Produces:
  - `tossSdk.ts`: `TOSS_SDK_URL`, `interface TossWidgets`, `loadTossSdk(): Promise<(clientKey: string) => { widgets(o: {customerKey}): TossWidgets }>`, `isPaymentWindowClosed(error): boolean`
  - `CheckoutView({ productId, returnTo, navigate? })`, `PaySuccess({ paymentKey, orderId, amount, navigate?, pollMs? })`, `PayFail({ code, message, orderId })`
  - Routes `/pay/checkout?product&returnTo`, `/pay/success` (Toss successUrl), `/pay/fail` (Toss failUrl); all noindex and disallowed in robots.

**Revision 2:**
- **M5:** the success page works without the session. When the confirm answers `signedIn: false` (the card app or KakaoTalk handed the buyer to another browser), it says the payment went through. Its gold button is `로그인하고 풀이 열기`, to `/login?next=<returnTo>?unlock=paid`; the reading opens after login.
- **M7:** the checkout notice adds the minor's line: 만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.
- **Minor 8:** `requestPayment` errors are told apart. The buyer closing the window (`USER_CANCEL`, `PAY_PROCESS_CANCELED`) stays quiet; anything else says the window could not open and nothing was charged.
- No claim that a failed generation leaves the purchase "그대로": the notice states the rule (a purchase is used only when its reading is saved).
- `components/layout/VersionCheck` (aa70830) reloads a tab whose build changed when the visitor comes back to it, but never while an element has `aria-busy="true"`. Coming back from a card app is exactly that moment. The checkout's container carries `aria-busy={busy}` while the order and the payment window are open, and the success page's carries `aria-busy="true"` until it has an answer. A reload of the success page anyway only repeats an idempotent confirm.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/pay/checkout/CheckoutView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutView } from "./CheckoutView";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
let calls: Array<{ url: string; init?: RequestInit }> = [];

function stubFetch(checkout: Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/pay/checkout")) return checkout.clone();
    if (url === "/api/pay/orders") {
      return Response.json({ orderId: ORDER, orderName: "스타로그 타로 전체 풀이", amount: 2900, successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail" });
    }
    return new Response(null, { status: 404 });
  }));
}

beforeEach(() => stubFetch(Response.json({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "mock", clientKey: null })));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckoutView", () => {
  it("shows the product, the price and the 청약철회 notice, and pays only after the check", async () => {
    const navigate = vi.fn();
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} />);
    expect(await screen.findByText("2,900원")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "타로 전체 풀이" })).toBeTruthy();
    expect(screen.getByText(/청약철회가 제한돼요/)).toBeTruthy();
    expect(screen.getByText("만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.")).toBeTruthy();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    const pay = screen.getByRole("button", { name: "2,900원 결제하기" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
    fireEvent.click(pay);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`http://localhost/pay/success?paymentType=NORMAL&orderId=${ORDER}&paymentKey=mock_${ORDER}&amount=2900`),
    );
    expect(JSON.parse(String(calls.find((c) => c.url === "/api/pay/orders")!.init!.body))).toEqual({ productId: "tarot", returnTo: "/tarot/result", ack: true });
  });

  it("sends a guest to login and back to this page", async () => {
    stubFetch(Response.json({ code: "LOGIN_REQUIRED", message: "로그인이 필요해요." }, { status: 401 }));
    const navigate = vi.fn();
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?next=%2Fpay%2Fcheckout%3Fproduct%3Dtarot%26returnTo%3D%252Ftarot%252Fresult"));
  });

  it("explains a product that cannot be bought", async () => {
    stubFetch(Response.json({ code: "NOT_AVAILABLE", message: "지금은 열 수 없는 상품이에요." }, { status: 409 }));
    render(<CheckoutView productId="match" returnTo="/" navigate={() => {}} />);
    expect(await screen.findByText("지금은 열 수 없는 상품이에요")).toBeTruthy();
  });

  /** The Toss widget, faked: requestPayment rejects with `failure`. */
  function fakeToss(failure: unknown) {
    stubFetch(Response.json({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "toss", clientKey: "test_gck_x" }));
    const widgets = {
      setAmount: async () => {},
      renderPaymentMethods: async () => {},
      renderAgreement: async () => {},
      requestPayment: vi.fn(async () => {
        throw failure;
      }),
    };
    vi.stubGlobal("TossPayments", () => ({ widgets: () => widgets }));
    return widgets;
  }

  async function payWithToss() {
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={() => {}} />);
    await screen.findByText("2,900원");
    fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
    const pay = screen.getByRole("button", { name: "2,900원 결제하기" }) as HTMLButtonElement;
    await waitFor(() => expect(pay.disabled).toBe(false));
    fireEvent.click(pay);
    return pay;
  }

  it("stays quiet when the buyer closes the payment window", async () => {
    const widgets = fakeToss({ code: "USER_CANCEL", message: "사용자가 결제를 취소했습니다." });
    const pay = await payWithToss();
    await waitFor(() => expect(widgets.requestPayment).toHaveBeenCalled());
    await waitFor(() => expect(pay.disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the payment window could not open", async () => {
    fakeToss({ code: "INVALID_PARAMETERS", message: "잘못된 요청입니다." });
    await payWithToss();
    expect((await screen.findByRole("alert")).textContent).toBe("결제창을 열지 못했어요");
  });
});
```

`apps/web/app/pay/success/PaySuccess.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { PaySuccess } from "./PaySuccess";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

function stub(routes: Record<string, Array<() => Response>>) {
  const bodies: Record<string, unknown[]> = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = url.split("?")[0]!;
    (bodies[key] ??= []).push(init?.body ? JSON.parse(String(init.body)) : null);
    const queue = routes[key] ?? [() => Response.json({ payments: true, login: true, owner: false, user: null })];
    return (queue.length > 1 ? queue.shift()! : queue[0]!)();
  }));
  return bodies;
}

describe("PaySuccess", () => {
  it("confirms with the query's values and opens the reading", async () => {
    const bodies = stub({ "/api/pay/confirm": [() => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: true })] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(bodies["/api/pay/confirm"]).toEqual([{ paymentKey: "tgen_1", orderId: ORDER, amount: 2900 }]);
  });

  it("waits while the payment is being checked", async () => {
    stub({
      "/api/pay/confirm": [() => Response.json({ code: "PAY_PENDING" }, { status: 409 })],
      "/api/pay/orders": [
        () => Response.json({ orderId: ORDER, productId: "saju", status: "confirming", returnTo: "/saju/chart", signedIn: true }),
        () => Response.json({ orderId: ORDER, productId: "saju", status: "paid", returnTo: "/saju/chart", signedIn: true }),
      ],
    });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
    expect(await screen.findByText("결제를 확인하고 있어요")).toBeTruthy();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/saju/chart?unlock=paid"));
  });

  it("in a browser without the session, says the payment went through and asks for a login to open it", async () => {
    stub({ "/api/pay/confirm": [() => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: false })] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    expect(await screen.findByText("결제했어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하고 풀이 열기" }).getAttribute("href")).toBe("/login?next=%2Ftarot%2Fresult%3Funlock%3Dpaid");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says why a payment was not completed", async () => {
    stub({ "/api/pay/confirm": [() => Response.json({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." }, { status: 402 })] });
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={() => {}} />);
    expect(await screen.findByText("결제를 마치지 못했어요")).toBeTruthy();
    expect(screen.getByText("한도초과 혹은 잔액부족으로 결제에 실패했습니다.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/app/pay`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `apps/web/lib/pay/tossSdk.ts`**

```ts
/**
 * The Toss Payments JS SDK v2 (docs.tosspayments.com/sdk/v2/js), loaded once by script tag: no npm
 * dependency. Only what the checkout uses is typed.
 */

export const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export interface TossWidgets {
  setAmount(amount: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(options: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(options: { selector: string; variantKey?: string }): Promise<unknown>;
  /** Redirect mode: the browser goes to successUrl or failUrl; it rejects if the buyer closes the window. */
  requestPayment(request: { orderId: string; orderName: string; successUrl: string; failUrl: string }): Promise<void>;
}

type TossPaymentsFactory = (clientKey: string) => { widgets(options: { customerKey: string }): TossWidgets };

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

let loading: Promise<TossPaymentsFactory> | null = null;

export function loadTossSdk(): Promise<TossPaymentsFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  loading ??= new Promise<TossPaymentsFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = () => (window.TossPayments ? resolve(window.TossPayments) : reject(new Error("TossPayments missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Toss SDK failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** The buyer closed the payment window (minor 8): every other requestPayment error is a real failure. */
export function isPaymentWindowClosed(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";
}
```

- [ ] **Step 4: Write `apps/web/app/pay/checkout/CheckoutView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginHref } from "@/lib/account/client";
import { SITE, won } from "@/lib/config";
import { isPaymentWindowClosed, loadTossSdk, type TossWidgets } from "@/lib/pay/tossSdk";
import { getJson, postJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import s from "../pay.module.css";

interface CheckoutInfo {
  productId: string;
  name: string;
  amount: number;
  customerKey: string;
  provider: "toss" | "mock";
  clientKey: string | null;
}

interface OrderInfo {
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
}

const scopeLines = (productId: string): string[] => {
  if (productId !== "tarot" && productId !== "saju") return [];
  const chars = new Intl.NumberFormat("ko-KR").format(SITE.reading.approxChars[productId]);
  return [`풀이 전체 · 약 ${chars}자`, `이어서 물어보기 ${SITE.reading.followUps}번`, "이 기기에 계속 보관"];
};

type CheckoutViewProps = {
  productId: string;
  returnTo: string;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * Spec 5.2. The page shows the product, the server's price, what it holds and the 청약철회 notice,
 * which must be ticked before paying. Then the Toss widget (payment methods and Toss's own terms).
 * Only on 결제하기 is the order created, and only at the server's price. STARLOG_PAY=mock skips the
 * widget and goes straight to /pay/success with a mock payment key.
 */
export function CheckoutView({ productId, returnTo, navigate = (url) => window.location.assign(url) }: CheckoutViewProps) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const widgets = useRef<TossWidgets | null>(null);
  const here = `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getJson<CheckoutInfo>(`/api/pay/checkout?product=${encodeURIComponent(productId)}`);
      if (cancelled) return;
      if (!res.ok) {
        if (res.error.code === "LOGIN_REQUIRED") navigate(loginHref(here));
        else setError(describeApiError(res.error));
        return;
      }
      setInfo(res.data);
      if (res.data.provider === "mock" || !res.data.clientKey) {
        setReady(res.data.provider === "mock");
        return;
      }
      try {
        const TossPayments = await loadTossSdk();
        const created = TossPayments(res.data.clientKey).widgets({ customerKey: res.data.customerKey });
        await created.setAmount({ currency: "KRW", value: res.data.amount });
        await Promise.all([
          created.renderPaymentMethods({ selector: "#payment-methods", variantKey: "DEFAULT" }),
          created.renderAgreement({ selector: "#payment-agreement", variantKey: "AGREEMENT" }),
        ]);
        if (!cancelled) {
          widgets.current = created;
          setReady(true);
        }
      } catch {
        if (!cancelled) setError({ title: "결제창을 불러오지 못했어요", body: "잠시 뒤에 다시 시도해 주세요.", action: "retry" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `here` and `navigate` follow productId/returnTo; the widget is set up once per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const pay = async () => {
    if (!info || !agreed || !ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await postJson<OrderInfo>("/api/pay/orders", { productId: info.productId, returnTo, ack: true });
    if (!res.ok) {
      setBusy(false);
      setError(describeApiError(res.error));
      return;
    }
    const order = res.data;
    if (order.amount !== info.amount) {
      setBusy(false);
      setError({ title: "가격이 바뀌었어요", body: "화면을 새로 고친 뒤 다시 확인해 주세요.", action: "retry" });
      return;
    }
    if (info.provider === "mock") {
      navigate(`${order.successUrl}?${new URLSearchParams({ paymentType: "NORMAL", orderId: order.orderId, paymentKey: `mock_${order.orderId}`, amount: String(order.amount) })}`);
      return;
    }
    try {
      await widgets.current!.requestPayment({ orderId: order.orderId, orderName: order.orderName, successUrl: order.successUrl, failUrl: order.failUrl });
    } catch (error) {
      setBusy(false);
      // The buyer closed the window: stay here quietly. Anything else is a real failure.
      if (!isPaymentWindowClosed(error)) setError({ title: "결제창을 열지 못했어요", body: "잠시 뒤에 다시 시도해 주세요. 청구된 금액은 없어요.", action: "retry" });
    }
  };

  return (
    <div className={s.screen} aria-busy={busy}>
      <Stepper label="결제" backHref={returnTo} backLabel="풀이로 돌아가기" />
      {info ? (
        <>
          <header className={s.head}>
            <h1 className={s.title}>{info.name}</h1>
            <p className={s.price}>{won(info.amount)}</p>
          </header>
          <ul className={s.includes}>
            {scopeLines(info.productId).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <section className={s.notice} aria-labelledby="withdrawal-title">
            <h2 id="withdrawal-title" className={s.noticeTitle}>
              결제 전에 확인해 주세요
            </h2>
            <p>결제한 풀이는 완성되어 열리는 순간부터 청약철회가 제한돼요(전자상거래법 제17조 제2항 제5호). 무료로 본 첫 풀이가 맛보기예요.</p>
            <p>
              {"결제는 풀이가 완성되어 저장될 때만 쓰여요. 열기 전에는 내 정보에서 전액 환불받을 수 있어요. "}
              <Link href="/refund">환불 정책</Link>
            </p>
            <p>만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.</p>
          </section>
          <Checkbox checked={agreed} onChange={setAgreed} required>
            위 내용을 확인했어요
          </Checkbox>
          {info.provider === "toss" ? (
            <>
              <div id="payment-methods" className={s.widget} />
              <div id="payment-agreement" className={s.widget} />
            </>
          ) : (
            <p className={s.mock}>테스트 결제예요. 실제로 청구되지 않아요.</p>
          )}
          {error ? (
            <p role="alert" className={s.error}>
              {error.title}
            </p>
          ) : null}
          <div className={s.actions}>
            <Button block onClick={() => void pay()} disabled={!agreed || !ready || busy}>
              {`${won(info.amount)} 결제하기`}
            </Button>
            {info.provider === "mock" ? (
              <Button
                variant="ghost"
                block
                onClick={() => navigate(`/pay/fail?${new URLSearchParams({ code: "PAY_PROCESS_CANCELED", message: "사용자에 의해 결제가 취소되었습니다." })}`)}
              >
                테스트 결제 실패
              </Button>
            ) : null}
          </div>
        </>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
          <Button href={returnTo} variant="secondary" block>
            풀이로 돌아가기
          </Button>
        </div>
      ) : (
        <p role="status" className={s.status}>
          결제 정보를 불러오고 있어요
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/pay/success/PaySuccess.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loginHref, refreshAccount } from "@/lib/account/client";
import { withQuery } from "@/lib/account/returnTo";
import { getJson, postJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import s from "../pay.module.css";

type PaySuccessProps = {
  paymentKey: string;
  orderId: string;
  amount: string;
  navigate?: (url: string) => void;
  /** how often a pending payment is checked (ms) */
  pollMs?: number;
};

const POLLS = 30;

/**
 * Toss's successUrl (spec 5.3). It confirms on the server, then goes back to the reading with
 * ?unlock=paid, and the reading opens. If Toss's answer is late, it asks for the order's status
 * every couple of seconds. Neither call needs the session (M5): in a browser without it (a card app
 * or KakaoTalk handing over) the page says the payment went through and asks for a login, which
 * returns to the reading and opens it.
 */
export function PaySuccess({ paymentKey, orderId, amount, navigate = (url) => window.location.replace(url), pollMs = 2000 }: PaySuccessProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  const [loginTo, setLoginTo] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = (paid: { returnTo: string; signedIn?: boolean }) => {
      const target = withQuery(paid.returnTo, { unlock: "paid" });
      if (paid.signedIn === false) return setLoginTo(loginHref(target));
      void refreshAccount();
      navigate(target);
    };
    void (async () => {
      const res = await postJson<{ status: "paid"; returnTo: string; signedIn: boolean }>("/api/pay/confirm", { paymentKey, orderId, amount: Number(amount) });
      if (res.ok) return finish(res.data);
      if (res.error.code !== "PAY_PENDING") return setError(describeApiError(res.error));
      setPending(true);
      for (let i = 0; i < POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const status = await getJson<{ status: string; returnTo: string; signedIn: boolean }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`);
        if (status.ok && status.data.status === "paid") return finish(status.data);
        if (status.ok && status.data.status === "failed") return setError({ title: "결제를 마치지 못했어요", body: "청구된 금액은 없어요.", action: "retry" });
      }
      setError({ title: "결제를 확인하고 있어요", body: "확인이 늦어지고 있어요. 결제가 끝나면 내 정보의 결제 내역과 결제한 풀이에 나타나요.", action: null });
    })();
  }, [paymentKey, orderId, amount, navigate, pollMs]);

  return (
    <div className={s.screen} aria-busy={!loginTo && !error}>
      {loginTo ? (
        <div role="status" className={s.panel}>
          <p className={s.title}>결제했어요</p>
          <p>이 브라우저에서는 로그인되어 있지 않아요. 결제한 카카오 계정으로 로그인하면 바로 열려요.</p>
          <Button href={loginTo} block>
            로그인하고 풀이 열기
          </Button>
        </div>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
          <Button href="/me" variant="secondary" block>
            내 정보로 가기
          </Button>
        </div>
      ) : (
        <p role="status" className={s.status}>
          {pending ? "결제를 확인하고 있어요" : "결제를 마무리하고 있어요"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write the fail view and the three pages**

`apps/web/app/pay/fail/PayFail.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/lib/reading/api";
import s from "../pay.module.css";

/**
 * Toss's failUrl. Nothing was charged: the confirm API is never called after a failure. Toss's own
 * message is shown as text (at most 120 characters). The page offers the way back to the reading.
 */
export function PayFail({ code, message, orderId }: { code: string; message: string; orderId: string | null }) {
  const [back, setBack] = useState("/");
  useEffect(() => {
    if (!orderId) return;
    void getJson<{ returnTo: string }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`).then((res) => {
      if (res.ok) setBack(res.data.returnTo);
    });
  }, [orderId]);
  const cancelled = code === "PAY_PROCESS_CANCELED";
  return (
    <div className={s.screen}>
      <div role="alert" className={s.panel}>
        <p className={s.title}>{cancelled ? "결제를 취소했어요" : "결제를 마치지 못했어요"}</p>
        {!cancelled && message ? <p>{message.slice(0, 120)}</p> : null}
        <p>청구된 금액은 없어요.</p>
        <Button href={back} block>
          풀이로 돌아가기
        </Button>
      </div>
    </div>
  );
}
```

`apps/web/app/pay/checkout/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { CheckoutView } from "./CheckoutView";

export const metadata: Metadata = { title: "결제", robots: { index: false, follow: false } };

export default async function CheckoutPage({ searchParams }: PageProps<"/pay/checkout">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <CheckoutView productId={typeof query.product === "string" ? query.product : ""} returnTo={safeReturnTo(typeof query.returnTo === "string" ? query.returnTo : null)} />
      </main>
    </div>
  );
}
```

`apps/web/app/pay/success/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { PaySuccess } from "./PaySuccess";

export const metadata: Metadata = { title: "결제 확인", robots: { index: false, follow: false } };

export default async function PaySuccessPage({ searchParams }: PageProps<"/pay/success">) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PaySuccess paymentKey={value("paymentKey")} orderId={value("orderId")} amount={value("amount")} />
      </main>
    </div>
  );
}
```

`apps/web/app/pay/fail/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { PayFail } from "./PayFail";

export const metadata: Metadata = { title: "결제 실패", robots: { index: false, follow: false } };

export default async function PayFailPage({ searchParams }: PageProps<"/pay/fail">) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PayFail code={value("code")} message={value("message")} orderId={value("orderId") || null} />
      </main>
    </div>
  );
}
```

`apps/web/app/pay/pay.module.css`: classes `screen`, `head`, `title`, `price`, `includes`, `notice`, `noticeTitle`, `widget`, `mock`, `error`, `actions`, `panel` and `status`. Use the tokens in `app/globals.css` and the paper/sheet look of `components/tarot/UnlockSheet.module.css`. Text ≥13px, buttons from `Button` (≥44px), one gold primary (결제하기 / 풀이로 돌아가기), `.widget` with `min-height: 120px` so the Toss iframe has room.

In `apps/web/lib/robots.ts`, add `"/pay"` to `ROBOTS_DISALLOW` (the list moved there before aa70830). `lib/seo.test.ts` checks that listed paths are present; add `"/pay"` to its list of private paths. The three pages also carry `robots: NOINDEX` from `@/lib/seo` instead of the inline object above.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/pay apps/web/lib/seo.test.ts apps/web/lib/reading`
Expected: PASS (CheckoutView 5, PaySuccess 4; seo and reading unchanged apart from `/pay`).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/pay/tossSdk.ts apps/web/app/pay apps/web/lib/robots.ts apps/web/lib/seo.test.ts
git commit -m "feat(pay): checkout with the 청약철회 notice and Toss widget, success and fail pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 내 정보 — account, purchases, receipts, deletion

**Files:**
- Create: `apps/web/app/me/AccountPanel.tsx`, `apps/web/app/me/OrderHistory.tsx`, `apps/web/app/me/account.module.css`, `apps/web/app/me/meStatus.ts`
- Modify:
  - `apps/web/lib/storage/sync.ts` (`pullAccountReadings`, `deleteAccountReadings`, `useAccountSync`)
  - `apps/web/app/me/MeView.tsx`, `apps/web/app/me/page.tsx`, `apps/web/app/story/StoryView.tsx` (pull account readings)
- Delete: `apps/web/app/me/MoonPackSheet.tsx`. 달빛 packs are not sold in P4; the mock 충전 is gone. `SITE.moonPacks` stays in config for later.
- Test: `apps/web/lib/storage/pull.test.ts`, `apps/web/app/me/AccountPanel.test.tsx`, `apps/web/app/me/meStatus.test.ts`

**Interfaces:**
- Consumes:
  - Task 14: `useAccount`, `refreshAccount`, `logout`, `loginHref`, `AccountState`, `loginMessage`, `getJson`.
  - Task 15: `fetchReadingsPage`, `mergeServerReadings`, `forgetServerIds`.
  - `postJson`, `describeApiError`; `productById` (Task 2).
  - `GET /api/readings`, `DELETE /api/readings?all=1` (Task 11); `GET /api/pay/orders`, `POST /api/pay/refund` (Tasks 7, 8); `POST /api/account/delete-intent` (Task 12).
- Produces:
  - `sync.ts`:
    - `pullAccountReadings(fetchImpl?): Promise<number>`: every page, following `next` (minor 9), 20 pages at most per pull
    - `deleteAccountReadings(fetchImpl?): Promise<boolean>`, `useAccountSync(account)`
  - `meStatus.ts`: `meStatusMessage(query: {account?; delete?; login?}): string | null`
  - `AccountPanel({ account, navigate? })`, `OrderHistory()` (anchor `#orders`)

**Scope (revision 2):** no device→account claim UI (the coordinator's cut). 내 정보 shows the account, purchases, receipts, the delete-all of account copies, logout and deletion. A reading reaches the account only when it is opened while logged in (Task 10), and every page brings the account's readings onto this device.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/me/meStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { meStatusMessage } from "./meStatus";

describe("내 정보 status line", () => {
  it("speaks for each way back to /me", () => {
    expect(meStatusMessage({ account: "deleted" })).toBe("탈퇴했어요. 그동안 고마웠어요.");
    expect(meStatusMessage({ delete: "failed" })).toBe("탈퇴를 마치지 못했어요. 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "mismatch" })).toBe("로그인한 카카오 계정과 달라요. 같은 계정으로 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "refund-failed" })).toBe("환불을 마치지 못해 탈퇴를 멈췄어요. 문의해 주세요.");
    expect(meStatusMessage({ delete: "pending" })).toBe("결제 확인이나 환불이 아직 진행 중이에요. 10분쯤 뒤에 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "in-use" })).toBe("지금 열고 있는 풀이가 있어요. 풀이가 끝난 뒤 다시 시도해 주세요.");
    expect(meStatusMessage({ delete: "cancel" })).toBe("탈퇴를 취소했어요");
    expect(meStatusMessage({ login: "cancel" })).toBe("로그인을 취소했어요");
    expect(meStatusMessage({})).toBeNull();
  });
});
```

`apps/web/lib/storage/pull.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, saveChapter } from "./chapters";
import { deleteAccountReadings, pullAccountReadings } from "./sync";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const remote = (n: number) => ({
  id: `${String(n).padStart(2, "0")}cdefghij0123456789`.slice(0, 20),
  createdAt: n,
  chapter: { kind: "tarot", question: `질문 ${n}`, conditions: [], note: "", cards: [card], reading, chapterToken: `t${n}`, createdAt: n, turns: [], followUpsLeft: 3 },
});

describe("pulling the account's readings", () => {
  it("follows every page", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      return url.includes("before=")
        ? Response.json({ readings: [remote(1)], next: null })
        : Response.json({ readings: [remote(3), remote(2)], next: "2.02cdefghij01234567" });
    }) as unknown as typeof fetch;
    expect(await pullAccountReadings(fetchImpl)).toBe(3);
    expect(urls).toEqual(["/api/readings", "/api/readings?before=2.02cdefghij01234567"]);
    expect(listChapters()).toHaveLength(3);
  });

  it("deletes the account's copies and lets this device's chapters stand alone", async () => {
    saveChapter({ kind: "tarot", question: "q", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    const fetchImpl = vi.fn(async () => Response.json({ deleted: 1 })) as unknown as typeof fetch;
    expect(await deleteAccountReadings(fetchImpl)).toBe(true);
    expect(listChapters()[0]?.serverId).toBeUndefined();
  });
});
```

`apps/web/app/me/AccountPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests, type AccountState } from "@/lib/account/client";
import { AccountPanel } from "./AccountPanel";

const account = {
  payments: true,
  login: true,
  owner: false,
  user: { nickname: "별빛", stardust: 10, stardustExpiresAt: "2026-12-30T14:59:59.999Z", unused: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot" }] },
} satisfies AccountState;

let requests: Array<{ url: string; method: string; body: unknown }> = [];

// jsdom has no <dialog> methods; Modal calls showModal()/close().
beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === "/api/pay/orders") {
      return Response.json({ orders: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot", amount: 2900, status: "paid", createdAt: Date.parse("2026-10-01T03:00:00Z"), receiptUrl: "https://dashboard.tosspayments.com/receipt/x", method: "카드", refundable: true, opened: false }] });
    }
    if (url === "/api/pay/refund") return Response.json({ ok: true, status: "refunded" });
    if (url === "/api/account/delete-intent") return Response.json({ url: "/api/auth/kakao/start?purpose=delete&intent=x" });
    return Response.json({ payments: true, login: true, owner: false, user: null });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

describe("AccountPanel", () => {
  it("shows the nickname, 별조각 with their last day, the unopened purchase and the receipt", async () => {
    render(<AccountPanel account={account} />);
    expect(screen.getByRole("heading", { name: "별빛" })).toBeTruthy();
    expect(screen.getByText("10개")).toBeTruthy();
    expect(screen.getByText(/12월 30일까지/)).toBeTruthy();
    expect(screen.getByText("타로 전체 풀이 · 열지 않음")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "영수증 보기" })).getAttribute("href")).toBe("https://dashboard.tosspayments.com/receipt/x");
    expect(screen.queryByText(/계정에 보관하기/)).toBeNull();
  });

  it("refunds an unopened purchase after a confirm", async () => {
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "전액 환불받기" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/pay/refund" && (r.body as { orderId: string }).orderId === "Ab3_dEf-Gh5iJk7Lm9No1Pq2")).toBe(true));
    expect(await screen.findByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
  });

  it("starts the deletion only through the Kakao re-check, and says what it does", async () => {
    const navigate = vi.fn();
    render(<AccountPanel account={account} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("열지 않은 결제 1건은 전액 환불돼요")).toBeTruthy();
    expect(screen.queryByText(/별자리/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "카카오로 확인하고 탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?purpose=delete&intent=x"));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/app/me apps/web/lib/storage/pull.test.ts`
Expected: FAIL (modules and exports not found).

- [ ] **Step 3: Add the pull and delete helpers to `apps/web/lib/storage/sync.ts`**

```ts
import { useEffect } from "react";
import type { AccountState } from "@/lib/account/client";
import { forgetServerIds, mergeServerReadings } from "./chapters";

const SYNCED_KEY = "starlog.account-synced";
/** 50 readings a page: 1,000 per pull is far beyond any account; the next pull goes on from the top. */
const MAX_PAGES = 20;

/** Brings every reading in the account onto this device, page by page; how many were new here. */
export async function pullAccountReadings(fetchImpl: typeof fetch = fetch): Promise<number> {
  let added = 0;
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchReadingsPage(before ? { before } : {}, fetchImpl);
    if (!result) break;
    added += mergeServerReadings(result.readings);
    if (!result.next) break;
    before = result.next;
  }
  return added;
}

/** Deletes every reading saved in the account. This device keeps its own copies. */
export async function deleteAccountReadings(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("/api/readings?all=1", { method: "DELETE", credentials: "same-origin" });
    if (response.ok) forgetServerIds();
    return response.ok;
  } catch {
    return false;
  }
}

/** Once per tab, when a user is logged in: pull the account's readings onto this device. */
export function useAccountSync(account: AccountState | null | undefined): void {
  const loggedIn = Boolean(account?.user);
  useEffect(() => {
    if (!loggedIn) return;
    try {
      if (sessionStorage.getItem(SYNCED_KEY)) return;
      sessionStorage.setItem(SYNCED_KEY, "1");
    } catch {
      // storage blocked: pull anyway
    }
    void pullAccountReadings();
  }, [loggedIn]);
}
```

Merge the imports with the ones Task 15 put at the top of the file. `fetchReadingsPage` is already there.

- [ ] **Step 4: Write `apps/web/app/me/meStatus.ts`**

```ts
import { loginMessage } from "@/lib/account/client";

const DELETE_MESSAGES: Record<string, string> = {
  failed: "탈퇴를 마치지 못했어요. 다시 시도해 주세요.",
  mismatch: "로그인한 카카오 계정과 달라요. 같은 계정으로 다시 시도해 주세요.",
  "refund-failed": "환불을 마치지 못해 탈퇴를 멈췄어요. 문의해 주세요.",
  pending: "결제 확인이나 환불이 아직 진행 중이에요. 10분쯤 뒤에 다시 시도해 주세요.",
  "in-use": "지금 열고 있는 풀이가 있어요. 풀이가 끝난 뒤 다시 시도해 주세요.",
  cancel: "탈퇴를 취소했어요",
  unavailable: "지금은 탈퇴를 처리할 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** The one line 내 정보 shows for ?account=, ?delete= or ?login=. */
export function meStatusMessage(query: { account?: string; delete?: string; login?: string }): string | null {
  if (query.account === "deleted") return "탈퇴했어요. 그동안 고마웠어요.";
  if (query.delete) return DELETE_MESSAGES[query.delete] ?? DELETE_MESSAGES.failed!;
  return loginMessage(query.login ?? null);
}
```

- [ ] **Step 5: Write `apps/web/app/me/OrderHistory.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { won } from "@/lib/config";
import { productById } from "@/lib/pay/catalog";
import { getJson } from "@/lib/reading/api";
import s from "./account.module.css";

interface OrderItem {
  orderId: string;
  productId: string;
  amount: number;
  status: "confirming" | "paid" | "refunding" | "refunded" | "created" | "failed";
  createdAt: number;
  receiptUrl: string | null;
  method: string | null;
  refundable: boolean;
  opened: boolean;
}

const label = (item: OrderItem) =>
  item.status === "paid" ? (item.opened ? "열어 봤어요" : "열지 않음") : item.status === "refunded" ? "환불됨" : item.status === "refunding" ? "환불 중" : "확인 중";

const day = (ms: number) => {
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
};

/** 결제 내역 with Toss receipts (spec section 6). The 환불받기 link of a failed paid reading points here (#orders). */
export function OrderHistory() {
  const [items, setItems] = useState<OrderItem[] | null>(null);
  useEffect(() => {
    void getJson<{ orders: OrderItem[] }>("/api/pay/orders").then((res) => setItems(res.ok ? res.data.orders : []));
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section id="orders" className={s.orders} aria-labelledby="orders-title">
      <h3 id="orders-title" className={s.sectionTitle}>
        결제 내역
      </h3>
      <ul className={s.orderList}>
        {items.map((item) => (
          <li key={item.orderId} className={s.order}>
            <span className={s.muted}>{day(item.createdAt)}</span>
            <span>{productById(item.productId)?.name ?? "풀이"}</span>
            <span>{won(item.amount)}</span>
            <span className={s.muted}>{label(item)}</span>
            {item.receiptUrl ? (
              <a className={s.link} href={item.receiptUrl} target="_blank" rel="noopener noreferrer">
                영수증 보기
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Write `apps/web/app/me/AccountPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { logout, refreshAccount, type AccountState, type AccountUser } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { productById } from "@/lib/pay/catalog";
import { postJson } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import { deleteAccountReadings } from "@/lib/storage/sync";
import { OrderHistory } from "./OrderHistory";
import s from "./account.module.css";

const lastDay = (iso: string) => {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};
const openHref = (productId: string) => (productId === "saju" ? "/saju/new" : "/tarot/new");

type AccountPanelProps = {
  account: AccountState & { user: AccountUser };
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * 내 정보 for a logged-in user (spec section 9):
 * - nickname, 별조각 with their last day, unopened purchases (열기, 환불받기), 결제 내역 with receipts;
 * - deleting the account's copies of readings;
 * - 로그아웃, and 회원 탈퇴 (always through the Kakao re-check).
 */
export function AccountPanel({ account, navigate = (url) => window.location.assign(url) }: AccountPanelProps) {
  const { user } = account;
  const { free } = SITE.currency;
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState<"refund" | "delete" | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const refund = async () => {
    if (!refundId) return;
    const res = await postJson("/api/pay/refund", { orderId: refundId });
    setSheet(null);
    setNotice(res.ok ? "환불했어요. 카드사에 따라 며칠 걸릴 수 있어요." : describeApiError(res.error).title);
    await refreshAccount();
    setHistoryKey((key) => key + 1);
  };

  const startDelete = async () => {
    const res = await postJson<{ url: string }>("/api/account/delete-intent", {});
    if (res.ok) navigate(res.data.url);
    else {
      setSheet(null);
      setNotice(describeApiError(res.error).title);
    }
  };

  return (
    <section className={s.account} aria-labelledby="account-title">
      <h2 id="account-title" className={s.name}>
        {user.nickname}
      </h2>
      <p className={s.muted}>카카오로 로그인했어요</p>

      <p className={s.balance}>
        <span className={s.balanceLabel}>{free}</span>
        <span>{`${user.stardust}개`}</span>
        {user.stardust > 0 && user.stardustExpiresAt ? <span className={s.muted}>{` · ${lastDay(user.stardustExpiresAt)}까지`}</span> : null}
      </p>

      {user.unused.length > 0 ? (
        <ul className={s.unused} aria-label="결제한 풀이">
          {user.unused.map((item) => (
            <li key={item.orderId} className={s.unusedItem}>
              <span>{`${productById(item.productId)?.name ?? "풀이"} · 열지 않음`}</span>
              <Button href={openHref(item.productId)} variant="secondary" size="md">
                열기
              </Button>
              <button
                type="button"
                className={s.link}
                onClick={() => {
                  setRefundId(item.orderId);
                  setSheet("refund");
                }}
              >
                환불받기
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <OrderHistory key={historyKey} />

      <p className={s.notice} role="status">
        {notice}
      </p>

      <div className={s.actions}>
        <button
          type="button"
          className={s.link}
          onClick={() => void deleteAccountReadings().then((ok) => setNotice(ok ? "계정에 보관한 풀이를 지웠어요. 이 기기의 기록은 그대로예요." : "지우지 못했어요. 다시 시도해 주세요."))}
        >
          계정에 보관한 풀이 모두 지우기
        </button>
        <button type="button" className={s.link} onClick={() => void logout().then(() => setNotice("로그아웃했어요"))}>
          로그아웃
        </button>
        <button type="button" className={s.link} onClick={() => setSheet("delete")}>
          회원 탈퇴
        </button>
      </div>

      <Modal open={sheet === "refund"} onClose={() => setSheet(null)} labelledBy="refund-title">
        <div className={s.confirm}>
          <h2 id="refund-title" className={s.sectionTitle}>
            이 결제를 환불할까요?
          </h2>
          <p>열지 않은 풀이라 결제한 금액 전액을 돌려 드려요.</p>
          <Button block onClick={() => void refund()}>
            전액 환불받기
          </Button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>

      <Modal open={sheet === "delete"} onClose={() => setSheet(null)} labelledBy="delete-title">
        <div className={s.confirm}>
          <h2 id="delete-title" className={s.sectionTitle}>
            탈퇴할까요?
          </h2>
          <ul className={s.list}>
            {user.unused.length > 0 ? <li>{`열지 않은 결제 ${user.unused.length}건은 전액 환불돼요`}</li> : null}
            <li>{`남은 ${free}은 사라져요`}</li>
            <li>계정에 보관한 풀이가 지워져요</li>
            <li>결제 기록은 법에 따라 5년 동안 보관돼요</li>
            <li>이 기기의 기록은 아래 ‘이 기기에 저장된 기록 모두 지우기’로 따로 지울 수 있어요</li>
          </ul>
          <button type="button" className={s.danger} onClick={() => void startDelete()}>
            카카오로 확인하고 탈퇴하기
          </button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>
    </section>
  );
}
```

`apps/web/app/me/account.module.css`: classes `account`, `name`, `muted`, `balance`, `balanceLabel`, `unused`, `unusedItem`, `link`, `orders`, `sectionTitle`, `orderList`, `order`, `notice`, `actions`, `confirm`, `list` and `danger`.
- Follow `MeView.module.css`: same tokens, ≥13px, tap targets ≥44px (`.link` and `.danger` with `min-height: 44px`).
- `.danger` copies the existing `.confirmErase` look.
- The 환불 modal's `전액 환불받기` is the only gold button on screen while it is open.

- [ ] **Step 7: Rewire `MeView.tsx` and the page.**
  - `apps/web/app/me/page.tsx`:
    - drop `WALLET_FIXTURE` and `SITE.features.payments`;
    - make it `async ({ searchParams }: PageProps<"/me">)`;
    - pass `status={meStatusMessage({ account: str(query.account), delete: str(query.delete), login: str(query.login) })}`, with `const str = (v: unknown) => (typeof v === "string" ? v : undefined)`.
  - `MeView.tsx`:
    - props become `{ status: string | null }`;
    - remove `wallet`, `balance`, `buy`, the `packs` sheet and the `MoonPackSheet` import, then delete `MoonPackSheet.tsx`;
    - add `const account = useAccount(); useAccountSync(account);`;
    - show `status` in the existing `notice` line (initial state `status ?? ""`).
  - Where the wallet block and the 오픈 기념 section (`s.beta`) are now:

```tsx
        {account?.user ? (
          <AccountPanel account={{ ...account, user: account.user }} />
        ) : account?.payments ? (
          <section className={s.beta} aria-labelledby="login-title">
            <h2 id="login-title" className={s.betaTitle}>로그인하면 결제한 풀이를 다른 기기에서도 볼 수 있어요</h2>
            <Button href={loginHref("/me")} block>카카오로 로그인</Button>
          </section>
        ) : (
          <>
            {/* the existing 오픈 기념 section, unchanged */}
            {account?.login ? (
              <p className={s.provider}>
                <Link href={loginHref("/me")}>결제한 풀이가 있다면 로그인</Link>
              </p>
            ) : null}
          </>
        )}
```

  - While payments are on for this device the 오픈 기념 section is hidden: the free daily full reading has ended then, and the signup gift takes its place (spec 12). While paused, it shows again with the quiet login link.
  - The header's `로그인 없이, 기록은 이 기기에 보관돼요` line shows only when `!account?.user`.
  - The erase modal's text gains, when `account?.user` is set: ` 계정에 보관한 풀이는 그대로예요.`
  - `apps/web/app/story/StoryView.tsx`: add `useAccountSync(useAccount());` at the top of the component, so 내 기록 shows readings opened on another device.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run apps/web/app/me apps/web/lib/storage apps/web/app/story apps/web/components`
Expected: PASS (meStatus 1, pull 2, AccountPanel 3; the storage, sync and layout tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0. `WALLET_FIXTURE` may now be unused in `lib/fixtures.ts`; leave it unless the typecheck or a test fails.

- [ ] **Step 9: Commit**

```bash
git rm apps/web/app/me/MoonPackSheet.tsx
git add apps/web/lib/storage/sync.ts apps/web/lib/storage/pull.test.ts apps/web/app/me apps/web/app/story/StoryView.tsx
git commit -m "feat(me): account, 별조각, purchases with refunds and receipts, paged sync and deletion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Legal pages — pricing, refund, terms, privacy

The four pages are owned jointly with the trust-pages work (P2b), P3 (별자리 인연 sections behind `SITE.features.bonds`), the copy pass of `97ec7df` (no 베타, no model names) and the SEO pass (`pageMetadata`), so edit them section by section. Written against aa70830.
- Keep every section this task does not name, and keep later wording that does not contradict this task.
- The pages describe the paid service as launched (what Toss's review reads).
- While sales are not open for the visitor, one client-side note keeps today's 오픈 기념 line: `PaymentsNote`, driven by `/api/me`. The static pages need no rebuild when `STARLOG_PAYMENTS` flips.

**Files:**
- Create: `apps/web/components/legal/PaymentsNote.tsx`
- Modify: `apps/web/app/pricing/page.tsx`, `apps/web/app/refund/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/lib/legal.ts` (`LEGAL_EFFECTIVE_DATE`), and the tests that pin text this task removes on purpose: `app/pricing/page.test.tsx`, `components/legal/LegalPages.test.tsx`, `components/legal/PolicyContent.test.tsx`, `lib/legal.test.ts`, `components/info/InfoPages.test.tsx`
- Test: `apps/web/components/legal/p4Policies.test.tsx`

**Interfaces:**
- Consumes: `standardProduct`, `GIFT_DAYS` (Task 2), `useAccount` (Task 14), `SITE`, `won`, `LegalPage`/`LegalSection`/`LegalNote`, the `times()` helper the pages already use.
- Produces:
  - `PaymentsNote({ children })`: renders its children only when `/api/me` says sales are closed for this visitor;
  - `LEGAL_EFFECTIVE_DATE = "2026-10-15"` (spec 14, default 17; the controller moves it if the deploy slips).

**Critique items handled here:**
- **M6:** the privacy policy no longer says that reading inputs are never stored on the server. Three places said so: the 한눈에 보기 note, the first 보유 기간 item and the 안전성 item. Each now separates readings opened without login (not stored, as before) from readings opened while logged in (stored encrypted in the account, erased on request or deletion). The closing sentence of 1항 that promised to add login and payment "before introducing them" goes.
- **M7:** 제5조 of the terms gets the minor's right to cancel a contract made without the guardian's consent (민법 제5조, with the exceptions of 제6조 and 제17조). /refund keeps its 미성년자 section and says where to apply. The checkout line is in Task 16, and the manual refund path in the runbook (Task 19).
- **M9:** no "베타" anywhere: the 오픈 기념 wording stays. 제4조 says the 오픈 기념 free reading ends when payments open for everyone and the signup gift replaces it. No model name on any page. "Anthropic, PBC" stays only as the company in the privacy policy's 국외 이전 cards (개인정보보호법 제28조의8).
- **Minor 14:** "기한 없이 전액 환불" gets its fallback. When the card company's cancel window has passed, the refund goes to a bank account the buyer names.
- The 민법 articles are cited for the minor's right. The notice duty of the 전자상거래법 is described without an article number, because its number was not checked against the statute text (spec 15).

- [ ] **Step 1: Write the failing test** — `apps/web/components/legal/p4Policies.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

afterEach(cleanup);

const text = (node: ReactElement) => render(node).container.textContent ?? "";
const MODEL_NAMES = /Claude|클로드|Opus|오푸스|Sonnet|GPT|Gemini/;

describe("policies for the paid launch", () => {
  it("/pricing sells the two standard readings by name and price, and no 달빛 packs", () => {
    const page = text(<PricingPage />);
    expect(page).toContain("타로 전체 풀이");
    expect(page).toContain("사주 전체 풀이");
    expect(page).toContain("2,900원");
    expect(page).toContain("이 기기에 계속 보관");
    expect(page).toContain("받은 날부터 90일째 되는 날까지 쓸 수 있어요");
    expect(page).not.toMatch(/충전|심층 풀이|프롤로그/);
    expect(page).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("/refund: 제공 means saved to the account; unopened is refundable any time, with a fallback", () => {
    const page = text(<RefundPage />);
    expect(page).toContain("제17조 제2항 제5호");
    expect(page).toContain("완성되어 계정에 저장되면");
    expect(page).toContain("기한 없이 전액 환불");
    expect(page).toContain("계좌로 환불");
    expect(page).toContain("내 정보 > 결제 내역");
    expect(page).toContain("90일");
    expect(page).toContain("법정대리인");
    expect(page).not.toContain("충전");
  });

  it("/terms: Kakao members, item-by-item payment, 별조각 rules, minors, deletion, no model name", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("카카오 계정으로 로그인");
    expect(page).toContain("건별로 결제");
    expect(page).toContain("제7조의2 (별조각)");
    expect(page).toContain("민법 제5조");
    expect(page).toContain("열지 않은 결제 풀이는 전액 환불");
    expect(page).toContain("가입 선물");
    expect(page).not.toContain("충전");
    expect(page).not.toMatch(MODEL_NAMES);
    expect(page).not.toContain("Anthropic");
  });

  it("/privacy: what an account keeps, for how long, and who processes it; never 'not stored' without a condition", () => {
    const page = text(<PrivacyPage />);
    expect(page).toContain("카카오 회원번호");
    expect(page).toContain("되돌릴 수 없는 값");
    expect(page).toContain("암호화");
    expect(page).toContain("로그인하지 않고 연 풀이");
    expect(page).toContain("5년");
    expect(page).toContain("3년");
    expect(page).toContain("토스페이먼츠 주식회사");
    expect(page).toContain("sl_sid");
    expect(page).toContain("Anthropic, PBC");
    expect(page).not.toContain("결제 도입 시");
    expect(page).not.toContain("지금은 로그인이 없어");
    expect(page).not.toContain("풀이 입력을 서버에 저장하지 않고");
    expect(page).not.toMatch(MODEL_NAMES);
  });

  it("none of the four says 베타", () => {
    for (const page of [<PricingPage key="p" />, <RefundPage key="r" />, <TermsPage key="t" />, <PrivacyPage key="v" />]) {
      expect(text(page)).not.toContain("베타");
      cleanup();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/components/legal/p4Policies.test.tsx`
Expected: FAIL. The pricing page still names "타로 심층 풀이" and has the 달빛 충전 section; privacy still says "결제 도입 시" and "지금은 로그인이 없어".

- [ ] **Step 3: Write `apps/web/components/legal/PaymentsNote.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/lib/account/client";

/**
 * The legal pages describe the paid service. While sales are closed for this visitor
 * (STARLOG_PAYMENTS off, owner-only or paused), this note keeps today's 오픈 기념 line. It is read at
 * run time from /api/me, so flipping the flag needs no rebuild of the static pages.
 */
export function PaymentsNote({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (account === undefined || account?.payments) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: `/pricing`** (`apps/web/app/pricing/page.tsx`)
  - The `description` passed to `pageMetadata` (aa70830): `타로 전체 풀이 ${won(…)}, 사주 전체 풀이 ${won(…)}. 풀이 한 번에 담기는 것, 준비 중인 풀이, 무료로 볼 수 있는 부분과 별조각, 결제 수단을 안내해요.` Every `사주 프롤로그` left on the page becomes `사주 전체 풀이`.
  - Wrap the existing `LegalNote` (the 오픈 기념 line) in `<PaymentsNote>`. Keep its wording.
  - `PRODUCTS`:
    - names from the catalog: `standardProduct("tarot").name` → `타로 전체 풀이`, `standardProduct("saju").name` → `사주 전체 풀이`;
    - prices from `standardProduct(…).krw`;
    - the card checklist keeps the owner's lines: `소제목으로 나눈 풀이 전체 · 약 N자`, `이어서 물어보기 N번`, `이 기기에 계속 보관`.
  - Under the cards: `결제하거나 ${currency.free}으로 열어도 풀이 내용과 이어서 물어보기, 보관 범위는 같아요. 로그인해서 연 풀이는 계정에도 보관돼 다른 기기에서 볼 수 있어요.`
  - `#premium` stays as it is.
  - `#free`:
    - wrap the 오픈 기념 "하루 N번" item in `<PaymentsNote>` (it shows while sales are closed);
    - keep the teaser, 오늘의 한 장 and 지금의 한 장 lines;
    - the gift line becomes `처음 가입하면 ${currency.free} ${price.signupGiftFree}개를 드려요. 전체 풀이를 ${count(giftReadings)} 무료로 열 수 있어요. 받은 날부터 ${GIFT_DAYS}일째 되는 날까지 쓸 수 있어요.` (keep or reintroduce the `count` helper: 1 → `한 번`, n → `n번`). `GIFT_DAYS` comes from `@/lib/pay/catalog` (Task 2).
  - Remove the `#moonlight` section and the sentence after its table that names the 바로 결제 prices.
  - `#stardust`:

```tsx
      <LegalSection id="stardust" title={currency.free}>
        <ul className={s.list}>
          <li>{`${currency.free}은 가입 선물처럼 ${nameKo}가 무료로 드리는 재화예요. 전체 풀이 한 번에 ${price.unitsPerReading}개가 쓰여요.`}</li>
          <li>{`받은 날부터 ${GIFT_DAYS}일째 되는 날 밤 12시(한국 시간)까지 쓸 수 있고, 여러 번 받았다면 먼저 사라지는 것부터 쓰여요.`}</li>
          <li>무료로 받은 재화라 환불 대상이 아니고, 현금으로 바꾸거나 다른 사람에게 넘길 수 없어요. 탈퇴하면 남은 별조각은 사라져요.</li>
        </ul>
      </LegalSection>
```

  - `#payment`:

```tsx
      <LegalSection id="payment" title="결제 수단과 영수증">
        <p>토스페이먼츠를 통해 신용·체크카드와 간편결제로 결제할 수 있어요. 풀이는 건별로 결제하고, 결제하면 바로 열려요.</p>
        <p>영수증은 내 정보 &gt; 결제 내역에서 볼 수 있어요.</p>
        <p>
          {"결제한 풀이는 완성되어 열리는 순간부터 청약철회가 제한돼요. 열기 전에는 언제든 전액 환불받을 수 있어요. 자세한 내용은 "}
          <Link href="/refund">환불 정책</Link>
          {"에 적어 두었어요."}
        </p>
      </LegalSection>
```

  - Drop the `packReadings`/`perReadingLabel` imports if nothing uses them now.

- [ ] **Step 5: `/refund`** (`apps/web/app/refund/page.tsx`)
  - The `description` passed to `pageMetadata`: `${SITE.nameKo} 풀이의 청약철회·환불 기준, 결제 전 무료로 보는 부분, 생성 실패 시 처리, 미성년자 결제 취소, 환불 신청 방법과 처리 기간을 안내해요.`
  - Remove the `refundExample` helper, the `moonRefundKrw` import and the `#moonlight` section.
  - The `LegalNote`: keep `오픈 기념 무료 풀이는 결제가 없어 환불 대상이 아니에요.`; its second paragraph ends `아래 기준은 결제한 풀이에 적용해요.` (no 충전).
  - `#withdrawal`: in the first paragraph, the sentence about when 제공 starts becomes `${SITE.nameKo}에서는 결제한 풀이가 완성되어 계정에 저장되면(화면에 열리면) 제공이 시작된 것으로 봐요.` Keep the 제17조 제6항 paragraph about the free part. Remove the `충전한 … 가운데` paragraph.
  - `#before-open`:

```tsx
        <p>결제한 풀이를 열기 전에는 기한 없이 전액 환불받을 수 있어요. 내 정보 &gt; 결제 내역에서 ‘환불받기’를 누르면 바로 처리돼요.</p>
        <p>카드사가 결제를 취소해 주는 기간이 지났다면, 알려 주신 본인 명의 계좌로 환불해 드려요.</p>
```

  - `#failure`:

```tsx
        <ul className={s.list}>
          <li>{`풀이가 끝까지 완성되지 않았다면(생성 오류, 자동 품질 검사 탈락, 시간 초과) 결제한 풀이나 쓰려던 ${free}은 쓰이지 않아요. 같은 풀이를 다시 열 때 한 번 더 결제하지 않아요.`}</li>
          <li>연결이 끊겼는데 풀이는 완성됐다면, 그 풀이는 내 기록과 계정에 남아 있어요. 내 정보에서 결제한 풀이와 기록을 확인할 수 있어요.</li>
          <li>결제한 풀이라면 다시 여는 대신 바로 전액 환불받을 수도 있어요.</li>
          <li>풀이가 결제 전에 안내한 내용과 다르게 제공됐다면, 확인한 뒤 같은 기준으로 처리해요.</li>
        </ul>
```

  - `#stardust`: `<p>{`${free}은 가입 선물처럼 무료로 드린 재화라 환불 대상이 아니에요. 받은 날부터 ${GIFT_DAYS}일째 되는 날까지 쓸 수 있고, 현금으로 바꾸거나 다른 사람에게 넘길 수 없어요.`}</p>`
  - `#minor`: keep its three items and add `<li>취소는 아래 문의처로 신청해 주세요. 확인한 뒤 결제를 취소하고 결제한 수단으로 환불해 드려요.</li>`.
  - `#how`:

```tsx
        <ul className={s.list}>
          <li>열지 않은 결제는 내 정보 &gt; 결제 내역의 ‘환불받기’로 바로 환불돼요.</li>
          <li>그 밖의 환불은 아래 문의처로 결제일, 결제 금액, 로그인한 계정의 닉네임, 환불 사유를 알려 주세요. 확인한 날부터 영업일 기준 3~7일 이내에 결제한 수단으로 환불해 드려요.</li>
          <li>카드사나 결제사 사정에 따라 실제로 반영되기까지 며칠 더 걸릴 수 있어요.</li>
        </ul>
```

  - `#law`: replace `가격과 ${paid} 충전 상품은` with `가격은`. Remove `paid` from the destructuring if nothing uses it now.

- [ ] **Step 6: `/terms`** (`apps/web/app/terms/page.tsx`; keep the formal 합니다체 the page uses)
  - 제2조 (정의): remove the 달빛 item (`…대금을 내고 충전해…`); replace the 회원/비회원 item, and add the 전체 풀이 item if missing:

```tsx
          <li>“회원”이란 카카오 계정으로 로그인해 서비스를 이용하는 사람을, “비회원”이란 로그인하지 않고 이용하는 사람을 말합니다.</li>
          <li>“전체 풀이”란 무료로 공개하는 부분을 넘어 소제목 전체와 이어서 물어보기를 담은 풀이를 말하며, 건별로 결제하거나 별조각으로 엽니다.</li>
```

    The 별조각 item stays.
  - 제4조: after the item that starts `운영자는 오픈 기념으로 하루 이용 횟수 안에서`, add `<li>결제가 모든 이용자에게 열리면 오픈 기념 무료 제공은 끝나고, 처음 가입하는 회원에게 드리는 가입 선물(별조각)로 바뀝니다. 운영자는 이를 7일 전부터 서비스 안에 공지합니다.</li>`
  - 제5조 (이용 연령): keep its paragraph, then add:

```tsx
        <p>
          만 19세 미만인 미성년자가 법정대리인의 동의 없이 유료 서비스를 결제한 경우, 미성년자 본인이나 법정대리인은 그 계약을 취소할 수 있습니다(민법 제5조).
          다만 미성년자가 속임수로 자신을 성년자로 믿게 하거나 법정대리인의 동의가 있는 것으로 믿게 한 경우(민법 제17조), 법정대리인이 처분을 허락한
          재산의 범위에서 결제한 경우(민법 제6조)에는 취소할 수 없습니다. 운영자는 결제 화면에서 이 내용을 알립니다.
        </p>
```

  - 제6조 (회원과 비회원 이용), items 2 and 3:

```tsx
          <li>{`회원 가입은 카카오 계정으로 로그인해서 하며, 처음 가입하면 가입 선물로 ${free}을 드립니다. 가입 선물은 카카오 계정 하나에 한 번만 드립니다.`}</li>
          <li>{`회원은 언제든지 내 정보에서 탈퇴할 수 있습니다. 탈퇴하면 열지 않은 결제 풀이는 전액 환불하고, 남은 ${free}은 사라지며, 계정에 보관한 풀이는 지웁니다. 결제 기록은 관련 법령이 정한 기간 동안 보관합니다.`}</li>
```

  - 제7조 (유료 서비스와 결제), the whole list:

```tsx
        <ol className={s.list}>
          <li>
            {"전체 풀이의 가격은 "}
            <Link href="/pricing">가격 안내</Link>
            {"에 게시합니다. 이용자는 전체 풀이를 건별로 결제하며, 결제 금액은 운영자가 상품별로 정한 금액입니다."}
          </li>
          <li>결제는 토스페이먼츠를 통해 카드와 간편결제로 할 수 있습니다. 결제하려면 회원으로 로그인해야 합니다.</li>
          <li>운영자는 결제 전에 가격, 포함 내용, 청약철회가 제한되는 경우를 알리고 이용자의 확인을 받습니다.</li>
          <li>
            {"결제한 풀이는 완성되어 계정에 저장된 때 제공된 것으로 봅니다. 청약철회와 환불은 "}
            <Link href="/refund">환불 정책</Link>
            {"을 따릅니다."}
          </li>
          <li>{`결제로 열든 ${free}으로 열든 풀이의 내용과 이어서 물어보기, 보관 범위는 같습니다.`}</li>
          <li>가격 안내에 준비 중으로 표시한 풀이는 판매를 시작하기 전에 가격과 제공 내용을 알리며, 그 전에는 결제를 받지 않습니다.</li>
          <li>{`풀이가 완성되어 저장되지 않으면 결제한 풀이나 ${free}을 쓰지 않습니다.`}</li>
          <li>영수증은 내 정보의 결제 내역에서 확인할 수 있습니다.</li>
        </ol>
```

  - Add after 제7조:

```tsx
      <LegalSection id="stardust" title="제7조의2 (별조각)">
        <ol className={s.list}>
          <li>{`${free}은 무료로 지급하는 재화로, 환불하거나 현금으로 바꾸거나 다른 사람에게 넘길 수 없습니다.`}</li>
          <li>{`${free}은 받은 날부터 ${GIFT_DAYS}일째 되는 날의 자정(한국 시간)까지 쓸 수 있으며, 여러 번 받은 경우 먼저 사라지는 것부터 씁니다.`}</li>
          <li>{`탈퇴하면 남은 ${free}은 사라집니다.`}</li>
        </ol>
      </LegalSection>
```

  - 제9조 3항: `<li>유료 서비스를 종료할 때는 30일 전에 공지하고, 열지 않은 결제 풀이는 전액 환불합니다.</li>`
  - Remove `paid` from the destructuring if it is no longer used. 제4조의2 (생성형 인공지능) stays as it is: no model name.

- [ ] **Step 7: `/privacy`** (`apps/web/app/privacy/page.tsx`)
  - 한눈에 보기 (`LegalNote`), the first paragraph becomes (M6):

```tsx
        <p>
          로그인하지 않으면 이름이나 연락처를 받지 않고, 풀이에 쓰는 질문과 출생 정보는 풀이를 만드는 동안에만 운영자의 서버를 거쳐 AI 사업자에게
          전달될 뿐 서버에 남기지 않습니다. 카카오로 로그인해 결제하거나 별조각으로 연 풀이는 질문·출생 정보와 함께 암호화해 운영자의
          저장소(Cloudflare D1)에 보관하고, 내 정보에서 지우거나 탈퇴하면 파기합니다. 회원 정보로는 카카오 회원번호를 되돌릴 수 없게 바꾼 값과
          닉네임만 둡니다.
        </p>
```

  - `#items`: add before the `서비스를 이용하는 동안 자동으로 생기는 정보` heading:

```tsx
        <h3 className={s.sub}>회원(카카오 로그인)</h3>
        <ul className={s.list}>
          <li>카카오 회원번호: 되돌릴 수 없는 값(HMAC)으로 바꿔서만 저장하며, 카카오의 접근 토큰은 저장하지 않습니다</li>
          <li>닉네임(카카오 동의 항목), 만 14세 이상 확인 시각, 로그인 세션</li>
          <li>결제 기록: 주문번호, 상품, 금액, 결제수단 종류, 승인·취소 시각과 영수증 주소. 카드번호 등 결제 정보는 토스페이먼츠가 처리하며 운영자는 받지 않습니다</li>
          <li>로그인해서 연 풀이: 질문, 상황, 메모 또는 출생 정보와 풀이 결과, 이어서 물어본 내용. 암호화해서 저장합니다</li>
          <li>수집 출처: 카카오(카카오 로그인 시 회원번호와 닉네임)</li>
        </ul>
```

    Remove the closing paragraph `로그인, 결제…처럼 운영자의 서버에 정보를 저장해야 하는 기능을 열 때는…`: those features are now described here.
  - `#purposes`: replace `(결제 도입 시) 결제와 환불 처리, 거래 기록 보관` with three items:
    - `회원 관리(로그인, 탈퇴), 결제와 환불 처리, 거래 기록 보관`;
    - `가입 선물의 중복 지급 방지`;
    - `로그인해서 연 풀이를 다른 기기에서 보여 주기`.
  - `#retention`:
    - the first item becomes `<li>로그인하지 않고 연 풀이의 입력(질문, 상황, 메모, 출생 정보, 후속 질문, 지난 풀이 요약)은 운영자의 서버에 저장하지 않습니다. 풀이를 생성하는 동안에만 쓰고, 생성이 끝나면 바로 파기합니다.</li>`;
    - add after it: `<li>로그인해서 연 풀이는 계정에 암호화해 보관하고, 이용자가 내 정보에서 지우거나 탈퇴하면 지체 없이 파기합니다.</li>`;
    - replace the `결제를 도입하면 …` item with:

```tsx
          <li>회원 정보는 탈퇴할 때까지 보관하고, 탈퇴하면 지체 없이 파기합니다. 로그인 세션은 30일 뒤 끝나고, 끝난 세션 기록은 지웁니다.</li>
          <li>「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 등에 관한 기록과 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁처리에 관한 기록은 3년 동안 보관합니다. 탈퇴한 회원의 이 기록은 회원 식별 정보(카카오 회원번호를 바꾼 값, 닉네임)를 지운 채 보관하고, 기간이 끝나면 파기합니다.</li>
          <li>가입 선물을 다시 받는 것을 막기 위해, 카카오 회원번호를 되돌릴 수 없게 바꾼 값과 지급 시각을 탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.</li>
```

  - `#processors`: the Toss entry's name becomes `토스페이먼츠 주식회사` (drop `(결제 도입 시)`), and its `맡기는 일` becomes `결제 처리(카드·간편결제 승인과 취소)`. The Cloudflare entry's `맡기는 일` includes `회원·결제 기록과 로그인해서 연 풀이의 저장(D1)`; keep P3's wording if it already says 저장. The Anthropic, PBC entry stays as it is.
  - `COOKIES`: add
    - `["sl_sid", "로그인 세션을 알아보는 값입니다. 30일 뒤 만료되고, 로그아웃하면 바로 끝납니다."]`;
    - `["sl_oauth", "카카오 로그인이 이 브라우저에서 시작됐는지 확인하는 값입니다. 10분 뒤 만료됩니다."]`.
  - `#rights`, add: `<li>로그인해서 연 풀이는 내 정보에서 지울 수 있고, 탈퇴도 내 정보에서 할 수 있습니다.</li>`
  - `#security`: the item `풀이 입력을 서버에 저장하지 않고, IP 주소는 …` becomes:

```tsx
          <li>로그인하지 않고 연 풀이의 입력은 서버에 저장하지 않고, 로그인해서 연 풀이는 AES-256-GCM으로 암호화해 저장하며, 카카오 회원번호와 IP 주소는 비밀 키로 변환한 값으로만 다루는 등 꼭 필요한 정보만 처리합니다.</li>
```

- [ ] **Step 8: `LEGAL_EFFECTIVE_DATE` and the old assertions**
  - `apps/web/lib/legal.ts`: `export const LEGAL_EFFECTIVE_DATE = "2026-10-15";`; update `lib/legal.test.ts` to match (`"2026년 10월 15일"`).
  - In `app/pricing/page.test.tsx`:
    - remove the assertions on the 달빛 pack text (the pack price, `보너스`, the per-reading pack price) and on the 오픈 기념 line, which is now inside the client-side note;
    - add `expect(text).not.toContain("충전")`.
  - In `LegalPages.test.tsx`, `PolicyContent.test.tsx` and `InfoPages.test.tsx`, replace only assertions on text this task removed (the 달빛 sections, `결제 도입 시`, `타로 심층 풀이`, `사주 프롤로그`, `지금은 로그인이 없어`), each with the matching new text from Steps 4–7. Never delete an assertion about text that stays.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run apps/web/components/legal apps/web/app/pricing apps/web/lib/legal.test.ts apps/web/components/info apps/web/lib/pay`
Expected: PASS (p4Policies 5; the edited pricing, legal and info tests).

Run: `pnpm typecheck`
Expected: exit 0.

The controller also runs `e2e/blind.spec.ts` after this task: no model name and no 베타 on these pages, and Anthropic, PBC on privacy only.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/legal apps/web/components/info/InfoPages.test.tsx apps/web/app/pricing apps/web/app/refund/page.tsx apps/web/app/terms/page.tsx apps/web/app/privacy/page.tsx apps/web/lib/legal.ts apps/web/lib/legal.test.ts
git commit -m "docs(legal): pricing, refund, terms and privacy for item-by-item payments and accounts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Bundle guard, e2e pay flow, runbook

**Files:**
- Modify: `scripts/check-client-bundle.mjs` (secret probes), `apps/web/playwright.config.ts` (webServer env), `apps/web/e2e/global-setup.ts` (compile `/pay/*`), `apps/web/package.json` (`e2e` migrates local D1 first)
- Create: `apps/web/e2e/pay-flow.spec.ts`, `docs/runbook-payments.md`

**Interfaces:**
- Consumes everything above. The e2e server runs `next dev` with `STARLOG_CF_DEV=1` (local D1, Task 1), `STARLOG_PAYMENTS=owner`, `STARLOG_PAY=mock`, `STARLOG_KAKAO=mock` and `STARLOG_AI=mock`.
- Produces: `pnpm check:bundle` fails on secrets in the client bundle; `pnpm e2e` covers gift → pay → auto-open → refund; and the rollout runbook.

The controller runs this task's builds and Playwright (global constraint). An implementer writes the files and runs only the Vitest parts.

- [ ] **Step 1: Secret probes in `scripts/check-client-bundle.mjs`.** Add after the `blindProbes` list (keep both existing probe lists as they are at aa70830):

```js
// Secrets must never reach the browser: Toss secret-key prefixes, and the real values when this shell
// has them (reported by name only, never printed).
const SECRET_PREFIXES = ["test_gsk_", "live_gsk_", "test_sk_", "live_sk_"];
const SECRET_NAMES = ["TOSS_SECRET_KEY", "KAKAO_CLIENT_SECRET", "STARLOG_ACCOUNT_SECRET", "STARLOG_SIGNING_SECRET", "STARLOG_CRON_SECRET", "ANTHROPIC_API_KEY", "STARLOG_OWNER_CODE"];
const secretProbes = [
  ...SECRET_PREFIXES.map((prefix) => ({ label: `secret key prefix ${prefix}`, value: prefix })),
  ...SECRET_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value && value.length >= 8 ? [{ label: `value of ${name}`, value }] : [];
  }),
];
```

In the scan loop, after the `blindProbes` loop:

```js
  for (const probe of secretProbes) {
    if (text.includes(probe.value)) hits.push(`${relative(root, path)}: ${probe.label}`);
  }
```

Add `secrets` to the failure heading's wording (`paid text, model names or secrets found in the client bundle`) and `${secretProbes.length} secret probes` to the success line. Keep the rest of both lines.

Run (controller, after `pnpm build`): `pnpm check:bundle`
Expected: the success line with the secret probes and `0 hits`.

- [ ] **Step 2: e2e server env.**
  - `apps/web/playwright.config.ts`: give `webServer` an `env`. It is merged over the inherited environment. Stop any dev server you already have running, because `reuseExistingServer` would keep its old env.

```ts
        env: {
          STARLOG_AI: "mock",
          STARLOG_CF_DEV: "1",
          STARLOG_PAYMENTS: "owner",
          STARLOG_PAY: "mock",
          STARLOG_KAKAO: "mock",
          STARLOG_OWNER_CODE: process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001",
        },
```

  - With `owner`, a browser without the owner pass sees exactly today's site (`/api/me` → `payments: false, login: false`), so the existing specs keep passing: `tarot-flow.spec.ts` asserts the sheet has no link, and it has none. `/login` renders (it is 404 only while `off`), so the `screens` case `login` keeps its page.
  - `apps/web/package.json`: `"e2e": "wrangler d1 migrations apply starlog --local && playwright test"`. Keep `e2e:screens` as it is.
  - `apps/web/e2e/global-setup.ts`: add `"/pay/checkout?product=tarot&returnTo=%2Ftarot%2Fresult"`, `"/pay/success"` and `"/pay/fail?code=PAY_PROCESS_CANCELED"` to `ROUTES`. These render a client view with status 200 even without a session.

- [ ] **Step 3: Write `apps/web/e2e/pay-flow.spec.ts`**

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Accounts and payments in owner mode (STARLOG_PAYMENTS=owner, mock Kakao and mock Toss, local D1):
 * the owner pass opens sales on this browser; everyone else keeps today's 오픈 기념 sheet, which the
 * other specs cover. A mock Kakao login without mockUser is a fresh account each time, so every run
 * starts with the gift. The question steps are the ones tarot-flow.spec.ts uses at aa70830.
 */

const NAV = 30_000;
const GENERATION = 120_000;
const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

async function ownAddress(page: Page, info: TestInfo) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${info.workerIndex}.${Math.floor(Math.random() * 250)}` });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
}

async function pickFanCard(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3) if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

/** 나 · 재물운 · 이번 주 → one situation chip → three cards → the result with its free teaser. */
async function toResult(page: Page) {
  await page.goto("/tarot/new");
  await page.getByRole("button", { name: "나", exact: true }).click();
  await page.getByRole("button", { name: "재물운" }).click();
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/tarot\/new\/situation$/, { timeout: NAV });
  await page.getByRole("button", { name: "지금은 수입이 없음" }).click();
  await page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(page).toHaveURL(/\/tarot\/draw$/, { timeout: NAV });
  await page.goto("/tarot/draw?instant=1");
  await expect(page.locator("[data-fan-index]")).toHaveCount(21);
  await settleAnimations(page);
  for (const n of [2, 9, 16]) await pickFanCard(page, n);
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result/, { timeout: NAV });
  await expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
}

test("owner mode: log in for the gift, open with 별조각, pay for the next, see it in 내 정보 and refund an unopened one", async ({ page }, info) => {
  test.setTimeout(600_000);
  await ownAddress(page, info);
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE } })).ok()).toBe(true);

  // 1. A guest is asked to log in, with the gift explained.
  await toResult(page);
  await expect(page.getByText("처음 가입하면 별조각 10개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요")).toBeVisible();
  await page.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftarot%2Fresult$/, { timeout: NAV });
  await page.getByRole("checkbox", { name: "만 14세 이상이에요" }).check();
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page).toHaveURL(/\/tarot\/result\?login=ok$/, { timeout: NAV });

  // 2. The gift opens the reading; it is saved on this device and in the account.
  await page.getByRole("button", { name: "별조각 10개로 보기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.stardust).toBe(0);
  const saved = await (await page.request.get("/api/readings?limit=5")).json();
  expect(saved.readings).toHaveLength(1);

  // 3. The next reading is paid: checkout with the 청약철회 and minor notices, mock Toss, back, opened automatically.
  await toResult(page);
  await page.getByRole("link", { name: "2,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await expect(page.getByText(/청약철회가 제한돼요/)).toBeVisible();
  await expect(page.getByText(/법정대리인의 동의 없이/)).toBeVisible();
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "2,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/chapter\/[a-z0-9]+$/, { timeout: GENERATION });

  // 4. A saju purchase left unopened shows in 내 정보 and refunds in full.
  await page.goto("/pay/checkout?product=saju&returnTo=%2Fme");
  await page.getByRole("checkbox", { name: "위 내용을 확인했어요" }).check();
  await page.getByRole("button", { name: "2,900원 결제하기" }).click();
  await expect(page).toHaveURL(/\/me/, { timeout: NAV });
  await expect(page.getByText("사주 전체 풀이 · 열지 않음")).toBeVisible({ timeout: NAV });
  await expect(page.getByRole("heading", { name: "결제 내역" })).toBeVisible();
  await page.getByRole("button", { name: "환불받기" }).click();
  await page.getByRole("button", { name: "전액 환불받기" }).click();
  await expect(page.getByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeVisible({ timeout: NAV });
  await expect(page.getByText("환불됨")).toBeVisible({ timeout: NAV });
});

test("a cancelled Toss window charges nothing and goes back", async ({ page }, info) => {
  await ownAddress(page, info);
  await page.goto("/pay/fail?code=PAY_PROCESS_CANCELED&message=x");
  await expect(page.getByText("결제를 취소했어요")).toBeVisible({ timeout: NAV });
  await expect(page.getByText("청구된 금액은 없어요.")).toBeVisible();
});

test("a browser without the owner pass keeps today's sheet in owner mode", async ({ page }, info) => {
  test.setTimeout(300_000);
  await ownAddress(page, info);
  await toResult(page);
  const sheet = page.getByRole("region", { name: "전체 풀이에 담긴 것" });
  await expect(sheet).toContainText(/오픈 기념으로 하루 .+ 무료예요/);
  await expect(sheet.getByRole("link")).toHaveCount(0);
});
```

If a button name in `toResult` changed after aa70830, take the current one from `tarot-flow.spec.ts`, which walks the same steps.

- [ ] **Step 4: Write `docs/runbook-payments.md`**

````markdown
# Runbook: accounts and payments (P4)

Spec: docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md (sections 12, 14, 15).
Commands run from `apps/web` unless noted. Never paste key values into chat, commits or logs.
D1 queries: `npx wrangler d1 execute starlog --remote --command "<SQL>"`.

## 1. One-time setup (owner)

- D1: `starlog` (id 78c6fb07-ee97-42d5-9633-21801fe596eb, binding DB), shared with P3. 0001 is applied in production; P4 adds 0002.
- Kakao developers console (the app that owns the REST API key):
  - 카카오 로그인 ON; 동의 항목: 닉네임 (필수); 클라이언트 시크릿 사용 ON (활성화 상태 "사용함").
  - Redirect URIs: https://starlog.yeolmaeapps.kr/api/auth/kakao/callback and http://localhost:3100/api/auth/kakao/callback.
  - Web platform domains: https://starlog.yeolmaeapps.kr, http://localhost:3100.
- Toss developers center (test keys first; the live ones come after the review, section 5):
  - 결제위젯(주문서형): variant DEFAULT with card + 간편결제 only (no 가상계좌, no 계좌이체); agreement variant AGREEMENT.
  - Webhook: https://starlog.yeolmaeapps.kr/api/pay/webhook, event PAYMENT_STATUS_CHANGED. Register it for the test MID now and check again after the live contract: the live MID may need its own registration (minor 13).
- Secrets (`npx wrangler secret put <NAME>`; each makes a new Worker version at once):
  - `STARLOG_ACCOUNT_SECRET`: 32+ random chars. NEVER rotate it: D1 pins it on first use (`meta.account_secret_check`) and every account route answers 503 if it changes. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
  - `STARLOG_CRON_SECRET`: 32+ random chars, same command. The Cron Trigger's bearer token.
  - `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`.
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY` and `TOSS_SECRET_KEY`: both test_ keys first. A mixed test/live pair is refused (503).
  - `STARLOG_PAYMENTS`: `off` (dark), `owner`, `on`, `paused` (rollback).

## 2. Deploy dark

1. `pnpm db:migrate:remote` → 0002_accounts_payments.sql applied, no error.
2. From the repo root: `pnpm deploy` (cf:build then OpenNext deploy; `wrangler.jsonc` `main` is `worker.mjs`, which wraps `.open-next/worker.js` and adds the cron). If OpenNext's deploy refuses the custom `main`, run `pnpm cf:build` and then `npx wrangler deploy` from apps/web.
3. `curl -s https://starlog.yeolmaeapps.kr/api/me` → `{"payments":false,"login":false,"owner":false,"user":null}`; `/login` is 404. The site is unchanged.
4. Cron: the Cloudflare dashboard (Workers > starlog > Triggers) lists `*/10 * * * *`. `npx wrangler tail` shows `cron.maintenance` every 10 minutes; none is `cron.no_secret` or `cron.maintenance_failed`.

## 3. Owner check in production (test keys)

`npx wrangler secret put STARLOG_PAYMENTS` → `owner`. On the owner-pass browser:

- [ ] result page shows `로그인하고 전체 풀이 보기`; another browser still shows the 오픈 기념 sheet
- [ ] Kakao login (real) → back with login=ok; 내 정보 shows the nickname and 별조각 10개 with its last day
- [ ] the first account request wrote `meta.account_secret_check` (`SELECT key FROM meta`)
- [ ] `별조각 10개로 보기` opens the reading; 별조각 0; the reading shows on another device after login
- [ ] test payment 2,900원 (test card) → reading opens by itself; 결제 내역 shows it with 영수증 보기
- [ ] pay in the KakaoTalk in-app browser, finish in the card app, come back in another browser: the success page says 결제했어요 and 로그인하고 풀이 열기 opens it
- [ ] buy another, leave it unopened → 환불받기 → Toss dashboard shows it cancelled; status 환불됨
- [ ] cancel a payment in the Toss dashboard → webhook → order 환불됨 within a minute
- [ ] 이어서 물어보기 on a paid reading → the answer also appears on another device
- [ ] turn on airplane mode during a paid generation → the page says 풀이가 열렸는지 확인하고 있어요, then either opens the reading or shows the purchase as still unopened (never both)
- [ ] 회원 탈퇴 with an unopened purchase → refunded, logged out, /me says 탈퇴했어요
- [ ] `pnpm check:bundle` on the deployed build: 0 hits
- [ ] `SELECT mode FROM payments` shows `test` for every payment above

## 4. Toss review

Apply for the live contract. The site already shows /pricing (products, prices), /refund, /terms, /privacy, the business footer, and the checkout with the 청약철회 and minor notices. Follow the Toss sales contact's checklist.

## 5. Live keys

1. Refund every test-mode order first (minor 12): live keys cannot cancel test payments.
   `SELECT o.id FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'test' AND o.status = 'paid'`
   Refund each from the owner's 내 정보 while the test keys are still in place.
2. `npx wrangler secret put NEXT_PUBLIC_TOSS_CLIENT_KEY` (live_gck_…) and `npx wrangler secret put TOSS_SECRET_KEY` (live_gsk_…), one right after the other.
3. Check the webhook for the live MID (section 1).
4. Still in owner mode: one real 2,900원 purchase opened, one real purchase refunded.

## 6. Switch on

After LEGAL_EFFECTIVE_DATE (lib/legal.ts; the changed terms are announced 7 days before):
`npx wrangler secret put STARLOG_PAYMENTS` → `on`. The 오픈 기념 free daily full reading ends; the signup gift starts.
For the first 24 h, run the checks in section 7 every two hours.

## 7. Checks

- Orders the cron has not settled (should be empty; it retries every 10 minutes):
  `SELECT id, status, fail_code, cancel_attempt, updated_at FROM orders WHERE status IN ('confirming','refunding') AND updated_at < strftime('%s','now')*1000 - 1800000`
- Refund lock pairs out of step (M1; both must be empty):
  `SELECT l.id, l.order_id, o.status FROM credit_lots l JOIN orders o ON o.id = l.order_id WHERE l.status = 'refunding' AND o.status <> 'refunding'`
  `SELECT o.id FROM orders o JOIN credit_lots l ON l.order_id = o.id WHERE o.status = 'refunding' AND l.status NOT IN ('refunding','refunded')`
- Payments for deleted accounts the cron could not cancel (`pay.orphan_refund_stuck` in the logs): cancel them in the Toss dashboard; the webhook records it.
  `SELECT id, cancel_attempt FROM orders WHERE status = 'refunding' AND fail_code = 'ACCOUNT_DELETED' AND cancel_attempt >= 5`
- Partial cancellations (`pay.partial_cancel`): decide by hand whether the reading stays; contact the buyer.
  `SELECT order_id, canceled_amount FROM payments WHERE status = 'PARTIAL_CANCELED'`
- Reservations nobody settled (the cron sweeps them; should stay near 0):
  `SELECT COUNT(*) AS n FROM unlocks WHERE status = 'reserved' AND reserved_until < strftime('%s','now')*1000 - 600000`
- Deletions not erased (the cron finishes them; should be empty):
  `SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL AND deleted_at < strftime('%s','now')*1000 - 1800000`
- Lot invariant (must be empty):
  `SELECT l.id FROM credit_lots l LEFT JOIN ledger g ON g.lot_id = l.id WHERE l.status <> 'refunding' GROUP BY l.id HAVING l.units_left <> COALESCE(SUM(CASE g.kind WHEN 'grant' THEN g.units WHEN 'restore' THEN g.units WHEN 'reserve' THEN -g.units WHEN 'refund' THEN -g.units WHEN 'expire' THEN -g.units ELSE 0 END), 0)`
- Weekly (spec 14, default 6): paid, unopened, after a failed opening. Contact or refund them.
  `SELECT DISTINCT o.id, o.created_at FROM orders o JOIN credit_lots l ON l.order_id = o.id JOIN unlocks u ON u.user_id = o.user_id AND u.status = 'released' AND u.product_id = o.product_id WHERE o.status = 'paid' AND l.units_left = l.units_total`
- Sales per KST day, live payments only (minor 12):
  `SELECT date(o.created_at/1000, 'unixepoch', '+9 hours') AS day, COUNT(*) AS n, SUM(o.amount_krw) AS krw FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'live' AND o.status IN ('paid','refunded') GROUP BY day ORDER BY day DESC LIMIT 14`
- Paid-reading model cost: DAILY_KV keys `paidcost:<YYYY-MM-DD>:<0-7>` (sum the eight shards of a day). The free-tier total stays in `cost:` and closes at 80% of BETA_DAILY_BUDGET_KRW.

## 8. Refunds by hand

- Any refund outside the 환불받기 button: cancel in the Toss dashboard. The webhook applies it (an opened reading's lot is revoked). If the webhook is missed, the cron settles it within 10 minutes. Never edit D1 rows by hand.
- Card cancel window over (minor 14): Toss refuses the cancel. Ask the buyer for a bank account in their own name, transfer the amount, then record it: cancel in the Toss dashboard is not possible, so note the order id and the transfer in the refund log, and run `UPDATE orders SET status = 'refunded', fail_code = 'BANK_REFUND', updated_at = <ms> WHERE id = '<id>' AND status = 'paid'` together with the lot: `UPDATE credit_lots SET status = 'revoked' WHERE order_id = '<id>'` (the one sanctioned manual edit; do both in one `--command` separated by `;`).
- A guardian cancels a minor's purchase (M7; 민법 제5조): ask for the minor's order id(s) or payment date and amount, and a document showing guardianship (가족관계증명서 or similar; do not keep a copy longer than needed). Cancel each payment in the Toss dashboard, opened or not; the webhook records it and revokes the lot. Reply within 3 business days.

## 9. Roll back

`npx wrangler secret put STARLOG_PAYMENTS` → `paused`. New sales, new accounts and gifts stop, and the 오픈 기념 reading comes back. Existing accounts can still log in to open, refund or delete what they hold. Use `off` only before launch: it also closes login.

## 10. Do not

- Rotate STARLOG_ACCOUNT_SECRET: D1 refuses the new one (503 on every account route); accounts and saved readings would become unreachable.
- Rotate STARLOG_SIGNING_SECRET without warning: everyone is logged out and tokens die.
- Mix test and live Toss keys (refused anyway).
- Set STARLOG_PAY=mock or STARLOG_KAKAO=mock in production (refused).
- Delete the Cron Trigger: stale payments, refunds, erasures and purges depend on it.

## Follow-ups (not in P4)

Kakao 연결 끊기 알림 callback (needs the admin key), 달빛 packs, premium generators (P5), cash receipts if 계좌이체 is ever enabled, moving the device's earlier readings into an account (cut from P4), the P3 인연 link (cut from P4), a second reading-key version if the account secret must ever change.
````

- [ ] **Step 5: Verify (controller)**

Run: `npx vitest run --maxWorkers=3`
Expected: every file passes.

Run: `pnpm typecheck`
Expected: exit 0.

Run: `pnpm --filter @starlog/web e2e`
Expected:
- the existing specs pass unchanged (they do not hold the owner pass, so they see today's site);
- pay-flow passes 3 tests in each project it runs in.

Run: `pnpm build && pnpm check:bundle`
Expected: `0 hits`.

Run: `pnpm cf:build`, then from apps/web `npx wrangler deploy --dry-run --outdir .wrangler/dry`
Expected: success; the dry run lists the cron schedule. Report the Worker gzip size against the 3 MiB limit.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-client-bundle.mjs apps/web/playwright.config.ts apps/web/e2e/global-setup.ts apps/web/e2e/pay-flow.spec.ts apps/web/package.json docs/runbook-payments.md
git commit -m "test(pay): secret probes in the bundle check, owner-mode e2e pay flow, payments runbook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review against the critique and the spec

| Item | Where |
|---|---|
| C1 settlement inside the current `respondGeneration` (keepAlive, SpendLedger, pre-counted `spend`) | Task 9 (`settled`/`release` in both paths, `recover`), Task 10 (`spend: "full"` kept for 오픈 기념 and 별조각, `paidCost` for paid). Checked: the Task 9 edits applied to aa70830's stream.ts and spend.ts pass settle.test (10), accounting, streaming and kv-failure tests, and typecheck |
| C1 paid usage never in `cost:` | Task 9 (`CostSink`, `addPaidCost` → `paidcost:`; tests read the KV keys) |
| M1 refund lock and revert in one batch, runbook query | Task 4 (`lockPaidLotForRefund`, `revertRefund`), Task 8, Task 19 §7 |
| M2 Idempotency-Key semantics, 409/5xx/network pending, look-up first, attempt-scoped keys, no revert on time alone | Tasks 6, 7, 8 (10-minute look-up) |
| M3 deletion settles first, refuses while unresolved, guards, orphan auto-refund, cron | Tasks 4, 7, 8, 9, 12, 13 |
| M4 never claim "그대로" after a cut; server re-reads | Task 9 (`recover`), Tasks 14–15 (`CREDIT_CHECKING`, `checkDelivery`) |
| M5 confirm without session | Task 7, Task 16 (`signedIn: false` UI) |
| M6 privacy statements and lib/db comment | Task 1 (comment), Task 18 |
| M7 minors: checkout line, terms clause, guardian refund path | Tasks 16, 18, 19 §8 |
| M8 secret check in D1, HKDF subkeys, key_version | Tasks 1 (`meta`), 3, 9 |
| M9 no 베타, no model names | Tasks 2, 10, 14, 15, 17, 18, 19 (e2e) |
| Minors 1, 2 | Tasks 4, 8 |
| Minor 3, 11 purges | Tasks 3 (claim re-tie), 12, 13 |
| Minor 4 별조각 in the free budget and network cap | Tasks 9, 10 |
| Minor 5 gift retry | Tasks 4, 5 |
| Minor 6 no digest uniqueness, ON CONFLICT DO NOTHING | Tasks 1, 9 |
| Minor 7 Kakao settings re-checked | Task 5 |
| Minor 8 requestPayment errors | Task 16 |
| Minor 9 paging | Tasks 9, 11, 17 |
| Minors 12, 13, 14 | Task 19 runbook, Task 18 (refund fallback) |
| Scope cut: no claim, no 인연 link | Tasks 1 (no digest, no bonds_owner_id), 11, 12, 17 |
| Spec 5.1–5.9, 6–13 | Tasks 1–19 as listed in the task table |

Type names used across tasks:
- `D1Binding`, `D1Statement` (P3);
- `AccountContext`, `Session`, `UserRow`;
- `Lot`, `Allocation`, `WalletSummary`;
- `TossClient`, `TossPayment`, `TossError`, `MockToss`;
- `OrderRow`, `OrderListItem`, `ConfirmOutcome`, `MarkPaidResult`, `RefundOutcome`, `MaintenanceReport`;
- `ServerChapter`, `ReadingSource`, `SavedReading`;
- `Settlement`, `CostSink`, `UnlockPlan`, `UnlockMethod`, `UnlockOffer`;
- `AccountState`, `AccountUser`, `DeliveryCheck`.
Each one is defined once (in the task that creates it) and used with the same signature afterwards.

**P5 follow-through:** the P5 plan (`2026-10-01-starlog-p5-premium-readings.md`) was written against P4 revision 1. Before it runs, the coordinator should update these:
- `Settlement` now also has `recover()`;
- `RespondOptions.credit` is gone; use `paidCost`;
- the readings `source` CHECK has no `'claimed'`, so P5's migration 0003 must not reintroduce it;
- the claim path no longer exists.
