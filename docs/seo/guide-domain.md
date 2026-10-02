# 가이드는 루트 도메인으로 (yeolmaeapps.kr)

애드센스는 루트 도메인을 승인하고, 그 하위 도메인에서는 따로 심사하지 않고 광고를 내보내요. 광고는 가이드 글에만 붙으니, 가이드(`/guide/*`)는 루트 도메인 `https://yeolmaeapps.kr`에 두고, 앱(타로, 사주, 결제, 로그인, 내 기록)은 `https://starlog.yeolmaeapps.kr`에 그대로 둬요(2026-10-03 결정). Worker는 하나이고 두 호스트가 같은 배포를 써요.

## 어디에 무엇이 있나요

| 주소 | 동작 |
|---|---|
| `https://yeolmaeapps.kr/` | 타로 가이드 목록을 주소 그대로 보여 줘요(rewrite). canonical은 `https://yeolmaeapps.kr/guide/tarot` |
| `https://yeolmaeapps.kr/guide`, `/guide/...` | 가이드 탭과 글 전체. `/guide`는 `/guide/tarot`으로 308 |
| `https://yeolmaeapps.kr/` 의 그 밖의 경로 (`/tarot/new`, `/me`, `/story` ...) | `https://starlog.yeolmaeapps.kr` 의 같은 경로로 307(임시. 루트 도메인에 다른 앱의 페이지가 생길 수 있어서요) |
| 루트 도메인에서 그대로 서빙하는 것 | `/guide/*`, `/_next/*`, `/api/*`, `/og/*`, `/opengraph-image`, `/cards/*`, 점이 들어간 파일(`robots.txt`, `sitemap.xml`, `ads.txt`, `llms.txt`, `llms-full.txt`, `rss.xml`, 파비콘과 아이콘, `logo.png`, IndexNow 키, `.well-known/...`) |
| `https://starlog.yeolmaeapps.kr/guide` | `https://yeolmaeapps.kr/guide/tarot`으로 한 번에 308(영구) |
| `https://starlog.yeolmaeapps.kr/guide/...` | `https://yeolmaeapps.kr` 의 같은 경로로 308(영구) |
| 배포 빌드에서 그 밖의 호스트 | 규칙이 하나도 켜지지 않아요 |
| `next dev`, 미리보기(`cf:preview`), e2e 빌드 | 플래그가 꺼져 있어서 호스트 규칙이 아예 없어요. 지금까지와 똑같이 한 주소에서 다 보여요 |

규칙은 `apps/web/lib/hostRoutes.ts`에 있고 `next.config.ts`가 가져다 써요. 호스트는 `^yeolmaeapps\.kr(?::\d+)?$`처럼 끝까지 맞춰서 비교해요(포트는 붙어도 돼요). Worker가 호스트 정규식을 앞뒤 고정 없이, 포트까지 붙은 Host 헤더에 검사해서, 고정하지 않으면 `starlog.` 쪽에도 걸려요. 루트 도메인이 직접 서빙하는 첫 경로(`guide`, `_next`, `api`, `og`, `opengraph-image`, `cards`)는 대소문자와 상관없이 빼요. 그래서 `/Guide/tarot` 같은 주소도 앱으로 보내지 않아요. 같은 표를 `lib/hostRoutes.test.ts`가 Next 서버 방식과 OpenNext Worker 방식 둘 다로 돌려 봐요.

보안 헤더 가운데 HSTS만 호스트마다 달라요. 루트 도메인은 `max-age=63072000`(includeSubDomains 없음)을 보내고, starlog와 그 밖의 호스트는 지금처럼 `max-age=63072000; includeSubDomains`를 보내요. `next.config.ts`의 `headers()`에서 루트 도메인 항목이 맨 뒤에 있어서, 같은 헤더 이름이면 그 값이 이겨요.

## 배포할 때: 빌드 플래그

실제 배포 빌드만 `NEXT_PUBLIC_SPLIT_HOSTS=1`로 빌드해요. 이 값이 켜져야 호스트 규칙(리다이렉트, 루트 도메인 `/` rewrite, 루트 도메인 HSTS)이 빌드의 routes manifest에 들어가요. 그리고 호스트를 넘나드는 링크만 절대 주소가 돼요(앱 → 가이드는 `https://yeolmaeapps.kr/guide/...`, 가이드 → 앱은 `https://starlog.yeolmaeapps.kr/...`). 꺼져 있으면 호스트 규칙이 아예 없고, 모든 링크가 지금처럼 경로(`/guide/...`, `/story`)라서 `next dev`, `cf:preview`(localhost), e2e가 그대로 돌아요.

