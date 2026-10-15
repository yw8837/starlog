# Starlog 판매 오픈 전 보안·운영 감사 (2026-10-15 밤, live 1733a93)

- **범위:** `apps/web` 결제(`app/api/pay/*`, `lib/pay/*`), 인증·세션(`lib/account/*`, `app/api/auth/*`, `app/api/owner`), 비용·악용(`lib/api/*`, `lib/security/*`, `wrangler.jsonc`), 헤더·전송(`next.config.ts`, `worker.mjs`), 시크릿·의존성, 운영(크론·로그·백업·롤백), 10/14 "Recorded, not fixed".
- **방법:** 코드 정독 + 운영 프로브 48건(GET/HEAD, 그리고 인증·Turnstile 없이 거부돼야 하는 무해한 POST만) + wrangler 읽기 명령(`secret list`, `d1 execute` SELECT 집계만, `d1 time-travel info`, `d1 info`, `tail` 11분). 로그인·결제·AI 생성·설정 변경 없음. 시크릿 값은 출력하지 않음.
- **전체 위험도: MEDIUM.** 결제·원장 로직 자체는 견고함(금액 위조·재전송·이중 사용·열람 후 환불 경로 모두 막힘, 운영 D1 불변식 위반 0). 위험은 **비용 상한이 없는 상태에서 owner 코드·알림·백업 같은 운영 쪽**에 몰려 있음.

## 판매 오픈 전에 꼭 고칠 것

1. **[High] STARLOG_OWNER_CODE를 32자 이상 랜덤으로 교체 (SEC-05, 아직 미확인).** owner 패스 하나면 Turnstile·네트워크 일일 카운트·쿠키 쿼터를 모두 건너뛰고 원장 없이 전체 풀이(`method: "owner"`)를 무제한으로 연다. 일일 상한이 off라 비용 상한도 없다. 추측 방어는 IP당 분당 5회와 로그 한 줄뿐.
2. **[High] 무료 구간 일일 상한을 다시 켜거나, 최소한 Anthropic 선불 잔액 하드캡(auto-reload off)과 KV fail-open을 막을 것.** `BETA_DAILY_BUDGET_KRW=off`라 무료 생성 비용에 하루 상한이 없고, KV 장애 시 네트워크 카운트까지 0으로 읽힌다. 같은 API 키·선불 크레딧을 유료 고객 풀이가 쓰므로 크레딧이 바닥나면 **결제한 풀이도 전부 실패**한다. 이 상한은 무료 구간에만 걸리고 live 키 유료 열람에는 걸리지 않는다(근거 H-2).
3. **[Medium] 알림 최소 하나.** 코드에는 외부 알림이 0개고 모두 로그 한 줄. 크론 실패, 결제 키 거부, Turnstile 시크릿 오류(조용히 통과), Anthropic 403(배치 이동: 오늘 이미 MIA가 아니라 MEL) 모두 아무도 모르게 지나간다.
4. **[Medium] 라이브 키로 앱 내 환불(Toss cancel API) 1회 리허설.** 라이브 취소는 상점관리자 → 웹훅 경로만 검증됨. `toss.cancel` + Idempotency-Key 경로(환불받기, 회원 탈퇴 자동 환불)는 라이브에서 한 번도 안 돌았다(런북 5절 5번 요구 사항).
5. **[Medium] D1 백업·복구 절차 확정.** Time Travel은 동작하지만(북마크 조회됨) 보관 기간이 요금제에 달려 있고, 5년 보관 의무 데이터(주문·결제·원장)의 외부 사본과 복구 런북이 없다.

## 발견 사항 요약

| ID | 심각도 | 제목 | 위치 |
|---|---|---|---|
| H-1 | High | owner 코드 교체 미확인, owner 패스 = 무제한 무료 생성 | `app/api/owner/route.ts:24-33`, `lib/security/owner.ts:21`, `lib/api/unlock.ts:51-58`, `lib/api/turnstile.ts:75` |
| H-2 | High | 무료 비용 일일 상한 없음 + KV 장애 시 네트워크 카운트 fail-open | `wrangler.jsonc:47`, `lib/api/spend.ts:97-99,132-135,145,172` |
| M-1 | Medium | 외부 알림 0개 (결제·크론·Turnstile·배치 이상 모두 로그뿐) | `worker.mjs:25,31`, `app/api/owner/route.ts:32`, `lib/api/turnstile.ts:80-85`, `lib/ai/provider.ts:228` |
| M-2 | Medium | 라이브 취소 API 경로 미검증 | `lib/pay/refunds.ts:63-92`, `app/api/pay/refund/route.ts` |
| M-3 | Medium | D1 외부 백업·복구 런북 없음 | `docs/runbook-payments.md`, `docs/runbook-deploy.md` |
| M-4 | Medium | 서버 실패 반환에 횟수 상한 없음 (유료 1건으로 재생성 반복 가능성) | `lib/pay/ledger.ts:303-326`, `lib/api/unlock.ts:90`, `lib/api/stream.ts:149-153` |
| L-1 | Low | CSP에 script-src 없음 | `next.config.ts:9-18` |
| L-2 | Low | Turnstile: hostname/action 미검사, 우리 쪽 오류(invalid-input-secret)면 통과 | `lib/api/turnstile.ts:27,80-85` |
| L-3 | Low | 심사용 로그인 아직 열림 | `/login/review` 200, secrets `REVIEW_LOGIN_*` |
| L-4 | Low | 런북 롤백·전환 문구가 10/14 결정과 어긋남 | `docs/runbook-payments.md:81,116` |
| L-5 | Low | source-map-js 1.2.1 (GHSA-68fv-2mgg-jv7q, high) 빌드 의존성 | `next > postcss > source-map-js` |
| L-6 | Low | KV 카운터 비원자·최종 일관성 (버스트 과소 집계) | `lib/api/spend.ts:102-106`, `app/api/followup/route.ts:75-78` |
| L-7 | Low | 메인 체크아웃 `.env.local`에 운영 이름의 시크릿 보관 | `apps/web/.env.local` (gitignored) |
| I-1~7 | Info | 배치 MEL, apex HSTS, /api/version, apex의 /api, Google ID 토큰, Kakao PKCE, 인연 데이터 | 본문 Info 절 |

