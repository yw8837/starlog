# Starlog P4: Accounts and Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell the standard tarot and saju full readings at 2,900원 each through Kakao login and the Toss Payments widget. A paid reading is charged only when it is delivered, and a failed generation leaves it unused (open again for free, or refund it in one tap). New accounts get one reading's worth of 별조각. Everything sits behind `STARLOG_PAYMENTS`.

**Architecture:** Cloudflare D1 (binding `DB`, shared with P3) holds users, sessions, orders, payments, credit lots, unlock reservations, an append-only ledger and encrypted saved readings.
- Money rules live in SQL: CHECK constraints, UNIQUE idempotency keys, and one D1 `batch()` per state change. Tests run the same SQL on `node:sqlite` in memory.
- A reading route reserves credit before its stream starts. It saves the reading and spends the reservation before `done`, and releases the reservation on any failure. Toss is the source of truth for payment state (confirm, query, cancel, webhook re-query).

**Tech Stack:**
- Existing: Next.js 16.3.7 (App Router) on Cloudflare Workers via OpenNext 1.20.7, TypeScript 6, zod 4, WebCrypto (`lib/security/sign.ts`), Vitest 5, Playwright.
- New, with no new npm dependencies: Cloudflare D1, Node's built-in `node:sqlite` (tests only), and the Toss JS SDK v2 loaded by script tag (`https://js.tosspayments.com/v2/standard`).

**Spec:** `docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md` (read sections 4, 5.4 and 14 before any task). Parent spec: `docs/superpowers/specs/2026-09-29-saju-tarot-story-app-design.md`.

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
- Money (spec 5.4):
  - The server decides every amount from `lib/pay/catalog.ts`; a client never sends one that is used.
  - Credit is spent only when a validated reading is saved to the account. Every failure path releases the reservation.
  - Every ledger row has a UNIQUE `idem_key`. Every multi-step change is one `db.batch([...])`.
- Toss:
  - API base `https://api.tosspayments.com`; header `Authorization: Basic base64(TOSS_SECRET_KEY + ":")` (the colon is required).
  - `Idempotency-Key` goes on POST only.
  - Order ids are 24 chars of `[A-Za-z0-9_-]`. Confirm within 10 minutes.
  - Never trust a webhook body; re-query the payment.
- Kakao:
  - authorize `https://kauth.kakao.com/oauth/authorize`;
  - token `POST https://kauth.kakao.com/oauth/token` (form, with `client_secret`);
  - profile `https://kapi.kakao.com/v2/user/me` (Bearer);
  - unlink `POST https://kapi.kakao.com/v1/user/unlink` (Bearer).
  - Never store Kakao tokens or the raw Kakao id.
- Secrets:
  - Env names only: `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY` (read at run time through `tossClientKey()`), `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `STARLOG_ACCOUNT_SECRET` (32+ chars, never rotated), and the existing `STARLOG_SIGNING_SECRET`.
  - Flags: `STARLOG_PAYMENTS` (`off` | `owner` | `on`), `STARLOG_PAY` (`toss` | `mock`), `STARLOG_KAKAO` (`kakao` | `mock`).
  - Mocks are refused in production.
- Never log user text, birth data, Kakao ids, nicknames, tokens, payment keys or IPs. Log `evt`, order ids, codes and counts only. No personal data in URLs.
- The 10-card product is never called "켈틱 크로스" (or any spelling of it) anywhere.
- P3 coexistence (spec section 4; P3 Task 4 landed in acf4599):
  - Use P3's `apps/web/lib/db/d1.ts` types (`D1Binding`, `D1Statement`, `D1Result`) and `getDb()`. Do not create or redefine them. P4 adds files next to them.
  - Do not touch P3's `sl_uid`/`sl_fid` cookie formats or the `d1_databases` entry.
  - Migrations are `apps/web/migrations/0002_…` and later, in the same `migrations_dir`. An applied migration is never edited.
  - Rate-limit namespaces are 1101–1103.

## File Structure

```
apps/web/migrations/0002_accounts_payments.sql     P4 tables (users, sessions, gift_claims, orders, payments, credit_lots, unlocks, ledger, readings)
apps/web/lib/db/d1.ts                               (P3, unchanged) D1Binding / D1Statement / D1Result, getDb()
apps/web/lib/db/index.ts                            (P3's factory) + accountDb(), setTestDb()
apps/web/lib/db/sqlErrors.ts                        isConstraintError()
apps/web/lib/db/testing/sqliteD1.ts                 D1Binding over node:sqlite in memory (tests only)
apps/web/lib/db/testing/migrate.ts                  migratedTestD1(): fresh test DB with every migration applied
apps/web/lib/db/testing/localD1.ts                  openLocalD1(): real local D1 (workerd via getPlatformProxy) with every migration applied
apps/web/lib/pay/catalog.ts                         products and prices (client-safe)
apps/web/lib/pay/mode.ts                            STARLOG_PAYMENTS / STARLOG_PAY, Toss key checks
apps/web/lib/pay/ledger.ts                          lots, reserve / deliver / release, gift, expiry, refund lock, wallet summary
apps/web/lib/pay/tossTypes.ts                       TossPayment, TossError, TossClient, parsePayment
apps/web/lib/pay/toss.ts                            real Toss client + tossClient() selector
apps/web/lib/pay/tossMock.ts                        in-memory Toss (STARLOG_PAY=mock)
apps/web/lib/pay/orders.ts                          create, confirm (idempotent), markPaid, reconcile confirming, history
apps/web/lib/pay/refunds.ts                         refund unused, applyCancel, reconcile refunding, syncOrderWithToss (webhook)
apps/web/lib/pay/offer.ts                           UnlockMethod, UnlockOffer, unlockOffer(), checkoutHref() (client-safe)
apps/web/lib/pay/tossSdk.ts                         browser loader for the Toss v2 script (client)
apps/web/lib/account/secrets.ts                     STARLOG_ACCOUNT_SECRET, kakaoKey(), sealJson()/openJson() (AES-GCM)
apps/web/lib/account/users.ts                       users: login upsert, lookups
apps/web/lib/account/session.ts                     sl_sid cookie + D1 sessions
apps/web/lib/account/request.ts                     openAccount(), openAccountRoute(), requireSession(), sameOrigin()
apps/web/lib/account/redirect.ts                    303 helper for GET routes
apps/web/lib/account/returnTo.ts                    safeReturnTo(), withQuery() (client-safe)
apps/web/lib/account/oauthState.ts                  sl_oauth state cookie
apps/web/lib/account/kakao.ts                       Kakao OAuth (real + mock), unlink
apps/web/lib/account/deletion.ts                    delete intent token, deleteAccount()
apps/web/lib/account/bondsLink.ts                   link the P3 bonds owner to the account
apps/web/lib/account/client.ts                      browser: /api/me store, useAccount(), logout(), loginHref(), loginMessage()
apps/web/lib/readings/store.ts                      encrypted saved readings
apps/web/lib/readings/chapters.ts                   server-side chapter builders (tarot, saju)
apps/web/lib/readings/turns.ts                      follow-up turns into the saved copy
apps/web/lib/api/unlock.ts                          planUnlock() + settlementFor() for the reading routes
apps/web/lib/storage/sync.ts                        browser: merge account readings, claim device ones
apps/web/app/api/me/route.ts
apps/web/app/api/auth/kakao/start/route.ts, callback/route.ts, apps/web/app/api/auth/logout/route.ts
apps/web/app/api/account/delete-intent/route.ts
apps/web/app/api/pay/{checkout,orders,confirm,refund,webhook}/route.ts
apps/web/app/api/readings/route.ts, apps/web/app/api/readings/claim/route.ts
apps/web/app/pay/{checkout,success,fail}/…          payment pages
apps/web/app/me/AccountPanel.tsx, OrderHistory.tsx  내 정보 account parts
docs/runbook-payments.md                            rollout, secrets, checks, ops queries
```

Modified: `next.config.ts` (opt-in local bindings for `next dev`), `lib/api/http.ts` (error codes), `lib/api/stream.ts` (settlement hook), `lib/api/inputs.ts`, `lib/api/tarotRequest.ts`, the tarot/saju reading routes and the follow-up route, `lib/security/rateLimit.ts`, `lib/security/chapterToken.ts`, `lib/cloudflare.ts`, `wrangler.jsonc` (ratelimits only), `components/tarot/UnlockSheet.tsx`, the result/chart/login/me pages, `lib/storage/chapters.ts`, `lib/reading/{api,errors,types}.ts`, the legal pages, `lib/seo.ts`, `scripts/check-client-bundle.mjs`, `apps/web/playwright.config.ts`, `apps/web/.env.example`, `apps/web/package.json` (scripts).

## Task order

| # | Task | Needs |
|---|---|---|
| 0 | Preconditions (controller) | — |
| 1 | Test D1 and the P4 schema | P3 Task 4 |
| 2 | Product catalog and payment modes | — |
| 3 | Account core: secrets, users, sessions, guards, error codes, limiters | 1 |
| 4 | Ledger | 1 |
| 5 | Kakao login, `/api/me`, logout | 2, 3, 4 |
| 6 | Toss client and mock | 2 |
| 7 | Orders, checkout info, confirm | 4, 5, 6 |
| 8 | Refunds, reconciliation, webhook | 7 |
| 9 | Saved readings store and the stream settlement hook | 3 |
| 10 | Paid, 별조각 and owner unlocks on the reading routes | 4, 9 |
| 11 | Readings API: list, claim, delete, follow-up turns | 9, 10 |
| 12 | Account deletion | 5, 8, 11 |
| 13 | Bonds identity link | 5, 12, P3 Task 6 |
| 14 | Client account layer, unlock offers, error copy, UnlockSheet | 5 |
| 15 | Result pages and the login page | 10, 14 |
| 16 | Checkout, success and fail pages | 7, 14 |
| 17 | 내 정보: account, purchases, receipts, sync, deletion | 8, 11, 12, 14 |
| 18 | Legal pages | 2 |
| 19 | Bundle guard, e2e pay flow, runbook | all |

Tasks 2 and 6 can run in parallel with 1, 3 and 4. Task 18 can run any time after 2.

---

### Task 0: Preconditions (controller, no code)

- [ ] **Step 1: Check the baseline is committed.**
  - These must exist at `HEAD`, not only in the working tree:
    - `apps/web/lib/api/spend.ts` (P2b server-side accounting, `recordCost`, `usdOf` in `lib/ai/cost.ts`);
    - `keyedHash` in `apps/web/lib/security/sign.ts`;
    - `ipGroup` in `apps/web/lib/api/http.ts`;
    - `SITE.price.premium` in `apps/web/lib/config.ts`;
    - P3 Task 4 (commit acf4599) and its follow-ups:
      - `apps/web/migrations/0001_bonds.sql`, `apps/web/lib/db/d1.ts` (`D1Binding`, `getDb`), `apps/web/lib/db/index.ts`;
      - a `d1_databases` entry with `"binding": "DB"`, `"database_id": "78c6fb07-ee97-42d5-9633-21801fe596eb"`, `"migrations_dir": "migrations"` in `apps/web/wrangler.jsonc`;
      - P3's working-tree edits to `0001_bonds.sql`, `contract.ts` and `d1BondsRepo.int.test.ts` committed (P4 tests apply every migration file, so an uncommitted 0001 change would leak into P4 runs).

Run: `git -C D:/Money/apps/saju-tarot ls-tree -r --name-only HEAD apps/web/lib/api/spend.ts apps/web/migrations/0001_bonds.sql apps/web/lib/db/index.ts apps/web/lib/db/d1.ts`
Expected: all four paths printed.

Run: `git -C D:/Money/apps/saju-tarot status --short apps/web/migrations apps/web/lib/db`
Expected: nothing printed.

Run: `git -C D:/Money/apps/saju-tarot grep -n "premium" HEAD -- apps/web/lib/config.ts`
Expected: the `premium:` array with ids `tarot-deep`, `match`, `newyear-2027`.

- [ ] **Step 2: Check the suite is green.**

Run: `npx vitest run --maxWorkers=3` (repo root)
Expected: every file passes, exit 0.

If Step 1 or Step 2 fails, stop. Report what is missing, and do not start Task 1 until the owning agent has committed it: P4 edits the same files.

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
- `next dev` has no D1 unless `STARLOG_CF_DEV=1` (Step 8). Without it the account and payment routes answer 503, and the site stays in beta mode.

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
      expect.arrayContaining(["owners", "credit_lots", "gift_claims", "ledger", "orders", "payments", "readings", "sessions", "unlocks", "users"]),
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
export const P4_TABLES_CHILD_FIRST = ["readings", "ledger", "unlocks", "credit_lots", "payments", "orders", "gift_claims", "sessions", "users"];

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

Keep comments on their own lines or after a column (never after the final `;` of a statement); `migrationStatements()` splits at line-ending semicolons.

```sql
-- P4: accounts, payments, the credit ledger and saved readings.
-- Spec: docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md (sections 5.4 and 7).
-- Times are epoch milliseconds. Money is whole KRW. Units are 달빛 (paid) or 별조각 (free) counts.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  kakao_key TEXT UNIQUE,              -- HMAC of the Kakao user id, NULL once deleted
  nickname TEXT,                      -- NULL once deleted
  customer_key TEXT NOT NULL UNIQUE,  -- Toss customerKey
  age_confirmed_at INTEGER,
  bonds_owner_id TEXT UNIQUE,         -- P3 owners.id linked to this account
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One signup gift per Kakao account, kept a year after the account is deleted.
CREATE TABLE gift_claims (
  kakao_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL
);

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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX orders_user ON orders(user_id, created_at);

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

CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju')),
  product_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paid', 'free', 'owner', 'claimed')),
  unlock_id TEXT UNIQUE,
  digest TEXT NOT NULL,               -- sha256 of the canonical reading JSON
  payload TEXT NOT NULL,              -- AES-GCM sealed chapter JSON (lib/account/secrets.ts)
  key_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, digest)
);
CREATE INDEX readings_user ON readings(user_id, created_at);
```

- [ ] **Step 7: Append to `apps/web/lib/db/index.ts`** (keep everything P3 put there; it already imports `getDb` from `./d1`)

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

When this plan was written, these were checked on the D1 engine (wrangler 4.143 `d1 execute --local`):
- The migration applied with "17 commands executed successfully", after P3's 0001.
- A statement that drove `units_left` below 0 rolled its whole multi-statement execute back.
- The guarded `INSERT … SELECT … WHERE EXISTS (… status = 'reserved')` wrote nothing for a released unlock.
- `UPDATE … RETURNING` returned the row.

The ledger SQL also passed all 13 contract cases on node:sqlite. `openLocalD1()` (getPlatformProxy) could not start workerd from the planner's sandbox: `fetch failed` / `ECONNRESET` after about 100 s. If it fails for you as well, report it rather than skipping silently. The node:sqlite suites still gate the task, and the controller runs the `*.int.test.ts` files where workerd starts.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/db/sqlErrors.ts apps/web/lib/db/index.ts apps/web/lib/db/testing apps/web/lib/db/accountDb.test.ts apps/web/lib/db/accountSchema.int.test.ts apps/web/migrations/0002_accounts_payments.sql apps/web/next.config.ts apps/web/package.json
git commit -m "feat(db): P4 schema, node:sqlite test D1 and local-D1 checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Product catalog and payment modes

**Files:**
- Create: `apps/web/lib/pay/catalog.ts`, `apps/web/lib/pay/mode.ts`
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
  - `mode.ts` (server-only):
    - `type PaymentsMode = "off" | "owner" | "on"`, `paymentsMode(env?)`, `salesOpen(mode, owner)`, `betaFullReadings(mode)`
    - `type PayProvider = "toss" | "mock"`, `payProvider(env?)`, `tossClientKey(env?)`, `payConfigProblems(env?): string[]`

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/pay/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { NEWYEAR_OPENS_AT, PRODUCTS, productById, sellable, standardProduct, unitsFor } from "./catalog";

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
});
```

`apps/web/lib/pay/mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { betaFullReadings, payConfigProblems, payProvider, paymentsMode, salesOpen, tossClientKey } from "./mode";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const KEYS = { NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm", TOSS_SECRET_KEY: "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6" };

describe("payment modes", () => {
  it("defaults to off and reads owner and on", () => {
    expect(paymentsMode(env({}))).toBe("off");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: " ON " }))).toBe("on");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "owner" }))).toBe("owner");
    expect(paymentsMode(env({ STARLOG_PAYMENTS: "yes" }))).toBe("off");
  });

  it("opens sales for everyone when on, for owner-pass devices when owner, for nobody when off", () => {
    expect([salesOpen("on", false), salesOpen("owner", false), salesOpen("owner", true), salesOpen("off", true)]).toEqual([true, false, true, false]);
  });

  it("ends the beta's free full reading only when sales are on for everyone", () => {
    expect([betaFullReadings("off"), betaFullReadings("owner"), betaFullReadings("on")]).toEqual([true, true, false]);
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
 *   - `off` (default; the beta as it is);
 *   - `owner` (sales, sign-up and gifts open for owner-pass devices only);
 *   - `on`: open for everyone. The beta's free daily full reading ends.
 * - Spending credit a user already holds is never gated by it.
 * - `STARLOG_PAY=mock` swaps Toss for the in-memory mock (tests, e2e, local dev); refused in production.
 */

export type PaymentsMode = "off" | "owner" | "on";

export function paymentsMode(env: NodeJS.ProcessEnv = process.env): PaymentsMode {
  const value = env.STARLOG_PAYMENTS?.trim().toLowerCase();
  return value === "on" || value === "owner" ? value : "off";
}

/** New orders, sign-ups and signup gifts are open for this device. */
export function salesOpen(mode: PaymentsMode, owner: boolean): boolean {
  return mode === "on" || (mode === "owner" && owner);
}

/** The beta's free daily full reading applies until sales open for everyone. */
export function betaFullReadings(mode: PaymentsMode): boolean {
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

- [ ] **Step 5: Add the P4 names to `apps/web/.env.example`** (names and comments only, never values)

```bash
# ---- P4 accounts and payments (docs/runbook-payments.md) ----
# off (default, the beta) | owner (only owner-pass devices see login and payments) | on
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
# 32+ random characters. Keys Kakao lookups and encrypts saved readings. NEVER rotate it.
STARLOG_ACCOUNT_SECRET=
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/lib/pay/catalog.test.ts apps/web/lib/pay/mode.test.ts`
Expected: PASS (7 + 6 tests).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/catalog.ts apps/web/lib/pay/mode.ts apps/web/lib/pay/catalog.test.ts apps/web/lib/pay/mode.test.ts apps/web/.env.example
git commit -m "feat(pay): product catalog and payment modes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Account core — secrets, users, sessions, request guards, error codes, limiters

**Files:**
- Create: `apps/web/lib/account/secrets.ts`, `apps/web/lib/account/users.ts`, `apps/web/lib/account/session.ts`, `apps/web/lib/account/request.ts`, `apps/web/lib/account/redirect.ts`, `apps/web/lib/account/returnTo.ts`
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
  - `secrets.ts`: `accountSecret(env?): string | null`, `kakaoKey(kakaoId, secret): Promise<string>`, `sealJson(value, secret): Promise<string>`, `openJson<T>(sealed, secret): Promise<T | null>`, `READING_KEY_VERSION = 1`
  - `users.ts`:
    - `interface UserRow { id; kakao_key: string | null; nickname: string | null; customer_key; age_confirmed_at: number | null; bonds_owner_id: string | null; created_at; last_login_at; deleted_at: number | null }`
    - `cleanNickname(v: unknown): string`
    - `loginKakaoUser(db, {key, nickname, ageConfirmed, now}): Promise<{user: UserRow; created: boolean}>`
    - `userById(db, id): Promise<UserRow | null>`
  - `session.ts`:
    - `SESSION_COOKIE = "sl_sid"`, `SESSION_TTL_MS`, `interface Session { id; user: UserRow }`
    - `createSession(db, userId, secret, now): Promise<{id; cookie: CookieSpec}>`
    - `readSession(db, cookieValue, secret, now): Promise<Session | null>`
    - `revokeSession(db, id, now)`, `CLEAR_SESSION: CookieSpec`
  - `request.ts`:
    - `interface AccountContext { db; secret; accountSecret; now; cookies; owner; session: Session | null }`
    - `openAccount(request, now?)`, `openAccountRoute(request, {limiter, write?})`
    - `requireSession(ctx): Session | Response`, `sameOrigin(request): boolean`
  - `redirect.ts`: `redirectTo(request, target, query?, cookies?: Array<CookieSpec | string>): Response` (303)
  - `returnTo.ts` (client-safe): `safeReturnTo(v): string`, `withQuery(path, query): string`
  - `http.ts` `ErrorCode` gains:
    - `LOGIN_REQUIRED` 401, `PAYMENT_REQUIRED` 402, `NO_CREDIT` 402, `PAY_FAILED` 402;
    - `FORBIDDEN` 403;
    - `NOT_AVAILABLE` 409, `PAY_PENDING` 409, `NOT_REFUNDABLE` 409;
    - `PAY_UNAVAILABLE` 503.
  - limiters: `AUTH_LIMITER` 20/60 s, `PAY_LIMITER` 20/60 s, `WEBHOOK_LIMITER` 60/60 s

- [ ] **Step 1: Write the failing test** — `apps/web/lib/account/account.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorPayload, type ErrorCode } from "@/lib/api/http";
import { setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { signingSecret } from "@/lib/security/sign";
import { openAccount, sameOrigin } from "./request";
import { safeReturnTo, withQuery } from "./returnTo";
import { accountSecret, kakaoKey, openJson, sealJson } from "./secrets";
import { CLEAR_SESSION, SESSION_COOKIE, SESSION_TTL_MS, createSession, readSession, revokeSession } from "./session";
import { cleanNickname, loginKakaoUser, userById } from "./users";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const ACCOUNT = "account-secret-for-tests-0123456789abcdef";
const SIGNING = "signing-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-01T03:00:00Z");

afterEach(() => {
  setTestDb(null);
  vi.restoreAllMocks();
});

describe("account secret", () => {
  it("needs 32+ characters in production and falls back outside it", () => {
    expect(accountSecret(env({ NODE_ENV: "production" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: "short" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: ACCOUNT }))).toBe(ACCOUNT);
    expect(accountSecret(env({ NODE_ENV: "development" }))!.length).toBeGreaterThanOrEqual(32);
  });

  it("keeps a keyed hash of the Kakao id, never the id", async () => {
    const key = await kakaoKey("1234567890", ACCOUNT);
    expect(key).toBe(await kakaoKey("1234567890", ACCOUNT));
    expect(key).not.toContain("1234567890");
    expect(key).not.toBe(await kakaoKey("1234567890", `${ACCOUNT}x`));
    expect(key).not.toBe(await kakaoKey("1234567891", ACCOUNT));
  });

  it("seals JSON with AES-GCM: round trip, a fresh IV each time, tampering and the wrong key rejected", async () => {
    const value = { question: "이번 주 재물 흐름", birth: { year: 1990 } };
    const sealed = await sealJson(value, ACCOUNT);
    expect(sealed).not.toContain("재물");
    expect(await openJson(sealed, ACCOUNT)).toEqual(value);
    expect(await sealJson(value, ACCOUNT)).not.toBe(sealed);
    const flipped = `${sealed.slice(0, -2)}${sealed.at(-2) === "A" ? "B" : "A"}${sealed.at(-1)}`;
    expect(await openJson(flipped, ACCOUNT)).toBeNull();
    expect(await openJson(sealed, `${ACCOUNT}x`)).toBeNull();
    expect(await openJson("", ACCOUNT)).toBeNull();
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
    const first = await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW });
    expect(first.created).toBe(true);
    expect(first.user).toMatchObject({ kakao_key: "k1", nickname: "별빛", age_confirmed_at: NOW, created_at: NOW, bonds_owner_id: null });
    expect(first.user.customer_key).toMatch(/^c_[A-Za-z0-9_-]{24}$/);
    const again = await loginKakaoUser(db, { key: "k1", nickname: "달빛", ageConfirmed: false, now: NOW + 1000 });
    expect(again.created).toBe(false);
    expect(again.user).toMatchObject({ id: first.user.id, nickname: "달빛", age_confirmed_at: NOW, last_login_at: NOW + 1000, customer_key: first.user.customer_key });
  });

  it("gives a deleted account's Kakao key a fresh account", async () => {
    const db = migratedTestD1();
    const { user } = await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW });
    await db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, deleted_at = ? WHERE id = ?").bind(NOW, user.id).run();
    expect(await userById(db, user.id)).toBeNull();
    const next = await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW + 1 });
    expect(next.created).toBe(true);
    expect(next.user.id).not.toBe(user.id);
  });
});

describe("sessions", () => {
  it("reads a live session, never an expired, revoked, forged or deleted one", async () => {
    const db = migratedTestD1();
    const { user } = await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW });
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
    const { user } = await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: Date.now() });
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
  /** Kakao login start/callback, logout, delete intent (P4) */
  AUTH_LIMITER: 20,
  /** checkout, orders, confirm, refund (P4) */
  PAY_LIMITER: 20,
  /** Toss webhooks (P4) */
  WEBHOOK_LIMITER: 60,
