# Starlog P4 설계: 계정과 결제

작성일 2026-10-01 · 상태: 구현 계획 작성 완료, 소유자 확인 대기(아래 "기본값" 절)

구현 계획: `docs/superpowers/plans/2026-10-01-starlog-p4-accounts-payments.md`

상위 설계: `docs/superpowers/specs/2026-09-29-saju-tarot-story-app-design.md`(5절 결제와 재화, 11절 오류 처리). 이 문서와 충돌하면 이 문서가 우선한다. 베타 운영 규칙은 `docs/superpowers/plans/2026-10-01-starlog-p2-beta-launch.md`, `.superpowers/sdd/2026-09-30-starlog-p2b/`(global-constraints, streaming-protocol, task-A 보고, A2 리뷰)를 따른다.

## 1. 한 줄 정의

카카오 로그인과 토스페이먼츠 결제위젯으로 **표준 전체 풀이를 건별 2,900원에 판다.** 결제한 풀이는 **완성되어 계정에 저장될 때만** 차감되고, 생성에 실패하면 결제한 풀이가 그대로 남아 다시 열거나 바로 환불받을 수 있다. 가입 선물 별조각으로 한 번은 무료로 연다. 모든 것은 기능 플래그 뒤에서 켠다.

## 2. 범위

### P4에 넣는다

- 카카오 로그인(서버 OAuth 코드 흐름), 서명 쿠키 + D1 세션, 로그아웃, 회원 탈퇴(개인정보 파기)
- 원장 하나(지급·예약·차감·복구·환불·소멸), 유료(달빛)와 무료(별조각) 단위를 따로 기록
- 건별 결제: 표준 타로·사주 전체 풀이 각 2,900원 → 결제 즉시 그 상품 1회분이 생긴다
- 가입 선물: 별조각 `SITE.price.signupGiftFree`(10개 = 전체 풀이 1회), 카카오 계정당 한 번
- 결제위젯 v2(주문서형) 연동, 서버 승인, 멱등, 웹훅, 취소·환불 API
- 스트리밍 생성 경로와 결제의 연결(완성 전 차감 없음)
- 계정에 풀이 보관(결제·별조각·운영자로 연 풀이는 자동, 기기에만 있던 풀이는 사용자가 원할 때 옮기기)
- 내 정보: 닉네임, 별조각과 소멸일, 열지 않은 결제 풀이와 환불, 결제 내역과 영수증, 로그아웃, 탈퇴
- 프리미엄 상품의 카탈로그와 주문 경로(심층 타로 카드 10장 5,900원, 우리 사이 궁합 9,900원, 2027 신년운세 9,900원). **생성기가 생기는 P5 전에는 팔지 않는다**(구매 버튼 없음, 서버도 주문 거절)
- /pricing, /refund, /terms, /privacy 개정, 결제 전 청약철회 안내와 동의
- 로컬 D1, 모의 토스·모의 카카오로 e2e, 단계별 출시 절차

### P4에서 뺀다

- 달빛 충전 상품(선불 재화의 환불·법적 부담 때문). 원장은 나중에 붙일 수 있게 만든다
- 프리미엄 풀이 생성기(P5)
- 카카오 쪽 연결 끊기 알림 콜백(어드민 키가 필요, 후속)
- 가상계좌·계좌이체(입금 대기·현금영수증 흐름), 구독, 쿠폰
- Google 로그인(소유자 결정: 카카오만)

## 3. 소유자 결정 (확정)

| 항목 | 결정 |
|---|---|
| 표준 가격 | 타로 전체 풀이 2,900원, 사주 전체 풀이 2,900원 |
| 결제 전 보여 줄 범위 | 소제목 목록, 약 2,000자(타로)·약 3,000자(사주), 이어서 물어보기 3번, 이 기기에 계속 보관 |
| 프리미엄 | 심층 타로·카드 10장 5,900원(화면에 "켈틱 크로스"를 쓰지 않는다), 우리 사이 궁합(사주+타로) 9,900원, 2027 신년운세 9,900원(11월 중순 오픈). P4는 카탈로그와 구매 배관만 |
| 재화 | 유료 달빛, 무료 별조각. 원장 하나, 유료·무료 단위 분리 |
| 판매 방식 | 건별(2,900원 결제 → 그 풀이가 열린다). 달빛 묶음 판매는 P4에서 뺀다 |
| 가입 선물 | 전체 풀이 1회분 별조각. 무료, 환불 불가, 명시한 규칙으로 소멸 |
| 무료 범위 | 오늘의 한 장(매일), 지금의 한 장(무제한, 기기), 맛보기 하루 5번, 베타 동안 전체 풀이 하루 1번. 결제가 모두에게 열리면 하루 1번 무료 전체 풀이는 끄고 가입 선물로 바꾼다. 맛보기와 무료 부분은 그대로 |
| 로그인 | 카카오만. REST API 키 + 클라이언트 시크릿, 서버 쪽 인가 코드 흐름. 리다이렉트 URI `https://starlog.yeolmaeapps.kr/api/auth/kakao/callback`, `http://localhost:3100/api/auth/kakao/callback`. 동의 항목 닉네임. 결제나 선물 받기 직전에만 로그인을 보여 준다 |
| 세션 | `lib/security/sign.ts`(WebCrypto HMAC)로 서명한 HttpOnly 쿠키 + 취소할 수 있는 D1 세션 행. CSRF는 state 파라미터 + SameSite=Lax, 로그아웃 엔드포인트 |
| 결제 | 토스페이먼츠 결제위젯 v2. 키 이름 `NEXT_PUBLIC_TOSS_CLIENT_KEY`(test_gck_…), `TOSS_SECRET_KEY`(test_gsk_…). 지금은 공개 문서의 테스트 키 |
| 돈 안전 | 풀이가 전달될 때만 차감. 결제 뒤 생성이 실패하면 권리는 쓰지 않은 채 남고(무료로 다시 시도) 정책에 따라 환불 |
| 저장소 | Cloudflare D1, 바인딩 `DB`. 결제한 풀이는 서버에도 보관(유료 콘텐츠를 잃지 않게) |
| 보안 | 가격은 상품 id로 서버가 정한다(클라이언트 금액을 믿지 않음). 인증·결제 경로 속도 제한. 비밀값은 클라이언트 번들에 없다(`scripts/check-client-bundle.mjs`). 운영자 패스(`sl_owner`)로 QA 무료 열기 |

## 4. 의존성과 다른 단계와의 경계

### P3(별자리 인연)과 같이 쓰는 것

P3가 지금 구현 중이고 D1을 먼저 도입한다. P4는 다음을 지킨다.

