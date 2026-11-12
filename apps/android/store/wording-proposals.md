# 앱 출시 전 문구 변경 제안 (2026-11-12) — 2026-11-13 승인, 코드에 반영

승인됨 2026-11-13 (사장님, 전부 반영; 신고 기록 1년; 세트는 앱에서도 판매, 남은 몫은 문의 환불)
- 시행: 배포일 2026-11-13. 약관·환불 정책·개인정보처리방침 맨 위에 "2026년 11월 13일 바뀐 내용"을 30일 동안(2026-12-13 0시 전까지)
  보이고, 화면의 시행일은 그대로 둔다 — `lib/legal.ts:118-128` APP_REVISION_DATE. LOGIN_RULE_DATE·KEPT_RULE_DATE·BOND_LOGIN_DATE와
  같은 방식(`lib/legal.ts:84-116`, `lib/legal.test.ts:52` "The 시행일 shown stays"). 공지: 약관 `app/terms/page.tsx:112-126,144`,
  환불 정책 `app/refund/page.tsx:41-47`, 개인정보처리방침 `app/privacy/page.tsx:265-272`.
- 아래 "→ 반영" 줄 번호는 반영한 작업 트리 기준이다(8a6c887 기준이 아님). 고정 테스트: `components/legal/loginRule.test.tsx:209-303`
  (1~5, 10~13과 공지), `lib/legal.test.ts:71-81`(공지 기간).

기준 커밋 8a6c887. 경로는 `D:/Money/apps/saju-tarot/apps/web/` 아래. 법적 문서라 사장님 승인 뒤에만 커밋한다. 시행일 공지(기존 방식: 맨 위 "바뀐 내용" 공지)는 승인 때 같이 정한다.

## A. 약관 (`app/terms/page.tsx`)
1. **245줄**
   - 지금: "결제는 토스페이먼츠를 통해 카드와 간편결제로 할 수 있습니다. 결제하려면 회원으로 로그인해야 합니다."
   - 제안: "결제는 웹에서는 토스페이먼츠를 통해 카드와 간편결제로, 안드로이드 앱에서는 Google Play 결제로 할 수 있습니다. 결제하려면 회원으로 로그인해야 합니다."
   - → 반영: `app/terms/page.tsx:262` (제7조 2호)
2. **257줄**
   - 지금: "영수증은 내 정보의 결제 내역에서 확인할 수 있습니다."
   - 제안: "영수증은 내 정보의 결제 내역에서 확인할 수 있습니다. 안드로이드 앱에서 Google Play로 결제한 건의 영수증은 Google Play가 보냅니다."
   - → 반영: `app/terms/page.tsx:274` (제7조 8호)

## B. 환불 정책 (`app/refund/page.tsx`)
3. **64줄 문단 뒤에 한 문장 추가**
   - 추가: "안드로이드 앱에서 Google Play로 결제한 풀이도 같은 기준으로 ‘환불받기’에서 환불돼요. 환불금은 Google Play를 통해 결제한 수단으로 돌아가요."
   - → 반영: `app/refund/page.tsx:78` (첫 문장은 `:23` PLAY_REFUND, 공지에도 씀)
4. **67줄**
   - 지금: "카드사가 결제를 취소해 주는 기간이 지났다면, 알려 주신 본인 명의 계좌로 환불해 드려요."
   - 제안: "카드사가 결제를 취소해 주는 기간이 지났거나 Google Play에서 환불이 되지 않으면, 알려 주신 본인 명의 계좌로 환불해 드려요."
   - → 반영: `app/refund/page.tsx:80`
5. **102줄**
   - 지금: "카드사나 결제사 사정에 따라 실제로 반영되기까지 며칠 더 걸릴 수 있어요."
   - 제안: "카드사나 결제사, Google Play 사정에 따라 실제로 반영되기까지 며칠 더 걸릴 수 있어요."
   - → 반영: `app/refund/page.tsx:115`

