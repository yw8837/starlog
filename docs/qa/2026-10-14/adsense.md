# AdSense 심사 준비 점검: https://yeolmaeapps.kr (스타로그 가이드)

- 점검일: 2026-10-14 (KST). 코드 기준: 라이브 = main = 72c35ec. 읽기 전용 점검이라 레포 파일, git 상태, 포트(3100·3200·8787)는 건드리지 않았어요.
- 프로덕션 요청: GET/HEAD만, 순차로 약 200건, 쿠키·자격증명 없음. 스크린샷은 Playwright로 찍되 Google 광고 서버(googlesyndication 등) 요청은 막고 찍었어요.
- 증거 원본: `.omc/qa/2026-10-14/adsense-raw/` (HTML 70건·앱 호스트 9건, `status.tsv`, `rows.json`, `body_counts.json`, `dup_paras.json`), 스크린샷 `.omc/qa/2026-10-14/shots/adsense-*.png`.
- 게시자 ID는 이 문서에 쓰지 않았어요. 형식 일치 여부만 적어요.
- 저작권 때문에 구글 문서는 거의 의역하고 URL을 붙였어요. 문구가 중요하면 해당 URL에서 원문을 확인해 주세요.

## 0. 한 줄 결론

심사 탈락으로 바로 이어질 확정 결함(Critical/High)은 못 찾았어요. Medium은 5건이에요: HTTP를 HTTPS로 넘기지 않음(구글 점검 항목에 있음), 소개·개인정보·약관이 루트 도메인에 없고 앱 호스트로 307, 글 분량과 신규·템플릿 신호, 자동 광고 상태 미확인과 허브 페이지의 광고 스크립트. AdSense 대시보드 값(자동 광고, 사이트 상태), 실제 트래픽, 구글 색인은 제가 볼 수 없어서 UNKNOWN으로 뒀어요.

---

## 1. 공식 기준 (출처)

도구 한계: WebFetch는 페이지를 작은 모델로 요약해 돌려줘서, 아래는 전부 발췌·의역이에요. `10502938`(게시자 정책)과 `48182`(프로그램 정책)는 전문을 못 받았고, 도구가 "제공된 텍스트에 없다"고 한 항목은 아래에서도 "확인 못 함"으로 적었어요.

| 약칭 | 요지(의역) | URL |
|---|---|---|
| S1 프로그램 정책 | 게시자 정책 준수 필수, 광고 사이트는 이동이 쉬워야 함, 팝업·이메일·소프트웨어 같은 곳에 광고 코드 금지, 자기 클릭·클릭 유도 금지. 페이지 표기 갱신일 2026-08-04 | https://support.google.com/adsense/answer/48182 |
| S2 자격 요건 | 원문 한 줄: "Your content must be high-quality, original, and attract an audience." 그 밖에 만 18세, 제출 사이트 HTML 접근, 정책 준수. 최소 글 수나 사이트 연령 기준은 페이지에 없음 | https://support.google.com/adsense/answer/9724 |
| S3 사이트가 준비 안 됨 | 원인 4가지: 광고 코드 누락, 접근 불가(유효한 인증서, HTTP를 HTTPS로 리다이렉트하는지, robots.txt가 AdSense 크롤러를 막는지), 고유 콘텐츠·UX·내비 부족, 정책 위반. 심사는 보통 며칠, 길면 2~4주 | https://support.google.com/adsense/answer/9061852 |
| S4 게시자 정책 | 개인정보처리방침이 수집·공유·이용을 밝히고 제3자가 쿠키를 둘 수 있음을 알려야 함. 화면에 게시자 콘텐츠 없음·저가치, 남의 콘텐츠를 덧붙임 없이 복제, 콘텐츠보다 광고가 많음 금지. 광고가 탐색·행동 요소에 겹치거나 인접해 실수 클릭을 부르면 안 됨. 오도하는 주장(해로운 건강 주장, "Get Rich Quick") 금지 | https://support.google.com/publisherpolicies/answer/10502938 |
| S5 콘텐츠 없는 화면 | 게시자 콘텐츠가 없거나 저가치, 공사 중, 알림·탐색·행동 목적인 화면에 Google 광고 금지. 저가치·공사 중 페이지는 고쳐질 때까지 광고를 제한·중단할 수 있음 | https://support.google.com/publisherpolicies/answer/11112688 |
| S6 게시자 제한 | 광고가 줄 수 있는 콘텐츠: 성적, 충격, 온라인 도박, 약물, 주류, 처방약, 미승인 의약·보충제 등. 점술·점성술·타로 항목은 확인한 발췌에 없음 | https://support.google.com/adsense/answer/9335567 |
| S7 방침 필수 내용 | 제3자(구글 포함)가 쿠키로 과거 방문 기반 광고를 보여 준다는 고지, 광고 쿠키 설명, Ads Settings와 aboutads.info로 맞춤 광고를 끄는 방법, (제3자 광고 제공을 끄지 않았다면) 업체명과 링크. 구체 문구는 제시 안 함 | https://support.google.com/adsense/answer/1348695 , https://policies.google.com/technologies/partner-sites |
| S8 ads.txt | 한 줄 형식 `google.com, pub-<게시자>, DIRECT, f08c47fec0942fa0`, 사이트 루트 디렉터리에 올림 | https://support.google.com/adsense/answer/7532444 |
| S9 사이트 연결 | 코드 조각, ads.txt 줄, 메타 태그 중 택일. 메타 태그는 head에 둠 | https://support.google.com/adsense/answer/7584263 |
| S10 페이지 준비 팁 | 가치 있는 원본 콘텐츠가 핵심, 스크랩·저작권 콘텐츠에는 광고 불가, 내비가 명확해야 함 | https://support.google.com/adsense/answer/7299563 |
| S11 광고 배치·라벨 | 라벨은 "Advertisements" 또는 "Sponsored Links"만, 사용자 요청 없는 새로고침 금지 | https://support.google.com/adsense/answer/1346295 |
| S12 지원 언어 | 한국어가 목록에 있음 | https://support.google.com/adsense/answer/9727 |
| S13 서브도메인 | 2023년부터 기존 사이트의 서브도메인을 Sites에서 추가·관리 못 함, 광고 게재·수익엔 영향 없음. "루트 승인이 하위 도메인에 이어진다"는 문장은 이 페이지에 없음 | https://support.google.com/adsense/answer/12170421 |
| S14 EEA/UK/스위스 동의 | 해당 지역 사용자에게 맞춤 광고를 내려면 구글 인증 CMP(TCF 연동) 필요, 없으면 비맞춤·제한 광고만 | https://support.google.com/adsense/answer/13554116 |
| S15 검색 스팸 정책 | 항목에 "대량 생성 콘텐츠(Scaled content abuse)", "스크레이핑" 등이 있음 | https://developers.google.com/search/docs/essentials/spam-policies |