- **D1 데이터베이스:** 이름 `starlog`, id `78c6fb07-ee97-42d5-9633-21801fe596eb`, 바인딩 `DB`(2026-10-01 생성, P3와 공유). `wrangler.jsonc`의 `d1_databases` 항목(`migrations_dir: "migrations"`)은 P3 Task 4(커밋 acf4599)가 넣었다. P4는 다시 넣지 않는다.
- **마이그레이션 번호:** P3가 `apps/web/migrations/0001_bonds.sql`을 가진다. P4는 같은 폴더의 `0002_accounts_payments.sql`부터 쓰고, 적용한 마이그레이션은 고치지 않는다.
  - wrangler는 적용하지 않은 파일을 이름 순서로 모두 적용하므로 순서가 섞여도 빠지지 않는다(설치된 wrangler 4.143 `getUnappliedMigrations` 확인).
  - P3 작업 트리의 0001과 0002를 로컬 D1 엔진에 차례로 적용해 확인했다.
- **`apps/web/lib/db/` 패턴:** P3가 정한 구성을 따른다.
  - 구성: `lib/db/d1.ts`의 `D1Binding`·`D1Statement`·`getDb()`, 기능별 저장소, `lib/db/index.ts` 팩토리, 같은 계약 테스트를 메모리 구현과 로컬 D1(`*.int.test.ts`, `getPlatformProxy`)에서 모두 돌림.
  - P4는 P3의 타입과 `getDb()`를 그대로 쓴다. `lib/db/index.ts`에는 `accountDb()`와 `setTestDb()`만 더한다. 새 타입 선언은 없으므로 `CloudflareEnv.DB`가 충돌하지 않는다.
  - P4의 원장 테스트도 계약 하나(`ledgerContract`)를 두 곳에서 돌린다. 로컬 D1 쪽은 P3와 같은 `getPlatformProxy` 방식이다.
  - **한 가지 다르게 한다:** P4의 "메모리 쪽"은 `Map` 구현이 아니라 **Node 내장 `node:sqlite` 메모리 DB 위에서 같은 SQL과 같은 마이그레이션을 돌리는 `D1Binding` 어댑터**다(`lib/db/testing/sqliteD1.ts`).
    - 돈 불변식은 SQL 제약(CHECK, UNIQUE)과 batch 원자성에 기댄다. 그래서 `Map`으로 따로 짠 구현을 테스트하면 실제로 돌아갈 SQL은 검증되지 않는다.
    - 의존성을 새로 설치하지 않는다(Node 22.13+ 내장).
  - **로컬 개발:** P3는 `next dev`에서 메모리 저장소를 쓰고 `initOpenNextCloudflareForDev()`를 켜지 않았다. P4는 `STARLOG_CF_DEV=1`일 때만 `next.config.ts`가 그것을 호출해 Miniflare 로컬 D1을 쓴다. 기본 `next dev`에는 D1이 없어 계정·결제 경로가 503을 내고 화면은 베타 그대로다.
- **신원 쿠키:** P3는 기기 신원 `sl_uid`(주인)와 `sl_fid`(친구 기기)를 쓴다. P4는 이 쿠키의 형식과 의미를 바꾸지 않는다. P4 세션 쿠키는 별개의 `sl_sid`이고 둘은 공존한다.
  - 로그인할 때 이 기기의 `sl_uid`가 가리키는 인연 주인이 있고 계정에 연결된 주인이 아직 없으면, 그 주인을 계정에 연결한다(`users.bonds_owner_id`, UNIQUE).
  - 계정에 이미 연결된 주인이 있고 이 기기의 `sl_uid`와 다르면, 계정의 주인으로 `sl_uid`를 다시 발급한다(다른 기기에서도 같은 별자리). 이 기기에 있던 다른 주인은 연결하지 않는다(별자리를 합치지 않는다, 기본값 14).
  - 회원 탈퇴 때 연결된 인연 주인을 지운다(`owners` 행 삭제 → P3 스키마의 ON DELETE CASCADE로 초대·별자리·별 삭제). 내가 친구로 남긴 별은 기기 신원(`sl_fid`)에 묶여 있어 계정으로 찾을 수 없다. 개인정보처리방침에 적고 문의로 처리한다.
  - `sl_uid` 쿠키를 만드는 함수는 P3의 `lib/bonds/identity.ts`에 있다. P4는 주어진 id로 쿠키를 만드는 내보내기(`ownerIdCookie`)가 없으면 같은 서명 방식으로 하나 더한다.
- **속도 제한 네임스페이스:** P2b가 1001~1005를 쓰고, P3가 인연용 제한을 더한다. P4는 1101~1103(AUTH, PAY, WEBHOOK)을 쓴다.
- **작업 순서:** P4의 D1 작업은 P3 Task 4가 병합된 뒤에 시작한다. 인연 신원 연결(P4 Task 13)은 P3 Task 6(identity.ts) 병합 뒤에 한다. 약관·개인정보 개정(P4 Task 18)은 P3 Task 12의 문구 위에 덧붙인다.

### P2b와 같이 쓰는 것

P4는 P2b 강화 작업(서버 쪽 지출 집계 `lib/api/spend.ts`, `keyedHash`, IPv6 /64 키, `stream.ts`의 비용 기록, `SITE.price.premium`, 신뢰 페이지)이 커밋된 뒤에 시작한다. 지금 작업 트리에서 다른 에이전트가 이 파일들을 고치고 있다. P4 Task 0은 이것이 커밋됐는지, 전체 테스트가 초록인지 확인하고 아니면 멈춘다.

### P5와의 경계

프리미엄 생성기(카드 10장, 궁합, 신년운세)는 P5다. P4의 주문·원장·잠금 해제는 상품 id로 일반화돼 있어서, P5는 생성 경로를 만들고 카탈로그의 `deliverable`을 켜면 된다.

## 5. 흐름

### 5.1 로그인 (결제나 선물 직전에만)

1. 결과 화면의 잠금 시트에서 로그인하지 않은 사용자가 결제가 열린 상태면 주 버튼이 `로그인하고 전체 풀이 보기`다. 아래에 `처음 가입하면 별조각 10개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요`와 가격 `전체 풀이 2,900원`을 보인다.
2. `/login?next=/tarot/result`: `만 14세 이상이에요` 확인 → `카카오로 계속하기` → `GET /api/auth/kakao/start?age=1&returnTo=…`.
3. 시작 경로는 서명한 10분짜리 `sl_oauth` 쿠키(state, 돌아갈 곳, 목적, 나이 확인)를 두고 카카오 인가 화면으로 303.
4. 카카오가 `…/callback?code&state`로 돌려보낸다. 서버는 쿠키의 state와 상수 시간 비교 → 인가 코드로 토큰(`client_secret` 포함) → `GET /v2/user/me`로 회원번호와 닉네임 → 토큰은 버린다(저장하지 않는다).
5. 회원번호는 `HMAC(STARLOG_ACCOUNT_SECRET, "kakao:"+id)`로만 저장한다. 처음 가입이면 사용자 행을 만들고 가입 선물을 준다(`gift_claims`로 카카오 계정당 한 번, 탈퇴 뒤에도 1년 기억).
6. 세션 행을 만들고 `sl_sid` 쿠키(서명, HttpOnly, SameSite=Lax, Secure, 30일)를 둔 뒤 `returnTo?login=ok`로 303.
7. 취소(`error` 파라미터)는 `login=cancel`, 실패는 `login=failed`, 판매가 닫혀 있으면 `login=closed`로 돌아간다. 화면은 이 값에 맞는 한 줄을 보인다. URL에는 개인정보를 넣지 않는다.