## C. 세트 부분 환불 (웹에서만 사실인 약속)
앱에서 Google Play로 산 세트는 하나를 연 뒤 남은 풀이 몫을 버튼으로 바로 환불할 수 없다(Google Play API가 일회성 상품의 부분 환불을 지원하지 않음). 금액 기준은 그대로 두고 받는 방법만 밝힌다.
6. **`components/legal/PremiumLegal.tsx` 81~82줄 `setRefundRule()` 끝에 한 문장 추가** (이 함수가 약관·환불 정책·결제 화면 `CheckoutView.tsx:306, 327, 363`·가격 안내 `PremiumPricing.tsx:50`에 같이 쓰임)
   - 추가(해요체): "안드로이드 앱에서 Google Play로 결제한 세트는 하나를 연 뒤 남은 풀이 몫을 문의로 접수하면 같은 금액을 환불해 드려요."
   - 추가(합니다체): "안드로이드 앱에서 Google Play로 결제한 세트는 하나를 연 뒤 남은 풀이 몫을 문의로 접수하면 같은 금액을 환불합니다."
   - → 반영: `components/legal/PremiumLegal.tsx:77-78` (playSetPartRule, 두 말투), `:92` (setRefundRule 끝에 붙음: 약관·환불 정책의 세트 공지와
     제7조의3, 결제 화면, 가격 안내). 약관·환불 정책 공지에도 같은 함수. 고정 테스트: `components/legal/PremiumLegal.test.tsx:110`,
     `app/pay/checkout/CheckoutView.test.tsx:132-136`
7. **`app/me/AccountPanel.tsx` 56줄 `SET_TOGETHER`**
   - 지금: "세트로 산 풀이예요. 둘 다 열지 않았으면 전액, 하나를 열면 열지 않은 풀이 몫만 환불돼요."
   - 제안: 웹 결제 건은 그대로. 앱 결제 건(`provider: "play"`)에는 "세트로 산 풀이예요. 둘 다 열지 않았으면 전액 환불되고, 하나를 열면 남은 풀이 몫은 문의로 환불해 드려요."
   - → 반영: 문장 `lib/premium/offer.ts:41` (PLAY_SET_TOGETHER_LINE), 고르는 곳 `app/me/AccountPanel.tsx:264` (`item.provider === "play"`). 웹 건은
     `:56` 그대로. 고정 테스트: `app/me/AccountPanel.app.test.tsx:106` (앱), `app/me/AccountPanel.test.tsx:235` (웹, 그대로)
8. **`components/premium/PremiumUnlock.tsx` 99줄 세트 안내**: 7번과 같은 문장으로(앱 결제 건만).
   - → 반영: `components/premium/PremiumUnlock.tsx:65` (/api/me의 `provider: "play"`), `:100-103`. 웹 건 문장은 그대로. 고정 테스트:
     `components/premium/PremiumUnlock.play.test.tsx:33` (앱), `components/premium/premiumUi.test.tsx:153,156` (웹, 그대로)
9. **`app/me/AccountPanel.tsx` 358줄 (탈퇴 확인)**
   - 지금: "환불할 수 없는 풀이 N개는 사라져요"
   - 제안: 그대로 두고, 앱에서 산 세트의 남은 풀이가 있을 때만 한 줄 추가: "앱에서 결제한 세트의 남은 풀이는 탈퇴 뒤 확인해서 환불해 드려요." (서버는 이 경우 운영자 처리 목록에 올림: 런북 11절)
   - → 반영: `app/me/AccountPanel.tsx:360` (/api/me의 `noRefund: "play-part"`가 있을 때만, 새 API 필드 없음). 서버 처리 `lib/account/deletion.ts:98-101`.
     고정 테스트: `app/me/AccountPanel.app.test.tsx:117`

## D. 개인정보처리방침 (`app/privacy/page.tsx`)
10. **124~130줄 위탁 표에 항목 추가** (토스페이먼츠 아래)
    - 이름: "Google LLC (Google Play 결제)" / 국가: 미국 / 맡기는 일: "안드로이드 앱의 결제 처리(Google Play 결제 승인과 환불)" / 처리 항목: "결제와 환불에 필요한 구매 식별값(구매 토큰, Google 주문번호), 계정을 가린 값"
    - 이름: "Google LLC (AdMob)" / 국가: 미국 / 맡기는 일: "안드로이드 앱의 무료 결과 화면(지금의 한 장, 사주 등급 카드, 오늘의 한 장) 아래 광고 게재" / 처리 항목: "광고 ID, 기기·앱 정보, IP 주소(광고 게재와 부정 사용 방지)"
    - 국외 이전 고지 형식은 기존 Google LLC(애널리틱스) 항목과 같은 틀로.
    - → 반영: `app/privacy/page.tsx:136-168` (토스페이먼츠 다음, 애널리틱스 Google LLC 앞). 이름·국가·맡기는 일·처리 항목은 위 문장 그대로,
      나머지 칸(이전 시기와 방법, 보유·이용 기간, 거부 방법과 거부 시 불이익, 개인정보 문의)은 코드(`lib/pay/play.ts:46`,
      `android/.../BillingManager.kt:85`, `AdsController.kt`)와 Google 공식 공개 표
      (developers.google.com/admob/android/privacy/play-data-disclosure, 2026-11-13 확인)로 채움. 보유 기간은 "Google의 개인정보처리방침에서
      정한 기간 동안 Google이 보관"(Google 표에 기간 없음). "이전 근거" 칸은 사실이 아니라 법적 판단이라 비워 둠(사장님·전문가 확인 필요).
