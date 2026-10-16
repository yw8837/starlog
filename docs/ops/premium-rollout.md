# 프리미엄 풀이 출시 절차 (켈틱 크로스 10장 · 프리미엄 궁합 · 2027 신년운세)

2026-10-17 작성. 대상: 운영자(사장님)와 배포 담당. 스위치는 `STARLOG_PREMIUM` 하나이고, 값은 `off` → `owner` → `on` 순서로만 올린다. 되돌릴 때는 언제든 `off`.

| 값 | 누가 보나 | 주문·미리보기 |
|---|---|---|
| `off` (지금) | 아무도 안 봄. 입구·상품 페이지·공유 이미지 없음(404) | 막힘. 이미 산 풀이만 열림 |
| `owner` | 운영자 패스를 넣은 기기만 | 운영자 기기만 |
| `on` | 모두 | 모두(결제는 `STARLOG_PAYMENTS`와 판매 기간도 따름) |

- **켈틱 크로스 10장·프리미엄 궁합은 2026-10-24 00:00 KST부터** 판매된다(사장님 2026-10-17: "지금 공지, 7일 뒤 시행"). 그 전에는 스위치가 `on`이어도 코드가 판매를 막고 "10월 24일 열려요"로 보인다. 같은 시각에 이용약관·개인정보처리방침·환불 정책의 프리미엄 조항이 저절로 본문에 들어가고 시행일이 2026-10-24로 바뀐다(그 전엔 맨 위 공지 상자 + "개정 예정" 절). 날짜는 `apps/web/lib/legal.ts`의 `PREMIUM_LEGAL_EFFECTIVE_DATE`와 `apps/web/lib/config.ts`의 두 상품 `opensAt`(테스트가 둘이 같은지 막음).
- **10/24 전에는 `on`으로 바꾸지 않는다**(바꿔도 판매는 코드가 막지만 입구가 "10월 24일 열려요"로 먼저 보인다). 운영자 확인(`owner`)은 그 전에 해도 된다.
- **배포가 10/17보다 늦어지면** 공지 기간 7일을 지키도록 위 두 날짜를 "배포일 + 7일 00:00 KST"로 바꿔 다시 배포한다(`npx vitest run apps/web/components/legal/premiumSchedule.test.tsx --maxWorkers=1`의 날짜도 같이).
- 2027 신년운세는 스위치가 `on`이면 **2026-11-15 00:00 KST에 저절로** 판매가 시작된다(코드의 `opensAt`). 그 전에는 "11월 15일 열려요"로 보이고 눌리지 않는다.
- 상품 페이지와 다리 화면은 요청마다 스위치를 읽는다(빌드에 굳지 않음). 스위치를 바꾸면 다시 빌드할 필요가 없다.
- 상태 API는 브라우저가 1분 동안 기억한다. 운영자 패스를 넣은 직후나 스위치를 바꾼 직후엔 1분 기다리거나 새로고침한다.
- 법적 문서(개인정보처리방침·이용약관 제7조의3·환불 정책)의 프리미엄 조항은 스위치와 상관없이 늘 보인다.

## 0. 켜기 전 준비 (한 번)

1. **최신 코드 배포**: 이 브랜치의 프리미엄 코드가 운영에 올라가 있는지 확인한다. `wrangler.jsonc`에 새 속도 제한 `SHARE_IMAGE_LIMITER`(namespace 1105)가 있어서 배포하면 같이 생긴다.
2. **D1 마이그레이션 확인**: `npx wrangler d1 migrations list starlog --remote`. 이번 차수에 `0009_buyer_previews.sql`(구매자 미리보기 하루 횟수)이 새로 생겼다. 배포 전에 적용해야 구매자 미리보기가 열린다. 남은 게 있으면 먼저 백업(`npx wrangler d1 export starlog --remote --output=readings-before-premium.sql`)하고 `npx wrangler d1 migrations apply starlog --remote`. 이미 적용된 마이그레이션 파일은 절대 고치지 않는다.
3. **API 크레딧**: Anthropic 선불 잔액이 운영과 같이 쓰인다. 평가·오픈 전에 잔액을 확인한다.
4. **실제 평가(4차)**: 컨트롤러가 돌린다. 저장소 루트에서
   - 모의 실행(무료): `SMOKE_PROVIDER=mock pnpm ai:premium` → 26개 호출 모두 통과, 0원
   - 실제 실행: `pnpm ai:premium` (예산 7,000원에서 자동으로 멈춤. 다른 상한은 `SMOKE_BUDGET_KRW=5000 pnpm ai:premium`)
   - 결과: `apps/web/test-results/premium-eval/<시각>-real/summary.md`(호출마다 비용·시간·검증기 결과)와 풀이 원문. 상품마다 풀이+이어서 묻기 비용이 가격의 12% 안인지, 검증기 재생성이 잦지 않은지 본다.