점술·타로 전용 조항: 위 문서 어디에서도 못 찾았어요(없다고 단정하진 않아요). 이 업종에서 실제로 걸리는 건 S4의 "해로운 건강 주장", "Get Rich Quick"류 기만, 그리고 S6의 도박·약물·성적 콘텐츠예요.

---

## 2. 기준 체크리스트

| # | 기준 (출처) | 상태 | 증거 |
|---|---|---|---|
| C1 | 고품질·원본 콘텐츠, 청중 (S2, S10) | RISK | 글 68편, 문단 단위 복제 거의 없음(아래 C5). 본문 한글 중앙값 1,391자(최소 1,155). 모든 글이 2026-09-30~10-06 게시, 사이트 나이 8~14일. 트래픽은 UNKNOWN. 공식 최소 분량 기준은 못 찾음 |
| C2 | 콘텐츠 없는/저가치 화면에 광고 금지 (S5, S4) | RISK | 광고 스크립트가 글뿐 아니라 허브 `/`, `/guide/saju`에도 로드(`app/guide/layout.tsx:14`). 광고 단위 ID 미설정이라 `<ins>` 0/70이라 지금 노출되는 광고는 없음. 자동 광고가 켜져 있는지는 UNKNOWN (ADS-05) |
| C3 | 공사 중·빈 카테고리 없음 (S5) | PASS | 탭 2개(타로 37편, 사주 31편) 모두 채워짐, 70/70 200. 글 안 "준비 중" 상품 안내 3편만 있음(Low, ADS-08) |
| C4 | 스크랩·복제·저작권 콘텐츠 없음 (S10, S4, S15) | PASS(표본) | 임의 문장 5개를 웹 검색, 동일 문장 0건(미국 검색 도구라 완전하진 않음, 미검증 단서). 이미지는 1909 RWS 스캔(퍼블릭 도메인, 출처 Wikimedia Commons, `scripts/fetch-cards.py:1-7`) |
| C5 | 글끼리 겹치는 반복 블록 (S5 "복제", S15) | PASS | 25자 이상 문단 완전 일치 8건뿐: 출처 줄 1건(31편), 면책 한 줄(2편), 짧은 구절 6건. 8자 조각 Jaccard 최대 0.105 (day-master-gyesu vs imsu) |
| C6 | 내비·메뉴 명확 (S1, S3, S10) | PASS | 상단 내비, 타로/사주 탭, 푸터 10개 링크. 내부 링크 84개(루트 70 + 앱 호스트 14) 전부 200, 외부 링크 0 |
| C7 | 404 처리 | PASS | `/guide/does-not-exist-xyz` → 404, noindex, "홈으로" 링크, 광고 스크립트 없음 |
| C8 | 사이트 접근 가능: 인증서 (S3) | PASS | curl이 `-k` 없이 성공 |
| C9 | 접근 가능: HTTP→HTTPS 리다이렉트 (S3) | FAIL | `http://yeolmaeapps.kr/` → 200 (ADS-01) |
| C10 | 접근 가능: robots가 AdSense 크롤러 안 막음 (S3) | PASS | `User-agent: *` → `Allow: /`, Disallow는 앱 경로(/api/ /chapter /story /me /dev /invite /bonds /b/ /pay)만. `Mediapartners-Google` UA로 글 200, ads.txt 200 (UA 흉내라 Cloudflare 봇 판정까지 검증한 건 아님) |
| C11 | 광고 코드·소유 확인 (S9) | PASS | `google-adsense-account` 메타가 70/70 페이지 head에 있음. `<script src=pagead2…>`는 서버 HTML에 없고 preload 링크만, 스크립트는 하이드레이션 뒤 주입됨(ADS-15, Info) |
| C12 | ads.txt (S8) | PASS | `https://yeolmaeapps.kr/ads.txt` 200 text/plain, 59바이트 한 줄, BOM·CRLF 없음, 형식 정규식 일치, 게시자 ID가 메타·스크립트 src와 일치. 앱 호스트도 같은 파일 200 |
| C13 | 개인정보처리방침이 쿠키·제3자 광고를 고지 (S4, S7) | PASS(일부 보완) | `/privacy` 6항 "광고 쿠키와 행태정보": 구글 등 제3자가 쿠키로 방문 기록 기반 광고, 수집 행태정보, 구글 파트너 사이트 링크, Google 광고 설정 링크, 만 14세 미만 맞춤광고 안 함. 빠진 것은 aboutads.info류 링크(ADS-06) |
| C14 | 소개(운영자)·연락·약관 (S3) | PASS(호스트 단서) | 모든 루트 도메인 페이지 푸터에 상호·대표·사업자등록번호·통신판매업 신고번호·주소·이메일·전화 표시. `/about`, `/terms`, `/privacy`는 앱 호스트에 있고 루트에서는 307 (ADS-02) |
| C15 | 해로운 건강·재정·기만 주장 없음 (S4) | PASS | 68편 키워드 훑기(보장·확실·치료·투자·로또·저주 등): 효과 보장 0건, 건강·돈·법률은 전문가 상담으로 안내(예: temperance, death, pentacles-suit, the-devil, one-card-yes-no) |
| C16 | 도박·약물·성적·충격 콘텐츠 없음 (S6) | PASS | 해당 소재 없음. 죽음·탑·악마 카드도 "실제 죽음·사고·질병을 점치지 않는다"고 명시(`guide_death` 주의 상자) |
| C17 | 지원 언어 (S4, S12) | PASS | 한국어, `<html lang="ko">`(`app/layout.tsx`) |
| C18 | 광고 배치·라벨 (S11, S4) | UNKNOWN / RISK | 광고 단위가 아직 없어 실측 불가. 코드는 광고 슬롯을 글 끝 CTA 버튼 바로 앞에 둠(`app/guide/[slug]/page.tsx:125-127`), 라벨은 "광고"(한국어 표기, S11이 말하는 두 영문 라벨의 대응어) (ADS-09) |
| C19 | 모바일 레이아웃 | PASS | 390px: 가로 넘침 0, 본문 15px, 표는 스크롤 영역. 스크린샷 `shots/adsense-*-mobile.png` |
| C20 | 신청자 18세, HTML 접근 (S2) | UNKNOWN | 계정 정보라 확인 불가. HTML은 직접 소유 |
| C21 | EEA/UK/스위스 동의 (S14) | INFO | CMP·동의 배너 없음(코드에 CMP·TCF 연동 없음(`__tcfapi`, `googlefc`, 주요 CMP 이름 검색 0건)). 한국 대상이면 심사와 무관, 해당 지역 방문자에겐 맞춤 광고 불가 (ADS-12) |
| C22 | 대량 생성·템플릿 (S15) | RISK | 짧은 기간 대량 게시, 카드 글 20/22편이 같은 h2 5개 (ADS-04) |

