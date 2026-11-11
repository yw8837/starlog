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
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google login under Kakao's. Console setup, the consent screen's Testing → In production step before launch, and checks: docs/runbook-google-login.md.
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY` and `TOSS_SECRET_KEY`: both test_ keys first. A mixed test/live pair is refused (503).
  - `STARLOG_PAYMENTS`: `off` (dark), `owner`, `on`, `paused` (rollback).
  - `REVIEW_LOGIN_ID`, `REVIEW_LOGIN_PASSWORD`: only for the card-company review (section 4). Unset = off (404).

## 2. Deploy dark

1. `pnpm db:migrate:remote` → 0002_accounts_payments.sql applied, no error.
2. From the repo root: `pnpm deploy` (cf:build, `check:worker-env`, then OpenNext deploy; `wrangler.jsonc` `main` is `worker.mjs`, which wraps `.open-next/worker.js` and adds the cron). If OpenNext's deploy refuses the custom `main`, run `pnpm cf:build` and `pnpm check:worker-env`, then `npx wrangler deploy` from apps/web.
3. `curl -s https://starlog.yeolmaeapps.kr/api/me` → `{"payments":false,"login":false,"owner":false,"user":null}`; `/login` is 404. The site is unchanged.
4. Cron: the Cloudflare dashboard (Workers > starlog > Triggers) lists `*/10 * * * *`. `npx wrangler tail` shows `cron.maintenance` every 10 minutes; none is `cron.no_secret` or `cron.maintenance_failed`.

## 3. Owner check in production (test keys)

`npx wrangler secret put STARLOG_PAYMENTS` → `owner`. While a production deploy runs test keys, sales, sign-up and login stay owner-only even if STARLOG_PAYMENTS says `on` (a test payment charges nobody). On the owner-pass browser:

- [ ] result page shows `로그인하고 전체 풀이 보기`; another browser still shows the 첫 이용 무료 sheet (tarot; saju offers no free reading)
- [ ] Kakao login (real) → back with login=ok; 내 정보 shows the nickname and 가입 선물 · 타로 전체 풀이 무료 with its last day
- [ ] the first account request wrote `meta.account_secret_check` (`SELECT key FROM meta`)
- [ ] `가입 선물로 무료로 보기` opens the tarot reading; 내 정보 says 가입 선물 사용했어요; the reading shows on another device after login; a saju sheet offers only `4,900원 결제하고 보기`
- [ ] test payment 2,900원 (test card) → reading opens by itself; 결제 내역 shows it with 영수증 보기
- [ ] pay in the KakaoTalk in-app browser, finish in the card app, come back in another browser: the success page says 결제했어요 and 로그인하고 풀이 열기 opens it
- [ ] buy another, leave it unopened → 환불받기 → Toss dashboard shows it cancelled; status 환불됨
- [ ] cancel a payment in the Toss dashboard → webhook → order 환불됨 within a minute
- [ ] 이어서 물어보기 on a paid reading → the answer also appears on another device
- [ ] turn on airplane mode during a paid generation → the page says 풀이가 열렸는지 확인하고 있어요, then either opens the reading or shows the purchase as still unopened (never both)
- [ ] 회원 탈퇴 with an unopened purchase → refunded, logged out, /me says 탈퇴했어요
- [ ] `pnpm check:bundle` on the deployed build: 0 hits
- [ ] `SELECT mode FROM payments` shows `test` for every payment above
- [ ] Before 12/1 (the set's first day): a partial cancel on the Toss TEST keys with each payment method the widget enables (the card and each 간편결제 it shows). For each: buy a set, open one reading, 환불받기 → the screen says 4,000원 (or 11,000원) 환불했어요, the Toss test dashboard shows 부분 취소 of exactly that amount, and 결제 내역 says 일부 환불. Toss restricts partial cancels for some payments (a card payment with a tax-free amount, 가상계좌, 휴대폰): if a method refuses (`pay.refund_refused` in the logs, the set's reading back as it was), turn that method off before 12/1 or settle its set refunds by hand (section 8).

## 4. Toss review

