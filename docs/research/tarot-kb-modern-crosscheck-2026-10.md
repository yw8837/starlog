# 타로 KB 78장 현대 해석 교차 점검 (2026-10)

- 작성: 2026-10-06
- 대상: `content/kb/cards/*.json` 78장(스키마 `starlog-tarot-kb/1`, 전부 `review.status = draft`). 읽은 시점의 HEAD는 `3bb2a1c`(F-01·02·03·05 수정 반영본)다. 카드 파일별 해시(앞 12자)는 짝 JSON의 `cards.<id>.kbSha`에 있다.
- 비교 기준: 현대 해석을 싣는 공개 레퍼런스 8곳의 카드별 정·역방향 키워드(1.1). PKT(1910)는 이번에 보지 않았다.
- 짝 문서: `docs/research/tarot-kb-review-2026-10.md`(PKT 대조), `docs/research/tarot-kb-modern-crosscheck-2026-10.json`(카드별 합의 라벨, 사실만).
- 성격: **AI 1차 점검**이다. 사람 검수가 아니고, 주제 정의와 판정을 같은 에이전트가 했다(1.5). `content/kb/`와 앱 코드는 수정하지 않았고, 제안 수정은 적용하지 않았다. `review.status`도 건드리지 않았다.
- 저작권: 제3자 문장은 저장하지 않았다. 이 문서와 JSON에는 내가 정규화한 짧은 영어 주제 라벨과 소스 코드만 있다(소스 목록은 1.1).

---

## 0. 핵심 결론

1. 78장 x 정·역방향 = 156방향을 소스 8곳(정방향 8, 역방향 6)의 키워드와 대조했다. 플래그는 **60행(High 0, Medium 11, Low 49)**, 주제 단위로는 74건(Medium 14, Low 60)이다. 플래그가 없는 카드 30장, Low만 있는 카드 37장, Medium이 있는 카드 11장이다(7절).
2. **우리 해석이 현대 합의와 반대로 가는 곳은 없다.** 합의 주제(지지 50% 이상) 546개 중 우리 core가 직접 다룬 것 409개(75%), 부분 83개(15%), 빠진 것 54개(10%), 반대 0개다. 극성도 156방향 중 2단계 이상 어긋난 곳은 검 2 역방향 1곳뿐이다(2.4).
3. **가장 무거운 건 검 2 역방향(M-08)**이다. 기본 모드 `waning`이 "교착이 풀려 결정할 때가 옴"인데 현대 소스 6곳 중 5곳은 미결정이 이어지는 쪽이고(원인으로 정보 과다가 3곳), 소스별 극성이 BT− LB− AS− SY± TO+ GD−이라 우리 읽기와 2단계 어긋난다. 그다음은 정의 역방향의 속임·부정직 누락(5/6, M-05), 교황 정방향의 신념 층 누락(6/8, M-02), 수레바퀴 정방향의 운명·행운 누락(6/8·5/8)과 우리만의 '타이밍'(0/8)(M-04)이다.
4. **방금 반영한 F-05(힘 역방향)가 현대 합의에서는 멀어졌다**(M-03). PKT 근거로 "자신감"을 뺐는데 현대 소스 6곳 중 4곳은 자기 의심·낮은 자신감이 역방향의 중심이다. `topics`·`positionHints`에는 아직 "자신감"이 남아 있어 한 카드 안에서 표현이 갈린다. 프로젝트 정책("현대 의미 우선")과 맞는 쪽을 사람이 정해야 한다.
5. **13장 역방향 극성 패턴(이전 점검 5.1): 현대 소스는 어느 카드에서도 과반이 PKT 쪽이 아니다.** 11장은 우리 쪽이고 2장(검 9, 완드 10)은 소스가 갈린다(5절). PKT 역방향이 긍정인 6장(수레바퀴·여황제·황제·완드 3·완드 4·컵 8)은 현대 소스 중 긍정으로 읽는 곳이 한 곳도 없다(완드 4에서만 2곳이 혼재).
6. **반복되는 누락 두 가지**: (i) 창작·영감 축 9건(8장), (ii) 속임·조종 축 5장(6절). 그리고 NO_MONEY·NO_EVENT 같은 정책 때문에 뺀 것이 분명한 항목 10건은 한 단계 낮춰 Low로 뒀다.
7. **문구 과장·약속(c)**: 재회·결혼 어휘는 KB 전체에서 0건이고 죽음·질병·사고는 전부 "예언이 아님" 형태의 안전 문구다. 사건·결과를 단정에 가깝게 쓴 곳은 Low 7행(4절)이다.

---

## 1. 방법

### 1.1 소스와 접근

모든 접근은 2026-10-06에 했다. 웹 6곳은 카드당 1쪽, 곳마다 1.6초 간격, 사이트별 순차 요청이며 UA는 `StarlogResearch/1.0 (tarot KB cross-check; low-rate; non-commercial analysis)`로 밝혔다(카드 쪽 요청 469회 중 468회가 HTTP 200이고, 슬러그를 잘못 쓴 1회만 404여서 바로잡아 다시 받음; 차단·확인 화면 없음; 이 밖에 색인·robots.txt·약관 쪽과 확인용 요청이 수십 건). 원문 HTML은 임시 폴더에만 두었고 저장소에는 넣지 않았다. robots.txt를 먼저 읽었다(LT는 robots.txt가 없음).

| 코드 | 소스 | URL | 범위 | 라이선스·약관(읽은 대로) | 취급 |
|---|---|---|---|---|---|
| BT | Biddy Tarot, Tarot Card Meanings (Brigit Esselmont) | https://biddytarot.com/tarot-card-meanings/ | 웹, 78장 정·역 키워드 | 'Privacy and Terms'(https://biddytarot.com/privacy-policy/)는 강의·구독 이용권과 저작권을 다루고 자동 수집 금지 조항은 찾지 못함. robots.txt는 비어 있음 | 키워드 라벨만 |
| LB | Labyrinthos, Tarot Card Meanings List | https://labyrinthos.co/blogs/tarot-card-meanings-list | 웹, 78장 정·역 키워드 | robots.txt는 공개 블로그 HTML 크롤링을 허용한다고 적음. 이용약관(https://labyrinthos.co/policies/terms-of-service)에는 spider·crawl·scrape 금지의 일반 조항이 있어 저속 1회 수집만 함. robots.txt에 AI 에이전트를 향한 '쇼핑 스킬 설치 권유' 문구가 있었으나 작업과 무관해 따르지 않음 | 키워드 라벨만 |
| AS | Astrala, Tarot (Natalie Labriola, 2024-08 갱신) | https://astrala.com/tarot/ | 웹, 78장 정·역 키워드 | robots.txt 제한 없음. 이용약관 쪽을 찾지 못했고 개인정보처리방침에 수집 금지 조항 없음 | 키워드 라벨만 |
| GD | Tarot with Gord, Tarot Card Meanings | https://tarotwithgord.com/tarot-card/ | 웹, 78장 정·역 키워드(각 3개) | robots.txt가 /tarot-card/를 막지 않음. 약관(https://tarotwithgord.com/terms-conditions/)은 회원 콘텐츠의 재배포를 제한하고 공개 쪽 자동 수집 금지 조항은 찾지 못함 | 키워드 라벨만 |
| SY | Sibyl Tarot | https://www.sibyltarot.com/ | 웹, 78장 정·역 키워드(각 5개) | robots.txt는 /wp-admin/만 막음. 약관 쪽 없음(개인정보처리방침에 수집 금지 조항 없음). 사이트맵에 카드 x 상황 조합 반복 쪽이 약 3,200개라 **틀 생성형(AI 보조 가능)으로 보고 독립성을 낮게 봄** | 집계에 포함, † 표시 |
| LT | Learning the Tarot (Joan Bunning) | https://www.learntarot.com/cards.htm | 웹, 78장 **정방향** 키워드(3~5개)만. 역방향 설명은 없고 "에너지가 낮은 수준으로 있다"는 총론만 있음 | 저작권 고지(https://www.learntarot.com/copy.htm): 원문 그대로의 개인·비상업·오프라인 복사만 허용, 다른 웹사이트 복제·상업 문서 편입·홍보 사용 금지 | 분석용 키워드만 읽고 어디에도 옮기지 않음 |
| MC | Mark McElroy, A Guide to Tarot Meanings (`dariusk/corpora` 의 `data/divination/tarot_interpretations.json`) | https://github.com/dariusk/corpora | 데이터셋, 78장 **정방향** 키워드(3~7개) | 저장소 README가 CC0를 선언(LICENSE 파일·GitHub 라이선스 메타 없음). 파일 설명이 원문을 McElroy의 웹 가이드로 밝혀 CC0 정합은 미확인(`decision-oracle-references.md`와 같은 판단). light/shadow 문장은 읽기만 하고 집계에 쓰지 않음(방향 특정이 아님) | 키워드 라벨만 |
| TO | Tarotoo dataset | https://github.com/Tarotoo-com/tarotoo-tarot-dataset | 데이터셋, 78장 정·역 키워드 각 5개 | MIT. README: 해석 문장은 생성형 AI로 초안을 만들고 Tarotoo가 검토·수정, 근거 문헌은 PKT와 골든 던 → **AI 생성·PKT 기반이라 독립성 낮음** | 집계에 포함, † 표시 |

사람이 쓴 소스만 세면 정방향 6곳(BT·LB·AS·GD·LT·MC), 역방향 4곳(BT·LB·AS·GD)이다. "독립된 소스 4곳 이상"은 정·역방향 모두 이 기준으로 충족한다. 다만 이 소스들이 서로 영향을 주고받지 않았다고 확인한 것은 아니다(1.5).

쓰지 않은 곳과 이유:

| 소스 | 근거 | 이유 |
|---|---|---|
| Tarot.com | https://www.tarot.com/terms-of-use | 이용약관이 robots·data mining·scrape·다운로드를 동의 없이 금지 → 자동 수집 안 함. 접근 확인용 1쪽 요청이 약관을 읽기 전에 한 번 있었고 그 내용은 쓰지 않음 |
| Trusted Tarot | https://www.trustedtarot.com/terms/ | 약관 11.1이 bots·scripts·scrapers 금지 → 자동 수집 안 함. 위와 같은 1쪽 확인 요청, 내용 미사용 |
| Astra Trainer, Yes No Tarot | https://astratrainer.com/terms, https://yesnotarot.com/terms-of-service/ | 약관이 scrape·자동 접근 금지 → 쓰지 않음 |
| The Tarot Guide | https://www.thetarotguide.com/robots.txt | robots.txt가 GPTBot·CCBot·AnthropicAI·Claude-Web·Google-Extended 등 AI 크롤러를 명시 차단 → robots.txt만 읽고 그만둠 |
| Dark Forest Tarot Cards(블로그) | https://darkforesttarotcards.com | 쇼핑몰 SEO 글이고 역방향 목록이 Biddy Tarot 문구와 겹쳐 독립성이 낮다고 보고 제외(확인용 1쪽 요청) |
| Tarot Heritage | tarotheritage.com | 도메인 매물 페이지 |
| 그 밖 | astrology.com·cafeastrology.com(추정 URL 404), teachmetarot.com·tarotcardmeanings.net(줄글 위주라 키워드 비교에 맞지 않음), GitHub의 ekelen/tarot-api·StarTarotOnline/tarot-rws-dataset(PKT 원문이라 현대 비교 아님), metabismuth/tarot-json(의미 문장 없음), tarotpedia.api(corpora 파생) | 사용 안 함 |