5. **사장님 샘플 승인**(아래 6절). 승인 전엔 `on` 금지: 지금 상품 페이지의 샘플 발췌는 모의 출력이다.

## 1. `off` (지금): 확인할 것

시크릿 창(운영자 패스 없음)에서:
- 홈에 "더 깊게 보기"가 없고, "타로 보기"는 바로 질문 만들기(`/tarot/new?new=1`)로 간다.
- `/tarot/start`에 들어가면 질문 만들기로 돌아간다.
- 사주 1/3 "무엇이 궁금해요?"에 "프리미엄" 구간이 없다. 푸터에 "프리미엄 풀이"가 없다.
- `/premium/deep-tarot`, `/premium/match`, `/premium/newyear-2027`이 404. `/api/og/premium`도 404.
- 가격표에는 지금처럼 "준비 중인 풀이"(이름·가격)만 있다.

자동 확인: `pnpm e2e --grep premium` (기본값 `E2E_PREMIUM=off`).

## 2. `owner`: 운영자 기기에서만 보며 확인

`npx wrangler secret put STARLOG_PREMIUM` → `owner`

운영자 패스를 넣은 기기에서 상품마다(판매 시작 전에는 운영자도 결제는 못 하고 "운영자로 무료 열기"로 생성을 확인한다. 결제 흐름은 판매 시작 직후 실제 주문 1건으로 확인):
1. 입구: 홈 "타로 보기" → 다리 화면(일반 타로 / 켈틱 크로스 10장) → 켈틱 → 질문 만들기 위 칩 "켈틱 크로스 10장" → 카드 10장 → 미리보기 → 열기 패널. 사주 1/3 맨 아래 "프리미엄 궁합"·"2027 신년운세"(11/15 전엔 날짜만).
2. 결제 → 풀이가 2~3번에 나눠 적힘 → 기록 화면.
3. 적는 중에 탭을 닫았다 다시 열기 → "이어서 받기"로 끝까지 받음(3번까지, 4번째는 결제가 쓰인 것으로 처리).
4. 열지 않은 구매 환불(내 정보 → 결제한 풀이).
5. 이어서 물어보기 5번, 6번째는 막힘.
6. "이미지로 공유": 이미지에 카드·관계·연도 제목만, 링크는 상품 페이지.
7. 다른 기기에서 로그인: 기록이 동기화됨. 궁합은 다른 기기에서 이어서 묻기가 막히고 "풀이한 기기에서만"이라고 나옴. 풀이한 기기에서는 로그아웃 뒤 다시 로그인해도 이어서 물어볼 수 있다.
8. 궁합 풀이 글에 상대의 생년·띠·기둥 간지·대운 연월이 없는지 읽어 본다(일간과 오행 기울기, 두 사람 관계 이름만).

같은 시간에 시크릿 창(운영자 패스 없음)에서는 1절과 똑같이 아무것도 안 보여야 한다.

자동 확인(미리보기 서버, 모의 AI): `E2E_PREMIUM=owner E2E_BASE_URL=<미리보기 주소> E2E_OWNER_CODE=<그 서버의 운영자 코드> pnpm e2e --grep premium`

## 3. `on`: 모두에게 열기

조건: 0절의 평가 통과, 6절의 샘플 승인과 교체 배포, 2절 확인 끝, 2026-10-24 00:00 KST 이후.