---

## 3. 발견 사항

심각도 기준: Critical = 심사 거절이 사실상 확정, High = 거절 사유가 될 가능성이 높음, Medium = 영향 가능성이 있어 심사 전에 고치는 게 좋음, Low = 개선, Info = 참고.

### ADS-01 [Medium] HTTP가 HTTPS로 넘어가지 않아요
- 증거: `curl -sI http://yeolmaeapps.kr/` → `HTTP/1.1 200 OK`, `Location` 없음. `http://yeolmaeapps.kr/guide/the-fool`과 `http://starlog.yeolmaeapps.kr/`도 같은 200. HTTPS 응답엔 HSTS(`max-age=63072000`)가 있지만, 처음 오는 방문자와 크롤러는 평문 HTTP 페이지를 그대로 받아요.
- 왜 중요한가: S3("사이트에 접근할 수 없음" 점검 항목)이 HTTPS 사이트가 HTTP를 HTTPS로 리다이렉트하는지 묻고 있어요. 캐노니컬은 모두 https라서 색인은 괜찮지만 심사 점검표에는 걸려요.
- 고칠 방법: Cloudflare 대시보드 yeolmaeapps.kr 존 → SSL/TLS → Edge Certificates → "Always Use HTTPS" 켜기(코드 변경 없음). 대시보드 접근이 어렵다면 `worker.mjs`에서 `http:` 요청을 301로 돌려도 돼요. 배포 뒤 `curl -sI http://yeolmaeapps.kr/`로 301 확인.
- 노력: S

### ADS-02 [Medium] 루트 도메인에 소개·개인정보·약관·문의 페이지가 없고 앱 호스트로 307이에요
- 증거: `https://yeolmaeapps.kr/privacy`, `/about`, `/terms`, `/faq` → 모두 307 → `https://starlog.yeolmaeapps.kr/...`(없는 경로도 307). 루트 70페이지의 푸터 링크 10개 중 9개가 앱 호스트 절대 URL이에요(`/about /how /evidence /help /faq /pricing /terms /privacy /refund`). 규칙은 `apps/web/lib/hostRoutes.ts:67,85`(`APP_PATH`, `permanent:false`). 앱 호스트의 해당 페이지는 모두 200이고 내용도 충실해요(`/privacy` 개인정보처리방침 약 8,800자).
- 왜 중요한가: 심사 대상은 `yeolmaeapps.kr`인데 방침·운영자 소개가 다른 호스트에 있어요. S4는 사이트가 방침을 두라고 하고, S3은 내비·UX를 봐요. 방침에 1클릭으로 닿으니 위반은 아니지만, 심사자나 크롤러가 호스트 경계를 안 넘으면 "방침 없음"으로 읽을 수 있어요. 레포 주석(`lib/hosts.ts:3-6`, `docs/seo/guide-domain.md:3`)은 "루트 승인이 서브도메인에 이어진다"를 전제하는데, 제가 읽은 공식 페이지(S13)엔 그 문장이 없어요(미검증).
- 고칠 방법(택일):
  1. 루트 도메인에서 `/about`, `/privacy`, `/terms`를 직접 서빙: `lib/hostRoutes.ts`의 `OWN_SEGMENTS`(57행)에 세그먼트를 추가하고, 캐노니컬은 앱 호스트로 두면서 `components/layout/Footer.tsx`의 `linkHref(..., host)`가 가이드 호스트에서는 같은 호스트 링크를 쓰게 해요. 노력 M.
  2. 최소안: 루트 푸터에 "개인정보처리방침"을 한 줄 더 눈에 띄게(이미 강조 표시됨) 두고 그대로 둠. AdSense 신청 사이트 항목이 `yeolmaeapps.kr`인지 확인. 노력 S.