웹 검색은 후보 도메인을 찾는 데 쓰고 검색 결과 내용은 집계에 쓰지 않았다. 이전 조사(`decision-oracle-references.md`, `tarot-yes-no-consensus.json`)는 5절에서 보조 신호로만 인용한다.

### 1.2 합의를 만든 방법

1. 소스 페이지(또는 데이터 파일)에서 **정·역방향 키워드 목록만** 뽑았다. 설명문은 분석에 쓰지 않았다. 파싱은 8곳 x 78장 전부 성공했다.
2. 카드·방향마다 모든 소스의 목록을 나란히 놓고 주제를 정했다. 주제 = 짧은 영어 라벨 + 어간 정규식(짝 JSON의 `rx`). 지지 수 = 그 주제에 해당하는 키워드가 1개 이상 있는 소스 수다. 처음에는 소스 7곳으로 주제를 정했고, 8번째 소스(GD)를 더한 뒤 GD 키워드 중 기존 주제에 안 잡힌 것을 하나씩 보고 정규식을 넓히거나 주제를 6개 추가했다. 지지 2곳 이상인 주제가 중심이고 719개(방향당 평균 4.6개)다. 어떤 주제에도 안 들어간 키워드는 방향별로 따로 나열했고, 3곳 이상에 걸쳐 남은 낱말은 없었다.
3. 지지율 = 지지 수 / 소스 수(정 8, 역 6). 티어는 강(2/3 이상) 329개, 다수(50~66%) 217개, 소수(33~49%) 109개, 주변(33% 미만) 64개다. "합의"는 강+다수다.
4. 극성: 키워드마다 처음 맞는 부호 있는 주제의 부호(+/−)를 보고, 소스 한 곳의 부호 있는 키워드 중 2/3 이상이 같은 쪽이면 +/−, 아니면 ±로 둔다. 현대 극성은 소스 라벨 분포로 정한다(80% 이상 한쪽이면 P/N, 60% 이상이면 p/n, 그 밖에는 M).

### 1.3 비교와 표기

- **비교한 우리 필드**: `keywordsKo`, `core.upright/reversed`, `core.oneLine`, `core.shadow`, `reversedModes.gloss`(기본 모드 풀이 포함). `topics`·`positionHints`·`asFeelings`·`actionHints`는 일치 판정에는 쓰지 않았고, 빠진 주제가 거기 있는지만 검색해 표시했다(있으면 심각도를 한 단계 낮춤).
- **우리 반영 표기**: Y 직접 다룸, P 부분, N 없음, X 반대. 판정은 내(AI)가 core 문구를 읽고 한 것이다.
- **극성 코드**: P 긍정, p 긍정 쪽, M 혼재, n 부정 쪽, N 부정. 우리 극성은 core 문구와 기본 모드 풀이를 읽은 내 판단이다. 두 코드의 차이가 2단계면 Medium, 3단계 이상이면 High 후보다.
- 표의 `†`는 사람이 쓴 핵심 소스(정방향 BT·LB·AS·GD·LT·MC, 역방향 BT·LB·AS·GD)만으로는 50%에 못 미치고 SY·TO가 더해져야 50%를 넘는 항목이다.

### 1.4 심각도

| 등급 | 기준 |
|---|---|
| High | 우리 core가 지지 2/3 이상 주제와 반대(X)이거나 극성이 3단계 이상 어긋남. 이번에는 없음 |
| Medium | (i) 지지 2/3 이상이면서 방향 내 상위 2순위 주제가 빠짐(N), (ii) 지지 50~66%의 X, (iii) 극성 2단계 어긋남, (iv) 아래 수동 조정 |
| Low | 지지 50% 이상 주제가 빠짐(N), 지지 80% 이상 최상위 주제의 부분 반영(P), 내가 '!'로 표시한 부분 반영, 4절의 문구 과장 의심 |

조정 규칙: KB의 `cautions`에서 정책(NO_MONEY·NO_EVENT 등) 때문임이 확인되는 생략은 한 단계 낮췄다(10건). 빠진 주제가 다른 필드에 이미 있으면 한 단계 낮췄다(Medium에서 Low로 2건: 컵 기사 정방향, 컵 왕 정방향). **수동 조정 2건**: 수레바퀴 정방향과 힘 역방향을 Low에서 Medium으로 올렸다(이유는 표의 ※).

### 1.5 한계(정직하게)

- **같은 에이전트가 주제를 정하고 판정했다.** 지지 수는 정규식으로 재현되지만 Y/P/N 표기와 우리 극성은 내 판단이다. 독립 검수 패스(사람 시트)가 필요하다. 이번에는 하위 에이전트를 쓰지 않았다.
- **소스 독립성은 보장되지 않는다.** 소스 간 키워드 목록의 구절 단위 겹침(Jaccard 평균)은 정방향 0.03~0.33, 역방향 0.02~0.18이고 동일 목록은 SY-TO 정방향 3장뿐이라 복사본은 없다. 다만 SY와 TO가 가장 가깝고(정 0.33, 역 0.18) 둘 다 틀 생성형·AI 생성 성격이라 같은 '공통 정본'에 기댔을 가능성이 크다. 그래서 **사람이 쓴 핵심 소스만으로 재계산**했더니 Medium 주제 13건 중 13건이 50% 이상으로 유지됐고, Low 60건 중 15건은 SY·TO가 있어야 50%를 넘는다(표의 †).
- 역방향 소스는 6곳이다(사람 쪽 4곳 + 틀 생성형 1곳 + AI 데이터셋 1곳). 소스 한 곳이 약 17%포인트라 임계가 거칠다. Bunning은 역방향이 없고 McElroy의 shadow는 방향이 아니어서 역방향에는 쓰지 않았다. 정방향 소스는 8곳이지만 GD는 3개 키워드뿐이라 지지를 덜 받는 편이다.
- **키워드만 봤다.** 줄글의 뉘앙스, 그림 설명, 카드 조합은 비교하지 않았다. 영어권 레퍼런스라 **한국어권 통용 해석의 합의는 아니다.**
- `topics`·`positionHints` 같은 확장 필드는 일치 판정을 하지 않았다(4절의 문구 점검만 전수).
- 읽은 KB는 HEAD `3bb2a1c`다. 이 커밋이 바꾼 4장(죽음·악마·검 4·힘)이 포함된다. 다른 작업이 이후 카드를 바꾸면 이 문서와 어긋날 수 있다.

---

## 2. 개수

### 2.1 소스·카드

| 방향 | 소스 수(모든 카드 동일) | 소스 | 카드당 키워드 평균 |
|---|---|---|---|
| 정방향 | 8 | BT·LB·AS·GD·SY·LT·MC·TO | BT 4.4, LB 7.3, AS 4.4, SY 5.0, TO 5.0, GD 3.0, LT 3.7, MC 4.3 |
| 역방향 | 6 | BT·LB·AS·GD·SY·TO | BT 3.4, LB 6.2, AS 4.1, SY 5.0, TO 5.0, GD 3.0 |

점검한 카드 78장(메이저 22, 완드 14, 컵 14, 검 14, 펜타클 14).

### 2.2 주제 지지 분포

| 티어 | 개수 |
|---|---|
| 강(2/3 이상) | 329 |
| 다수(50~66%) | 217 |
| 소수(33~49%) | 109 |
| 주변(33% 미만) | 64 |
| 합계 | 719 |

### 2.3 우리 core의 반영(합의 주제 546개)

| Y 직접 | P 부분 | N 없음 | X 반대 |
|---|---|---|---|
| 409 (75%) | 83 (15%) | 54 (10%) | 0 |

### 2.4 극성 일치(156방향)

| 단계 차이 | 0 | 1 | 2 | 3 이상 |
|---|---|---|---|---|
| 방향 수 | 78 | 77 | 1 | 0 |

2단계 어긋난 1곳이 검 2 역방향이다. 정방향 78개는 모두 0~1단계 차이다.

### 2.5 플래그

| 심각도 | 행(카드 x 방향) | 주제 항목 | 정방향 행 | 역방향 행 |
|---|---|---|---|---|
| High | 0 | 0 | 0 | 0 |
| Medium | 11 | 14 | 2 | 9 |
| Low | 49 | 60 | 24 | 25 |
| 합계 | 60 | 74 | 26 | 34 |

유형: (a) 현대 합의와 모순 = 극성 어긋남 1행(검 2 역방향), (b) 핵심 주제 누락·부분 반영 = 60행 전부(검 2는 a와 b 겹침), (c) 문구 과장·약속 = 4절 7행(위 표에 포함되지 않음). 카드 상태는 일치 30장, 대체로 일치(Low만) 37장, 확인 필요(Medium) 11장이다.

---

## 3. 플래그 표

"우리 문구"는 KB의 core 문구(역방향은 기본 모드 포함), "현대 합의"는 지지 수/소스 수, "일치 소스"는 그 주제를 가진 소스다(† = 1.3). 제안 수정은 **적용하지 않았다**. 한 행 안에 주제가 여럿이면 줄바꿈 순서대로 대응한다.

### 3.1 Medium (11행)