```

  - `apps/web/lib/cloudflare.ts`: add `AUTH_LIMITER?: RateLimitBinding; PAY_LIMITER?: RateLimitBinding; WEBHOOK_LIMITER?: RateLimitBinding;` to `CloudflareEnv`.
  - `apps/web/wrangler.jsonc`: append to `ratelimits`. The 11xx namespaces stay clear of P2b's 1001–1005 and P3's bond limiters; if one is taken, pick the next free 11xx and say so in your report.

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
 * rotate it: accounts and saved readings would become unreachable. Null in production when it is
 * missing or shorter than 32 characters; account routes then answer 503.
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

const hmacKeys = new Map<string, Promise<CryptoKey>>();
const readingKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    hmacKeys.set(secret, key);
  }
  return key;
}

/** HMAC-SHA256 of the Kakao user id: how a login finds its account. The raw id is never stored. */
export async function kakaoKey(kakaoId: string, secret: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`kakao:${kakaoId}`));
  return toBase64Url(new Uint8Array(mac));
}

/** AES-256-GCM key for saved readings, derived from the account secret with HKDF-SHA256. */
function readingKey(secret: string): Promise<CryptoKey> {
  let key = readingKeys.get(secret);
  if (!key) {
    key = (async () => {
      const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: encoder.encode("starlog-readings"), info: encoder.encode("v1") },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    readingKeys.set(secret, key);
  }
  return key;
}

/** Stored next to each sealed reading, for a future key change. */
export const READING_KEY_VERSION = 1;

/** JSON sealed with AES-GCM: base64url of the 12-byte IV followed by the ciphertext and tag. */
export async function sealJson(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await readingKey(secret), encoder.encode(JSON.stringify(value)));
  const out = new Uint8Array(12 + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), 12);
  return toBase64Url(out);
}

/** The sealed JSON, or null when it was altered or sealed under another secret. */
export async function openJson<T = unknown>(sealed: string, secret: string): Promise<T | null> {
  const bytes = fromBase64Url(sealed);
  if (!bytes || bytes.length < 29) return null; // 12-byte IV + 16-byte tag + at least 1 byte
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await readingKey(secret), bytes.slice(12));
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Write `apps/web/lib/account/users.ts`**

```ts
import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { randomId } from "@/lib/security/sign";

export interface UserRow {
  id: string;
  /** HMAC of the Kakao id (secrets.ts kakaoKey); null once the account is deleted */
  kakao_key: string | null;
  nickname: string | null;
  /** Toss customerKey: random, 26 characters, includes "_" (Toss requires a special character) */
  customer_key: string;
  age_confirmed_at: number | null;
  /** the P3 인연 owner linked to this account (Task 13) */
  bonds_owner_id: string | null;
  created_at: number;
  last_login_at: number;
  deleted_at: number | null;
}

/** At most 20 characters, no control characters or angle brackets; "별손님" when Kakao gave none. */
export function cleanNickname(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return [...text].slice(0, 20).join("") || "별손님";
}

/**
 * The account for a Kakao login, in one statement: an existing account gets its nickname and login
 * time updated, otherwise one is created. `created` is true only for a brand-new account (the caller
 * then offers the signup gift).
 */
export async function loginKakaoUser(
  db: D1Binding,
  input: { key: string; nickname: string; ageConfirmed: boolean; now: number },
): Promise<{ user: UserRow; created: boolean }> {
  const id = `u_${randomId(12)}`;
  const user = await db
    .prepare(
      `INSERT INTO users (id, kakao_key, nickname, customer_key, age_confirmed_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kakao_key) DO UPDATE SET
         nickname = excluded.nickname,
         last_login_at = excluded.last_login_at,
         age_confirmed_at = COALESCE(users.age_confirmed_at, excluded.age_confirmed_at)
       RETURNING *`,
    )
    .bind(id, input.key, cleanNickname(input.nickname), `c_${randomId(18)}`, input.ageConfirmed ? input.now : null, input.now, input.now)
    .first<UserRow>();
  if (!user) throw new Error("user upsert returned no row");
  return { user, created: user.id === id };
}

/** A live (not deleted) account. */
export function userById(db: D1Binding, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").bind(id).first<UserRow>();
}
```

- [ ] **Step 7: Write `apps/web/lib/account/session.ts`**

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

- [ ] **Step 8: Write `apps/web/lib/account/returnTo.ts`** (no `server-only`: the login page uses it too)

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

- [ ] **Step 9: Write `apps/web/lib/account/redirect.ts`**

```ts
import "server-only";
import { serializeCookie, type CookieSpec } from "@/lib/api/http";

/**
 * 303 to `target` (a path on this site or an absolute URL) with query flags and cookies. Strings in
 * `cookies` are ready-made Set-Cookie values (P3's sl_uid). Never cached.
 */
export function redirectTo(request: Request, target: string, query: Record<string, string> = {}, cookies: Array<CookieSpec | string> = []): Response {
  const url = new URL(target, request.url);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", typeof cookie === "string" ? cookie : serializeCookie(cookie));
  return new Response(null, { status: 303, headers });
}
```

- [ ] **Step 10: Write `apps/web/lib/account/request.ts`**

```ts
import "server-only";
import { clientKey, errorResponse, parseCookies } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { rateLimit, type LimiterName } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
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

/** What an account or payment route needs, or 503 PAY_UNAVAILABLE when D1 or a secret is missing (logged once, by name). */
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

- [ ] **Step 11: Run the tests**

Run: `npx vitest run apps/web/lib/account/account.test.ts apps/web/lib/security`
Expected: PASS (account: 12 tests; security tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/account apps/web/lib/api/http.ts apps/web/lib/security/rateLimit.ts apps/web/lib/cloudflare.ts apps/web/wrangler.jsonc
git commit -m "feat(account): secrets, users, sessions, request guards and P4 error codes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ledger

**Files:**
- Create: `apps/web/lib/pay/ledger.ts`, `apps/web/lib/pay/ledgerContract.ts` (the suite, P3's contract pattern)
- Test: `apps/web/lib/pay/ledger.test.ts` (test D1), `apps/web/lib/pay/ledger.int.test.ts` (local D1)

**Interfaces:**
- Consumes: `D1Binding`, `D1Statement` (P3 `lib/db/d1.ts`), `isConstraintError` (Task 1, `lib/db/sqlErrors.ts`), `randomId` from `lib/security/sign.ts`
- Produces (`ledger.ts`):
  - `type Currency = "paid" | "free"`, `type LedgerKind`, `interface Lot` (the `credit_lots` row), `type Allocation = [lotId: string, units: number]`
  - `GIFT_DAYS = 90`, `RESERVATION_MS = 360_000`, `giftExpiry(now, days?)`
  - `interface NewLot { id; userId; currency; source; orderId; productId; units; expiresAt }`, `grantStatements(db, lot: NewLot, now): D1Statement[]`
  - `grantSignupGift(db, {userId, kakaoKey, units, now}): Promise<boolean>`
  - `paidLotStatements(db, {userId, orderId, productId, units, now}): D1Statement[]` (lot id `lot_<orderId>`)
  - `allocate(lots, units): Allocation[] | null`
  - `reserveStatements(db, {unlockId, userId, productId, currency, allocations, now})`
  - `reserveUnlock(db, {userId, productId, currency, units, now}): Promise<{ok: true; unlockId; allocations} | {ok: false}>`
  - `deliverUnlock(db, {unlockId, readingId, now, before?: D1Statement[]}): Promise<"delivered" | "lost">`
  - `releaseUnlock(db, {unlockId, now}): Promise<boolean>`
  - `sweepUser(db, userId, now)`, `forfeitStatements(db, lot, status: "expired" | "revoked", now)`
  - `lockUnusedPaidLot(db, orderId): Promise<Lot | null>`, `unlockRefundingLot(db, orderId)`, `refundingLot(db, orderId): Promise<Lot | null>`, `refundedLotStatements(db, lot, now)`
  - `interface WalletSummary { stardust: number; stardustExpiresAt: number | null; unused: Array<{orderId; productId}> }`, `walletSummary(db, userId, now)`

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
  lockUnusedPaidLot,
  paidLotStatements,
  refundedLotStatements,
  releaseUnlock,
  reserveStatements,
  reserveUnlock,
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
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW });
    if (!reserved.ok) throw new Error("not reserved");
    expect((await walletSummary(db, "u_1", NOW)).stardust).toBe(0);
    expect(await deliverUnlock(db, { unlockId: reserved.unlockId, readingId: "r1", now: NOW + 60_000 })).toBe("delivered");
    expect(await kinds(db, reserved.allocations[0]![0])).toEqual(["grant", "reserve", "spend"]);
    expect(await db.prepare("SELECT status, reading_id FROM unlocks WHERE id = ?").bind(reserved.unlockId).first()).toEqual({ status: "delivered", reading_id: "r1" });
    expect(await releaseUnlock(db, { unlockId: reserved.unlockId, now: NOW + 70_000 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 70_000)).stardust).toBe(0);
    await expectLotsMatchLedger(db);
  });

  it("releases a failed opening once, and a late delivery cannot spend it", async () => {
    const db = await giftedUser(make);
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "free", units: 10, now: NOW });
    if (!reserved.ok) throw new Error("not reserved");
    expect(await releaseUnlock(db, { unlockId: reserved.unlockId, now: NOW + 1 })).toBe(true);
    expect(await releaseUnlock(db, { unlockId: reserved.unlockId, now: NOW + 2 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 3)).stardust).toBe(10);
    expect(await deliverUnlock(db, { unlockId: reserved.unlockId, readingId: "late", now: NOW + 4 })).toBe("lost");
    expect(await kinds(db, reserved.allocations[0]![0])).toEqual(["grant", "reserve", "restore"]);
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
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW });
    expect(reserved.ok && reserved.allocations).toEqual([["lot_soon", 7], ["lot_late", 3]]);
    await expectLotsMatchLedger(db);
  });

  it("refuses without enough credit and writes nothing", async () => {
    const db = await setup(make);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW })).toEqual({ ok: false });
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(0);
  });

  it("rolls a stale reservation back whole when its lot changed underneath it", async () => {
    const db = await giftedUser(make);
    const first = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW });
    if (!first.ok) throw new Error("not reserved");
    // A second device read the lot before the first reservation landed.
    const stale = reserveStatements(db, { unlockId: "ul_stale", userId: "u_1", productId: "tarot", currency: "free", allocations: first.allocations, now: NOW });
    await expect(db.batch(stale)).rejects.toSatisfy(isConstraintError);
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("gives back a reservation nobody settled once it outlives RESERVATION_MS", async () => {
    const db = await giftedUser(make);
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW });
    if (!reserved.ok) throw new Error("not reserved");
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS - 1)).stardust).toBe(0);
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS + 1)).stardust).toBe(10);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(reserved.unlockId).first()).toEqual({ status: "released" });
    await expectLotsMatchLedger(db);
  });

  it("expires 별조각 after their last day, with a ledger row", async () => {
    const db = await giftedUser(make);
    expect(await walletSummary(db, "u_1", giftExpiry(NOW) + 1)).toEqual({ stardust: 0, stardustExpiresAt: null, unused: [] });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(1);
    expect(await db.prepare("SELECT status, units_left FROM credit_lots").first()).toEqual({ status: "expired", units_left: 0 });
    await expectLotsMatchLedger(db);
  });

  it("locks only an unused paid lot for a refund, and books the refund", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    await paidOrder(db, "order_b");
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", units: 10, now: NOW });
    if (!reserved.ok) throw new Error("not reserved");
    const opened = reserved.allocations[0]![0] === "lot_order_a" ? "order_a" : "order_b";
    const unused = opened === "order_a" ? "order_b" : "order_a";
    expect(await lockUnusedPaidLot(db, opened)).toBeNull();
    const locked = await lockUnusedPaidLot(db, unused);
    expect(locked).toMatchObject({ id: `lot_${unused}`, status: "refunding", units_left: 0 });
    expect(await lockUnusedPaidLot(db, unused)).toBeNull();
    await db.batch(refundedLotStatements(db, locked!, NOW));
    expect(await lotById(db, `lot_${unused}`)).toMatchObject({ status: "refunded", units_left: 0 });
    expect(await kinds(db, `lot_${unused}`)).toEqual(["grant", "refund"]);
    await expectLotsMatchLedger(db);
  });

  it("keeps a delivery atomic with the reading it saves", async () => {
    const db = await giftedUser(make);
    const reserved = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW });
    if (!reserved.ok) throw new Error("not reserved");
    const broken = db.prepare(
      "INSERT INTO readings (id, user_id, kind, product_id, source, digest, payload, key_version, created_at, updated_at) VALUES ('r1', 'nobody', 'tarot', 'tarot', 'free', 'd', 'p', 1, 0, 0)",
    );
    await expect(deliverUnlock(db, { unlockId: reserved.unlockId, readingId: "r1", now: NOW, before: [broken] })).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(reserved.unlockId).first()).toEqual({ status: "reserved" });
    expect(await kinds(db, reserved.allocations[0]![0])).toEqual(["grant", "reserve"]);
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

/**
 * The one ledger for 달빛 (paid) and 별조각 (free), spec 5.4.
 *
 * - Credit lives in lots: a paid lot per order, earmarked for its product, and a free lot per gift.
 * - Opening a reading reserves units from lots (an unlock). The reservation is then either spent,
 *   when the reading is delivered, or restored when it fails.
 * - Every movement is a ledger row with a UNIQUE idempotency key. Every multi-step change is one
 *   D1 batch, so a retry or a crash never moves credit twice.
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

/** 별조각 from the signup gift last this many KST days after the day they arrive. */
export const GIFT_DAYS = 90;
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

/** A ledger row written only while the unlock is still reserved: delivery and release race safely. */
function ledgerRowIfReserved(db: D1Binding, e: Entry & { unlockId: string }): D1Statement {
  return db.prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RESERVED}`).bind(...values(e), e.unlockId);
}

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

/** The signup gift, once per Kakao account ever (gift_claims outlives the account). False when it was given before. */
export async function grantSignupGift(db: D1Binding, input: { userId: string; kakaoKey: string; units: number; now: number }): Promise<boolean> {
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

/** The paid lot an order grants. Its id comes from the order id, so it can exist only once. */
export function paidLotStatements(db: D1Binding, input: { userId: string; orderId: string; productId: string; units: number; now: number }): D1Statement[] {
  return grantStatements(
    db,
    { id: `lot_${input.orderId}`, userId: input.userId, currency: "paid", source: "order", orderId: input.orderId, productId: input.productId, units: input.units, expiresAt: null },
    input.now,
  );
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
      // A lot that is no longer active becomes -1, which the CHECK rejects: the whole batch rolls back.
      db.prepare("UPDATE credit_lots SET units_left = CASE WHEN status = 'active' THEN units_left - ? ELSE -1 END WHERE id = ?").bind(units, lotId),
      ledgerRow(db, { userId, currency, kind: "reserve", units, lotId, unlockId, idem: `reserve:${unlockId}:${lotId}`, now }),
    ]),
  ];
}

export type ReserveResult = { ok: true; unlockId: string; allocations: Allocation[] } | { ok: false };

/**
 * Holds `units` of `currency` for opening `productId`: lots earmarked for the product first, then
 * the ones that expire soonest. A lot changed meanwhile (spent elsewhere, refunded, expired) fails
 * the CHECK and rolls the reservation back; one retry from a fresh read, then no credit.
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
 * batch. "lost" means the reservation had already been released (it outlived RESERVATION_MS). The
 * reading is still saved and the user keeps the units: a slow generation never costs twice.
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
      ledgerRowIfReserved(db, { userId: unlock.user_id, currency: unlock.currency, kind: "spend", units, lotId, unlockId: unlock.id, idem: `spend:${unlock.id}:${lotId}`, now: input.now }),
    ),
    db.prepare("UPDATE unlocks SET status = 'delivered', reading_id = ?, settled_at = ? WHERE id = ? AND status = 'reserved'").bind(input.readingId, input.now, unlock.id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1 ? "delivered" : "lost";
}

/** Returns a reservation's units to their lots (failed or abandoned generation). Idempotent; false when it was not reserved. */
export async function releaseUnlock(db: D1Binding, input: { unlockId: string; now: number }): Promise<boolean> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock || unlock.status !== "reserved") return false;
  const results = await db.batch([
    ...allocationsOf(unlock).flatMap(([lotId, units]) => [
      db.prepare(`UPDATE credit_lots SET units_left = units_left + ? WHERE id = ? AND ${RESERVED}`).bind(units, lotId, unlock.id),
      ledgerRowIfReserved(db, { userId: unlock.user_id, currency: unlock.currency, kind: "restore", units, lotId, unlockId: unlock.id, idem: `restore:${unlock.id}:${lotId}`, now: input.now }),
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

/** Releases this user's reservations older than RESERVATION_MS and expires their lots past expiry. */
export async function sweepUser(db: D1Binding, userId: string, now: number): Promise<void> {
  const stale = await db.prepare("SELECT id FROM unlocks WHERE user_id = ? AND status = 'reserved' AND reserved_until < ?").bind(userId, now).all<{ id: string }>();
  for (const { id } of stale.results) await releaseUnlock(db, { unlockId: id, now });
  const expired = await db
    .prepare("SELECT * FROM credit_lots WHERE user_id = ? AND status IN ('active', 'expired') AND expires_at IS NOT NULL AND expires_at <= ? AND units_left > 0")
    .bind(userId, now)
    .all<Lot>();
  for (const lot of expired.results) await db.batch(forfeitStatements(db, lot, "expired", now));
}

// ---- refunds ----

/** Takes an unused paid lot out of use before its payment is cancelled; null when it was opened or is being opened. */
export function lockUnusedPaidLot(db: D1Binding, orderId: string): Promise<Lot | null> {
  return db
    .prepare(
      `UPDATE credit_lots SET units_left = 0, status = 'refunding'
       WHERE order_id = ? AND currency = 'paid' AND status = 'active' AND units_left = units_total RETURNING *`,
    )
    .bind(orderId)
    .first<Lot>();
}

/** Puts a lot back in use when its cancellation was refused. */
export async function unlockRefundingLot(db: D1Binding, orderId: string): Promise<void> {
  await db.prepare("UPDATE credit_lots SET units_left = units_total, status = 'active' WHERE order_id = ? AND status = 'refunding'").bind(orderId).run();
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
Expected: PASS, 13 tests in each runner. The int runner takes a few seconds for workerd.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/pay/ledger.ts apps/web/lib/pay/ledgerContract.ts apps/web/lib/pay/ledger.test.ts apps/web/lib/pay/ledger.int.test.ts
git commit -m "feat(pay): one ledger for 달빛 and 별조각 with reserve, deliver and release" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
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
  - Task 2: `paymentsMode`, `salesOpen`.
  - Task 3: `openAccount`, `openAccountRoute`, `redirectTo`, `safeReturnTo`, `kakaoKey`, `loginKakaoUser`, `createSession`, `revokeSession`, `SESSION_COOKIE`, `CLEAR_SESSION`.
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
    - `GET /api/me` → `{ payments: boolean; owner: boolean; user: null | { nickname; stardust; stardustExpiresAt: string | null; unused: Array<{orderId; productId}> } }`
  - Callback outcomes:
    - `?login=ok|cancel|failed|closed|unavailable|busy` appended to the return path;
    - `/?login=failed` when the state is not this browser's.
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
      owner: false,
      user: { nickname: "테스트 별손님", stardust: 10, stardustExpiresAt: new Date(giftExpiry(T0)).toISOString(), unused: [] },
    });
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    expect((await me(b)).user).toBeNull();
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first()).toEqual({ n: 1 });
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
    expect(await me(owner)).toMatchObject({ payments: true, owner: true, user: { stardust: 10 } });
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
    expect(await me(browser())).toEqual({ payments: false, owner: false, user: null });
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
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { randomId } from "@/lib/security/sign";

/**
 * GET ?returnTo=/path&age=1 → Kakao's consent screen, with a signed 10-minute state cookie guarding
 * the way back. It works only while sign-ups are open for this device (STARLOG_PAYMENTS), and only
 * after the 만 14세 check on /login. With STARLOG_KAKAO=mock it goes straight to the callback with a
 * `mock:<mockUser>` code (tests, e2e). Without `mockUser` each login is a fresh mock account, so
 * repeated e2e runs on the same local D1 each start with the signup gift.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, returnTo, { login: ctx.status === 429 ? "busy" : "unavailable" });
  if (!salesOpen(paymentsMode(), ctx.owner)) return redirectTo(request, returnTo, { login: "closed" });
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
import { KakaoError, kakaoLogin } from "@/lib/account/kakao";
import { CLEAR_OAUTH, OAUTH_COOKIE, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser } from "@/lib/account/users";
import { SITE } from "@/lib/config";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's sl_oauth cookie.
 * - Login: find or create the account, give the signup gift to a new account while sales are open
 *   (once per Kakao account), start a session, and return with ?login=ok|cancel|failed.
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

  let login: Awaited<ReturnType<typeof kakaoLogin>>;
  try {
    login = await kakaoLogin(code);
  } catch (error) {
    console.error(JSON.stringify({ evt: "auth.kakao_failed", step: error instanceof KakaoError ? error.step : "unknown", status: error instanceof KakaoError ? error.status : 0 }));
    return back("failed");
  }
  const key = await kakaoKey(login.profile.id, ctx.accountSecret);
  const { user, created } = await loginKakaoUser(ctx.db, { key, nickname: login.profile.nickname, ageConfirmed: intent.age, now: ctx.now });
  const gifted = created && salesOpen(paymentsMode(), ctx.owner)
    ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, units: SITE.price.signupGiftFree, now: ctx.now })
    : false;
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
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → { payments, owner, user }:
 * - `payments`: whether sales are open for this device;
 * - `owner`: whether it holds the owner pass;
 * - `user`: the logged-in user's nickname, 별조각 (with the soonest expiry) and unopened purchases.
 * Without a session cookie it never touches D1, so the beta works with no database.
 */
export async function GET(request: Request): Promise<Response> {
  const now = Date.now();
  const cookies = parseCookies(request);
  const secret = signingSecret();
  const owner = secret ? await isOwner(cookies[OWNER_COOKIE], secret, now) : false;
  const payments = salesOpen(paymentsMode(), owner);
  if (!cookies[SESSION_COOKIE]) return json({ payments, owner, user: null });
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response) return json({ payments: false, owner, user: null });
  if (!ctx.session) return json({ payments, owner, user: null }, { cookies: [serializeCookie(CLEAR_SESSION)] });
  const wallet = await walletSummary(ctx.db, ctx.session.user.id, now);
  return json({
    payments,
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
Expected: PASS (kakao 5, auth 8, account 12).

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
    - `interface TossClient { mode: "test" | "live" | "mock"; confirm({paymentKey, orderId, amount}); getPayment(paymentKey); getPaymentByOrder(orderId); cancel(paymentKey, {reason, idempotencyKey}) }`, all `Promise<TossPayment>`
    - `parsePayment(value: unknown): TossPayment`
  - `toss.ts`: `TOSS_API`, `tossAuthorization(secretKey)`, `createTossClient(secretKey, fetchImpl?, timeoutMs?)`, `tossClient(env?): TossClient | null`
  - `tossMock.ts`: `createMockToss(): TossClient & { reset(): void }`, `mockToss` (the one instance `tossClient()` returns under `STARLOG_PAY=mock`)

- [ ] **Step 1: Write the failing test** — `apps/web/lib/pay/toss.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createTossClient, tossAuthorization, tossClient } from "./toss";
import { mockToss } from "./tossMock";
import { TossError } from "./tossTypes";

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

  it("approves once per payment key, like Toss", async () => {
    const payment = await mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 });
    expect(payment).toMatchObject({ status: "DONE", totalAmount: 2900, orderId: ORDER });
    await expect(mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ code: "ALREADY_PROCESSED_PAYMENT" });
    expect(await mockToss.getPaymentByOrder(ORDER)).toEqual(payment);
  });

  it("declines mock_fail keys and cancels once", async () => {
    await expect(mockToss.confirm({ paymentKey: "mock_fail_1", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ status: 403, code: "REJECT_CARD_PAYMENT" });
    await mockToss.confirm({ paymentKey: "mock_2", orderId: ORDER, amount: 2900 });
    expect(await mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "i" })).toMatchObject({ status: "CANCELED", balanceAmount: 0 });
    await expect(mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "i" })).rejects.toMatchObject({ code: "ALREADY_CANCELED_PAYMENT" });
    await expect(mockToss.getPayment("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND_PAYMENT" });
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

/**
 * STARLOG_PAY=mock: an in-memory Toss for tests, e2e and local dev. It behaves like the real API
 * where the app depends on it:
 * - confirm is once per paymentKey (again → ALREADY_PROCESSED_PAYMENT);
 * - a paymentKey starting with "mock_fail" is declined;
 * - cancel empties the balance once.
 */