미리보기와 e2e 빌드에는 켜지 마세요. `wrangler dev`(그래서 `cf:preview`와 e2e도)는 클라이언트가 보낸 Host와 상관없이 모든 요청을 첫 라우트의 호스트 `starlog.yeolmaeapps.kr`로 Worker에 넘겨요. 켜진 빌드라면 미리보기의 `/guide` 페이지가 모두 진짜 루트 도메인으로 308되고, e2e 준비 단계가 `ENOTFOUND yeolmaeapps.kr`로 멈춰요.

```sh
# bash
NEXT_PUBLIC_SPLIT_HOSTS=1 pnpm cf:build
pnpm --filter @starlog/web cf:deploy
# PowerShell
$env:NEXT_PUBLIC_SPLIT_HOSTS = "1"; pnpm cf:build; Remove-Item Env:NEXT_PUBLIC_SPLIT_HOSTS
pnpm --filter @starlog/web cf:deploy
```

(`docs/runbook-deploy.md`의 다른 `NEXT_PUBLIC_*` 값, 예를 들어 별자리 인연의 `NEXT_PUBLIC_FEATURE_BONDS=1`도 같은 빌드에 함께 둬요.) 캐노니컬, Open Graph 주소, JSON-LD, 사이트맵, RSS, llms.txt는 플래그와 상관없이 항상 실제 주소(가이드는 루트 도메인)를 써요.

배포 전에 Cloudflare 대시보드에서 볼 것:

- `yeolmaeapps.kr`(@)에 A, AAAA, CNAME 레코드가 이미 있는지. 있으면 `wrangler.jsonc`의 `custom_domain` 라우트가 막힐 수 있어요. 배포하면 wrangler가 `yeolmaeapps.kr`의 DNS 레코드와 인증서를 만들어요(`routes`에 두 호스트).
- `yeolmaeapps.kr`에 걸리는 Redirect Rules, Page Rules, Bulk Redirects가 있는지. 이것들은 Worker보다 먼저 돌아서, 있으면 가이드 요청을 가로채요. 지우거나 가이드 경로에 걸리지 않게 고쳐요.
- SSL/TLS → Edge Certificates의 HSTS 설정이 꺼져 있는지. 켜져 있으면 Cloudflare가 HSTS 헤더를 따로 붙일 수 있어서, 루트 도메인에서 includeSubDomains를 뺀 의미가 없어질 수 있어요.

## 배포한 뒤 확인

```sh
curl -sI https://yeolmaeapps.kr/                            # 200, location 없음 (가이드 목록을 같은 주소로 보여 줘요)
curl -s  https://yeolmaeapps.kr/ | grep -o '<link rel="canonical"[^>]*>'   # https://yeolmaeapps.kr/guide/tarot
curl -sI https://yeolmaeapps.kr/me                          # 307, location: https://starlog.yeolmaeapps.kr/me
curl -sI https://yeolmaeapps.kr/guide                       # 308, location: /guide/tarot (같은 호스트로 가는 리다이렉트는 Worker가 경로만 보내요)
curl -sI https://starlog.yeolmaeapps.kr/guide               # 308, location: https://yeolmaeapps.kr/guide/tarot (한 번에)
curl -sI https://starlog.yeolmaeapps.kr/guide/the-fool      # 308, location: https://yeolmaeapps.kr/guide/the-fool
curl -sI https://yeolmaeapps.kr/guide/tarot | grep -i strict-transport     # max-age=63072000 (includeSubDomains 없음)
curl -sI https://starlog.yeolmaeapps.kr/ | grep -i strict-transport        # max-age=63072000; includeSubDomains
curl -sI https://yeolmaeapps.kr/api/version                 # 200
curl -s  https://yeolmaeapps.kr/robots.txt | grep Sitemap   # Sitemap: https://yeolmaeapps.kr/sitemap.xml
curl -s  https://starlog.yeolmaeapps.kr/robots.txt | grep Sitemap
curl -s  https://yeolmaeapps.kr/sitemap.xml | grep -c "<loc>"        # 가이드 탭 2개 + 글 전부
curl -s  https://starlog.yeolmaeapps.kr/sitemap.xml | grep -c "/guide"   # 0
curl -sI https://yeolmaeapps.kr/ads.txt                     # 애드센스를 켠 빌드면 200 (루트 도메인에도 있어야 해요)
curl -sI https://yeolmaeapps.kr/74d8adb0a0b4d02a28602f80b163bf31.txt   # IndexNow 키, 두 호스트 모두 200
```