Apply for the live contract. The site already shows /pricing (products with picture, description, price and 서비스 제공 기간), /refund (unopened: refundable for 7 days from the payment date), /terms, /privacy, the business footer, and the checkout with the 청약철회 and minor notices. Follow the Toss sales contact's checklist.

Reviewer login (Toss refuses Kakao/Google test accounts):
1. `npx wrangler secret put REVIEW_LOGIN_ID` and `npx wrangler secret put REVIEW_LOGIN_PASSWORD` (a long random password, 20 characters at least or the login stays off; this makes 22: `node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"`). Both set turns https://starlog.yeolmaeapps.kr/login/review on while STARLOG_PAYMENTS is `owner` or `on` (404 when `off` or `paused`); it is linked nowhere and noindex.
2. Give Toss that URL with the ID and password, and ask the reviewers to use sample birth data: the account is shared, so everyone with the login sees its saved readings. It is one account per ID and password (닉네임 심사용 계정, no signup gift). It may pay on the test keys like the owner pass, so a reviewer reaches the Toss window from a result page's `2,900원 결제하고 보기` (at most 3 unopened purchases at a time); premium stays closed to it.
3. Five wrong tries from one network shut that network out for 15 minutes; any network gets at most 5 tries a minute. 50 wrong tries from all networks within an hour log `auth.review_failures_alert` (alert only: nothing locks for everyone, so nobody can lock the reviewers out).
4. After the review, first log in at /login/review and 회원 탈퇴 from 내 정보 (it refunds the unopened test purchases and erases the account and its readings; no Kakao re-check). Then `npx wrangler secret delete REVIEW_LOGIN_PASSWORD` and `npx wrangler secret delete REVIEW_LOGIN_ID`: the page and API answer 404 again, and a session still open loses the sales and every opening right away. Such a session can still 회원 탈퇴 (no Kakao re-check), but nobody can log in to the account again.
5. If the login leaks: delete either secret (sales and openings stop for every review session at once), or set a new password (a new review account; sessions on the old one lose the sales and every opening). Until then a leaked login can buy with test cards, but on a production deploy running test keys a paid opening is held to BETA_DAILY_BUDGET_KRW and the network's daily cap and counted like a free full reading, and a review account holds at most 3 unopened purchases at a time. To end the review sessions and their active test purchases too, look first, then revoke both, then look again (both counts 0). It hits every review account, a new one included, so run it before handing out new credentials:
   `SELECT u.id, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > strftime('%s','now')*1000) AS live_sessions, (SELECT COUNT(*) FROM credit_lots l WHERE l.user_id = u.id AND l.currency = 'paid' AND l.status = 'active') AS active_paid_lots FROM users u WHERE u.kakao_key LIKE 'review:%'`
   `UPDATE sessions SET revoked_at = strftime('%s','now')*1000 WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE kakao_key LIKE 'review:%')`
   `UPDATE credit_lots SET status = 'revoked' WHERE status = 'active' AND currency = 'paid' AND user_id IN (SELECT id FROM users WHERE kakao_key LIKE 'review:%')`

## 5. Live keys

1. Refund every test-mode order first (minor 12): live keys cannot cancel test payments.
   `SELECT o.id FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'test' AND o.status = 'paid'`
   Refund each from the owner's 내 정보 while the test keys are still in place. Wait until none is still settling (the cron finishes a lost answer within 10 minutes):
   `SELECT o.id FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'test' AND o.status = 'refunding'` → empty.
2. Revoke whatever test-mode purchase is still active (opened, or not refundable), right before the key swap:
   `UPDATE credit_lots SET status = 'revoked' WHERE status = 'active' AND currency = 'paid' AND order_id IN (SELECT order_id FROM payments WHERE mode = 'test')`
   The code already refuses them once live keys are in: a paid reading is opened only from a payment made under the deploy's own keys, and a test payment is never sent to Toss with live keys (`pay.other_keys` in the logs; 환불받기 asks the buyer to contact us; 회원 탈퇴 revokes its reading and completes). Anything left: `SELECT o.id, o.status FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode <> 'live' AND o.status IN ('paid','refunding')`. Settle it in the Toss test dashboard; no real money moved.