### 5.2 건별 결제

1. 잠금 시트의 `2,900원 결제하고 보기` → `/pay/checkout?product=tarot&returnTo=/tarot/result`.
2. 결제 화면이 `GET /api/pay/checkout?product=tarot`로 상품명, 서버가 정한 금액, 고객 키, 클라이언트 키, 모드(toss/mock)를 받는다.
3. 토스 SDK(`https://js.tosspayments.com/v2/standard`, 스크립트 태그로 로드, npm 의존성 추가 없음) → `TossPayments(clientKey).widgets({customerKey})` → `setAmount({currency:"KRW", value})` → `renderPaymentMethods({selector, variantKey:"DEFAULT"})`, `renderAgreement({selector, variantKey:"AGREEMENT"})`.
4. 결제 화면에는 상품, 가격, 범위 3줄, **청약철회 안내와 필수 확인 체크**가 있다. 확인해야 금색 `2,900원 결제하기`가 켜진다.
5. 누르면 `POST /api/pay/orders {productId, returnTo, ack:true}` → 서버가 카탈로그 가격으로 주문을 만든다(주문번호 24자 `[A-Za-z0-9_-]`, 확인 시각 저장). 클라이언트는 받은 금액이 화면 금액과 같은지 확인하고 `widgets.requestPayment({orderId, orderName, successUrl, failUrl})`.
6. 토스가 `/pay/success?paymentType&orderId&paymentKey&amount`로 돌려보낸다. 성공 화면이 `POST /api/pay/confirm {paymentKey, orderId, amount}`.
7. 서버 승인(5.3) → 성공이면 `returnTo?unlock=paid`로 이동 → 결과 화면이 자동으로 결제한 풀이를 연다(5.4).
8. 실패는 `/pay/fail?code&message&orderId`. `PAY_PROCESS_CANCELED`(사용자가 닫음)는 "결제를 취소했어요 · 청구된 금액은 없어요". 승인 API를 부르지 않는다.

### 5.3 서버 승인 (멱등)

- 로그인과 주문 소유자를 확인한다. 쿼리의 `amount`가 **주문의 금액과 다르면** 승인하지 않고 주문을 실패로 둔다(토스 인증은 10분 뒤 만료되어 청구되지 않는다).
- `created → confirming`을 조건부 UPDATE로 한 번만 가져간다. 두 번째 요청(새로고침, 두 번 누름)은 이미 결제면 성공, 아니면 `PAY_PENDING`.
- `POST https://api.tosspayments.com/v1/payments/confirm`, 헤더 `Authorization: Basic base64(secretKey + ":")`, `Idempotency-Key: confirm-<orderId>`, 본문 `{paymentKey, orderId, amount}`(금액은 **주문의 금액**).
- 응답이 `status: DONE`, 같은 주문번호, 같은 금액이면 한 D1 batch로: 주문 `paid`, 결제 행(UNIQUE paymentKey), 그 상품에 묶인 유료 로트(UNIQUE order_id), 원장 `grant`(UNIQUE idem). 같은 주문을 두 번 반영하면 UNIQUE 위반으로 batch 전체가 되돌려지고 "이미 반영됨"으로 처리한다 → **승인이 두 번 와도 지급은 한 번.**
- `ALREADY_PROCESSED_PAYMENT`면 주문번호로 결제를 조회해 같은 반영을 한다.
- 4xx(카드 거절 등)는 실패로 두고 토스의 메시지를 보인다.
- 응답이 없거나 5xx면 `confirming`으로 두고 `PAY_PENDING`. 성공 화면은 2초마다 `GET /api/pay/orders?id=`를 부르고, 서버는 30초가 지난 `confirming` 주문을 **토스에 조회해서** 결정한다(토스가 기준).

### 5.4 풀이 열기와 돈 안전 불변식

잠금 해제 방법은 요청 본문의 `unlock.method`다.

| 방법 | 조건 | 기록 |
|---|---|---|
| `beta` | 결제가 모두에게 열리기 전(또는 운영자). 기존 쿠키 할당량과 서버 한도 | 기기 저장만(지금과 같음) |
| `paid` | 로그인 + 그 상품에 묶인 쓰지 않은 유료 로트 | 원장 예약 → 전달 시 차감, 계정에 저장 |
| `free` | 로그인 + 별조각 10개 이상(표준 상품만) | 같음 |
| `owner` | `sl_owner` | 원장 없음. 로그인해 있으면 계정에 저장 |

**불변식:**

1. **전달 전에는 차감하지 않는다.** 생성 경로는 스트림을 시작하기 전에 단위를 **예약**한다(로트 잔량에서 빼고 `unlocks` 행을 `reserved`로, 원장 `reserve`). 풀이가 검증을 통과하면, **`done` 이벤트(또는 JSON 응답)를 보내기 전에** 한 batch로 풀이를 계정에 저장하고 원장 `spend`, `unlocks`를 `delivered`로 바꾼다. "전달"은 검증된 풀이가 계정에 저장된 때다. 연결이 그 뒤에 끊겨도 풀이는 내 기록에서 다시 받는다.
2. **실패하면 되돌린다.** 생성 오류, 품질 실패, 거절, 240초 예산 초과, 클라이언트 이탈(`request.signal`)이면 예약을 **복구**한다(로트에 되돌리고 원장 `restore`, `released`). 복구는 한 batch이고 멱등이다.
3. **남은 예약은 스스로 풀린다.** 예약은 6분(생성 예산 240초 + 여유) 동안만 유효하다. 워커가 복구 전에 죽어도 그 사용자의 다음 요청에서 만료된 예약이 복구된다.
4. **경합해도 음수가 되지 않는다.** 로트 잔량은 `CHECK (0 <= units_left <= units_total)`이다. 활성이 아닌 로트에서 빼려는 시도는 -1이 되어 CHECK에 걸리고 예약 batch 전체가 되돌려진다. 두 기기에서 동시에 열어도 한쪽만 예약된다.
5. **정확히 한 번.** 원장 행마다 UNIQUE `idem_key`(`grant:<lot>`, `reserve:<unlock>:<lot>`, `spend:…`, `restore:…`, `refund:<lot>`, `expire:…`)가 있다. 전달과 복구의 원장 행과 로트 변경은 "예약 상태일 때만"(`WHERE EXISTS … status='reserved'`) 쓰이고, 상태 전환은 batch의 마지막 문장이다. 둘이 겹쳐도 먼저 끝난 쪽만 효과가 있다.
6. **사용자에게 불리하게 틀리지 않는다.** 전달 시점에 예약이 이미 만료·복구됐다면(느린 생성) 풀이는 저장하고 단위도 돌려준 상태로 둔다(무료로 받은 셈). 로그를 남긴다.
7. **로트 불변식:** 로트마다 `units_left = grant − reserve + restore − refund − expire`(원장 합). 환불 진행 중(`refunding`)인 로트만 예외다. 테스트가 매번 확인한다.