---

## 1. 결제 보안

### 확인됨 (문제 없음, 근거)
- **금액 위조 불가.** 주문 금액은 카탈로그에서만 온다: `createOrder`가 `input.product.krw`를 넣음(`lib/pay/orders.ts:41`), 요청은 `productId`만 보냄(`app/api/pay/orders/route.ts:15`). 승인 시 successUrl의 amount가 주문 금액과 다르면 아무것도 안 바꾸고 400(`orders.ts:153-158`), Toss confirm에는 주문 금액을 보냄(`orders.ts:171`), 응답도 `status DONE && orderId 일치 && totalAmount === amount_krw`일 때만 인정(`orders.ts:63,215`). 웹훅도 금액이 다르면 지급하지 않음(`lib/pay/refunds.ts:175-176`).
- **승인 멱등·재전송.** 주문당 1회 claim(`created -> confirming` CAS, `orders.ts:160-168`), Toss Idempotency-Key `confirm-<orderId>`(`lib/pay/toss.ts:48`), `payments.order_id` UNIQUE와 lot id `lot_<orderId>`(`migrations/0002_accounts_payments.sql:63,80`, `ledger.ts:155`)로 confirm·웹훅·크론이 겹쳐도 batch 하나가 UNIQUE 위반으로 통째로 롤백(`orders.ts:96-114`). 운영 프로브: 다른 출처 confirm -> **403 FORBIDDEN**, 존재하지 않는 주문 -> **400 BAD_REQUEST**.
- **웹훅 신뢰.** 서명이 없으니 본문은 힌트로만 쓰고 `toss.getPayment(paymentKey)`로 재조회(`app/api/pay/webhook/route.ts:29-35`), 재조회 결과의 `orderId`가 주문과 다르면 무시(`refunds.ts:171`). 가짜 웹훅으로 할 수 있는 건 "Toss가 실제로 가진 상태로 동기화"뿐. 운영 프로브: 없는 주문 웹훅 -> **200 {"ok":true}**(Toss 호출 전에 종료, `webhook/route.ts:27-28`).
- **열람 후 환불 레이스 없음.** 스트림은 `done` 전까지 섹션 키·인덱스만 보내고 본문은 `settle.deliver`(저장+차감) 뒤에만 나감(`lib/api/stream.ts:213-232`). 환불 잠금은 `units_left = units_total AND status active AND restore-left 기록 없음`일 때만 주문·lot을 한 batch로 잠금(`ledger.ts:390-411`), 예약은 비활성 lot이면 `units_left=-1`로 CHECK 위반 -> 롤백(`ledger.ts:187-194`, CHECK `0002:83`). D1은 쓰기를 직렬화하므로 둘 중 먼저 커밋된 쪽만 이김.
- **restore-left 규칙과 환불 정책 일치.** 떠난 클라이언트는 3번까지 다시 열 수 있고 환불 불가(`ledger.ts:47,303-326`), 환불 정책 페이지도 같은 내용(`app/refund/page.tsx:56-57`). 10/14의 blocker는 해소됨.
- **이중 사용.** lot 1개 = 열람 1회, 모든 이동은 UNIQUE `idem_key` 원장 행(`0002:115`). 운영 D1 읽기 전용 점검: lot 불변식 위반 **0**, 환불 잠금 쌍 불일치 **0/0**.
- **test 키 vs live 키.** 운영+test 키면 owner만 판매(`lib/pay/mode.ts:28-31`), test 결제로 만든 lot은 live 열람에 못 씀(`ledger.ts:230`), 다른 키의 결제는 Toss에 보내지 않음(`refunds.ts:99-104`). 운영 D1: payments `live/CANCELED:1`만 존재(test 결제 잔여 없음, 런북 5절 1-2 충족).
- **mock 거부.** `STARLOG_PAY=mock`은 production에서 `payConfigProblems`가 문제로 보고 `tossClient()`가 null(`mode.ts:69`, `toss.ts:62-72`), 키 모드도 null(`mode.ts:53`). Kakao/Google mock도 동일(`lib/account/kakao.ts:25`, `lib/account/google.ts:40`).
- **프리미엄.** `STARLOG_PREMIUM` 시크릿 없음(secret list) -> 주문 불가, `/api/premium/status` 전부 `open:false`. 중간 파트는 AES-GCM 봉인(`lib/premium/resume.ts:7,47`)이라 파트 사이 예약 만료로 "본문 받고 환불"도 안 됨.