11. **332줄**
    - 지금: "결제 기록: 주문번호, 상품, 금액, 결제수단 종류, 승인·취소 시각과 영수증 링크. 카드번호 등 결제 정보는 토스페이먼츠가 처리하며 운영자는 받지 않습니다"
    - 제안: "결제 기록: 주문번호, 상품, 금액, 결제수단 종류, 승인·취소 시각과 영수증 링크(앱 결제는 Google Play 구매 식별값). 카드번호 등 결제 정보는 토스페이먼츠(웹)나 Google Play(안드로이드 앱)가 처리하며 운영자는 받지 않습니다"
    - → 반영: `app/privacy/page.tsx:375`
12. **수집 항목 목록에 한 줄 추가**
    - 추가: "풀이 신고(안드로이드 앱): 신고한 풀이의 종류와 번호, 고른 사유, 직접 적은 메모, 로그인한 경우 계정. 풀이 내용은 저장하지 않으며, 탈퇴하면 계정과 메모를 지웁니다. 보관 기간: (사장님 결정: 예 1년)"
    - → 반영: `app/privacy/page.tsx:399` ("보관 기간: 1년"), 소제목 "풀이를 신고할 때" `:397`을 붙여 1항에 둠. 1년 뒤 삭제
      `lib/pay/maintenance.ts:22,213-219` (고정 테스트 `app/api/internal/maintenance/maintenance.test.ts:419`)
13. **앱 광고 안내 문단 추가** (쿠키·광고 절)
    - 추가: "안드로이드 앱의 무료 결과 화면 아래에는 Google AdMob 광고가 실립니다. 맞춤 광고는 기기의 설정 > Google > 광고에서 끌 수 있고, 유럽경제지역·영국·스위스에서는 앱의 내 정보 > 광고 개인정보 설정에서 동의를 바꿀 수 있습니다."
    - → 반영: `app/privacy/page.tsx:570-573` (쿠키와 브라우저 저장소 절, 카카오톡 공유 앞). 설정 행 `app/me/MeView.tsx:208`

## E. FAQ (`lib/faq.ts` 256~263줄 "광고가 있나요?")
14. 광고 켜짐 답변
    - 지금: "가이드 글 페이지에만 광고가 실려요. 타로와 사주 풀이, 내 기록 화면에는 광고를 싣지 않아요."
    - 제안: "웹에서는 가이드 글 페이지에만 광고가 실려요. 안드로이드 앱에서는 무료 결과 화면(지금의 한 장, 사주 등급 카드, 오늘의 한 장) 아래에만 배너가 하나 있어요. 결제한 풀이와 맛보기, 내 기록 화면에는 광고를 싣지 않아요."
    - → 반영: `lib/faq.ts:260` (둘째 문단 "가이드 글의 광고는 Google이 쿠키를…"은 그대로). 고정 테스트 `components/info/InfoPages.test.tsx:281`
15. 광고 꺼짐 답변(263줄)도 같은 뜻으로: "웹에는 지금 광고가 없어요. 안드로이드 앱에서는 무료 결과 화면 아래에만 배너가 하나 있어요. 결제한 풀이와 맛보기, 내 기록 화면에는 싣지 않아요."
    - → 반영: `lib/faq.ts:263`. 고정 테스트 `components/info/InfoPages.test.tsx:281`

## 사장님이 정할 것 — 2026-11-13 결정
- C(세트): 문의로 같은 금액을 환불하는 방식으로 갈지, 아니면 앱에서는 세트를 팔지 않을지(세트는 12/1부터 판매). → 앱에서도 판다, 남은 몫은 문의로 같은 금액 환불.
- D-12: 신고 기록 보관 기간. → 1년.
- 시행일과 "바뀐 내용" 공지 기간. → 배포일 2026-11-13, 공지 30일(맨 위 승인 줄 참고).
