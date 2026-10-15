# 스타로그 최종 기능·UX QA: 결제 전체 오픈 전 (2026-10-15~16)

읽기 전용 점검이라 레포 파일 수정, 커밋, 배포는 하지 않았음. 아래 숫자는 모두 직접 측정한 값임. 측정하지 않은 항목에는 "측정 안 함"이라고 적었음.

- 기준 경로: `C:/Users/최용우/AppData/Local/Temp/claude/D--Money-apps/11f3b511-f2fa-4168-89bd-874d0001e2df/scratchpad/qa-final/` (이하 `QA/`)
- 스크린샷: `QA/shots/*.png` (498장)
- 원자료 JSON과 로그: `QA/out/`
- 스크립트: `QA/scripts/*.cjs`

---

## 1. 실행 환경

| 항목 | 내용 |
|---|---|
| 대상 코드 | 운영 `/api/version` → `{"build":"1733a93c7b11"}`. 로컬은 레포 HEAD `72a4184`. 1733a93 다음 커밋은 문서만 바꿨으므로 앱 코드는 운영과 같음 |
| 로컬 서버 | 처음에는 메인 트리에서 띄웠는데 실패함: `⨯ Another next dev server is already running. PID 39940` (다른 에이전트가 같은 `apps/web`에서 3300을 쓰는 중). 그 서버는 건드리지 않았음. 대신 `git clone --local`로 만든 격리 클론 `QA/../clone`에서 `pnpm --filter @starlog/web exec next dev --port 3310`으로 띄움. 클론 HEAD는 72a4184이고 `.env.local`이 없어서 **실제 API 키가 아예 없는 상태**였음. 그래서 다른 에이전트가 수정 중인 GeneratingState·progress·waitingTips 미커밋 변경은 이번 테스트에 들어가지 않았음(운영과 같은 화면) |
| env | `STARLOG_AI=mock STARLOG_PAY=mock STARLOG_KAKAO=mock STARLOG_PAYMENTS=on STARLOG_CF_DEV=1 STARLOG_SIGNING_SECRET=e2e-only-… STARLOG_OWNER_CODE=owner-code-for-e2e-0000001`. 클론에서 `wrangler d1 migrations apply --local`로 0001~0008 적용 |
| mock 확인 | `curl -D - http://localhost:3310/` → `X-Starlog-Dev-Provider: mock`. 서버 로그(`QA/out/server.log`)의 `ai.generate` 42건이 전부 `"provider":"mock"`, tokens 0. `anthropic` 문자열 0건 |
| 브라우저 | Playwright(클론 node_modules의 playwright-core) + Chromium 1234, headless, `ko-KR`, `Asia/Seoul` |
| 뷰포트 | 390×844 (DPR2, isMobile, hasTouch) / 1280×800 |
| 운영 안전장치 | 운영 크롤 컨텍스트에서 `starlog.yeolmaeapps.kr`·`yeolmaeapps.kr`로 가는 GET/HEAD 아닌 요청은 전부 route에서 abort하고 기록함. 막힌 요청은 Cloudflare RUM 비콘(`POST /cdn-cgi/rum?`)뿐이었고, 생성 API POST는 0건(`QA/out/crawl-prod-*.json` 마지막 `blockedNonGet`). 운영에서는 로그인·결제·폼 제출·Turnstile을 하지 않았음 |
| 정리 | 3310 서버와 부모 프로세스 종료, 포트 닫힘 확인(`3310 listening after stop: False`). 다른 에이전트의 3300은 계속 떠 있음. 메인 레포 `git status`에는 다른 에이전트 파일만 보임(GeneratingState·FreeResult·SajuChartView·waitingTips 등). 내가 바꾼 레포 파일은 0개. 클론(`QA/../clone`, node_modules 포함)과 클론의 로컬 D1 QA 데이터(mock 계정·주문·공유·별자리)는 재현용으로 남겨 둠. 지워도 됨 |

참고: 운영 크롤 콘솔의 `net::ERR_FAILED` 257줄은 위 RUM 비콘을 내가 막아서 생긴 것임. 앱 오류가 아님.

---

## 2. 발견 사항 요약

Blocker와 High는 0건임.

