# 데이터 보안 양식 답안 (Play Console > 앱 콘텐츠 > 데이터 보안) — 코드 근거 포함

기준 커밋 8a6c887. 경로는 `apps/web/` 또는 `apps/android/` 기준. 양식 구조와 정의는 공식 도움말에서 확인했다
(https://support.google.com/googleplay/android-developer/answer/10787469, 2026-11-12):
- "\"Collect\" means transmitting data from your app off a user's device."
- "It also includes user data collected from a webview which has been opened from your app" → 웹뷰 안의 우리 사이트가 받는 것도 적는다.
- "You must reflect data collection or sharing carried out by such third-party code in the Data safety form" → AdMob, Play 결제 포함.
- AdMob SDK가 자동으로 모으는 것(공식 표, https://developers.google.com/admob/android/privacy/play-data-disclosure): IP 주소, 사용자 제품
  상호작용, 진단 정보, 기기·계정 식별자(광고 ID, 앱 세트 ID). "collects and shares the following data types automatically for advertising,
  analytics, and fraud prevention purposes."

## 1. 데이터 수집 및 보안 (첫 화면 질문)
| 질문 | 답 | 근거 |
|---|---|---|
| 앱이 필수 사용자 데이터 유형을 수집하거나 공유하나요? | 예 | 아래 2 |
| 수집하는 모든 사용자 데이터가 전송 중에 암호화되나요? | 예 | HSTS `web/next.config.ts:7,34`; 릴리스 빌드는 http 차단 `android/app/src/main/java/kr/yeolmaeapps/starlog/MainActivity.kt:63`; 평문은 debug 전용 `android/app/src/debug/res/xml/network_security_config.xml` |
| 사용자가 데이터 삭제를 요청할 방법을 제공하나요? | 예 | 내 정보 → 회원 탈퇴 `web/app/me/AccountPanel.tsx:302-373`, `web/lib/account/deletion.ts:196-239` |
| 계정 삭제 URL | https://starlog.yeolmaeapps.kr/privacy#rights | "7. 이용자의 권리와 행사 방법" `web/app/privacy/page.tsx:594-600`. 양식의 정확한 칸 이름은 공식 도움말에서 확인하지 못함 |

## 2. 데이터 유형별 답
"공유"는 Google 정의상 제3자에게 넘기는 것이다. 서비스 제공자(우리 대신 처리하는 곳)에게 보내는 것과 사용자가 직접 시작한 이전은
공유에서 빠진다(같은 도움말의 예외 조항: 입력 화면에서 다시 확인할 것). 아래 "공유"는 그 예외를 적용하기 전의 사실을 적었다.

| 유형 (양식 이름) | 수집 | 공유 | 필수/선택 | 목적 | 무엇을, 근거 |
|---|---|---|---|---|---|
| 개인 정보 > 사용자 ID | 예 | 아니요 | 필수(로그인 시) | 앱 기능, 계정 관리 | Kakao 회원번호·Google sub를 되돌릴 수 없는 값으로만 저장 `web/lib/account/secrets.ts:81-84`, `web/lib/account/google.ts:161-164`; Play 결제에 계정을 가린 값 `web/lib/pay/play.ts:46` |
| 개인 정보 > 이름 | 예 | 아니요 | 필수(Kakao 로그인 시) | 앱 기능, 계정 관리 | Kakao 닉네임만 `web/lib/account/kakao.ts:94-96`. 실명은 받지 않음 |
| 개인 정보 > 이메일 주소 | 아니요 | — | — | — | 요청·저장 코드 없음: Kakao scope 없음 `web/lib/account/kakao.ts:43-51`, Google 웹은 `scope=openid` `web/lib/account/google.ts:73`. **미확인**: 앱의 Google 계정 선택창이 주는 토큰에 이메일이 실리는지(서버는 `sub`만 사용 `web/lib/account/googleIdToken.ts`). 실계정으로 토큰을 한 번 확인한 뒤 확정 |
| 개인 정보 > 기타 정보 | 예 | 예(AI 처리 업체) | 선택(사주를 볼 때) | 앱 기능 | 생년월일·시·성별·양음력·출생 지역 `web/lib/api/sajuRequest.ts:27-30`; 풀이 생성에 계산값을 보냄 `web/app/privacy/page.tsx:95`, `web/lib/ai/prompts/saju.ts:509-514`; 로그인 풀이만 암호화 저장 `web/lib/readings/store.ts:12-14` |
| 금융 정보 > 구매 내역 | 예 | 아니요 | 필수(결제 시) | 앱 기능, 사기 방지·보안·규정 준수 | 주문·결제·Play 구매 식별값 `web/migrations/0002_accounts_payments.sql:43-73`, `web/migrations/0024_play_payments.sql`; 5년 보관 `web/lib/pay/maintenance.ts:20` |
| 금융 정보 > 사용자 결제 정보 | 아니요 | — | — | — | 카드 정보는 Google Play가 처리하고 앱·서버는 받지 않음 `android/.../BillingManager.kt` (토큰과 주문번호만) |
| 메시지 > 기타 인앱 메시지 | 예 | 예(AI 처리 업체) | 선택 | 앱 기능 | 타로 질문·메모·이어서 묻기 `web/lib/ai/prompts/tarot.ts:18-34`; 로그인 풀이만 암호화 저장 |
| 앱 활동 > 기타 사용자 생성 콘텐츠 | 예 | 아니요 | 선택 | 앱 기능 | 후기(별점·본문, 공개) `web/migrations/0005_reviews.sql:5-18`; 별자리 인연 닉네임·메시지 `web/migrations/0001_bonds.sql`; 풀이 신고 메모(최대 500자) `web/lib/readings/report.ts:27`, `web/app/api/readings/report/route.ts:35-38` |
| 앱 활동 > 앱 상호작용 | 예 | 예(광고) | 선택(통계) / 필수(광고 SDK) | 분석, 광고 또는 마케팅 | 동의한 사람의 페이지 조회(GA4) `web/lib/analytics.ts:18,43-49`, `web/components/seo/GoogleAnalytics.tsx:80`; AdMob "User product interactions" |
| 앱 정보 및 성능 > 진단 | 예 | 예(광고) | 필수(광고 SDK) | 분석 | AdMob "Diagnostic information"(SDK 자동). 앱 자체 오류 수집 코드는 없음 |
| 기기 또는 기타 ID | 예 | 예(광고) | 필수(광고 SDK) | 광고 또는 마케팅, 사기 방지·보안, 분석 | 광고 ID·앱 세트 ID(AdMob, 병합 매니페스트의 `AD_ID`); 웹뷰 쿠키의 기기 id 해시 `web/lib/bonds/identity.ts:47-50`; 동의 시 GA 쿠키 |
| 위치 > 대략적인 위치 | 예 | 예(광고) | 필수(광고 SDK) | 광고 또는 마케팅, 분석 | AdMob: "Collects device's IP address, which may be used to estimate the general location"; 동의 시 GA가 IP로 국가·도시 추정 `web/app/privacy/page.tsx:76-77`. 앱은 위치 권한이 없음 |
| 위치 > 정확한 위치 | 아니요 | — | — | — | 위치 권한 없음(소스·병합 매니페스트) |
| 사진·동영상, 오디오, 파일, 캘린더, 연락처, 건강, 웹 탐색 기록 | 아니요 | — | — | — | 해당 권한·코드 없음; `Permissions-Policy: camera=(), microphone=(), geolocation=()` `web/next.config.ts:40` |

각 유형의 추가 질문:
- "이 데이터는 일시적으로 처리되나요?": 사용자 ID·구매 내역·후기·저장 풀이는 **아니요**(저장). 비로그인 맛보기의 질문·출생 정보는 저장하지 않지만,
  같은 유형이 로그인 풀이에서 저장되므로 **아니요**로 답한다.
- "사용자가 선택할 수 있나요?": 위 표의 필수/선택 열.

## 3. 사실과 양식 사이의 빈틈 (출시 전 정리)
1. ~~개인정보처리방침에 앱 관련 내용(Google Play 결제, AdMob, 풀이 신고)이 없다~~ → 반영됨(2026-11-13 승인, `wording-proposals` 10~13번;
   줄 번호는 이 커밋 이후 작업 트리 기준): 위탁·국외 이전 카드 Google LLC (Google Play 결제)·(AdMob) `web/app/privacy/page.tsx:136-168`
   (AdMob 카드의 "이전 시기와 방법"에 위 공식 표의 상호작용·진단·앱 세트 ID·계정 관련 식별자·대략적 위치 추정까지 적음), 결제 기록 `:375`,
   풀이 신고(보관 1년) `:397-400`과 1년 뒤 삭제 `web/lib/pay/maintenance.ts:22,213-219`, 앱 광고 문단 `:569-573`. Play는 방침과 양식이 어긋나면 반려한다.
2. 앱 Google 로그인 토큰의 이메일 클레임(위 표 "미확인").
3. Meta 픽셀: 픽셀 id가 설정되면 동의한 사람의 방문·결제 금액이 Meta로 간다 `web/lib/metaPixel.ts:8,13`. 지금 배포 스크립트에는 id가 없다
   (`scripts/ops/deploy.sh`). 켜는 날 이 양식의 "앱 상호작용 / 구매 내역 → 공유(광고)"를 고쳐야 한다.
4. Cloudflare Web Analytics 비컨: 코드 주석에만 있다 `web/next.config.ts:15`. 대시보드에서 켜져 있으면 방침과 이 양식(앱 상호작용, 분석)에 넣는다.
5. 계정 삭제 전용 웹 페이지가 없다. Play 요건: "provide a web link resource where users can request app account deletion … reference the app or
   developer name" (https://support.google.com/googleplay/android-developer/answer/13327111). `/privacy#rights`는 앱 이름과 절차를 담고 있지만,
   로그인 없이 삭제를 "요청"하는 길은 문의 메일뿐이다. 전용 안내 페이지(`/account-deletion`: 앱 이름, 탈퇴 순서, 지워지는 것·남는 것, 요청 메일)를
   만드는 쪽이 안전하다. 문구가 법적 고지라 사장님 승인 뒤 만든다.
