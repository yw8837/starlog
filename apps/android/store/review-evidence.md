# 정책 항목별 증거 (빌드한 앱 기준, 2026-11-13)

확인 방법: 에뮬레이터(AVD `starlog35`, Android 15)에 디버그 APK를 깔고, SSD 클론(`0da31d0`)의 모의 개발 서버(AI·결제·로그인 모두 mock)에
연결해 화면을 하나씩 열었다. 캡처 84장과 기록은 `E:\AndroidBuild\qa\ultraqa3\`(저장소 밖)에 있다. 아래 "캡처"는 그 폴더의 파일 이름이다.
정책 원문과 출처는 `app-content.md`, `data-safety.md`, 그리고 계획 문서의 공식 사실 표에 있다.

## 1. 결제 (Play 결제 정책: 앱 안 디지털 상품은 Google Play 결제만)
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| 결제 화면 5개(타로·사주·켈틱 크로스·궁합·신년운세)의 버튼이 "Google Play로 N원 결제하기" | 통과. 버튼 문구가 캡처에 보이는 건 타로·켈틱 크로스·궁합 3개(`03a`~`03c`)이고, 사주·신년운세는 화면 글자 검색으로만 확인(캡처는 버튼 위에서 잘림). 다섯 상품이 같은 코드 `apps/web/app/pay/checkout/CheckoutView.tsx:370` | 캡처 `03a`~`03c`, `02-22`~`02-26`(화면 윗부분) |
| 앱 모드 화면에 토스·카드·간편결제 문구 없음(타로 5화면, 사주 3화면, 프리미엄 8화면, 내 정보, FAQ, 도움말, 결제 5화면) | 통과(0건) | `scan-flows.txt`, `scan-logged-in.txt`, `scan-logged-out.txt` |
| 세션 전체에서 토스 스크립트·주소 요청 | 0건(기록된 요청이 전부 localhost라 기록만으로는 단정 못 함. 코드상 토스 SDK는 웹 결제일 때만 부름: `CheckoutView.tsx:153`) | `session-netlog.tsv` |
| 결제 버튼 → 주문 생성 → 브리지 `purchase`(상품 `tarot`, `tarot_deep`, `match`) | 통과(에뮬레이터라 Play가 `UNAVAILABLE`로 답하고 화면은 "결제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.") | 캡처 `03a`~`03c` |
| 가격 안내(/pricing)의 앱 전용 문장 "앱에서는 Google Play로 결제해요…" | 화면 글자 검색으로 확인(캡처 `02-11`은 페이지 윗부분만 찍힘). 제목 "결제 수단과 영수증"은 그대로, 토스 문장은 숨김 | `apps/web/app/pricing/page.tsx:163-164` |
| 약관·환불 정책·개인정보처리방침의 토스 문장 | 웹/앱을 같은 문장에서 구분해 적음(법적 고지라 숨기지 않음) | 캡처 `10-terms-google-play`, `10-refund-google-play`, `02-13`~`02-15` |
| 세트(`set_2027`) 제안 화면 | **화면 없음**: 12월 1일부터 판매(`apps/web/lib/config.ts:74`). 결제 화면 코드는 다른 상품과 같음 | 실제 구매 확인은 내부 테스트 때 |
| 실제 구매·소비·환불 | **미확인**: Play Console 상품 등록과 라이선스 테스터가 있어야 함 | `owner-checklist.md`의 내부 테스트 목록 |

## 2. 광고 (AdMob 배너 위치, 동의)
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| 배너가 열리는 곳: 지금의 한 장 결과, 사주 등급 카드, 오늘의 한 장 결과 | 통과(135.2dp, 테스트 광고) | 캡처 `06-now-3-result-ad`, `06-grade-1-load`, `06-today-2-result-open` |
| 결과가 나오기 전에는 닫힘(/now, /today) | 통과 | 캡처 `06-now-1-before`, `06-today-1-before` |
| 닫혀 있는 곳: 홈, 타로·사주 맛보기, 전체 풀이, 프리미엄 미리 보기 3개, 결제 화면 5개, 로그인, 생성 중, 결제 실패, 404, 내 정보, 가격 안내, 예시 풀이, 별자리 인연 | 통과 | 캡처 `01-home`, `06-tarot-4`, `06-tarot-7-full`, `06-saju-2`, `06-match-2`, `06-newyear-2`, `06-deep-1`, `02-22`~`02-26`, `06-closed-1`~`4`, `06-tarot-6-loading-1`, `07l` |
| 배너 신호(`show:true`)가 나온 경로 | /now 1, /saju/grade 2, /today 2, 다른 경로 0 | `session-netlog.tsv` |
| 실제 광고 단위, UMP 동의 창(유럽 등) | **미확인**: AdMob 앱 ID와 단위 ID가 있어야 함 | `owner-checklist.md` |

## 3. AI 생성 콘텐츠 (앱 안 신고)
| 화면 | 결과 | 증거 |
|---|---|---|
| 타로 맛보기, 타로 전체 풀이, 공유 링크(/s), 사주 맛보기, 궁합 미리 보기, 신년운세 미리 보기, 켈틱 크로스 결과, 오늘의 한 장 | 통과 8곳: 신고 → 사유 → 보내기 → "신고가 접수됐어요. 확인하고 조치할게요." | 캡처 `07a`, `07b`, `07f`, `07g`~`07j`; 오늘의 한 장은 캡처(`07k`)에 접수 문구가 안 찍혀 접수 기록(`session-netlog.tsv`의 `/api/readings/report 200`)으로만 확인 |
| 이어서 물어보기 답변 | 에뮬레이터 미확인(결제한 풀이 필요). 브라우저 e2e로 확인: 앱 표시(`<html data-app>`)를 켜면 보이고 `kind: "followup"`으로 접수 | `apps/web/e2e/pay-flow.spec.ts` |
| 오늘의 인연 카드 | 에뮬레이터 미확인(다른 계정의 친구 필요). 브라우저 e2e로 확인: 앱 표시를 켜면 보임 | `apps/web/e2e/bonds.spec.ts` |
| 사주 전체 풀이, 프리미엄 전체 풀이 | 에뮬레이터 미확인(결제 필요). 같은 컴포넌트 | `apps/web/app/chapter/[id]/SajuChapterView.tsx:74`, `PremiumChapterView.tsx:160` |
| 웹(앱 아님)에서는 신고가 안 보임 | 통과(이어 묻기 답변, 풀이 본문, 인연 카드의 신고가 앱 표시 전에는 숨김) | `apps/web/lib/app/mode.test.ts`, 위 e2e 두 개 |

## 4. 로그인, 심사용 계정, 계정 삭제
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| Google 로그인이 웹 창이 아니라 기기의 계정 선택(브리지 `googleSignIn`)으로 감 | 통과(에뮬레이터에 계정이 없어 `NoCredentialException`, accounts.google.com 요청 0) | 캡처 `04-google-native` |
| 실제 Google 계정 로그인 | **미확인**: 웹 클라이언트 ID가 있어야 함 | `owner-checklist.md` |
| 로그인 화면의 "Reviewer sign-in" → 심사용 양식 → 로그인됨 | 통과 | 캡처 `05a`~`05d` |
| 일반 브라우저에서는 그 링크가 안 보임 | 통과 | `apps/web/app/globals.css`의 `html:not([data-app]) .app-only` |
| 내 정보 → 회원 탈퇴 → 확인창 → 취소 | 통과(실제 탈퇴는 누르지 않음) | 캡처 `09-delete-dialog`, `09-after-cancel` |
| 로그인 없이 보는 삭제 안내 주소 | https://starlog.yeolmaeapps.kr/privacy#rights (전용 페이지는 없음: `data-safety.md` 3-5) | 캡처 `02-15` |

## 5. 개인정보처리방침과 고지
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| 처리를 맡기는 곳에 Google LLC (Google Play 결제), (AdMob) | 통과 | 캡처 `10-privacy-processor-google-play`, `10-privacy-processor-admob` |
| 풀이 신고 기록 보관 1년 | 통과 | 캡처 `10-privacy-report-1year`; 삭제 코드 `apps/web/lib/pay/maintenance.ts` |
| 앱 광고 안내 문단 | 통과 | 캡처 `10-privacy-app-ad-notice` |
| 약관 위쪽 공지 "2026년 11월 13일 바뀐 내용 · 안드로이드 앱"(세트 공지 다음) | 통과 | 캡처 `10-terms-notice` |

## 6. 앱 동작
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| 실행 → 사이트 로드, 앱 표시, UA 끝 `StarlogApp/1.0.0`, 브리지 있음 | 통과(UA와 브리지는 페이지에서 읽은 값이고 캡처에는 안 보임: `MainActivity.kt:99`) | 캡처 `01-home` |
| 다른 사이트 링크(가이드, Google 도움말)는 크롬으로 열림 | 통과 | 캡처 `08a-guide-b-after-tap`, `08b-support-b-after-tap` |
| 뒤로 가기, 오프라인 화면과 다시 시도 | 통과 | 캡처 `11a-back-home`, `11b-offline`, `11c-after-retry` |
| 릴리스 빌드는 운영 주소만(`localhost` 없음), http 차단 | 통과 | dex 검사(운영 주소 디버그 APK), `MainActivity.kt:63` |
| 대상 API 36, 최소 24 | 통과 | `apps/android/app/build.gradle.kts` |
| 단위 테스트 44개, `assembleDebug`, `bundleRelease` | 통과. AAB는 **서명 전**이고 테스트 광고 ID라 올리는 파일이 아님 | 빌드 기록(세션 스크래치패드) |

## 아직 증거가 없는 것 (값을 받은 뒤 내부 테스트에서 확인)
1. 실제 Play 구매 → 풀이 열림 → 소비, 환불받기, Play 쪽 환불(무효 구매) 반영.
2. 실제 Google 계정 로그인, 토큰에 이메일이 실리는지.
3. 실제 AdMob 광고 단위와 동의 창.
4. 서명한 AAB 업로드와 사전 출시 보고서.
5. 세트(12월 1일 판매 시작) 구매와 문의를 통한 남은 몫 환불.

## 운영 사이트에서 다시 확인 (2026-11-13, 배포 `9bd07d6` 뒤, 운영 주소 디버그 APK)
캡처와 기록은 `E:\AndroidBuild\qa\live-1113\`.
| 확인한 것 | 결과 | 증거 |
|---|---|---|
| 앱 표시 `android`, UA 끝 `StarlogApp/1.0.0`, `/api/version` = `9bd07d6eebc2` | 통과 | `A1-home.png` |
| /pricing "결제 수단과 영수증"에 "앱에서는 Google Play로 결제해요…", 토스·간편결제·신용카드 0건 | 통과 | `A2-pricing-payment-section.png` |
| 결제 화면 3개(타로·사주·신년운세) | 로그인 화면으로 넘어감(비로그인). **버튼 문구는 운영에서 미확인**: 심사용 계정 값이 있어야 함 | `A3-checkout-*.png` |
| 로그인 화면의 Google 버튼과 "Reviewer sign-in" | 통과 | `A4-login.png` |
| 배너: /now 결과와 /saju/grade에서 열림, 홈에서 닫힘 | 통과 | `A5-now-banner-open.png`, `A5-home-banner-closed.png`, `A6-grade-banner-open.png` |
| 앱 본체 WebView가 요청한 호스트 | 2개(`starlog.yeolmaeapps.kr`, `static.cloudflareinsights.com`), 토스 0건. 광고 SDK의 요청은 이 기록 밖 | `netlog.tsv` |

## 스토어 스크린샷
`graphics/phone-1.png`~`phone-8.png`: 운영 사이트를 앱에서 찍은 1080×1920 RGB(알파 없음). 상태바·제스처바를 떼고 위에서 1920px만 남겼다.
1 홈, 2 타로 시작, 3 질문 만들기, 4 사주 주제 목록, 5 2027 신년운세, 6 별자리 인연, 7 가격 안내, 8 켈틱 크로스.
주의: 1번에는 "오픈 기념 … 11월 30일까지" 문장이 있어 12월부터는 다시 찍어야 하고, 8번은 맨 아래 줄이 걸쳐 잘려 있다(빼도 7장).