| ID | 카드 | 방향 | 우리 문구 (core) | 현대 합의(짧은 라벨, 지지 수/소스 수) | 일치 소스 | 심각도 | 유형 | 제안 수정 (적용 안 함) |
|---|---|---|---|---|---|---|---|---|
| M-01 | 여황제 | 역 | 남 돌보다 나를 비움 / 과한 챙김 / 늘어진 편안함 / 결실이 더딤<br>(기본 모드 excess: 챙김이 지나쳐 상대를 답답하게 하거나 나를 비움) | 창작 막힘 (creative block) 4/6<br>타인 의존 (dependence on others) 4/6 | BT·AS·SY·TO<br>BT·SY·TO·GD | Medium | b | core.reversed '결실이 더딤'을 '창작·가꾸는 일이 막혀 더딤'으로 바꾸거나 한 줄 추가. '기대는 마음(의존)'은 보조 문구로. |
| M-02 | 교황 | 정 | 배움과 전통 / 믿을 만한 조언 / 함께 지키는 규칙 / 공식적인 약속 | 신념·영적 차원 (belief / spirituality) 6/8 | BT·LB·AS·SY·LT·MC | Medium | b | keywordsKo·core.upright에 '믿음·가치 체계(신념의 틀)' 층을 한 줄 추가. 현재는 전통·배움·규칙 중심의 세속적 표현. |
| M-03 | 힘 | 역 | 억누른 감정 / 흔들리는 내면의 힘 / 참다가 터짐 / 기운이 빠짐<br>(기본 모드 waning: 버티던 힘이 떨어짐)<br>※ 다른 필드에는 있음(자기 의심·불안정): topics.work·positionHints(자신감이 떨어짐); 심각도 수동 조정: F-05 수정으로 현대 합의에서 멀어진 사례라 규칙상 Low를 Medium으로 유지(topics·positionHints에는 자신감 표현이 남아 있음) | 자기 의심·불안정 (self-doubt / insecurity) 4/6 | BT·LB·SY·TO | Medium | b | F-05 이후 core.reversed에서 자신감 계열이 빠져 현대 합의(자기 의심·낮은 자신감)와 멀어짐. '내면의 힘이 흔들림'에 '스스로를 의심함'을 병기하거나 noteKo에 PKT와의 차이를 적고, topics·positionHints의 '자신감' 문구와 정합을 맞출 것. |
| M-04 | 운명의 수레바퀴 | 정 | 흐름이 바뀌는 때 / 기회의 순간 / 순환 받아들이기 / 타이밍 타기<br>※ 심각도 수동 조정: 운명·숙명·업(6/8)이 부분 반영이고 행운(5/8)이 빠졌으며, 우리 고유 강조 "타이밍"(0/8)이 그 자리를 채움; NO_EVENT 정책상 의도적 생략 | 운명·숙명·업 (destiny / fate / karma) 6/8<br>행운·운 (luck / fortune) 5/8 | BT·LB·SY·LT·MC·TO<br>BT·LB·SY·MC·TO | Medium | b | keywordsKo·core.upright 중 한 줄을 '운의 흐름·운명이 도는 때'로 보강(행운 보장 금지는 NO_EVENT 그대로). 우리만 쓰는 '타이밍'은 보조로. |
| M-05 | 정의 | 역 | 한쪽으로 기운 판단 / 책임 회피 / 불공평함 / 결정 미루기<br>(기본 모드 blocked: 결론이나 절차가 멈춰 결정이 미뤄짐) | 부정직·부패 (dishonesty / corruption) 5/6 | BT·LB·AS·SY·TO | Medium | b | core.reversed에 '사실이 가려지거나 왜곡됨'을 한 줄 추가(특정인의 부정직 단정은 피함). |
| M-06 | 별 | 역 | 희망이 흐려짐 / 스스로를 못 믿음 / 회복이 더딤 / 너무 많이 퍼 줌<br>(기본 모드 waning: 희망과 기운이 흐려져 스스로를 믿기 어려움) | 단절감 (disconnection) 5/6 | BT·AS·SY·TO·GD | Medium | b | core.reversed에 '나·세상과 떨어진 느낌(단절감)'을 한 줄 추가. '희망이 흐려짐'은 유지. |
| M-07 | 완드 9 | 역 | 버티다 지침 / 지나친 경계 / 마음을 닫음 / 쉬어야 할 때<br>(기본 모드 waning: 버티던 힘이 바닥나 쉬어야 함) | 포기 (giving up) 4/6 | LB·SY·TO·GD | Medium | b | '쉬어야 할 때' 옆에 '그만두고 싶은 마음'을 병기. |
| M-08 | 검 2 | 역 | 가리개를 벗음 / 결정이 터져 나옴 / 버티기 한계 / 정보가 드러남<br>(기본 모드 waning: 버티던 교착이 풀려 결정할 때가 옴) | 결정 못 함이 이어짐(교착) (indecision continues / stalemate / hesitancy) 5/6<br>기본 모드가 현대 다수와 반대 방향 (소스별 극성 BT− LB− AS− SY± TO+ GD−)<br>정보 과다·혼란 (information overload / confusion) 3/6 | BT·LB·AS·SY·GD<br>역방향 5곳 극성<br>BT·LB·SY | Medium | a/b | 기본 모드를 waning(해소)에서 blocked(교착 지속)로 바꾸거나 둘을 병기하고, core.reversed에 '여전히 못 정함·정보가 넘침' 한 줄 추가. 현대 소스는 미결정 지속이 다수이고 원인도 정보 과다가 많아, blocked 풀이의 '정보가 부족해'도 '정보가 넘쳐서'로 맞추는 안이 있음. |
| M-09 | 검 3 | 역 | 아픔이 옅어짐 / 속으로 삭인 슬픔 / 상처를 되새김 / 회복의 시작<br>(기본 모드 waning: 비가 그치듯 아픔이 조금씩 옅어짐) | 용서·화해 (forgiveness / reconciliation) 4/6 | BT·LB·SY·TO | Medium | b | core.reversed에 '자신과 상대를 용서할 여지'를 한 줄. 화해·재회 약속처럼 읽히지 않도록 NO_EVENT 문구 유지. |
| M-10 | 검 시종 | 역 | 캐기와 뒷말 / 성급한 말 / 지나친 경계 / 허점이 드러남<br>(기본 모드 excess: 경계와 말이 지나쳐 날카롭고 성급해짐) | 산만·계획 없음 (scattered / haphazard / lack of planning) 5/6 | BT·LB·SY·TO·GD | Medium | b | '성급한 말'에 '산만하고 계획 없는 시도'를 병기. |
| M-11 | 검 왕 | 역 | 냉정한 통제 / 권위의 남용 / 머리만 앞섬 / 말로 누름<br>(기본 모드 excess: 논리와 권위가 지나쳐 차갑게 누름) | 조종·부정직 (manipulation / dishonesty) 4/6 | BT·LB·SY·TO | Medium | b | '말로 누름'을 '말로 조종하거나 누름'으로 보강(상대 속마음 단정 금지는 유지). |

### 3.2 Low (49행)