- 노력: M (1안) / S (2안)

### ADS-03 [Medium] 글이 비교적 짧아요 (공식 최소 분량은 없음)
- 증거(`rows.json`, `body_counts.json`): 글 68편의 본문 한글(요약·한눈에 보기 제외) 최소 1,155자(saju-vs-astrology), 중앙값 1,391, 평균 1,420, 최대 1,955(pentacles-suit). 요약 포함 전체 한글은 중앙값 1,657자(어절 약 640), 24편이 1,600자 미만이에요. 가장 짧은 6편: saju-vs-astrology 1,155 / five-elements 1,166 / new-year-fortune 1,188 / heavenly-stems 1,201 / twelve-stages 1,268 / daewoon 1,275. 이전 점검(`docs/seo/audit-2026-10-08.md:198-207`)이 지적한 "큰 검색어를 맡은 글이 제일 얇다"는 점은 일부만 해소됐어요(five-elements, saju-vs-astrology는 여전히 하위권).
- 왜 중요한가: S2는 "고품질·원본·청중"만 요구하고 글자 수 기준은 없어요(제가 읽은 페이지 기준). 다만 "고유 콘텐츠 부족"은 S3의 거절 사유 중 하나라, 같은 분량이 반복되는 68편은 "얇다"는 인상을 줄 수 있어요. 한편 표 117개, 주의·참고 상자 88개, 원전 인용, 출처 줄이 있어 단순 분량 채우기는 아니에요.
- 고칠 방법: 하위 6편부터 사례 한두 개(예: 만세력 표를 한 장 놓고 읽기), 자주 하는 오해, 단계별 따라 하기를 더해 1,800자 이상으로. 위치: `apps/web/lib/guide-articles/saju-concepts.ts`, `saju.ts`, `answers.ts`. 갱신 날짜(`lib/guide.ts`의 `GUIDE_DATES`)도 같이.
- 노력: M~L

### ADS-04 [Medium] 신규 사이트에 짧은 기간 대량 게시 + 템플릿 구조 (신호 위험)
- 증거: JSON-LD `datePublished`가 2026-09-30(6편), 10-01(36편), 10-06(26편), `dateModified`는 10-07(62편)·10-08(6편)이라 글 전부가 14일 안에 나왔어요. 카드 해설 22편 중 20편이 h2 5개(`그림 속 장면`, `정방향으로 읽을 때`, `역방향으로 읽을 때`, `연애·일·돈 질문에서`, `비슷한 카드와 헷갈릴 때`)를 똑같이 써요(`lib/guide-articles/tarot.ts:22,26,70,74,…`). 일간 10편은 6개 h2 골격(`…는 어떤 글자인가요`, `명리에서 읽는 …의 결`, `강점과 살펴볼 점`, …)이 이름만 바뀐 채예요. 반대로 the-hermit·the-star는 카드 이름이 들어간 h2로 이미 손봐서 이 20편과 달라요.
- 왜 중요한가: 심사에서 흔히 보는 "저가치·대량 생성" 패턴(S15의 대량 생성 콘텐츠 항목)과 겉모습이 닮아요. 실제로는 문장 겹침이 낮고(C5) 원전 인용과 출처가 있어서 내용으로는 방어돼요. 트래픽·색인은 직접 못 봤어요(`docs/handoff/2026-10-13.md:49`는 "루트 도메인 글이 색인됨"이라고 기록, 미검증).
- 고칠 방법: 카드 글 20편의 h2를 hermit·star처럼 카드별 문구로(제목 변경은 FAQ JSON-LD 질문과도 맞춰야 함), 주기적으로 실제 갱신(새 글·보강)하고 그 날짜를 올려요. 사이트 나이와 트래픽은 시간이 해결해요.
- 노력: M

### ADS-05 [Medium, 미확인] 자동 광고 상태를 모르고, 스크립트가 허브·목록 페이지에도 로드돼요
- 증거: `apps/web/app/guide/layout.tsx:14`가 `/guide` 아래 모든 페이지(루트 `/`의 허브, `/guide/saju` 허브 포함)에 `adsbygoogle.js`를 `afterInteractive`로 주입해요. 광고 단위 ID(`ADSENSE_SLOT_GUIDE`)가 비어 있어 `<ins class="adsbygoogle">`은 70/70 페이지에 0개고, 수동 광고는 글 페이지 한 곳(`page.tsx:125`)에만 있어요. 레포 문서는 "자동 광고는 끈 채로" 쓰라고 해요(`docs/seo/guide-domain.md:69`, `apps/web/.env.example:36`). 대시보드의 실제 설정은 제가 못 봐요. 앱 호스트 페이지 17곳(정보 페이지 9 + 앱 경로 8)과 루트 404엔 스크립트가 없어요.
- 왜 중요한가: 자동 광고가 켜져 있으면 허브 페이지(글 소개문 목록, 탐색용 화면)에 광고가 자동으로 붙을 수 있어요. S5는 탐색·행동 목적의 화면에 광고를 금지해요.
- 고칠 방법: AdSense → Sites → yeolmaeapps.kr에서 자동 광고가 꺼져 있는지 확인(대시보드 작업, 제가 못 함). 코드로 막으려면 `<Script>`를 `app/guide/layout.tsx`에서 `app/guide/[slug]/page.tsx`로 옮겨 글 페이지에서만 로드해요. 참고: 레이아웃 주석의 "클라이언트 이동 뒤에도 스크립트가 남는다"는 걱정은 호스트가 나뉜 프로덕션에선 해당 안 돼요(글→앱은 다른 오리진으로 전체 로드).
- 노력: S

