# 지금의 한 장 — GitHub 레퍼런스 조사 (2026-10-01)

대상: Starlog "지금의 한 장" (타로판 결정의 신. 질문 하나 -> 카드 한 장(정/역) -> 오라클 한 줄 + 기울기(go/wait/rethink) + 카드 그림에 근거한 이유).
방법: `gh search repos` / `gh search code` / `gh api`로 저장소를 직접 열어 읽고, README가 링크한 웹페이지는 원문 HTML을 받아 직접 파싱했다.
산출물: 이 문서 + `docs/research/tarot-yes-no-consensus.json` (78장 x 정/역 투표 집계). 다른 파일은 건드리지 않았고 커밋도 안 했다.

원칙 재확인: 남의 문장은 하나도 복사하지 않았다. JSON에는 카드별 yes/no/maybe 라벨(사실)과 출처 이름만 있다.

---

## 0. 한눈에 요약

- yes/no 합의: 소스 24개(GitHub 20 + 웹 4)를 카드 ID에 맞춰 파싱. 정방향은 카드당 20~24표(일부 소스는 대아르카나 22장만 제공), 역방향은 카드당 9~11표(정/역 둘 다 주는 10개 소스 + Backyard Banshee 2장).
- 정방향은 꽤 일치한다(소스별 평균 쌍별 일치율 0.67~0.84). 역방향은 거의 합의가 없다(0.42~0.59, DOGKA는 0.22로 별종). "역방향 = 뒤집기"는 소스마다 방식이 다르다.
- 우리 KB의 `reversedModes.default`가 시장 합의를 잘 예측한다(blocked 26장 중 25장, excess 23장 중 21장이 역방향 "no"). 즉 역방향 기울기는 투표 말고 우리 규칙으로 파생하는 게 맞다.
- 합의 원본 분포(정+역 156칸): yes 59(38%) / no 76(49%) / maybe 21(13%). maybe가 얇아서 `wait`을 maybe에서만 만들면 비어 보인다. no를 "지금은 아님(wait)"과 "다시 생각(rethink)"으로 쪼개야 한다.
- 답의 책류는 대부분 짧다(영어 4~5단어, 중국어 7자, 한국어 소라고둥 계열 평균 17자). 한국어 계열은 "판정, 이유" 콤마 구조가 압도적(50줄 중 46줄).
- 가장 쓸 만한 UX 레퍼런스: `tgzt2524/tarot-fortune-h5`(MIT, 부채꼴 선택 -> 빛기둥 -> 1.0초 플립 -> 결과 페이드인, 하루 1회 저장, 공유카드), `monzaemonnn/book-of-answers`(800ms 길게 누르기 + 타자기 효과).

---

## 1. 상위 참고 레포

(라이선스 "없음" = LICENSE 파일/GitHub 라이선스 메타 없음. 기본 저작권 유보로 간주. 최근 푸시일은 `gh repo view`의 pushedAt.)

### 1-A. yes/no 분류 데이터·코드