### M-2 [Medium] 라이브 취소 API 경로 미검증
- **근거:** 핸드오프 10/15 night "Not yet tried: the in-app 환불받기 on an unopened reading". 운영 D1: 주문 `failed:17, refunded:1`, lot `paid/revoked:1`. 유일한 라이브 결제는 상점관리자 취소 -> 웹훅 -> `pay.canceled_after_open`(lot revoked)로 처리됨. `sendCancel`(`refunds.ts:63-92`)의 `POST /v1/payments/{key}/cancel` + `cancel-<id>-<attempt>` 키는 라이브에서 한 번도 안 돌았다. 회원 탈퇴의 자동 환불도 이 경로다.
- **영향:** 오픈 뒤 첫 환불에서 키 권한·MID 설정 문제가 나면 주문이 `refunding`에 멈추고(크론이 10분마다 재조회) 고객 응대가 수동이 된다.
- **조치:** owner 모드에서 가장 싼 상품 1건 결제 -> **열지 않고** 내 정보 -> 환불받기 -> D1에서 `orders.status='refunded'`, `credit_lots.status='refunded'`, `ledger kind='refund'` 1행 확인.

## 2. 인증·세션

### 확인됨
- **OAuth state:** 랜덤 24바이트 state를 서명된 10분짜리 `__Host-sl_oauth`(HttpOnly, SameSite=Lax, Secure)에 넣고 콜백에서 상수 시간 비교(`lib/account/oauthState.ts:38-57`). Google은 nonce + PKCE S256(`app/api/auth/google/start/route.ts:45-53`), ID 토큰의 iss/aud/exp/nonce 검사(`lib/account/google.ts:97-108`). redirect_uri는 `SITE.url` 고정(`kakao.ts:34`, `google.ts:49`), returnTo는 엄격한 정규식(`lib/account/returnTo.ts:2-6`).
- **세션 쿠키:** `__Host-sl_sid`, HttpOnly·SameSite=Lax·Secure·Path=/(`lib/api/http.ts:171-178`), 서명 + D1 행(폐기 가능, 30일, 연장 없음)(`lib/account/session.ts:28-48`). 로그아웃은 D1 행 폐기(`app/api/auth/logout/route.ts`).
- **CSRF:** 결제·계정 쓰기는 모두 `openAccountRoute(write:true)` -> `sameOrigin`(Origin, 없으면 Referer, 둘 다 없으면 거부)(`lib/account/request.ts:67-95`). `readJson`이 `application/json`만 받음(`http.ts:105-107`). 운영 프로브: 다른 출처 `/api/pay/confirm`·`/api/owner`·`/api/auth/review` -> 모두 **403**. 생성 라우트엔 same-origin 검사가 없지만 세션이 Lax라 교차 출처 POST로 크레딧을 쓸 수 없다.
- **review 계정:** 비밀번호 20자 미만이면 꺼짐(`lib/account/review.ts:23,34-38`), 네트워크당 5회 실패 시 15분 차단 + 분당 5회(`app/api/auth/review/route.ts:13-45`), 미열람 구매 3건 한도(`app/api/pay/orders/route.ts:18,28-34`).
- **계정 삭제:** Kakao/Google 재인증 + 같은 세션의 intent(`app/api/auth/kakao/start/route.ts:28-40`), 열람 중·정산 중이면 보류, 미열람 구매는 환불, readings·shares·sessions·reviews(도움돼요·신고 포함) 삭제, gift claim 표시, 미승인 주문 종료, kakao_key·nickname 비움(`lib/account/deletion.ts:118-141`). 주문·결제·원장은 전자상거래법 5년 보관 후 크론이 purge(`lib/pay/maintenance.ts:13,45-57`). Kakao unlink / Google revoke 호출. 운영 D1: 삭제됐는데 미소거 계정 **0**.

### H-1 [High] owner 코드 교체 미확인: owner 패스가 비용 상한을 통째로 우회
- **Category:** A07 Auth Failures / A04 Insecure Design
- **근거:**
  - owner 패스면 Turnstile 생략(`lib/api/turnstile.ts:75`), 네트워크 일일 카운트·네트워크 예산 생략(`lib/api/http.ts`의 `checkServerLimits`), 쿠키 쿼터 생략, `method:"owner"`로 원장 없이 전체 풀이(`lib/api/unlock.ts:51-58`). 리미터는 owner용(OWNER_GEN 150/분, OWNER_FULL 25/분, `wrangler.jsonc:52,55`).
  - 코드 추측 방어는 IP당 분당 5회(`wrangler.jsonc:53`)와, 전 네트워크 실패 20회째에 **로그 한 줄**(`app/api/owner/route.ts:10,30-32`). 전역 잠금은 의도적으로 없음.
  - 운영 값은 읽을 수 없음(secret). 로컬 `.env.local`의 값은 24자 미만(길이만 비교, 값 미출력). 핸드오프 10/15 early morning "Owner pending: change STARLOG_OWNER_CODE", 이후 완료 기록 없음.