### ADS-06 [Low] 개인정보처리방침에 빠진 것
- 증거: `app/privacy/page.tsx:271-281`(광고 쿠키 절). 있는 것: 제3자 쿠키 고지, Google 파트너 사이트 링크, Google 광고 설정 링크. 없는 것: 제3자 광고 업체용 거부 경로(`aboutads.info` 등, S7이 언급), 광고 업체를 이름으로 안내하는 문장("Google 등 제3자 광고 사업자"라고만 있음). 시행일이 2026-10-15라서(`lib/legal.ts:4`) 오늘(10-14)엔 미래 날짜예요.
- 왜 중요한가: S7은 이 세 가지를 방침에 넣으라고 해요. 이미 핵심은 충족해서 심사에서 걸릴 가능성은 낮아요.
- 고칠 방법: 280행 근처에 "제3자 광고 사업자의 맞춤 광고는 www.aboutads.info 에서도 끌 수 있어요" 한 문장과 링크 추가. 시행일은 심사일 이후라 방치해도 되지만, 광고 고지는 이미 나가 있으니 시행일 이전 버전과의 관계는 법무 확인.
- 노력: S

### ADS-07 [Low] 글쓴이·검수자 표기가 없고 출처가 링크가 아니에요
- 증거: 글 JSON-LD `author`가 Organization(열매스튜디오)뿐이고 사람 이름·경력이 없어요. 화면의 출처 줄은 텍스트(`그림: 1909년 원판 · 원전: 웨이트 …`, `달력: 한국천문연구원 음력 · NASA JPL 절입 시각 검증`)이고 링크는 0개(`links_external.txt`가 비어 있음). `/about`은 962자예요.
- 왜 중요한가: 필수는 아니지만 "누가 쓰는가"와 근거 확인 가능성은 원본성·신뢰 판단에 쓰여요. `/evidence`엔 방법·출처가 자세히 있어요(3,296자).
- 고칠 방법: 푸터나 글 머리에 "만든 곳: 열매스튜디오" 한 줄과 `/evidence` 링크, 출처 줄을 sacred-texts·한국천문연구원 등 원문 링크로. `app/guide/GuideEvidence.tsx`.
- 노력: S

### ADS-08 [Low] 글 안의 "준비 중" 상품 안내
- 증거: celtic-cross-spread("심층 타로 … 준비 중이에요"), new-year-fortune(h2 `2027 신년운세는 준비 중이에요`), saju-compatibility(h2 `우리 사이 궁합은 준비 중이에요`). 코드 `lib/guide-articles/saju.ts:743,810`, `spreads.ts:122`, 테스트가 문구를 고정함(`lib/guide-articles/library.test.ts:136-153`). 앱 호스트 `/pricing`에도 "준비 중인 풀이"가 있어요(광고 없음).
- 왜 중요한가: S5가 막는 건 "공사 중인 화면"이고 이건 글 속 문단이라 위반은 아니에요. 다만 사람이 훑을 때 미완성 인상을 줄 수 있고 미출시 유료 상품 홍보로 읽혀요.
- 고칠 방법: 상품이 나올 때까지 심사 기간만이라도 해당 문단을 빼거나 "예정" 표현을 줄여요(테스트도 같이). 안 바꿔도 위험은 낮아요.
- 노력: S

### ADS-09 [Low] 광고 슬롯이 CTA 버튼 바로 앞에 놓여요 (광고 단위를 만든 뒤 문제)
- 증거: `app/guide/[slug]/page.tsx:125`에서 `AdSlot` 렌더 → 127행 `aside.cta`(전폭 버튼 "타로 보기 →"). 슬롯 위아래 여백은 28px(`components/ads/AdSlot.module.css`), 모바일은 화면 하단에 고정 탭바가 있어요. 현재 광고 단위 ID가 없어 실제 노출은 없음.
- 왜 중요한가: S4는 광고가 탐색·행동 요소에 인접해 실수 클릭을 부르는 배치를 막아요. 큰 버튼 바로 앞은 해당 소지가 있어요.
- 고칠 방법: 슬롯을 본문 두 번째·세 번째 섹션 사이로 옮기거나, CTA와의 간격을 키워요(최소 48px 이상 권장, 이건 제 판단이고 공식 수치 아님).
- 노력: S

### ADS-10 [Low] 가이드 호스트에 사이트 전체 면책 한 줄이 없어요
- 증거: "오락과 자기 성찰을 위한 참고 콘텐츠, 의료·법률·투자·진로의 전문적 판단을 대신하지 않음"은 이용약관과 소개 페이지에만 있어요. 글 68편 중 46편 본문엔 전문가 상담·참고용 언급이 없어요(건강·돈·법률을 다루는 22편은 있음).
- 왜 중요한가: 필수 아니고 위험한 주장도 없지만(C15), 점술 업종에선 면책이 첫 화면 근처에 있으면 오도하는 주장으로 읽힐 여지가 줄어요.
- 고칠 방법: `components/layout/Footer.tsx`의 `host="guide"`일 때만 한 줄 추가.
- 노력: S

### ADS-11 [Info] `www.yeolmaeapps.kr`는 해석되지 않아요
- 증거: `curl: (6) Could not resolve host: www.yeolmaeapps.kr`.
- 의미: AdSense에 등록한 사이트가 `yeolmaeapps.kr`이면 영향 없어요. www로 등록돼 있으면 크롤러가 못 닿아요. 사용자가 www를 치는 경우 오류 화면이 뜹니다.
- 고칠 방법: AdSense 사이트 항목 확인, 필요하면 DNS에 www CNAME + 루트로 301.
- 노력: S