| ID | 심각도 | 위치 | 한 줄 요약 |
|---|---|---|---|
| F-01 | **Medium** | `/pay/success` | 결제 확인(`/api/pay/confirm`)이 두 번 실패하면 **최대 16분 동안 "결제를 확인하고 있어요" 한 줄만** 보임. 버튼, 안내, 나갈 길이 없음. API가 회복된 뒤에도 다시 확인하지 않음 |
| F-02 | **Medium** | `/help` | 도움말에는 "공유에는 뽑은 카드 이름과 스타로그 링크만 담겨요"라고 되어 있음. 실제 공유 링크는 **풀이 전체**를 보여 줌. 공유 시트 안내와 서로 맞지 않음 |
| F-03 | **Medium** | `/pay/checkout` | 결제 정보 API가 실패하면 결제 화면에 "풀이를 다 적지 못했어요 · 횟수는 그대로예요"가 나옴. 결제와 맞지 않는 문구이고, 다시 시도 버튼도 없음 |
| F-04 | Medium (정책, 이월) | `/bonds`, `/b/*`, `/ranking`, 홈 | QA-06 그대로: "인연 93점", "+12", 점수 합계 랭킹 |
| F-05 | Low | 가이드 도메인 `/about` `/privacy` `/terms` | 상대 링크를 미리 불러오다 307 뒤 CORS로 막힘. 한 번 방문에 콘솔 오류 20~22건(애드센스 심사 도메인). 클릭하면 이동은 됨 |
| F-06 | Low (QA-05 잔여) | `/tarot/result` | 주 버튼까지 390에서 2,536px(화면 3.00개), 1280에서 1,757px(2.20개)로 전보다 더 내려감. "전체 풀이 보러 가기 ↓" 링크가 새로 생겨서 일부 해소됨 |
| F-07 | Low | 결과 시트 (판매 오픈 + 무료 미사용) | 금색 "전체 풀이 보기 · 오픈 기념 무료" 위에 "전체 풀이 · 2,900원"과 "이어서 물어보기 3번"이 함께 나옴. 둘 다 무료로 열면 빠지는 항목임 |
| F-08 | Low (QA-03 잔여) | `/s/<id>` | 칩과 메모는 가려졌지만 "'○○'이라고 골랐으니…", "메모에 '○○'라고 적었죠."처럼 가린 말을 인용하는 문장이 그대로 남음 |
| F-09 | Low (QA-07 잔여) | `/today` | "공유하기"를 누르면 홈 주소(`https://starlog.yeolmaeapps.kr`)가 복사됨 |
| F-10 | Low | `/today` | 첫 진입 때 조회가 실패하면 아무것도 안 했는데 "풀이를 다 적지 못했어요 · 횟수는 그대로예요"가 나옴 |
| F-11 | Low | `/me` | `/api/me`가 실패하면 로그인한 사람에게 비로그인 화면이 보임. 오류 안내도, 로그인 버튼도 없음 |
| F-12 | Low | `/b/<code>` | "별 되기" 실패 문구가 "지금은 별자리를 불러올 수 없어요"임. 실제로는 불러오기가 아니라 참여가 실패한 경우임 |
| F-13 | Low | `/me` | "알림 설정 · 준비 중"이 남아 있음 (개발·메타 문구) |
| F-14 | Low | `/pay/success`, `/pay/fail` | H1 없음 (운영·로컬, 두 폭 모두) |
| F-15 | Low (QA-10 잔여) | `/tarot/result` | 응답이 멈추면 91초 뒤에야 타임아웃 안내가 나옴. 첫 문구는 "카드를 읽고 있어요"로 고쳐짐 |
| F-16 | Low (QA-12 이월) | 전역 | 탭 순서가 모바일 `홈·내 기록·가이드·내 정보`, 데스크톱 `홈·가이드·FAQ·내 기록·내 정보`로 다름. 푸터 "이용 가이드"(/help)와 "가이드 글"이 따로 있음. 사주 단계 헤더 "명식 보기" |
| F-17 | Low | `/me` (판매 오픈 상태) | 비로그인 `/me`에서 "오픈 기념 무료" 안내가 사라짐. 오너 모드인 지금 운영에서는 보이고, 판매 오픈 뒤에도 무료는 10/31까지 유효함 |
| F-18 | Low (오너 전용) | `/owner` | 확인 문구가 "결제도 시험할 수 있어요"인데, 운영은 실결제 키라서 실제 결제가 됨. 확인 직후에는 "신고된 후기" 데스크가 안 보이고 새로고침해야 보임 |
| I-1~I-8 | Info | — | §4 참고 |

---

## 3. 상세 (Medium 이상과 주요 Low)

### F-01 Medium: 결제 확인이 두 번 실패하면 16분 동안 멈춘 것처럼 보임

- **재현** (`QA/scripts/flow-errors2.cjs`, 390·1280 모두): mock 카카오 로그인 → `/pay/checkout?product=saju&returnTo=%2Fme` → `/api/pay/confirm`을 502(HTML)로 가로챔 → "4,900원 결제하기"
  - 2초에 `/pay/success?paymentType=NORMAL` "결제를 확인하고 있어요"가 뜸. 110초 동안 화면 변화 0회 (`QA/out/flow-errors2-{m,d}.json` `confirm-502-long.seen`)
  - 가로채기를 푼 뒤에도 6초 넘게 그대로임. 버튼은 `[""]`(아이콘뿐), main 안 링크는 `[]` (`confirm-recover`)