## 운영자가 할 일

1. **Google Search Console**: 도메인 속성 `yeolmaeapps.kr`을 추가해요(DNS TXT 하나로 `starlog.`까지 모두 포함). `starlog.` 접두어 속성이 이미 있으면 그대로 두고, 사이트맵을 **두 호스트 모두** 제출해요: `https://yeolmaeapps.kr/sitemap.xml`(가이드), `https://starlog.yeolmaeapps.kr/sitemap.xml`(앱, 이제 가이드 주소가 빠졌어요). 옮긴 가이드 주소는 308이 신호를 넘겨 줘요. URL 검사로 `https://yeolmaeapps.kr/guide/tarot` 색인 요청을 해요.
2. **네이버 서치어드바이저, Bing**: 사이트로 `https://yeolmaeapps.kr`을 추가하고, 그 사이트의 사이트맵과 RSS(`https://yeolmaeapps.kr/rss.xml`)를 제출해요. 앱 쪽 `https://starlog.yeolmaeapps.kr` 등록은 그대로 둬요. 소유확인 코드가 사이트마다 다르게 나오면 주의해요: 지금 코드는 엔진마다 코드를 하나만 받아서(`NEXT_PUBLIC_NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`), 새 코드는 'HTML 파일 업로드' 방식으로 확인하거나, 코드를 여러 개 받도록 고쳐야 해요.
3. **애드센스**: 사이트를 `yeolmaeapps.kr`로 추가해 심사받아요. 승인되면 `ADSENSE_CLIENT`(필요하면 `ADSENSE_SLOT_GUIDE`)를 넣고 위 명령으로 다시 배포해요. `https://yeolmaeapps.kr/ads.txt`가 열려야 해요. 자동 광고는 계속 꺼 두고, 광고 스크립트는 `/guide` 레이아웃에서만 불러와요.
4. **IndexNow**: `pnpm indexnow`가 이제 두 호스트의 사이트맵을 모두 읽어서 호스트별로 따로 보내요(키 파일은 두 호스트에서 서빙돼요). 한쪽만 보내려면 `INDEXNOW_SITE=https://yeolmaeapps.kr pnpm indexnow`, 고친 글만은 `pnpm indexnow https://yeolmaeapps.kr/guide/<글>`.
5. 이 문서가 `indexing-runbook.md`의 가이드 관련 부분(사이트맵 목록, URL 검사 주소, RSS 주소)보다 우선해요.

## 알아 둘 점

- `/api/*` 전체가 루트 도메인에서도 열려 있어요(가이드 화면이 부르는 `/api/version`이 다른 호스트로 넘어가면 안 되어서요). 가이드 화면이 쓰는 것은 그것뿐이에요.
- HSTS: 루트 도메인만 `includeSubDomains`를 빼고 보내요(`lib/hostRoutes.ts`의 `hostHeaders`). 루트 도메인이 includeSubDomains를 보내면, 그 응답을 받은 브라우저는 `*.yeolmaeapps.kr` 전부를 2년 동안 https로만 열어요. 그러면 나중에 생길 하위 도메인(http로만 도는 개발·스테이징 주소 포함)이 묶이고, 되돌리려면 `max-age=0`을 보내고 각 브라우저가 다시 올 때까지 기다려야 해요. starlog는 지금처럼 includeSubDomains를 보내요(`*.starlog.yeolmaeapps.kr`에만 걸려요). 리다이렉트(307, 308) 응답에는 HSTS가 없어요. OpenNext가 리다이렉트를 설정 헤더를 붙이기 전에 돌려주기 때문이에요.
- 루트 주소 `/`는 가이드 목록과 같은 화면이라 canonical이 `/guide/tarot`이에요. 사이트맵에도 `/`는 넣지 않았어요. 루트 도메인에 다른 앱의 페이지가 생기면 `hostRoutes.ts`의 307 규칙과 `/` rewrite를 손봐요.
- 308은 브라우저와 검색엔진이 오래 기억해요. 가이드를 다시 앱 호스트로 되돌리면 이미 기억한 사람은 한동안 루트 도메인으로 가요.
- `www.yeolmaeapps.kr`은 이 Worker에 연결하지 않았어요.
- 다국어(P6)로 `/en/guide/...` 같은 주소가 생기면 `hostRoutes.ts`(rewrite, 307의 예외 목록, 308 규칙)와 `hosts.ts`의 `isGuidePath`에 그 접두어를 넣어야 해요.