### ADS-12 [Info] EEA/UK/스위스용 동의 관리(CMP)가 없어요
- 증거: 코드와 화면에 동의 배너·CMP 없음. S14는 이 지역 방문자에게 맞춤 광고를 내려면 인증 CMP가 필요하다고 해요.
- 의미: 한국어 서비스라 심사에는 영향이 없고, 해당 지역 방문자는 비맞춤·제한 광고만 받아요.
- 노력: M (필요할 때)

### ADS-13 [Info] 작은 위생 항목
- 404 페이지에 robots 메타가 2개 중복(`noindex`, `noindex, nofollow`). 해는 없어요.
- 루트 도메인 하단 탭바의 "내 기록"(`/story`), "내 정보"(`/me`)는 앱 호스트의 로그인 화면으로 가고, 둘 다 robots.txt Disallow예요(둘 다 200). 광고 스크립트는 거기엔 없어요.
- 앱 호스트의 `/login`, `/pay`는 파라미터 없는 GET에 404를 줘요(루트 페이지에서 링크하지 않고, 왜 404인지는 확인 안 함). 광고와는 무관해요.
- 루트 `/`의 캐노니컬은 끝 슬래시 없는 `https://yeolmaeapps.kr`로 표시돼요(동일 URL).

### ADS-14 [Info] 이미지 출처
- 가이드 글의 카드 이미지는 전부 1909 라이더-웨이트-스미스 스캔(`deck="rws1909"`, `page.tsx:108`)이고, 소유자 본인의 스타로그 카드 그림은 가이드 글엔 쓰이지 않아요(마스코트와 OG 이미지에 쓰임). 캡션 "라이더-웨이트-스미스 덱(1909)"은 사실과 맞아요. 스캔 출처(Wikimedia Commons)는 사이트에 적혀 있지 않지만 퍼블릭 도메인이라 필수는 아니에요.

### ADS-15 [Info] 광고 스크립트가 서버 HTML에 literal `<script>`로 없어요
- 증거: 70/70 페이지에 `<link rel="preload" … pagead2 …>`만 있고 `<script src=pagead2…>`는 0건(`next/script`가 하이드레이션 뒤 주입). 대신 `google-adsense-account` 메타가 head에 있고(S9가 허용하는 방식) ads.txt도 있어요.
- 의미: S3의 "코드 누락" 점검은 메타·ads.txt로 충족돼요. 광고 단위를 쓸 때까지는 이대로 괜찮아요.

---

## 4. 글 목록 (사이트맵 70 URL 전부)

- 사이트맵: `https://yeolmaeapps.kr/sitemap.xml`에 70 URL(허브 2 + 글 68: 타로 37, 사주 31). lastmod는 2026-10-07 62건, 10-08 8건이에요. 70/70이 200으로 응답, 제목·h1 모두 고유(중복 0), 캐노니컬은 자기 자신.
- "본문 한글"은 `<article>` 안의 본문 영역만 센 한글 음절 수(요약·한눈에 보기·내비·푸터 제외), "글 전체 한글"은 요약과 한눈에 보기를 포함한 값이에요.
- 이미지 열은 본문 속 카드 이미지의 고유 파일 수(관련 글 썸네일 제외). 이미지가 있는 글 34편은 모두 1909 RWS 스캔이고, 사주·개념 글 34편은 래스터 이미지 없이 표와 상자로 설명해요.
- 허브 행(1, 43)의 숫자는 글 소개문 목록이라 본문 분량이 아니에요.