**실패했을 때 화면:** "풀이를 다 적지 못했어요. 결제한 풀이는 그대로 남아 있어요." 주 버튼 `다시 열기`, 보조 링크 `환불받기`(내 정보 결제 내역). 별조각이면 "별조각은 그대로예요".

**자동 환불 정책(기본값 6):** 시간이 지나면 자동으로 환불하는 작업은 두지 않는다. 쓰지 않은 결제 풀이는 **사용자가 언제든 버튼 하나로 전액 환불**할 수 있다. 운영자는 주 1회 "생성 실패 뒤 열지 않은 결제"를 조회해 먼저 연락하거나 환불한다(런북).

### 5.5 환불

- **쓰지 않은 결제**(로트 잔량 = 전체, 예약 없음): 내 정보에서 `환불받기` → `POST /api/pay/refund {orderId}`.
  1. 로트를 먼저 잠근다(`units_left = 0`, `refunding`, 조건부). 잠그는 사이 열 수 없다.
  2. `POST /v1/payments/{paymentKey}/cancel {cancelReason}` + `Idempotency-Key: cancel-<orderId>`.
  3. 성공이면 한 batch로 주문 `refunded`, 결제 행 갱신, 로트 `refunded`, 원장 `refund`.
  4. 4xx면 로트와 주문을 되돌린다. 응답이 없으면 `refunding`으로 두고 60초 뒤 조회로 정한다(토스에서 취소됐으면 반영, 아니면 되돌림).
- **이미 연 풀이**는 청약철회가 제한된다(6절). 내용이 안내와 다르게 제공된 경우 등은 문의로 처리한다.
- **토스 관리자 화면에서 취소**하면 웹훅(`PAYMENT_STATUS_CHANGED`, `CANCELED`)이 와서 같은 반영을 한다. 이미 연 풀이였다면 주문만 환불로 표시하고 로그를 남긴다.

### 5.6 웹훅

- `POST /api/pay/webhook`(토스 개발자센터에 등록). `PAYMENT_STATUS_CHANGED`만 처리한다. 결제 웹훅에는 서명 헤더가 없으므로 **본문을 믿지 않고 `GET /v1/payments/{paymentKey}`로 다시 조회**해 그 결과만 반영한다.
- `DONE` + 결제 전 상태 → 승인 반영(승인 응답을 놓친 경우). 취소 → 5.5와 같은 반영. `ABORTED`/`EXPIRED` → 실패.
- 10초 안에 200을 준다. 조회가 실패하면 200이 아닌 응답을 줘서 토스가 다시 보내게 한다(최대 7회).

### 5.7 계정에 보관과 옮기기

- 로그인해서 연 풀이(결제·별조각·운영자)는 자동으로 계정에 저장한다. 저장 내용은 기기에 저장하는 장(章)과 같은 모양(질문, 상황, 메모 또는 출생 정보, 카드, 풀이, 장 토큰, 이어서 물어보기)이고, **AES-256-GCM으로 암호화**해 D1에 둔다(키는 `STARLOG_ACCOUNT_SECRET`에서 HKDF로 파생).
- 다른 기기에서 로그인하면 내 정보·내 기록이 `GET /api/readings`로 받아 기기 저장소에 합친다. 이어서 물어보기는 계정 사본에도 기록된다.
- **기기에만 있던 풀이 옮기기(claim):** 로그인하면 내 정보에 `이 기기에 있는 풀이 N개를 계정에 보관할까요?`와 `계정에 보관하기`가 보인다. 누르면 20개씩 `POST /api/readings/claim`. 서버는 각 풀이의 장 토큰이 **우리가 서명한 것이고 풀이 내용이 그대로인지**(서명 + 다이제스트, 만료는 보지 않음)만 받아들인다. 같은 풀이를 두 번 옮기면 한 번만 저장된다. 사용자당 300개까지.
- 계정 사본 지우기: 내 정보의 `계정에 보관한 풀이 모두 지우기`가 서버 사본을 모두 지운다. 이 기기의 기록은 그대로 두고, 기기의 기록은 기존 `이 기기에 저장된 기록 모두 지우기`로 따로 지운다. 지금 기록 화면에는 한 건씩 지우는 기능이 없어 P4도 만들지 않는다.

### 5.8 회원 탈퇴 (개인정보 파기)

1. 내 정보 `회원 탈퇴` → 확인 시트(열지 않은 결제 N건은 전액 환불, 남은 별조각은 사라짐, 계정에 보관한 풀이와 연결된 별자리는 지워짐, 결제 기록은 법에 따라 5년 보관, 이 기기의 기록은 따로 지울 수 있음).
2. `POST /api/account/delete-intent`(같은 출처 + 세션) → 세션에 묶인 5분짜리 서명 토큰 → `GET /api/auth/kakao/start?purpose=delete&intent=…` → 카카오 재인증.
   - GET 한 번으로 탈퇴가 시작되지 않게 하려는 장치다(다른 사이트가 링크로 탈퇴를 유도하는 CSRF 방지).
3. 콜백은 카카오 회원번호가 세션 사용자와 같은지 확인한다.
4. 쓰지 않은 결제를 모두 환불한다. 하나라도 실패하면 탈퇴를 멈추고 `delete=refund-failed`로 돌아가 문의를 안내한다.
5. 한 batch로 삭제한다.
   - 남은 별조각 소멸(원장 `expire`), 계정 풀이 삭제, 세션 삭제, 연결된 인연 주인 삭제.
   - 사용자 행은 식별값(`kakao_key`, 닉네임)을 비운 묘비로 남긴다(주문·원장이 5년 보관 대상이라 참조가 필요).
6. 카카오 연결 끊기(`POST /v1/user/unlink`, 방금 받은 토큰) → 세션 쿠키 삭제 → `/me?account=deleted`.

## 6. 법무·심사

- **청약철회(전자상거래법 제17조 제2항 제5호, 같은 조 제6항):**
  - 디지털콘텐츠는 제공이 시작되면 청약철회가 제한된다. 대신 시험 사용 상품 제공 등의 조치가 필요하다.
  - 맛보기가 시험 사용이다(타로 첫 카드 풀이 전체와 자리별 키워드, 사주 요약 풀이).
  - 결제 화면에서 제한 사실을 알리고 확인 체크를 받는다. 확인 시각은 주문에 저장한다.
  - **제공이 시작된 때는 "결제한 풀이가 완성되어 계정에 저장된 때"로 정한다.** 그 전(생성 실패 포함)에는 기한 없이 전액 환불한다. 법정 7일보다 넓다(기본값 5).