- **원인**: `app/pay/success/PaySuccess.tsx:24-25` `WAIT_MS = 16 * 60_000`. `:95-114`에서 다시 confirm하는 건 1번뿐이고(`confirmedAgain`), 그 뒤로는 주문 상태만 묻는데 상태는 계속 `created`임. `:136-139` 대기 중에는 `<p role="status">` 한 줄만 보임. 16분이 지나야 LATE 안내와 "내 정보로 가기"가 나옴
- **영향**: 돈은 안전함. Toss 승인은 확인이 없으면 청구되지 않고, 서버가 15분 뒤에 정리함. 하지만 결제 버튼을 누른 사람이 16분 동안 출구 없는 화면을 봄. 오픈 뒤에 Worker나 Cloudflare가 잠깐 흔들리면(10/15 배치 장애 같은 경우) 실제로 생길 수 있음. 16분 뒤 문구 "결제가 끝나면 … 나타나요"도 확인이 끝내 안 된 경우에는 맞지 않음
- **증거**: `QA/shots/err2-checkout-502-m-04-confirm-502-long.png`, `…-m-05-confirm-recover.png`, `…-d-04/05-*.png`. 콘솔: `Failed to load resource: the server responded with a status of 502 (Bad Gateway)` (`/pay/success`)
- **수정 제안 (S)**: 30초가 넘으면 "확인이 늦어지고 있어요. 청구가 확정되면 내 정보에 나타나요. 이 화면을 닫아도 돼요" + "내 정보로 가기"를 먼저 보여 주기. 상태가 `created`로 남아 있으면 Toss 승인이 살아 있는 10분 안에서 confirm을 간격을 두고 몇 번 더 시도하기

### F-02 Medium: 도움말의 공유 설명이 실제 동작과 반대