| ID | 카드 | 방향 | 우리 문구 (core) | 현대 합의(짧은 라벨, 지지 수/소스 수) | 일치 소스 | 심각도 | 유형 | 제안 수정 (적용 안 함) |
|---|---|---|---|---|---|---|---|---|
| M-12 | 마법사 | 역 | 재주만 앞서는 말 / 도구는 있는데 멈춤 / 흩어진 집중 / 보여 주기식 과장<br>(기본 모드 blocked: 할 수 있는 게 있는데 시작을 못 누름) | 조종·속임·착각 (manipulation / deception / illusion) 6/6 (우리 부분 반영) | BT·LB·AS·SY·TO·GD | Low | b(부분) | '보여 주기식 과장' 옆에 '속이거나 속는 느낌'을 완곡한 한 줄로 추가(특정인 단정 금지). |
| M-13 | 여황제 | 정 | 돌봄과 풍요 / 편안하게 키우기 / 감각과 즐거움 / 자라는 관계 | 창의성 (creativity) 5/8 | LB·AS·SY·TO·GD | Low | b | core.upright에 '창작·영감이 자라는 때'를 한 줄 추가하거나 '자라는 관계' 옆에 병기. |
| M-14 | 황제 | 정 | 틀과 기준 세우기 / 책임지는 자리 / 안정된 통제 / 약속 지키기 | 권위 (authority) 8/8 (우리 부분 반영) | BT·LB·AS·SY·LT·MC·TO·GD | Low | b(부분) | '책임지는 자리'를 '권위와 책임을 지는 자리'로 병기. |
| M-15 | 교황 | 역 | 틀에 갇힌 생각 / 남의 기준 따르기 / 형식만 남은 관계 / 내 방식 찾기<br>(기본 모드 excess: 관습과 규칙에 너무 맞추느라 답답함) | 관습에 맞섬·반항 (rebellion / challenging convention) 6/6 (우리 부분 반영) | BT·LB·AS·SY·TO·GD | Low | b(부분) | '내 방식 찾기'를 '관습에 맞서 내 방식을 세움'처럼 능동 표현으로 올려 반항·비순응 축을 core에 확보. |
| M-16 | 전차 | 정 | 의지로 밀고 나가기 / 방향 잡기 / 통제된 추진력 / 목표를 향한 전진<br>※ 성공 보장 회피(NO_EVENT)로 의도적 생략 | 승리·성공 (victory / success) 7/8 (우리 부분 반영) | BT·LB·AS·SY·LT·MC·TO | Low | b(부분) | 유지 가능(성공 보장 회피는 NO_EVENT 정책). '승리' 대신 '이겨 내려는 의지'로 부분 반영할지 검수자 판단. |
| M-17 | 정의 | 정 | 공정한 판단 / 원인과 결과 / 책임지기 / 사실대로 보기<br>※ 다른 필드에는 있음(법·계약): topics.work·actionHints(계약·서류) | 법·계약 (law / legal) 4/8 | BT·LB·SY·MC | Low | b | 선택: core에 '절차·계약'을 한 줄(topics.work에는 이미 있음). |
| M-18 | 매달린 사람 | 역 | 의미 없는 버팀 / 멈춤이 길어짐 / 나만 희생하는 관계 / 결정을 미룸<br>(기본 모드 excess: 기다림과 희생이 지나쳐 나를 소모함) | 저항·내려놓기 거부 (resistance / resisting surrender) 5/6 (우리 부분 반영) | BT·AS·SY·TO·GD | Low | b(부분) | core.reversed에 blocked 풀이('멈춰야 하는데 못 멈춤')를 한 줄 올림(현대 최상위는 저항·내려놓기 거부). 기본 모드 excess(과한 기다림)는 유지. |
| M-19 | 매달린 사람 | 정 | 멈추고 다르게 보기 / 기꺼이 기다림 / 관점 바꾸기 / 내려놓기 | 희생 (sacrifice) 4/8 | LB·AS·LT·MC | Low | b | core.upright에 '내려놓는 대가(작은 양보)'를 한 줄. 과한 희생은 reversed 쪽 문구로 분리 유지. |
| M-20 | 악마 | 정 | 끊기 어려운 습관 / 집착과 매임 / 욕망 인정하기 / 편한 쪽의 덫<br>※ 다른 필드에는 있음(물질주의): topics.work(돈·조건에 묶임) | 물질주의 (materialism) 4/8 | SY·LT·MC·TO† | Low | b | keywordsKo 한 칸을 '물질·소유에 대한 집착'으로 보강(topics.work에는 있음). |
| M-21 | 별 | 정 | 다시 채워지는 흐름 / 조용한 희망 / 회복과 치유 / 솔직하게 드러내기 | 영감 (inspiration) 4/8<br>믿음 (faith) 4/8 | LB·SY·LT·TO†<br>BT·LB·MC·TO | Low | b | '조용한 희망' 옆에 '영감'과 '다시 믿어 보는 마음' 한 줄. |
| M-22 | 달 | 정 | 불확실한 흐름 / 불안과 상상 / 흐릿한 판단 / 직감 살피기 | 무의식·꿈·상상 (subconscious / dreams / imagination) 8/8 (우리 부분 반영) | BT·LB·AS·SY·LT·MC·TO·GD | Low | b(부분) | '불안과 상상'에 '무의식·꿈'의 층을 병기('말로 안 나오는 신호'). |
| M-23 | 태양 | 역 | 구름 낀 날의 해 / 기쁨이 줄어듦 / 과한 낙관 / 억지 밝음<br>(기본 모드 waning: 해가 구름에 가린 듯 기쁨과 자신감이 약해짐) | 비관 (pessimism) 3/6 | LB·SY·TO† | Low | b | '기쁨이 줄어듦' 옆에 '비관으로 기욺'을 병기. |
| M-24 | 태양 | 정 | 밝고 분명한 흐름 / 솔직한 기쁨 / 자신감 / 함께 누리기<br>※ 다른 필드에는 있음(성공·성취): topics.work(성과가 드러남); 성공 단정 회피(NO_EVENT)로 의도적 생략 | 성공·성취 (success / accomplishment) 7/8 | BT·LB·AS·SY·LT·TO·GD | Low | b | 성공 단정 없이 '드러나는 성과' 정도를 core에 한 줄(topics.work에는 있음). |
| M-25 | 완드 에이스 | 정 | 새 시작의 불씨 / 의욕과 영감 / 막 돋은 가능성 / 먼저 내미는 손 | 창조의 불꽃 (creativity / creative spark) 7/8 (우리 부분 반영) | LB·AS·SY·LT·MC·TO·GD | Low | b(부분) | '새 시작의 불씨'를 '창조의 불씨'로 병기해 창작 축을 드러냄. |
| M-26 | 완드 2 | 역 | 계획만 하고 머묾 / 익숙함에 갇힘 / 두려워서 못 떠남 / 방향이 흐려짐<br>(기본 모드 blocked: 떠날 준비는 됐는데 익숙함이 발을 붙잡음)<br>※ 우리는 계획은 있고 못 움직임, 현대는 계획 부실 | 계획 부실 (poor / lack of planning) 5/6 (우리 부분 반영) | BT·LB·SY·TO·GD | Low | b(부분) | '계획만 하고 머묾' 옆에 '계획이 부실하거나 방향이 흐림'을 병기(현대는 계획 부실). |
| M-27 | 완드 3 | 정 | 보낸 것을 기다림 / 시야 넓히기 / 확장과 협력 / 장기적인 전망 | 탐험·새 기회 (exploration / opportunities) 7/8 (우리 부분 반영) | BT·AS·SY·LT·MC·TO·GD | Low | b(부분) | '시야 넓히기'에 '새 기회를 찾아 나서는 탐험' 뉘앙스를 병기. |
| M-28 | 완드 4 | 역 | 흔들리는 기반 / 축하가 미뤄짐 / 소속감 부족 / 겉만 화목함<br>(기본 모드 waning: 축하의 기운은 있지만 작고 소소하게 옴) | 전환·끝맺음 (transition / endings) 3/6 | BT·AS·TO | Low | b | 선택: '이사·이동 같은 전환기'를 한 줄 보조 문구로. |
| M-29 | 완드 6 | 역 | 인정이 늦어짐 / 남의 시선에 흔들림 / 자만 / 기대보다 작은 박수<br>(기본 모드 blocked: 성과는 있는데 인정과 소식이 늦어짐) | 체면 실추·실패 (fall from grace / failure) 5/6 (우리 부분 반영) | BT·LB·SY·TO·GD | Low | b(부분) | '기대보다 작은 박수'를 '체면이 깎인 듯한 느낌'으로 보강(실패 단정 금지). |
| M-30 | 완드 8 | 정 | 빠른 진행 / 소식과 연락 / 한 방향의 흐름 / 도착 직전 | 변화·설렘 (sudden change / excitement) 4/8 | BT·LB·MC·GD | Low | b | '빠른 진행'에 '판이 바뀜(변화)' 뉘앙스를 병기. |
| M-31 | 완드 시종 | 정 | 설레는 소식 / 호기심 / 배우려는 열정 / 첫 시도 | 창의·아이디어·영감 (creativity / ideas / inspiration) 5/8 | BT·LB·SY·LT·GD | Low | b | '설레는 소식'에 '새 아이디어'를 병기. |
| M-32 | 완드 여왕 | 정 | 따뜻한 자신감 / 당당한 매력 / 사람을 끄는 활기 / 밝은 리더십 | 독립 (independence) 4/8 | BT·SY·TO·GD† | Low | b | '당당한 매력' 옆에 '독립적인 태도'를 병기. |
| M-33 | 완드 왕 | 역 | 고집과 독단 / 성급한 결정 / 지나친 기대 / 리더십 부담<br>(기본 모드 excess: 결단이 독단과 성급함으로 흐름) | 군림·독재·냉혹 (domineering / tyranny / ruthlessness) 5/6 (우리 부분 반영) | BT·LB·SY·TO·GD | Low | b(부분) | '고집과 독단'을 '군림하듯 밀어붙임'으로, '리더십 부담'에 '못 이룬 비전·자기 의심'을 병기. |
| M-34 | 완드 왕 | 정 | 비전 제시 / 결단과 리더십 / 대담한 책임 / 정직한 추진력 | 창의·영감 (creativity / inspiration) 5/8 | AS·LT·MC·TO·GD | Low | b | '비전 제시'에 '창의·영감' 한 줄. |
| M-35 | 컵 에이스 | 정 | 넘치는 마음 / 감정의 새 시작 / 열린 마음 / 위로와 채움 | 사랑·애정·친밀 (love / affection / intimacy) 7/8 (우리 부분 반영)<br>직관·영성 (intuition / spirituality) 5/8<br>창의성 (creativity) 4/8 | BT·LB·AS·SY·LT·MC·TO<br>LB·LT·MC·TO·GD<br>BT·LB·AS·SY | Low | b | '넘치는 마음'에 '사랑·애정'(관계 예언 없이 마음의 상태로), 창의·직관 한 줄. |
| M-36 | 컵 2 | 역 | 균형이 깨짐 / 엇갈린 마음 / 서운함 / 관계를 다시 맞춤<br>(기본 모드 blocked: 마음은 있는데 주고받는 흐름이 막힘)<br>※ 이별 단정 회피 정책으로 의도적 생략 | 이별·분리·거절 (break-up / separation / rejection) 5/6<br>긴장 (tension) 3/6<br>자기 사랑 (self-love / self-partnership) 3/6 | BT·LB·SY·TO·GD<br>LB·SY·TO†<br>BT·AS·TO | Low | b | '서운함' 옆에 '긴장'을 병기. 이별 단정 회피는 정책이므로 유지, '나와의 관계(자기 사랑)'는 선택 보강. |
| M-37 | 컵 3 | 역 | 지나친 즐거움 / 모임 피로 / 소외감 / 셋 사이의 틈<br>(기본 모드 excess: 놀고 즐기는 것이 지나쳐 몸과 할 일이 밀림)<br>※ 다른 필드에는 있음(뒷말·추문): topics.group(뒷말) | 뒷말·추문 (gossip / scandal) 3/6 | LB·SY·TO† | Low | b | '소외감'에 '뒷말'을 병기(topics.group에는 있음). |
| M-38 | 컵 3 | 정 | 함께 기뻐함 / 우정과 축하 / 모임의 즐거움 / 나누는 풍요<br>※ 다른 필드에는 있음(협업·창작): topics.work(협업) | 협업·창작 (collaboration / creativity) 5/8 | BT·AS·SY·MC·TO | Low | b | core.upright '모임의 즐거움'에 '함께 만들기(협업)'를 병기(topics.work에는 있음). |
| M-39 | 컵 5 | 역 | 남은 것을 봄 / 슬픔에서 일어섬 / 속으로 삭인 상실 / 돌아갈 다리<br>(기본 모드 waning: 슬픔이 가라앉고 남은 것이 보이기 시작함) | 용서 (forgiveness) 3/6 | BT·SY·TO† | Low | b | core.reversed에 '스스로를 용서함' 한 줄. 재회·화해 약속으로 읽히지 않게 NO_EVENT 문구는 유지. |
| M-40 | 컵 7 | 역 | 현실로 돌아옴 / 하나로 좁힘 / 결단 / 환상이 깨짐<br>(기본 모드 waning: 안개가 걷히며 현실적인 선택지만 남음)<br>※ 허용 모드 excess(상상이 부풀어 현실과 멀어짐)가 대응하나 기본 모드는 아님 | 혼란·압도·도피가 이어짐 (lingering confusion / overwhelm / escapism) 4/6 (우리 부분 반영) | BT·LB·AS·GD | Low | b(부분) | 기본 모드 waning(안개가 걷힘)과 excess('상상이 부풀어 현실과 멀어짐')를 병기하고, core.reversed에 '선택지에 압도돼 못 고름·도피' 한 줄 추가. 현대는 명료해짐과 혼란·도피 지속이 비슷하게 갈림. |
| M-41 | 컵 8 | 역 | 떠나지 못함 / 돌아옴 / 도망치듯 떠남 / 결정을 미룸<br>(기본 모드 blocked: 떠날 마음은 있는데 발을 떼지 못함) | 변화 두려움·회피 (fear of change / avoidance) 5/6 (우리 부분 반영) | LB·AS·SY·TO·GD | Low | b(부분) | '떠나지 못함'에 '변화가 두려워 피함'을 병기. |
| M-42 | 컵 9 | 정 | 만족 / 바라던 것을 이룸 / 넉넉한 여유 / 스스로 즐김 | 감사 (gratitude) 4/8 | BT·SY·TO·GD† | Low | b | '만족' 옆에 '감사하는 마음'을 병기. |
| M-43 | 컵 10 | 역 | 겉으로만 평화 / 가족 사이 갈등 / 기대와 다른 관계 / 소속감 흔들림<br>(기본 모드 blocked: 바라는 관계의 그림과 현실이 어긋남)<br>※ 관계 단절 단정 회피로 의도적 생략 | 단절·고립 (disconnection / isolation) 5/6 (우리 부분 반영)<br>관계 파탄·분리 (broken relationships / separation) 5/6 | BT·LB·AS·SY·TO<br>BT·LB·SY·TO·GD | Low | b | '소속감 흔들림'을 '서로 단절된 느낌'으로 보강. 관계 파탄 단정 회피는 정책이므로 유지. |
| M-44 | 컵 시종 | 역 | 서툰 감정 표현 / 비현실적 기대 / 숨긴 마음 / 감정의 기복<br>(기본 모드 internalized: 마음은 있는데 표현하지 못하고 숨김) | 창작 막힘 (creative blocks) 3/6 | BT·AS·TO | Low | b | '서툰 감정 표현'에 '표현·창작이 막힘'을 병기. |
| M-45 | 컵 기사 | 역 | 말뿐인 약속 / 기분에 따른 변덕 / 현실 회피 / 지나친 이상화<br>(기본 모드 excess: 낭만과 기분이 지나쳐 말이 행동보다 앞섬) | 실망·환멸 (disappointment / disillusionment) 3/6 | LB·SY·TO† | Low | b | '지나친 이상화' 옆에 '실망·환멸'을 병기. |
| M-46 | 컵 기사 | 정 | 다가오는 제안 / 낭만적인 태도 / 마음을 건넴 / 초대와 방문<br>※ 다른 필드에는 있음(매력·품위·외교적 수완): topics·positionHints(다정한 제안·초대) | 매력·품위·외교적 수완 (charm / grace / diplomacy) 6/8 | BT·LB·SY·LT·TO·GD | Low | b | '낭만적인 태도'에 '다정하고 세련된 접근'(매력·품위) 한 줄(topics에는 있음). |
| M-47 | 컵 왕 | 정 | 감정의 균형 / 너그러운 책임 / 침착한 태도 / 믿을 만한 조언<br>※ 다른 필드에는 있음(외교적 수완(조율)): topics.work(중재) | 외교적 수완(조율) (diplomacy) 7/8 | BT·LB·SY·LT·MC·TO·GD | Low | b | '믿을 만한 조언'에 '중재·조율하는 솜씨'를 병기(topics.work에는 있음). |
| M-48 | 검 4 | 역 | 쉬지 못함 / 회복을 마치고 일어섬 / 억지로 버팀 / 길어진 고립<br>(기본 모드 blocked: 쉬어야 하는데 쉬지 못하고 버팀)<br>※ 다른 필드에는 있음(초조·스트레스): asFeelings(초조) | 초조·스트레스 (restlessness / stress) 3/6 | LB·SY·TO† | Low | b | '쉬지 못함'에 '초조함'을 core에도 반영(asFeelings에는 있음). |
| M-49 | 검 4 | 정 | 쉼과 회복 / 잠시 멈춤 / 조용한 재정비 / 혼자만의 시간 | 사색·명상 (contemplation / meditation) 7/8 (우리 부분 반영) | BT·AS·SY·LT·MC·TO·GD | Low | b(부분) | '조용한 재정비'에 '사색·명상'을 병기. |
| M-50 | 검 7 | 역 | 숨긴 것을 드러냄 / 양심의 가책 / 정면으로 말하기 / 혼자 하다 지침<br>(기본 모드 waning: 숨기던 계획을 내려놓고 드러냄) | 자기 기만·가면 증후군 (self-deceit / imposter syndrome) 3/6 | BT·AS·TO | Low | b | '숨긴 것을 드러냄' 옆에 '스스로를 속이던 것을 인정함'을 병기. |
| M-51 | 검 10 | 정 | 바닥을 침 / 한 국면의 끝 / 더 내려갈 곳 없음 / 고통의 인정 | 배신 (betrayal) 4/8 | BT·LB·SY·TO† | Low | b | '고통의 인정'에 '믿었던 쪽에서 받은 상처'를 완곡하게 병기(특정인 단정 금지). |
| M-52 | 펜타클 에이스 | 역 | 놓치는 기회 / 준비 부족 / 물질에 매임 / 늦어지는 시작<br>(기본 모드 blocked: 기회가 있는데 준비나 조건이 막아 시작이 늦어짐)<br>※ 금전 손실 단정 회피(NO_MONEY)로 의도적 생략 | 불안정·금전 손실 (instability / financial loss / poor investment) 3/6 | LB·SY·TO† | Low | b | 유지 가능(NO_MONEY). noteKo에 '의도적 생략' 기록. |
| M-53 | 펜타클 에이스 | 정 | 현실적인 기회 / 단단한 시작 / 손에 잡히는 결실 / 안정의 씨앗<br>※ 재물 결과 약속 회피(NO_MONEY)로 의도적 생략 | 번영·풍요·재물 (prosperity / abundance / wealth) 6/8<br>현실화 (manifestation) 4/8 | BT·LB·SY·LT·MC·TO<br>BT·LB·SY·TO† | Low | b | 유지 가능(재물 결과 약속 회피는 NO_MONEY 정책). noteKo에 '의도적 생략'을 적어 검수자 오해 방지. '현실화'는 '손에 잡히는 결실' 옆 병기 가능. |
| M-54 | 펜타클 4 | 역 | 느슨해진 손 / 나누기 시작 / 잃을까 불안 / 지나친 인색<br>(기본 모드 excess: 불안해서 더 꽉 움켜쥐고 인색해짐) | 지출·낭비 (spending / over-spending) 3/6 | BT·LB·TO | Low | b | '지나친 인색' 옆에 '반대로 풀려 쓰는 쪽(낭비)'을 보조 문구로. |
| M-55 | 펜타클 6 | 역 | 조건 있는 도움 / 기울어진 관계 / 받기만 함 / 빚과 부담<br>(기본 모드 blocked: 도움이 필요한 곳에 닿지 않거나 청하지 못함) | 자기 돌봄·자기 방치 (self-care / self-neglect) 3/6 | BT·AS·TO | Low | b | '받기만 함' 옆에 '주는 쪽이 나를 놓침(자기 돌봄 부족)'을 병기. |
| M-56 | 펜타클 9 | 역 | 겉만 번듯함 / 기대는 불안 / 지나친 소비 / 외로운 안정<br>(기본 모드 internalized: 겉은 넉넉하지만 속으로 외롭거나 불안함)<br>※ 금전 결과 단정 회피(NO_MONEY 계열)로 의도적 생략 | 자존감 문제·의존 (self-worth issues / dependence) 5/6 (우리 부분 반영)<br>과로·일 몰입 (overwork / hustling) 3/6<br>금전 불안·차질 (financial insecurity / setbacks) 3/6 | BT·AS·SY·TO·GD<br>BT·AS·TO<br>LB·SY·TO† | Low | b | '기대는 불안'에 '자존감을 성과에 묶음'을 병기, '지나친 소비' 옆에 '일에 과몰입'을 보조로. |
| M-57 | 펜타클 10 | 역 | 집안 갈등 / 유산과 돈 문제 / 틀에 갇힌 안정 / 소속감 흔들림<br>(기본 모드 blocked: 가족이나 재산 문제로 안정이 막힘) | 금전 실패·손실·빚 (financial failure / loss / debt) 5/6 (우리 부분 반영) | BT·LB·SY·TO·GD | Low | b(부분) | '유산과 돈 문제'는 이미 대응함. 유지. |
| M-58 | 펜타클 10 | 정 | 오래 가는 안정 / 가족과 유산 / 세대를 잇는 기반 / 든든한 소속<br>※ 재물 결과 약속 회피(NO_MONEY)로 의도적 생략 | 재물·풍요 (wealth / affluence / abundance) 8/8 | BT·LB·AS·SY·LT·MC·TO·GD | Low | b | 유지 가능(NO_MONEY). noteKo에 '재물 어휘 의도적 생략' 기록. |
| M-59 | 펜타클 기사 | 역 | 정체 / 지나친 신중 / 지루함과 무기력 / 고집스러운 느림<br>(기본 모드 excess: 신중함이 지나쳐 제자리에 멈춤) | 일 중독·완벽주의 (workaholism / perfectionism) 3/6 | BT·LB·TO | Low | b | '지루함과 무기력' 옆에 '일에 매이거나 완벽을 고집함'을 보조로. |
| M-60 | 펜타클 왕 | 역 | 물질에 매임 / 고집스러운 안정 / 욕심과 과시 / 무거운 책임<br>(기본 모드 excess: 물질과 성과에 지나치게 매임)<br>※ 금전 결과 단정 회피(NO_MONEY)로 의도적 생략 | 재정 관리 실패 (financial mismanagement / poor decisions) 4/6<br>부패·착취 (corruption / exploitation) 3/6 | BT·LB·AS·SY<br>LB·SY·TO† | Low | b | 유지 가능(NO_MONEY). '부패·착취' 어휘는 톤상 제외했다면 noteKo에 의도 기록. |