- **영수증:** 토스 결제 객체의 `receipt.url`을 저장해 결제 내역에 `영수증 보기`로 연결한다. 이메일은 받지 않으므로 이메일 영수증은 없다.
- **사업자 정보:** 푸터와 약관의 사업자 정보는 `SITE.business`에서 온다. 주소와 전화는 커밋 25fa670, da8effb로 채워졌다.
- **개인정보처리방침에 더할 것:**
  - 수집 항목: 카카오 회원번호(되돌릴 수 없는 값으로만 저장), 닉네임, 만 14세 확인 시각, 결제 기록(주문번호·금액·결제수단 종류·승인·취소 시각. 카드번호 등은 토스페이먼츠가 처리하고 운영자는 받지 않는다), 계정에 보관한 풀이(암호화 저장), 세션.
  - 수집 출처: 카카오(로그인).
  - 처리 위탁: 토스페이먼츠(결제), Cloudflare(저장, 국외 이전 미국).
  - 보유 기간: 계약·청약철회 기록 5년, 대금결제·공급 기록 5년, 소비자 불만·분쟁 3년(전자상거래법 제6조와 시행령 제6조). 가입 선물 지급 기록(가명 값) 탈퇴 뒤 1년. 세션 30일.
  - 파기 절차(5.8).
- **약관:** 회원(카카오), 건별 결제, 별조각(무료·환불 불가·소멸 규칙), 탈퇴 시 처리, 서비스 종료 시 쓰지 않은 결제 환불. 달빛 충전은 판매하지 않으므로 뺀다. 시행일은 바꾼 약관을 공지하고 7일 뒤로 한다(약관 제3조, 기본값 17).
- **토스 심사 준비물:** 사이트에 상품·가격(/pricing), 환불 정책(/refund), 이용약관, 사업자 정보 푸터, 결제 흐름(테스트 키로 동작). 실제 심사 요건은 토스 영업 담당 안내로 확인한다(문서로 확인하지 못함).

## 7. 데이터 모델 (D1, `0002_accounts_payments.sql`)

시간은 epoch ms, 돈은 원 단위 정수, 단위는 달빛·별조각 개수다.

| 테이블 | 핵심 열 | 제약·용도 |
|---|---|---|
| `users` | id, kakao_key(HMAC), nickname, customer_key(토스), age_confirmed_at, bonds_owner_id, created_at, last_login_at, deleted_at | kakao_key UNIQUE, customer_key UNIQUE, bonds_owner_id UNIQUE. 탈퇴하면 식별값을 비운 묘비 |
| `sessions` | id, user_id, created_at, expires_at, revoked_at | 30일. 로그아웃·탈퇴로 취소 |
| `gift_claims` | kakao_key, claimed_at | PK. 선물은 카카오 계정당 한 번. 탈퇴 뒤 1년 보관 |
| `orders` | id(=토스 orderId), user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, payment_key, fail_code | status ∈ created, confirming, paid, failed, refunding, refunded |
| `payments` | payment_key, order_id, method, total_amount, status, approved_at, receipt_url, canceled_amount, canceled_at, mode(test/live/mock) | payment_key PK, order_id UNIQUE |
| `credit_lots` | id, user_id, currency(paid/free), source(order/gift/admin), order_id, product_id(용도 지정), units_total, units_left, status, expires_at | order_id UNIQUE, CHECK 0 ≤ units_left ≤ units_total |
| `unlocks` | id, user_id, product_id, currency, allocations(JSON), status(reserved/delivered/released), reserved_until, reading_id | 예약 한 건 |
| `ledger` | user_id, currency, kind, units(>0), lot_id, unlock_id, order_id, idem_key | idem_key UNIQUE. kind ∈ grant, reserve, spend, restore, refund, expire |
| `readings` | id, user_id, kind, product_id, source(paid/free/owner/claimed), unlock_id, digest, payload(암호문), key_version | unlock_id UNIQUE, (user_id, digest) UNIQUE |

- 달빛 묶음은 P4에서 팔지 않지만 같은 원장이 받는다. 묶음 주문은 `product_id`가 없는 유료 로트를 만들고, 풀이를 열 때 표준 상품의 단위만큼 예약하면 된다.
- 묶음 환불 계산(보너스 먼저 쓴 것으로 봄)은 로트 단위로 하면 된다(`lib/pricing.ts moonRefundKrw`).

## 8. API

| 경로 | 설명 |
|---|---|
| `GET /api/me` | `{payments, owner, user: null \| {nickname, stardust, stardustExpiresAt, unused[{orderId, productId}]}}`. 세션 쿠키가 없으면 D1을 건드리지 않는다 |
| `GET /api/auth/kakao/start?returnTo&age=1` (`&purpose=delete&intent=`) | 카카오로 303 |
| `GET /api/auth/kakao/callback` | 로그인·탈퇴 처리 후 303 |
| `POST /api/auth/logout` | 세션 취소 |
| `POST /api/account/delete-intent` | 탈퇴 재인증 URL |
| `GET /api/pay/checkout?product=` | 결제 화면 정보(금액·고객 키·클라이언트 키·모드) |
| `POST /api/pay/orders` / `GET /api/pay/orders[?id=]` | 주문 생성(확인 필수) / 결제 내역·상태(대사 포함) |
| `POST /api/pay/confirm` | 승인 |
| `POST /api/pay/refund` | 쓰지 않은 결제 환불 |
| `POST /api/pay/webhook` | 토스 웹훅 |
| `GET /api/readings`, `DELETE /api/readings?id=`, `POST /api/readings/claim` | 계정 풀이 |
| `POST /api/tarot/reading`, `POST /api/saju/reading` | 본문에 `unlock: {method}` 추가. 사주는 저장용 `display: {title, summary}` |
| `POST /api/followup` | 본문에 `readingId` 추가(계정 사본에 이어서 물어보기 기록) |

새 오류 코드:

| 코드 | 상태 | 의미 |
|---|---|---|
| `LOGIN_REQUIRED` | 401 | 로그인 필요 |
| `PAYMENT_REQUIRED` | 402 | 결제가 열려 무료 전체 풀이가 끝남 |
| `NO_CREDIT` | 402 | 쓸 수 있는 결제·별조각 없음 |
| `PAY_FAILED` | 402 | 승인·취소 실패 |
| `FORBIDDEN` | 403 | 출처 불일치, 운영자 아님 |
| `NOT_AVAILABLE` | 409 | 팔 수 없는 상품, 판매 닫힘 |
| `PAY_PENDING` | 409 | 확인 중 |
| `NOT_REFUNDABLE` | 409 | 환불할 수 없는 결제 |
| `PAY_UNAVAILABLE` | 503 | D1·비밀값·키 없음 |

## 9. 화면

- **잠금 시트(결과 화면):**
  - 범위 3줄은 소유자 문구 그대로 둔다. 결제 모드에서는 위에 `전체 풀이 · 2,900원`을 둔다.
  - 주 버튼 하나(금색)만 쓴다.
    - 로그인 안 함: `로그인하고 전체 풀이 보기`
    - 결제한 풀이가 있음: `결제한 풀이 열기`
    - 별조각 10개 이상: `별조각 10개로 보기`(보조 `2,900원 결제하고 보기`)
    - 그 밖: `2,900원 결제하고 보기`
    - 베타: 지금과 같음
  - 운영자에게는 흐린 보조 버튼 `운영자로 무료 열기`를 보인다.
  - 청약철회 안내는 결제 화면에서 한다.