- **Exploitability:** 원격·무인증. IP 1개당 하루 7,200회, 프록시 IP를 늘리면 선형. 코드가 짧으면 현실적.
- **Blast Radius:** 무제한 무료 전체 풀이(타로·사주) -> 선불 크레딧 소진 -> 유료 고객 풀이까지 실패. owner 모드에서는 판매·가입 권한도 따라옴.
- **조치:** 32자+ 랜덤으로 교체하고 owner 기기에서 /owner 재입력.
  ```
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
  npx wrangler secret put STARLOG_OWNER_CODE
  ```
  재발 방지로 review 로그인처럼 최소 길이를 코드에 둔다(짧으면 owner 기능 자체가 꺼져 교체를 강제):
  ```ts
  // BAD (lib/security/owner.ts:21)
  export const ownerCode = (env: NodeJS.ProcessEnv = process.env): string | null => env.STARLOG_OWNER_CODE?.trim() || null;
  // GOOD
  const MIN_OWNER_CODE_LENGTH = 24;
  export const ownerCode = (env: NodeJS.ProcessEnv = process.env): string | null => {
    const code = env.STARLOG_OWNER_CODE?.trim() ?? "";
    return code.length >= MIN_OWNER_CODE_LENGTH ? code : null;
  };
  ```

### L-3 [Low] 심사용 로그인 아직 열림
- `/login/review` -> **200**, secrets에 `REVIEW_LOGIN_ID`, `REVIEW_LOGIN_PASSWORD` 있음. 운영 D1 users 1명 = review 계정 1개. 남은 카드사(국민·하나·BC·현대·롯데) 심사가 끝나면 두 시크릿을 삭제하면 즉시 닫힌다(`lib/account/review.ts:34-38`). 그 전에 런북 4절 5번 쿼리로 세션·lot 정리.

## 3. 악용·비용

### Turnstile 적용 범위 (운영에서 토큰 없이 POST, 생성 0건)
| 엔드포인트 | 무료? | Turnstile | 운영 결과 |
|---|---|---|---|
| `POST /api/tarot/teaser` | 무료 | O (`route.ts:18`) | 403 BOT_CHECK (위조 토큰도 403) |
| `POST /api/saju/teaser` | 무료 | O (`route.ts:18`) | 403 BOT_CHECK |
| `POST /api/tarot/daily` (오늘의 한 장) | 무료 | O (`route.ts:59`) | 403 BOT_CHECK |
| `POST /api/tarot/reading` (오픈 기념 무료, unlock 없음) | 무료 | O (`route.ts:33-36`, 파싱·planUnlock 뒤) | 유효 draw 토큰으로 보내도 403 BOT_CHECK |
| `POST /api/premium/{match,tarot-deep,newyear-2027}/teaser` | 무료 프리뷰 | O (`lib/premium/routes.ts:24`) | 3개 모두 403 BOT_CHECK |
| `POST /api/tarot/reading`·`/api/saju/reading`·`/api/premium/*/reading` (paid/owner) | 유료 | X (로그인+구매 필요) | `{}` -> 400 |
| `POST /api/followup` | 유료 풀이의 chapter 토큰 필요, 오픈 무료는 거부 | X | `{}` -> 400 |
| `POST /api/bonds/today-card` (인연 한 줄, 모델) | 무료 | X, owner당 하루 5줄·네트워크 120줄 (`lib/bonds/todayLine.ts:25,106-109`) | NO_OWNER 404 |
- `/api/tarot/draw`는 카드만 섞고 생성 없음(`app/api/tarot/draw/route.ts`).
- 결론: **무료로 모델 비용을 쓰는 진입점 6종은 전부 Turnstile 뒤에 있고, 토큰 없이는 생성 전에 403**. 인연 한 줄만 예외(짧은 한 줄, 상한 있음).

### 리미터: wrangler.jsonc vs rateLimit.ts
12개 이름·값 모두 일치(`wrangler.jsonc:51-64` vs `lib/security/rateLimit.ts:17-36`): GEN 60, OWNER_GEN 150, OWNER_LOGIN 5, FULL 20, OWNER_FULL 25, BOND_JOIN 10, BOND_CODE 10, BOND_VIEW 120, AUTH 20, PAY 20, WEBHOOK 60, ME 120 (모두 60초).

