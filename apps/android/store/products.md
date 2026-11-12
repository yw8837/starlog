# 인앱 상품 (일회성 제품) — 서버가 기대하는 값 그대로

서버는 웹 상품 id의 `-`를 `_`로 바꾼 값을 Play 상품 id로 쓴다 (`apps/web/lib/pay/play.ts:30`). 가격은 `apps/web/lib/config.ts:51-74`,
이름은 `apps/web/lib/pay/catalog.ts:44-75`, 한 줄 설명은 `/pricing`에 나오는 문장이다 (`apps/web/app/pricing/page.tsx:36,45,132`,
`apps/web/app/pricing/PremiumPricing.tsx:33`). 앱의 결제 화면 가격은 웹 카탈로그 값이라, Play에 넣는 가격이 다르면 결제 정책
위반이다("In-app pricing must match the pricing displayed in the user-facing Play billing interface",
https://support.google.com/googleplay/android-developer/answer/9858738).

Play 규칙: 상품 id는 숫자나 소문자로 시작하고 숫자·소문자·밑줄·마침표만 쓴다. "상품을 만든 후에는 상품 ID를 변경하거나
재사용할 수 없습니다." (https://support.google.com/googleplay/android-developer/answer/1153481). 모두 **소비성(consumable)으로 쓰는
일회성 제품**이다: 서버가 지급 뒤 소비 처리하므로 같은 상품을 다시 살 수 있다.

| 상품 ID (그대로 입력) | 이름 | 설명 | 가격 (KRW) | 판매 기간 |
|---|---|---|---|---|
| `tarot` | 타로 전체 풀이 | 카드 3장으로 보는 지금 | 2,900 | 상시 |
| `saju` | 사주 전체 풀이 | 타고난 결로 보는 나 | 4,900 | 상시 |
| `tarot_deep` | 켈틱 크로스 10장 | 카드 10장으로 깊게 보는 흐름 | 7,900 | 상시 |
| `match` | 프리미엄 궁합 | 두 사람의 사주로 보는 관계와 앞으로 1년 | 7,900 | 상시 |
| `newyear_2027` | 2027 신년운세 | 사주로 미리 보는 2027년 한 해 | 14,900 | 2027-12-01 0시(한국 시간)까지 (서버가 닫음) |
| `set_2027` | 2027 신년운세 + 프리미엄 궁합 | 한 번 결제로 두 풀이가 하나씩 열려요 | 18,900 | 2026-12-01 ~ 2027-12-01 (서버가 열고 닫음) |

- 판매 기간은 서버가 지킨다(주문을 만들지 않음). Play Console에서는 6개 모두 활성 상태로 둔다.
- 세트(`set_2027`)는 하나를 연 뒤 남은 풀이 몫을 Play API로 부분 환불할 수 없다. 문구 결정 전에는 만들지 말고, 사장님이
  "앱에서는 세트를 팔지 않는다"를 고르면 이 행을 빼고 웹 코드에서 앱의 세트 판매를 막는다(작업 필요).
- 가격을 입력할 때 세금 포함 여부는 공식 도움말에서 확인하지 못했다. 입력 화면에 보이는 "구매자에게 표시되는 가격"이 표의
  금액과 같아야 한다.
- 구매 뒤 3분 안에 확인(소비)되지 않은 테스트 구매는 자동 환불된다(라이선스 테스트, answer/6062777). 실결제는 3일.