- **실제 동작** (390·1280): 저장한 결제 풀이에서 "공유하기"를 누르면 시트에 "링크를 받은 사람에게는 뽑은 카드와 풀이 전체가 보여요. 질문과 직접 쓴 말, 고른 상황, 이어서 물어본 내용은 보이지 않아요."라고 나옴. 새 컨텍스트에서 `/s/<id>`를 열면 풀이 전문이 보임 (`QA/out/flow-misc-{m,d}.json` `share-sheet`, `shared-page-fresh-context`)
- **도움말** (운영 https://starlog.yeolmaeapps.kr/help, `QA/out/text-prod/_help.txt`): "공유하기 · 카드 이름과 링크만 보내요", 팁 "공유에는 뽑은 카드 이름과 스타로그 링크만 담겨요. 질문, 메모, 생년월일은 보내지 않아요."
- **위치**: `lib/helpGuide.ts:302` (sub), `:307` (tip). 10/13 결과 공유 기능이 생기기 전 문구가 남은 것으로 보임
- **영향**: 공유 범위(개인 정보 기대)가 페이지마다 다르게 안내됨
- **수정 (S)**: sub를 "풀이 링크를 만들어 보내요"로, tip을 "링크를 받은 사람은 카드와 풀이 전체를 봐요. 질문, 직접 쓴 말, 고른 상황, 생년월일은 보이지 않아요. 공유 그만하기로 언제든 닫을 수 있어요."로

### F-03 Medium: 결제 화면 로드 실패 문구가 생성 실패 문구로 나옴

- **재현**: 로그인 후 `/pay/checkout?product=tarot&…`에서 `GET /api/pay/checkout`을 500(JSON)이나 502(HTML)로 응답 → 화면에 `결제 / 풀이를 다 적지 못했어요 / 횟수는 그대로예요. 한 번 더 시도해 주세요. / 풀이로 돌아가기`. 버튼은 `[""]`(뒤로 아이콘)뿐이고 다시 시도는 없음 (`QA/out/flow-errors-*.json` `checkout-api-500`, `flow-errors2-*.json` `checkout-get-502`)
- **원인**: `app/pay/checkout/CheckoutView.tsx:76-77`가 `describeApiError(res.error)`를 context 없이 부름 → `lib/reading/errors.ts:91` 기본 문구로 감
- **증거**: `QA/shots/err-pay-me-500-m-02-checkout-api-500.png`, `err2-checkout-502-m-02-checkout-get-502.png` (d도 같음)
- **수정 (S)**: checkout 전용 문구 "결제 정보를 불러오지 못했어요 · 청구된 금액은 없어요" + 다시 시도 버튼

### F-04 Medium (정책, QA-06 이월): 인연 점수

- 로컬 흐름: 친구 화면 "인연 93점 / 두 분의 일간이 서로 합을 이루는 사이예요 +12 …", 주인 화면 "1/4 · 인연 93점", `/ranking` "인연 점수 합계 1~3위" (`QA/out/flow-bonds-m.json`). 운영 홈 "사주로 본 인연 점수로 랭킹에 올라요"
- 10/14 보고서와 같은 상태임. 오너가 결정할 사항이라 심각도는 그대로 둠

### F-05 Low: 가이드 도메인 법정 페이지의 CORS 콘솔 오류

- **재현** (운영 GET만): `https://yeolmaeapps.kr/about`, `/privacy`, `/terms`를 열기만 해도 콘솔에 `Access to fetch at 'https://starlog.yeolmaeapps.kr/how?_rsc=…' (redirected from 'https://yeolmaeapps.kr/how?_rsc=…') from origin 'https://yeolmaeapps.kr' has been blocked by CORS policy` 같은 오류가 쌓임. /how /evidence /help /pricing /refund /faq /me /story /tarot/new /saju/start가 대상이고 크롤 25건, 클릭 점검 1회 세션당 20~22건 (`QA/out/crawl-prod-guide.json`, `QA/scripts/prod-guidehost-click.cjs` 출력)
- **동작**: 클릭하면 강제 이동으로 넘어가서 도착은 함. 390·1280 모두 `/about→/how`, `/terms→/pricing`, `/privacy→/faq`가 1.5~2.2초 안에 앱 호스트로 감
- **원인 추정**: 이 3페이지는 가이드 도메인에서 그대로 서빙되는 앱 페이지인데, 푸터와 헤더 링크가 `linkHref(path, "app")` 판정을 받아 상대 경로로 나감(`components/layout/Footer.tsx:44`, `lib/hosts.ts:67-74`). Next Link 프리페치가 `yeolmaeapps.kr/<path>?_rsc` → 307 → 다른 출처라서 막힘
- **수정 (S)**: 가이드 호스트에서 렌더링할 때 앱 경로는 절대 URL(`appHref`)로 만들거나 `prefetch={false}`

### F-06 Low (QA-05 잔여): 결과 화면 주 버튼 위치

- 측정 (`QA/scripts/jump.cjs`, mock 맛보기 길이 기준):

| | 390×844 | 1280×800 |
|---|---|---|
| 첫 카드 끝 | 1,208px | 581px |
| "전체 풀이 보러 가기 ↓" | 1,674px (1.98화면) | 895px (1.12화면) |
| 시트 주 버튼 | 2,536px (3.00화면) | 1,757px (2.20화면) |
| 링크를 누른 뒤 버튼이 화면 안에 들어오는지 | true | true |

- 10/14에는 2.38화면과 1.79화면이었음. 감질맛 맛보기가 둘째 카드 절반까지 보여 줘서 길어짐. 이동 링크 덕분에 Medium에서 Low로 낮춤. 실제 모델 맛보기 길이는 **측정 안 함**
- 증거: `QA/shots/tarot-m-03-result-teaser.png`, `jump-{m,d}-after-click.png`

### F-07 Low: 무료 금색 버튼 위에 유료 범위가 나옴

- 시트 텍스트 (판매 오픈 + 이 기기에서 무료 미사용 + 비로그인): `전체 풀이 · 2,900원 / 풀이 전체 · 약 2,000자 / 이어서 물어보기 3번 / 이 기기에 계속 보관 / [전체 풀이 보기 · 오픈 기념 무료] / [로그인하고 전체 풀이 보기] / 10월 31일까지 … (이어서 물어보기·공유 제외).` (`QA/out/flow-tarot-{m,d}.json` `result-teaser`)
- 금색 버튼(무료)을 누르면 "이어서 물어보기 3번"은 빠짐. 이 사실은 맨 아래 작은 캡션에만 있음
- 위치: `components/tarot/UnlockSheet.tsx:213` (priced이면 가격 줄), `:221-226` (`opening`이 false인 login/pay 모드에서는 follow-up 줄이 보임)
- 제안 (S): `welcome`(첫 무료 가능)일 때 목록을 "무료로 열면: 풀이 전체 · 이 기기 보관 / 결제하면: + 이어서 물어보기 3번 · 공유"처럼 둘로 나누기

### F-08 Low (QA-03 잔여): 공유본에 가린 말을 인용하는 문장이 남음

- 칩 "지금은 수입이 없음"과 메모 "비밀메모큐에이문구"를 넣고 결제 풀이를 공유 → 새 컨텍스트에서 `/s/gbqlfkmrkzt1`을 엶. 질문, 칩, 메모는 0회 나옴(`hasQuestion/hasChip/hasNote: false`). 본문에는 "'○○'이라고 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요.", "메모에 '○○'라고 적었죠."가 남음 (`QA/out/flow-misc-{m,d}.json`, `QA/shots/misc-m-shared-page.png`)
- 공유 시트도 "고른 상황 … 보이지 않아요"로 바뀌었음 → QA-03의 핵심은 해결됨. 남은 건 읽을 때 어색한 것뿐임. 실제 모델이 칩이나 메모를 얼마나 인용하는지는 **측정 안 함**(mock 문장)
- 위치: `lib/share/payload.ts:186` `hideOwnWords`가 ○○로 바꾸기만 하고 문장은 남김. 가린 말만 인용하는 문장은 통째로 빼는 걸 제안

### F-09 ~ F-18 Low

- **F-09** `/today` 공유: 클립보드 `https://starlog.yeolmaeapps.kr`, 토스트 "링크를 복사했어요". 문구는 "오늘의 카드: …" (`QA/out/flow-misc2-{m,d}.json` `today-share`, `QA/shots/today-m-03-today-share.png`). 위치는 `app/today/TodayView.tsx:390` `<ShareButton text=…>`(target 없음 → `SITE.url`). 결과 화면의 공유 버튼은 없어졌음(QA-07 일부 해결, `shareOnResult: 0`)
- **F-10** `/today` 진입 조회 실패: `GET /api/tarot/daily` 500 → "오늘의 한 장 / 풀이를 다 적지 못했어요 / 횟수는 그대로예요. 한 번 더 시도해 주세요. / 다시 시도". 다시 시도하면 카드 3장으로 복구됨. 카드를 고른 뒤 POST가 500이면 같은 문구가 나오고 다시 시도로 복구됨 (`QA/out/flow-errors2-*.json`, `QA/shots/err-daily-500-m-01-daily-500-FAIL.png`(파일명의 FAIL은 테스트 셀렉터 문제), `err2-today-load-500-*`). 위치 `TodayView.tsx:137-140` → `errors.ts:91`. 조회 실패 전용 문구 "오늘의 카드를 불러오지 못했어요"를 권장
- **F-11** `/api/me` 500일 때 로그인 상태의 `/me`: "내 정보 / 로그인 없이, 기록은 이 기기에 보관돼요 / 오픈 기념 무료 … 아직 무료로 열 수 있어요". 로그인 버튼, 결제 내역, 오류 안내가 모두 없음 (`QA/shots/err-pay-me-500-m-04-me-api-500.png`). 원인은 `lib/account/client.ts:88-93`이 실패를 `null`(=비로그인·판매 닫힘)로 처리하는 것. "계정 정보를 불러오지 못했어요 + 다시 시도" 상태를 따로 두기를 권장
- **F-12** 참여 POST 500: "지금은 별자리를 불러올 수 없어요. 잠시 뒤에 다시 시도해 주세요". "별 되기" 버튼은 남아 있어서 다시 시도는 가능함 (`QA/shots/err-bonds-join-500-m-01-bonds-join-500.png`). 위치 `lib/bonds/client.ts:58` 기본 메시지
- **F-13** `/me` "알림 설정 · 준비 중": 운영과 로컬, 두 폭 모두 (`QA/out/text-prod/_me.txt`). 위치 `app/me/MeView.tsx:152` `<Soon>알림 설정</Soon>`. 오픈 때는 숨기는 걸 권장
- **F-14** `/pay/fail?code=PAY_PROCESS_CANCELED`, `/pay/success`: H1이 0개 (운영 크롤 `h1=[]`, 로컬 같음). 제목은 `<p className={s.title}>`임 (`app/pay/fail/PayFail.tsx:24`, `app/pay/success/PaySuccess.tsx:130,138`)
- **F-15** 맛보기 무응답(route를 끝까지 보류): 0~1초 "카드를 읽고 있어요" → **91초** "답이 너무 오래 걸리고 있어요 / 다시 시도" (390·1280 같음, `QA/out/recheck-{m,d}-hang.json`). 무응답 30초 타이머는 여전히 응답 헤더를 받은 뒤에야 시작됨(`lib/reading/api.ts:287-311`, 첫 `heard()`는 `:311`). 대기 화면은 다른 에이전트가 수정 중이라 상단 문구만 기록함
- **F-16** 탭과 이름 (QA-12): 공유 페이지 링크 수집 결과 데스크톱 `홈, 가이드, FAQ, 내 기록, 내 정보` / 모바일 `홈, 내 기록, 가이드, 내 정보`. 푸터에 "이용 가이드"와 "가이드 글"이 같이 있음. 사주 단계 헤더 "명식 보기 3단계 중 3/3"과 H1 "나의 명식"
- **F-17** 판매 오픈(STARLOG_PAYMENTS=on) 상태 비로그인 `/me`: "로그인하면 결제한 풀이를 다른 기기에서도 볼 수 있어요 / 로그인하기"만 나오고 "오픈 기념 무료" 섹션은 없음. 운영(owner 모드)에서는 섹션이 보임 (`QA/out/text-local/_me.txt` vs `text-prod/_me.txt`). 위치 `app/me/MeView.tsx:88-111`(`account.payments`면 로그인 섹션만). 결과 시트, 가격표, `/tarot/new`에는 계속 나와서 화면끼리 어긋남. 10/31까지만 해당
- **F-18** `/owner`: 확인 후 "이 기기에서는 결제 없이 풀이를 열 수 있고, 결제도 시험할 수 있어요." (`app/owner/OwnerForm.tsx:25-27`). 운영 PG는 실결제라서 "시험"이 아님. 확인 직후 화면에 "신고된 후기" 데스크가 없고 새로고침 뒤에만 보임 (`QA/out/flow-misc-{m,d}.json` `owner-page.ok` vs `.reload`). 빈 코드 → "코드를 입력해 주세요.", 틀린 코드 → "코드가 맞지 않아요."는 정상

---

## 4. Info

- **I-1** 가이드 페이지에서 콘솔 경고 `AdSense head tag doesn't support data-nscript attribute.` 136건(운영). 경고 수준
- **I-2** mock에서만 보이는 문구: 체크아웃 "테스트 결제예요. 실제로 청구되지 않아요.", "테스트 결제 실패" 버튼, 닉네임 "테스트 별손님". `provider === "mock"`으로 막혀 있음(`CheckoutView.tsx:172,190`). 운영 노출 없음
- **I-3** 사주 풀이(mock)의 "계산 기준"에 "태어난 시를 몰라 시주를 비웠어요…"와 "태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요…", "00:00~00:32 …"가 비슷한 뜻으로 두 번씩 나옴. 실제 모델은 기준 목록과 limits(`lib/ai/prompts/saju.ts:579`)를 옮겨 쓰므로 같은 중복이 나올 수 있음. 실제 출력은 **측정 안 함**
- **I-4** `/b/<code>`에서 하이드레이션 불일치 오류 2건이 나옴. 서버 로그 diff는 `style={{caret-color:"transparent"}}`로, Playwright가 스크린샷 때 캐럿을 숨기며 넣는 스타일임. 새 컨텍스트 6번 로드에서는 0건(`QA/scripts/hydration3.cjs`). 앱 버그가 아니라 테스트 부작용이라 제외함
- **I-5** QA-17 글자 크기 단위: CSS font-size 선언 525개가 px/var, rem/em 0개 (`--fs-sub: 13px`, `--fs-tab: 12px`). 바뀌지 않음
- **I-6** QA-20: 모델·업체명 노출은 `/privacy`의 국외 이전 고지("Anthropic, PBC")뿐임. 운영 115 URL × 2폭 텍스트에서 "Claude" 0건. 법정 고지라 유지가 맞음
- **I-7** 스크린샷 왼쪽 아래 "N"과 "Compiling…" 배지는 Next dev 표시. 운영에는 없음
- **I-8** 공유 페이지 og:image `https://starlog.yeolmaeapps.kr/api/og/share/<id>`, robots `noindex, nofollow` 정상

---

## 5. 10/14 보고서 항목 재확인

| ID | 10/14 | 오늘 | 근거 |
|---|---|---|---|
| QA-01 `/login` 운영 404 | Critical | **해결** | 운영 `curl` `200 /login`, `200 /login?next=%2F`. `app/login/page.tsx`에 connection 패턴 적용 |
| QA-02 다른 기기에서 원래 주소 | Medium | **해결** | 같은 mock 계정으로 기기 B에서 A의 `/chapter/rv2a6k6o075mo67vfl99`가 그대로 열림. `/story` "기록 1개 · 이 기기와 계정에 보관돼요" (`QA/out/recheck-m-cross.json`, `QA/shots/re-cross-B-m-0{1,2}-*.png`). 결제 풀이는 이제 서버 id 주소로 감 |
| QA-03 공유에 칩 노출 | Medium | **대부분 해결** → F-08 | 칩·메모·질문 0회. 시트 문구에 "고른 상황" 추가 |
| QA-04 무료 소진 뒤 다음 행동 없음 | Medium | **해결(코드 확인 + 판매 오픈)** | 소진·closed 분기에 "지금의 한 장 · 무제한 무료 / 오늘의 한 장" 링크 생김(`UnlockSheet.tsx:183-196`). 판매가 열리면 소진된 기기에도 "로그인하고 전체 풀이 보기"가 나옴(`tarot-m-08-second-result-sheet.png`). owner 모드의 소진 화면은 UI로 **실행 안 함**(운영 생성 금지, 로컬은 on 모드) |
| QA-05 주 CTA 위치 | Medium | **일부 개선** → F-06 Low | 이동 링크 추가, 버튼 거리는 늘어남 |
| QA-06 점수 | Medium(정책) | 그대로 → F-04 | |
| QA-07 공유 3가지 | Low | **일부 해결** → F-09 | 결과 화면 공유 버튼 0개. `/today`는 여전히 홈 주소 |
| QA-08 도움돼요 새로고침 | Low | **해결** | 누름 → `도움돼요 1, pressed=true` → 새로고침 → `1, true` (390·1280, `QA/scripts/helpful.cjs` 출력). 첫 측정에서 1.5초 안에 화면이 안 바뀐 건 dev 첫 컴파일 지연이었고, 재측정에서는 0.3초에 반영됨 |
| QA-09 로그인 돌아가기 루프 | Low | **해결** | 비로그인 `/pay/checkout?…returnTo=%2Ftarot%2Fresult` → `/login?next=…`의 돌아가기 href `/tarot/result` |
| QA-10 멈춤 93.6초 | Low | **일부** → F-15 | "다시" 빠짐. 91초 그대로 |
| QA-11 오픈 전 가격 문구 | Low | **해결(판매 오픈으로)** | 판매 on에서 가격, 시트, 체크아웃이 맞음. "가입 선물"은 `/privacy`의 "더 이상 드리지 않습니다"에만 나옴 |
| QA-12 이름·탭 | Low | 그대로 → F-16 | |
| QA-13 데모 초대 | Low | **해결** | 운영 `/invite/abc123` 404 (로컬 dev는 200, 의도된 것) |
| QA-14 누구 10자 | Low | **해결** | `maxlength="8"`, "엄마/지민/김철수" → "이번 주 ○○에게 먼저 연락해도 될까?" (`QA/scripts/who.cjs`). 문장형("…입니다")은 규칙대로 빠짐 |
| QA-15 공유 중지 후 재공유 | Low | **해결** | 중지 → 링크 404 → 시트를 다시 열면 "공유 링크 만들기" 버튼이 있음 |
| QA-16 문의 경로 | Low | **해결** | `/me` "문의하기" → `mailto:studioyeolmae.com@gmail.com` |
| QA-17 px 글꼴 | Info | 그대로 → I-5 | |
| QA-18 명암비 | Info | **재측정 안 함** | |
| QA-19 멈춘 공유 링크 안내 | Info | **해결** | `/s/zzzzzzzzzzzz` 404 "공유가 멈췄거나 없는 풀이예요 / 공유한 사람이 공유를 그만뒀거나 주소가 바뀌었을 수 있어요. / 홈으로" |
| QA-20 업체명 | Info | 그대로(정상) → I-6 | |
| QA-21 행운 번호 기기별 | Info | **재테스트 안 함** | |

---

## 6. 통과 항목

- **운영 페이지 (GET만)**: 앱 호스트 41 URL과 가이드 호스트 74 URL을 390·1280에서 봄(230로드). 상태코드는 의도대로였음: 404는 `/chapter/zzz`, `/s/zzz…`, `/invite/abc123`, `/no-such-page`, `/dev/characters`이고, 리다이렉트는 `/tarot/draw|result|new/situation` → `/tarot/new`, `/pay/checkout` → `/login?next=…`, `/guide/tarot` → `yeolmaeapps.kr/`. 가로 넘침 0, 깨진 이미지 0, 페이지 오류(pageerror) 0, H1은 `/pay/*` 2개만 빼고 모두 1개. "베타"·"coming soon"·"Claude"·test·undefined·NaN·[object 0건. "준비 중"은 가격표의 준비 중 상품, 약관, 가이드 3편의 예고 문구와 `/me` 알림 설정(F-13)에만 있음
- **링크**: 운영 크롤에서 모은 내부 링크 137개 중 비정상 0개. 10개는 `yeolmaeapps.kr/<앱경로>` 307 → 앱 호스트 200 (`QA/out/links-prod.json`)
- **사이트맵**: 앱 14 URL, 가이드 70 URL 모두 200(크롤 대상에 포함)
- **로컬 페이지**: 46 URL × 2 = 92로드. 가로 넘침 0, 이미지 0, pageerror 0, 예상 외 콘솔 오류 0
- **오픈 기념 무료 (390·1280)**: 시트 "전체 풀이 보기 · 오픈 기념 무료" → `/chapter/<8자 id>`. "오픈 기념 무료 풀이는 이 기기에서 보고 보관만 할 수 있어요…" 1줄, 이어서 물어보기 0, 공유 0, 차례 `["풀이"]`, AI 표시 1. 새로고침 유지. 뒤로 가면 시트 "열어 둔 풀이 보기 →". `/story`에 나옴
- **감질맛 타로 맛보기**: 첫 카드 전체 + 둘째 카드가 "…"로 잘리고 "이어지는 이야기는 전체 풀이에서 열려요". 잠긴 목차 11개(첫 카드 제외)
- **유료 타로 (무료 사용 뒤)**: 시트 "로그인하고 전체 풀이 보기" → `/login?next=%2Ftarot%2Fresult`(돌아가기 `/tarot/result`) → mock 카카오 → `?login=ok` → "2,900원 결제하고 보기" → 체크아웃(청약철회·미성년 고지, 확인 체크 필요) → mock 결제 → `/chapter/<서버 id>`(약 10초) → 공유 1, 이어서 물어보기 "3번 남았어요" → 질문 → 200 → "2번 남았어요"
- **사주**: 홈 "내 사주 보기" → `/saju/start?new=1`(1/3, 사주팔자·연애운·재회운·재물운·직장운) → `/saju/new?topic=overall`. 빈 제출 시 경고 3개("태어난 날을 골라 주세요." 등) → 명식 → 감질맛 맛보기(첫 장 + 질문형 문장) → 로그인 → 4,900원 → 풀이(한눈에 보기~앞으로 몇 주, 이어서 물어보기 3번, "카드로 이어서 보기"). 재물운 칩 → "재물운 전체 풀이 · 4,900원 / 결제 한 번에 고른 풀이 하나를 열어요"
- **고정 명식 칼럼 스크롤 (1280×800)**: `.spread`는 sticky, overflow-y auto, max-height 736px, clientH 734 < scrollH 856, 가로 넘침 없음(scrollW = clientW 502). 페이지를 900px 내린 뒤 칼럼 위에서 휠 → 칼럼 scrollTop 122(끝), "적용한 기준"이 화면 안에 들어옴, 페이지 scrollY는 900 그대로 (`QA/shots/saju-d-05-sticky-after-wheel.png`)
- **오늘의 한 장**: 3장 중 1장 → 약 2초 만에 한마디·애정/금전/일·색/숫자·오늘의 한 가지. 새로고침하면 "오늘의 카드는 이미 골랐어요 · 내일 새 카드가 기다려요"
- **공유 `/s/…` (새 컨텍스트)**: 200, H1 "카드 세 장이 건넨 이야기", "친구가 공유한 타로 풀이 / 질문과 직접 쓴 말, 고른 상황은 공유한 사람만 볼 수 있어요.", 풀이 전문, 하단 "나도 카드 뽑아 보기 / 타로 보기 → / 무료로 한 장 뽑기 / **스타로그 홈으로**" → 클릭하면 `/`로 감(390·1280, `QA/shots/shared-{m,d}-home-cta.png`). 공유 그만하기 → 링크 404 → 다시 만들기 가능
- **별자리 인연**: 빈 제출 경고 3개 → 생성 → 양자리 → 초대하기(클립보드 "내 양자리에 별이 되어 줘 (0/4) · 초대코드 HDG826 / https://starlog.yeolmaeapps.kr/b/HDG826", 상태 "초대 문구와 링크를 복사했어요") → 다른 컨텍스트에서 `/b/<code>` "큐에이님의 양자리에 별이 되어 주세요" → 카드 → "양자리에 별이 됐어요"(생년월일은 다시 보여 주지 않음) → 새로고침 "이미 양자리에 별이 되어 있어요" → "나도 내 별자리 만들기" → `/bonds` **"내가 들어간 별자리 1개 · 큐에이님의 양자리 1/4 · 나"**. 주인 화면 "들어온 별 1개 … “늘 고마워” 인연 93점"
- **/me**: 결제 내역 2건 → 사주 미개봉 결제 → "사주 전체 풀이 · 열지 않음 / 환불받기 / 10월 22일까지" → 전액 환불 → "환불했어요. 카드사에 따라 며칠 걸릴 수 있어요." + "환불됨". 탈퇴 시트(풀이 삭제, 결제 기록 5년, 기기 기록은 따로) → mock 카카오 재확인 → `/me?account=deleted` "탈퇴했어요. 그동안 고마웠어요.", `/api/me` user null(1280은 재확인 시점에 이미 null)
- **/owner**: 빈 코드와 틀린 코드에 안내가 나옴 → 맞는 코드 → "운영자로 확인된 기기예요 / 홈으로 가기 / 사주 보러 가기"가 새로고침 뒤에도 유지됨
- **오류 상태 (390·1280, 가로채기)**: 맛보기 500 "풀이를 다 적지 못했어요 · 횟수는 그대로예요" → 다시 시도로 복구 / 오프라인 "연결이 잠시 끊겼어요" / 무료 열기 502 → 시트 안 오류 + 같은 버튼으로 다시 열기 성공 / 카드 나누기 500 "카드를 나누지 못했어요" + 다시 시도 + "방금 고른 카드 빼기" / 사주 맛보기 502 → 명식은 남고 다시 시도로 복구 / 이어서 물어보기 500 → 입력값 유지, 횟수 3 유지 → 다시 물어보기 성공(2번 남음) / 공유 500 "공유 링크를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요." / 오늘의 한 장 조회·선택 500 → 복구 (문구는 F-10)
- **404**: `/no-such-page-qa`, `/chapter/zzz` → 404 "찾는 페이지가 없어요 / 홈으로". `/s/없음` → 전용 문구(QA-19)

---

## 7. 커버리지

| 항목 | 390 | 1280 | 비고 |
|---|---|---|---|
| 운영 앱 호스트 페이지 41개 | ✓ | ✓ | 82로드 |
| 운영 가이드 호스트 74개(사이트맵 70 + about/privacy/terms/tarot/new) | ✓ | ✓ | 148로드 (뷰포트 스크린샷) |
| 로컬 페이지 46개(page.tsx 40개 전부와 동적 예시) | ✓ | ✓ | 92로드 |
| 내부 링크 HEAD | — | — | 137개 |
| F1 오픈 기념 무료 타로 | pass | pass | |
| F2 유료 타로(무료 소진 뒤, 로그인→결제→풀이→후속) | pass | pass | |
| F3 사주(start→new→chart→로그인→결제→풀이, 주제 칩) | pass | pass | |
| 고정 칼럼 스크롤 | n/a | pass | |
| F4 오늘의 한 장 | pass | pass | 공유는 F-09 |
| F5 공유 + 새 컨텍스트 + 홈으로 + 중지·재공유 | pass | pass | |
| F6 별자리 인연(생성·초대·참여·참여 목록) | pass | pass | |
| F7 /me(내역·환불·탈퇴) | pass | pass | |
| F8 /owner | pass | pass | F-18 |
| F9 오류 상태 12종 | pass/F-01·03·10·11·12 | 같음 | |
| F10 404 | pass | pass | |
| 10/14 재확인 | QA-02·08·09·14 | QA-08 | QA-10은 두 폭 모두 |
| 실행 안 함 | — | — | 카카오톡 보내기(SDK 키 없음), Google 로그인, 실제 Toss 위젯, 실제 모델 출력 길이·품질, 명암비 재측정, 행운 번호, 하루 맛보기 5번 한도, KST 자정 리셋, 텍스트만 확대 |

흐름 실행 횟수: 기능 흐름 10종 × 2폭 = 20회, 오류 시나리오 12종 × 2폭, 재확인 스크립트 6종.

## 부록: 주요 증거 파일

- 운영 크롤: `QA/out/crawl-prod-app.json`, `crawl-prod-guide.json`(콘솔, 상태, H1, 넘침, 금칙어 문맥), 스크린샷 `QA/shots/prod-app-{m,d}-*.png`, `prod-guide-{m,d}-*.png`
- 로컬 크롤: `QA/out/crawl-local.json`, `QA/shots/local-{m,d}-*.png`
- 흐름: `QA/out/flow-{tarot,saju,misc,misc2,bonds,errors,errors2}-{m,d}.json`, `recheck-*.json`. 스크린샷은 흐름 이름 접두어(`tarot-`, `saju-`, `misc-`, `today-`, `bonds-`, `err-`, `err2-`, `re-`, `shared-`, `jump-`)
- 페이지 텍스트 비교: `QA/out/text-prod/*.txt`, `text-local/*.txt`, `copy-grep.txt`
- 서버 로그: `QA/out/server.log` (mock 42건, 실호출 0건)