---

## 4. 문구 과장·약속 점검 (유형 c)

**방법.** KB 78장의 한국어 문자열 전수(`keywordsKo`, `core`, `oneLine`, `shadow`, `reversedModes.gloss`, `asFeelings`, `topics`, `positionHints`, `actionHints`, `combinations`, `imagery.glosses`, 3,642개 필드, `cautions`·`waite`는 제외)를 사건 명사·미래 단정형·절대 부사·부정 판정형·시점 표현 패턴으로 훑고, 걸린 195건을 읽었다.

**결과.**

- 재회·결혼·이혼·임신·합격·당첨 어휘: **0건**.
- 죽음·사고·재난·질병 어휘 10건은 전부 "~의 예언이 아님" 형태 안전 문구 또는 그림 설명의 부정형이다(죽음 oneLine, 검 4·검 10 oneLine, 탑·검 3·검 9 oneLine, 매달린 사람·검 10 그림 풀이). 건강·죽음을 예측하는 문장은 없다.
- 미래형 "~하게 될·돼요" 6건은 4건이 "~로 읽어요"·"수 있다"로 완충되어 있고, 나머지 2건(검 5 '잃게 될 관계를 적어 보세요', 완드 여왕 asFeelings '비교하게 돼요')도 결과 예언이 아니라 사용자 본인의 행동·감정을 안내하는 문장이라 표에는 올리지 않았다. "곧"은 "~이 곧 ~을 뜻하지는 않아요" 형태의 부정(헤르밋·검 4·컵 8)이라 오히려 안전하다.
- 반대로 "끝났다는 판정은 아니에요"(컵 5·검 10 두 사람 사이)처럼 부정 판정을 막는 문장이 이미 있다.
- 아래 7행은 사건·결과 단정에 가깝거나 같은 카드의 `cautions`와 결이 어긋난다. 모두 Low다.

| ID | 카드 | 필드 | 우리 문구 | 문제 | 심각도 | 제안 수정 (적용 안 함) |
|---|---|---|---|---|---|---|
| W-01 | 완드 6 | `topics.work.upright` | 「성과가 드러나고 평가나 승진처럼 인정의 순간이 오기 쉬운 흐름으로 읽어요.」 | '승진'이라는 구체 사건을 예로 듦("오기 쉬운"으로 완곡) | Low | '평가나 승진처럼'을 '평가·공유처럼'으로 일반화. |
| W-02 | 검 6 | `topics.work.upright` | 「부서 이동이나 이직처럼 더 나은 쪽으로 옮겨 가는 흐름으로 읽어요.」 | '이직'을 예로 들고 '더 나은 쪽'이라고 방향을 단정 | Low | '더 나은 쪽으로'를 '옮겨 갈 수도 있는'으로 완충하거나 '더 잔잔한 쪽'(그림 기준)으로. |
| W-03 | 완드 8 | `keywordsKo·core.upright[3] · topics.contact.upright` | 「도착 직전 / 연락이 오가고 대화가 빨리 이어질 수 있는 흐름으로 읽어요.」 | 같은 카드의 cautions(NO_EVENT '연락이 곧 온다고 보장', NO_DATE, NO_MIND)와 결이 어긋남. '도착 직전'은 곧 도착한다는 시점 암시 | Low | '도착 직전'을 '속도가 붙는 구간'으로, contact 문장은 '오가는 속도가 붙는 흐름(상대 응답은 단정하지 않음)'으로. |
| W-04 | 컵 9 | `keywordsKo·core.upright[1]` | 「바라던 것을 이룸」 | 완결된 결과 서술. 같은 카드의 cautions(NO_EVENT '소원이 이뤄진다고 보장')와 결이 어긋남. 현대 소스에도 같은 표현이 있음(wishes fulfilled 4/8) | Low | '바라던 것이 채워진 듯한 만족'처럼 상태 서술로. |
| W-05 | 검 3 | `topics.group.upright` | 「모임 안에서 상처가 되는 말이나 이별이 있는 흐름으로 읽어요.」 | '이별이 있는'이 사건 단정으로 읽힘(죽음·질병은 아님) | Low | '이별이나 멀어짐이 느껴지는 분위기로'. |
| W-06 | 검 10 · 탑 | `topics.choice.upright` | 「기존 선택지 하나가 확실히 끝난 배치로 읽어요. / 무엇이 확실히 끝났고 무엇이 남았는지부터 나눠 보세요.」 | '확실히 끝났다'는 판정형 어휘 2곳. 선택지 얘기라 재회·결혼과 직접 관련은 없으나 "끝났다는 판정은 아니에요"(컵 5·검 10 두 사람 사이)와 톤이 다름 | Low | '끝난 것처럼 느껴지는'으로 완충. |
| W-07 | 죽음 | `topics.love.reversed · positionHints.나의 마음.reversed` | 「무엇이 이미 끝났는지 솔직하게 적어 보세요. / 끝났다는 걸 알면서도 붙잡고 싶은 마음이 있어요.」 | 관계가 이미 끝났다는 전제를 깔고 있어, 재회를 묻는 사용자에게 부정 판정처럼 읽힐 수 있음 | Low | '끝났다고 느끼는 것이 있다면'처럼 전제를 사용자 쪽 느낌으로 돌리기. |

---

## 5. 13장 역방향 극성 판정

이전 점검(`tarot-kb-review-2026-10.md` 5.1)이 찾은 두 패턴이다. **P2**: PKT 역방향은 긍정인데 우리는 부정(6장). **P3**: PKT 역방향은 악화인데 우리 기본 모드 `waning`이 회복으로 읽음(7장). 현대 소스 6곳(BT·LB·AS·SY·TO·GD)의 역방향 키워드를 +(개선·긍정), −(악화·부정), ±(혼재)로 분류했고, 이전 조사의 예·아니오 합의(역방향 10곳)를 보조 신호로 붙였다. 판정 "현대=우리"는 우리 읽기와 같은 쪽이 6곳 중 4곳 이상(과반)일 때, "분열"은 그에 못 미칠 때다.