- **결제 화면:** 단계 표시, 상품명·가격, 범위, 청약철회 안내 상자와 확인 체크, 토스 결제수단·약관 위젯, 금색 `2,900원 결제하기`. 모의 모드에서는 `테스트 결제예요` 안내와 `테스트 결제 실패` 보조 버튼을 보인다.
- **성공 화면:** `결제를 확인하고 있어요` → 결과 화면으로 가서 자동으로 연다. **실패 화면:** 코드별 문구, `풀이로 돌아가기`.
- **로그인 화면:** 카카오 버튼 하나(Google 제거), 만 14세 확인, 가입 선물 안내, 약관·개인정보 동의 문구, `login=` 상태 문구.
- **내 정보:**
  - 로그인 안 함: 결제가 열렸으면 `로그인` 버튼, 베타면 지금과 같음.
  - 로그인함: 닉네임, 별조각 N개와 `M월 D일까지`, 결제한 풀이(열기·환불받기), 결제 내역(날짜·상품·금액·상태·영수증), 계정에 보관하기(옮기기), 로그아웃, 회원 탈퇴.
  - 달빛 충전 시트와 모의 충전 코드를 지운다.
- 모든 문구는 해요체, 12px 미만 글자 없음, 44px 터치 영역, 금색 주 버튼 하나, 모션 줄이기 존중. 제품 메타 문구(라이브러리명, "예시예요")는 쓰지 않는다.

## 10. 보안

- 가격은 서버 카탈로그(`lib/pay/catalog.ts`, `SITE.price`)로만 정한다. 주문 요청에는 상품 id와 확인만 있다. 승인은 **주문의 금액**으로 부르고, 응답의 금액·주문번호·상태를 다시 확인한다.
- 비밀값: `TOSS_SECRET_KEY`, `KAKAO_CLIENT_SECRET`, `STARLOG_ACCOUNT_SECRET`(32자 이상, 바꾸지 않음), 기존 `STARLOG_SIGNING_SECRET`. 모두 Worker 비밀값(`wrangler secret put`)이다.
  - `NEXT_PUBLIC_TOSS_CLIENT_KEY`는 공개 키지만 **실행 시점에 서버가 읽어 결제 화면에 넘긴다**(빌드에 굽지 않아 테스트·라이브 키를 비밀 키와 함께 바꾼다).
  - 서버는 두 키가 모두 test이거나 모두 live인지 확인하고, 섞였으면 503.
- `check-client-bundle.mjs`는 유료 문구에 더해 `test_gsk_`, `live_gsk_`, `test_sk_`, `live_sk_` 접두사와, 셸에 값이 있으면 비밀값 자체를 찾는다(값은 출력하지 않음).
- CSRF:
  - OAuth state(서명 쿠키 + 상수 시간 비교).
  - 모든 쿠키 SameSite=Lax.
  - 상태를 바꾸는 계정·결제 POST는 Origin(없으면 Referer)이 자기 출처와 같아야 한다. JSON 본문만 받는다(폼 CSRF 차단).
  - 탈퇴는 POST로 받은 의도 토큰이 있어야 시작한다.
- 세션: 서명 쿠키 + D1 행(취소 가능). 서명 비밀을 바꾸면 모두 로그아웃된다.
- 속도 제한(IP, IPv6는 /64):
  - AUTH 20/분, PAY 20/분, WEBHOOK 60/분.
  - 전체 풀이는 기존 FULL_LIMITER 5/분.
  - 결제·별조각으로 여는 풀이는 베타의 기기·네트워크 하루 한도와 무료 지출 차단기(`BETA_DAILY_BUDGET_KRW`)를 거치지 않는다. 결제로 제한되기 때문이다. 대신 비용은 `cost.paid` 로그로 따로 남긴다(기본값 16).
- 로그에는 주문번호, 상태, 코드만 남긴다. 카카오 회원번호, 닉네임, 토큰, 결제키, 질문, 출생 정보는 남기지 않는다.
- 카카오 토큰은 저장하지 않는다. 카카오 회원번호는 HMAC 값만 저장한다.
- 모의 토스(`STARLOG_PAY=mock`)와 모의 카카오(`STARLOG_KAKAO=mock`)는 프로덕션에서 거부한다.

## 11. 비용과 수수료 (단위 경제)

| 항목 | 타로 2,900원 | 사주 2,900원 | 근거 |
|---|---|---|---|
| 부가세(포함가의 1/11) | 264원 | 264원 | 가격은 부가세 포함으로 가정 |
| 토스 수수료 3.4% + 부가세 | 108원 | 108원 | tosspayments.com/about/fee(2026-10-01 열람): 신용·체크카드 일반 3.4%, 간편결제 3.4%, VAT 별도. 영·중소 우대율은 국세청 구간으로 반기마다 자동 적용되며 수치는 공개 페이지에 없음 → **가정: 우대 전 최대치** |
| AI 비용(전체 풀이) | 약 214원 | 약 335원 | 소유자 측정값. ai:smoke 2026-09-30 5회 평균 타로 213.8원(최대 259), 사주 301.8원(최대 333) |
| 이어서 물어보기 3번 | 측정 안 함 | 측정 안 함 | 맛보기(타로 약 49원, 사주 약 33원)와 비슷한 low effort로 추정. **P4 전에 측정 필요** |
| 남는 돈(물어보기 제외) | 약 2,314원 | 약 2,193원 | |
| 품질 재생성 최악(2회) | +214~259원 | +335원 | 드묾 |

- 고정비: 가입비 220,000원(최초 1회), 연관리비 110,000원(공개 페이지 값, 프로모션 면제 여부는 영업 안내로 확인).
- 가입 선물 1회 비용은 신규 가입자당 약 214~335원 + 이어서 물어보기다. 카카오 계정당 한 번으로 묶는다.
- 결제 전 무료 비용(맛보기, 오늘의 한 장)은 기존 베타 한도가 막는다.

## 12. 기능 플래그와 출시 순서

환경 변수:

| 이름 | 값 | 뜻 |
|---|---|---|
| `STARLOG_PAYMENTS` | `off`(기본) / `owner` / `on` | 새 판매·가입·선물을 누구에게 여는가. **이미 가진 결제·별조각을 쓰는 것은 어느 값에서도 막지 않는다**(되돌려도 산 사람이 갇히지 않음). `on`이면 베타의 하루 1번 무료 전체 풀이가 끝난다 |
| `STARLOG_PAY` | `toss`(기본) / `mock` | 모의 토스(개발·e2e) |
| `STARLOG_KAKAO` | `kakao`(기본) / `mock` | 모의 카카오(개발·e2e) |

순서:

