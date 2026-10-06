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
  - `REVIEW_LOGIN_ID`, `REVIEW_LOGIN_PASSWORD`: only for the card-company review (section 4). Unset = off (404).

## 2. Deploy dark

1. `pnpm db:migrate:remote` → 0002_accounts_payments.sql applied, no error.
2. From the repo root: `pnpm deploy` (cf:build then OpenNext deploy; `wrangler.jsonc` `main` is `worker.mjs`, which wraps `.open-next/worker.js` and adds the cron). If OpenNext's deploy refuses the custom `main`, run `pnpm cf:build` and then `npx wrangler deploy` from apps/web.
3. `curl -s https://starlog.yeolmaeapps.kr/api/me` → `{"payments":false,"login":false,"owner":false,"user":null}`; `/login` is 404. The site is unchanged.
4. Cron: the Cloudflare dashboard (Workers > starlog > Triggers) lists `*/10 * * * *`. `npx wrangler tail` shows `cron.maintenance` every 10 minutes; none is `cron.no_secret` or `cron.maintenance_failed`.

## 3. Owner check in production (test keys)

`npx wrangler secret put STARLOG_PAYMENTS` → `owner`. While a production deploy runs test keys, sales, sign-up and login stay owner-only even if STARLOG_PAYMENTS says `on` (a test payment charges nobody). On the owner-pass browser:

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

Apply for the live contract. The site already shows /pricing (products with picture, description, price and 서비스 제공 기간), /refund (unopened: refundable for 7 days from the payment date), /terms, /privacy, the business footer, and the checkout with the 청약철회 and minor notices. Follow the Toss sales contact's checklist.

Reviewer login (Toss refuses Kakao/Google test accounts):
1. `npx wrangler secret put REVIEW_LOGIN_ID` and `npx wrangler secret put REVIEW_LOGIN_PASSWORD` (a long random password: `node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"`). Both set turns https://starlog.yeolmaeapps.kr/login/review on; it is linked nowhere and noindex.
2. Give Toss that URL with the ID and password, and ask the reviewers to use sample birth data: the account is shared, so everyone with the login sees its saved readings. It is one account per ID and password (닉네임 심사용 계정, no 별조각). It may pay on the test keys like the owner pass, so a reviewer reaches the Toss window from a result page's `2,900원 결제하고 보기`; premium stays closed to it.
3. Five wrong tries from one network shut that network out for 15 minutes; any network gets at most 5 tries a minute.
4. After the review, first log in at /login/review and 회원 탈퇴 from 내 정보 (it refunds the unopened test purchases and erases the account and its readings; no Kakao re-check). Then `npx wrangler secret delete REVIEW_LOGIN_PASSWORD` and `npx wrangler secret delete REVIEW_LOGIN_ID`: the page and API answer 404 again, and a session still open loses the sales right away. Once the secrets are gone, the account can no longer be deleted from the site.
5. If the login leaks: delete either secret (sales stop for every review session at once), or set a new password (a new review account; sessions on the old one lose the sales right). Paid openings are not counted against BETA_DAILY_BUDGET_KRW, so until then a leaked login can spend AI credit with test cards; the prepaid credit is the backstop.

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
`npx wrangler secret put STARLOG_PAYMENTS` → `on`. The 오픈 기념 free daily full reading ends; the signup gift starts.
For the first 24 h, run the checks in section 7 every two hours.

## 7. Checks

- Orders the cron has not settled (should be empty). It looks again every 10 minutes, at most 30 Toss calls and 75 s of Toss work per run, oldest first; an order it cannot decide (failed look-up, stuck orphan, partial cancel) moves behind the others, so `updated_at` is only its last look. Read `cron.*_failed`, `pay.orphan_refund_stuck` and `pay.partial_cancel` in the logs with this (a refund started in the last 10 minutes can show too):
  `SELECT id, status, fail_code, cancel_attempt, created_at, updated_at FROM orders WHERE status IN ('confirming','refunding') AND created_at < strftime('%s','now')*1000 - 86400000`
- Orders left `created` for an hour are closed by the cron (`fail_code = 'ABANDONED'`); nothing was charged.
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