export function createMockToss(): TossClient & { reset(): void } {
  const payments = new Map<string, TossPayment>();
  const find = (paymentKey: string) => {
    const payment = payments.get(paymentKey);
    if (!payment) throw new TossError(404, "NOT_FOUND_PAYMENT", "존재하지 않는 결제 정보 입니다.");
    return payment;
  };
  return {
    mode: "mock",
    async confirm({ paymentKey, orderId, amount }) {
      if (payments.has(paymentKey)) throw new TossError(400, "ALREADY_PROCESSED_PAYMENT", "이미 처리된 결제 입니다.");
      if (paymentKey.startsWith("mock_fail")) throw new TossError(403, "REJECT_CARD_PAYMENT", "한도초과 혹은 잔액부족으로 결제에 실패했습니다.");
      const payment: TossPayment = { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString(), receiptUrl: null };
      payments.set(paymentKey, payment);
      return payment;
    },
    async getPayment(paymentKey) {
      return find(paymentKey);
    },
    async getPaymentByOrder(orderId) {
      for (const payment of payments.values()) if (payment.orderId === orderId) return payment;
      throw new TossError(404, "NOT_FOUND_PAYMENT", "존재하지 않는 결제 정보 입니다.");
    },
    async cancel(paymentKey) {
      const payment = find(paymentKey);
      if (payment.status === "CANCELED") throw new TossError(400, "ALREADY_CANCELED_PAYMENT", "이미 취소된 결제 입니다.");
      const canceled = { ...payment, status: "CANCELED", balanceAmount: 0 };
      payments.set(paymentKey, canceled);
      return canceled;
    },
    reset: () => payments.clear(),
  };
}

/** The one mock instance (kept on globalThis so every route bundle in `next dev` shares it). */
export const mockToss: TossClient & { reset(): void } = ((globalThis as unknown as { __starlogMockToss?: ReturnType<typeof createMockToss> }).__starlogMockToss ??= createMockToss());
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
 * - POSTs carry an Idempotency-Key, which Toss keeps for 15 days.
 * - Confirm must run within 10 minutes of the buyer's authentication.
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
Expected: PASS (8 tests). One `config.pay_invalid` line on stderr is expected from the null case.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/tossTypes.ts apps/web/lib/pay/toss.ts apps/web/lib/pay/tossMock.ts apps/web/lib/pay/toss.test.ts
git commit -m "feat(pay): Toss confirm, lookup and cancel client with an in-memory mock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Orders, checkout info, confirm

**Files:**
- Create: `apps/web/lib/pay/orders.ts`, `apps/web/app/api/pay/checkout/route.ts`, `apps/web/app/api/pay/orders/route.ts`, `apps/web/app/api/pay/confirm/route.ts`
- Modify: `apps/web/lib/testing/p4.ts` (add `buy`)
- Test: `apps/web/app/api/pay/pay.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `productById`, `sellable`, `unitsFor`, `paymentsMode`, `salesOpen`, `payProvider`, `tossClientKey`.
  - Task 3: `openAccountRoute`, `requireSession`, `safeReturnTo`.
  - Task 4: `paidLotStatements`. Task 6: `tossClient`, `TossError`, `TossClient`, `TossPayment`.
  - Existing: `isConstraintError`, `randomId`, `json`, `errorResponse`, `readJson`.
- Produces:
  - `orders.ts`:
    - `type OrderStatus`, `interface OrderRow` (the `orders` row)
    - `createOrder(db, {userId, product, returnTo, now}): Promise<OrderRow>`
    - `orderById(db, id)`, `orderForUser(db, id, userId)`
    - `markPaid(db, order, payment, mode, now): Promise<void>` (idempotent)
    - `type ConfirmOutcome = {ok: true; order} | {ok: false; code: "PAY_FAILED" | "PAY_PENDING" | "BAD_REQUEST"; message?}`
    - `confirmOrder(db, toss, {order, paymentKey, amount, now})`
    - `RECONCILE_AFTER_MS = 30_000`, `reconcileConfirming(db, toss, order, now): Promise<OrderRow>`
    - `interface OrderListItem { orderId; productId; amount; status; createdAt; receiptUrl; method; refundable; opened }`, `orderHistory(db, userId, limit?)`
  - `GET /api/pay/checkout?product=` → `{ productId, name, amount, customerKey, provider: "toss" | "mock", clientKey: string | null }`
  - `POST /api/pay/orders {productId, returnTo?, ack: true}` → `{ orderId, orderName, amount, successUrl, failUrl }`
  - `GET /api/pay/orders?id=` → `{ orderId, productId, status, returnTo }`; `GET /api/pay/orders` → `{ orders: OrderListItem[] }`
  - `POST /api/pay/confirm {paymentKey, orderId, amount}` → `{ status: "paid", orderId, productId, returnTo }` or an error code
  - `lib/testing/p4.ts`: `buy(b, productId?): Promise<string>` (order id)

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
    expect(await db.prepare("SELECT amount_krw, status, withdrawal_ack_at FROM orders WHERE id = ?").bind(body.orderId).first()).toEqual({ amount_krw: 2900, status: "created", withdrawal_ack_at: T0 });
  });

  it("refuses premium readings before P5, unknown products, guests, closed sales and other sites", async () => {
    useTestDb();
    const b = await loggedIn();
    expect((await order(b, { productId: "match", ack: true })).status).toBe(409);
    expect((await order(b, { productId: "moon-30", ack: true })).status).toBe(409);
    expect((await order(browser("192.0.2.1"), { productId: "tarot", ack: true })).status).toBe(401);
    expect((await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true } })).status).toBe(403);
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await order(b, { productId: "tarot", ack: true })).status).toBe(409);
  });
});

describe("confirm", () => {
  it("confirms once and grants exactly one unopened reading, however often it is called", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    const again = await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_again", orderId, amount: 2900 }, origin: true });
    expect(again.status).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant' AND order_id = ?").bind(orderId).first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT status, mode, total_amount FROM payments WHERE order_id = ?").bind(orderId).first()).toEqual({ status: "DONE", mode: "mock", total_amount: 2900 });
  });

  it("refuses an amount that is not the order's, and never asks Toss", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await order(b, { productId: "tarot", ack: true })).json()) as { orderId: string };
    const spy = vi.spyOn(mockToss, "confirm");
    const res = await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_x", orderId, amount: 100 }, origin: true });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "AMOUNT_MISMATCH" });
  });

  it("shows Toss's message for a declined card and grants nothing", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await order(b, { productId: "tarot", ack: true })).json()) as { orderId: string };
    const res = await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_fail_1", orderId, amount: 2900 }, origin: true });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots").first()).toEqual({ n: 0 });
  });

  it("does not confirm someone else's order", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    const { orderId } = (await (await order(alice, { productId: "tarot", ack: true })).json()) as { orderId: string };
    const bob = await loggedIn("bob");
    expect((await bob.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_b", orderId, amount: 2900 }, origin: true })).status).toBe(400);
  });

  it("asks Toss again when the confirm answer was lost, and grants once", async () => {
    useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await order(b, { productId: "tarot", ack: true })).json()) as { orderId: string };
    const real = mockToss.confirm.bind(mockToss);
    vi.spyOn(mockToss, "confirm").mockImplementationOnce(async (input) => {
      await real(input);
      throw new TossError(0, "NETWORK", "no response from Toss");
    });
    const lost = await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_lost", orderId, amount: 2900 }, origin: true });
    expect(lost.status).toBe(409);
    expect(await lost.json()).toMatchObject({ code: "PAY_PENDING" });
    expect(await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()).toMatchObject({ status: "confirming" });
    vi.setSystemTime(T0 + 31_000);
    expect(await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()).toEqual({ orderId, productId: "tarot", status: "paid", returnTo: "/tarot/result" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("lists the buyer's paid orders with what can still be refunded", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const { orders } = (await (await b.send(ordersGet, "/api/pay/orders")).json()) as { orders: Array<Record<string, unknown>> };
    expect(orders).toEqual([{ orderId, productId: "tarot", amount: 2900, status: "paid", createdAt: T0, receiptUrl: null, method: "카드", refundable: true, opened: false }]);
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
import { TossError, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Orders and Toss confirmation (spec 5.2, 5.3). The amount always comes from the order row, which
 * came from the catalog. Toss is the source of truth: a lost or ambiguous answer is settled by
 * asking Toss again, never by guessing.
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

/**
 * Records a DONE payment and grants its paid lot in one batch. UNIQUE payment_key, order_id and
 * idem_key make a second call (a repeated confirm, or the webhook first) a no-op.
 */
export async function markPaid(db: D1Binding, order: OrderRow, payment: TossPayment, mode: TossClient["mode"], now: number): Promise<void> {
  const product = productById(order.product_id);
  if (!product) throw new Error(`unknown product ${order.product_id}`);
  try {
    await db.batch([
      db
        .prepare("UPDATE orders SET status = 'paid', payment_key = ?, fail_code = NULL, updated_at = ? WHERE id = ? AND status IN ('created', 'confirming', 'failed')")
        .bind(payment.paymentKey, now, order.id),
      db
        .prepare("INSERT INTO payments (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(payment.paymentKey, order.id, payment.method, payment.totalAmount, payment.status, payment.approvedAt, payment.receiptUrl, mode, now),
      ...paidLotStatements(db, { userId: order.user_id, orderId: order.id, productId: order.product_id, units: unitsFor(product), now }),
    ]);
    console.info(JSON.stringify({ evt: "pay.paid", orderId: order.id, mode }));
  } catch (error) {
    if (!isConstraintError(error)) throw error;
  }
}

export type ConfirmOutcome = { ok: true; order: OrderRow } | { ok: false; code: "PAY_FAILED" | "PAY_PENDING" | "BAD_REQUEST"; message?: string };

/** The successUrl's confirm (spec 5.3): amount check, one claim per order, Toss confirm, then markPaid. */
export async function confirmOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; paymentKey: string; amount: number; now: number }): Promise<ConfirmOutcome> {
  const { order, paymentKey, amount, now } = input;
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
    if (error instanceof TossError && error.code === "ALREADY_PROCESSED_PAYMENT") {
      try {
        payment = await toss.getPaymentByOrder(order.id);
      } catch {
        return { ok: false, code: "PAY_PENDING" };
      }
    } else if (error instanceof TossError && error.status >= 400 && error.status < 500) {
      await setStatus(db, order.id, ["confirming"], "failed", now, error.code);
      console.info(JSON.stringify({ evt: "pay.confirm_declined", orderId: order.id, code: error.code }));
      return { ok: false, code: "PAY_FAILED", message: error.message };
    } else {
      // No answer, or a Toss-side error: the payment may have gone through. The order stays
      // `confirming` and reconcileConfirming() asks Toss after RECONCILE_AFTER_MS.
      console.warn(JSON.stringify({ evt: "pay.confirm_unknown", orderId: order.id, code: error instanceof TossError ? error.code : "UNKNOWN" }));
      return { ok: false, code: "PAY_PENDING" };
    }
  }
  if (!matches(order, payment)) {
    await setStatus(db, order.id, ["confirming"], "failed", now, `UNEXPECTED_${payment.status}`);
    console.error(JSON.stringify({ evt: "pay.confirm_mismatch", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_FAILED" };
  }
  await markPaid(db, order, payment, toss.mode, now);
  return { ok: true, order: (await orderById(db, order.id)) ?? order };
}

/** How long a `confirming` order waits before we ask Toss what became of it. */
export const RECONCILE_AFTER_MS = 30_000;

/** A `confirming` order whose confirm answer was lost: Toss decides (DONE → paid; ended or unknown → failed). */
export async function reconcileConfirming(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<OrderRow> {
  if (order.status !== "confirming" || now - order.updated_at < RECONCILE_AFTER_MS) return order;
  try {
    const payment = await toss.getPaymentByOrder(order.id);
    if (matches(order, payment)) await markPaid(db, order, payment, toss.mode, now);
    else if (["ABORTED", "EXPIRED", "CANCELED"].includes(payment.status)) await setStatus(db, order.id, ["confirming"], "failed", now, payment.status);
  } catch (error) {
    if (error instanceof TossError && error.code === "NOT_FOUND_PAYMENT") await setStatus(db, order.id, ["confirming"], "failed", now, "NOT_FOUND_PAYMENT");
    else return order;
  }
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
import { createOrder, orderForUser, orderHistory, reconcileConfirming } from "@/lib/pay/orders";
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

/** GET ?id= → one order's status (settling a lost confirm with Toss); GET → 결제 내역. */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const toss = tossClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null) {
    let order = await orderForUser(ctx.db, id, session.user.id);
    if (!order) return errorResponse("BAD_REQUEST");
    if (toss) order = await reconcileConfirming(ctx.db, toss, order, ctx.now);
    return json({ orderId: order.id, productId: order.product_id, status: order.status, returnTo: order.return_to });
  }
  return json({ orders: await orderHistory(ctx.db, session.user.id) });
}
```

`apps/web/app/api/pay/confirm/route.ts`:

```ts
import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { confirmOrder, orderForUser } from "@/lib/pay/orders";
import { tossClient } from "@/lib/pay/toss";

const ConfirmBody = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  amount: z.coerce.number().int().positive(),
});

/**
 * POST {paymentKey, orderId, amount} from /pay/success (Toss's successUrl query) → confirm with Toss
 * and grant the reading once. Safe to repeat. Not gated by STARLOG_PAYMENTS: a payment that
 * already started must always be confirmable.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const toss = tossClient();
  if (!toss) return errorResponse("PAY_UNAVAILABLE");
  const body = ConfirmBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderForUser(ctx.db, body.data.orderId, session.user.id);
  if (!order) return errorResponse("BAD_REQUEST");
  const outcome = await confirmOrder(ctx.db, toss, { order, paymentKey: body.data.paymentKey, amount: body.data.amount, now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({ status: "paid", orderId: outcome.order.id, productId: outcome.order.product_id, returnTo: outcome.order.return_to });
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/app/api/pay apps/web/app/api/auth apps/web/lib/pay`
Expected: PASS (pay.test: 10 tests, plus the earlier suites).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/orders.ts apps/web/app/api/pay/checkout apps/web/app/api/pay/orders apps/web/app/api/pay/confirm apps/web/app/api/pay/pay.test.ts apps/web/lib/testing/p4.ts
git commit -m "feat(pay): orders at catalog prices and idempotent Toss confirm" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Refunds, reconciliation, webhook

**Files:**
- Create: `apps/web/lib/pay/refunds.ts`, `apps/web/app/api/pay/refund/route.ts`, `apps/web/app/api/pay/webhook/route.ts`
- Modify: `apps/web/app/api/pay/orders/route.ts` (also reconcile `refunding` orders)
- Test: `apps/web/app/api/pay/refund.test.ts`

**Interfaces:**
- Consumes:
  - Task 4: `lockUnusedPaidLot`, `unlockRefundingLot`, `refundingLot`, `refundedLotStatements`, `Lot`, plus `reserveUnlock`/`deliverUnlock` (tests only).
  - Task 6: `tossClient`, `TossError`, `TossPayment`, `TossClient`.
  - Task 7: `markPaid`, `orderById`, `orderForUser`, `OrderRow`, `buy` (p4 helper).
  - `accountDb`, `rateLimit`, `clientKey`.