| 카드 | 패턴 | PKT 역방향(이전 점검) | 우리 기본 모드·읽기 | 현대 소스 극성 (BT·LB·AS·SY·TO·GD) | + / ± / − | 예·아니오 합의(역, 이전 조사) | 판정 |
|---|---|---|---|---|---|---|---|
| 운명의 수레바퀴 | P2 | 증가·풍족(긍정) | 막힘: 흐름이 멈춤·반복 | BT− LB− AS− SY− TO− GD− | 0 / 0 / 6 | lean-no (예 0·아니오 6·글쎄 4 / 10) | **현대=우리** |
| 여황제 | P2 | 빛·진실·엉킨 일이 풀림(긍정) | 과함: 과한 챙김·나를 비움 | BT− LB− AS− SY− TO− GD− | 0 / 0 / 6 | lean-no (예 1·아니오 5·글쎄 4 / 10) | **현대=우리** |
| 황제 | P2 | 자비·신용(긍정) | 과함: 통제·경직 | BT− LB− AS− SY− TO− GD− | 0 / 0 / 6 | no (예 0·아니오 7·글쎄 2 / 9) | **현대=우리** |
| 완드 3 | P2 | 고난·실망의 끝(긍정) | 막힘: 기다림이 길어짐 | BT− LB− AS− SY− TO− GD− | 0 / 0 / 6 | no (예 0·아니오 7·글쎄 3 / 10) | **현대=우리** |
| 완드 4 | P2 | 번영 그대로(긍정) | 약해짐: 축하가 작아지고 기반이 흔들림 | BT± LB− AS± SY− TO− GD− | 0 / 2 / 4 | split (예 3·아니오 4·글쎄 3 / 10) | **현대=우리** |
| 컵 8 | P2 | 큰 기쁨·잔치(긍정) | 막힘: 떠나지 못함 | BT− LB− AS− SY− TO− GD− | 0 / 0 / 6 | lean-no (예 1·아니오 6·글쎄 3 / 10) | **현대=우리** |
| 검 3 | P3 | 혼란·상실(악화) | 약해짐: 아픔이 옅어짐(속으로 삭임 병기) | BT+ LB+ AS± SY+ TO+ GD+ | 5 / 1 / 0 | lean-maybe (예 2·아니오 3·글쎄 5 / 10) | **현대=우리** |
| 검 5 | P3 | 정방향과 같음, 매장·장례(악화) | 약해짐: 화해의 틈(앙금 병기) | BT± LB± AS+ SY+ TO+ GD+ | 4 / 2 / 0 | lean-no (예 2·아니오 6·글쎄 2 / 10) | **현대=우리** |
| 검 8 | P3 | 불안·곤란·배신(악화) | 약해짐: 출구가 보임(두려움 커짐 병기) | BT± LB+ AS+ SY+ TO+ GD+ | 5 / 1 / 0 | lean-yes (예 6·아니오 2·글쎄 2 / 10) | **현대=우리** |
| 검 9 | P3 | 구속·의심·합당한 두려움(악화) | 약해짐: 불안이 옅어짐(곪는 불안 병기) | BT− LB± AS± SY+ TO+ GD+ | 3 / 2 / 1 | tie:maybe/no (예 2·아니오 4·글쎄 4 / 10) | **분열** |
| 펜타클 5 | P3 | 무질서·파멸·불화(악화) | 약해짐: 회복과 도움(깊어진 고립 병기) | BT± LB+ AS+ SY+ TO+ GD+ | 5 / 1 / 0 | lean-maybe (예 4·아니오 1·글쎄 5 / 10) | **현대=우리** |
| 완드 10 | P3 | 곤란·음모(악화) | 약해짐: 내려놓고 나눔(무너짐 병기) | BT± LB− AS± SY± TO+ GD+ | 2 / 3 / 1 | tie:maybe/no (예 2·아니오 4·글쎄 4 / 10) | **분열** |
| 악마 | P3 | 악한 숙명·무력·눈멂(악화) | 약해짐: 벗어날 틈(깊어진 집착 병기) | BT+ LB+ AS± SY+ TO+ GD− | 4 / 1 / 1 | yes (예 8·아니오 1·글쎄 1 / 10) | **현대=우리** |

**요약.**

- **현대 소스의 과반이 PKT 쪽으로 기운 카드는 0장이다.** P2 6장은 현대 소스에 긍정이 없고(수레바퀴·여황제·황제·완드 3·컵 8은 6곳 모두 −, 완드 4는 −4·±2) 우리 읽기와 같다. PKT의 "번영 그대로"에 해당하는 현대 문구는 없고, 완드 4에서 BT·AS가 말하는 '작고 내적인 축하'는 우리 `waning` 풀이("작고 소소하게 옴")가 이미 담고 있다.
- P3 7장 중 5장(검 3·검 5·검 8·펜타클 5·악마)은 현대 소스 과반이 회복·해방 쪽이라 우리 `waning` 기본 모드와 같다. 악마는 GD만 오히려 '중독·억압 지속'으로 읽는다(우리 `excess` 모드의 "집착이 더 깊어짐"과 통함). 검 5는 이전 조사의 예·아니오 합의가 "아니오"(6/10)로 반대였는데, 그 조사는 키워드가 아니라 답 분류라 방식이 달라 직접 비교하기 어렵고 키워드 소스 기준으로는 화해·해소 쪽이다.
- **분열인 2장(검 9, 완드 10)**: 어느 쪽도 과반이 아니고, 갈래 둘이 모두 소스에 있다. 우리 허용 모드(`internalized`·`excess`)가 PKT가 말한 악화 갈래를 이미 담고 있어 기본 모드만 `waning`이라는 점이 핵심이다. 과반이 PKT 쪽인 것은 아니다.
- 극성 외 지적: 검 3 역방향에서 용서·화해(4/6)가 빠졌다(M-09).

---

## 6. 패턴과 결정이 필요한 것

### 6.1 창작·영감 축이 약하다

"창작·영감" 주제가 지지 50% 안팎인데 core에 없거나 약한 곳이 **8장 9건**이다: 별, 여황제, 완드 시종, 완드 에이스, 완드 왕, 컵 3, 컵 시종, 컵 에이스. 완드·컵의 에이스·시종·왕에 많고 메이저 두 장(여황제·별)도 있다. 카드별로 따로 고치기보다 "창작 축을 공통 주제로 둘지"를 한 번에 정하는 편이 낫다.

### 6.2 속임·조종 축이 약하다

정의 역방향(부정직·부패 5/6), 검 왕 역방향(조종 4/6), 마법사 역방향(조종·속임·착각 6/6, 부분 반영), 검 7 역방향(자기 기만 3/6), 펜타클 왕 역방향(부패·착취 3/6)이다. 우리 문구는 사람을 의심하게 하지 않으려는 톤이라 의도일 수 있다. 사람을 지목하지 않고 '상황의 분위기'로 쓰는 완곡 표현 정책을 한 번 정하면 5장이 한꺼번에 닫힌다.

### 6.3 정책 때문에 의도적으로 뺀 항목 10건

해당 항목은 운명의 수레바퀴 정 행운·운, 전차 정 승리·성공, 태양 정 성공·성취, 컵 2 역 이별·분리·거절, 컵 10 역 관계 파탄·분리, 펜타클 에이스 역 불안정·금전 손실, 펜타클 에이스 정 번영·풍요·재물, 펜타클 9 역 금전 불안·차질, 펜타클 10 정 재물·풍요, 펜타클 왕 역 재정 관리 실패이다. 현대 소스는 이 주제를 지지 50~100%로 중심에 두는 곳이 많다(펜타클 10 재물은 8/8). `cautions`로 의도임이 보이므로 오류는 아니지만, 검수자가 오류로 오해하지 않게 해당 카드 `waite.noteKo` 등에 "의도적 생략(NO_MONEY 등)"을 적어 두길 권한다.

### 6.4 기본 모드가 현대 최상위 갈래와 다른 카드

- 검 2 역방향: 기본 `waning`(해소) vs 현대 미결정 지속 5/6. `blocked` 풀이는 "정보가 부족해"인데 현대는 정보 과다(3/6)다(M-08).
- 여황제 역방향: 기본 `excess`(과한 챙김) vs 현대 창작 막힘 4/6. `blocked` 풀이("키우던 일이 멈춘 듯 더디게")가 더 가깝다(M-01).
- 컵 7 역방향: 기본 `waning`(안개가 걷힘)만 있고, 혼란·도피가 이어진다는 갈래(4/6)는 허용 모드 `excess`에만 있다.

### 6.5 우리만 강조하고 현대 지지가 없는 표현(확인한 것만)

수레바퀴의 '타이밍'(keywordsKo·정·역·oneLine, 정 0/8·역 0/6), 황제 역방향 '책임 떠넘기기'(0/6), 완드 3 역방향 '혼자 다 하려 함'(0/6)이다. 해석 자체가 틀렸다는 뜻은 아니고, 현대 레퍼런스로는 뒷받침을 못 한다는 뜻이다. 전수 점검은 하지 않았다.

### 6.6 사람이 정해야 할 일

1. F-05 방향: PKT 근거(힘은 일반적 자신감과 무관)와 현대 합의(자기 의심 4/6) 중 어느 쪽을 core에 둘지. 정책이 "현대 의미 우선"이라면 되돌리거나 병기하는 편이 맞다.
2. 검 2 역방향 기본 모드.
3. 6.1·6.2의 공통 표현 정책.
4. 6.3의 `noteKo` 기록 방식.

### 6.7 후속 순서 제안

1. Medium 11행을 사람 시트에서 먼저 확인한다(대부분 core 한 줄 추가 수준).
2. 6.6의 정책 4건을 정한 뒤 해당 카드를 한꺼번에 고친다.
3. Low는 사람 검수가 끝난 카드부터 선택 반영한다.
4. 고친 카드는 이 점검과 PKT 점검을 다시 돌린다(소스 키워드는 임시 폴더에서 재수집해야 함).

---

## 7. 합의와 일치하는 카드

### 7.1 일치 (30장): 플래그 없음, 합의 주제를 직접 다룸

- 메이저 (9장): 바보, 여사제, 연인, 은둔자, 죽음, 절제, 탑, 심판, 세계
- 완드 (4장): 완드 5, 완드 7, 완드 10, 완드 기사
- 컵 (3장): 컵 4, 컵 6, 컵 여왕
- 검 (7장): 검 에이스, 검 5, 검 6, 검 8, 검 9, 검 기사, 검 여왕
- 펜타클 (7장): 펜타클 2, 펜타클 3, 펜타클 5, 펜타클 7, 펜타클 8, 펜타클 시종, 펜타클 여왕

### 7.2 대체로 일치 (37장): Low만 있음

- 메이저 (7장): 마법사, 황제, 전차, 매달린 사람, 악마, 달, 태양
- 완드 (9장): 완드 에이스, 완드 2, 완드 3, 완드 4, 완드 6, 완드 8, 완드 시종, 완드 여왕, 완드 왕
- 컵 (11장): 컵 에이스, 컵 2, 컵 3, 컵 5, 컵 7, 컵 8, 컵 9, 컵 10, 컵 시종, 컵 기사, 컵 왕
- 검 (3장): 검 4, 검 7, 검 10
- 펜타클 (7장): 펜타클 에이스, 펜타클 4, 펜타클 6, 펜타클 9, 펜타클 10, 펜타클 기사, 펜타클 왕

### 7.3 확인 필요 (11장): Medium이 있음

- 메이저 (6장): 여황제, 교황, 힘, 운명의 수레바퀴, 정의, 별
- 완드 (1장): 완드 9
- 컵 (0장): -
- 검 (4장): 검 2, 검 3, 검 시종, 검 왕
- 펜타클 (0장): -