| # | URL | 상태 | 본문 한글(요약·한눈에 보기 제외) | 글 전체 한글(요약 포함) | 본문 속 카드 이미지(고유 파일 수) | 비고 |
|---|---|---|---|---|---|---|
| 1 | https://yeolmaeapps.kr/ | 200 | 허브(목록) | 2048 | 22 | 타로 허브: 글 소개문 목록(카드 썸네일은 목록용) |
| 2 | https://yeolmaeapps.kr/guide/bond-score | 200 | 1363 | 1626 | 0 | 표 1·주의/참고 상자 2; 수정일 2026-10-07 |
| 3 | https://yeolmaeapps.kr/guide/branch-relations | 200 | 1319 | 1553 | 0 | 표 3·주의/참고 상자 2; 수정일 2026-10-07 |
| 4 | https://yeolmaeapps.kr/guide/celtic-cross-spread | 200 | 1668 | 1899 | 0 | 표 2·주의/참고 상자 3; 수정일 2026-10-07 |
| 5 | https://yeolmaeapps.kr/guide/court-cards | 200 | 1548 | 1766 | 4 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 6 | https://yeolmaeapps.kr/guide/cups-suit | 200 | 1654 | 1862 | 14 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 7 | https://yeolmaeapps.kr/guide/daewoon | 200 | 1275 | 1518 | 0 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 8 | https://yeolmaeapps.kr/guide/day-master-byeonghwa | 200 | 1371 | 1593 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 9 | https://yeolmaeapps.kr/guide/day-master-eulmok | 200 | 1359 | 1599 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 10 | https://yeolmaeapps.kr/guide/day-master-gapmok | 200 | 1438 | 1673 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 11 | https://yeolmaeapps.kr/guide/day-master-gito | 200 | 1355 | 1599 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 12 | https://yeolmaeapps.kr/guide/day-master-gyeonggeum | 200 | 1337 | 1558 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 13 | https://yeolmaeapps.kr/guide/day-master-gyesu | 200 | 1338 | 1573 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 14 | https://yeolmaeapps.kr/guide/day-master-imsu | 200 | 1310 | 1535 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 15 | https://yeolmaeapps.kr/guide/day-master-jeonghwa | 200 | 1351 | 1596 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 16 | https://yeolmaeapps.kr/guide/day-master-muto | 200 | 1343 | 1576 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 17 | https://yeolmaeapps.kr/guide/day-master-singeum | 200 | 1338 | 1583 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 18 | https://yeolmaeapps.kr/guide/day-master | 200 | 1325 | 1570 | 0 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 19 | https://yeolmaeapps.kr/guide/death | 200 | 1534 | 1789 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 20 | https://yeolmaeapps.kr/guide/earthly-branches | 200 | 1343 | 1559 | 0 | 표 1·주의/참고 상자 2; 수정일 2026-10-07 |
| 21 | https://yeolmaeapps.kr/guide/five-elements | 200 | 1166 | 1375 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-08 |
| 22 | https://yeolmaeapps.kr/guide/four-pillars | 200 | 1501 | 1743 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-07 |
| 23 | https://yeolmaeapps.kr/guide/heavenly-stems | 200 | 1201 | 1419 | 0 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 24 | https://yeolmaeapps.kr/guide/how-to-read-tarot | 200 | 1492 | 1680 | 3 | 표 3·주의/참고 상자 2; 수정일 2026-10-08 |
| 25 | https://yeolmaeapps.kr/guide/ipchun-jeolgi | 200 | 1372 | 1631 | 0 | 표 3·주의/참고 상자 2; 수정일 2026-10-07 |
| 26 | https://yeolmaeapps.kr/guide/jasi-birth | 200 | 1346 | 1611 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-07 |
| 27 | https://yeolmaeapps.kr/guide/judgement | 200 | 1425 | 1689 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 28 | https://yeolmaeapps.kr/guide/justice | 200 | 1398 | 1663 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 29 | https://yeolmaeapps.kr/guide/major-and-minor-arcana | 200 | 1440 | 1669 | 4 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |
| 30 | https://yeolmaeapps.kr/guide/major-arcana-overview | 200 | 1342 | 1585 | 3 | 표 4·주의/참고 상자 0; 수정일 2026-10-07 |
| 31 | https://yeolmaeapps.kr/guide/manseryeok | 200 | 1632 | 1880 | 0 | 표 3·주의/참고 상자 2; 수정일 2026-10-07 |
| 32 | https://yeolmaeapps.kr/guide/minor-arcana-suits | 200 | 1562 | 1780 | 7 | 표 1·주의/참고 상자 2; 수정일 2026-10-07 |
| 33 | https://yeolmaeapps.kr/guide/new-year-fortune | 200 | 1188 | 1427 | 0 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 34 | https://yeolmaeapps.kr/guide/now-card-how-to | 200 | 1334 | 1590 | 0 | 표 1·주의/참고 상자 3; 수정일 2026-10-07 |
| 35 | https://yeolmaeapps.kr/guide/one-card-yes-no | 200 | 1325 | 1564 | 0 | 표 1·주의/참고 상자 2; 수정일 2026-10-07 |
| 36 | https://yeolmaeapps.kr/guide/pentacles-suit | 200 | 1955 | 2189 | 14 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 37 | https://yeolmaeapps.kr/guide/redrawing-same-question | 200 | 1332 | 1560 | 2 | 표 0·주의/참고 상자 1; 수정일 2026-10-07 |
| 38 | https://yeolmaeapps.kr/guide/saju-birth-info | 200 | 1380 | 1615 | 0 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 39 | https://yeolmaeapps.kr/guide/saju-compatibility | 200 | 1361 | 1593 | 0 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 40 | https://yeolmaeapps.kr/guide/saju-glossary | 200 | 1493 | 1755 | 0 | 표 6·주의/참고 상자 1; 수정일 2026-10-07 |
| 41 | https://yeolmaeapps.kr/guide/saju-vs-astrology | 200 | 1155 | 1430 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-07 |
| 42 | https://yeolmaeapps.kr/guide/saju-without-birth-time | 200 | 1509 | 1736 | 0 | 표 2·주의/참고 상자 3; 수정일 2026-10-08 |
| 43 | https://yeolmaeapps.kr/guide/saju | 200 | 허브(목록) | 1861 | 0 | 사주 허브: 글 소개문 목록 |
| 44 | https://yeolmaeapps.kr/guide/strength | 200 | 1464 | 1759 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 45 | https://yeolmaeapps.kr/guide/swords-suit | 200 | 1754 | 1967 | 14 | 표 1·주의/참고 상자 2; 수정일 2026-10-07 |
| 46 | https://yeolmaeapps.kr/guide/temperance | 200 | 1404 | 1678 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 47 | https://yeolmaeapps.kr/guide/ten-gods | 200 | 1445 | 1674 | 0 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 48 | https://yeolmaeapps.kr/guide/the-chariot | 200 | 1440 | 1698 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 49 | https://yeolmaeapps.kr/guide/the-devil | 200 | 1448 | 1713 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 50 | https://yeolmaeapps.kr/guide/the-emperor | 200 | 1361 | 1650 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 51 | https://yeolmaeapps.kr/guide/the-empress | 200 | 1424 | 1700 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 52 | https://yeolmaeapps.kr/guide/the-fool | 200 | 1446 | 1714 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 53 | https://yeolmaeapps.kr/guide/the-hanged-man | 200 | 1487 | 1755 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 54 | https://yeolmaeapps.kr/guide/the-hermit | 200 | 1571 | 1861 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-08 |
| 55 | https://yeolmaeapps.kr/guide/the-hierophant | 200 | 1501 | 1793 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 56 | https://yeolmaeapps.kr/guide/the-high-priestess | 200 | 1429 | 1729 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 57 | https://yeolmaeapps.kr/guide/the-lovers | 200 | 1459 | 1730 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 58 | https://yeolmaeapps.kr/guide/the-magician | 200 | 1406 | 1699 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 59 | https://yeolmaeapps.kr/guide/the-moon | 200 | 1357 | 1641 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 60 | https://yeolmaeapps.kr/guide/the-star | 200 | 1533 | 1835 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-08 |
| 61 | https://yeolmaeapps.kr/guide/the-sun | 200 | 1365 | 1628 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 62 | https://yeolmaeapps.kr/guide/the-tower | 200 | 1416 | 1681 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 63 | https://yeolmaeapps.kr/guide/the-world | 200 | 1344 | 1626 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 64 | https://yeolmaeapps.kr/guide/three-card-spread | 200 | 1605 | 1814 | 3 | 표 2·주의/참고 상자 2; 수정일 2026-10-07 |
| 65 | https://yeolmaeapps.kr/guide/twelve-stages | 200 | 1268 | 1511 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-07 |
| 66 | https://yeolmaeapps.kr/guide/upright-and-reversed | 200 | 1384 | 1592 | 1 | 표 2·주의/참고 상자 1; 수정일 2026-10-08 |
| 67 | https://yeolmaeapps.kr/guide/wands-suit | 200 | 1617 | 1831 | 14 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 68 | https://yeolmaeapps.kr/guide/wheel-of-fortune | 200 | 1408 | 1720 | 5 | 표 1·주의/참고 상자 1; 수정일 2026-10-07 |
| 69 | https://yeolmaeapps.kr/guide/wolun-iljin | 200 | 1373 | 1620 | 0 | 표 3·주의/참고 상자 1; 수정일 2026-10-07 |
| 70 | https://yeolmaeapps.kr/guide/yongsin | 200 | 1384 | 1651 | 0 | 표 2·주의/참고 상자 1; 수정일 2026-10-07 |