### H-2 [High] 무료 비용 일일 상한 없음, KV 장애 시 fail-open
- **Category:** A04 Insecure Design (비용 DoS)
- **근거:**
  - `"BETA_DAILY_BUDGET_KRW": "off"`(`wrangler.jsonc:47`) -> `dailyBudgetKrw()=Infinity`(`spend.ts:145`) -> `budgetState()`가 KV를 읽지도 않고 항상 `"ok"`(`spend.ts:172`), 네트워크 예산 몫(SEC-01)도 `Infinity x 0.2`라 영구 해제(`spend.ts:132-135`).
  - KV를 못 읽으면 네트워크 일일 카운트가 0으로 읽힘(`spend.ts:97-99`; 주석은 "the budget check closes then"인데 off에선 더 이상 사실이 아님). KV 장애 + 공격이면 남는 건 분당 리미터·쿠키 쿼터(삭제로 우회)·Turnstile뿐.
- **지금 비용을 묶는 것:** Turnstile(1회용 토큰), 네트워크(IP, IPv6는 /64)당 하루 full 60·teaser 240·daily 120·followup 300·line 120(`lib/security/quota.ts:50`), 분당 리미터, 그리고 이번 감사로는 확인할 수 없는 Anthropic 선불 크레딧(auto-reload off라는 주석, `wrangler.jsonc:42-43`).
- **추정:** 핸드오프 실측(오픈 무료 타로 약 316원, 티저 약 45~115원) 기준 네트워크 하나가 하루 최대 약 19,000원(full 60) + 11,000~27,000원(teaser 240) = **약 3~5만원**. Turnstile 토큰을 대량으로 풀어 주는 서비스가 있으니 IP 10개면 하루 수십만원 단위.
- **Blast Radius:** 무료 손실만이 아니라, **같은 키·같은 선불 크레딧**으로 도는 유료 풀이가 크레딧 소진 시 UPSTREAM으로 실패(예약은 반환돼 환불 가능 상태로 남음) -> 판매 직후 장애.
- **조치(소유자 결정 사항):** 일일 상한은 무료 구간에만 걸린다. `checkServerLimits`는 오픈 무료·티저·오늘의 한 장·팔로업·owner·gift·test 키 유료에서만 불리고 live 키 유료 열람은 부르지 않는다(`lib/api/unlock.ts:71-76`). 그래서 상한을 켜도 결제 고객의 열람은 막히지 않는다(유료 풀이의 팔로업만 함께 닫힘). 실측 트래픽에 맞춰 예: `"BETA_DAILY_BUDGET_KRW": "100000"`. 상한을 끈 채로 둔다면 KV fail-open만이라도 막는다:
  ```ts
  // BAD (lib/api/spend.ts:170-172)
  export async function budgetState(now: number): Promise<"ok" | "over" | "unknown"> {
    if (dailyBudgetKrw() === Infinity) return "ok";
  // GOOD: no cap, but an unreadable KV means the per-network counts read 0, so stay closed
  export async function budgetState(now: number): Promise<"ok" | "over" | "unknown"> {
    if (bindingMissing()) return "unknown";
    if (dailyBudgetKrw() === Infinity) return (await spentTodayKrw(now)) === null ? "unknown" : "ok";
  ```
  그리고 Anthropic 콘솔에서 auto-reload off와 잔액 알림을 소유자가 직접 확인.

### M-4 [Medium] 서버 실패 반환에 횟수 상한 없음
- **근거:** 클라이언트가 떠난 경우(left)만 lot당 3회로 제한되고(`ledger.ts:306`), 생성 오류·검증 실패·시간 초과는 매번 무조건 반환(`stream.ts:149-153`, `ledger.ts:303-326`). live 키 유료 열람은 네트워크 일일 카운트도 Turnstile도 안 거침(`unlock.ts:90`, `spend: undefined`). 남는 상한은 IP당 FULL 20/분.
- **Exploitability:** 낮음~중간. 질문(120자)·메모(200자)로 모델이 hard 검증 실패를 반복하게 만들어야 하는데, soft 위반이면 결과를 유지하는 구조(`lib/ai/provider.ts:178-212`)라 재현이 쉽지 않다. 성공하면 구매 1건으로 생성 비용을 계속 쓰게 된다.
- **조치:** lot당 서버 실패 반환도 세고(예: 10회) 넘으면 반환 대신 로그+문의 안내.
  ```ts
  // lib/pay/ledger.ts releaseUnlock: count every restore, not only `left`
  const MAX_SERVER_RESTORES = 10;
  const capped = input.left
    ? ` AND (SELECT COUNT(*) FROM ledger WHERE lot_id = ? AND idem_key LIKE '${LEFT_RESTORE}%') < ${MAX_RESTORES}`
    : ` AND (SELECT COUNT(*) FROM ledger WHERE lot_id = ? AND kind = 'restore') < ${MAX_SERVER_RESTORES}`;
  const restorableArgs = (lotId: string) => [unlock.id, lotId];
  ```
  (sweep의 만료 반환도 같은 경로라 상한값은 넉넉히.)

### L-2 [Low] Turnstile 세부
- Siteverify 응답의 `hostname`·`action`을 보지 않음(`turnstile.ts:80`). 위젯 도메인 제한이 있어 영향은 작다.
- `invalid-input-secret`·`missing-input-secret`·`internal-error`와 Siteverify 장애는 **통과**(`turnstile.ts:27,61-69,82-85`). 의도된 가용성 우선이지만, 시크릿을 잘못 바꾸면 봇 검사가 조용히 꺼지고 `bot_check.unverified` 로그 말고는 아무도 모른다(M-1과 연결).

