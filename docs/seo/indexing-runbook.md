# 검색 등록·색인 런북 (스타로그)

스타로그(https://starlog.yeolmaeapps.kr)를 구글, 네이버, 빙, 다음에 등록하고 색인을 요청하는 순서예요. 코드 쪽 준비(robots.txt, sitemap.xml, 구조화 데이터, llms.txt, RSS, IndexNow 키)는 끝나 있으니 아래는 운영자가 콘솔에서 할 일만 적었어요. 색인과 노출 시점은 검색엔진이 정하고, 등록했다고 순위나 노출이 약속되지는 않아요.

> 가이드(`/guide/*`)는 2026-10-03부터 루트 도메인 `https://yeolmaeapps.kr`에 있어요. 가이드의 사이트맵, RSS, 소유확인, URL 검사 주소는 [guide-domain.md](guide-domain.md)를 먼저 보세요. 이 문서의 `starlog.` 주소 가운데 가이드 글(`/guide/...`)과 가이드가 들어 있던 사이트맵 설명은 그쪽이 우선해요.

## 0. 먼저 확인할 주소

배포 후 브라우저로 아래 주소가 열리는지 봐요.

| 주소 | 내용 |
|---|---|
| `/robots.txt` | 모든 검색·AI 크롤러 허용, 개인 화면(`/chapter`, `/story`, `/me`, `/invite`, `/bonds`, `/b/`, `/dev`)과 `/api/`만 막음(`/api/og/` 공유 이미지는 허용), 사이트맵 주소 |
| `/sitemap.xml` | 공개 페이지 전체(가이드 글 42개, 타로·사주 가이드 목록, FAQ·이용 가이드·소개·풀이 과정, 가격, 정책, 지금의 한 장, 오늘의 한 장, 별자리 인연이 켜져 있으면 `/lucky`, `/ranking`, `/ranking/<별자리>` 12개) |
| `/rss.xml` | 가이드 글 RSS(네이버 RSS 제출용) |
| `/llms.txt`, `/llms-full.txt` | AI 답변 엔진용 서비스 설명과 가이드 전문 |
| `/74d8adb0a0b4d02a28602f80b163bf31.txt` | IndexNow 키 파일(내용이 파일 이름과 같으면 정상) |

## 1. 환경 변수 (코드 수정 없이 소유확인 코드 넣기)

`apps/web/.env.local`에 값을 넣고 **다시 빌드·배포**해요(`pnpm deploy`). 빌드할 때 읽는 값이라 배포 후에 넣으면 반영되지 않아요. 별자리 인연을 켠 빌드라면 `NEXT_PUBLIC_FEATURE_BONDS=1`도 그대로 함께 둬요.

| 변수 | 어디서 받나요 | 넣는 값 |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Google Search Console → URL 접두어 속성 → HTML 태그 | `content="..."` 안의 값만 |
| `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | 네이버 서치어드바이저 → 사이트 등록 → HTML 태그 | `content="..."` 안의 값만 |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Bing Webmaster Tools → HTML Meta Tag (`msvalidate.01`) | `content="..."` 안의 값만 |
| `NEXT_PUBLIC_DAUM_WEBMASTER_TOOL` | Daum 웹마스터도구 → PIN 발급 후 보여 주는 robots.txt 코드 | `#DaumWebMasterTool:...:...` 한 줄 전체(또는 첫 콜론 뒤 부분) |

넣은 뒤 페이지 소스(`view-source:`)에서 `google-site-verification`, `naver-site-verification`, `msvalidate.01` 메타 태그가 보이는지, `/robots.txt` 맨 아래에 `#DaumWebMasterTool:` 줄이 있는지 확인해요.

## 2. Google Search Console

1. https://search.google.com/search-console 에 로그인해요.
2. 속성 추가는 둘 중 하나를 골라요.
   - **도메인 속성(권장)**: `yeolmaeapps.kr`을 입력하면 TXT 레코드를 줘요. Cloudflare 대시보드 → `yeolmaeapps.kr` → DNS → Records → Add record → Type `TXT`, Name `@`, Content에 받은 값(`google-site-verification=...`) → Save. 몇 분 뒤 콘솔에서 확인을 눌러요. 루트 도메인으로 확인하면 `starlog.` 같은 하위 도메인도 함께 볼 수 있어요.
   - **URL 접두어 속성**: `https://starlog.yeolmaeapps.kr/` 입력 → 다른 확인 방법 → HTML 태그 → `content` 값을 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`에 넣고 재배포 → 확인.
3. 왼쪽 메뉴 **Sitemaps(사이트맵)** → `https://starlog.yeolmaeapps.kr/sitemap.xml` 제출. 상태가 "성공"이고 발견된 URL 수가 sitemap.xml의 `<url>` 수와 같은지 봐요.
4. **URL 검사**에 아래 주소를 하나씩 넣고 "색인 생성 요청"을 눌러요(하루 요청 수에 제한이 있어요).
   - `/`, `/guide/tarot`, `/guide/saju`, `/tarot/new`, `/saju/new`, `/now`, `/today`, `/faq`
   - 가이드 글 몇 개: `/guide/how-to-read-tarot`, `/guide/now-card-how-to`, `/guide/manseryeok`, `/guide/the-fool`
5. https://search.google.com/test/rich-results 에 가이드 글 주소를 넣어 구조화 데이터(Article, BreadcrumbList, FAQPage)가 오류 없이 읽히는지 봐요. HowTo는 구글 리치 결과에서는 더 이상 보이지 않지만 데이터로는 읽혀요.
6. 1~2주 뒤 **페이지(색인 생성)** 보고서에서 "색인이 생성되지 않음" 사유를 확인해요. `/tarot/result`, `/chapter/...` 같은 개인·진행 화면은 일부러 `noindex`라 "noindex 태그에 의해 제외됨"으로 나오는 게 정상이에요.

## 3. 네이버 서치어드바이저

1. https://searchadvisor.naver.com → 웹마스터 도구 → 사이트 등록에 `https://starlog.yeolmaeapps.kr` 입력.
2. **소유확인**: "HTML 태그"를 골라 `content` 값을 `NEXT_PUBLIC_NAVER_SITE_VERIFICATION`에 넣고 재배포한 뒤 "소유확인"을 눌러요.
3. **요청 → 사이트맵 제출**: `https://starlog.yeolmaeapps.kr/sitemap.xml`
4. **요청 → RSS 제출**(선택이지만 권장): `https://starlog.yeolmaeapps.kr/rss.xml`. 새 가이드 글이 RSS에 먼저 올라가서 수집이 빨라져요.
5. **요청 → 웹 페이지 수집**: 위 2장 4번과 같은 주요 주소를 하루 한도 안에서 넣어요.
6. **검증 → robots.txt**: "수집 허용"으로 나오는지, **검증 → 웹 페이지 최적화**에서 홈과 가이드 글 하나를 넣어 제목·설명·OG가 잡히는지 봐요.
7. 네이버는 IndexNow에도 참여해요. 배포할 때마다 6장의 `pnpm indexnow`를 돌리면 네이버에도 함께 알려져요.

## 4. Bing Webmaster Tools

1. https://www.bing.com/webmasters 에 로그인해요.
2. **Import from Google Search Console**을 고르면 구글에서 확인한 사이트와 사이트맵을 그대로 가져와요(2장을 먼저 끝내 두면 가장 빨라요).
3. 가져오기를 쓰지 않으면 사이트 추가 → HTML Meta Tag의 `content` 값을 `NEXT_PUBLIC_BING_SITE_VERIFICATION`에 넣고 재배포 → Verify → Sitemaps에 `sitemap.xml` 제출.
4. **URL Submission**이나 6장의 IndexNow로 주요 주소를 알려요. 빙 색인은 여러 AI 검색·답변 서비스도 함께 쓰는 경우가 많아서 GEO에도 도움이 돼요.

## 5. 다음(Daum)

1. https://webmaster.daum.net (Daum 웹마스터도구)에서 사이트 URL `https://starlog.yeolmaeapps.kr`을 넣고 PIN 코드를 발급받아요.
2. 화면에 나오는 robots.txt용 코드(`#DaumWebMasterTool:...:...`)를 복사해 `NEXT_PUBLIC_DAUM_WEBMASTER_TOOL`에 넣고 재배포해요. `/robots.txt` 맨 아래에 그 줄이 보이면 "인증 시작하기"를 눌러요.
3. 인증 뒤 메뉴에 사이트맵 제출이나 수집 요청이 있으면 `sitemap.xml`과 주요 주소를 넣어요.
4. 예전 "다음 검색등록" 화면(register.search.daum.net)이 열리면 사이트 URL을 한 번 등록해 둬도 돼요(선택).

## 6. IndexNow (빙, 네이버, Yandex, Seznam 등에 한 번에 알리기)

배포가 끝난 뒤 저장소 루트에서 돌려요. 키 파일은 `apps/web/public/74d8adb0a0b4d02a28602f80b163bf31.txt`예요.

```
pnpm indexnow --dry-run      # 보낼 주소만 확인 (보내지 않음)
pnpm indexnow                # 사이트맵의 모든 주소
pnpm indexnow https://starlog.yeolmaeapps.kr/guide/the-fool   # 고친 글만
```

- 스크립트는 먼저 배포된 키 파일이 키를 돌려주는지 확인하고, 아니면 보내지 않아요.
- 결과 코드: 200·202는 접수, 403은 키 불일치(키 파일 배포 확인), 422는 주소가 이 사이트가 아님, 429는 너무 잦은 전송.
- 바뀐 게 없는데 매일 전체를 보내지는 마세요. 새 글을 올리거나 글을 고쳤을 때, 큰 배포 뒤에 보내면 충분해요.
- 구글은 IndexNow를 쓰지 않아요. 구글은 사이트맵과 Search Console의 URL 검사로 알려요.

## 7. AI 검색·답변 엔진 (GEO)

- `robots.txt`가 검색 크롤러와 AI 검색·답변 크롤러를 모두 허용해요. 막고 싶은 크롤러가 생기면 `apps/web/lib/robots.ts`의 `NAMED_CRAWLERS`에서 빼고 따로 `Disallow` 그룹을 만들면 돼요.
- `/llms.txt`(요약과 페이지 지도), `/llms-full.txt`(가이드 전문과 FAQ)를 두었어요. 내용은 사이트 데이터에서 자동으로 만들어져서 가격이나 무료 횟수가 바뀌면 함께 바뀌어요.
- 가이드 글마다 맨 위에 2~3문장 "요약"이 있어요. 답변 엔진이 그대로 인용하기 좋은 자리라 새 글을 쓸 때도 꼭 채워 주세요.
- 네이버 AI 검색은 네이버 색인을, 여러 AI 검색은 빙 색인을 쓰는 경우가 많아서 3장과 4장을 끝내 두는 게 GEO의 기본이에요.

## 8. 새 가이드 글을 올릴 때

1. 글 본문은 `apps/web/lib/guide-articles/*.ts`에, 요약과 날짜는 `apps/web/lib/guide-articles/answers.ts`의 `GUIDE_SUMMARIES`, `GUIDE_DATES`에 넣어요(단계형 글이면 `GUIDE_HOWTO`도). 글을 고치면 `updated` 날짜를 바꿔요. 사이트맵 lastmod, Article 날짜, 화면의 "업데이트" 줄이 이 값을 따라가요.
2. 소제목은 자연스러우면 질문형(…나요, …까요)으로 써요. 질문형 소제목은 FAQPage 구조화 데이터로도 나가요.
3. `npx vitest run apps/web/lib/guide-articles apps/web/lib/jsonld.test.tsx apps/web/lib/seo.pages.test.ts --maxWorkers=2`로 확인하고 배포해요.
4. 배포 뒤 `pnpm indexnow <새 글 주소>`, Search Console URL 검사, 네이버 웹 페이지 수집 요청.