1. **어둡게 배포:** P4 병합 → D1 원격 마이그레이션(`wrangler d1 migrations apply starlog --remote`) → 비밀값 등록(테스트 키) → 배포, `STARLOG_PAYMENTS=off`. 사용자 화면은 그대로다.
2. **운영자 확인(프로덕션, 테스트 키):** `STARLOG_PAYMENTS=owner` → 운영자 패스 기기만 로그인·결제가 보인다. 런북의 점검표(로그인, 선물, 테스트 결제, 자동 열기, 실패 뒤 다시 열기, 환불, 웹훅, 탈퇴, 영수증, 다른 기기 동기화)를 통과한다.
3. **토스 심사:** 라이브 계약 신청. 사이트 점검 요소는 6절.
4. **라이브 키:** `NEXT_PUBLIC_TOSS_CLIENT_KEY=live_gck_…`, `TOSS_SECRET_KEY=live_gsk_…`를 함께 바꾸고(섞이면 서버가 거부) 재배포한다. 여전히 `owner`에서 운영자가 실제 2,900원 결제 → 풀이 열기, 한 번 더 결제 → 환불을 확인한다.
5. **켜기:** 약관 시행일 뒤에 `STARLOG_PAYMENTS=on`. 하루 1번 무료 전체 풀이가 끝나고 가입 선물이 시작된다. 첫 24시간은 런북의 조회(실패·대기 주문, 예약 누수, 로트 불변식)를 두 시간마다 본다.
6. **되돌리기:** `STARLOG_PAYMENTS=off`로 새 판매만 닫는다. 가진 결제·별조각은 계속 쓰고 환불할 수 있다.

## 13. 로컬 개발과 테스트

- **단위·통합 테스트(Vitest):**
  - `migratedTestD1()`이 `node:sqlite` 메모리 DB에 `apps/web/migrations/NNNN_*.sql`을 이름 순서로 적용한다. `setTestDb()`로 라우트가 그 DB를 쓴다.
  - 라우트 핸들러를 `Request`로 직접 부른다(P2b 방식).
  - 같은 스키마와 원장 계약은 `*.int.test.ts`에서 로컬 D1(workerd, `getPlatformProxy`)로도 돈다. `CI_NO_WORKERD=1`이면 건너뛴다.
  - 모의 토스는 한 번 승인되면 `ALREADY_PROCESSED_PAYMENT`, `mock_fail…` 결제키는 거절, 취소는 잔액 0.
  - 모의 카카오는 `mock:<이름>` 코드다. 이름이 없으면 로그인마다 새 계정이 된다. 같은 로컬 D1로 e2e를 되풀이해도 매번 가입 선물부터 시작한다.
- **로컬 개발:**
  - `STARLOG_CF_DEV=1 next dev --port 3100`이면 Miniflare 로컬 D1(`apps/web/.wrangler/state`)을 쓴다. 먼저 `pnpm --filter @starlog/web db:migrate:local`(= `wrangler d1 migrations apply starlog --local`).
  - 플래그가 없으면 P3처럼 D1 없이 돌고, 계정·결제는 503이다.
  - 카카오 실로그인은 localhost 리다이렉트가 등록돼 있어 로컬에서도 된다(`.env.local`에 키).
  - 토스 테스트 키로 실제 위젯도 로컬에서 동작한다(successUrl이 localhost).
- **e2e(Playwright):** 개발 서버 env `STARLOG_CF_DEV=1`, `STARLOG_PAYMENTS=owner`, `STARLOG_PAY=mock`, `STARLOG_KAKAO=mock`, `STARLOG_AI=mock`. `pnpm e2e`가 로컬 D1 마이그레이션을 먼저 적용한다.
  - 기존 베타 흐름(운영자 아님)은 그대로 돌고, 결제 흐름 테스트는 운영자 패스로 판매를 연다.
  - 시나리오: 로그인 → 선물로 열기 → 결제 → 자동 열기 → 내 정보 결제 내역 → 결제 한 번 더 → 환불.
  - 실제 토스 테스트 결제는 2단계 운영자 확인에서 사람이 한다.

## 14. 기본값 (소유자 확인 필요)

1. **별조각 소멸:** 받은 날부터 90일째 되는 날 밤 12시(한국 시간)까지 쓸 수 있다(예: 10월 1일에 받으면 12월 30일까지). 여러 번 받으면 먼저 사라지는 것부터 쓴다.
2. **가입 선물:** 카카오 계정당 평생 한 번. 탈퇴 뒤 다시 가입해도 1년 안에는 다시 주지 않는다(가명 값으로 기록 보관, 개인정보처리방침에 명시).
3. **세션:** 30일 고정(연장 없음). 로그아웃하면 그 기기 세션만 끝난다.
4. **카카오 식별:** 회원번호는 HMAC 값으로만 저장하고, 카카오 토큰은 저장하지 않는다. 그래서 탈퇴할 때 카카오 재인증이 한 번 필요하다.
5. **청약철회 제한 시점:** 풀이가 완성되어 계정에 저장된 때. 그 전에는 기한 없이 셀프 전액 환불(법정 7일보다 넓게).
6. **생성 실패:** 시간 기반 자동 환불 없음. 결제한 풀이는 남고 사용자가 다시 열거나 즉시 환불한다. 운영자는 주 1회 조회해 먼저 연락·환불한다.
7. **계정 보관:** 로그인해서 연 풀이는 자동 저장(암호화). 기기에만 있던 풀이는 사용자가 누를 때만 옮긴다. 사용자당 300개.
8. **범위 문구:** 소유자 문구 "이 기기에 계속 보관"을 그대로 둔다(계정 보관은 내 정보·개인정보처리방침에서 안내).
9. **프리미엄:** 목록과 가격만 보이고 P5 전에는 팔지 않는다. 2027 신년운세는 **2026-11-15 00:00(한국 시간)**부터 판매 가능으로 둔다(P5 생성기가 있을 때).
10. **결제수단:** 토스 관리자에서 위젯 결제수단을 카드와 간편결제로만 둔다(가상계좌·계좌이체 없음 → 입금 대기·현금영수증 흐름 없음).
11. **게스트 결제 없음:** 결제하려면 로그인. 토스 `customerKey`는 사용자마다 무작위(`c_`+24자, 50자 이내 규칙 충족).
12. **탈퇴:** 쓰지 않은 결제는 자동 전액 환불(실패하면 탈퇴 중단). 결제·원장 기록은 가명 묘비에 묶어 5년 보관.
13. **결제 열림(`on`) 뒤:** 하루 1번 무료 전체 풀이 종료. 맛보기 하루 5번, 오늘의 한 장, 지금의 한 장, 운영자 패스는 그대로.
14. **인연 신원:** 로그인 때 기기의 인연 주인을 계정에 연결한다. 계정에 이미 다른 주인이 연결돼 있으면 계정 쪽이 이긴다(이 기기의 다른 별자리는 합치지 않음).
15. **속도 제한:** AUTH 20/분, PAY 20/분, WEBHOOK 60/분(IP·/64 기준).
16. **비용 차단기:** 결제·별조각으로 연 풀이의 AI 비용은 무료 지출 차단기(`BETA_DAILY_BUDGET_KRW`)에 넣지 않고 따로 기록한다. 그래서 유료 풀이가 무료 맛보기를 막지 않는다.
17. **약관 시행일:** 배포하고 공지한 날부터 7일 뒤(계획의 기본 날짜 2026-10-15, 배포가 늦어지면 옮긴다). 결제는 이 날 이후에 켠다.
18. **수수료 가정:** 카드·간편결제 3.4% + 부가세(공개 최대치). 가입비 220,000원, 연관리비 110,000원.
19. **웹훅:** `PAYMENT_STATUS_CHANGED`만 등록. 검증은 재조회로 한다.
20. **자동 열기:** 결제 성공 뒤 결과 화면으로 돌아가면 바로 생성을 시작한다(사용자가 한 번 더 누르지 않음). 흐름 상태가 사라진 경우(다른 브라우저로 돌아옴)에는 내 정보의 `결제한 풀이`에서 새로 뽑아 연다. 결제 권리는 특정 뽑기에 묶이지 않는다.
21. **로컬 개발의 D1:** P3처럼 기본 `next dev`는 D1 없이 돌고, `STARLOG_CF_DEV=1`일 때만 Miniflare 로컬 D1을 붙인다(계정·결제 개발과 e2e용).
22. **계정 사본 지우기:** 한 건씩이 아니라 내 정보에서 `계정에 보관한 풀이 모두 지우기`로 한다(지금 기록 화면에 개별 삭제가 없음).
23. **`/api/me` 속도 제한 없음:** 세션 쿠키가 있을 때만 D1을 읽는 가벼운 조회라 페이지마다 불러도 되게 두었다.