### 프롬프트 주입 (Low, 확인됨)
- 사용자 입력은 길이 제한(질문 120·메모 200·직접 입력 30자, `lib/api/inputs.ts:27-48`), `<>`와 `**` 제거(`lib/ai/prompts/tarot.ts:174`), 위기 문구 차단(`crisisResponse`), 출력 검증(해요체·모델명·금지어). 영향은 본인 풀이에 한정.
- 공유(`/s/<id>`)는 서명된 chapter 토큰 + 본문 다이제스트가 있어야 만들어지고(`app/api/share/route.ts:41`), 본인 단어·이름·URL·전화·카톡 ID 문장·생년월일·나이를 가림(`lib/share/payload.ts:186-255`). 오픈 무료 풀이는 공유 불가. 사용자 HTML을 렌더하는 `dangerouslySetInnerHTML` 없음(JSON-LD 2곳만, `<` 이스케이프, `lib/jsonld.ts:29-31`).

### L-6 [Low] KV 카운터
- 읽고-쓰기라 원자적이지 않고 KV는 최종 일관성이라 동시 버스트는 덜 세어진다(코드 주석도 인정, `app/api/followup/route.ts:75-77`). 분당 리미터가 버스트를 묶는다.

## 4. 헤더·전송 (운영 실측)

| 항목 | starlog.yeolmaeapps.kr | yeolmaeapps.kr |
|---|---|---|
| HSTS | `max-age=63072000; includeSubDomains` | `max-age=63072000` (의도적, `next.config.ts:11`) |
| CSP | `frame-ancestors 'none'` 만 | 동일 |
| X-Frame-Options | DENY | DENY |
| Referrer-Policy | strict-origin-when-cross-origin | 동일 |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | 동일 |
| X-Content-Type-Options | nosniff | nosniff |
| http -> https | `HEAD http://starlog.yeolmaeapps.kr/` -> 301 https | `HEAD http://yeolmaeapps.kr/about` -> 301 https |
| 404 | 커스텀 HTML 404, 스택 없음 | - |
| `/.env` | 404 | - |
| 소스맵 | `/_next/static/chunks/066_9qs-fr7km.js` 200, `.map` 404, sourceMappingURL 없음 | - |
| 사용자 데이터 캐시 | `/api/me` `no-store`, `/me` `private, no-cache, no-store` | `/api/me` `no-store` |
- 무인증 API: `/api/me`(user null), `/api/version`(빌드 해시), `/api/premium/status`, `/api/reviews`(공개 설계), `/api/lucky`, `/api/bonds/me`(owner null) 200. 데이터가 새는 응답 없음. `/api/pay/checkout`·`/api/pay/orders`·`/api/readings` 401, `/api/owner/reviews` 403, `/api/internal/maintenance` 무인증 POST 403.
- 에러 본문은 코드·한국어 메시지만, 로그엔 에러 클래스 이름만(`lib/api/http.ts:90-94`).

### L-1 [Low] CSP에 script-src 없음
- `next.config.ts:9-18`(주석: Next 인라인 스크립트 때문에 nonce가 먼저 필요). React 이스케이프와 사용자 HTML 미사용으로 실제 XSS 경로는 찾지 못했다. 결제 위젯·애드센스가 있으니 먼저 Report-Only로 깔아 둘 것을 권함:
  ```ts
  { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.tosspayments.com https://challenges.cloudflare.com https://pagead2.googlesyndication.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  ```
  (도메인 목록은 실제 위젯 로드 경로를 보고 조정.)

## 5. 시크릿·설정·의존성