- Produces:
  - `refunds.ts`:
    - `type RefundOutcome = {ok: true} | {ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?}`
    - `applyCancel(db, order, lot: Lot | null, payment, now)`
    - `refundUnusedOrder(db, toss, {order, reason, now}): Promise<RefundOutcome>`
    - `REFUND_RECONCILE_AFTER_MS = 60_000`, `reconcileRefunding(db, toss, order, now): Promise<OrderRow>`
    - `syncOrderWithToss(db, toss, order, payment, now): Promise<void>`
  - `POST /api/pay/refund {orderId}` → `{ ok: true, status: "refunded" }` | 409 `NOT_REFUNDABLE` | 402 `PAY_FAILED` | 409 `PAY_PENDING`
  - `POST /api/pay/webhook` (Toss `PAYMENT_STATUS_CHANGED`) → 200 `{ok: true}`; non-200 makes Toss retry

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/pay/refund.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { deliverUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";
import { POST as refund } from "./refund/route";
import { POST as webhook } from "./webhook/route";

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

const refundOf = (b: Browser, orderId: string) => b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
const hook = (body: unknown) => browser("203.0.113.200").send(webhook, "/api/pay/webhook", { body });
const paymentKeyOf = async (db: ReturnType<typeof useTestDb>, orderId: string) =>
  (await db.prepare("SELECT payment_key FROM orders WHERE id = ?").bind(orderId).first<{ payment_key: string }>())!.payment_key;

describe("refunds", () => {
  it("refunds an unopened reading in full, once", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect((await me(b)).user?.unused).toEqual([]);
    expect(await db.prepare("SELECT o.status AS o, p.status AS p, l.status AS l FROM orders o JOIN payments p ON p.order_id = o.id JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", p: "CANCELED", l: "refunded" });
    expect((await refundOf(b, orderId)).status).toBe(409);
  });

  it("will not refund a reading that was opened", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const userId = (await db.prepare("SELECT user_id FROM orders WHERE id = ?").bind(orderId).first<{ user_id: string }>())!.user_id;
    const reserved = await reserveUnlock(db, { userId, productId: "tarot", currency: "paid", units: 10, now: T0 });
    if (!reserved.ok) throw new Error("not reserved");
    expect((await refundOf(b, orderId)).status).toBe(409);
    await deliverUnlock(db, { unlockId: reserved.unlockId, readingId: "r1", now: T0 });
    expect((await refundOf(b, orderId)).status).toBe(409);
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("DONE");
  });

  it("puts the reading back when Toss refuses the cancel", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    vi.spyOn(mockToss, "cancel").mockRejectedValueOnce(new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "취소 할 수 없는 결제 입니다." });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("asks Toss later when the cancel answer was lost", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    vi.spyOn(mockToss, "cancel").mockRejectedValueOnce(new TossError(0, "NETWORK", "no response from Toss"));
    expect((await refundOf(b, orderId)).status).toBe(409);
    expect(await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()).toMatchObject({ status: "refunding" });
    vi.setSystemTime(T0 + 61_000);
    // Toss never cancelled it (the mock still says DONE): the reading comes back.
    expect(await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()).toMatchObject({ status: "paid" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("refunds only the buyer's own orders", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    const orderId = await buy(alice);
    const bob = await loggedIn("bob");
    expect((await refundOf(bob, orderId)).status).toBe(409);
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

  it("applies a cancellation made in the Toss dashboard", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect((await me(b)).user?.unused).toEqual([]);
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
import { lockUnusedPaidLot, refundedLotStatements, refundingLot, unlockRefundingLot, type Lot } from "./ledger";
import { markPaid, orderById, type OrderRow } from "./orders";
import { TossError, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Refunds and Toss reconciliation (spec 5.5, 5.6). The lot leaves use before the cancel call, so
 * nobody can open a reading while its payment is being cancelled. An ambiguous answer is settled by
 * asking Toss later.
 */

export type RefundOutcome = { ok: true } | { ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?: string };

const CANCELED = new Set(["CANCELED", "PARTIAL_CANCELED"]);

/** Records a cancellation Toss confirmed: order refunded, payment updated, and the lot refunded when it was still unused. */
export async function applyCancel(db: D1Binding, order: OrderRow, lot: Lot | null, payment: TossPayment, now: number): Promise<void> {
  await db.batch([
    db.prepare("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('paid', 'refunding')").bind(now, order.id),
    db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, canceled_at = ?, updated_at = ? WHERE order_id = ?")
      .bind(payment.status, payment.totalAmount - payment.balanceAmount, new Date(now).toISOString(), now, order.id),
    ...(lot ? refundedLotStatements(db, lot, now) : []),
  ]);
  console.info(JSON.stringify({ evt: "pay.refunded", orderId: order.id }));
}

async function revertRefund(db: D1Binding, order: OrderRow, now: number): Promise<void> {
  await unlockRefundingLot(db, order.id);
  await db.prepare("UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'refunding'").bind(now, order.id).run();
}

/** Cancels the payment of a paid reading that was never opened (the user's 환불, account deletion). */
export async function refundUnusedOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; reason: string; now: number }): Promise<RefundOutcome> {
  const { order, reason, now } = input;
  if (order.status !== "paid" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  const lot = await lockUnusedPaidLot(db, order.id);
  if (!lot) return { ok: false, code: "NOT_REFUNDABLE" };
  await db.prepare("UPDATE orders SET status = 'refunding', updated_at = ? WHERE id = ? AND status = 'paid'").bind(now, order.id).run();
  let payment: TossPayment;
  try {
    payment = await toss.cancel(order.payment_key, { reason, idempotencyKey: `cancel-${order.id}` });
  } catch (error) {
    if (error instanceof TossError && error.code === "ALREADY_CANCELED_PAYMENT") {
      payment = await toss.getPayment(order.payment_key);
    } else if (error instanceof TossError && error.status >= 400 && error.status < 500) {
      await revertRefund(db, order, now);
      console.info(JSON.stringify({ evt: "pay.refund_refused", orderId: order.id, code: error.code }));
      return { ok: false, code: "PAY_FAILED", message: error.message || "환불하지 못했어요. 문의해 주세요." };
    } else {
      // No answer: Toss may have cancelled. Stay `refunding`; reconcileRefunding() decides after a minute.
      console.warn(JSON.stringify({ evt: "pay.refund_unknown", orderId: order.id }));
      return { ok: false, code: "PAY_PENDING" };
    }
  }
  await applyCancel(db, order, lot, payment, now);
  return { ok: true };
}

/** How long a `refunding` order waits before we ask Toss what became of it. */
export const REFUND_RECONCILE_AFTER_MS = 60_000;

/** A `refunding` order whose cancel answer was lost: cancelled at Toss → refunded; still DONE → back to paid. */
export async function reconcileRefunding(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<OrderRow> {
  if (order.status !== "refunding" || !order.payment_key || now - order.updated_at < REFUND_RECONCILE_AFTER_MS) return order;
  const payment = await toss.getPayment(order.payment_key).catch(() => null);
  if (!payment) return order;
  if (CANCELED.has(payment.status)) await applyCancel(db, order, await refundingLot(db, order.id), payment, now);
  else if (payment.status === "DONE") await revertRefund(db, order, now);
  return (await orderById(db, order.id)) ?? order;
}

/** Brings an order in line with a payment Toss reported (webhook): the one place Toss's word is applied. */
export async function syncOrderWithToss(db: D1Binding, toss: TossClient, order: OrderRow, payment: TossPayment, now: number): Promise<void> {
  if (payment.orderId !== order.id) return;
  if (payment.status === "DONE") {
    if (order.status === "created" || order.status === "confirming" || order.status === "failed") {
      if (payment.totalAmount === order.amount_krw) await markPaid(db, order, payment, toss.mode, now);
      else console.error(JSON.stringify({ evt: "pay.webhook_amount_mismatch", orderId: order.id }));
    }
    return;
  }
  if (CANCELED.has(payment.status)) {
    if (order.status === "paid" || order.status === "refunding") {
      const lot = (await lockUnusedPaidLot(db, order.id)) ?? (await refundingLot(db, order.id));
      if (!lot) console.warn(JSON.stringify({ evt: "pay.canceled_after_open", orderId: order.id }));
      await applyCancel(db, order, lot, payment, now);
    }
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

- [ ] **Step 5: Reconcile refunds in `apps/web/app/api/pay/orders/route.ts`.** In the `GET ?id=` branch, after `reconcileConfirming`, add:

```ts
    if (toss) order = await reconcileRefunding(ctx.db, toss, order, ctx.now);
```

Before building the history list, settle stale orders:

```ts
  if (toss) {
    const { results } = await ctx.db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND status IN ('confirming', 'refunding') AND updated_at < ?")
      .bind(session.user.id, ctx.now - 30_000)
      .all<OrderRow>();
    for (const stale of results) {
      await reconcileConfirming(ctx.db, toss, stale, ctx.now);
      await reconcileRefunding(ctx.db, toss, stale, ctx.now);
    }
  }
```

Import `reconcileRefunding` from `@/lib/pay/refunds` and `type OrderRow` from `@/lib/pay/orders`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/app/api/pay apps/web/lib/pay`
Expected: PASS (refund.test: 9 tests; pay.test unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/pay/refunds.ts apps/web/app/api/pay/refund apps/web/app/api/pay/webhook apps/web/app/api/pay/orders/route.ts apps/web/app/api/pay/refund.test.ts
git commit -m "feat(pay): refunds of unopened readings, Toss reconciliation and the webhook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Saved readings store and the stream settlement hook

**Files:**
- Create: `apps/web/lib/readings/store.ts`
- Modify: `apps/web/lib/api/stream.ts` (the `Settlement` hook and the `credit` cost flag)
- Test: `apps/web/lib/readings/store.test.ts`, `apps/web/lib/api/settle.test.ts`

**Interfaces:**
- Consumes:
  - `sealJson`, `openJson`, `READING_KEY_VERSION` (Task 3); `D1Binding`, `D1Statement`, `isConstraintError`.
  - `readingDigest` from `lib/security/chapterToken.ts`.
  - `stream.ts` as committed in a9fa89c: `respondGeneration`, `GenerationOutcome`, `RespondOptions`, the `account()` helper, `recordCost`, `recordClientSpend`.
  - `usdOf` from `lib/ai/cost.ts`.
- Produces:
  - `store.ts`:
    - `type ReadingSource = "paid" | "free" | "owner" | "claimed"`
    - `interface ServerChapter { kind: "tarot" | "saju"; reading: Record<string, unknown>; chapterToken: string; createdAt: number; turns: Array<{question; answer}>; followUpsLeft: number; [key: string]: unknown }`
    - `interface SavedReading { id; createdAt; chapter: ServerChapter }`
    - `newReadingId(): string` (20 chars `[a-z0-9]`, also a valid device chapter id)
    - `insertReadingStatement(db, secret, {id, userId, productId, source, unlockId, chapter, now}): Promise<D1Statement>`
    - `listReadings(db, secret, userId, limit?)`, `readingForUser(db, secret, userId, id)`
    - `readingIdByDigest(db, userId, reading)`, `updateReadingChapter(db, secret, userId, id, update, now): Promise<boolean>`
    - `deleteReading(db, userId, id): Promise<boolean>`, `deleteAllReadings(db, userId): Promise<number>`, `countReadings(db, userId)`
  - `stream.ts`:
    - `interface Settlement { deliver(outcome): Promise<Record<string, unknown>>; release(): Promise<void> }`
    - `RespondOptions` gains `settle?: Settlement` and `credit?: boolean`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/readings/store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import {
  countReadings,
  deleteAllReadings,
  deleteReading,
  insertReadingStatement,
  listReadings,
  newReadingId,
  readingForUser,
  readingIdByDigest,
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

async function save(db: D1Binding, userId: string, c: ServerChapter, now = 10) {
  const id = newReadingId();
  await (await insertReadingStatement(db, SECRET, { id, userId, productId: "tarot", source: "paid", unlockId: null, chapter: c, now })).run();
  return id;
}

describe("saved readings", () => {
  it("makes ids that are also valid device chapter ids", () => {
    for (let i = 0; i < 20; i++) expect(newReadingId()).toMatch(/^[a-z0-9]{20}$/);
  });

  it("stores readings sealed and gives them back only to their owner, newest first", async () => {
    const db = await setup();
    const first = await save(db, "u_1", chapter("첫 질문"), 10);
    await save(db, "u_1", chapter("둘째 질문"), 20);
    const raw = await db.prepare("SELECT payload FROM readings WHERE id = ?").bind(first).first<{ payload: string }>();
    expect(raw!.payload).not.toContain("첫 질문");
    expect((await listReadings(db, SECRET, "u_1")).map((r) => r.chapter.question)).toEqual(["둘째 질문", "첫 질문"]);
    expect(await listReadings(db, SECRET, "u_2")).toEqual([]);
    expect(await readingForUser(db, SECRET, "u_2", first)).toBeNull();
    expect((await readingForUser(db, SECRET, "u_1", first))?.chapter.question).toBe("첫 질문");
    expect(await countReadings(db, "u_1")).toBe(2);
  });

  it("keeps one copy of the same reading per user", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("같은 질문"));
    await expect(save(db, "u_1", chapter("같은 질문"))).rejects.toSatisfy(isConstraintError);
    expect(await readingIdByDigest(db, "u_1", chapter("같은 질문").reading)).toBe(id);
    await save(db, "u_2", chapter("같은 질문"));
  });

  it("updates a saved chapter and deletes one or all", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("질문"));
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

  it("skips a payload that does not open, and says so in the log", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("질문"));
    await db.prepare("UPDATE readings SET payload = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE id = ?").bind(id).run();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listReadings(db, SECRET, "u_1")).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readings.unreadable"));
    error.mockRestore();
  });
});
```

`apps/web/lib/api/settle.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/spend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/spend")>()),
  recordCost: vi.fn(async () => {}),
}));

import { mockProvider } from "@/lib/ai/mock";
import { GenerationError } from "@/lib/ai/provider";
import type { Gate } from "./http";
import { recordCost } from "./spend";
import { NDJSON, respondGeneration, type GenerationOutcome, type Settlement } from "./stream";

const gate = { secret: "s".repeat(40), provider: mockProvider, owner: false, now: Date.now(), cookies: {}, client: "client" } as unknown as Gate;
const READING_ID = "abcdefghij0123456789";
const ok = async (): Promise<GenerationOutcome> => ({ body: { reading: { verdict: "v" }, chapterToken: "t" }, cookies: [] });
const fail = async (): Promise<GenerationOutcome> => {
  throw new GenerationError("UPSTREAM");
};

function settlement(calls: string[], deliver: () => Promise<Record<string, unknown>> = async () => ({ readingId: READING_ID })): Settlement {
  return {
    deliver: async () => {
      calls.push("deliver");
      return deliver();
    },
    release: async () => {
      calls.push("release");
    },
  };
}

const post = (stream = false) => new Request("http://localhost/api/tarot/reading", { method: "POST", headers: stream ? { accept: NDJSON } : {} });
const events = async (response: Response) => (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("credit settlement around a generation", () => {
  it("JSON: saves before answering and adds the saved reading's id", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), ok, { gate, settle: settlement(calls) });
    expect(await res.json()).toEqual({ reading: { verdict: "v" }, chapterToken: "t", readingId: READING_ID });
    expect(calls).toEqual(["deliver"]);
  });

  it("JSON: releases after a failed generation and after a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    expect((await respondGeneration(post(), fail, { gate, settle: settlement(calls) })).status).toBe(502);
    expect(calls).toEqual(["release"]);
    const again: string[] = [];
    const res = await respondGeneration(post(), ok, { gate, settle: settlement(again, async () => { throw new Error("D1 down"); }) });
    expect(res.status).toBe(502);
    expect(again).toEqual(["deliver", "release"]);
  });

  it("NDJSON: done carries the saved id, so the save came first", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), ok, { gate, settle: settlement(calls) }));
    expect(list.at(-1)).toEqual({ type: "done", data: { reading: { verdict: "v" }, chapterToken: "t", readingId: READING_ID } });
    expect(calls).toEqual(["deliver"]);
  });

  it("NDJSON: an error event comes after the release", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), fail, { gate, settle: settlement(calls) }));
    expect(list.at(-1)).toMatchObject({ type: "error", status: 502 });
    expect(calls).toEqual(["release"]);
  });

  it("keeps paid model cost out of the free-tier budget, and logs it instead", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await respondGeneration(post(), ok, { gate, credit: true, settle: settlement([]) });
    expect(recordCost).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("cost.paid"));
    await respondGeneration(post(), ok, { gate });
    expect(recordCost).toHaveBeenCalledTimes(1);
  });

  it("leaves beta responses exactly as before", async () => {
    const res = await respondGeneration(post(), ok, { gate });
    expect(await res.json()).toEqual({ reading: { verdict: "v" }, chapterToken: "t" });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/lib/readings/store.test.ts apps/web/lib/api/settle.test.ts`
Expected:
- store.test fails with `Cannot find module './store'`.
- settle.test fails: the `readingId` is missing from the body, and `deliver` is never called.

- [ ] **Step 3: Write `apps/web/lib/readings/store.ts`**

```ts
import "server-only";
import { READING_KEY_VERSION, openJson, sealJson } from "@/lib/account/secrets";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { readingDigest } from "@/lib/security/chapterToken";

/**
 * Readings kept in the account (spec 5.7).
 * - A reading opened with 결제, 별조각 or the owner pass while logged in is saved automatically.
 *   Device-only chapters are saved when the user claims them.
 * - The payload is the chapter exactly as the device stores it (lib/storage/chapters.ts), sealed
 *   with AES-GCM. It holds the question, note or birth data.
 * - `digest` (of the reading itself) keeps one copy per user.
 */

export type ReadingSource = "paid" | "free" | "owner" | "claimed";

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

export async function insertReadingStatement(
  db: D1Binding,
  secret: string,
  input: { id: string; userId: string; productId: string; source: ReadingSource; unlockId: string | null; chapter: ServerChapter; now: number },
): Promise<D1Statement> {
  return db
    .prepare(
      `INSERT INTO readings (id, user_id, kind, product_id, source, unlock_id, digest, payload, key_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.userId,
      input.chapter.kind,
      input.productId,
      input.source,
      input.unlockId,
      await readingDigest(input.chapter.reading),
      await sealJson(input.chapter, secret),
      READING_KEY_VERSION,
      input.now,
      input.now,
    );
}

interface Row {
  id: string;
  created_at: number;
  payload: string;
}

async function open(row: Row, secret: string): Promise<SavedReading | null> {
  const chapter = await openJson<ServerChapter>(row.payload, secret);
  if (!chapter) {
    console.error(JSON.stringify({ evt: "readings.unreadable", id: row.id }));
    return null;
  }
  return { id: row.id, createdAt: row.created_at, chapter };
}

export async function listReadings(db: D1Binding, secret: string, userId: string, limit = 100): Promise<SavedReading[]> {
  const { results } = await db.prepare("SELECT id, created_at, payload FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(userId, limit).all<Row>();
  const out: SavedReading[] = [];
  for (const row of results) {
    const saved = await open(row, secret);
    if (saved) out.push(saved);
  }
  return out;
}

export async function readingForUser(db: D1Binding, secret: string, userId: string, id: string): Promise<SavedReading | null> {
  const row = await db.prepare("SELECT id, created_at, payload FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  return row ? open(row, secret) : null;
}

export async function readingIdByDigest(db: D1Binding, userId: string, reading: unknown): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM readings WHERE user_id = ? AND digest = ?").bind(userId, await readingDigest(reading)).first<{ id: string }>();
  return row?.id ?? null;
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
    .prepare("UPDATE readings SET payload = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(await sealJson(update(saved.chapter), secret), now, id, userId)
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

export async function countReadings(db: D1Binding, userId: string): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM readings WHERE user_id = ?").bind(userId).first<{ n: number }>())?.n ?? 0;
}
```

- [ ] **Step 4: Add the settlement hook to `apps/web/lib/api/stream.ts`.** Change only what is listed here.

Add the import:

```ts
import { usdOf } from "@/lib/ai/cost";
```

Add after `GenerationOutcome`:

```ts
/**
 * How a credit-backed generation settles (spec 5.4).
 * - `deliver` runs after validation and before the JSON body or the `done` event leaves. It saves
 *   the reading and spends the reservation; what it returns joins the body (the saved reading's id).
 * - `release` runs on every failure: generation error, budget, client gone, a failed deliver.
 * Both must be idempotent.
 */
export interface Settlement {
  deliver(outcome: GenerationOutcome): Promise<Record<string, unknown>>;
  release(): Promise<void>;
}
```

Add to `RespondOptions`:

```ts
  /** saves the reading and settles its credit before the client sees it; none for beta readings */
  settle?: Settlement;
  /** a paid or 별조각 opening: its model cost is logged as `cost.paid`, outside the free-tier budget */
  credit?: boolean;
```

In `respondGeneration`, destructure `settle` and `credit` with the other options. Replace the `account` helper and add `release` and `settled`:

```ts
  const account = async (outcome: GenerationOutcome | null) => {
    const usage = billed.splice(0); // spliced: recorded once even if a later step fails
    if (credit) console.info(JSON.stringify({ evt: "cost.paid", usd: usdOf(usage) }));
    else await recordCost(usage, Date.now());
    if (outcome?.spend && !gate.owner) await recordClientSpend(gate.client, outcome.spend, gate.now);
  };
  // A failed release is not lost: the reservation expires (RESERVATION_MS) and the next sweep returns it.
  const release = async () => {
    try {
      await settle?.release();
    } catch (error) {
      console.error(JSON.stringify({ evt: "settle.release_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
    }
  };
  // The body the client gets: unchanged without a settlement, plus what deliver() returns with one.
  const settled = async (outcome: GenerationOutcome): Promise<unknown> =>
    settle ? { ...(outcome.body as Record<string, unknown>), ...(await settle.deliver(outcome)) } : outcome.body;
```

JSON path:
- after `await account(outcome);` add `const body = await settled(outcome);`;
- return `json(body, …)` instead of `json(outcome.body, …)`;
- in its `catch`, call `await release();` right after `await account(null);`.

Stream path:
- after `await account(outcome);` add `const data = await settled(outcome);`;
- write `{ type: "done", data, ...(commit ? { commit } : {}) }`;
- in its `catch`, call `await release();` right after `await account(null);`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run apps/web/lib/readings apps/web/lib/api apps/web/app/api`
Expected:
- PASS: store 5 tests, settle 6 tests.
- streaming.test, routes.test and accounting.test pass unchanged: without `settle` the body is byte-for-byte what it was.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/readings/store.ts apps/web/lib/readings/store.test.ts apps/web/lib/api/stream.ts apps/web/lib/api/settle.test.ts
git commit -m "feat(readings): encrypted saved readings and a settlement hook before done" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Paid, 별조각 and owner unlocks on the reading routes

**Files:**
- Create: `apps/web/lib/pay/unlockMethod.ts`, `apps/web/lib/api/unlock.ts`, `apps/web/lib/readings/chapters.ts`
- Modify: `apps/web/lib/api/inputs.ts`, `apps/web/lib/api/tarotRequest.ts`, `apps/web/app/api/tarot/reading/route.ts`, `apps/web/app/api/saju/reading/route.ts`
- Test: `apps/web/app/api/unlock.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `standardProduct`, `unitsFor`, `StandardProductId`, `paymentsMode`, `betaFullReadings`.
  - Task 3: `openAccount`. Task 4: `reserveUnlock`, `deliverUnlock`, `releaseUnlock`.
  - Task 9: `insertReadingStatement`, `newReadingId`, `ServerChapter`, `ReadingSource`, `Settlement`, `respondGeneration` with `settle` and `credit`.
  - Existing: `Gate`, `checkQuota`, `spendCookies`, `fullReadingLimit`, `issueChapter`, `SITE.reading.followUps`.
- Produces:
  - `unlockMethod.ts` (client-safe): `UNLOCK_METHODS = ["beta", "paid", "free", "owner"] as const`, `type UnlockMethod`
  - `inputs.ts`:
    - `UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) })`; `TarotBody.unlock?`, `SajuBody.unlock?`
    - `SajuBody.display?: { title ≤80, summary ≤400 }` (the teaser's title and summary, saved with the reading)
  - `tarotContextFrom` also returns `unlock?: UnlockMethod`.
  - `unlock.ts`:
    - `interface UnlockPlan { method; productId; credit: boolean; save: {db; accountSecret; userId; source; unlockId} | null }`
    - `planUnlock(request, gate, kind, method?): Promise<UnlockPlan | Response>`
    - `settlementFor(plan, chapterOf, now): Settlement | undefined`
  - `chapters.ts`: `tarotChapter(input, cards, body, now): ServerChapter`, `sajuChapter({birth, context, display?}, body, now): ServerChapter`
  - The routes' 200 body gains `readingId` when the reading was saved to an account. New pre-stream errors:
    - 402 `PAYMENT_REQUIRED` (beta asked while payments are on);
    - 401 `LOGIN_REQUIRED`;
    - 402 `NO_CREDIT`;
    - 403 `FORBIDDEN` (owner method without the pass);
    - 503 `PAY_UNAVAILABLE`.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/unlock.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { NDJSON } from "@/lib/api/stream";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { mockToss } from "@/lib/pay/tossMock";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
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
  resetMemoryLimiter();
  resetDailyStore();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loggedIn(name = "alice"): Promise<Browser> {
  const b = browser(`198.51.100.${++ipSeq}`);
  await loginAs(b, name);
  return b;
}

async function open(b: Browser, method?: string, accept?: string, signal?: AbortSignal) {
  const drawn = await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } });
  const { drawToken } = (await drawn.json()) as { drawToken: string };
  return b.send(reading, "/api/tarot/reading", { body: { drawToken, input: MONEY_INPUT, ...(method ? { unlock: { method } } : {}) }, accept, signal });
}

const userId = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;

describe("opening a full reading with credit", () => {
  it("ends the free beta reading once payments are on for everyone, before any generation", async () => {
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
    const b = await loggedIn();
    const res = await open(b, "paid");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "NO_CREDIT" });
  });

  it("opens with 별조각: saves the reading to the account and spends only then, with no beta cookie", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const res = await open(b, "free");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readingId: string; chapterToken: string };
    expect(body.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sl_q="))).toBe(false);
    expect((await me(b)).user?.stardust).toBe(0);
    const saved = await listReadings(db, accountSecret()!, await userId(db));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: body.readingId, chapter: { kind: "tarot", question: MONEY_INPUT.question, chapterToken: body.chapterToken, followUpsLeft: 3 } });
    expect((saved[0]!.chapter.cards as unknown[]).length).toBe(3);
  });

  it("opens a paid reading once, then there is nothing left to spend", async () => {
    useTestDb();
    const b = await loggedIn();
    await buy(b);
    expect((await open(b, "paid")).status).toBe(200);
    expect((await me(b)).user?.unused).toEqual([]);
    expect((await open(b, "paid")).status).toBe(402);
    expect((await me(b)).user?.stardust).toBe(10);
  });

  it("gives the credit back when the generation fails", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mockProvider, "generate").mockRejectedValue(new GenerationError("UPSTREAM"));
    expect((await open(b, "free")).status).toBe(502);
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await db.prepare("SELECT status FROM unlocks").first()).toEqual({ status: "released" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM readings").first()).toEqual({ n: 0 });
  });

  it("gives the credit back when the client leaves mid-stream", async () => {
    useTestDb();
    const b = await loggedIn();
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
    const b = await loggedIn();
    const lines = (await (await open(b, "free", NDJSON)).text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: { readingId?: string } });
    const done = lines.find((event) => event.type === "done");
    expect(done?.data?.readingId).toMatch(/^[a-z0-9]{20}$/);
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
    expect(await db.prepare("SELECT source FROM readings").first()).toEqual({ source: "owner" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'").first()).toEqual({ n: 0 });
  });

  it("never traps credit: it can still be spent after payments are switched off", async () => {
    useTestDb();
    const b = await loggedIn();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await open(b, "free")).status).toBe(200);
  });

  it("saves the saju teaser's title with a paid saju reading", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    await buy(b, "saju");
    const res = await b.send(sajuReading, "/api/saju/reading", {
      body: { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" }, display: { title: "타고난 결", summary: "요약 한 줄" } },
    });
    expect(res.status).toBe(200);
    const [saved] = await listReadings(db, accountSecret()!, await userId(db));
    expect(saved?.chapter).toMatchObject({ kind: "saju", title: "타고난 결", summary: "요약 한 줄" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/unlock.test.ts`
Expected: FAIL. The first case answers 200 (the beta still opens). Credit methods are ignored and no `readingId` comes back.

- [ ] **Step 3: Write `apps/web/lib/pay/unlockMethod.ts`** (client-safe)

```ts
/** How a full reading is opened: the beta's daily free one, a paid purchase, 별조각, or the owner pass. */
export const UNLOCK_METHODS = ["beta", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
```

- [ ] **Step 4: Extend `apps/web/lib/api/inputs.ts` and `apps/web/lib/api/tarotRequest.ts`**

In `inputs.ts` add the import `import { UNLOCK_METHODS } from "@/lib/pay/unlockMethod";` and:

```ts
/** How the full reading is opened (P4). Absent means the beta's daily free reading. */
export const UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) });
```

Add `unlock: UnlockBody.optional(),` to `TarotBody`. Add both of these to `SajuBody`:

```ts
  unlock: UnlockBody.optional(),
  /** the free teaser's title and summary, kept with a reading saved to the account */
  display: z.object({ title: z.string().trim().max(80), summary: z.string().trim().max(400) }).optional(),
```

In `tarotContextFrom`, add `unlock?: UnlockMethod` to the returned object type (import `type UnlockMethod` from `@/lib/pay/unlockMethod`). Return:

```ts
  return { ctx: buildTarotContext(draw.templateId, draw.cards, rest, { history }), draw, input: rest, unlock: body.data.unlock?.method };
```

- [ ] **Step 5: Write `apps/web/lib/readings/chapters.ts`**

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

- [ ] **Step 6: Write `apps/web/lib/api/unlock.ts`**

```ts
import "server-only";
import { openAccount } from "@/lib/account/request";
import type { D1Binding } from "@/lib/db/d1";
import { standardProduct, unitsFor, type StandardProductId } from "@/lib/pay/catalog";
import { deliverUnlock, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { betaFullReadings, paymentsMode } from "@/lib/pay/mode";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { insertReadingStatement, newReadingId, type ReadingSource, type ServerChapter } from "@/lib/readings/store";
import { errorResponse, type Gate } from "./http";
import type { GenerationOutcome, Settlement } from "./stream";

/**
 * How a full reading is paid for, decided before any generation starts (spec 5.4):
 * - `beta`: the daily free reading (the caller checks the cookie quota). Refused with 402
 *   PAYMENT_REQUIRED once payments are on for everyone; the owner pass is never refused.
 * - `paid` / `free`: reserves the user's credit for the standard product. 401 without login,
 *   402 NO_CREDIT without credit. Spending is never gated by STARLOG_PAYMENTS.
 * - `owner`: the owner pass, no ledger; the reading is saved to the account when logged in.
 */

export interface UnlockPlan {
  method: UnlockMethod;
  productId: StandardProductId;
  /** a reservation is held; its model cost stays out of the free-tier budget */
  credit: boolean;
  save: { db: D1Binding; accountSecret: string; userId: string; source: ReadingSource; unlockId: string | null } | null;
}

export async function planUnlock(request: Request, gate: Gate, kind: StandardProductId, method: UnlockMethod = "beta"): Promise<UnlockPlan | Response> {
  if (method === "beta") {
    if (!gate.owner && !betaFullReadings(paymentsMode())) return errorResponse("PAYMENT_REQUIRED");
    return { method, productId: kind, credit: false, save: null };
  }
  if (method === "owner" && !gate.owner) return errorResponse("FORBIDDEN");
  const ctx = await openAccount(request, gate.now);
  if (ctx instanceof Response) return method === "owner" ? { method, productId: kind, credit: false, save: null } : ctx;
  const user = ctx.session?.user;
  if (method === "owner") {
    const save = user ? { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "owner" as const, unlockId: null } : null;
    return { method, productId: kind, credit: false, save };
  }
  if (!user) return errorResponse("LOGIN_REQUIRED");
  const product = standardProduct(kind);
  const reserved = await reserveUnlock(ctx.db, {
    userId: user.id,
    productId: kind,
    currency: method === "paid" ? "paid" : "free",
    units: method === "paid" ? unitsFor(product) : (product.units ?? unitsFor(product)),
    now: gate.now,
  });
  if (!reserved.ok) return errorResponse("NO_CREDIT");
  console.info(JSON.stringify({ evt: "unlock.reserved", method, productId: kind }));
  return { method, productId: kind, credit: true, save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: method, unlockId: reserved.unlockId } };
}

/**
 * Saves the reading to the account, and spends the reservation, before the client sees the reading
 * (stream.ts Settlement). A failure releases the reservation. Without anything to save (beta, or an
 * owner who is not logged in) there is no settlement.
 */
export function settlementFor(plan: UnlockPlan, chapterOf: (body: Record<string, unknown>) => ServerChapter, now: number): Settlement | undefined {
  const save = plan.save;
  if (!save) return undefined;
  return {
    async deliver(outcome: GenerationOutcome) {
      const readingId = newReadingId();
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
      } else {
        await save.db.batch([insert]);
      }
      return { readingId };
    },
    async release() {
      if (save.unlockId && (await releaseUnlock(save.db, { unlockId: save.unlockId, now: Date.now() }))) {
        console.info(JSON.stringify({ evt: "unlock.released", unlockId: save.unlockId }));
      }
    },
  };
}
```

- [ ] **Step 7: Rewire the two reading routes**

`apps/web/app/api/tarot/reading/route.ts` (whole file):

```ts
import { generateTarotReading } from "@/lib/ai/generate";
import { checkQuota, fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - beta (no `unlock`): spends one daily unlock only after a validated generation.
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
  // Only the beta's free reading counts on the device cookie and the server's day counters.
  const quota = plan.method === "beta" ? await checkQuota(gate, "full") : null;
  if (quota instanceof Response) return quota;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateTarotReading(gate.provider, parsed.ctx, hooks)).data;
      const chapterToken = await issueChapter(
        { kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]) },
        reading, [], gate.secret, gate.now,
      );
      const body = { reading, chapterToken };
      return quota ? { body, cookies: await spendCookies(gate, quota, "full"), spend: "full" as const } : { body, cookies: [] };
    },
    {
      gate,
      credit: plan.credit,
      settle: settlementFor(plan, (body) => tarotChapter(parsed.input, parsed.draw.cards, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
```

`apps/web/app/api/saju/reading/route.ts` (whole file):

```ts
import { generateSajuReading } from "@/lib/ai/generate";
import { checkQuota, fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { sajuChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {birth, loveStatus?, workStatus?, concern?, unlock?, display?} → {reading, chapterToken, readingId?}:
 * the paid prologue.
 * - beta: one daily unlock after a validated generation.
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
  const quota = plan.method === "beta" ? await checkQuota(gate, "full") : null;
  if (quota instanceof Response) return quota;
  const { birth, loveStatus, workStatus, concern, display } = parsed.body;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateSajuReading(gate.provider, parsed.facts, hooks)).data;
      const chapterToken = await issueChapter({ kind: "saju", birth, profile: parsed.profile }, reading, [], gate.secret, gate.now);
      const body = { reading, chapterToken };
      return quota ? { body, cookies: await spendCookies(gate, quota, "full"), spend: "full" as const } : { body, cookies: [] };
    },
    {
      gate,
      credit: plan.credit,
      settle: settlementFor(
        plan,
        (body) => sajuChapter({ birth, context: { loveStatus, workStatus, concern }, display }, body as { reading: unknown; chapterToken: string }, gate.now),
        gate.now,
      ),
    },
  );
}
```

If either route changed since commit a9fa89c (for example a new argument to `issueChapter` or new outcome fields), keep that change. Add only the plan, the quota condition and the two options.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run apps/web/app/api apps/web/lib/api`
Expected:
- PASS: unlock.test 10 tests.
- routes.test, streaming.test and accounting.test unchanged; they never send `unlock`, and `STARLOG_PAYMENTS` defaults to off.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/pay/unlockMethod.ts apps/web/lib/api/unlock.ts apps/web/lib/readings/chapters.ts apps/web/lib/api/inputs.ts apps/web/lib/api/tarotRequest.ts apps/web/app/api/tarot/reading/route.ts apps/web/app/api/saju/reading/route.ts apps/web/app/api/unlock.test.ts
git commit -m "feat(api): open full readings with a purchase, 별조각 or the owner pass; charge only on delivery" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Readings API — list, claim, delete, follow-up turns

**Files:**
- Create: `apps/web/app/api/readings/route.ts`, `apps/web/app/api/readings/claim/route.ts`, `apps/web/lib/readings/turns.ts`
- Modify: `apps/web/lib/security/chapterToken.ts` (add `chapterIsGenuine`), `apps/web/lib/api/inputs.ts` (`FollowUpBody.readingId`), `apps/web/app/api/followup/route.ts`
- Test: `apps/web/app/api/readings/readings.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `openAccountRoute`, `requireSession`, `openAccount`.
  - Task 9: `listReadings`, `insertReadingStatement`, `readingIdByDigest`, `countReadings`, `deleteReading`, `deleteAllReadings`, `updateReadingChapter`, `newReadingId`, `ServerChapter`.
  - `verifyToken`, `readingDigest`, `issueChapter`; `isConstraintError`.
  - Task 10's reading routes, in the tests.
- Produces:
  - `chapterIsGenuine(token, reading, secret): Promise<"tarot" | "saju" | null>`
  - `GET /api/readings` → `{ readings: Array<{ id; createdAt; chapter: ServerChapter }> }`
  - `DELETE /api/readings?id=<id>` or `?all=1` → `{ deleted: number }`
  - `POST /api/readings/claim {chapters: Array<{localId, chapter}>}` (≤ 20 per call) → `{ claimed: Array<{localId, id}>, rejected: string[] }`; `MAX_SAVED_READINGS = 300`
  - `FollowUpBody.readingId?` (20 chars `[a-z0-9]`); a follow-up answer is also written into that saved reading
  - `saveFollowUpTurn(request, now, readingId, turn, chapterToken, followUpsLeft): Promise<void>`

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/readings/readings.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { insertReadingStatement, listReadings, newReadingId, type ServerChapter } from "@/lib/readings/store";
import { issueChapter } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as reading } from "../tarot/reading/route";
import { POST as claim } from "./claim/route";
import { DELETE as remove, GET as list } from "./route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const DAY = 86_400_000;

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

/** A device chapter the server once issued, `daysAgo` days ago (its token long expired). */
async function deviceChapter(question: string, daysAgo = 30): Promise<ServerChapter> {
  const readingBody = { verdict: `${question}의 결론`, cards: [], action: { heading: "오늘", body: "해 볼 일" } };
  const ctx = { kind: "tarot", templateId: "self-flow", input: { topicId: "money", question, conditions: [] }, cards: [["major-00", "upright"]] } as unknown as Parameters<typeof issueChapter>[0];
  const chapterToken = await issueChapter(ctx, readingBody, [], signingSecret()!, T0 - daysAgo * DAY);
  return { kind: "tarot", question, conditions: [], note: "", cards: [], reading: readingBody, chapterToken, createdAt: T0 - daysAgo * DAY, turns: [], followUpsLeft: 3 };
}

const claimOf = (b: Browser, chapters: Array<{ localId: string; chapter: unknown }>) => b.send(claim, "/api/readings/claim", { body: { chapters }, origin: true });

describe("readings in the account", () => {
  it("lists only my saved readings", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.21");
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000); // bob signs up later, so alice is the first user
    const bob = browser("192.0.2.22");
    await loginAs(bob, "bob");
    const chapter = await deviceChapter("내 질문", 0);
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId: await userIdOf(db), productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();
    const mine = (await (await alice.send(list, "/api/readings")).json()) as { readings: Array<{ chapter: ServerChapter }> };
    expect(mine.readings.map((r) => r.chapter.question)).toEqual(["내 질문"]);
    expect(((await (await bob.send(list, "/api/readings")).json()) as { readings: unknown[] }).readings).toEqual([]);
    expect((await browser("192.0.2.23").send(list, "/api/readings")).status).toBe(401);
  });

  it("claims genuine device chapters, however old, once each", async () => {
    const db = useTestDb();
    const b = browser("192.0.2.24");
    await loginAs(b);
    const genuine = await deviceChapter("예전 질문", 40);
    const forged = { ...(await deviceChapter("다른 질문")), chapterToken: "forged.token" };
    const edited = { ...(await deviceChapter("고친 질문")), reading: { verdict: "내가 바꾼 결론" } };
    const res = await claimOf(b, [
      { localId: "local001", chapter: genuine },
      { localId: "local002", chapter: forged },
      { localId: "local003", chapter: edited },
      { localId: "local004", chapter: { ...genuine, kind: "saju" } },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: Array<{ localId: string; id: string }>; rejected: string[] };
    expect(body.claimed).toEqual([{ localId: "local001", id: expect.stringMatching(/^[a-z0-9]{20}$/) }]);
    expect(body.rejected).toEqual(["local002", "local003", "local004"]);
    const again = (await (await claimOf(b, [{ localId: "local009", chapter: genuine }])).json()) as { claimed: Array<{ id: string }> };
    expect(again.claimed[0]!.id).toBe(body.claimed[0]!.id);
    const saved = await listReadings(db, accountSecret()!, await userIdOf(db));
    expect(saved).toHaveLength(1);
    expect(await db.prepare("SELECT source FROM readings").first()).toEqual({ source: "claimed" });
  });

  it("claims only from our own pages, signed in", async () => {
    useTestDb();
    const chapter = await deviceChapter("질문");
    expect((await claimOf(browser("192.0.2.25"), [{ localId: "local001", chapter }])).status).toBe(401);
    const b = browser("192.0.2.26");
    await loginAs(b);
    expect((await b.send(claim, "/api/readings/claim", { body: { chapters: [{ localId: "local001", chapter }] } })).status).toBe(403);
  });

  it("deletes my saved readings, one or all, never someone else's", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.27");
    await loginAs(alice, "alice");
    const bob = browser("192.0.2.28");
    await loginAs(bob, "bob");
    const { claimed } = (await (await claimOf(alice, [{ localId: "local001", chapter: await deviceChapter("하나") }, { localId: "local002", chapter: await deviceChapter("둘") }])).json()) as { claimed: Array<{ id: string }> };
    const del = (b: Browser, query: string) => b.send(remove, `/api/readings?${query}`, { method: "DELETE", origin: true });
    expect(await (await del(bob, `id=${claimed[0]!.id}`)).json()).toEqual({ deleted: 0 });
    expect(await (await del(alice, `id=${claimed[0]!.id}`)).json()).toEqual({ deleted: 1 });
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
    const [saved] = await listReadings(db, accountSecret()!, await userIdOf(db));
    expect(saved?.chapter.turns).toHaveLength(1);
    expect(saved?.chapter).toMatchObject({ chapterToken, followUpsLeft: remaining });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/readings/readings.test.ts`
Expected: FAIL (route modules not found).

- [ ] **Step 3: Add `chapterIsGenuine` to `apps/web/lib/security/chapterToken.ts`**

```ts
/**
 * The chapter's kind when `token` is a chapter token we signed for exactly this reading, however old;
 * null otherwise. Used to claim device-only chapters into an account. Expiry is not checked: an old
 * reading is still one we wrote.
 */
export async function chapterIsGenuine(token: unknown, reading: unknown, secret: string): Promise<"tarot" | "saju" | null> {
  const p = await verifyToken<ChapterPayload>(token, "chapter", secret, 0);
  if (!p || p.v !== 1 || !p.ctx) return null;
  if ((await readingDigest(reading)) !== p.h) return null;
  return p.ctx.kind;
}
```

- [ ] **Step 4: Write `apps/web/lib/readings/turns.ts`**

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

- [ ] **Step 5: Wire the follow-up route.**
  - In `apps/web/lib/api/inputs.ts`, add to `FollowUpBody`:

```ts
  /** the reading's id in the account (Task 11): the answer is saved there too */
  readingId: z.string().regex(/^[a-z0-9]{20}$/).optional(),
```

  - In `apps/web/app/api/followup/route.ts`, inside the `respondGeneration` callback, right after `remaining` is computed and before `return`:

```ts
    if (body.data.readingId) await saveFollowUpTurn(request, gate.now, body.data.readingId, { question, answer: answer.answer }, chapterToken, remaining);
```

  - Add the import `import { saveFollowUpTurn } from "@/lib/readings/turns";`.

- [ ] **Step 6: Write the routes**

`apps/web/app/api/readings/route.ts`:

```ts
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { deleteAllReadings, deleteReading, listReadings } from "@/lib/readings/store";

/** GET → the readings saved in my account, newest first (내 기록 merges them into this device). */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  return json({ readings: await listReadings(ctx.db, ctx.accountSecret, session.user.id) });
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

`apps/web/app/api/readings/claim/route.ts`:

```ts
import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { countReadings, insertReadingStatement, newReadingId, readingIdByDigest, type ServerChapter } from "@/lib/readings/store";
import { chapterIsGenuine } from "@/lib/security/chapterToken";

/** At most this many readings per account. */
export const MAX_SAVED_READINGS = 300;

const ClaimedChapter = z
  .object({
    kind: z.enum(["tarot", "saju"]),
    reading: z.record(z.string(), z.unknown()),
    chapterToken: z.string().min(1).max(32_768),
    createdAt: z.number().int().nonnegative(),
    turns: z.array(z.object({ question: z.string().max(400), answer: z.string().max(4_000) })).max(10).default([]),
    followUpsLeft: z.number().int().min(0).max(10).default(0),
  })
  .passthrough();

const ClaimBody = z.object({
  chapters: z.array(z.object({ localId: z.string().regex(/^[a-z0-9]{6,32}$/), chapter: ClaimedChapter })).min(1).max(20),
});

/**
 * POST {chapters: [{localId, chapter}]} → moves device-only readings into the account, only when the
 * user asks (내 정보 > 계정에 보관하기).
 * - Accepted only when the chapter token is one we signed for exactly that reading; expiry is
 *   ignored.
 * - The same reading is kept once.
 * - 20 per call, 300 per account.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const body = ClaimBody.safeParse(await readJson(request, 512_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const userId = session.user.id;
  const claimed: Array<{ localId: string; id: string }> = [];
  const rejected: string[] = [];
  for (const { localId, chapter } of body.data.chapters) {
    const kind = await chapterIsGenuine(chapter.chapterToken, chapter.reading, ctx.secret);
    if (!kind || kind !== chapter.kind) {
      rejected.push(localId);
      continue;
    }
    const existing = await readingIdByDigest(ctx.db, userId, chapter.reading);
    if (existing) {
      claimed.push({ localId, id: existing });
      continue;
    }
    if ((await countReadings(ctx.db, userId)) >= MAX_SAVED_READINGS) {
      rejected.push(localId);
      continue;
    }
    const { id: _localId, serverId: _serverId, ...rest } = chapter as Record<string, unknown>;
    const id = newReadingId();
    try {
      const insert = await insertReadingStatement(ctx.db, ctx.accountSecret, { id, userId, productId: kind, source: "claimed", unlockId: null, chapter: rest as ServerChapter, now: ctx.now });
      await insert.run();
      claimed.push({ localId, id });
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      const raced = await readingIdByDigest(ctx.db, userId, chapter.reading);
      if (raced) claimed.push({ localId, id: raced });
      else rejected.push(localId);
    }
  }
  console.info(JSON.stringify({ evt: "readings.claimed", claimed: claimed.length, rejected: rejected.length }));
  return json({ claimed, rejected });
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api apps/web/lib/security apps/web/lib/readings`
Expected: PASS (readings.test 5 tests; follow-up and security suites unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/readings apps/web/lib/readings/turns.ts apps/web/lib/security/chapterToken.ts apps/web/lib/api/inputs.ts apps/web/app/api/followup/route.ts
git commit -m "feat(readings): list, claim and delete account readings; follow-ups saved there too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Account deletion (개인정보 파기)

**Files:**
- Create: `apps/web/lib/account/deletion.ts`, `apps/web/app/api/account/delete-intent/route.ts`
- Modify: `apps/web/app/api/auth/kakao/start/route.ts` (purpose `delete`), `apps/web/app/api/auth/kakao/callback/route.ts` (delete branch, whole file below)
- Test: `apps/web/app/api/account/deletion.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `openAccountRoute`, `requireSession`, `CLEAR_SESSION`, `redirectTo`.
  - Task 4: `walletSummary`, `forfeitStatements`, `Lot`.
  - Task 5: `issueOAuthState`, `openOAuthState`, `CLEAR_OAUTH`, `kakaoLogin`, `kakaoUnlink`, `kakaoKey`, `loginKakaoUser`, `grantSignupGift`, `createSession`.
  - Task 6: `tossClient`, `mockToss`. Task 7: `orderForUser`, `buy`. Task 8: `refundUnusedOrder`.
  - Task 9: `insertReadingStatement`. P3's `owners` table (0001_bonds.sql, ON DELETE CASCADE to invites and constellations, and through those to stars).
- Produces:
  - `deletion.ts`:
    - `DELETE_INTENT_TTL_MS`, `GIFT_CLAIM_KEEP_MS`
    - `issueDeleteIntent(sessionId, secret, now): Promise<string>`, `deleteIntentFor(token, sessionId, secret, now): Promise<boolean>`
    - `type DeleteOutcome = {ok: true; refunded: number} | {ok: false; code: "REFUND_FAILED"}`
    - `deleteAccount(db, toss, {userId, now}): Promise<DeleteOutcome>`
  - `POST /api/account/delete-intent` → `{ url: "/api/auth/kakao/start?purpose=delete&intent=…" }`
  - `GET /api/auth/kakao/start?purpose=delete&intent=…` → Kakao re-check. The callback ends at:
    - `/me?account=deleted` (session cookie cleared), or
    - `/me?delete=failed|mismatch|refund-failed|cancel`.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/account/deletion.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
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

describe("account deletion", () => {
  it("re-checks with Kakao, refunds unopened purchases, erases personal data and keeps a tombstone", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    const chapter = { kind: "tarot", question: "지울 질문", reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();

    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT kakao_key, nickname, deleted_at FROM users")).toEqual({ kakao_key: null, nickname: null, deleted_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await one(db, "SELECT status, units_left FROM credit_lots WHERE currency = 'free'")).toEqual({ status: "revoked", units_left: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM gift_claims")).toEqual({ n: 1 });
    expect((await me(b)).user).toBeNull();

    // Signing up again with the same Kakao account makes a new account, without a second gift.
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(0);
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 2 });
  });

  it("deletes the linked 인연 owner with its constellations", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    await db.prepare("INSERT INTO owners (id, nickname, ranking_public, basis_json, created_at) VALUES ('owner_alice_0000001', '앨리스', 1, '{}', 0)").run();
    await db.prepare("INSERT INTO constellations (id, owner_id, sign, status, total, started_at) VALUES ('c1', 'owner_alice_0000001', 'aries', 'filling', 0, 0)").run();
    await db.prepare("UPDATE users SET bonds_owner_id = 'owner_alice_0000001'").run();
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(await one(db, "SELECT COUNT(*) AS n FROM owners")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM constellations")).toEqual({ n: 0 });
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

  it("deletes nothing when a refund fails", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    vi.spyOn(mockToss, "cancel").mockRejectedValueOnce(new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=refund-failed");
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
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
import { forfeitStatements, walletSummary, type Lot } from "@/lib/pay/ledger";
import { orderForUser } from "@/lib/pay/orders";
import { refundUnusedOrder } from "@/lib/pay/refunds";
import type { TossClient } from "@/lib/pay/tossTypes";
import { signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";

/** How long the deletion intent from 내 정보 is good for. */
export const DELETE_INTENT_TTL_MS = 5 * 60 * 1000;
/** Gift claims of deleted accounts are kept this long (no second signup gift), then purged. */
export const GIFT_CLAIM_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

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

export type DeleteOutcome = { ok: true; refunded: number } | { ok: false; code: "REFUND_FAILED" };

/**
 * 회원 탈퇴 (spec 5.8).
 * 1. Refund every unopened purchase first. Any failure stops here and nothing is deleted.
 * 2. Then, in one batch:
 *    - forfeit the remaining 별조각 (ledger rows kept);
 *    - delete the saved readings and sessions;
 *    - delete the linked P3 인연 owner (its invites, constellations and stars cascade);
 *    - blank the user row to a tombstone: orders, payments and the ledger are kept 5 years by law.
 * 3. Gift claims of accounts deleted over a year ago are purged on the way.
 */
export async function deleteAccount(db: D1Binding, toss: TossClient | null, input: { userId: string; now: number }): Promise<DeleteOutcome> {
  const { userId, now } = input;
  const wallet = await walletSummary(db, userId, now);
  let refunded = 0;
  for (const { orderId } of wallet.unused) {
    const order = await orderForUser(db, orderId, userId);
    const outcome = order && toss ? await refundUnusedOrder(db, toss, { order, reason: "회원 탈퇴: 열지 않은 풀이 환불", now }) : null;
    if (!outcome?.ok) {
      console.warn(JSON.stringify({ evt: "account.delete_refund_failed", orderId }));
      return { ok: false, code: "REFUND_FAILED" };
    }
    refunded++;
  }
  const user = await db.prepare("SELECT bonds_owner_id FROM users WHERE id = ?").bind(userId).first<{ bonds_owner_id: string | null }>();
  const { results: freeLots } = await db
    .prepare("SELECT * FROM credit_lots WHERE user_id = ? AND currency = 'free' AND status = 'active' AND units_left > 0")
    .bind(userId)
    .all<Lot>();
  await db.batch([
    ...freeLots.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)),
    db.prepare("DELETE FROM readings WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    ...(user?.bonds_owner_id ? [db.prepare("DELETE FROM owners WHERE id = ?").bind(user.bonds_owner_id)] : []),
    db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, bonds_owner_id = NULL, deleted_at = ? WHERE id = ?").bind(now, userId),
    db
      .prepare("DELETE FROM gift_claims WHERE claimed_at < ? AND kakao_key NOT IN (SELECT kakao_key FROM users WHERE kakao_key IS NOT NULL)")
      .bind(now - GIFT_CLAIM_KEEP_MS),
  ]);
  console.info(JSON.stringify({ evt: "account.deleted", refunded }));
  return { ok: true, refunded };
}
```

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

- [ ] **Step 5: Accept the delete purpose in `apps/web/app/api/auth/kakao/start/route.ts`.** Right after the `kakaoConfigProblems` check, and before the `salesOpen` check, insert the block below. A deletion is always allowed, whatever STARLOG_PAYMENTS says. Move the `salesOpen` check below this block.

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

- [ ] **Step 6: Replace `apps/web/app/api/auth/kakao/callback/route.ts`** with the version that also handles deletion:

```ts
import type { CookieSpec } from "@/lib/api/http";
import { deleteAccount } from "@/lib/account/deletion";
import { KakaoError, kakaoLogin, kakaoUnlink } from "@/lib/account/kakao";
import { CLEAR_OAUTH, OAUTH_COOKIE, openOAuthState } from "@/lib/account/oauthState";
import { redirectTo } from "@/lib/account/redirect";
import { openAccountRoute, type AccountContext } from "@/lib/account/request";
import { kakaoKey } from "@/lib/account/secrets";
import { CLEAR_SESSION, createSession, revokeSession } from "@/lib/account/session";
import { loginKakaoUser } from "@/lib/account/users";
import { SITE } from "@/lib/config";
import { grantSignupGift } from "@/lib/pay/ledger";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";

/**
 * GET ?code&state (or ?error&state) from Kakao. The state must match this browser's sl_oauth cookie.
 * - login: find or create the account. A new account gets the signup gift while sales are open,
 *   once per Kakao account. Start a session and return with ?login=ok|cancel|failed.
 * - delete: the same Kakao account as the session must answer. Then unopened purchases are
 *   refunded, personal data is erased, the app is unlinked from Kakao, and we land on
 *   /me?account=deleted (spec 5.8).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return redirectTo(request, "/", { login: "unavailable" }, [CLEAR_OAUTH]);
  const intent = await openOAuthState(ctx.cookies[OAUTH_COOKIE], url.searchParams.get("state"), ctx.secret, ctx.now);
  if (!intent) return redirectTo(request, "/", { login: "failed" }, [CLEAR_OAUTH]);
  const deleting = intent.purpose === "delete";
  const back = (flag: string, cookies: Array<CookieSpec | string> = []) =>
    deleting
      ? redirectTo(request, "/me", { delete: flag }, [CLEAR_OAUTH, ...cookies])
      : redirectTo(request, intent.returnTo, { login: flag }, [CLEAR_OAUTH, ...cookies]);
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");

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

async function finishLogin(
  ctx: AccountContext,
  key: string,
  nickname: string,
  age: boolean,
  back: (flag: string, cookies?: Array<CookieSpec | string>) => Response,
): Promise<Response> {
  const { user, created } = await loginKakaoUser(ctx.db, { key, nickname, ageConfirmed: age, now: ctx.now });
  const gifted = created && salesOpen(paymentsMode(), ctx.owner)
    ? await grantSignupGift(ctx.db, { userId: user.id, kakaoKey: key, units: SITE.price.signupGiftFree, now: ctx.now })
    : false;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  const session = await createSession(ctx.db, user.id, ctx.secret, ctx.now);
  console.info(JSON.stringify({ evt: "auth.login", created, gifted }));
  return back("ok", [session.cookie]);
}

async function finishDelete(
  request: Request,
  ctx: AccountContext,
  sid: string | undefined,
  key: string,
  accessToken: string,
  back: (flag: string, cookies?: Array<CookieSpec | string>) => Response,
): Promise<Response> {
  if (!ctx.session || ctx.session.id !== sid) return back("failed");
  if (ctx.session.user.kakao_key !== key) return back("mismatch");
  const outcome = await deleteAccount(ctx.db, tossClient(), { userId: ctx.session.user.id, now: ctx.now });
  if (!outcome.ok) return back("refund-failed");
  if (!(await kakaoUnlink(accessToken))) console.warn(JSON.stringify({ evt: "auth.kakao_unlink_failed" }));
  return redirectTo(request, "/me", { account: "deleted" }, [CLEAR_OAUTH, CLEAR_SESSION]);
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/app/api`
Expected: PASS (deletion.test 5 tests; auth.test still 8).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account/deletion.ts apps/web/app/api/account apps/web/app/api/auth/kakao/start/route.ts apps/web/app/api/auth/kakao/callback/route.ts
git commit -m "feat(account): deletion after a Kakao re-check; refunds first, then erase, keep a tombstone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Bonds identity link (after P3 Task 6)

**Precondition:** P3 Task 6 is committed: `apps/web/lib/bonds/identity.ts` exports `OWNER_ID_COOKIE`, `readOwnerId(cookies, secret)` and `ensureOwnerId`, with the private `idCookie(name, kind, id, secret)`. If it is not committed yet, stop and report.

**Files:**
- Create: `apps/web/lib/account/bondsLink.ts`
- Modify:
  - `apps/web/lib/bonds/identity.ts` (P3's file): add the export `ownerIdCookie` only; change nothing else.
  - `apps/web/app/api/auth/kakao/callback/route.ts`: link at login, clear `sl_uid` at deletion.
- Test: `apps/web/app/api/account/bondsLink.test.ts`

**Interfaces:**
- Consumes: P3 `readOwnerId`, `OWNER_ID_COOKIE`, `idCookie`; `setCookie` from `lib/api/http.ts`; `UserRow` (Task 3); the callback's `finishLogin`/`finishDelete` (Task 12); `isConstraintError`.
- Produces:
  - `identity.ts`: `ownerIdCookie(id: string, secret: string): Promise<string>` (a Set-Cookie value)
  - `bondsLink.ts`: `linkBondsOwner(db, cookies, secret, user): Promise<string | null>`, `clearOwnerIdCookie(): string`

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/account/bondsLink.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID_COOKIE, ownerIdCookie, readOwnerId } from "@/lib/bonds/identity";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
import { POST as deleteIntent } from "./delete-intent/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const OWNER = "owner_device_000001";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function withOwner(db: D1Binding, b: Browser, id = OWNER) {
  await db.prepare("INSERT OR IGNORE INTO owners (id, nickname, ranking_public, basis_json, created_at) VALUES (?, '별', 1, '{}', 0)").bind(id).run();
  const [pair = ""] = (await ownerIdCookie(id, signingSecret()!)).split(";");
  b.jar.set(OWNER_ID_COOKIE, pair.slice(pair.indexOf("=") + 1));
}

const deviceOwner = (b: Browser) => readOwnerId(Object.fromEntries([...b.jar].map(([k, v]) => [k, decodeURIComponent(v)])), signingSecret()!);
const linked = async (db: D1Binding) => (await db.prepare("SELECT bonds_owner_id FROM users ORDER BY created_at LIMIT 1").first<{ bonds_owner_id: string | null }>())!.bonds_owner_id;

describe("인연 owner and the account", () => {
  it("adopts this device's owner at login and brings it to a new device", async () => {
    const db = useTestDb();
    const phone = browser("192.0.2.41");
    await withOwner(db, phone);
    await loginAs(phone, "alice");
    expect(await linked(db)).toBe(OWNER);
    const laptop = browser("192.0.2.42");
    await loginAs(laptop, "alice");
    expect(await deviceOwner(laptop)).toBe(OWNER);
  });

  it("never takes an owner that already belongs to another account", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.43");
    await withOwner(db, alice);
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000);
    const bob = browser("192.0.2.44");
    await withOwner(db, bob);
    await loginAs(bob, "bob");
    expect(await db.prepare("SELECT bonds_owner_id FROM users ORDER BY created_at DESC LIMIT 1").first()).toEqual({ bonds_owner_id: null });
  });

  it("deletes the owner with the account and clears this device's sl_uid", async () => {
    const db = useTestDb();
    const b = browser("192.0.2.45");
    await withOwner(db, b);
    await loginAs(b, "alice");
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const location = (await b.send(start, `${url}&mockUser=alice`)).headers.get("location")!;
    expect((await b.send(callback, location)).headers.get("location")).toBe("http://localhost/me?account=deleted");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM owners").first()).toEqual({ n: 0 });
    expect(b.jar.has(OWNER_ID_COOKIE)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/app/api/account/bondsLink.test.ts`
Expected: FAIL (`ownerIdCookie` is not exported).

- [ ] **Step 3: Add the export to `apps/web/lib/bonds/identity.ts`** (P3's file; add only this)

```ts
/** The sl_uid Set-Cookie for a given owner id (P4: an account brings its 인연 owner to another device). */
export function ownerIdCookie(id: string, secret: string): Promise<string> {
  return idCookie(OWNER_ID_COOKIE, "uid", id, secret);
}
```

- [ ] **Step 4: Write `apps/web/lib/account/bondsLink.ts`**

```ts
import "server-only";
import { setCookie } from "@/lib/api/http";
import { OWNER_ID_COOKIE, ownerIdCookie, readOwnerId } from "@/lib/bonds/identity";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import type { UserRow } from "./users";

/**
 * Ties the P3 인연 owner to the account at login (spec 4).
 * - An account without an owner adopts this device's owner, unless another account already has it.
 * - An account with an owner brings it to this device: sl_uid is reissued with P3's own format.
 * - Owners are never merged: a different owner on this device stays unlinked.
 * Returns the sl_uid Set-Cookie value when the device should switch owners, else null.
 */
export async function linkBondsOwner(db: D1Binding, cookies: Record<string, string>, secret: string, user: UserRow): Promise<string | null> {
  const deviceOwner = await readOwnerId(cookies, secret);
  if (user.bonds_owner_id) return user.bonds_owner_id === deviceOwner ? null : ownerIdCookie(user.bonds_owner_id, secret);
  if (!deviceOwner) return null;
  const exists = await db.prepare("SELECT 1 AS ok FROM owners WHERE id = ?").bind(deviceOwner).first();
  if (!exists) return null;
  try {
    await db.prepare("UPDATE users SET bonds_owner_id = ? WHERE id = ? AND bonds_owner_id IS NULL").bind(deviceOwner, user.id).run();
  } catch (error) {
    if (!isConstraintError(error)) throw error;
  }
  return null;
}

/** Forgets this device's 인연 owner after it was deleted with the account. */
export function clearOwnerIdCookie(): string {
  return setCookie(OWNER_ID_COOKIE, "", 0);
}
```

- [ ] **Step 5: Call it from the callback** (`apps/web/app/api/auth/kakao/callback/route.ts`).
  - In `finishLogin`, after `createSession`:

```ts
  const bondsCookie = await linkBondsOwner(ctx.db, ctx.cookies, ctx.secret, user);
  console.info(JSON.stringify({ evt: "auth.login", created, gifted }));
  return back("ok", [session.cookie, ...(bondsCookie ? [bondsCookie] : [])]);
```

  - In `finishDelete`, replace the final redirect with:

```ts
  const cleared = ctx.session.user.bonds_owner_id ? [clearOwnerIdCookie()] : [];
  return redirectTo(request, "/me", { account: "deleted" }, [CLEAR_OAUTH, CLEAR_SESSION, ...cleared]);
```

  - Import `linkBondsOwner`, `clearOwnerIdCookie` from `@/lib/account/bondsLink`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web/app/api apps/web/lib/bonds apps/web/lib/db`
Expected: PASS (bondsLink.test 3 tests; P3's bonds tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/account/bondsLink.ts apps/web/lib/bonds/identity.ts apps/web/app/api/auth/kakao/callback/route.ts apps/web/app/api/account/bondsLink.test.ts
git commit -m "feat(account): link the 인연 owner to the account and follow it to new devices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client account layer, unlock offers, error copy, UnlockSheet

**Files:**
- Create: `apps/web/lib/account/client.ts`, `apps/web/lib/pay/offer.ts`
- Modify: `apps/web/lib/reading/api.ts` (error codes), `apps/web/lib/reading/errors.ts` (copy), `apps/web/components/tarot/UnlockSheet.tsx`, `apps/web/components/tarot/UnlockSheet.module.css` (`.price`, `.links`)
- Test: `apps/web/lib/pay/offer.test.ts`, `apps/web/lib/account/client.test.ts`, `apps/web/lib/reading/errors.p4.test.ts`, `apps/web/components/tarot/UnlockSheet.test.tsx`

**Interfaces:**
- Consumes: `GET /api/me` and `POST /api/auth/logout` (Task 5); `Product`, `standardProduct`, `StandardProductId` (Task 2); `UnlockMethod` (Task 10); `SITE`, `won`; `Button`.
- Produces:
  - `client.ts` (browser):
    - `interface AccountUser { nickname; stardust; stardustExpiresAt: string | null; unused: Array<{orderId; productId}> }`, `interface AccountState { payments; owner; user: AccountUser | null }`
    - `parseAccount(v): AccountState | null`, `refreshAccount(fetchImpl?): Promise<AccountState | null>`
    - `useAccount(): AccountState | null | undefined` (undefined until loaded, null if it failed)
    - `loginHref(returnTo): string`, `logout(fetchImpl?): Promise<boolean>`
    - `loginMessage(flag: string | null): string | null`, `resetAccountForTests()`
  - `offer.ts` (pure):
    - `type UnlockOffer = {mode: "beta"} | {mode: "login"; priceKrw; giftUnits} | {mode: "open-paid"; orderId} | {mode: "stardust"; units; balance; priceKrw} | {mode: "pay"; priceKrw}`
    - `unlockOffer(account, product, giftUnits): UnlockOffer`, `checkoutHref(productId, returnTo): string`
  - `api.ts` `ApiErrorCode` gains `LOGIN_REQUIRED`, `PAYMENT_REQUIRED`, `NO_CREDIT`, `PAY_FAILED`, `FORBIDDEN`, `NOT_AVAILABLE`, `PAY_PENDING`, `NOT_REFUNDABLE`, `PAY_UNAVAILABLE`
  - `errors.ts`: `ErrorContext` gains `"paid"` and `"stardust"` (a failed credit-backed reading says the credit is still there)
  - `UnlockSheet` gains these optional props, so a caller without them keeps the beta sheet exactly:
    - `offer` (default `{mode: "beta"}`), `onUnlock(method: UnlockMethod)`;
    - `loginHref`, `payHref`, `owner`, `refundHref`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/pay/offer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AccountState, AccountUser } from "@/lib/account/client";
import { standardProduct } from "./catalog";
import { checkoutHref, unlockOffer } from "./offer";

const tarot = standardProduct("tarot");
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, owner: false, user: null, ...over });
const user = (over: Partial<AccountUser> = {}): AccountUser => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], ...over });

describe("unlock offer", () => {
  it("keeps the beta while sales are closed for this device and nothing is held", () => {
    expect(unlockOffer(undefined, tarot, 10)).toEqual({ mode: "beta" });
    expect(unlockOffer(null, tarot, 10)).toEqual({ mode: "beta" });
    expect(unlockOffer(account({ payments: false }), tarot, 10)).toEqual({ mode: "beta" });
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
    expect(unlockOffer(account({ payments: false, user: user() }), tarot, 10)).toEqual({ mode: "beta" });
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
    const body = { payments: true, owner: false, user: { nickname: "별", stardust: 10, stardustExpiresAt: "2026-12-30T14:59:59.999Z", unused: [{ orderId: "o1", productId: "tarot" }] } };
    expect(parseAccount(body)).toEqual(body);
    expect(parseAccount({ payments: false, owner: false, user: null })).toEqual({ payments: false, owner: false, user: null });
    expect(parseAccount({ payments: "yes" })).toBeNull();
    expect(parseAccount({ payments: true, owner: false, user: { nickname: 1 } })).toBeNull();
  });

  it("asks /api/me once for many callers, and treats a failure as unknown", async () => {
    let calls = 0;
    const ok = (async () => {
      calls++;
      return Response.json({ payments: true, owner: false, user: null });
    }) as typeof fetch;
    const [a, b] = await Promise.all([refreshAccount(ok), refreshAccount(ok)]);
    expect(calls).toBe(1);
    expect(a).toEqual({ payments: true, owner: false, user: null });
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
    expect(loginMessage("closed")).toBe("지금은 로그인을 열지 않았어요");
    expect(loginMessage("unavailable")).toBe("지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.");
    expect(loginMessage("busy")).toBe("요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.");
  });
});
```

`apps/web/lib/reading/errors.p4.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseApiError } from "./api";
import { describeApiError } from "./errors";

describe("P4 error copy", () => {
  it("knows the P4 codes", () => {
    expect(parseApiError(401, { code: "LOGIN_REQUIRED" }).code).toBe("LOGIN_REQUIRED");
    expect(parseApiError(402, { code: "NO_CREDIT" }).code).toBe("NO_CREDIT");
    expect(parseApiError(409, { code: "PAY_PENDING" }).code).toBe("PAY_PENDING");
  });

  it("says a failed paid or 별조각 reading kept its credit", () => {
    const failed = { code: "UPSTREAM" as const, status: 502 };
    expect(describeApiError(failed, "paid").body).toBe("결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요.");
    expect(describeApiError(failed, "stardust").body).toBe("별조각은 그대로예요. 한 번 더 시도해 주세요.");
    expect(describeApiError({ code: "NETWORK", status: 0 }, "paid").body).toBe("결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요.");
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

  it("without an offer it is the beta sheet, unchanged", () => {
    render(<UnlockSheet kind="tarot" remaining={1} onUnlock={() => {}} />);
    expect(screen.getByRole("button", { name: /전체 풀이 보기/ })).toBeTruthy();
    expect(screen.getByText("베타 기간에는 무료예요")).toBeTruthy();
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
 * then behave as the beta).
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
  /** sales (login, payment, gift) are open for this device */
  payments: boolean;
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
  if (!isRecord(value) || typeof value.payments !== "boolean" || typeof value.owner !== "boolean") return null;
  const user = parseUser(value.user);
  return user === undefined ? null : { payments: value.payments, owner: value.owner, user };
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
  closed: "지금은 로그인을 열지 않았어요",
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
 * - beta: the daily free reading (sales closed here, and no credit held);
 * - login: a guest while sales are open;
 * - open-paid: a purchase of this reading is waiting;
 * - stardust: enough 별조각; paying is the secondary choice;
 * - pay.
 * Credit already held always opens, whatever the sales flag says.
 */
export type UnlockOffer =
  | { mode: "beta" }
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
    return account.payments ? { mode: "pay", priceKrw: product.krw } : { mode: "beta" };
  }
  return account?.payments ? { mode: "login", priceKrw: product.krw, giftUnits } : { mode: "beta" };
}

export function checkoutHref(productId: StandardProductId, returnTo: string): string {
  return `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;
}
```

- [ ] **Step 5: Add the codes and the copy.**
  - `apps/web/lib/reading/api.ts`: add the nine codes to the `ApiErrorCode` union and to `CODES`.
  - `apps/web/lib/reading/errors.ts`:
    - change `ErrorContext` to `"reading" | "tarot-draw" | "followup" | "daily" | "paid" | "stardust"`;
    - add a `kept` helper above `describeApiError`;
    - change the three retry cases;
    - add the new cases.

```ts
/** After a failed credit-backed reading: the credit is still there (spec 5.4). */
const kept = (context: ErrorContext, fallback: string) =>
  context === "paid" ? "결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요." : context === "stardust" ? "별조각은 그대로예요. 한 번 더 시도해 주세요." : fallback;

// inside the switch, replacing the QUALITY/UPSTREAM and NETWORK cases:
    case "QUALITY":
    case "UPSTREAM":
      return { title: "풀이를 다 적지 못했어요", body: kept(context, "횟수는 그대로예요. 한 번 더 시도해 주세요."), action: "retry" };
    case "NETWORK":
      return { title: "연결이 잠시 끊겼어요", body: kept(context, "횟수는 그대로예요. 다시 시도해 주세요."), action: "retry" };
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
  - Keep the beta branch exactly as it is in the file when you start; the beta test above pins it.
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
  /** What this device may do now (lib/pay/offer.ts). Default: the beta's daily free reading. */
  offer?: UnlockOffer;
  /** Full readings left today on this device (beta only); undefined until read. */
  remaining: number | undefined;
  onUnlock: (method: UnlockMethod) => void;
  /** The login page with the way back (offer "login"). */
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

Inside the component (with `offer = { mode: "beta" }` defaulted in the destructuring):

```tsx
  const { free } = SITE.currency;
  const priced = offer.mode === "login" || offer.mode === "pay" || offer.mode === "stardust";

  let offerPrimary: ReactNode = null;
  let offerSecondary: ReactNode = null;
  let caption = "베타 기간에는 무료예요";
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
    case "beta":
      break;
  }
```

Where `primary` is chosen:
- keep `openedHref`, then the `redraw` error, then `error?.care` first, as now;
- next, when `offer.mode !== "beta"`, use `offerPrimary`;
- only otherwise run the existing `usedUp` / beta branches. Show the `usedUp` limit line only in beta mode.

Render changes:
- Under the title, when `priced`: `<p className={s.price}>{`전체 풀이 · ${won(offer.priceKrw)}`}</p>`.
- In `.actions`, after the primary:
  - `{offerSecondary}`;
  - `{owner && offer.mode !== "beta" ? <Button variant="ghost" block onClick={() => onUnlock("owner")}>운영자로 무료 열기</Button> : null}`;
  - when `error && refundHref`: `<div className={s.links}><Link href={refundHref}>환불받기</Link></div>`.
- Caption: `<p className={s.caption}>{caption}</p>` replaces the fixed beta caption.
- The beta primary keeps calling `onUnlock` with `"beta"`: `onClick={() => onUnlock("beta")}`. The existing callers pass `() => unlock()`-style handlers that ignore the argument, so they compile unchanged until Task 15.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/lib/pay/offer.test.ts apps/web/lib/account/client.test.ts apps/web/lib/reading apps/web/components/tarot`
Expected: PASS (offer 6, client 3, errors.p4 3, UnlockSheet 6; existing reading tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account/client.ts apps/web/lib/account/client.test.ts apps/web/lib/pay/offer.ts apps/web/lib/pay/offer.test.ts apps/web/lib/reading/api.ts apps/web/lib/reading/errors.ts apps/web/lib/reading/errors.p4.test.ts apps/web/components/tarot/UnlockSheet.tsx apps/web/components/tarot/UnlockSheet.module.css apps/web/components/tarot/UnlockSheet.test.tsx
git commit -m "feat(unlock): account store, unlock offers and paid states in the unlock sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Result pages and the login page

**Files:**
- Modify:
  - `apps/web/app/tarot/result/FreeResult.tsx`, `apps/web/app/tarot/result/page.tsx`
  - `apps/web/app/saju/chart/SajuChartView.tsx`, `apps/web/app/saju/chart/page.tsx`
  - `apps/web/app/chapter/[id]/LocalChapter.tsx` (send `readingId` with follow-ups)
  - `apps/web/lib/storage/chapters.ts` (`serverId`), `apps/web/lib/reading/types.ts` (`readingId`)
  - `apps/web/app/login/page.tsx`, `apps/web/app/login/LoginPanel.tsx` (real Kakao; Google removed)
- Test: `apps/web/app/login/LoginPanel.test.tsx`, `apps/web/lib/storage/serverId.test.ts`

**Interfaces:**
- Consumes:
  - Task 14: `useAccount`, `refreshAccount`, `loginHref`, `loginMessage`, `unlockOffer`, `checkoutHref`, and the `UnlockSheet` props.
  - `standardProduct` (Task 2), `UnlockMethod` (Task 10), `safeReturnTo` (Task 3).
  - The reading routes' `unlock`, `display` and `readingId` (Task 10); `FollowUpBody.readingId` (Task 11).
- Produces:
  - `StoredChapter.serverId?: string` (the account copy's id); `TarotReadingResponse.readingId?`, `SajuReadingResponse.readingId?`
  - `FreeResult({instant, autoUnlock?, loginFlag?})`, `SajuChartView({autoUnlock?, loginFlag?})`
    - `autoUnlock` ("paid" | "free" | null, from `?unlock=`) opens the reading once after checkout.
  - `LoginPanel({ next, status, navigate? })`

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
    const chapter = saveChapter({ kind: "tarot", question: "질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    expect(chapter.serverId).toBe("abcdefghij0123456789");
    expect(listChapters()[0]?.serverId).toBe("abcdefghij0123456789");
    expect(JSON.parse(localStorage.getItem(CHAPTERS_KEY)!)[0].serverId).toBe("abcdefghij0123456789");
  });

  it("drops a malformed serverId instead of the whole chapter", () => {
    const parsed = parseChapter({ id: "abc123", createdAt: 1, chapterToken: "t", kind: "tarot", question: "q", cards: [card], reading, serverId: "../etc" });
    expect(parsed).not.toBeNull();
    expect(parsed?.serverId).toBeUndefined();
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

Run: `npx vitest run apps/web/lib/storage/serverId.test.ts apps/web/app/login/LoginPanel.test.tsx`
Expected: FAIL. `serverId` is not kept, and LoginPanel has no `next` prop and still shows Google.

- [ ] **Step 3: `serverId` and `readingId`**
  - In `apps/web/lib/storage/chapters.ts`:
    - add to `ChapterBase`: `/** The account copy's id (Task 10/11): follow-ups update it there too. */ serverId?: string;`;
    - in `parseChapter`, after `base` is built: `if (isString(value.serverId) && /^[a-z0-9]{20}$/.test(value.serverId)) base.serverId = value.serverId;`.
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

- [ ] **Step 4: Wire `FreeResult.tsx`.** Change only these parts and keep everything else as it is when you start.

```tsx
// new imports
import { useRef } from "react";
import { loginHref, loginMessage, refreshAccount, useAccount } from "@/lib/account/client";
import { standardProduct } from "@/lib/pay/catalog";
import { checkoutHref, unlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";

const RETURN_TO = "/tarot/result";

export function FreeResult({ instant, autoUnlock = null, loginFlag = null }: { instant: boolean; autoUnlock?: UnlockMethod | null; loginFlag?: string | null }) {
  // ...existing hooks...
  const account = useAccount();
  const offer = unlockOffer(account, standardProduct("tarot"), SITE.price.signupGiftFree);
  const [method, setMethod] = useState<UnlockMethod>("beta");
  const unlockError = unlockGen.state.status === "error"
    ? describeApiError(unlockGen.state.error, method === "paid" ? "paid" : method === "free" ? "stardust" : "reading")
    : null;
  const loginNote = loginMessage(loginFlag);

  const unlock = async (chosen: UnlockMethod) => {
    if (!draw || !input || !summary) return;
    setMethod(chosen);
    window.scrollTo(0, 0);
    const plan = progressPlan("tarot-reading", { positions });
    const body = { drawToken: draw.drawToken, input: withHistory(input), ...(chosen === "beta" ? {} : { unlock: { method: chosen } }) };
    const result = await unlockGen.run("/api/tarot/reading", body, plan);
    if (!result) return;
    if (!result.ok) {
      if (result.error.code === "BETA_LIMIT") markDayUsedUp();
      if (result.error.code === "LOGIN_REQUIRED") router.push(loginHref(RETURN_TO));
      if (result.error.code === "NO_CREDIT" || result.error.code === "PAYMENT_REQUIRED") void refreshAccount();
      return;
    }
    if (chosen === "beta") countFullReading();
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
                refundHref={method === "paid" ? "/me#orders" : undefined}
                error={unlockError ?? (loginNote ? { title: loginNote, action: null } : null)}
                redrawHref={withFlags("/tarot/draw", { instant })}
                editHref="/tarot/new"
                openedHref={openedId ? `/chapter/${openedId}` : undefined}
              />
```

`apps/web/app/tarot/result/page.tsx` passes the flags:

```tsx
        <FreeResult
          instant={query.instant === "1"}
          autoUnlock={query.unlock === "paid" || query.unlock === "free" ? query.unlock : null}
          loginFlag={typeof query.login === "string" ? query.login : null}
        />
```

- [ ] **Step 5: Wire `SajuChartView.tsx` the same way.**
  - Use `standardProduct("saju")` and `RETURN_TO = "/saju/chart"`; the props are `{ autoUnlock?, loginFlag? }`.
  - For a non-beta method, the request body adds `display: { title: teaser.title, summary: teaser.summary }` next to `unlock`.
  - Pass `checkoutHref("saju", RETURN_TO)` to the sheet, and save `serverId` with the chapter.
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

- [ ] **Step 6: Replace the login page.**

`apps/web/app/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
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

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web/lib/storage apps/web/app/login apps/web/app/tarot apps/web/app/saju apps/web/app/chapter apps/web/components`
Expected: PASS (serverId 2, LoginPanel 3; the existing storage, DrawStage and chapter tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0.

The controller runs `pnpm e2e` after this task. The beta flows must stay green: with `STARLOG_PAYMENTS` unset, `/api/me` answers `payments: false`, so every sheet is the beta sheet.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/tarot/result apps/web/app/saju/chart apps/web/app/chapter/[id]/LocalChapter.tsx apps/web/lib/storage/chapters.ts apps/web/lib/storage/serverId.test.ts apps/web/lib/reading/types.ts apps/web/app/login
git commit -m "feat(unlock): paid and 별조각 offers on the result pages; Kakao-only login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Checkout, success and fail pages

**Files:**
- Create:
  - `apps/web/lib/pay/tossSdk.ts`
  - `apps/web/app/pay/checkout/page.tsx`, `apps/web/app/pay/checkout/CheckoutView.tsx`, `apps/web/app/pay/pay.module.css`
  - `apps/web/app/pay/success/page.tsx`, `apps/web/app/pay/success/PaySuccess.tsx`
  - `apps/web/app/pay/fail/page.tsx`, `apps/web/app/pay/fail/PayFail.tsx`
- Modify: `apps/web/lib/reading/api.ts` (add `getJson`), `apps/web/lib/seo.ts` (`/pay` in `ROBOTS_DISALLOW`, plus its test if the test pins the list)
- Test: `apps/web/app/pay/checkout/CheckoutView.test.tsx`, `apps/web/app/pay/success/PaySuccess.test.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/pay/checkout`, `POST /api/pay/orders`, `POST /api/pay/confirm`, `GET /api/pay/orders?id=` (Task 7).
  - `loginHref`, `refreshAccount` (Task 14); `withQuery`, `safeReturnTo` (Task 3); `standardProduct` (Task 2).
  - `postJson`, `describeApiError`, `ErrorView`; `Button`, `Checkbox`, `Stepper`, `NightSky`.
- Produces:
  - `tossSdk.ts`: `TOSS_SDK_URL`, `interface TossWidgets`, `loadTossSdk(): Promise<(clientKey: string) => { widgets(o: {customerKey}): TossWidgets }>`
  - `api.ts`: `getJson<T>(path, options?): Promise<ApiResult<T>>`
  - `CheckoutView({ productId, returnTo, navigate? })`, `PaySuccess({ paymentKey, orderId, amount, navigate?, pollMs? })`, `PayFail({ code, message, orderId })`
  - Routes `/pay/checkout?product&returnTo`, `/pay/success` (Toss successUrl), `/pay/fail` (Toss failUrl); all noindex and disallowed in robots.

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
    const queue = routes[key] ?? [() => Response.json({ payments: true, owner: false, user: null })];
    return (queue.length > 1 ? queue.shift()! : queue[0]!)();
  }));
  return bodies;
}

describe("PaySuccess", () => {
  it("confirms with the query's values and opens the reading", async () => {
    const bodies = stub({ "/api/pay/confirm": [() => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result" })] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(bodies["/api/pay/confirm"]).toEqual([{ paymentKey: "tgen_1", orderId: ORDER, amount: 2900 }]);
  });

  it("waits while the payment is being checked", async () => {
    stub({
      "/api/pay/confirm": [() => Response.json({ code: "PAY_PENDING" }, { status: 409 })],
      "/api/pay/orders": [
        () => Response.json({ orderId: ORDER, productId: "saju", status: "confirming", returnTo: "/saju/chart" }),
        () => Response.json({ orderId: ORDER, productId: "saju", status: "paid", returnTo: "/saju/chart" }),
      ],
    });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
    expect(await screen.findByText("결제를 확인하고 있어요")).toBeTruthy();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/saju/chart?unlock=paid"));
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

- [ ] **Step 3: Add `getJson` to `apps/web/lib/reading/api.ts`**

```ts
/** GET a JSON answer (account and payment pages). */
export async function getJson<T>(path: string, { signal, fetchImpl = fetch }: CallOptions = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, { headers: { Accept: "application/json" }, credentials: "same-origin", signal });
  } catch {
    return { ok: false, error: NETWORK };
  }
  return readJsonResult<T>(response);
}
```

- [ ] **Step 4: Write `apps/web/lib/pay/tossSdk.ts`**

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
```

- [ ] **Step 5: Write `apps/web/app/pay/checkout/CheckoutView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginHref } from "@/lib/account/client";
import { SITE, won } from "@/lib/config";
import { loadTossSdk, type TossWidgets } from "@/lib/pay/tossSdk";
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
    } catch {
      setBusy(false); // the buyer closed the payment window: stay here
    }
  };

  return (
    <div className={s.screen}>
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
              {"열리기 전에는 언제든 내 정보에서 전액 환불받을 수 있고, 풀이를 만들다 실패하면 결제한 풀이는 그대로 남아요. "}
              <Link href="/refund">환불 정책</Link>
            </p>
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

- [ ] **Step 6: Write `apps/web/app/pay/success/PaySuccess.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { refreshAccount } from "@/lib/account/client";
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
 * every couple of seconds.
 */
export function PaySuccess({ paymentKey, orderId, amount, navigate = (url) => window.location.replace(url), pollMs = 2000 }: PaySuccessProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = (returnTo: string) => {
      void refreshAccount();
      navigate(withQuery(returnTo, { unlock: "paid" }));
    };
    void (async () => {
      const res = await postJson<{ status: "paid"; returnTo: string }>("/api/pay/confirm", { paymentKey, orderId, amount: Number(amount) });
      if (res.ok) return finish(res.data.returnTo);
      if (res.error.code !== "PAY_PENDING") return setError(describeApiError(res.error));
      setPending(true);
      for (let i = 0; i < POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const status = await getJson<{ status: string; returnTo: string }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`);
        if (status.ok && status.data.status === "paid") return finish(status.data.returnTo);
        if (status.ok && status.data.status === "failed") return setError({ title: "결제를 마치지 못했어요", body: "청구된 금액은 없어요.", action: "retry" });
      }
      setError({ title: "결제를 확인하고 있어요", body: "내 정보의 결제 내역에서 확인할 수 있어요. 결제가 끝나면 결제한 풀이가 그곳에 남아 있어요.", action: null });
    })();
  }, [paymentKey, orderId, amount, navigate, pollMs]);

  return (
    <div className={s.screen}>
      {error ? (
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

- [ ] **Step 7: Write the fail view and the three pages**

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

In `apps/web/lib/seo.ts`, add `"/pay"` to `ROBOTS_DISALLOW`. If `lib/seo.test.ts` pins that list, add `"/pay"` there too.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run apps/web/app/pay apps/web/lib/seo.test.ts apps/web/lib/reading`
Expected: PASS (CheckoutView 3, PaySuccess 3; seo and reading unchanged apart from `/pay`).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/pay/tossSdk.ts apps/web/app/pay apps/web/lib/reading/api.ts apps/web/lib/seo.ts apps/web/lib/seo.test.ts
git commit -m "feat(pay): checkout with the 청약철회 notice and Toss widget, success and fail pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 내 정보 — account, purchases, receipts, sync, deletion

**Files:**
- Create:
  - `apps/web/lib/storage/sync.ts`
  - `apps/web/app/me/AccountPanel.tsx`, `apps/web/app/me/OrderHistory.tsx`, `apps/web/app/me/account.module.css`, `apps/web/app/me/meStatus.ts`
- Modify:
  - `apps/web/lib/storage/chapters.ts` (`mergeServerReadings`, `markClaimed`, `forgetServerIds`, `unclaimedChapters`)
  - `apps/web/app/me/MeView.tsx`, `apps/web/app/me/page.tsx`, `apps/web/app/story/StoryView.tsx` (pull account readings)
- Delete: `apps/web/app/me/MoonPackSheet.tsx`. 달빛 packs are not sold in P4; the mock 충전 is gone. `SITE.moonPacks` stays in config for later.
- Test: `apps/web/lib/storage/sync.test.ts`, `apps/web/app/me/AccountPanel.test.tsx`, `apps/web/app/me/meStatus.test.ts`

**Interfaces:**
- Consumes:
  - Task 14: `useAccount`, `refreshAccount`, `logout`, `loginHref`, `AccountState`, `loginMessage`.
  - Task 16: `getJson`; plus `postJson` and `describeApiError`.
  - `productById` (Task 2); `parseChapter`, `updateChapter`, `listChapters`, `StoredChapter` (chapters.ts).
  - `GET /api/readings`, `POST /api/readings/claim`, `DELETE /api/readings?all=1` (Task 11); `GET /api/pay/orders`, `POST /api/pay/refund` (Tasks 7, 8); `POST /api/account/delete-intent` (Task 12).
- Produces:
  - `chapters.ts`:
    - `mergeServerReadings(readings: Array<{id; createdAt; chapter: unknown}>): number` (chapters added)
    - `markClaimed(pairs: Array<{localId; id}>)`, `forgetServerIds()`, `unclaimedChapters(chapters)`
  - `sync.ts`:
    - `pullAccountReadings(): Promise<number>`, `claimDeviceReadings(chapters, fetchImpl?): Promise<{claimed; rejected}>`
    - `deleteAccountReadings(fetchImpl?): Promise<boolean>`, `useAccountSync(account)`
  - `meStatus.ts`: `meStatusMessage(query: {account?; delete?; login?}): string | null`
  - `AccountPanel({ account, chapters, navigate? })`, `OrderHistory()` (anchor `#orders`)

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
    expect(meStatusMessage({ delete: "cancel" })).toBe("탈퇴를 취소했어요");
    expect(meStatusMessage({ login: "cancel" })).toBe("로그인을 취소했어요");
    expect(meStatusMessage({})).toBeNull();
  });
});
```

`apps/web/lib/storage/sync.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, markClaimed, mergeServerReadings, saveChapter, unclaimedChapters } from "./chapters";
import { claimDeviceReadings } from "./sync";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const serverChapter = (turns = 0) => ({
  kind: "tarot", question: "계정 질문", conditions: [], note: "", cards: [card], reading,
  chapterToken: `t${turns}`, createdAt: 5, turns: Array.from({ length: turns }, (_, i) => ({ question: `q${i}`, answer: `a${i}` })), followUpsLeft: 3 - turns,
});

describe("account readings on this device", () => {
  it("adds readings from the account once, and takes newer follow-ups", () => {
    expect(mergeServerReadings([{ id: "abcdefghij0123456789", createdAt: 5, chapter: serverChapter() }])).toBe(1);
    expect(mergeServerReadings([{ id: "abcdefghij0123456789", createdAt: 5, chapter: serverChapter(1) }])).toBe(0);
    const [only] = listChapters();
    expect(only).toMatchObject({ id: "abcdefghij0123456789", serverId: "abcdefghij0123456789", chapterToken: "t1", followUpsLeft: 2 });
    expect(only?.turns).toHaveLength(1);
  });

  it("skips what does not parse", () => {
    expect(mergeServerReadings([{ id: "bad", createdAt: 1, chapter: { kind: "tarot" } }])).toBe(0);
    expect(listChapters()).toEqual([]);
  });

  it("claims device-only chapters in batches of 20 and remembers their account ids", async () => {
    for (let i = 0; i < 25; i++) saveChapter({ kind: "tarot", question: `질문 ${i}`, conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: `t${i}` });
    const sizes: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const { chapters } = JSON.parse(String(init!.body)) as { chapters: Array<{ localId: string }> };
      sizes.push(chapters.length);
      return Response.json({ claimed: chapters.slice(1).map((c, i) => ({ localId: c.localId, id: `${String(i).padStart(2, "0")}${c.localId}`.slice(0, 20).padEnd(20, "x") })), rejected: [chapters[0]!.localId] });
    }) as unknown as typeof fetch;
    expect(await claimDeviceReadings(unclaimedChapters(listChapters()), fetchImpl)).toEqual({ claimed: 23, rejected: 2 });
    expect(sizes).toEqual([20, 5]);
    expect(unclaimedChapters(listChapters())).toHaveLength(2);
  });

  it("markClaimed sets the account id", () => {
    const chapter = saveChapter({ kind: "tarot", question: "q", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t" });
    markClaimed([{ localId: chapter.id, id: "abcdefghij0123456789" }]);
    expect(listChapters()[0]?.serverId).toBe("abcdefghij0123456789");
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
    return Response.json({ payments: true, owner: false, user: null });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

describe("AccountPanel", () => {
  it("shows the nickname, 별조각 with their last day, the unopened purchase and the receipt", async () => {
    render(<AccountPanel account={account} chapters={[]} />);
    expect(screen.getByRole("heading", { name: "별빛" })).toBeTruthy();
    expect(screen.getByText("10개")).toBeTruthy();
    expect(screen.getByText(/12월 30일까지/)).toBeTruthy();
    expect(screen.getByText("타로 전체 풀이 · 열지 않음")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "영수증 보기" })).getAttribute("href")).toBe("https://dashboard.tosspayments.com/receipt/x");
  });

  it("refunds an unopened purchase after a confirm", async () => {
    render(<AccountPanel account={account} chapters={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "전액 환불받기" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/pay/refund" && (r.body as { orderId: string }).orderId === "Ab3_dEf-Gh5iJk7Lm9No1Pq2")).toBe(true));
    expect(await screen.findByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
  });

  it("starts the deletion only through the Kakao re-check", async () => {
    const navigate = vi.fn();
    render(<AccountPanel account={account} chapters={[]} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("열지 않은 결제 1건은 전액 환불돼요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "카카오로 확인하고 탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?purpose=delete&intent=x"));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run apps/web/app/me apps/web/lib/storage/sync.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add the merge helpers to `apps/web/lib/storage/chapters.ts`** (below `deleteChapter`)

```ts
/** Chapters only this device holds (no account copy yet). */
export const unclaimedChapters = (chapters: readonly StoredChapter[]) => chapters.filter((chapter) => !chapter.serverId);

/**
 * Brings readings saved in the account onto this device (another device's purchases, follow-ups
 * answered elsewhere). A new one keeps its account id as its local id. A known one only takes newer
 * follow-up turns. Returns how many chapters were added.
 */
export function mergeServerReadings(readings: ReadonlyArray<{ id: string; createdAt: number; chapter: unknown }>): number {
  const local = listChapters();
  const parse = (r: { id: string; createdAt: number; chapter: unknown }, id: string) =>
    typeof r.chapter === "object" && r.chapter !== null ? parseChapter({ ...(r.chapter as Record<string, unknown>), id, serverId: r.id, createdAt: r.createdAt }) : null;
  const next = local.map((chapter) => {
    const remote = chapter.serverId ? readings.find((r) => r.id === chapter.serverId) : undefined;
    const parsed = remote ? parse(remote, chapter.id) : null;
    return parsed && parsed.turns.length > chapter.turns.length
      ? { ...chapter, turns: parsed.turns, chapterToken: parsed.chapterToken, followUpsLeft: parsed.followUpsLeft }
      : chapter;
  });
  const known = new Set(local.flatMap((chapter) => [chapter.id, chapter.serverId ?? ""]));
  let added = 0;
  for (const remote of readings) {
    if (known.has(remote.id)) continue;
    const parsed = parse(remote, remote.id);
    if (!parsed) continue;
    next.push(parsed);
    known.add(remote.id);
    added++;
  }
  store.save(next.sort((a, b) => a.createdAt - b.createdAt));
  return added;
}

/** Records the account ids the server gave claimed chapters. */
export function markClaimed(pairs: ReadonlyArray<{ localId: string; id: string }>) {
  const ids = new Map(pairs.map((pair) => [pair.localId, pair.id]));
  store.save(listChapters().map((chapter) => (ids.has(chapter.id) ? { ...chapter, serverId: ids.get(chapter.id)! } : chapter)));
}

/** After the account's copies were deleted: this device's chapters stand alone again. */
export function forgetServerIds() {
  store.save(listChapters().map(({ serverId: _serverId, ...chapter }) => chapter as StoredChapter));
}
```

- [ ] **Step 4: Write `apps/web/lib/storage/sync.ts`**

```ts
import { useEffect } from "react";
import type { AccountState } from "@/lib/account/client";
import { getJson, postJson } from "@/lib/reading/api";
import { forgetServerIds, markClaimed, mergeServerReadings, type StoredChapter } from "./chapters";

/** Keeps this device and the account's saved readings together (spec 5.7). */

const SYNCED_KEY = "starlog.account-synced";
const CLAIM_BATCH = 20;

/** Brings the account's readings onto this device; how many were new here. */
export async function pullAccountReadings(): Promise<number> {
  const res = await getJson<{ readings: Array<{ id: string; createdAt: number; chapter: unknown }> }>("/api/readings");
  return res.ok ? mergeServerReadings(res.data.readings) : 0;
}

/** Saves device-only chapters into the account, 20 per request; only when the user asks. */
export async function claimDeviceReadings(chapters: readonly StoredChapter[], fetchImpl: typeof fetch = fetch): Promise<{ claimed: number; rejected: number }> {
  let claimed = 0;
  let rejected = 0;
  for (let i = 0; i < chapters.length; i += CLAIM_BATCH) {
    const batch = chapters.slice(i, i + CLAIM_BATCH);
    const res = await postJson<{ claimed: Array<{ localId: string; id: string }>; rejected: string[] }>(
      "/api/readings/claim",
      { chapters: batch.map((chapter) => ({ localId: chapter.id, chapter })) },
      { fetchImpl },
    );
    if (!res.ok) {
      rejected += batch.length;
      continue;
    }
    markClaimed(res.data.claimed);
    claimed += res.data.claimed.length;
    rejected += res.data.rejected.length;
  }
  return { claimed, rejected };
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

- [ ] **Step 5: Write `apps/web/app/me/meStatus.ts`**

```ts
import { loginMessage } from "@/lib/account/client";

const DELETE_MESSAGES: Record<string, string> = {
  failed: "탈퇴를 마치지 못했어요. 다시 시도해 주세요.",
  mismatch: "로그인한 카카오 계정과 달라요. 같은 계정으로 다시 시도해 주세요.",
  "refund-failed": "환불을 마치지 못해 탈퇴를 멈췄어요. 문의해 주세요.",
  cancel: "탈퇴를 취소했어요",
};

/** The one line 내 정보 shows for ?account=, ?delete= or ?login=. */
export function meStatusMessage(query: { account?: string; delete?: string; login?: string }): string | null {
  if (query.account === "deleted") return "탈퇴했어요. 그동안 고마웠어요.";
  if (query.delete) return DELETE_MESSAGES[query.delete] ?? DELETE_MESSAGES.failed!;
  return loginMessage(query.login ?? null);
}
```

- [ ] **Step 6: Write `apps/web/app/me/OrderHistory.tsx`**

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

- [ ] **Step 7: Write `apps/web/app/me/AccountPanel.tsx`**

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
import { unclaimedChapters, type StoredChapter } from "@/lib/storage/chapters";
import { claimDeviceReadings, deleteAccountReadings } from "@/lib/storage/sync";
import { OrderHistory } from "./OrderHistory";
import s from "./account.module.css";

const lastDay = (iso: string) => {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};
const openHref = (productId: string) => (productId === "saju" ? "/saju/new" : "/tarot/new");

type AccountPanelProps = {
  account: AccountState & { user: AccountUser };
  chapters: StoredChapter[];
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * 내 정보 for a logged-in user (spec section 9):
 * - nickname, 별조각 with their last day, unopened purchases (열기, 환불받기), 결제 내역 with receipts;
 * - 계정에 보관하기 for device-only readings, and deleting the account's copies;
 * - 로그아웃, and 회원 탈퇴 (always through the Kakao re-check).
 */
export function AccountPanel({ account, chapters, navigate = (url) => window.location.assign(url) }: AccountPanelProps) {
  const { user } = account;
  const { free } = SITE.currency;
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState<"refund" | "delete" | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const deviceOnly = unclaimedChapters(chapters);

  const refund = async () => {
    if (!refundId) return;
    const res = await postJson("/api/pay/refund", { orderId: refundId });
    setSheet(null);
    setNotice(res.ok ? "환불했어요. 카드사에 따라 며칠 걸릴 수 있어요." : describeApiError(res.error).title);
    await refreshAccount();
    setHistoryKey((key) => key + 1);
  };

  const claim = async () => {
    const { claimed, rejected } = await claimDeviceReadings(deviceOnly);
    setNotice(rejected ? `${claimed}개를 계정에 보관했어요 · ${rejected}개는 옮기지 못했어요` : `${claimed}개를 계정에 보관했어요`);
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

      {deviceOnly.length > 0 ? (
        <div className={s.claim}>
          <p>{`이 기기에만 있는 풀이가 ${deviceOnly.length}개 있어요. 계정에 보관하면 다른 기기에서도 볼 수 있어요.`}</p>
          <Button variant="secondary" block onClick={() => void claim()}>
            계정에 보관하기
          </Button>
        </div>
      ) : null}

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
            <li>계정에 보관한 풀이와 별자리 인연 기록이 지워져요</li>
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

`apps/web/app/me/account.module.css`: classes `account`, `name`, `muted`, `balance`, `balanceLabel`, `unused`, `unusedItem`, `link`, `orders`, `sectionTitle`, `orderList`, `order`, `claim`, `notice`, `actions`, `confirm`, `list` and `danger`.
- Follow `MeView.module.css`: same tokens, ≥13px, tap targets ≥44px (`.link` and `.danger` with `min-height: 44px`).
- `.danger` copies the existing `.confirmErase` look.
- The 환불 modal's `전액 환불받기` is the only gold button on screen while it is open.

- [ ] **Step 8: Rewire `MeView.tsx` and the page.**
  - `apps/web/app/me/page.tsx`:
    - drop `WALLET_FIXTURE` and `SITE.features.payments`;
    - make it `async ({ searchParams }: PageProps<"/me">)`;
    - pass `status={meStatusMessage({ account: str(query.account), delete: str(query.delete), login: str(query.login) })}`, with `const str = (v: unknown) => (typeof v === "string" ? v : undefined)`.
  - `MeView.tsx`:
    - props become `{ status: string | null }`;
    - remove `wallet`, `balance`, `buy`, the `packs` sheet and the `MoonPackSheet` import, then delete `MoonPackSheet.tsx`;
    - add `const account = useAccount(); useAccountSync(account);`;
    - show `status` in the existing `notice` line (initial state `status ?? ""`).
  - Where the wallet/beta block was:

```tsx
        {account?.user ? (
          <AccountPanel account={{ ...account, user: account.user }} chapters={chapters ?? []} />
        ) : account?.payments ? (
          <section className={s.beta} aria-labelledby="login-title">
            <h2 id="login-title" className={s.betaTitle}>로그인하면 결제한 풀이를 다른 기기에서도 볼 수 있어요</h2>
            <Button href={loginHref("/me")} block>카카오로 로그인</Button>
          </section>
        ) : (
          /* the existing beta section, unchanged */
        )}
```

  - The header's `로그인 없이, 기록은 이 기기에 보관돼요` line shows only when `!account?.user`.
  - The erase modal's text gains, when `account?.user` is set: ` 계정에 보관한 풀이는 그대로예요.`
  - `apps/web/app/story/StoryView.tsx`: add `useAccountSync(useAccount());` at the top of the component, so 내 기록 shows readings bought on another device.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run apps/web/app/me apps/web/lib/storage apps/web/app/story apps/web/components`
Expected: PASS (meStatus 1, sync 4, AccountPanel 3; existing storage and layout tests unchanged).

Run: `pnpm typecheck`
Expected: exit 0. `WALLET_FIXTURE` may now be unused in `lib/fixtures.ts`; leave it unless the typecheck or a test fails.

- [ ] **Step 10: Commit**

```bash
git rm apps/web/app/me/MoonPackSheet.tsx
git add apps/web/lib/storage/sync.ts apps/web/lib/storage/sync.test.ts apps/web/lib/storage/chapters.ts apps/web/app/me apps/web/app/story/StoryView.tsx
git commit -m "feat(me): account, 별조각, purchases with refunds and receipts, sync and deletion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Legal pages — pricing, refund, terms, privacy

The four pages are owned jointly with the trust-pages work (P2b) and P3 Task 12, so edit them section by section.
- Keep every section this task does not name, and keep later wording that does not contradict this task.
- The pages describe the paid service as launched (what Toss's review reads).
- While sales are not open for the visitor, one client-side note says so: `PaymentsNote`, driven by `/api/me`. The static pages need no rebuild when `STARLOG_PAYMENTS` flips.

**Files:**
- Create: `apps/web/components/legal/PaymentsNote.tsx`
- Modify: `apps/web/app/pricing/page.tsx`, `apps/web/app/refund/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/lib/legal.ts` (`LEGAL_EFFECTIVE_DATE`), and the tests that pin text this task removes on purpose: `app/pricing/page.test.tsx`, `components/legal/LegalPages.test.tsx`, `components/legal/PolicyContent.test.tsx`, `lib/legal.test.ts`
- Test: `apps/web/components/legal/p4Policies.test.tsx`

**Interfaces:**
- Consumes: `standardProduct` (Task 2), `GIFT_DAYS` (Task 4), `useAccount` (Task 14), `SITE`, `won`, `LegalPage`/`LegalSection`/`LegalNote`, the `times()` helper the pricing page already uses.
- Produces:
  - `PaymentsNote({ children })`: renders its children only when `/api/me` says sales are closed for this visitor;
  - `LEGAL_EFFECTIVE_DATE = "2026-10-15"` (spec 14, default 17; the controller moves it if the deploy slips).

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

describe("policies for the paid launch", () => {
  it("/pricing sells the two standard readings by name and price, and no 달빛 packs", () => {
    const page = text(<PricingPage />);
    expect(page).toContain("타로 전체 풀이");
    expect(page).toContain("사주 전체 풀이");
    expect(page).toContain("2,900원");
    expect(page).toContain("이 기기에 계속 보관");
    expect(page).toContain("받은 날부터 90일째 되는 날까지 쓸 수 있어요");
    expect(page).not.toContain("충전");
    expect(page).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("/refund: 제공 means saved to the account; unopened is refundable any time; failures keep the credit", () => {
    const page = text(<RefundPage />);
    expect(page).toContain("제17조 제2항 제5호");
    expect(page).toContain("완성되어 계정에 저장되면");
    expect(page).toContain("기한 없이 전액 환불");
    expect(page).toContain("내 정보 > 결제 내역");
    expect(page).toContain("쓰이지 않고 그대로 남아요");
    expect(page).toContain("90일");
    expect(page).not.toContain("충전");
  });

  it("/terms: Kakao members, item-by-item payment, 별조각 rules, deletion", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("카카오 계정으로 로그인");
    expect(page).toContain("건별로 결제");
    expect(page).toContain("제7조의2 (별조각)");
    expect(page).toContain("열지 않은 결제 풀이는 전액 환불");
    expect(page).not.toContain("충전");
  });

  it("/privacy: what an account keeps, for how long, and who processes it", () => {
    const page = text(<PrivacyPage />);
    expect(page).toContain("카카오 회원번호");
    expect(page).toContain("되돌릴 수 없는 값");
    expect(page).toContain("암호화");
    expect(page).toContain("5년");
    expect(page).toContain("3년");
    expect(page).toContain("토스페이먼츠 주식회사");
    expect(page).not.toContain("결제 도입 시");
    expect(page).toContain("sl_sid");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/components/legal/p4Policies.test.tsx`
Expected: FAIL. The pricing page still names "타로 심층 풀이" and the 달빛 충전 section; privacy still says "결제 도입 시".

- [ ] **Step 3: Write `apps/web/components/legal/PaymentsNote.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/lib/account/client";

/**
 * The legal pages describe the paid service. While sales are closed for this visitor
 * (STARLOG_PAYMENTS off, or owner-only), this note says so. It is read at run time from /api/me,
 * so flipping the flag needs no rebuild of the static pages.
 */
export function PaymentsNote({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (account === undefined || account?.payments) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: `/pricing`** (`apps/web/app/pricing/page.tsx`)
  - Lead: `풀이 한 번의 가격과 무료로 볼 수 있는 부분, 별조각을 한곳에 모았어요.`
  - Wrap the existing `LegalNote` in `<PaymentsNote>`. Inside it, the note stays the beta note: `지금은 베타 기간이라 무료예요.` plus `전체 풀이를 하루 ${times(beta.fullPerDay)} 무료로 열 수 있어요. 결제는 심사 완료 후 열려요.`
  - `PRODUCTS`:
    - names come from the catalog: `standardProduct("tarot").name` → `타로 전체 풀이`, `standardProduct("saju").name` → `사주 전체 풀이`;
    - prices from `standardProduct(…).krw`;
    - the card checklist keeps the owner's lines: `소제목으로 나눈 풀이 전체 · 약 N자`, `이어서 물어보기 N번`, `이 기기에 계속 보관`.
  - Under the cards: `결제하거나 ${currency.free}으로 열어도 풀이 내용과 이어서 물어보기, 보관 범위는 같아요. 로그인해서 연 풀이는 계정에도 보관돼 다른 기기에서 볼 수 있어요.`
  - `#premium` stays as it is.
  - `#free`:
    - remove the beta "하루 N번" line (it now lives in the note);
    - keep the teaser, 오늘의 한 장 and 지금의 한 장 lines;
    - the gift line becomes `처음 가입하면 ${currency.free} ${price.signupGiftFree}개를 드려요. 전체 풀이를 ${count(giftReadings)} 무료로 열 수 있어요. 받은 날부터 ${GIFT_DAYS}일째 되는 날까지 쓸 수 있어요.` (keep or reintroduce the `count` helper: 1 → `한 번`, n → `n번`);
    - import `GIFT_DAYS` from a client-safe place: move `export const GIFT_DAYS = 90;` (with its comment) to `lib/pay/catalog.ts`. In `ledger.ts`, replace the declaration with `import { GIFT_DAYS } from "./catalog";` and `export { GIFT_DAYS };`; `giftExpiry` keeps using it.
  - Remove the `#moonlight` section.
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
  - Description metadata: `타로 전체 풀이 ${won(…)}, 사주 전체 풀이 ${won(…)}. 풀이 한 번에 담기는 것, 준비 중인 풀이, 무료로 볼 수 있는 부분과 별조각, 결제 수단을 안내해요.`

- [ ] **Step 5: `/refund`** (`apps/web/app/refund/page.tsx`)
  - Lead: `${SITE.nameKo}의 풀이는 디지털 콘텐츠예요. 결제하기 전에 알아 두면 좋은 청약철회와 환불 기준을 정리했어요.`
  - Remove the `refundExample` helper, the `moonRefundKrw` import and the `#moonlight` section.
  - `#withdrawal`:

```tsx
        <p>
          「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, 디지털 콘텐츠는 제공이 시작되면 청약철회가 제한될 수 있어요.
          {` ${SITE.nameKo}에서는 결제한 풀이가 완성되어 계정에 저장되면(화면에 열리면) 제공이 시작된 것으로 봐요.`}
        </p>
        <p>무료로 공개하는 첫 풀이(타로는 첫 카드 풀이와 카드별 키워드, 사주는 요약 풀이)가 맛보기예요. 결제 화면에서 이 내용을 먼저 알려 드리고 확인을 받아요.</p>
```

  - `#before-open`: `<p>결제한 풀이를 열기 전에는 기한 없이 전액 환불받을 수 있어요. 내 정보 &gt; 결제 내역에서 ‘환불받기’를 누르면 바로 처리돼요.</p>`
  - `#failure`:

```tsx
        <ul className={s.list}>
          <li>{`풀이를 만들다 실패하거나 중간에 연결이 끊겨 끝까지 만들어지지 않았다면, 결제한 풀이나 쓰려던 ${free}은 쓰이지 않고 그대로 남아요. 같은 풀이를 다시 열 때 한 번 더 결제하지 않아요.`}</li>
          <li>결제한 풀이라면 다시 여는 대신 바로 전액 환불받을 수도 있어요.</li>
          <li>풀이가 결제 전에 안내한 내용과 다르게 제공됐다면, 확인한 뒤 같은 기준으로 처리해요.</li>
        </ul>
```

  - `#stardust`: `<p>{`${free}은 가입 선물처럼 무료로 드린 재화라 환불 대상이 아니에요. 받은 날부터 90일째 되는 날까지 쓸 수 있고, 현금으로 바꾸거나 다른 사람에게 넘길 수 없어요.`}</p>`
  - `#how`:

```tsx
        <ul className={s.list}>
          <li>열지 않은 결제는 내 정보 &gt; 결제 내역의 ‘환불받기’로 바로 환불돼요.</li>
          <li>그 밖의 환불은 아래 문의처로 결제일, 결제 금액, 로그인한 계정의 닉네임, 환불 사유를 알려 주세요. 확인한 날부터 영업일 기준 3~7일 이내에 결제한 수단으로 환불해 드려요.</li>
          <li>카드사나 결제사 사정에 따라 실제로 반영되기까지 며칠 더 걸릴 수 있어요.</li>
        </ul>
```

  - `#law`: replace `가격과 ${paid} 충전 상품은` with `가격은`.

- [ ] **Step 6: `/terms`** (`apps/web/app/terms/page.tsx`; keep the formal 합니다체 the page uses)
  - 제2조 (정의): replace the 회원/비회원 item and the 달빛 item, keep the others:

```tsx
          <li>“회원”이란 카카오 계정으로 로그인해 서비스를 이용하는 사람을, “비회원”이란 로그인하지 않고 이용하는 사람을 말합니다.</li>
          <li>“전체 풀이”란 무료로 공개하는 부분을 넘어 소제목 전체와 이어서 물어보기를 담은 풀이를 말하며, 건별로 결제하거나 별조각으로 엽니다.</li>
```

    The 별조각 item stays: `…가입 선물 등으로 무료로 지급하고, 전체 풀이를 여는 데 쓰는 무료 재화…`.
  - 제4조 4항 (beta) becomes: `<li>결제가 열리기 전 베타 기간에는 전체 풀이를 하루 정해진 횟수만큼 무료로 제공합니다. 결제가 열리면 이 무료 제공은 끝나고 가입 선물(별조각)로 바뀌며, 운영자는 이를 시행일 7일 전부터 서비스 안에 공지합니다.</li>`
  - 제6조 (회원과 비회원 이용), items 2 and 3:

```tsx
          <li>{`회원 가입은 카카오 계정으로 로그인해서 하며, 처음 가입하면 가입 선물로 ${free}을 드립니다. 가입 선물은 카카오 계정 하나에 한 번만 드립니다.`}</li>
          <li>{`회원은 언제든지 내 정보에서 탈퇴할 수 있습니다. 탈퇴하면 열지 않은 결제 풀이는 전액 환불하고, 남은 ${free}은 사라지며, 계정에 보관한 풀이는 지웁니다. 결제 기록은 관련 법령이 정한 기간 동안 보관합니다.`}</li>
```

  - 제7조 (유료 서비스와 결제):

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
          <li>영수증은 내 정보의 결제 내역에서 확인할 수 있습니다.</li>
        </ol>
```

  - Add after 제7조:

```tsx
      <LegalSection id="stardust" title="제7조의2 (별조각)">
        <ol className={s.list}>
          <li>{`${free}은 무료로 지급하는 재화로, 환불하거나 현금으로 바꾸거나 다른 사람에게 넘길 수 없습니다.`}</li>
          <li>{`${free}은 받은 날부터 90일째 되는 날의 자정(한국 시간)까지 쓸 수 있으며, 여러 번 받은 경우 먼저 사라지는 것부터 씁니다.`}</li>
          <li>{`탈퇴하면 남은 ${free}은 사라집니다.`}</li>
        </ol>
      </LegalSection>
```

  - 제9조 3항: `<li>유료 서비스를 종료할 때는 30일 전에 공지하고, 열지 않은 결제 풀이는 전액 환불합니다.</li>`
  - Remove `paid` from the destructuring if it is no longer used.

- [ ] **Step 7: `/privacy`** (`apps/web/app/privacy/page.tsx`)
  - `#items`, a sub-list for 회원:

```tsx
          <li>
            회원(카카오 로그인)
            <ul className={s.list}>
              <li>카카오 회원번호: 되돌릴 수 없는 값(HMAC)으로 바꿔서만 저장하며, 카카오의 접근 토큰은 저장하지 않습니다</li>
              <li>닉네임(카카오 동의 항목), 만 14세 이상 확인 시각, 로그인 세션</li>
              <li>결제 기록: 주문번호, 상품, 금액, 결제수단 종류, 승인·취소 시각과 영수증 주소. 카드번호 등 결제 정보는 토스페이먼츠가 처리하며 운영자는 받지 않습니다</li>
              <li>계정에 보관한 풀이: 질문, 상황, 메모 또는 출생 정보와 풀이 결과. 암호화해서 저장합니다</li>
            </ul>
          </li>
          <li>수집 출처: 카카오(카카오 로그인 시 회원번호와 닉네임)</li>
```

  - `#purposes`: replace `(결제 도입 시) 결제와 환불 처리, 거래 기록 보관` with:
    - `회원 관리(로그인, 탈퇴), 결제와 환불 처리, 거래 기록 보관`;
    - `가입 선물의 중복 지급 방지`;
    - `계정에 보관한 풀이를 다른 기기에서 보여 주기`.
  - `#retention`: replace the `결제를 도입하면 …` item with:

```tsx
          <li>회원 정보는 탈퇴할 때까지 보관하고, 탈퇴하면 지체 없이 파기합니다. 계정에 보관한 풀이는 이용자가 지우거나 탈퇴할 때 파기합니다. 로그인 세션은 30일 뒤 끝납니다.</li>
          <li>「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 등에 관한 기록과 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁처리에 관한 기록은 3년 동안 보관합니다. 이 기록은 탈퇴 뒤에는 회원 식별 정보와 분리해 보관합니다.</li>
          <li>가입 선물을 다시 받는 것을 막기 위해, 카카오 회원번호를 되돌릴 수 없게 바꾼 값과 지급 시각을 탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.</li>
```

  - `#processors`: the Toss entry's name becomes `토스페이먼츠 주식회사`, and its role `결제 처리(카드·간편결제 승인과 취소)`. The Cloudflare entry's role includes `회원·결제 기록과 계정에 보관한 풀이의 저장(D1)`; keep P3's wording if it already says 저장.
  - `#cookies`, add:
    - `sl_sid: 로그인 세션(30일, 로그아웃하면 끝납니다)`;
    - `sl_oauth: 카카오 로그인 확인(10분)`.
  - `#rights`, add: `계정에 보관한 풀이는 내 정보에서 지울 수 있고, 탈퇴도 내 정보에서 할 수 있습니다.`

- [ ] **Step 8: `LEGAL_EFFECTIVE_DATE` and the old assertions**
  - `apps/web/lib/legal.ts`: `export const LEGAL_EFFECTIVE_DATE = "2026-10-15";`; update `lib/legal.test.ts` to match (`"2026년 10월 15일"`).
  - In `app/pricing/page.test.tsx`:
    - remove the assertions on the 달빛 pack text (`풀이 한 번은 달빛 5개로 열려요`, the pack price, `보너스 +5`, the per-reading pack price) and on `하루 두 번 무료로 열 수 있어요` (now in the client-side note);
    - add `expect(text).not.toContain("충전")`.
  - In `LegalPages.test.tsx` / `PolicyContent.test.tsx`, replace only assertions on text this task removed (the 달빛 sections, `결제 도입 시`, `타로 심층 풀이`), each with the matching new text from Steps 4–7. Never delete an assertion about text that stays.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run apps/web/components/legal apps/web/app/pricing apps/web/lib/legal.test.ts apps/web/components/info apps/web/lib/pay`
Expected: PASS (p4Policies 4; the edited pricing, legal and info tests).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/legal apps/web/app/pricing apps/web/app/refund/page.tsx apps/web/app/terms/page.tsx apps/web/app/privacy/page.tsx apps/web/lib/legal.ts apps/web/lib/legal.test.ts apps/web/lib/pay/catalog.ts apps/web/lib/pay/ledger.ts
git commit -m "docs(legal): pricing, refund, terms and privacy for item-by-item payments and accounts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Bundle guard, e2e pay flow, runbook

**Files:**
- Modify: `scripts/check-client-bundle.mjs` (secret probes), `apps/web/playwright.config.ts` (webServer env), `apps/web/e2e/global-setup.ts` (compile `/pay/*`), `apps/web/package.json` (`e2e` migrates local D1 first), `apps/web/.env.example` (`STARLOG_CF_DEV`)
- Create: `apps/web/e2e/pay-flow.spec.ts`, `docs/runbook-payments.md`

**Interfaces:**
- Consumes everything above. The e2e server runs `next dev` with `STARLOG_CF_DEV=1` (local D1, Task 1), `STARLOG_PAYMENTS=owner`, `STARLOG_PAY=mock`, `STARLOG_KAKAO=mock` and `STARLOG_AI=mock`.
- Produces: `pnpm check:bundle` fails on secrets in the client bundle; `pnpm e2e` covers gift → pay → auto-open → refund; and the rollout runbook.

The controller runs this task's builds and Playwright (global constraint). An implementer writes the files and runs only the Vitest parts.

- [ ] **Step 1: Secret probes in `scripts/check-client-bundle.mjs`.** Add after the `probes` list:

```js
// Secrets must never reach the browser: Toss secret-key prefixes, and the real values when this shell
// has them (reported by name only, never printed).
const SECRET_PREFIXES = ["test_gsk_", "live_gsk_", "test_sk_", "live_sk_"];
const SECRET_NAMES = ["TOSS_SECRET_KEY", "KAKAO_CLIENT_SECRET", "STARLOG_ACCOUNT_SECRET", "STARLOG_SIGNING_SECRET", "ANTHROPIC_API_KEY", "STARLOG_OWNER_CODE"];
const secretProbes = [
  ...SECRET_PREFIXES.map((prefix) => ({ label: `secret key prefix ${prefix}`, value: prefix })),
  ...SECRET_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value && value.length >= 8 ? [{ label: `value of ${name}`, value }] : [];
  }),
];
```

In the scan loop, after the paid-text probes:

```js
  for (const probe of secretProbes) {
    if (text.includes(probe.value)) hits.push(`${relative(root, path)}: ${probe.label}`);
  }
```

Change the failure heading to `check-client-bundle: paid text or secrets found in the client bundle`. Change the success line to `check-client-bundle: ok, ${probes.length} paid-text probes, ${secretProbes.length} secret probes, ${scanned} static files, 0 hits`.

Run (controller, after `pnpm build`): `pnpm check:bundle`
Expected: `check-client-bundle: ok, … secret probes, … 0 hits`.

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

  - `apps/web/package.json`: `"e2e": "wrangler d1 migrations apply starlog --local && playwright test"`.
  - `apps/web/e2e/global-setup.ts`: add `"/pay/checkout?product=tarot&returnTo=%2Ftarot%2Fresult"`, `"/pay/success"` and `"/pay/fail?code=PAY_PROCESS_CANCELED"` to `ROUTES`. These render a client view with status 200 even without a session.
  - `apps/web/.env.example`: add

```bash
# 1: `next dev` gets the Worker's bindings (local D1, KV, rate limiters) through Miniflare. Run
# `pnpm --filter @starlog/web db:migrate:local` first. Leave empty for plain `next dev`.
STARLOG_CF_DEV=
```

- [ ] **Step 3: Write `apps/web/e2e/pay-flow.spec.ts`**

```ts
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * Accounts and payments in owner mode (STARLOG_PAYMENTS=owner, mock Kakao and mock Toss, local D1):
 * the owner pass opens sales on this browser; everyone else keeps the beta, which the other specs cover.
 * A mock Kakao login without mockUser is a fresh account each time, so every run starts with the gift.
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
  await expect(page.getByRole("heading", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: GENERATION });
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

  // 3. The next reading is paid: checkout with the 청약철회 check, mock Toss, back, opened automatically.
  await toResult(page);
  await page.getByRole("link", { name: "2,900원 결제하고 보기" }).click();
  await expect(page).toHaveURL(/\/pay\/checkout\?/, { timeout: NAV });
  await expect(page.getByText(/청약철회가 제한돼요/)).toBeVisible();
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
```

- [ ] **Step 4: Write `docs/runbook-payments.md`**

````markdown
# Runbook: accounts and payments (P4)

Spec: docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md (sections 12, 14, 15).
Commands run from `apps/web` unless noted. Never paste key values into chat, commits or logs.

## 1. One-time setup

- D1: `starlog` (id 78c6fb07-ee97-42d5-9633-21801fe596eb, binding DB), shared with P3.
- Kakao developers console (the app that owns the REST API key):
  - 카카오 로그인 ON; 동의 항목: 닉네임 (필수); 클라이언트 시크릿 사용 ON.
  - Redirect URIs: https://starlog.yeolmaeapps.kr/api/auth/kakao/callback and http://localhost:3100/api/auth/kakao/callback.
  - Web platform domains: https://starlog.yeolmaeapps.kr, http://localhost:3100.
- Toss developers center:
  - 결제위젯(주문서형) variant DEFAULT with card + 간편결제 only (no 가상계좌, no 계좌이체); agreement variant AGREEMENT.
  - Webhook: https://starlog.yeolmaeapps.kr/api/pay/webhook, event PAYMENT_STATUS_CHANGED.
- Secrets (`npx wrangler secret put <NAME>`; each one makes a new Worker version at once):
  - `STARLOG_ACCOUNT_SECRET`: 32+ random chars, NEVER rotate. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
  - `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`.
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY` and `TOSS_SECRET_KEY`: both test_ keys first. A mixed test/live pair is refused (503).
  - `STARLOG_PAYMENTS`: `off`, `owner` or `on`.

## 2. Deploy dark

1. `pnpm db:migrate:remote` → 0002_accounts_payments.sql ✅
2. From the repo root: `pnpm deploy`.
3. `curl -s https://starlog.yeolmaeapps.kr/api/me` → `{"payments":false,"owner":false,"user":null}`. The site is the beta.

## 3. Owner check in production (test keys)

`npx wrangler secret put STARLOG_PAYMENTS` → `owner`. On the owner-pass browser:

- [ ] result page shows `로그인하고 전체 풀이 보기`; another browser still shows the beta sheet
- [ ] Kakao login (real) → back with login=ok; 내 정보 shows the nickname and 별조각 10개 with its last day
- [ ] `별조각 10개로 보기` opens the reading; 별조각 0; the reading is listed on another device after login
- [ ] test payment 2,900원 (test card) → reading opens by itself; 결제 내역 shows it with 영수증 보기
- [ ] buy another, leave it unopened → 환불받기 → Toss dashboard shows it cancelled; status 환불됨
- [ ] cancel a payment in the Toss dashboard → webhook → order 환불됨 within a minute
- [ ] 이어서 물어보기 on a paid reading → answer also appears on another device
- [ ] cut the network during a paid generation → 결제한 풀이 열기 is offered again (no charge)
- [ ] 회원 탈퇴 with an unopened purchase → refunded, logged out, /me says 탈퇴했어요
- [ ] `pnpm check:bundle` on the deployed build: 0 hits

## 4. Toss review

Apply for the live contract. The site already shows: /pricing (products, prices), /refund, /terms, /privacy, the business footer, the checkout with the 청약철회 notice. Follow the Toss sales contact's checklist.

## 5. Live keys

`npx wrangler secret put NEXT_PUBLIC_TOSS_CLIENT_KEY` (live_gck_…) and `npx wrangler secret put TOSS_SECRET_KEY` (live_gsk_…), one right after the other. Still in owner mode: one real 2,900원 purchase opened, one real purchase refunded.

## 6. Switch on

After LEGAL_EFFECTIVE_DATE (lib/legal.ts; the changed terms are announced 7 days before):
`npx wrangler secret put STARLOG_PAYMENTS` → `on`. The beta's free daily full reading ends; the signup gift starts.
For the first 24 h, run the checks in section 7 every two hours.

## 7. Checks (`npx wrangler d1 execute starlog --remote --command "<SQL>"`)

- Stuck orders (should be empty; open 내 정보 or wait for the webhook to settle them):
  `SELECT id, status, updated_at FROM orders WHERE status IN ('confirming','refunding') AND updated_at < strftime('%s','now')*1000 - 300000`
- Reservations nobody settled (swept on the user's next request):
  `SELECT COUNT(*) AS n FROM unlocks WHERE status = 'reserved' AND reserved_until < strftime('%s','now')*1000`
- Lot invariant (must be empty):
  `SELECT l.id FROM credit_lots l LEFT JOIN ledger g ON g.lot_id = l.id WHERE l.status <> 'refunding' GROUP BY l.id HAVING l.units_left <> COALESCE(SUM(CASE g.kind WHEN 'grant' THEN g.units WHEN 'restore' THEN g.units WHEN 'reserve' THEN -g.units WHEN 'refund' THEN -g.units WHEN 'expire' THEN -g.units ELSE 0 END), 0)`
- Weekly (spec 14, default 6): paid, unopened, after a failed opening. Contact or refund them.
  `SELECT DISTINCT o.id, o.created_at FROM orders o JOIN credit_lots l ON l.order_id = o.id JOIN unlocks u ON u.user_id = o.user_id AND u.status = 'released' AND u.product_id = o.product_id WHERE o.status = 'paid' AND l.units_left = l.units_total`
- Sales per KST day:
  `SELECT date(created_at/1000, 'unixepoch', '+9 hours') AS day, COUNT(*) AS n, SUM(amount_krw) AS krw FROM orders WHERE status IN ('paid','refunded') GROUP BY day ORDER BY day DESC LIMIT 14`
- Paid-reading model cost: Workers logs, `evt` = `cost.paid` (usd per generation).

## 8. Refunds by hand

Cancel in the Toss dashboard. The webhook applies it; if not, open the user's 내 정보, which reconciles after a minute. Never edit D1 rows by hand.

## 9. Roll back

`npx wrangler secret put STARLOG_PAYMENTS` → `off`. New sales, logins and gifts stop. Purchases and 별조각 already held still open and still refund.

## 10. Do not

- Rotate STARLOG_ACCOUNT_SECRET: accounts and saved readings become unreachable.
- Rotate STARLOG_SIGNING_SECRET without warning: everyone is logged out and tokens die.
- Mix test and live Toss keys (refused anyway).
- Set STARLOG_PAY=mock or STARLOG_KAKAO=mock in production (refused).

## Follow-ups (not in P4)

Kakao 연결 끊기 알림 callback (needs the admin key), 달빛 packs, premium generators (P5), cash receipts if 계좌이체 is ever enabled.
````

- [ ] **Step 5: Verify (controller)**

Run: `npx vitest run --maxWorkers=3`
Expected: every file passes.

Run: `pnpm typecheck`
Expected: exit 0.

Run: `pnpm --filter @starlog/web e2e`
Expected:
- the beta specs pass unchanged (they do not hold the owner pass, so they see the beta);
- pay-flow passes 2 tests in each project it runs in.

Run: `pnpm build && pnpm check:bundle`
Expected: `0 hits`.

Run: `pnpm cf:build`
Expected: success. Report the Worker gzip size against the 3 MiB limit (it was 2.15 MiB before P4).

- [ ] **Step 6: Commit**

```bash
git add scripts/check-client-bundle.mjs apps/web/playwright.config.ts apps/web/e2e/global-setup.ts apps/web/e2e/pay-flow.spec.ts apps/web/package.json apps/web/.env.example docs/runbook-payments.md
git commit -m "test(pay): secret probes in the bundle check, owner-mode e2e pay flow, payments runbook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review against the spec

| Spec | Where |
|---|---|
| 2 scope: login, sessions, logout, deletion | Tasks 3, 5, 12 |
| 2 scope: one ledger, paid and free units | Task 4 |
| 2 scope: item-by-item 2,900원; gift | Tasks 2, 7, 5 |
| 2 scope: Toss widget v2, confirm, idempotency, webhook, cancel | Tasks 6, 7, 8, 16 |
| 2 scope: streaming + money safety | Tasks 9, 10 |
| 2 scope: account storage and claim | Tasks 9, 11, 17 |
| 2 scope: 내 정보 | Task 17 |
| 2 scope: premium catalog without sales | Task 2 (`deliverable: false`), Task 7 (409) |
| 2 scope: legal pages, 청약철회 notice | Tasks 16, 18 |
| 2 scope: local D1, mocks, rollout | Tasks 1, 6, 19 |
| 4 P3 coexistence (D1 types, 0002, sl_uid, namespaces, order) | Tasks 0, 1, 3, 13 |
| 5.1 login | Task 5 (+15 UI) |
| 5.2 checkout | Tasks 7, 16 |
| 5.3 confirm | Task 7 |
| 5.4 unlock and invariants 1–7 | Tasks 4, 9, 10 (invariant check in the ledger suite and the runbook) |
| 5.5 refunds | Task 8 (+17 UI) |
| 5.6 webhook | Task 8 |
| 5.7 account copies, claim | Tasks 9, 11, 17 |
| 5.8 deletion | Tasks 12, 13 |
| 6 legal | Task 18 |
| 7 schema | Task 1 |
| 8 API and error codes | Tasks 3, 5, 7, 8, 10, 11, 12 |
| 9 screens | Tasks 14–17 |
| 10 security | Tasks 2, 3, 5, 6, 7, 8, 19 |
| 11 costs | the spec only (no code) |
| 12 flags and rollout | Tasks 2, 10, 19 (runbook) |
| 13 local dev and tests | Tasks 1, 5, 19 |

Type names used across tasks:
- `D1Binding`, `D1Statement` (P3);
- `AccountContext`, `Session`, `UserRow`;
- `Lot`, `Allocation`, `WalletSummary`;
- `TossClient`, `TossPayment`, `TossError`;
- `OrderRow`, `OrderListItem`;
- `ServerChapter`, `ReadingSource`;
- `Settlement`, `UnlockPlan`, `UnlockMethod`, `UnlockOffer`;
- `AccountState`, `AccountUser`.
Each one is defined once (in the task that creates it) and used with the same signature afterwards.