| 레포 | 라이선스 | 별 | 최근 푸시 | 쓸 만한 점 |
|---|---|---|---|---|
| [Tarotoo-com/tarotoo-tarot-dataset](https://github.com/Tarotoo-com/tarotoo-tarot-dataset) | MIT | 10 | 2026-09-19 | 78장 모두 `yes_no` + `yes_no_reversed`(3분류). 유일하게 구조화된 정/역 동시 제공. CSV/JSON/JSONL, npm/PyPI 패키지, 키워드·주제별(연애/커리어) 필드도 있음 |
| [pinardy/pocket-tarot](https://github.com/pinardy/pocket-tarot) | 없음 | 0 | 2026-08-02 | 손으로 조율한 `[정, 역]` 판정표(78장, maybe 포함). 역방향을 "뒤집기"가 아니라 완화(37 maybe / 34 no / 7 yes)로 다룬 가장 신중한 표. 판정 라벨을 부드럽게 표현하는 발상 |
| [Ngoc2204/tarot-reader](https://github.com/Ngoc2204/tarot-reader) | 없음 | 0 | 2026-08-17 | 카드마다 `upright.yesNo`, `reversed.yesNo` 분리 저장(베트남어 앱) |
| [Candychochin/Tarot](https://github.com/Candychochin/Tarot) | 없음 | 0 | 2026-04-08 | 정/역 각각 `yes_no`(영/미얀마어). 역방향은 대체로 뒤집기 |
| [theinlaoq/taro_night_arcana](https://github.com/theinlaoq/taro_night_arcana) | 없음 | 0 | 2026-08-18 | 78자 비트열 2개(정/역)로 판정 저장 + 길이 검증(`validation.py`). "카드당 정확히 한 답" 검증 패턴이 좋음 |
| [DOGKA/tarot-new](https://github.com/DOGKA/tarot-new) | 없음 | 0 | 2026-03-05 | 카드별 `clarityWeight`(2~30, 단호함 정도) + 정/역 `shortReason`이 "판정; 원인; 한마디" 3박자. 역방향이 거의 다 "조건부 예"라 소프트하다 |
| [luminuy/tarot-web](https://github.com/luminuy/tarot-web) | other(비상업 보호 라이선스) | 0 | 2026-09-29 | 카드당 verdict 하나만 두고 정/역은 본문·조건 문장만 바꾸는 설계. `YES_NO_TONE`으로 "기울기(leaning)" 라벨링 |
| [heronhouse111-spec/oracle-iching](https://github.com/heronhouse111-spec/oracle-iching) | 없음 | 0 | 2026-06-16 | `/api/yesno` 헤더 주석: verdict는 백엔드 규칙표가 결정하고 AI는 문장만 쓴다(같은 카드가 어떤 날은 yes, 어떤 날은 no가 되는 것을 방지) |
| [debjani6370/tarot-yes-no-game-html-css-js](https://github.com/debjani6370/tarot-yes-no-game-html-css-js) | 없음 | 0 | 2024-01-02 | 대아르카나 20장의 YES/NO/NEUTRAL 표(정방향만, Hanged Man·Judgement 없음). 취향이 강한 표(Death, Hermit이 YES) |
| [zlcjfalsvk/taro](https://github.com/zlcjfalsvk/taro) | 없음 | 0 | 2026-02-23 | 한국어 타로 앱. `yesOrNo` 필드가 "Yes/No/Maybe + 짧은 한국어 이유" 구조 (정방향만) |
| [hairbui76/supertarot](https://github.com/hairbui76/supertarot), [gokimedia/claude-skill-tarot](https://github.com/gokimedia/claude-skill-tarot)(MIT), [HoenMike/DiscordMikeBot](https://github.com/HoenMike/DiscordMikeBot), [kongliuli/IChing](https://github.com/kongliuli/IChing), [elachi/tarot-card-reader](https://github.com/elachi/tarot-card-reader), [smayankthakur/tdt-v1](https://github.com/smayankthakur/tdt-v1), [aaawrekng2/moonseed-sacred-ritual](https://github.com/aaawrekng2/moonseed-sacred-ritual) | 없음(deckaura만 MIT) | 0 | 2025-06 ~ 2026-09 | 정방향만 있는 78장 표(추가 투표용). 서로 74~84% 일치 |
| [Diabolist/Diabolist-Tarot](https://github.com/Diabolist/Diabolist-Tarot) | 없음 | 1 | 2024-04-17 | 정/역 표를 갖췄지만 스워드 줄 등에 복붙 오류가 보여 이상치(평균 일치율 0.67로 최저) |

웹 소스 4곳(사실 라벨만 기록, 전문 복사 없음): [Backyard Banshee](https://backyardbanshee.com/tarot/which-tarot-cards-mean-yes-or-no/)(사람이 쓴 원본 목록, Diabolist가 인용), [Tarotap](https://tarotap.com/en/blog/yes-or-no-tarot-list), [Dark Forest](https://darkforesttarotcards.com/blogs/news/yes-or-no-tarot-complete-guide), [Angelorum](https://angelorum.co/uncategorized/yes-no-meanings-all-78-tarot-cards/).

### 1-B. 답의 책 / 오라클

| 레포 | 라이선스 | 별 | 최근 푸시 | 쓸 만한 점 |
|---|---|---|---|---|
| [monzaemonnn/book-of-answers](https://github.com/monzaemonnn/book-of-answers) | 없음 | 0 | 2025-12-29 | 화면을 800ms 길게 눌러야 공개(진행 바), 타자기 효과, 햅틱, 직전 답 제외 랜덤 |
| [unilei/answer-book](https://github.com/unilei/answer-book) | 없음 | 4 | 2024-03-24 | 268줄(중국어 평균 6.8자/영어 4.3단어), 3초 가짜 로딩, "다 쓸 때까지 중복 없음"(소진형 백) |
| [IrisAndMimi/TheBook_of_Answers](https://github.com/IrisAndMimi/TheBook_of_Answers) | MIT | 0 | 2026-09-16 | Three.js 책, 탭 = 열기, "극속 모드"(애니메이션 생략), 답 아래 "해설" 토글, 자이로 기울기 |
| [redbson/The-Book-of-Answers](https://github.com/redbson/The-Book-of-Answers) | MIT | 2 | 2026-06-18 | 답을 5개 범주(전진/관찰/경고/탐색/성찰)로 분류 + 희귀도(Normal/Rare/Legendary) + 페이지 번호 + 저장 기록 |
| [Shaozrrr/book-of-answers-skill](https://github.com/Shaozrrr/book-of-answers-skill) | 없음 | 3 | 2026-04-14 | 출처 표기 답, 마지막 질문/답만 저장하는 최소 기억, 같은 질문 300초 중복 차단, 일일 운세, 3권 책 라우팅 |
| [K-ai-droid/The-school-of-answers](https://github.com/K-ai-droid/The-school-of-answers) | MIT | 3 | 2024-12-04 | 종이비행기 날아가는 연출 -> 답, 타자기, 효과음, `navigator.share` 공유 |
| [yujie-tao/the-book-of-answers](https://github.com/yujie-tao/the-book-of-answers) | 없음 | 6 | 2019-12-27 | 답 나오기 전 "기다림" 문장을 시간차로 띄우는 의식형 대기 |
| [sindpfla98/The-Answer-Book](https://github.com/sindpfla98/The-Answer-Book) | 없음 | 0 | 2025-11-12 | 한국어 소라고둥 계열 50줄. 평균 17자, 46줄이 "판정, 이유" 콤마 구조 |
| [parksb/magic-conch-shell](https://github.com/parksb/magic-conch-shell) | MIT | 6 | 2020-05-29 | 한국어 마법의 소라고둥. 결과가 6종(예/아니오/아무것도/둘 다 아님/언젠가/다시 물어봐) |
| [gracefy/answer-book-ai](https://github.com/gracefy/answer-book-ai) | 없음 | 2 | 2026-08-03 | AI 한 줄 답 + 다중 모델 폴백 + 빈 입력 흔들림 애니 + 질문 기록 검색/삭제 |
| [boostcampwm2023/web09-MagicConch](https://github.com/boostcampwm2023/web09-MagicConch) | 없음 | 24 | 2024-05-16 | 한국어 AI 타로 상담 "마법의 소라고둥". 인터랙티브 애니메이션 위주(코드 깊이는 안 봄) |

기준선: Magic 8-Ball은 20개 답이 긍정 10 / 중립 5 / 부정 5(위키백과 확인). 즉 50/25/25.

### 1-C. 오픈 라이선스 카드 의미 데이터셋 (목록만, 복사 안 함)

| 레포 | 라이선스 | 별 | 최근 푸시 | 내용 / 우리 KB에 도움 될 부분 |
|---|---|---|---|---|
| [Tarotoo-com/tarotoo-tarot-dataset](https://github.com/Tarotoo-com/tarotoo-tarot-dataset) | MIT | 10 | 2026-09-19 | 정/역 키워드(각 5개 안팎), 정/역 `love/career/spiritual`, `mood`, yes/no. 역방향 키워드와 주제별 분화 교차검증용 |
| [dariusk/corpora](https://github.com/dariusk/corpora) (`data/divination/tarot_interpretations.json`) | README에서 CC0 선언(GitHub 라이선스 메타는 없음) | 5112 | 2026-09-16 | 78장 keywords + meanings.light/shadow + fortune_telling. 단, 설명에 원출처가 다른 사람의 웹 가이드라고 적혀 있어 CC0 주장의 출처 정합성은 미확인 |
| [ekelen/tarot-api](https://github.com/ekelen/tarot-api) | 없음 | 408 | 2023-12-21 | Waite 「The Pictorial Key to the Tarot」(1911) 파싱본. 원문은 퍼블릭 도메인이지만 이 저장소 자체는 라이선스 없음. 정/역 의미 원문 대조용 |
| [searge/tarot](https://github.com/searge/tarot) | CC BY-SA 4.0 | 66 | 2026-01-31 | Pictorial Key XML + 영/우크라이나어 로케일. 상속(ShareAlike) 조건이 있어 우리 콘텐츠에 섞으면 위험 |
| [metabismuth/tarot-json](https://github.com/metabismuth/tarot-json) | MIT | 77 | 2019-06-27 | 이름·번호·아르카나·수트만 있는 최소 데이터. 의미 텍스트 없음 |
| [mixvlad/TarotCards](https://github.com/mixvlad/TarotCards) | MIT | 25 | 2026-09-23 | RWS 1909 등 퍼블릭 도메인 덱 스캔 + SOURCES.md(출처·상태 기록 방식이 모범적) |
| [abetusk/ResonatorVoyantTarot](https://github.com/abetusk/ResonatorVoyantTarot) | CC0 | 74 | 2022-08-03 | 생성형 카드 그림 실험(의미 데이터 아님) |
| [LindseyB/tarot-api](https://github.com/LindseyB/tarot-api) | MIT | 65 | 2026-06-09 | 기본 78장 API JSON(61KB) |
| [tarotpedia/tarotpedia.api](https://github.com/tarotpedia/tarotpedia.api) | CC0 | 3 | 2025-12-11 | `static/json/*.json`이 corpora와 같은 필드 구조라 파생 가능성이 높음. CC0 표기를 그대로 믿지 말 것 |

### 1-D. 카드 뽑기·공개 연출이 좋은 웹앱

| 레포 | 라이선스 | 별 | 최근 푸시 | 볼 점 |
|---|---|---|---|---|
| [tgzt2524/tarot-fortune-h5](https://github.com/tgzt2524/tarot-fortune-h5) | MIT | 0 | 2026-07-30 | 한 장 뽑기 구조가 우리와 같다. 7장 부채꼴 + 호버 부유 -> 선택 -> 나머지 페이드아웃 -> 카드 중앙 이동 -> 빛기둥 -> 1.0초 플립 -> 결과 페이드인. 50% 역방향은 그림을 180도 회전 + 키워드 교체, 하루 1회 localStorage 저장(30일 정리), 공유 이미지(html2canvas), 햅틱 30/50ms |
| [VickRolL/tarot-daily](https://github.com/VickRolL/tarot-daily) | 없음 | 0 | 2026-09-22 | 오늘의 한 장. "오늘의 조언" 문구를 카드별 3~5개 두고 뽑는 순간 골라 저장(도감에서는 보이지 않게), 캔버스 공유카드, 이미지 유휴 프리페치, 첫 제스처 후 오디오 시작 |
| [renanbotasse/tarot](https://github.com/renanbotasse/tarot) | 없음 | 5 | 2026-03-07 | 부채꼴에서 직접 고르기 + 3D 플립, 측면 패널에 해석 누적, 모바일 바텀시트 |
| [deifactor/lost-purpose](https://github.com/deifactor/lost-purpose) | MIT | 19 | 2023-03-02 | 사용자가 넣은 문자열로 난수 시드(CRC32 + LFSR), 사람 셔플을 흉내 낸 청크 리플 셔플 |
| [lambiengcode/flutter-tarot-card](https://github.com/lambiengcode/flutter-tarot-card) | MIT | 79 | 2024-01-08 | 랜덤 카드 픽커(플러터) 참고 |
| [solochen/tarot-card](https://github.com/solochen/tarot-card) | 없음 | 57 | 2023-06-01 | 셔플/선택/플립 애니메이션 GIF 3종(안드로이드) |
| [zlZayn/Tarot](https://github.com/zlZayn/Tarot) | MIT | 4 | 2026-09-29 | Three.js 3D 카드 + 드래그 브라우징 |
| [dreamhunter2333/chatgpt-tarot-divination](https://github.com/dreamhunter2333/chatgpt-tarot-divination) | MIT | 922 | 2026-09-30 | 가장 인기 있는 AI 점술 웹앱(채팅형). 코드는 이번에 깊게 보지 않음 |

---

## 2. yes/no 합의 방식과 결과

### 2-1. 방식

1. 소스별 파서를 짜서 카드명을 우리 ID(`major-NN-slug`, `wands|cups|swords|pentacles-01..14`, 11=Page 12=Knight 13=Queen 14=King)로 정규화. ID 78개가 `content/kb/cards/*.json` 파일명과 정확히 일치하는 것을 확인했다.
2. 라벨을 yes / no / maybe로 통일. 소스별 특수 처리:
   - DOGKA: 문장 첫 단어(Evet=yes, Hayir=no, Belirsiz=maybe, "조건부 예"=maybe로 처리). 역방향이 거의 다 조건부 예라서 maybe가 부풀어 있다.
   - IChing: unknown -> maybe. Candy: "Maybe / Wait" -> maybe.
   - Angelorum: 역방향이 "= NO" 접미 형식. 예외 라벨 4개(Lovers, Hermit, Hanged Man, Seven of Pentacles)는 원문 확인 후 수동 매핑.
   - Backyard Banshee: Justice/Judgement는 "Maybe = 방향에 따라 다름"으로 적혀 있어 정 yes / 역 no로 기록.
   - theinlaoq: 이진(yes/no)만 있음.
3. 제외한 것: Pornput0012/tarot-wisdom(supertarot과 공유 22장이 100% 동일), rafael-men/...machine-learning(Tarotoo 원본의 바이트 동일 복사), rbk639(인덱스 홀짝으로 yes/no 배정), 클릭마다 Math.random으로 yes/no를 뽑는 데모들(AveryHill1717, d33t-ya, Jana33649), 달의 위상·정방향 개수 등 규칙 기반이라 정적 표가 없는 것들. 이유는 JSON `_meta.excluded`에 남겼다.
4. 라벨: 상위 표 비율 share가 0.70 이상이면 그 라벨, 0.50~0.70이면 `lean-`, 동률은 `tie`, 0.50 미만은 `split`. yes와 no가 각각 25% 이상이면 `yesNoConflict`.

경고: 정방향 소스끼리 평균 일치율이 67~84%(대부분 74% 이상)로 높은 건 "독립 확인"이 아니라 하나의 통념(canon)을 여럿이 반복하기 때문일 가능성이 크다(LLM 시대 데이터셋이 많음). 투표수는 참고 지표일 뿐이다. 가장 다른 시각은 Diabolist(0.67)와 Backyard Banshee(0.74) 같은 사람 손 목록이다.

### 2-2. 정방향 결과 (78장)

- 합의 라벨: yes 45 / lean-yes 4 / maybe 2 / lean-maybe 9 / tie 1 / no 13 / lean-no 3 / split 1 (합계 78).
- 표 다수 기준: yes 51 / maybe 11 / no 16. 수트별로는 완드 11 yes, 컵 10 yes, 펜타클 10 yes, 소드는 yes 5 / maybe 3 / no 6으로 소드만 no가 많다. 코트 16장은 yes 15 / maybe 1로 거의 다 yes.
- 5번 카드는 4개 수트 모두 no(4/4), 6번은 4수트 모두 yes(4/4). 이런 랭크 규칙은 공개 표에서 가장 안정적이다.
- 거의 만장일치(share 0.9 이상)인 카드: 46장 (JSON에서 `share >= 0.9`로 확인 가능).

정방향에서 의견이 갈리는 카드(share 0.7 미만 18장, y/n/m 표수, n은 대아르카나 23~24 / 소아르카나 20):

| 카드 | y/n/m | 합의 |
|---|---|---|
| major-05-hierophant | 14/0/10 | lean-yes |
| major-09-hermit | 1/7/16 | lean-maybe |
| major-11-justice | 12/0/12 | tie(yes/maybe). 일부 원문은 "정방향 yes, 역방향 no"로 방향 의존이라고 설명 |
| major-12-hanged-man | 2/8/13 | lean-maybe |
| major-18-moon | 0/14/10 | lean-no |
| wands-02 | 12/0/8 | lean-yes |
| wands-07 | 9/5/6 | split (가장 갈림) |
| wands-09 | 6/4/10 | lean-maybe |
| cups-04 | 2/13/5 | lean-no |
| cups-07 | 1/6/13 | lean-maybe |
| cups-08 | 3/13/4 | lean-no |
| swords-02 | 0/8/12 | lean-maybe |
| swords-04 | 2/7/11 | lean-maybe |
| swords-11 | 4/3/13 | lean-maybe |
| swords-12 | 11/5/4 | lean-yes (yes/no 충돌) |
| swords-13 | 11/3/6 | lean-yes |
| pentacles-04 | 4/6/10 | lean-maybe |
| pentacles-07 | 5/3/12 | lean-maybe |

### 2-3. 역방향 결과

- 정/역 표를 갖춘 소스 10개(Diabolist 1장, Angelorum 3장은 역방향 누락) + Backyard Banshee 2장(Justice, Judgement). 카드당 n은 9~11.
- 합의 라벨: no 37 / lean-no 18 / lean-maybe 10 / yes 2 / lean-yes 5 / tie 4 / split 2. 표 다수 기준 no 60 / maybe 10 / yes 8.
- 역방향에서 yes가 표 다수인 카드: Devil(8/1/1), Sun(7/1/2), Moon(5/2/3), Four/Five/Seven of Cups(6/1/3, 5/1/4, 5/2/3), Eight of Swords(6/2/2). 정방향이 부정적인 카드의 역방향은 "풀림"으로 읽혀 yes가 많고, Sun은 정/역 모두 yes라는 예외다. Ten of Swords는 4/3/3 split.
- 역방향에서 갈리는 카드(tie/split/충돌 7장): Strength(0/5/5), Four of Wands(3/4/3), Ten of Wands(2/4/4), Queen of Cups(cups-13: 0/5/5), Nine of Swords(2/4/4), Four of Swords(3/5/2), Ten of Swords(4/3/3).
- 소스별 "역방향 철학"이 다르다: 거의 뒤집기(theinlaoq 69/78, Diabolist 67/77, Candy 60/78), 완화(DOGKA와 Dark Forest는 maybe 중심, pocket-tarot는 maybe 37), 혼합(Tarotoo, Ngoc). 그래서 역방향 소스 간 일치율은 0.42~0.59에 불과하다.

### 2-4. 우리 KB와의 접점 (중요)

우리 카드 JSON의 `reversedModes.default`(blocked / internalized / excess / waning)를 역방향 합의와 교차했다.

| 우리 기본 모드 | 카드 수 | 역방향 표 다수 결과 |
|---|---|---|
| blocked | 26 | no 25, maybe 1 |
| excess | 23 | no 21, maybe 2 |
| waning | 23 | yes 8, no 11, maybe 4. 정방향이 no인 카드(12)는 yes 6 / maybe 3 / no 3, 정방향이 yes인 카드(8)는 no 7 / yes 1 |
| internalized | 6 | no 3, maybe 3 (정방향 no 카드는 maybe 2) |

해석: "막힘/과함이면 지금은 아님", "나쁜 것이 잦아드는 waning이면 풀림(yes 쪽)", "좋은 것이 잦아드는 waning이면 아님"이 시장 통념과 잘 맞는다. 별도 투표표를 쓰지 않고도 정방향 기울기 x 역방향 모드로 역방향 기울기를 파생할 수 있다는 근거가 된다.

---

## 3. 답의 책 UX 패턴 (구조 / 길이 / 톤 / 무작위 / 의식 / 공유)

### 3-1. 답 한 줄의 구조와 길이

- 영어권: 평균 4~5단어(unilei 268줄 평균 4.3단어, 최대 14; yujie-tao 171줄 평균 4.7단어, 최대 11). 한 호흡에 읽히는 길이.
- 중국어: 평균 6.8자, 최대 16자(unilei).
- 한국어 소라고둥 계열: 평균 17자, 최대 23자. 50줄 중 46줄이 "판정, 이유" 콤마 구조(sindpfla98). 긍정어로 시작하는 줄 6개 / 부정어로 시작하는 줄 7개 / 기다림 표현(기다려, 천천히, 잠시, 나중 등)이 들어간 줄 12개(정규식 추정)로, 예/아니오보다 "기다림" 계열이 비중이 크다.
- DOGKA: 판정; 원인; 한마디 3박자, 평균 84자.
- Iris 책: 한 줄 답 + 작은 "해설"을 토글로 분리(결론만 보고 싶은 사용자 배려).
- 문형 편중(정규식 기반 추정): unilei 268줄 중 영어 기준 동사 원형(명령형) 시작 약 78줄(29%), yes/no/maybe 시작 11줄(4%), 부정어 포함 44줄(16%). 명령형이 가장 큰 덩어리라 톤이 한 방향으로 쏠린다.

### 3-2. 톤·종류 다양성

- 마법의 소라고둥(parksb)은 결과 6종: 예 / 아니오 / 아무것도 하지 마 / 둘 다 아니야 / 언젠가 / 다시 물어봐. 우리 go / wait / rethink에 대응하려면 `언젠가 = wait`, `아무것도 = wait 또는 rethink`, `둘 다 아니야 = rethink`.
- redbson 책: 답을 범주(전진 / 관찰 / 경고 / 탐색 / 성찰)로 분류하고 가중 선택 + 희귀도로 소소한 발견감을 준다.
- Shaozrrr: 답마다 "출처"를 붙여 신뢰감을 만든다(우리는 출처 대신 카드 그림 근거가 대응).

### 3-3. 랜덤 / 중복 방지

| 방식 | 출처 | 특징 |
|---|---|---|
| 직전 답만 제외 | monzaemonnn | 구현 가장 단순, 3번 뒤 반복 가능 |
| 소진형 백(다 쓸 때까지 중복 없음) | unilei | 이미 나온 인덱스 목록을 유지하다 전부 소진되면 리셋 |
| 같은 질문 300초 중복 차단 + 마지막 질문/답 저장 | Shaozrrr | 재추첨으로 답을 골라 뽑는 행동 억제 |
| 질문 문자열/센서 값으로 시드 | lost-purpose, redbson | "내 질문이 결과에 섞인다"는 서사, 재현 가능성 |
| 기록 저장 + 검색/삭제 | gracefy | 이력 기능 |

### 3-4. 의식(ritual) UX

- 길게 누르기 800ms + 진행 바 + 햅틱 + 200ms 뒤 타자기 공개(monzaemonnn).
- 3초 가짜 로딩(unilei), 시간차 "기다림" 문장(yujie), 종이비행기 날아가는 연출(K-ai).
- 부채꼴 7장 -> 선택 -> 빛기둥 -> 1.0초 플립 -> 결과 페이드인 stagger 0.15초, 햅틱 30ms / 50ms(tgzt2524). 코드의 duration/delay 합으로 본 추정치는 공개까지 약 2.5초 안팎.
- "극속 모드"로 연출 생략 옵션(Iris), 자이로 기울기(Iris).
- 오디오는 첫 사용자 제스처에서만 시작 가능(브라우저 정책)이라 "기본 켜짐"이 곧 "열자마자 소리"는 아니라는 메모(VickRolL).
- 카드 이미지 프리페치를 유휴 시간에(VickRolL).

### 3-5. 공유

- 결과 이미지 생성: html2canvas(tgzt2524), 캔버스로 카드 3레이어 재현한 세로 카드(VickRolL).
- 웹 공유 API 호출 후 폴백(K-ai).
- 저장 기록/페이지 번호(redbson)로 "내 기록" 서사.

---

## 4. 우리 DB/UX에 적용할 제안 (12개)

1. **wait는 maybe가 아니라 no를 쪼개서 채운다.** 합의 분포가 yes 38% / no 49% / maybe 13%라서 maybe만 wait로 쓰면 비어 보인다. 기본 매핑 yes=go, maybe=wait, no=rethink에서 no 중 "때가 아님/휴식/지연/막힘" 성격(Four of Swords, blocked 역방향 등)은 wait로 옮기고, "착각/과함/해가 되는 방향"(Seven of Swords, excess 역방향)은 rethink로 둔다. 정+역 156칸을 만든 뒤 go / wait / rethink 비율(예: 35~40 / 30 / 30)을 스크립트로 감사한다.
2. **역방향 기울기는 투표가 아니라 우리 규칙으로 파생한다.** 정방향 기울기 x `reversedModes.default`: (go, blocked) -> wait, (go, excess) -> rethink, (go, waning) -> wait, (go, internalized) -> wait/rethink, (rethink, waning) -> go 또는 wait(풀림), (rethink, blocked/internalized) -> wait 또는 rethink. 위 2-4 표가 근거다(blocked 25/26, excess 21/23이 no).
3. **합의 JSON은 원본이 아니라 감사용으로 쓴다.** CI 체크: 우리 기울기가 정방향 share >= 0.85 합의(예: Tower, Sun, Devil, Five 계열)와 반대이면 실패시키고, 갈리는 카드(정방향 18장, 역방향 7장)에는 `leanNote`(왜 이렇게 골랐는지 한 줄)를 필수로 요구한다.
4. **카드마다 `confidence`(high / medium / low)를 둔다.** 합의가 갈리는 카드는 low로 두고 이유 문장에 조건을 넣는다("이 카드는 물음의 성격에 따라 기울기가 바뀌어요" 식). Seven of Wands(9/5/6), Swords 11/12/13, Hierophant/Justice가 대표 사례. 과잉 단정을 막고 KB의 cautions(NO_EVENT 등)와도 맞는다.
5. **한 줄을 2단으로 나눠 저장한다.** `line`(10~22자, 한 호흡) + `reason`(40~80자, 1~2문장, 카드 `imagery.facts` id 참조) + 선택적 `actionHint`. 한국어 소라고둥 계열 평균 17자, 영어 4~5단어, Iris의 "해설 토글"이 이 구조의 근거. "그림에 근거"는 `imageFactRef` 필드로 강제하고 `commonMisdescriptions` 정규식으로 린트한다.
6. **카드당 한 줄 변형을 3개 이상 두고 문형 태그를 붙인다.** 태그 예: 명령 / 관찰 / 되묻기 / 그림 비유. unilei류가 명령형 29%로 쏠려 단조롭다는 관찰에서, 카드별로 최소 2가지 문형을 요구하고 전체 명령형 비율 상한(예: 40%)을 린트한다.
7. **중복 방지는 두 겹으로.** (a) 카드별 변형 소진형 백(모두 한 번씩 나오기 전 재등장 금지), (b) 최근 N=5개 줄 id를 localStorage에 저장해 직전과 같은 카드가 나와도 다른 변형을 고르기. monzaemonnn(직전 제외)만으로는 부족하고 unilei의 소진형이 더 낫다.
8. **같은 질문 재추첨 정책을 정한다(제품 결정 필요).** Shaozrrr는 같은 질문을 300초 막는다. 우리도 `seed = hash(사용자 + 정규화된 질문 + 날짜)`로 "오늘 이 질문의 답은 이미 나왔어요"를 보여줄지, 자유 재추첨을 허용할지 결정해야 한다. 재추첨이 자유로우면 "골라 뽑기"로 신뢰가 떨어진다.
9. **공개 연출 타이밍을 표준화한다.** 길게 누르기 0.8초(+ 진행 바 + 햅틱 30ms) -> 부채꼴 5~7장 중 선택 -> 플립 1.0초(+ 햅틱 50ms) -> 한 줄은 200ms 뒤 타자기 -> 이유/기울기는 페이드인 stagger 0.15초. 총 3초 안쪽. "빠르게 보기" 토글(Iris)과 `prefers-reduced-motion` 대응 필수. 역방향은 그림 180도 회전 + 정/역 문구 교체(tgzt2524)를 그대로 쓰되 키워드만 교체하지 말고 한 줄/이유까지 함께 교체.
10. **공유카드는 캔버스로 직접 그린다.** 카드 그림 + 한 줄 + 기울기 칩(go/wait/rethink 색) + 날짜만 담고 reason은 옵션으로 둔다(공유 시 개인 질문 노출 방지). 웹 공유 API를 쓰고 이미지 저장을 폴백으로. 이미지는 유휴 프리페치(VickRolL).
11. **기록은 로컬 우선.** `{date, cardId, reversed, lineId, lean}` 저장, 30일 자동 정리(tgzt2524). 서버에 질문 원문을 남기지 않는 설계를 기본값으로. 희귀 한 줄(Rare)이나 페이지 번호(redbson)는 재방문 동기로 쓸 수 있지만 의존을 부추기지 않는 선에서 선택 사항으로만 검토.
12. **표현은 "기울기"로.** luminuy식 "leaning" 라벨, pocket-tarot식 "지금은 아님" 톤처럼 no를 단정이 아니라 기울기로 말한다. 건강/금전/사건 질문에는 KB `cautions`(NO_HEALTH, NO_MONEY, NO_EVENT)를 그대로 적용해 예언 문구를 막는다. 한 줄 안에서 "반드시/절대"를 린트로 금지.

---

## 5. 라이선스 주의

- **라이선스 없음이 압도적**(위 yes/no GitHub 소스 20개 중 MIT는 Tarotoo와 gokimedia 2곳, luminuy는 비상업 보호 라이선스). 라이선스 없음은 "마음대로 써도 됨"이 아니라 기본 저작권 유보다. 그래서 라벨(사실)만 집계했고 코드·문장·데이터 파일은 가져오지 않았다.
- 웹 4곳은 전권 보유 페이지다. 각 카드의 yes/no/maybe 라벨만 기록했고 설명 문장은 저장하지 않았다.
- **Book of Answers 계열**: monzaemonnn은 README에서 스스로 Carol Bolt의 「The Book of Answers」 기반이라고 밝혔다. unilei, Iris, yujie는 출처 표기가 없지만 같은 유형의 짧은 문구 모음이라 출처가 불명확하다. Iris가 MIT여도 문구의 권리 출처는 확인되지 않는다. 문구는 참고하지 않고, 기존 답의 책/결정의 신과 비슷한 문장이 우리 DB에 섞이지 않도록 린트한다.
- **CC BY-SA**(searge/tarot)는 상속 조건이 있어 우리 콘텐츠에 섞지 않는다.
- **CC0 표기 주의**: dariusk/corpora의 CC0는 README 선언이고 설명에 원출처가 다른 사람의 웹 가이드로 적혀 있어 정합성 미확인. tarotpedia도 같은 구조라 재검증 필요.
- **Waite 「Pictorial Key」(1911)** 원문과 **RWS 1909 그림**은 퍼블릭 도메인이라고 여러 저장소가 명시한다(mixvlad SOURCES.md 등). 다만 그 파싱·번역·주석은 각 저장소의 권리가 별도다. 우리 KB는 이미 자체 문장을 쓰고 있어 이 원칙을 유지한다.
- Tarotoo(MIT)도 "목록만"이라는 규칙에 따라 텍스트는 가져오지 않는다. 쓴다면 저작권 표시(MIT 고지)가 필요하다.

---

## 6. 한계와 검증 범위 (솔직하게)

- GitHub 코드 검색은 분당 10건 제한이라 후보 일부가 누락됐을 수 있다. 여기 나온 것은 "찾은 것"이지 GitHub 전체 조사가 아니다.
- 24개 소스를 스크립트로 파싱했고, 카드 몇 장(Three of Swords, The Sun, Four of Cups 등)은 원본 줄과 대조했다. 그러나 78x2x24 전체를 사람이 대조한 것은 아니다. 수동 매핑은 Angelorum 4장, Candy High Priestess, Backyard Banshee Justice/Judgement/Ace of Pentacles, DOGKA "조건부 예"이며 모두 JSON `_meta.sources.*.note`에 남겼다.
- Backyard Banshee 목록은 WebFetch 요약이 아니라 원문 HTML을 직접 파싱했다(요약본은 신뢰하지 않았다).
- 한국어권 오픈소스 답의 책은 소라고둥 계열 소품이 대부분이라 표본이 작다. "결정의 신" 자체의 오픈소스는 찾지 못했다.
- 정방향 소스 다수가 하나의 통념을 반복했을 가능성이 있어 표수 = 신뢰도가 아니다(2-1 경고 참고).