- **`npx wrangler secret list` (이름만):** ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, KAKAO_CLIENT_SECRET, KAKAO_REST_API_KEY, NEXT_PUBLIC_TOSS_CLIENT_KEY, REVIEW_LOGIN_ID, REVIEW_LOGIN_PASSWORD, STARLOG_ACCOUNT_SECRET, STARLOG_CRON_SECRET, STARLOG_OWNER_CODE, STARLOG_PAYMENTS, STARLOG_SIGNING_SECRET, TOSS_SECRET_KEY, TURNSTILE_SECRET_KEY (15개).
- **코드가 읽는 이름과 대조:** 15개 모두 사용 중(GOOGLE_*는 `secrets.` 경유, `lib/account/google.ts:39-42,65`). 안 쓰는 시크릿 없음. `STARLOG_PREMIUM` 없음 = 프리미엄 꺼짐(의도). `REVIEW_LOGIN_*`는 심사 끝나면 삭제(L-3).
- **번들 유출 방지:** `scripts/check-worker-env.mjs:20`이 next-env.mjs의 production 키 중 SECRET/PASSWORD/_KEY/TOKEN 이름과 로컬 .env 시크릿 값을 찾으면 배포 실패. `PROD_STARLOG_ACCOUNT_SECRET`·`PROD_STARLOG_CRON_SECRET`은 이름에 SECRET이 있어 걸린다. 클라이언트 번들은 `scripts/check-client-bundle.mjs`가 유료 본문·모델명·시크릿을 검사. 이번엔 메인 체크아웃에 `.open-next`가 없어 산출물 자체는 재검사하지 못함(배포 클론 게이트 결과에 의존).
- **git 이력:** `sk-ant-`, `live_gsk`, `test_gsk_`, `live_sk_` 문자열이 들어간 커밋 0건. `.env*`는 gitignore(`.gitignore:6`), 추적 파일은 `apps/web/.env.example`뿐.
- **L-7 [Low]:** 메인 체크아웃 `apps/web/.env.local` 키 이름: ANTHROPIC_API_KEY, STARLOG_OWNER_CODE, KAKAO_*, TOSS_SECRET_KEY(접두사 test), GOOGLE_*, **PROD_STARLOG_ACCOUNT_SECRET, PROD_STARLOG_CRON_SECRET**. 운영 계정 비밀은 비밀번호 관리자로 옮길 것(이 PC가 털리면 저장 풀이 복호화 키가 함께 나감).
- **의존성 (`pnpm audit --prod`, 저장소 루트):** high 1, critical 0, moderate 0. `source-map-js 1.2.1`(GHSA-68fv-2mgg-jv7q, 조작된 소스맵의 offset으로 이벤트 루프 DoS), 경로 `apps/web > next > postcss > source-map-js`, 수정 1.2.2. postcss는 빌드 시 CSS 처리용이라 런타임에 공격자 입력이 닿지 않는다(**L-5**). next가 올리면 따라 올리면 됨. next는 16.3.8(`apps/web/package.json:20`)로 SEC-12 해소.

## 6. 운영

- **크론(*/10) 정상:** `wrangler tail` 11분 동안 1회 관찰: `2026-10-15T14:20:26Z CRON */10 * * * * ok {"evt":"cron.maintenance","confirming":0,"refunding":0,"released":0,"expired":0,"abandoned":0,"erased":0,"sessions":0,"giftClaims":0,"purgedAccounts":0,"failed":0}`(다음 회차는 tail 종료와 겹쳐 미관찰). D1: 1시간 넘은 `created` 0, 15분 넘은 confirming/refunding 0, 만료 예약 0, 미소거 삭제 계정 0. 크론 경로는 32자 이상 Bearer + 상수 시간 비교(`app/api/internal/maintenance/route.ts:13-16`).
- **결제 이벤트 로그:** `pay.order_created/paid/amount_mismatch/confirm_*/key_rejected/merchant_refused/refunded/canceled_after_open/refund_*/orphan_refund_stuck/partial_cancel/other_keys`, `unlock.*`, `cron.*`. 모두 JSON 한 줄·개인정보 없음. 보관은 Workers Logs뿐(`observability.enabled`, `wrangler.jsonc:20-22`)이라 짧다. 영구 기록은 D1 orders/payments/ledger와 Toss 상점관리자.
- **M-1 [Medium] 알림 없음:** 코드에 외부 알림(메일·슬랙·텔레그램 등) 0개(grep). "alert"라는 이름의 것도 로그 한 줄(`auth.owner_code_alert`, `auth.review_failures_alert`). 아무도 안 보면 모르는 것들:
  - 크론 실패(`cron.maintenance_failed`, `cron.no_secret`, `worker.mjs:25,31`)
  - 결제 키·상점 거부(`pay.key_rejected`, `pay.merchant_refused`), 고아 환불 정체(`pay.orphan_refund_stuck`)
  - Turnstile 시크릿 오류로 봇 검사 통과(`bot_check.unverified`)
  - Anthropic 403(`ai.generate` status `UPSTREAM_FORBIDDEN`, `lib/ai/provider.ts:228`). **배치가 이미 움직였다:** 핸드오프는 MIA라 했지만 오늘 두 호스트 모두 `Cf-Placement: remote-MEL`. 다시 홍콩으로 가면 유료 풀이 전부 실패.
  - 조치: (1) Anthropic 콘솔 잔액·사용량 알림 메일, (2) 외부 업타임 모니터로 `/login` 200 감시, (3) 오픈 첫 주는 런북 7절 SQL과 `wrangler tail`의 `pay.`/`cron.`/`UPSTREAM_FORBIDDEN` 확인을 하루 2회, (4) 여유가 되면 크론 리포트에 최근 실패 수를 넣고 임계 초과 시 메일 한 통.