3. `npx wrangler secret put NEXT_PUBLIC_TOSS_CLIENT_KEY` (live_gck_…) and `npx wrangler secret put TOSS_SECRET_KEY` (live_gsk_…), one right after the other.
4. Check the webhook for the live MID (section 1).
5. Still in owner mode: one real 2,900원 purchase opened, one real purchase refunded.

## 6. Switch on

After LEGAL_EFFECTIVE_DATE (lib/legal.ts; the changed terms are announced 7 days before):
`npx wrangler secret put STARLOG_PAYMENTS` → `on`. 첫 이용 무료 (each device's one free tarot full reading) ends; the signup gift starts. Saju full readings were never free after 2026-10-14.
For the first 24 h, run the checks in section 7 every two hours.

## 7. Checks

- Orders the cron has not settled (should be empty). It looks again every 10 minutes, at most 30 Toss calls and 75 s of Toss work per run, oldest first; an order it cannot decide (failed look-up, stuck orphan, partial cancel) moves behind the others, so `updated_at` is only its last look. Read `cron.*_failed`, `pay.orphan_refund_stuck` and `pay.partial_cancel` in the logs with this (a refund started in the last 10 minutes can show too):
  `SELECT id, status, fail_code, cancel_attempt, created_at, updated_at FROM orders WHERE status IN ('confirming','refunding') AND created_at < strftime('%s','now')*1000 - 86400000`
- Orders left `created` for an hour are closed by the cron (`fail_code = 'ABANDONED'`); nothing was charged.
- Refund lock pairs out of step (M1; both must be empty). A set refunding one reading's part keeps the other lot `active` while its order is `refunding`; that is in step, so the second query looks for a refund with nothing locked:
  `SELECT l.id, l.order_id, o.status FROM credit_lots l JOIN orders o ON o.id = l.order_id WHERE l.status = 'refunding' AND o.status <> 'refunding'`
  `SELECT o.id FROM orders o WHERE o.status = 'refunding' AND COALESCE(o.fail_code, '') <> 'ACCOUNT_DELETED' AND NOT EXISTS (SELECT 1 FROM credit_lots l WHERE l.order_id = o.id AND l.status = 'refunding')`
- Payments for deleted accounts the cron could not cancel (`pay.orphan_refund_stuck` in the logs): cancel them in the Toss dashboard; the webhook records it.
  `SELECT id, cancel_attempt FROM orders WHERE status = 'refunding' AND fail_code = 'ACCOUNT_DELETED' AND cancel_attempt >= 5`
- Partial cancellations. A set refunded in part by the app (`pay.refunded_part` in the logs) is in order: its order is `paid` again, `payments.status = 'PARTIAL_CANCELED'` with `canceled_amount` 4000 or 11000, the refunded reading's lot `refunded` and the opened one `active`. Only `pay.partial_cancel` (a partial cancel the app did not ask for, such as one from the dashboard) needs a person: decide by hand whether the reading stays; contact the buyer. So do `pay.refund_amount_mismatch` (a set's part was not sent: Toss holds another amount cancelled than the refund expects; the reading is back as it was) and `account.delete_unrefundable_lot` (a deleted account's unopened reading that refunded 0원 and left use): compare the Toss dashboard with `payments.canceled_amount`. All of them:
  `SELECT p.order_id, o.product_id, o.status, p.canceled_amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'PARTIAL_CANCELED'`
- Reservations nobody settled (the cron sweeps them; should stay near 0):
  `SELECT COUNT(*) AS n FROM unlocks WHERE status = 'reserved' AND reserved_until < strftime('%s','now')*1000 - 600000`
- Deletions not erased (the cron finishes them; should be empty):
  `SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL AND deleted_at < strftime('%s','now')*1000 - 1800000`
- Sets (2027 신년운세 + 프리미엄 궁합, `set-2027`, migration 0023): one order holds two lots, one per reading (UNIQUE(order_id, product_id)); every query above that joins lots to orders may return a set order twice. Refunds within 7 days (owner 2026-11-10, 전자상거래법 제17조 제2항 제5호 단서): neither reading opened → 18,900원 whole; one opened (or being opened, or cut off while written) → the unopened one's part, 18,900 − the opened one's single price (신년운세 opened → 4,000원, 궁합 opened → 11,000원), its lot refunded and the opened one kept; both opened → nothing. The amounts come from the catalog (`lib/pay/catalog.ts` refundAmount), never from a request. A manual revoke by `order_id` covers both lots. Check no order holds two lots of one product (must be empty):
  `SELECT order_id, product_id, COUNT(*) AS n FROM credit_lots WHERE order_id IS NOT NULL GROUP BY order_id, product_id HAVING n > 1`
- Lot invariant (must be empty):
  `SELECT l.id FROM credit_lots l LEFT JOIN ledger g ON g.lot_id = l.id WHERE l.status <> 'refunding' GROUP BY l.id HAVING l.units_left <> COALESCE(SUM(CASE g.kind WHEN 'grant' THEN g.units WHEN 'restore' THEN g.units WHEN 'reserve' THEN -g.units WHEN 'refund' THEN -g.units WHEN 'expire' THEN -g.units ELSE 0 END), 0)`
- Weekly (spec 14, default 6): paid, unopened, after a failed opening. Contact or refund them.
  `SELECT DISTINCT o.id, o.created_at FROM orders o JOIN credit_lots l ON l.order_id = o.id JOIN unlocks u ON u.user_id = o.user_id AND u.status = 'released' AND u.product_id = l.product_id WHERE o.status = 'paid' AND l.units_left = l.units_total` (by the lot's product: a set order is `set-2027`, its lots `newyear-2027` and `match`)
- Sales per KST day, live payments only (minor 12):
  `SELECT date(o.created_at/1000, 'unixepoch', '+9 hours') AS day, COUNT(*) AS n, SUM(o.amount_krw) AS krw FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'live' AND o.status IN ('paid','refunded') GROUP BY day ORDER BY day DESC LIMIT 14`
  With Google Play sales (the Android app, section 11) counted too, Play purchases that were not real sales (a license tester's test, a promo code, rewarded: `play_purchases.purchase_type` set) left out (amounts are the catalog price, before Google's service fee):
  `SELECT date(o.created_at/1000, 'unixepoch', '+9 hours') AS day, COUNT(*) AS n, SUM(o.amount_krw) AS krw FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode IN ('live','play') AND o.status IN ('paid','refunded') AND NOT EXISTS (SELECT 1 FROM play_purchases pp WHERE pp.order_id = o.id AND pp.purchase_type IS NOT NULL) GROUP BY day ORDER BY day DESC LIMIT 14`
- Paid-reading model cost: DAILY_KV keys `paidcost:<YYYY-MM-DD>:<0-7>` (sum the eight shards of a day). The free-tier total stays in `cost:`: at 80% of BETA_DAILY_BUDGET_KRW it closes free full readings, at twice that every free generation (teasers too); paid readings, their follow-ups and the owner pass never close on the budget; while cost writes fail ("lagging") or the total cannot be read, every free generation closes, and a paid follow-up also stops while KV cannot be read (its chapter count) (table: `lib/api/http.ts` checkServerLimits).

## 8. Refunds by hand

Never edit D1 rows by hand. The single documented exception is the SQL written out in this section, run exactly as given and nothing else: a set's unopened part by hand, and a bank refund past the card cancel window.

- Any refund outside the 환불받기 button: cancel in the Toss dashboard. The webhook applies it (an opened reading's lot is revoked). If the webhook is missed, the cron settles it within 10 minutes.
- A set's unopened part by hand (the buyer cannot use 환불받기, e.g. past the window but owed for a failure on our side). Prefer the buyer's own 환불받기 or account deletion, which do all of this themselves. Otherwise, in this order:
  1. Look: `SELECT l.id, l.product_id, l.status, l.units_left, l.units_total, o.status AS order_status, p.canceled_amount FROM credit_lots l JOIN orders o ON o.id = l.order_id LEFT JOIN payments p ON p.order_id = o.id WHERE o.id = '<id>'`. The unopened lot is `active` with `units_left = units_total`; the opened one has `units_left = 0` (or is mid-opening: wait until no `reserved` unlock holds it). If both are opened, there is no refund.
  2. Amount: 18,900 − the opened reading's single price − `canceled_amount` (신년운세 opened → 4,000원, 궁합 opened → 11,000원). The single prices are today's catalog prices (`lib/pay/catalog.ts`): the order stores only its total (section 10).
  3. Lock the unopened lot FIRST, so nobody opens it while its money goes back: `UPDATE credit_lots SET units_left = 0, status = 'refunding' WHERE id = '<unopened lot id>' AND status = 'active' AND units_left = units_total`. The output must say exactly 1 row changed (`"changes": 1`). 0 → stop: it was opened or locked meanwhile; look again (step 1). Until step 5 (or the revert), the first M1 check in section 7 lists this lot; that is expected.
  4. Toss dashboard → the payment → 부분 취소 with exactly that amount. If Toss refuses or the cancel fails, put the lot back and check exactly 1 row changed: `UPDATE credit_lots SET units_left = units_total, status = 'active' WHERE id = '<unopened lot id>' AND status = 'refunding'`. If you cannot tell whether Toss cancelled (an error page, a timeout), look the payment up in the dashboard first, and never send a second 부분 취소 before you know.
  5. Toss shows the partial cancel. The webhook records it in the payment row and logs `pay.partial_cancel` (expected here: the app did not ask for it). Check `SELECT status, canceled_amount FROM payments WHERE order_id = '<id>'` says `PARTIAL_CANCELED` and the earlier amount plus this one. Then book the refund, both in one `--command` separated by `;`: `INSERT INTO ledger (user_id, currency, kind, units, lot_id, order_id, idem_key, created_at) SELECT user_id, currency, 'refund', units_total, id, order_id, 'refund:' || id, <ms> FROM credit_lots WHERE id = '<unopened lot id>' AND status = 'refunding'; UPDATE credit_lots SET status = 'refunded' WHERE id = '<unopened lot id>' AND status = 'refunding'`. The lot ends `refunded`, never `revoked`: the app counts a `revoked` lot as a reading kept (`lib/pay/ledger.ts` KEPT_WHERE and refundTarget), so a later refund of the other reading would come out wrong. Note the order id in the refund log.
- Card cancel window over (minor 14): Toss refuses the cancel. Ask the buyer for a bank account in their own name, transfer the amount, then record it: cancel in the Toss dashboard is not possible, so note the order id and the transfer in the refund log, and run `UPDATE orders SET status = 'refunded', fail_code = 'BANK_REFUND', updated_at = <ms> WHERE id = '<id>' AND status = 'paid'` together with the lot: `UPDATE credit_lots SET status = 'revoked' WHERE order_id = '<id>'` (both in one `--command` separated by `;`).
- A guardian cancels a minor's purchase (M7; 민법 제5조): ask for the minor's order id(s) or payment date and amount, and a document showing guardianship (가족관계증명서 or similar; do not keep a copy longer than needed). Cancel each payment in the Toss dashboard, opened or not; the webhook records it and revokes the lot. Reply within 3 business days.

## 9. Roll back

`npx wrangler secret put STARLOG_PAYMENTS` → `paused`. New sales, new accounts and gifts stop, and 첫 이용 무료 (tarot) comes back. Existing accounts can still log in to open, refund or delete what they hold. Use `off` only before launch: it also closes login.

Sets (from 2026-12-01): never roll the code back below the commit that added this paragraph (`git log --format=%h -S "never roll the code back" -- docs/runbook-payments.md`) while any set order exists (`SELECT COUNT(*) AS n FROM orders WHERE product_id = 'set-2027' AND status <> 'created'`): older code refunds a set only whole and reads a set with one reading opened as not refundable, against the rule in force. Turn set sales off first (there is no set-only switch: `STARLOG_PREMIUM` → `owner` stops every premium sale, the set included; `STARLOG_PAYMENTS` → `paused` stops all sales), wait until no set order is `refunding`, and only then deploy older code.

Migration 0023 (the set's two lots per order) rebuilds `credit_lots`. Before applying it to production, back up D1: `npx wrangler d1 time-travel info starlog` (note the bookmark) and `npx wrangler d1 export starlog --remote --output=starlog-before-0023.sql`. After `npm run db:migrate:remote`, check the new index exists (one row): `npx wrangler d1 execute starlog --remote --command "SELECT name FROM sqlite_master WHERE name='credit_lots_order_product'"`, and that no lot was lost (the same count as before). Without it, a set payment cannot be recorded: `pay.mark_paid_failed` in the logs, and the order stays unconfirmed until the migration is applied.

## 10. Do not

- Rotate STARLOG_ACCOUNT_SECRET: D1 refuses the new one (503 on every account route); accounts and saved readings would become unreachable.
- Rotate STARLOG_SIGNING_SECRET without warning: everyone is logged out and tokens die.
- Mix test and live Toss keys (refused anyway).
- Set STARLOG_PAY=mock, STARLOG_KAKAO=mock or STARLOG_GOOGLE=mock in production (refused).
- Delete the Cron Trigger: stale payments, refunds, erasures and purges depend on it.
- Change the single price of 2027 신년운세 or 프리미엄 궁합 (`SITE.price`) while a set order is inside its 7-day refund window (`SELECT COUNT(*) AS n FROM orders WHERE product_id = 'set-2027' AND status = 'paid' AND created_at > strftime('%s','now')*1000 - 8*86400000`). A set's part refund is the order's total less the single price of the reading kept, and that single price is read from today's catalog: the order stores only its total (18,900원), not the prices of its readings at purchase. A changed price changes what an earlier set refunds (and its target, so a refund in flight would be read wrongly).

## 11. Google Play purchases (the Android app)

Plan: docs/superpowers/plans/2026-11-11-starlog-android-app.md. In the app (its WebView adds ` StarlogApp/<version>` to the user agent) readings are paid with Google Play billing; the web keeps Toss. Code: `lib/pay/play.ts` (Google's API), `lib/pay/playOrders.ts`, `POST /api/pay/play/verify`.

Setup (owner, once):
1. Google Cloud console (any project you own): enable the Google Play Android Developer API, create a service account, and add a JSON key to it (Keys → Add key → JSON). The downloaded file is the secret: never in the repo, chat or a log.
2. Play Console → Users and permissions → Invite new users → the service account's email, with the permissions "View financial data, orders, and cancellation survey responses" and "Manage orders and subscriptions".
3. One-time products with the ids `tarot`, `saju`, `tarot_deep`, `match`, `newyear_2027`, `set_2027` (the web ids with `-` → `_`), each at its price in `lib/pay/catalog.ts` (Play's price must match the one shown in the app).
4. `npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON` → paste the whole JSON file as one line. Only if the package is not `kr.yeolmaeapps.starlog`: `npx wrangler secret put PLAY_PACKAGE_NAME`. Without the first, the app's checkout answers 503 (PAY_UNAVAILABLE) and the cron skips its Play steps; one that is there but unreadable logs `config.play_invalid` with names only. Never set `STARLOG_PLAY=mock` in production (refused the same way).

Migration 0024 (`payments.mode` may be `play`, and the `play_purchases` table) rebuilds `payments`. Before applying it to production, back up D1 as for 0023 (section 9): `npx wrangler d1 time-travel info starlog` (note the bookmark) and `npx wrangler d1 export starlog --remote --output=starlog-before-0024.sql`, and note `SELECT COUNT(*) AS n FROM payments`. After `npm run db:migrate:remote`: the same count, and `npx wrangler d1 execute starlog --remote --command "SELECT name FROM sqlite_master WHERE name IN ('play_purchases','play_purchases_unconsumed')"` gives two rows. Apply it BEFORE the deploy of this code: account deletion and writing a review read `play_purchases` for every account, Play or not, and fail without it.

How a purchase is recorded:
- The app's order (`POST /api/pay/orders` from the app) also answers `play: {productId, accountTag}`; the app buys with obfuscatedAccountId = accountTag (the sha256 hex of the user id) and obfuscatedProfileId = the order id.
- The app sends the purchase token to `POST /api/pay/play/verify` (and every unfinished purchase again when it starts). The server asks Google: only a purchase Google says is purchased, for that order's product and account, bought once (quantity 1), for an order not paid yet, is recorded, in one batch: the order `paid`; a `payments` row (`payment_key = play_<sha256 of the token>`, `method = 'Google Play'`, `mode = 'play'`, no receipt URL); a `play_purchases` row (the token, Google's order id GPA.…, `purchase_type`: empty for a real purchase, 0 a license tester's test, 1 a promo code, 2 rewarded); the lots, as for Toss. Then the purchase is consumed (Google refunds one never consumed within 3 days); a failed consume is retried by the cron. A pending purchase waits. A token seen before answers by its order as it is now: paid, being refunded (pending) or refunded ("이미 환불된 결제예요.").
- A purchase Google says is purchased that we do not grant (another account's, another product's, no order of ours, more than one, a second purchase for an order already paid) is refunded and revoked at once (orders.refund), as Google asks, and nothing is recorded: the app is told "결제를 확인하지 못해 환불했어요. 다시 시도해 주세요." (`pay.play_mismatch`, then `pay.play_rejected_refunded`). If that refund fails (`pay.play_rejected_refund_failed`, an error) or Google gave no order id, Google's own refund of a purchase never consumed (3 days) is the fallback. A token Google refuses outright (malformed or forged, a 4xx) is answered BAD_REQUEST (`pay.play_bad_token`, a warning).
- A Play lot opens readings under any Toss keys, test or live: Google vouched for it. Purchases that are not real sales (`purchase_type` set: license testers' tests, promo codes, rewarded) are recorded and open readings like real ones (only accounts the owner named in Play Console make test purchases), but their readings take no public review, as a Toss test payment's.
- A purchase arriving for a deleted account is recorded `refunding` + `ACCOUNT_DELETED` (`pay.play_for_deleted_account`), never granted nor consumed, and refunded at once: the order `refunded`. If that refund fails, Google refunds it within 3 days and the cron closes the order `refunded`.
- Logs: `pay.paid` with `mode: play`; `pay.play_mismatch`, `pay.play_rejected_refunded`, `pay.play_rejected_refund_failed`, `pay.play_bad_token` (above); `pay.play_verify_refused` (Google refused our credentials: check the secret and the permissions in step 2); `pay.play_verify_unknown`, `pay.play_unknown_token` (asked again later); `pay.play_consume_failed`; `pay.play_voided`; `pay.play_refund_unknown`, `pay.play_refund_refused`, `pay.play_refund_reverted`, `pay.play_refund_stuck`, `account.delete_play_set_aside` (refunds, below); `cron.play_consume_failed`, `cron.play_voided_failed`, `cron.play_refund_failed`. Purchase tokens are never logged (a 12-character prefix of their sha256 at most).

Refunds:
- 환불받기 on an unopened Play purchase, within the same 7 days as Toss, refunds it through Google's API: orders.refund with revoke=true, by Google's order id (`play_purchases.google_order_id`, GPA.…), the whole order (the permission "Manage orders and subscriptions", step 2, covers refunds). The reading is locked first, as for Toss; done → the order `refunded`, its lots `refunded`, `payments.status = 'CANCELED'`, `play_purchases.voided_at` set (`pay.refunded`). Google's answer lost (`pay.play_refund_unknown`) → the order stays `refunding` and the reading cannot be opened: Google's voided list closes it, or 10 minutes on the cron asks Google about the purchase: still purchased → the reading comes back (`pay.play_refund_reverted`), canceled → refunded. Google refusing (`pay.play_refund_refused` with its status; an error when it refused our credentials, 401/403) → the reading comes back at once and the buyer is told to contact us.
- A refund the cron cannot decide (no answer, Google no longer knows the token, still pending) is never guessed: it moves behind the others, its reading stays locked, and once an hour has passed since the refund was sent (`play_purchases.refund_sent_at`) every look logs `pay.play_refund_stuck` (an error). Look the order up in Play Console by `play_purchases.google_order_id`: refunded there → Google's voided list closes it here once Google lists it; not refunded → the buyer asked for this refund: refund it in Play Console. If it still does not close, a developer looks (D1 is not edited by hand). A 회원 탈퇴 no longer waits for a stuck refund: its reading leaves use (revoked, not given back) and its order goes back to `paid` for you (`account.delete_play_set_aside`), listed by the deleted accounts' query below.
- A set with one reading opened: Google's API refunds an order whole only, so 환불받기 answers "세트 중 하나를 이미 열어서 앱에서는 바로 환불할 수 없어요. …" and changes nothing. Its unopened reading's part (section 8's amount: 18,900 − the opened reading's single price) goes by hand. Google's help says partial refunds are available for in-app purchases, entered as "a percentage (less than 100%) or pre-tax amount (less than the order total)" on Manage account > Play apps order management (support.google.com/googleplay/android-developer/answer/2741495): verify in Play Console, before confirming, that the buyer receives exactly that amount. In order: section 8's "A set's unopened part by hand" steps 1 to 3 (look, amount, lock the unopened lot), the partial refund in Play Console, then only the two statements of its step 5 (the ledger row and the lot `refunded`). Google lists only revoked purchases as voided, so nothing records a partial refund in `payments` (결제 내역 shows no 일부 환불): note the order id and the amount in the refund log.
- Any other refund by hand in Play Console: Google's help describes "Refund and revoke" for subscriptions only, and says nothing of revoking an in-app purchase there: verify in Play Console. A refund without revoke never reaches the voided list, so the order stays `paid` here with its reading usable; prefer the buyer's own 환불받기 (which revokes), and note any Play Console refund in the refund log.
- The cron (every 10 minutes) reads Google's voided purchases since its last run (an hour of overlap; `meta.play_voided_since`) and applies each like a whole cancel in the Toss dashboard: an unopened reading's lot `refunded`, an opened one `revoked`, the order `refunded`, `payments.status = 'CANCELED'`. A refund shows within about 10 minutes. Google keeps 30 days of voided purchases: a cron stopped longer misses the older ones.
- 회원 탈퇴 refunds an unopened Play purchase through Google the same way (at any time, as for Toss); while Google's answer is unknown the deletion answers pending (try again after the cron settled it; after an hour the stuck rule above lets it through). Without the Play secret, when Google refuses, or for a set with one reading opened, the reading leaves use (revoked), the order stays `paid` (`account.delete_play_set_aside`) and the deletion completes: its money is NOT refunded by itself, refund it by hand in Play Console (above). They are listed by:
  `SELECT o.id, o.created_at FROM orders o JOIN payments p ON p.order_id = o.id JOIN users u ON u.id = o.user_id WHERE p.mode = 'play' AND o.status = 'paid' AND u.deleted_at IS NOT NULL`

Checks:
- Granted but not consumed after a day (should be empty; Google refunds them after 3 days; read `pay.play_consume_failed`). The cron asks Google before each consume (consumed already → only recorded; canceled → left to the voided list) and tries the least recently tried first (`consume_tried_at`), at most 4 a run, so one that keeps failing never blocks newer ones:
  `SELECT pp.order_id, pp.created_at FROM play_purchases pp JOIN orders o ON o.id = pp.order_id WHERE pp.consumed_at IS NULL AND pp.voided_at IS NULL AND o.status = 'paid' AND pp.created_at < strftime('%s','now')*1000 - 86400000`
- Deleted accounts' Play purchases whose immediate refund failed, waiting for Google's own refund (the cron closes each within 3 days and 10 minutes; an older one needs a look in Play Console):
  `SELECT o.id, o.updated_at FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'play' AND o.status = 'refunding' AND o.fail_code = 'ACCOUNT_DELETED'`
- Play refunds still settling (the cron settles each within about 20 minutes; one older than an hour is stuck: `pay.play_refund_stuck`, above; read `pay.play_refund_unknown`, check the secret and the permissions):
  `SELECT o.id, o.updated_at FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.mode = 'play' AND o.status = 'refunding' AND COALESCE(o.fail_code, '') <> 'ACCOUNT_DELETED'`
- Payments by kind: `SELECT mode, COUNT(*) FROM payments GROUP BY mode`. Sales per KST day with Play: section 7.

## Follow-ups (not in P4)

Kakao 연결 끊기 알림 callback (needs the admin key), premium generators (P5), cash receipts if 계좌이체 is ever enabled, moving the device's earlier readings into an account (cut from P4), the P3 인연 link (cut from P4), a second reading-key version if the account secret must ever change.