`npx wrangler secret put STARLOG_PREMIUM` → `on`

시크릿 창에서:
- 홈 "더 깊게 보기"(신년운세 → 궁합 → 켈틱), 다리 화면, 사주 1/3 프리미엄 두 줄, 가격표 2단 "깊게 보는 풀이", 상품 페이지 3개, 푸터 "프리미엄 풀이".
- `/sitemap.xml`에 상품 페이지 3개가 들어감(샘플·흐름 화면은 안 들어감).
- 첫 실제 주문 1건이 결제 → 풀이 → 기록까지 가는지.

## 4. 11/15 00:00 KST: 2027 신년운세 자동 오픈

할 일은 없다(스위치가 `on`이면 된다). 확인만:
- 00:00~00:02: 사주 1/3의 "2027 신년운세" 줄이 눌리는 링크로 바뀐다(상태 기억 때문에 최대 1분 늦을 수 있음). 상품 페이지 버튼이 "시작하기"가 된다.
- 첫 주문 1건이 결제 → 3파트 → 열두 달이 담긴 기록까지 가는지.
- 판매 종료는 2027-12-01 00:00 KST(코드의 `closesAt`).

## 5. 지켜볼 것 (켠 뒤 첫 24시간, 2시간마다)

D1:
- `SELECT product_id, status, COUNT(*) FROM unlocks WHERE product_id IN ('tarot-deep','match','newyear-2027') GROUP BY 1, 2;`
- 너무 오래 잡힌 예약(다음 정리 뒤에는 비어야 함): `SELECT id, product_id, reserved_until FROM unlocks WHERE status = 'reserved' AND reserved_until < (strftime('%s','now') * 1000);`
- 저장된 풀이: `SELECT kind, COUNT(*) FROM readings WHERE kind IN ('tarot-deep','match','newyear-2027') GROUP BY kind;`

로그(`wrangler tail`): `premium.part`(파트 수), `premium.reserved`, `unlock.released`(실패한 파트), `unlock.reservation_lost`(0이어야 함), 유료 비용 장부. 구매자 미리보기는 상품마다 하루 5번까지(D1 `buyer_previews`, `SELECT product_id, kst_day, COUNT(*), MAX(n) FROM buyer_previews GROUP BY 1, 2;`).

## 6. 사장님 샘플 승인

1. 4차 실제 평가 결과(0절 4)에서 상품마다 풀이 하나를 고른다.
2. 사장님이 그 풀이를 처음부터 끝까지 읽고 승인한다(안 되면 프롬프트를 고치고 그 상품만 다시 평가).
3. 승인본으로 `content/samples/premium/{tarot-deep,match,newyear-2027}.json`을 바꾼다(`input.summary`, `cards`, `reading`). 궁합 샘플에는 상대의 생년이 들어가면 안 된다.
4. `npx vitest run apps/web/lib/premium/samples.test.ts --maxWorkers=1` 통과 → 빌드 → `pnpm check:bundle` → 배포.
5. 상품 페이지의 발췌와 `/premium/<slug>/sample`에서 바뀐 글을 확인한다.

## 7. 되돌리기

`npx wrangler secret put STARLOG_PREMIUM` → `off`

- 새 주문, 무료 미리보기, 입구, 상품 페이지, 공유 이미지가 바로 사라진다.
- 이미 산 풀이는 계속 열리고(내 정보 → 결제한 풀이), 열지 않은 구매는 환불된다. 공유 링크를 받은 사람은 홈으로 간다.
- 마이그레이션은 되돌리지 않는다.

## 8. 하지 말 것

- 상품 이름("켈틱 크로스 10장", "프리미엄 궁합")을 프롬프트에 넣지 않는다. 모델이 따라 쓰면 검증기가 거절하고 다시 만드는 비용이 든다(`lib/premium/promptNames.test.ts`가 막음).
- 상대 정보를 로그·주소·공유 이미지·분석에 넣지 않는다.
- 평가를 통과하지 못했거나 샘플 승인이 없는 상품을 `on`으로 열지 않는다.