- **M-3 [Medium] D1 백업:** `wrangler d1 time-travel info starlog` -> 현재 북마크 `0000080f-...` 조회됨, 복구 명령 존재. 보관 기간은 요금제에 달려 있고(Workers 무료/유료에 따라 다름), 외부 사본 없음. DB 328 kB라 비용 부담 없음. 조치: 주 1회 `npx wrangler d1 export starlog --remote --output starlog-YYYYMMDD.sql`을 암호화 보관, 복구 절차(Time Travel 복구 -> 크론 1회 확인 -> 런북 7절 불변식 쿼리 -> Toss 상점관리자 결제 목록과 대조)를 runbook-deploy.md에 추가.
- **롤백 (`STARLOG_PAYMENTS=paused`):** 시크릿이라 `wrangler secret put` 즉시 반영. paused면 신규 주문·가입 차단(`mode.ts:28-36`), 기존 계정 로그인·열람·환불·탈퇴는 가능, confirm은 모드와 무관하게 동작(`app/api/pay/confirm/route.ts:20`). 코드 경로는 맞음.
- **L-4 [Low] 런북 문구 낡음:** `docs/runbook-payments.md:81` "첫 이용 무료 ... ends; the signup gift starts", `:116` "첫 이용 무료 (tarot) comes back ... gifts". 10/14 결정(오픈 기념 무료는 모든 모드에서 10/31까지, 가입 선물 폐지, `mode.ts:11`)과 다름. 롤백하는 사람이 잘못 판단할 수 있어 고쳐 둘 것.
- **법적 시행일:** `LEGAL_EFFECTIVE_DATE = "2026-10-15"`(`lib/legal.ts:4`). 런북 6절의 전환 조건은 오늘부터 충족.

## 10/14 "Recorded, not fixed" 현황

| 항목 | 상태 | 근거 |
|---|---|---|
| 환불 정책 vs 이탈 규칙 (blocker) | **해소** | `app/refund/page.tsx:56-57`이 코드의 restore-left(3회 재열람·환불 불가)와 일치 |
| SEC-01 봇 검사(Turnstile) | **해소** | 무료 생성 6종 운영에서 토큰 없으면 403 BOT_CHECK |
| SEC-01 일일 예산 | **악화(소유자 결정)** | `BETA_DAILY_BUDGET_KRW=off` -> H-2 |
| SEC-05 STARLOG_OWNER_CODE 교체 | **미확인, 미완료로 추정** | 운영 값 확인 불가, 로컬 값 24자 미만, 핸드오프 "Owner pending" -> H-1 |
| SEC-12 next 16.3.8 | **해소** | `apps/web/package.json:20` |
| SEO-02 PerplexityBot 403, SEO-12 www DNS, Always Use HTTPS | 보안 범위 밖, 미점검 | http->https는 Worker가 301로 처리함(실측) |
| ADS-03/04, QA-06, QA-10, QA-12, QA-17, SEO-10/17/18, 프리미엄 배치 | 보안 범위 밖, 미점검 | - |

## Info
- **I-1:** 배치가 MEL(`Cf-Placement: remote-MEL`). D1 왕복이 길어지고 배치는 움직일 수 있다(M-1).
- **I-2:** apex HSTS에 includeSubDomains 없음(의도적), preload 없음.
- **I-3:** `/api/version`이 빌드 해시 노출(무해).
- **I-4:** apex도 `/api/*`를 서빙(`https://yeolmaeapps.kr/api/me` 200). 세션 쿠키가 `__Host-`라 호스트 간 공유 안 되고 OAuth redirect가 앱 호스트 고정이라 apex엔 세션이 없다. 광고 스크립트가 도는 apex에 결제 API가 같이 있다는 점만 기억.
- **I-5:** Google ID 토큰 서명 검증 생략. 토큰 엔드포인트에서 TLS로 직접 받은 경우라 OIDC 규격상 허용.
- **I-6:** Kakao 흐름엔 PKCE 없음. state 쿠키가 CSRF를 막는다.
- **I-7:** 별자리 인연 데이터는 기기 쿠키 기반이라 계정 삭제 범위 밖(별도 경로).

## 운영 요청 기록 (총 48건, 전부 GET/HEAD 또는 거부돼야 하는 무해 POST, 생성 0건)
헤더·리다이렉트 4 / 무인증 GET 15 + 크론 무인증 POST 1 / `/login`·청크·소스맵 3 / Turnstile 7 / draw·오픈무료 리딩·followup·saju reading·today-card 5 / 결제·로그인 거부 POST 7 + `/owner`·`/login/review`·Kakao start 3 / 캐시 헤더 3. 별도로 Cloudflare API(wrangler: secret list, d1 SELECT 집계, time-travel info, d1 info, tail 11분).

## 체크리스트
- [x] 하드코딩 시크릿 없음 (git 이력 0건, .env* gitignore)
- [x] 입력 검증 (zod, 길이 제한, JSON만, returnTo 정규식)
- [x] 주입 방지 (D1 전부 바인딩, 사용자 HTML 렌더 없음)
- [x] 결제 금액·멱등·웹훅·환불 레이스·원장 이중 사용
- [x] 인증·세션 (state/PKCE/nonce, __Host- 쿠키, same-origin)
- [ ] owner 코드 강도 (H-1, 미확인)
- [ ] 무료 비용 상한 (H-2)
- [ ] 알림 (M-1)
- [ ] 라이브 취소 API 리허설 (M-2)
- [ ] D1 외부 백업·복구 런북 (M-3)
- [x] 의존성 감사 (high 1, 빌드 경로만)