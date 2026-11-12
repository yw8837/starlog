# 앱 콘텐츠 선언 답안 (Play Console > 앱 콘텐츠)

메뉴 이름은 공식 도움말에서 확인한 것만 적었다(2026-11-12). 질문 문구가 도움말에 없는 것은 "화면에서 확인"이라고 표시했다.
경로 표기: 영문 `Monitor and improve > Policy and programs > App content`, 한국어 `모니터링 및 개선 > 정책 및 프로그램 > 앱 콘텐츠`
(https://support.google.com/googleplay/android-developer/answer/15748846).

| 선언 | 답 | 근거 |
|---|---|---|
| 개인정보처리방침 (선언 시작) | https://starlog.yeolmaeapps.kr/privacy | 공개 URL, 로그인·지역 제한 없음 `apps/web/lib/legal.ts:177` (LEGAL_LINKS). 요건: 방침에 수집·공유·보관·삭제와 연락처가 있어야 함 (answer/9859455, answer/10144311). 앱 관련 내용 반영됨(2026-11-13, `wording-proposals` 10~13): 위탁·국외 이전 카드 Google LLC (Google Play 결제)·(AdMob) `apps/web/app/privacy/page.tsx:136-168`, 결제 기록 `:375`, 풀이 신고(보관 1년) `:397-400`, 앱 광고 문단 `:569-573`, 맨 위 "2026년 11월 13일 바뀐 내용" `:265-272` |
| 광고 (선언 시작) | 예, 광고가 있음 | AdMob 배너 `apps/android/app/src/main/java/kr/yeolmaeapps/starlog/AdsController.kt`. "Banner and interstitials: Your app integrates with an Ad SDK to show banners" → 예 (answer/9859455) |
| 로그인 세부정보 (Sign-in details) | 전체 또는 일부 기능이 제한됨 → `reviewer-access.md`의 안내를 그대로 붙여 넣음 | 로그인·결제 뒤에 있는 화면이 있음. "provide all account information with detailed instructions", "must be provided in English" (answer/15748846) |
| 타겟층 및 콘텐츠 | **18세 이상** (2026-11-13 사장님 결정) | 서비스 규칙은 만 14세 이상 `apps/web/app/terms/page.tsx:233-241`. Play의 선택지는 13-15 / 16-17 / 18세 이상이라 "13-15"를 고르면 만 13세가 포함돼 서비스 규칙과 어긋난다. 광고와 결제가 있는 앱이라 성인 대상으로 선언하는 쪽이 안전하다. 18세 미만을 하나도 고르지 않아도 앱 이용 자체가 막히지는 않는다(화면에서 확인). 사장님 결정 |
| 콘텐츠 등급 (설문) | 카테고리: 화면에서 "참고/유틸리티/기타"에 해당하는 것을 고름(화면에서 확인). 폭력·성적 콘텐츠·약물·도박: 없음. 사용자끼리 소통·콘텐츠 공유: **있음**(별자리 인연의 닉네임·메시지, 공개 후기 `apps/web/migrations/0001_bonds.sql`, `0005_reviews.sql`). 위치 공유: 없음. 디지털 구매: 있음 | 한국은 앱에 Google Play 자체 등급(3+/7+/12+…)이 붙는다. "Misrepresentation of your app's content may result in its removal or suspension." (answer/9859655) |
| 데이터 보안 | `data-safety.md` | — |
| 광고 ID | 예, 사용함. 목적: 광고 또는 마케팅, 분석 | AdMob SDK가 `com.google.android.gms.permission.AD_ID`를 병합한다(병합 릴리스 매니페스트). (answer/6048248). 질문 문구는 화면에서 확인 |
| 정부 앱 | 아니요 | 정부 서비스 아님 (answer/9514050) |
| 금융 기능 | "My app doesn't provide any financial features" (금융 기능 없음) | 인앱 구매는 금융 기능 목록에 없다 (answer/13849271) |
| 건강 앱 | 건강 기능 없음 | 의료·건강 기능 없음. 풀이는 건강 조언을 하지 않는다(화면 문구 확인 필요 시 `apps/web/lib/ai/prompts`의 금지 규칙) (answer/14738291) |
| AI 생성 콘텐츠 | 해당(설문에 있으면 예). 앱 안 신고 기능 있음 | "must contain in-app user reporting or flagging features" (answer/13985936); 신고 컨트롤이 붙은 화면 15곳은 `review-evidence.md` |
| 뉴스 앱, COVID-19 추적 앱 등 | 아니요 | 해당 없음 |

## 앱 가격·배포
- 무료 앱(인앱 구매 있음). 배포 국가: 대한민국부터.
- 기기: 휴대전화. 태블릿 전용 스크린샷은 필수가 아니다(answer/9866151에 요구 문장 없음).