## 15. 막힌 것과 위험

- **막힘(소유자):**
  - 토스 라이브 계약·심사.
  - Worker 비밀값 등록: `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `STARLOG_ACCOUNT_SECRET`. 키는 채팅에 붙이지 않는다.
  - 카카오 콘솔: 카카오 로그인 활성화, 동의 항목 닉네임, 클라이언트 시크릿 사용, Web 플랫폼 도메인.
  - 토스 개발자센터: 웹훅 URL 등록.
- **막힘(순서):** P2b 강화 작업과 P3 Task 4가 커밋되기 전에는 P4 D1 작업을 시작할 수 없다(같은 파일을 고침). 인연 연결은 P3 Task 6 뒤.
- **위험:**
  - `node:sqlite`와 D1의 SQL 차이. 둘 다 SQLite지만 D1 쪽 오류 메시지 형식이 다를 수 있다. 제약 위반 판별은 "constraint failed" 문자열로 한다.
  - 운영자 확인 단계에서 실제 D1로 한 번 더 검증한다(런북).
  - 계획을 쓰면서 `getPlatformProxy`(로컬 D1 int 테스트)는 이 샌드박스에서 workerd를 띄우지 못했다(`fetch failed`/`ECONNRESET`). 같은 엔진의 `wrangler d1 execute --local`은 동작했다. int 테스트가 구현 환경에서도 안 뜨면 보고하고 컨트롤러가 돌린다.
  - P3의 `d1BondsRepo.int.test.ts`도 같은 방식이라 같은 영향을 받을 수 있다.
  - 토스 문서의 `customerKey` 길이 표기가 두 곳에서 다르다(SDK 페이지 50자, 빠른 참조 300자). 짧은 쪽을 지킨다.
  - 카카오톡 인앱 브라우저에서 앱카드 결제 뒤 다른 브라우저로 돌아오면 흐름 상태(sessionStorage)가 없다. 결제 권리가 뽑기에 묶이지 않으므로 내 정보에서 연다.
  - 이어서 물어보기 비용을 측정하지 않았다.
  - `enable_request_signal`로 인한 조기 중단이 실제 워커에서 확인되지 않았다(A2 리뷰). 조기 중단이 나도 복구되므로 돈은 안전하지만 사용자는 다시 열어야 한다. 운영자 확인에서 본다.

## 16. 확인한 자료 (2026-10-01)

- 토스페이먼츠(마크다운 원문을 내려받아 확인):
  - `docs.tosspayments.com/sdk/v2/js/payment-widget.md`: `widgets({customerKey})`, `ANONYMOUS`, `setAmount({currency, value})`, render 함수, `requestPayment` 파라미터, orderId 6~64자 `[A-Za-z0-9-_=]`, successUrl 쿼리 `paymentType&amount&orderId&paymentKey`, failUrl `code&message&orderId`.
  - `docs.tosspayments.com/sdk/v2/js/environment.md`: `https://js.tosspayments.com/v2/standard`, `@tosspayments/tosspayments-sdk`, 키 접두사 `test_gck`/`live_gck`.
  - `docs.tosspayments.com/reference.md`: 승인 10분, 취소 `cancelReason`과 멱등키, 상태값, `receipt`, `secret`.
  - `docs.tosspayments.com/guides/v2/get-started/llms-quick-reference.md`: Basic 인증의 콜론, Idempotency-Key(POST만, 15일), 승인 실패 시 조회 후 판단, 웹훅 무서명 → 재조회.
  - `docs.tosspayments.com/guides/v2/webhook.md`: 10초 안 200, 7회 재전송.
  - `tosspayments.com/about/fee`: 수수료.
- 카카오: `developers.kakao.com/docs/latest/ko/kakaologin/rest-api`
  - 인가 `GET kauth.kakao.com/oauth/authorize`(client_id, redirect_uri, response_type=code, state).
  - 토큰 `POST kauth.kakao.com/oauth/token`(form, client_secret 기본 활성).
  - 사용자 `kapi.kakao.com/v2/user/me`(Bearer), 연결 끊기 `POST kapi.kakao.com/v1/user/unlink`(Bearer 또는 어드민 키).
- Cloudflare: D1 `batch()`는 SQL 트랜잭션(한 문장이 실패하면 전체 되돌림), `migrations_dir`와 `wrangler d1 migrations apply --local/--remote`.
- 설치된 코드:
  - `@opennextjs/cloudflare` 1.20.7의 `initOpenNextCloudflareForDev`(개발 프로세스에서만 `getPlatformProxy` 실행);
  - wrangler 4.143의 비대화 모드 자동 승인과 미적용 마이그레이션 선택;
  - Node 25.9 `node:sqlite`(UPSERT, RETURNING, CHECK 동작 확인);
  - jsdom 30에 `<dialog>`의 `showModal`이 없음(모달 테스트에 폴리필 필요).
- 계획의 코드를 직접 돌려 본 것(저장소 밖 작업 폴더):
  - 원장 계약 13개 경우 중 11개 묶음을 `node:sqlite`에서 실행해 통과했다(예약·전달·복구·만료·환불 잠금·경합 롤백·로트 불변식).
  - `secrets.ts`(HMAC, AES-GCM 봉인·위조 거부), 토스 클라이언트(Basic 인증 콜론, 네트워크 오류), 모의 토스 동작을 실행해 통과했다.
  - 마이그레이션 0001+0002를 로컬 D1 엔진에 적용하는 데 성공했다.
  - 조건부 `INSERT … SELECT … WHERE EXISTS`와 `UPDATE … RETURNING`, CHECK 위반 시 전체 롤백을 같은 엔진에서 확인했다.
  - 저장소 안에서 `pnpm typecheck`나 Vitest는 돌리지 않았다(문서만 작성하는 작업).