---

## 5. 확인했고 괜찮은 것

- 70 URL 모두 200, 일반 UA와 `Mediapartners-Google` UA 둘 다 같은 크기 응답, 비밀번호·로그인 필요 없음.
- 내부 링크 84개(루트 70 + 앱 호스트 14) 모두 200, 외부 링크 0, 끊긴 링크 0. `/guide`, `/guide/tarot`은 `/`로 308, 앱 호스트의 `/guide/*`는 루트 도메인으로 308.
- 제목 70/70 고유, h1 고유, 설명 55~71자, 캐노니컬 자기 자신, 구조화 데이터(Organization, WebSite, Article, BreadcrumbList; 14편에 FAQPage, 3편에 HowTo).
- `ads.txt`: 형식 일치, 한 줄, 루트에 있음, 게시자 ID가 메타·스크립트 src와 같음. 앱 호스트에도 같은 파일.
- `google-adsense-account` 메타 70/70, `google-site-verification` 메타 70/70.
- robots.txt가 AdSense 크롤러를 막지 않음(`*` 그룹 Allow). 사이트맵 선언 있음. `Google-Extended`, `GoogleOther` 차단은 AdSense와 무관.
- 보안 헤더에 광고를 막는 CSP 없음(`Content-Security-Policy: frame-ancestors 'none'`만).
- 광고 코드 범위: 루트의 `/guide` 아래에서만 로드. 앱 호스트의 정보 9곳(about, privacy, terms, faq, help, how, evidence, pricing, refund)과 앱 경로 8곳(/, /login, /tarot/new, /saju/new, /me, /story, /pay, /today)엔 `pagead2` 0건. 풀이 생성·결제·로그인 화면은 광고 없음. 루트 404도 광고 스크립트 없음.
- 내용 정책: 효과·결과 보장 표현 없음("장담하는 카드는 아니니"처럼 부정형만 1건), 질병·수명·사고를 점치지 않는다고 명시, 투자·복권은 "신호로 읽지 않는다"로 처리, 주의 상자 26편에 건강·돈·법률 전문가 상담 안내. 연령: 만 14세 이상 서비스, 미성년·아동 대상 맞춤 광고 안 함(방침 6항, 8항).
- 문단 복제 점검: 25자 이상 고유 문단 1,510개 중 완전 중복 8개, 모두 출처 줄·면책 한 줄·짧은 구절. 비슷한 글 묶음(카드 22편 평균 Jaccard 0.048, 일간 10편 0.065, 검 4편 0.018)도 낮아요.
- 모바일: 390px에서 가로 넘침 0, 본문 15px, 푸터 링크 높이 44px, 하단 탭바 고정.
- 지원 언어: 한국어 (S12). `<html lang="ko">`.
- 개인정보 고지: 쿠키 목록, 제3자 광고 쿠키, 처리 위탁, 국외 이전, 보유 기간, 이용자 권리, 책임자 연락처 모두 있음.

## 6. 못 본 것·미검증

- AdSense 대시보드: 사이트 상태, 자동 광고 on/off, 정책 센터, 계정 연령 요건(UNKNOWN).
- 트래픽: 사이트맵 규모와 게시 날짜 말고는 방문자·유입 수치를 못 봤어요. 색인 상태는 이 환경의 웹 검색에서 `site:yeolmaeapps.kr`와 정확한 글 제목이 안 잡혔지만, 이 도구는 구글이 아니고 미국 한정이라 근거로 쓰지 않았어요(`docs/handoff/2026-10-13.md:49`는 색인됨이라고 적음).
- 표절 점검: 문장 5개를 따옴표 검색한 표본뿐이에요(동일 문장 0건). 전수 검사가 아니에요.
- 구글 공식 문서 전문: 도구가 요약본만 줘서 일부 항목은 의역이에요.