---

## 부록 A. 카드별 요약 (78장)

상위 3개 합의 라벨(영어 짧은 라벨, 지지 수/소스 수)과 플래그 ID다. 플래그 ID 끝의 u는 정방향, r은 역방향이다. 카드별 전체 주제와 소스 코드는 짝 JSON에 있다.

| 카드 | id | 상태 | 정방향 합의 상위 3 | 역방향 합의 상위 3 | 플래그 |
|---|---|---|---|---|---|
| 바보 | `major-00-fool` | 일치 | new beginnings 7/8 · spontaneity 6/8 · freedom / free spirit 6/8 | recklessness / carelessness 6/6 · hesitation / holding back / self-doubt 5/6 · naivety / foolishness 3/6 | - |
| 마법사 | `major-01-magician` | 대체로 일치(Low) | power / willpower 7/8 · manifestation 6/8 · action 5/8 | manipulation / deception / illusion 6/6 · wasted / untapped talent 4/6 · distraction / scattered 4/6 | M-12r |
| 여사제 | `major-02-high-priestess` | 일치 | intuition / inner voice 7/8 · mystery / hidden knowledge 7/8 · subconscious 5/8 | secrets / hidden motives 6/6 · disconnected from intuition / repression 6/6 · confusion / superficiality 4/6 | - |
| 여황제 | `major-03-empress` | 확인 필요(Medium) | abundance 8/8 · nurturing / mothering 7/8 · fertility / growth 5/8 | creative block 4/6 · dependence on others 4/6 · neglect / self-neglect 4/6 | M-01r, M-13u |
| 황제 | `major-04-emperor` | 대체로 일치(Low) | authority 8/8 · structure / order 7/8 · stability / protection 4/8 | rigidity / stubbornness 6/6 · domination / excessive control 6/6 · lack of discipline / chaos 5/6 | M-14u |
| 교황 | `major-05-hierophant` | 확인 필요(Medium) | education / knowledge / mentoring 7/8 · tradition / convention 6/8 · belief / spirituality 6/8 | rebellion / challenging convention 6/6 · dogma / restriction / misguidance 5/6 | M-02u, M-15r |
| 연인 | `major-06-lovers` | 일치 | love / romance / passion 7/8 · relationship / partnership / union 7/8 · harmony / balance / values alignment 7/8 | disharmony / imbalance 6/6 · conflict 4/6 · indecision / avoiding choice 4/6 | - |
| 전차 | `major-07-chariot` | 대체로 일치(Low) | victory / success 7/8 · willpower / determination 6/8 · control / self-discipline 5/8 | obstacles / stagnation / defeat 6/6 · lack of direction 5/6 · aggression / forcefulness 3/6 | M-16u |
| 힘 | `major-08-strength` | 확인 필요(Medium) | inner strength / power 8/8 · compassion / gentleness 7/8 · courage 5/8 | raw emotion / forcing / impatience 5/6 · self-doubt / insecurity 4/6 · low energy / weakness / passivity 4/6 | M-03r |
| 은둔자 | `major-09-hermit` | 일치 | solitude / withdrawal 8/8 · introspection / self-reflection 7/8 · guidance / wisdom / seeking 6/8 | isolation / loneliness / withdrawal 5/6 · lost direction / stagnation 2/6 · returning to society 1/6 | - |
| 운명의 수레바퀴 | `major-10-wheel-of-fortune` | 확인 필요(Medium) | change / turning point 8/8 · cycles 7/8 · destiny / fate / karma 6/8 | resists change / clings 6/6 · bad luck / setbacks 5/6 · repeating patterns / stuck 4/6 | M-04u |
| 정의 | `major-11-justice` | 확인 필요(Medium) | fairness / balance 8/8 · truth / honesty / clarity 7/8 · cause and effect / consequences 5/8 | unfairness / injustice / bias 6/6 · dishonesty / corruption 5/6 · avoiding accountability 3/6 | M-05r, M-17u |
| 매달린 사람 | `major-12-hanged-man` | 대체로 일치(Low) | new perspective 7/8 · pause / suspension / waiting 7/8 · surrender / letting go 5/8 | stalling / delay / stagnation 5/6 · resistance / resisting surrender 5/6 · indecision 3/6 | M-18r, M-19u |
| 죽음 | `major-13-death` | 일치 | endings / conclusion 7/8 · transition / change 7/8 · transformation / renewal 6/8 | resistance to change / endings 6/6 · stagnation / stuck / decay 5/6 · holding on / unable to let go 4/6 | - |
| 절제 | `major-14-temperance` | 일치 | balance / harmony 8/8 · moderation 5/8 · patience 4/8 | imbalance / excess / extremes 6/6 · discord / friction / volatility 4/6 · impatience / hastiness 3/6 | - |
| 악마 | `major-15-devil` | 대체로 일치(Low) | bondage / feeling trapped 8/8 · addiction / attachment 5/8 · materialism 4/8 | release / freedom / breaking free 5/6 · reclaiming power / control 4/6 · awareness / revelation 3/6 | M-20u |
| 탑 | `major-16-tower` | 일치 | sudden change / upheaval 8/8 · destruction / collapse / downfall 6/8 · revelation / awakening 5/8 | resisting / fear of change / avoidance 6/6 · averting / delaying the inevitable 5/6 · rebuilding / transformation 2/6 | - |
| 별 | `major-17-star` | 확인 필요(Medium) | hope / optimism 8/8 · renewal / rejuvenation 5/8 · healing 4/8 | despair / lost hope / discouragement 6/6 · disconnection 5/6 · lack of faith 4/6 | M-06r, M-21u |
| 달 | `major-18-moon` | 대체로 일치(Low) | subconscious / dreams / imagination 8/8 · illusion / fantasy 7/8 · intuition / instinct 5/8 | confusion / volatility 4/6 · release of fear 3/6 · clarity / truth surfacing 3/6 | M-22u |
| 태양 | `major-19-sun` | 대체로 일치(Low) | success / accomplishment 7/8 · joy / happiness / positivity 6/8 · vitality / energy 6/8 | dimmed joy / sadness 5/6 · excessive optimism / hubris 4/6 · pessimism 3/6 | M-23r, M-24u |
| 심판 | `major-20-judgement` | 일치 | rebirth / renewal 8/8 · calling / purpose 6/8 · self-evaluation / reckoning 6/8 | self-doubt / self-criticism 5/6 · stuck in the past 4/6 · ignoring the call / denial 3/6 | - |
| 세계 | `major-21-world` | 일치 | integration / wholeness 8/8 · completion / culmination 7/8 · achievement / accomplishment 6/8 | lack of closure / incompletion 5/6 · delays / delayed culmination 5/6 · shortcuts 2/6 | - |
| 완드 에이스 | `wands-01` | 대체로 일치(Low) | creativity / creative spark 7/8 · inspiration 6/8 · new beginning / opportunity 6/8 | delays / false start 4/6 · hesitation / indecision / doubt 4/6 · creative blocks 4/6 | M-25u |
| 완드 2 | `wands-02` | 대체로 일치(Low) | planning / future vision 6/8 · decisions / options 5/8 · discovery / expansion / aspiration 5/8 | fear of the unknown / risk 5/6 · poor / lack of planning 5/6 · indecision / not acting 4/6 | M-26r |
| 완드 3 | `wands-03` | 대체로 일치(Low) | exploration / opportunities 7/8 · expansion / growth 6/8 · foresight / looking ahead 6/8 | delays 5/6 · obstacles / lack of progress 4/6 · frustration / disappointment 4/6 | M-27u |
| 완드 4 | `wands-04` | 대체로 일치(Low) | celebration 8/8 · community / belonging 5/8 · home / homecoming 5/8 | instability / shaky foundation 4/6 · conflict 4/6 · lack of support / unwelcome 3/6 | M-28r |
| 완드 5 | `wands-05` | 일치 | conflict / disagreement 8/8 · competition 7/8 · tension / friction 7/8 | avoiding conflict 6/6 · resolution / cooperation / compromise 5/6 · inner conflict 3/6 | - |
| 완드 6 | `wands-06` | 대체로 일치(Low) | success / victory / triumph 8/8 · recognition / acclaim 7/8 · confidence / pride 6/8 | fall from grace / failure 5/6 · lack of recognition 4/6 · egotism / hubris / pride 4/6 | M-29r |
| 완드 7 | `wands-07` | 일치 | defense / protecting territory 6/8 · challenge / opposition / fighting 5/8 · perseverance / resilience 4/8 | giving up / yielding / defeat 5/6 · exhaustion / overwhelm 5/6 · lack of confidence / vulnerability 3/6 | - |
| 완드 8 | `wands-08` | 대체로 일치(Low) | speed / swift movement 8/8 · progress / action 7/8 · news / messages 4/8 | delays / slowdown 6/6 · frustration 3/6 · missed / lost messages 3/6 | M-30u |
| 완드 9 | `wands-09` | 확인 필요(Medium) | resilience / persistence / stamina 7/8 · boundaries / defensiveness 5/8 · courage / strength 3/8 | exhaustion / burnout / struggle 5/6 · defensive / rigid / paranoid 5/6 · giving up 4/6 | M-07r |
| 완드 10 | `wands-10` | 일치 | burden / overload 8/8 · stress / exhaustion / burnout 7/8 · responsibility / duty 5/8 | release / delegation / relief 5/6 · collapse / breakdown / burnout 4/6 · shouldering too much 3/6 | - |
| 완드 시종 | `wands-11` | 대체로 일치(Low) | enthusiasm / eagerness 7/8 · free spirit / confidence / courage 6/8 · adventure / exploration / discovery 5/8 | haste / impatience / restlessness 4/6 · stalled beginning / boredom 4/6 · lack of direction / scattered 3/6 | M-31u |
| 완드 기사 | `wands-12` | 일치 | passion / energy 7/8 · action / pursuit 5/8 · adventure / exploration 5/8 | haste / impatience / impulsiveness 5/6 · recklessness / volatility 4/6 · scattered / delays / frustration 4/6 | - |
| 완드 여왕 | `wands-13` | 대체로 일치(Low) | confidence 7/8 · determination / courage 6/8 · warmth / vibrancy / energy 4/8 | insecurity / low confidence 5/6 · demanding / selfish / ego 4/6 · jealousy 3/6 | M-32u |
| 완드 왕 | `wands-14` | 대체로 일치(Low) | leadership / direction 6/8 · vision 5/8 · creativity / inspiration 5/8 | domineering / tyranny / ruthlessness 5/6 · arrogance 4/6 · weak leader / self-doubt / unfulfilled vision 4/6 | M-33r, M-34u |
| 컵 에이스 | `cups-01` | 대체로 일치(Low) | love / affection / intimacy 7/8 · new beginning / renewal / awakening 6/8 · intuition / spirituality 5/8 | blocked / repressed emotions 6/6 · emptiness / emotional loss 3/6 · self-love / replenish self 3/6 | M-35u |
| 컵 2 | `cups-02` | 대체로 일치(Low) | attraction / romantic connection 8/8 · partnership / union 6/8 · harmony 4/8 | imbalance / disharmony 6/6 · break-up / separation / rejection 5/6 · miscommunication 4/6 | M-36r |
| 컵 3 | `cups-03` | 대체로 일치(Low) | friendship 8/8 · celebration / joy 7/8 · community / gatherings 6/8 | isolation / loneliness 6/6 · excess / overindulgence 4/6 · gossip / scandal 3/6 | M-37r, M-38u |
| 컵 4 | `cups-04` | 일치 | apathy / boredom / indifference 8/8 · contemplation / going within 7/8 · reevaluation 5/8 | renewed interest / new opportunity / motivation 4/6 · retreat / withdrawal 4/6 · depression / negativity / disappointment 3/6 | - |
| 컵 5 | `cups-05` | 대체로 일치(Low) | loss / grief / mourning 6/8 · regret 6/8 · disappointment / despair 6/8 | acceptance / moving on / seeing what remains 6/6 · forgiveness 3/6 · healing / recovery 2/6 | M-39r |
| 컵 6 | `cups-06` | 일치 | nostalgia / memories / the past 6/8 · childhood / innocence 5/8 · joy / comfort / healing 4/8 | stuck in / living in the past 6/6 · idealization / rose-tinted 3/6 · moving forward / growing up / independence 3/6 | - |
| 컵 7 | `cups-07` | 대체로 일치(Low) | illusion / fantasy / daydream 7/8 · choices / options / possibilities 6/8 · wishful thinking 5/8 | clarity / realism / seeing through illusion 4/6 · decision / focus / values 4/6 · lingering confusion / overwhelm / escapism 4/6 | M-40r |
| 컵 8 | `cups-08` | 대체로 일치(Low) | walking away / leaving behind 8/8 · search for deeper meaning 7/8 · disappointment / weariness 4/8 | stuck / unable to leave 5/6 · fear of change / avoidance 5/6 · indecision / unfinished 4/6 | M-41r |
| 컵 9 | `cups-09` | 대체로 일치(Low) | satisfaction / contentment 7/8 · pleasure / indulgence / luxury 6/8 · wishes fulfilled 4/8 | dissatisfaction / unfulfilled / inner lack 6/6 · greed / materialism / indulgence 4/6 · superficial / smug / arrogance 4/6 | M-42u |
| 컵 10 | `cups-10` | 대체로 일치(Low) | happiness / joy 8/8 · harmony / peace / alignment 6/8 · family / home 4/8 | disconnection / isolation 5/6 · disharmony / conflict / discord 5/6 · broken relationships / separation 5/6 | M-43r |
| 컵 시종 | `cups-11` | 대체로 일치(Low) | intuition 5/8 · emotional openness / expression / sensitivity 5/8 · creativity / imagination 4/8 | emotional immaturity 6/6 · insecurity / moodiness / oversensitivity 4/6 · escapism 3/6 | M-44r |
| 컵 기사 | `cups-12` | 대체로 일치(Low) | romance 6/8 · charm / grace / diplomacy 6/8 · imagination / idealism / creativity 6/8 | moodiness 4/6 · unrealistic expectations / promises 4/6 · disappointment / disillusionment 3/6 | M-45r, M-46u |
| 컵 여왕 | `cups-13` | 일치 | compassion / empathy / caring 8/8 · intuition 8/8 · emotional stability / depth 4/8 | co-dependence / neediness 4/6 · lack of boundaries 3/6 · insecurity / oversensitivity / fragile 3/6 | - |
| 컵 왕 | `cups-14` | 대체로 일치(Low) | emotional balance / composure 8/8 · diplomacy 7/8 · wisdom / counsel 5/8 | moodiness / volatility / turmoil 6/6 · emotional manipulation 5/6 · repressed emotions 4/6 | M-47u |
| 검 에이스 | `swords-01` | 일치 | logic / intellect / mental 8/8 · clarity 7/8 · breakthrough 6/8 | confusion / lack of clarity 6/6 · harsh words / hostility 2/6 · miscommunication / misinformation 2/6 | - |
| 검 2 | `swords-02` | 확인 필요(Medium) | stalemate / impasse 7/8 · difficult decisions / indecision 5/8 · avoidance / denial 5/8 | indecision continues / stalemate / hesitancy 5/6 · truth revealed / release / decision made 4/6 · information overload / confusion 3/6 | M-08r |
| 검 3 | `swords-03` | 확인 필요(Medium) | heartbreak 8/8 · emotional pain / hurt 6/8 · betrayal / separation / rejection 5/8 | healing / recovery / release 6/6 · forgiveness / reconciliation 4/6 · repressing / avoiding pain 2/6 | M-09r |
| 검 4 | `swords-04` | 대체로 일치(Low) | rest / relaxation / recuperation 7/8 · contemplation / meditation 7/8 · recovery / healing 3/8 | burnout / exhaustion 6/6 · restlessness / stress 3/6 · returning to action / re-entering 3/6 | M-48r, M-49u |
| 검 5 | `swords-05` | 일치 | conflict / dispute 8/8 · winning at all costs / hollow victory 5/8 · self-interest / selfishness 3/8 | reconciliation / resolution 6/6 · moving on / releasing 4/6 · lingering resentment / regret 3/6 | - |
| 검 6 | `swords-06` | 일치 | transition / change / passage 6/8 · moving on / leaving behind 5/8 · healing / recovery / relief 4/8 | resistance / stuck 6/6 · unfinished business / baggage 4/6 · returning to trouble / running away 2/6 | - |
| 검 7 | `swords-07` | 대체로 일치(Low) | sneaking / getting away 8/8 · deception / lies / betrayal 6/8 · strategy / resourcefulness / acting alone 6/8 | confession / truth revealed / exposure 4/6 · self-deceit / imposter syndrome 3/6 · conscience / regret 2/6 | M-50r |
| 검 8 | `swords-08` | 일치 | trapped / restricted 8/8 · helpless / powerless / victim 8/8 · self-imposed / negative thoughts 5/8 | freedom / release 5/6 · new perspective 4/6 · empowerment / taking control 3/6 | - |
| 검 9 | `swords-09` | 일치 | anxiety / worry 8/8 · despair / anguish 7/8 · nightmares / sleepless 5/8 | recovery / relief / easing 6/6 · facing fears / coping 4/6 · deep-seated fears / secrets 3/6 | - |
| 검 10 | `swords-10` | 대체로 일치(Low) | painful ending / loss / collapse 7/8 · pain / wounds / exhaustion 6/8 · betrayal 4/8 | recovery / regeneration / rising again 5/6 · resisting / avoiding the end 4/6 · despair / relapse 1/6 | M-51u |
| 검 시종 | `swords-11` | 확인 필요(Medium) | new ideas / learning / information 7/8 · curiosity 6/8 · communication / wit / expression 4/8 | scattered / haphazard / lack of planning 5/6 · haste / hasty words 4/6 · gossip 3/6 | M-10r |
| 검 기사 | `swords-12` | 일치 | intelligence / focus 6/8 · action / drive / charging ahead 5/8 · ambition 5/8 | impulsiveness / recklessness / haste 5/6 · restless / unfocused / scattered 4/6 · aggression / rude / verbal attacks 3/6 | - |
| 검 여왕 | `swords-13` | 일치 | clarity / clear judgment / discernment 7/8 · honesty / direct communication 6/8 · independence 4/8 | harshness / cruelty / criticism 4/6 · coldness 3/6 · bitterness / cynicism 3/6 | - |
| 검 왕 | `swords-14` | 확인 필요(Medium) | intellect / logic / clear thinking 8/8 · truth / integrity / ethics 6/8 · authority 5/8 | misuse / abuse of power / tyranny 6/6 · manipulation / dishonesty 4/6 · coldness / ruthlessness 4/6 | M-11r |
| 펜타클 에이스 | `pentacles-01` | 대체로 일치(Low) | new opportunity / start / seed 7/8 · prosperity / abundance / wealth 6/8 · manifestation 4/8 | missed opportunity 5/6 · lack of planning / foresight 4/6 · scarcity mindset 3/6 | M-52r, M-53u |
| 펜타클 2 | `pentacles-02` | 일치 | adaptability / flexibility 7/8 · balance / juggling / multitasking 6/8 · priorities / time management 6/8 | over-commitment / overwhelm 6/6 · disorganization / chaos 5/6 · imbalance 4/6 | - |
| 펜타클 3 | `pentacles-03` | 일치 | teamwork / collaboration 8/8 · skill / craftsmanship 5/8 · planning / implementation / effort 4/8 | lack of teamwork / misalignment 6/6 · working alone 3/6 · poor quality / mediocrity / lack of recognition 3/6 | - |
| 펜타클 4 | `pentacles-04` | 대체로 일치(Low) | security / stability / protection 7/8 · control 6/8 · saving / frugality / hoarding 5/8 | insecurity / loss / instability 4/6 · generosity / letting go / loosening 3/6 · spending / over-spending 3/6 | M-54r |
| 펜타클 5 | `pentacles-05` | 일치 | hardship / loss / scarcity 8/8 · isolation / left out 6/8 · worry 2/8 | recovery / improvement 6/6 · hope / new opportunity 3/6 · help accepted / welcomed 2/6 | - |
| 펜타클 6 | `pentacles-06` | 대체로 일치(Low) | giving and receiving 7/8 · generosity / charity 7/8 · support / help / community 3/8 | imbalance / inequality / one-sided 6/6 · strings attached 3/6 · debt 3/6 | M-55r |
| 펜타클 7 | `pentacles-07` | 일치 | long-term view / investment 6/8 · harvest / rewards / growth 6/8 · patience / perseverance 5/8 | impatience 5/6 · wasted effort / lack of reward 5/6 · setbacks / lack of growth / frustration 2/6 | - |
| 펜타클 8 | `pentacles-08` | 일치 | skill / craft / mastery 8/8 · diligence / hard work / dedication 7/8 · repetition / routine / detail 3/8 | tedium / burnout / lack of motivation 5/6 · perfectionism 4/6 · misdirected effort 4/6 | - |
| 펜타클 9 | `pentacles-09` | 대체로 일치(Low) | abundance / luxury / leisure 7/8 · self-sufficiency / independence 6/8 · earned success / rewarded efforts 4/8 | self-worth issues / dependence 5/6 · superficial / hollow success 4/6 · overwork / hustling 3/6 | M-56r |
| 펜타클 10 | `pentacles-10` | 대체로 일치(Low) | wealth / affluence / abundance 8/8 · long-term stability / foundations 7/8 · family 5/8 | financial failure / loss / debt 5/6 · instability / lack of security 5/6 · family disputes / conflicts 3/6 | M-57r, M-58u |
| 펜타클 시종 | `pentacles-11` | 일치 | learning / study / skill development 7/8 · opportunity / new ventures 5/8 · practicality / planning / goal oriented 5/8 | procrastination / lack of progress 5/6 · missed opportunities 4/6 · immaturity / irresponsibility 2/6 | - |
| 펜타클 기사 | `pentacles-12` | 대체로 일치(Low) | hard work / diligence 6/8 · patience / persistence / slow and steady 6/8 · routine / caution / realism 6/8 | stagnation / stuck 6/6 · boredom / dullness 3/6 · laziness / irresponsibility / inefficiency 3/6 | M-59r |
| 펜타클 여왕 | `pentacles-13` | 일치 | nurturing / caring 8/8 · providing / prosperity / security 7/8 · practical / down-to-earth 5/8 | self-neglect / depleted 5/6 · work-home imbalance 3/6 · selfishness / jealousy / greed 3/6 | - |
| 펜타클 왕 | `pentacles-14` | 대체로 일치(Low) | security / stability 8/8 · wealth / abundance / prosperity 5/8 · business / management / leadership 5/8 | greed / materialism / status obsession 6/6 · stubbornness / rigid control 4/6 · financial mismanagement / poor decisions 4/6 | M-60r |
