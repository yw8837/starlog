# 해석·분석 빈틈 점검: 오픈소스 점술 엔진 대조 (2026-10)

- 작성: 2026-10-07 (조사 에이전트 작성, 하네스가 파일 쓰기를 막아 메인 세션이 그대로 저장)
- 질문: 사장님이 모은 오픈소스 점술 저장소와 견줘, 우리 사주·타로의 해석·분석에 더해야 할 것이 있나?
- 대상: 모델에 넘기는 "계산된 사실" 층(사주 FactSet, 궁합 PairFacts, 신년 YearFacts, 타로 cards·spread_facts). 문체·UI·가격은 범위 밖이다.
- 이 점검에서 코드와 콘텐츠는 고치지 않았다.

## 요약

1. **고칠 것 하나(버그 위험)**: 지장간 역할 이름이 辰·戌·丑·未 네 지지에서 한국 엔진들과 반대로 붙는다(우리: 辰의 乙=중기·癸=여기 / ssaju·orrery: 乙=여기·癸=중기). 모델이 이 이름을 본문에 옮겨 쓴다. §3 B1.
2. **출시 전에 넣을 만한 것**: 월운(이번 달·다음 달), 세 글자 삼합·방합(원국 안 + 대운·세운으로 완성), 세운↔대운 천간 관계와 "같은 글자" 관계, 보정 23시대 출생의 다른 관법 일주 알림, 타로 스프레드 사실 수정(궁정 번호 충돌)·10장/5장 원소 관계. 모두 결정적이고 정의가 합의된 사실이며, 하나하나 공수가 작다(§2).
3. **넣지 않는 것이 맞는 것**: 신살 대부분, 공망의 '뜻', 암합, 형의 하위 이름, 지장간 가중치, 명궁·태원, 신강약·용신·격국, 연도별 점수, 타로 시기 대응. 저장소끼리, 심지어 한 저장소 안에서도 기준이 갈린다(근거는 §1 각 행).
4. 우리 12운성 계산은 orrery 120칸 표와 0건 차이, 타로 KB의 점성 대응 58장은 골든 던 데칸 표와 0건 차이로 직접 확인했다.

---

## 0. 방법

### 0.1 우리 쪽에서 읽은 것

- 사주: `apps/web/lib/ai/prompts/saju.ts`(FactSet·관계·프롬프트), `sajuTopics.ts`, `match.ts`, `newyear.ts`, `packages/core/src/saju/{chart,labels,policy}.ts`, `packages/core/src/bonds/score.ts`, `apps/web/lib/sajuCriteria.ts`, 가이드 `apps/web/lib/guide-articles/saju-concepts.ts`, 기존 조사 `docs/research/saju-engine-eval.md`·`saju-reading-quality.md`·`saju-calendar-crosscheck-2026-10.md`
- 타로: `content/kb/README.md`, `content/kb/cards/*.json`(78장 필드 채움 현황 집계), `apps/web/lib/ai/prompts/{tarot,deepTarot,match}.ts`, `packages/core/src/tarot/{cards,templates}.ts`

### 0.2 대조한 저장소 (`gh api`로 README·소스 일부 열람, 코드 복사 없음)

| 저장소 | 라이선스 | 읽은 것 | 이 점검에 쓴 점 |
|---|---|---|---|
| rath/orrery | AGPL-3.0 | `packages/core/src/{types,pillars,constants,saju}.ts` | 한국식 엔진. 지장간 표(여기→중기→정기 순), 삼합·방합, 원진·귀문, 신살 10종, 12신살(연지 기준), 공망, 좌법·인종법, 월운·일운 트랜짓, 통자시 기본값 |
| Brhiza/mingyu | AGPL-3.0 | `packages/core/README.md`, `bazi/baziShenSha/{variants,scope}.ts`, `ganzhi/relations.ts`, `bazi/fortuneTriggerEvidence.ts`, `bazi/compatibilityEvidence.ts`, `divination/tarot-evidence.ts` | 신살 변형 설정(공망 기준·양인), 암합 3쌍, 세운·대운 층 비교(병림·복음·천극지충·삼합 완성), 궁합 교차 삼합·양방향 십성, 타로 이웃 카드 원소 관계 |
| hhszzzz/taibu | 루트 AGPL-3.0-only, `packages/core` MIT | `packages/core/src/domains/bazi/{types,calculate}.ts`, `domains/tarot/calculate.ts`, `data/ganzhi.ts` | 지장간 역할 라벨(우리와 같음), 반합은 셋째 글자가 없을 때만, 방합, 태원·명궁 공식, 월운·일운, 타로 생일 카드 |
| ChesterRa/mingpan | Apache-2.0 | `README.md`, `src/core/constants/bazi.ts`, `src/core/bazi/{BaziCore,TrueSolarTime}.ts`, `src/services/bazi/analyzers/RelationsAnalyzer.ts`, `calculators/{LiuNian,LiuYue}Calculator.ts` | "사실만" MCP. 납음·자좌 12운성·旬空·명궁·태원, 지장간 가중치, 진태양시(균시차) |
| rokoss21/bazi-lib | Apache-2.0 | `README.md`(저장소에 소스 없음: 트리가 LICENSE·README뿐) | 기능 주장만 확인 가능(신살, 납음, 0~100 궁합 점수, 건강) |
| miounet11/life-kline | Apache-2.0 | `README.md`, `constants.ts`(프롬프트) | 연도별 점수를 LLM이 생성하는 반례 |
| Renhuai123/ziwei-doushu | MIT | `lib/ziwei/true-solar-time.ts`(역법·시각 부분만) | 경도+NOAA 균시차, 야자시 규칙 4종 |
| Horace-Maxwell/horosa-skill | AGPL-3.0 | 파일 트리, `tarot/engine/{dignities,timingMethods}.js`, `tarot/decks/courtSystems.js` | 원소 위계 두 판(modern/Mathers), 궁정 체계 여러 벌, 시기 판정 다섯 방식 |
| mdnm/kaabalah | AGPL-3.0 | `README.md`, `src/tarot/{index,spreads}.ts` | 카발라 대응(히브리 문자·생명나무 경로), 수비학 |
| krates98/tarotcardapi | 없음 | `README.md`, 파일 트리 | 카드 이름·설명·이미지 API. 분석 없음 |
| gokimedia/awesome-tarot | 없음 | `README.md` | deckaura 운영 링크 모음(생일 카드·조합 계산기 링크) |
| golbin/ssaju (목록 밖, 교차 확인용) | MIT | `src/constants.ts` | 한국식 지장간 역할 이름(B1 근거) |

### 0.3 직접 돌린 확인 (스크래치패드 스크립트, 프로젝트 파일 수정 없음)

| 확인 | 결과 |
|---|---|
| 우리 `twelveStage`(saju.ts:68-73) vs orrery `METEOR_LOOKUP` 120칸 | 차이 0건 |
| KB `attributions.astrology` 58장(메이저 22, 숫자 카드 36) vs 골든 던 데칸 표(칼데아 순서) | 차이 0건. 에이스·궁정 20장은 null(공부용 층이라 문제 아님) |
| 타로 생일 카드 축약 두 방식(taibu식 자리합 vs 월+일+연 합), 1960-01-01~2009-12-31 18,263일 | 5,008일(27%)에서 다른 카드. 예: 1960-01-09 → 8(힘) vs 17(별) |
| 무작위 추첨 20만 회: 메이저 11~14와 궁정 카드가 "같은 번호"로 묶이는 비율 | 3장 1.6%, 10장 19.4%. 궁정 카드가 한 장 이상 나와 내부 번호(11~14)가 보이는 비율 3장 50.2%, 10장 91.6% |

---

## 1. 빈틈 표

권고: **ADD** = 결정적이고 널리 합의되며 실제 가치가 있음 / **ADD-AS-FACT** = 좋고 나쁨 없이 중립 사실로만 / **SKIP** = 유파 의존이 크거나 가치가 낮음.
가치는 초보자 대상 풀이 기준의 판단이다(상·중·하). 공수는 테스트·검증기 허용 목록 갱신을 포함한 추정이다(S = 반나절 이하, M = 1~2일, L = 3일 이상).

### 1-1. 원국

| # | 항목 | 계산하는 저장소 | 우리 상태 | 유파 의존도 (근거) | 가치 | 공수 | 권고와 이유 |
|---|---|---|---|---|---|---|---|
| N1 | 삼합(세 글자 완성) | orrery `checkTripleCompose`, taibu `analyzePillarRelations`, mingpan `findThreeHarmonies`, mingyu `relations.ts` | 없음. `branchRelations`(saju.ts:106-120)는 두 글자 쌍만 보고 왕지가 낀 쌍만 `반합`으로 낸다. 申子辰이 다 있어도 `반합` 두 줄만 나온다 | 합의: 네 저장소의 네 무리 표가 같다. 갈리는 것은 化 성립이고 우리는 판단하지 않는다 | 중상 | S | **ADD-AS-FACT**. 존재만, 化 판단 없이. 가이드가 이미 삼합을 가르친다(saju-concepts.ts:416-430) |
| N2 | 방합(三會) | orrery `checkDirectionalCompose`, taibu `analyzeDiZhiSanHui`, mingyu `SANHUI_GROUPS` | 없음. 가이드·용어집에만 있다(saju-concepts.ts:426, 972) | 세 글자 표는 합의. 두 글자만으로 방합을 인정할지는 갈린다 | 중 | S | **ADD-AS-FACT**. 세 글자일 때만 |
| N3 | 반합 범위(생지+고지, 예: 申辰) | 왕지 필요: orrery `HALF_COMPOSES`, taibu `BAN_HE_PAIRS` / 아무 두 글자: mingpan(부분 三合), mingyu `isHalfSanhe` | 왕지 필요(saju.ts:117). 인연 점수는 아무 두 글자(score.ts:82) | 갈림. mingyu 안에서도 `isHalfSanhe`(아무 둘)와 `relationStructure.ts`(생지반합·묘지반합, 왕지 필요)가 다르다 | 하 | – | **SKIP**(확장 안 함). 제품 안의 두 정의는 맞춘다(§3 B8) |
| N4 | 암합 | mingyu `ANHE_MAP`(寅丑·卯申·午亥 3쌍만) | 없음 | 갈림. 이번 저장소 중 계산하는 곳이 한 곳뿐이고 쌍 목록도 출처마다 다르다고 알려져 있다 | 하 | S | **SKIP** |
| N5 | 원진·귀문관살 | orrery(`BRANCH_WONJIN`·`BRANCH_GWIMUN`을 관계 목록에 기본 포함) | 풀이에서 금지(saju.ts:434, match.ts:224). 인연 점수는 원진을 쓴다(score.ts:40, 95) | 표는 한국에서 흔하지만 개념 자체가 공포형이다(saju-reading-quality.md §10 D등급) | 하(위험 큼) | – | **SKIP**. 인연 점수와 정책을 정리한다(§3 B8) |
| N6 | 형의 하위 이름(무은·지세·무례) | orrery, mingpan, mingyu | 이름 없이 "삼형 가운데 두 글자", "子卯 상형"(saju.ts:114-115) | 갈림. 子卯를 orrery는 '相刑', mingpan은 '無恩', mingyu는 '無禮'로, 丑戌未를 orrery·mingpan은 '無禮', mingyu는 '恃勢'로 붙인다 | 하 | – | **SKIP**. 지금처럼 이름을 붙이지 않는 것이 맞다 |
| N7 | 공망(旬空) | orrery `getGongmang`(일주 기준, 대운에도 표시), mingpan(일주 旬空), taibu(전체+기둥별), mingyu(기본 일주+연주, classical 프로필은 일주) | 없음. 프롬프트가 단어를 금지한다(saju.ts:434) | 旬空 표는 합의(orrery·mingpan·taibu 같음). 기준 기둥과 뜻이 갈린다(mingyu가 `kongWangBasis` 설정으로 둠) | 중. 한국 만세력 앱에 흔해 후속 질문에 나온다. 사건화 위험은 중상 | 계산 S, 문장 규칙·검증 M | **나중 ADD-AS-FACT**. 일주 기준만, 해당 글자가 원국·대운에 있을 때만, "헛되다"류 금지(연구 §10의 순화 표현) |
| N8 | 도화·역마·화개 | orrery(도화=일지 삼합 기준, 역마·화개=12신살 연지 기준), mingyu(역마·화개=연지 또는 일지), taibu(`YI_MA_MAP` 일지 기준) | 없음, 금지 | 갈림. 기준 지지가 저장소마다 다르다 | 중(인지도 높음). "도화=이성 문제"식 사건화 위험 | S | **SKIP**(출시 전). 나중에 넣는다면 기준 두 가지를 다 밝히고 순화한다 |
| N9 | 천을귀인 등 길신·흉살(문창, 양인, 백호, 괴강, 홍염, 금여 등) | orrery 10종(`getSpecialSals`), mingyu 55종(기본 '问真' 프로필과 'classical' 프로필), taibu | 없음, 금지 | 갈림. 천을귀인을 orrery는 일간으로만, mingyu는 연간 또는 일간으로 찾는다. 양인에 음간을 넣을지도 mingyu 설정값이다(`yangRenMode`) | 하~중. "귀인이 나타난다" 금지 규칙과 부딪힌다 | M | **SKIP** |
| N10 | 12신살 | orrery(연지 기준, 대운에도) | 없음 | 갈림(연지/일지). 이름이 공포형(재살·망신·겁살) | 하 | S | **SKIP** |
| N11 | 납음 | mingpan·taibu(기둥별), mingyu `analyzeNayinProfile`, bazi-lib(README 주장) | 없음 | 60갑자 표는 합의. 쓰임은 관습(옛 궁합, 물상) | 하~중. 이름은 재미있지만 간지 오행과 다른 '세 번째 오행'이라 초보자가 헷갈린다(예: 甲子 = 해중금) | S | **SKIP**(출시 전). 나중에 일주 이름 정도로만 선택 검토 |
| N12 | 지장간 글자 집합·역할 이름·가중치 | orrery(월률분야식, 子卯午酉亥에도 여기), ssaju(우리와 같은 글자, 한국식 역할 이름), taibu(우리와 같은 역할 이름), mingpan(가중치 0.6/0.3/0.1) | lunar-javascript 표와 순서(labels.ts:14-19). 개수에서는 빼고 숨은 오행만 따로 적는다(saju.ts:269-271) | 셋 다 갈린다. 丑을 mingpan은 辛 0.3·癸 0.1로, taibu는 癸 중기·辛 여기로 둔다 | – | – | 가중치·사령(司令)은 **SKIP**. 역할 이름은 버그 위험으로 **수정**(§3 B1) |
| N13 | 12운성(기둥별) | orrery(일간 기준 + 좌법 + 인종법), mingpan(각 기둥 자좌, `calculateSelfSitting`), taibu(地势) | 있음: 일간 기준(saju.ts:68-73, 237). orrery 120칸과 차이 0 | 일간 기준 표는 orrery와 같다. 보는 법(자좌·좌법·인종법)과 음간 처리는 유파 선택이다. mingpan은 자좌 계산에 음간 역행을 쓰면서 오행별 표(`GROWTH_STAGE_MAPPING`, 음양 구분 없음)도 따로 갖고 있다 | – | S | 자좌·좌법·인종법은 **SKIP**. 계산 규칙 문장은 **ADD**(§3 B9) |
| N14 | 명궁·태원 | mingpan(lunar-javascript `getMingGong`·`getTaiYuan`), taibu(`calculateMingGong`·`calculateTaiYuan` 공식) | 없음 | 쓰임이 적다. 명궁 기산법이 여럿이라고 알려져 있으나 이번에 대조하지 않았다 | 하 | S | **SKIP** |
| N15 | 신강약·용신·격국·조후 처방 | mingpan(`StrengthAnalyzer`·`YongShenAnalyzer`·`PatternAnalyzer`), mingyu(강약·용신·격국 모듈), bazi-lib(README 주장) | 원칙상 제외(saju.ts:335, 434) | 높음(saju-reading-quality.md §5) | – | – | **SKIP**. 원칙 유지 |

### 1-2. 운 (대운·세운·월운)

| # | 항목 | 계산하는 저장소 | 우리 상태 | 유파 의존도 (근거) | 가치 | 공수 | 권고와 이유 |
|---|---|---|---|---|---|---|---|
| R1 | 월운(월건), 표준·주제 풀이 | taibu `calculateBaziLiuYueData`(월건·십성·지장간·납음·12운성·신살), mingpan `bazi_liuyue`, orrery `findTransits`(월운·일운과 원국의 합·충·형), mingyu(流月 층 비교) | 신년운세에만 있다(newyear.ts:85-100). 표준(saju.ts)·주제(sajuTopics.ts) 풀이에는 없어서 "앞으로 몇 주" 관찰 절이 대운·세운에만 기댄다(saju.ts:480) | 합의. 월건은 절기로 바뀌고 십성·관계 정의도 같다 | 상 | S. newyear.ts의 월건 계산을 재사용 | **ADD**. 이번 달·다음 달 월건, 절입 날짜, 십성, 원국·세운과의 관계 |
| R2 | 세운↔대운 천간 합·충 | mingyu `analyzeFortuneTriggers` | 지지만 본다(saju.ts:401, sajuTopics.ts:210). 월건↔세운도 지지만(newyear.ts:96) | 합의(천간합·충 표) | 중 | S | **ADD-AS-FACT** |
| R3 | 원국+대운+세운에 걸친 삼합·방합 완성 | mingyu(원국이 미완일 때만 기록하고 "成化가 아니다"라고 명시) | 없음(쌍 관계만) | 표는 합의. 化는 판단하지 않는다 | 중 | S. N1·N2 함수 재사용 | **ADD-AS-FACT** |
| R4 | 같은 간지·같은 글자: 대운=세운(병림), 세운=원국 기둥(복음), 같은 천간·같은 지지 | mingyu(岁运并临·同柱伏吟·同干·同支) | 같은 지지는 辰·午·酉·亥일 때만 `자형`으로 나오고 나머지 여덟 글자는 아무 관계도 안 나온다(saju.ts:116) | 정의는 합의. 전통 이름에는 공포 뉘앙스가 있다 | 중 | S | **ADD-AS-FACT**. 전통 이름 대신 "같은 간지", "같은 글자" |
| R5 | 천극지충(반음) | mingyu(천간 오행 상극 + 지지 충) | 없음. 천간충·지지충은 따로 나온다 | '천극'을 충 4쌍으로 볼지 상극 전체로 볼지 갈린다 | 하~중 | S | **나중 ADD-AS-FACT**. 정의를 하나로 정한 뒤 |
| R6 | 대운·세운 지지의 12운성 | orrery(대운 `unseong`), taibu(流月·流日 `diShi`) | 원국만(`allowed.stages`, saju.ts:412) | 원국과 같은 규칙이라 새 유파 선택이 없다 | 중하 | S | **나중 ADD-AS-FACT** |
| R7 | 일운(일진) | orrery, taibu `calculateBaziLiuRiData`, mingpan `bazi_liuri` | 풀이에는 없음(가이드에 개념만, saju-concepts.ts:707-790) | 합의 | 하(풀이 기준) | S | **SKIP**. 매일 운세 제품을 만들 때 검토 |
| R8 | 연도별 운세 점수·그래프 | life-kline(LLM이 연도별 0~100 점수와 K선을 생성. 프롬프트가 吉凶 사건 예측과 "뚜렷한 기복", "폭부 유년"을 요구: `constants.ts`), mingpan 서비스층(`LiuNianCalculator.ts`의 冲 −20·六合 +20 가감) | 금지 | 계산이 아니라 생성이거나 임의 가중치다 | – | – | **SKIP** |

### 1-3. 궁합

| # | 항목 | 계산하는 저장소 | 우리 상태 | 유파 의존도 (근거) | 가치 | 공수 | 권고와 이유 |
|---|---|---|---|---|---|---|---|
| M1 | 두 명식에 걸친 삼합·방합 | mingyu `analyzeBaziCompatibility`(跨盘三合三会, "成局·成化 아님" 명시) | 쌍 관계만(match.ts:137-139) | 표는 합의 | 중 | S | **나중 ADD-AS-FACT** |
| M2 | 양방향 십성 지도(상대 글자 전체를 내 일간 기준으로, 반대도) | mingyu(双向十神映射) | 일간끼리만(match.ts:154-155). 상대 글자의 십성은 검증 허용 목록에만 들어간다(match.ts:191-192) | 십성 정의는 합의. 성별 고정 매핑(남=재성, 여=관성)으로 흐를 위험이 있다 | 중 | S | **나중 ADD-AS-FACT**. "성별로 배우자 십성을 고정하지 않는다" 규칙과 함께 |
| M3 | 같은 글자와 자형 | (mingyu는 同支를 따로 셈) | 두 사람 일지가 午·午면 `자형`, 子·子면 아무것도 없다(saju.ts:116 → match.ts:138, 168). 인연 점수는 같은 띠를 +4로 본다(score.ts:93) | 자형은 한 명식 안의 개념으로 쓰인다 | 중 | S | **ADD-AS-FACT** "같은 글자". 자형은 한 명식 안에서만(§3 B3) |
| M4 | 궁합 점수·등급 | bazi-lib(0~100 점수, README만), mingpan 서비스층 | 궁합 풀이에서 금지(match.ts:181, 228) | – | – | – | **SKIP** |
| M5 | 희기(용신) 보완 | mingyu(喜忌五行覆盖) | 개수로 보는 '오행 채움'(match.ts:163-164) | 용신에 기댄다 | – | – | **SKIP** |

### 1-4. 계산 기준(시각)

| # | 항목 | 계산하는 저장소 | 우리 상태 | 유파 의존도 (근거) | 가치 | 공수 | 권고와 이유 |
|---|---|---|---|---|---|---|---|
| T1 | 균시차(진태양시) | mingpan(경도+균시차, 120°E 기준), ziwei-doushu(경도+NOAA 균시차), mingyu(IANA 연혁+경도+균시차), orrery(서울은 KST 벽시계와 127.5° 반시 경계, 해외만 진태양시) | LMT 기본, 균시차 끔. LAT·127.5°·당시 표준시는 정책에만 있고(policy.ts:16, sajuCriteria.ts:14-19) 사용자 선택은 없다 | 갈림. 제품 결정 사항이다(saju-engine-eval.md §8 P3) | 중하 | – | **SKIP**. 현행 유지 |
| T2 | 보정 23시대 출생의 다른 관법 일주 알림 | orrery 기본 통자시(`types.ts` `jasiMethod` 기본 'unified'), ziwei-doushu 야자시 규칙 4종, mingyu 早/晚子时 옵션 | 야자시 분리 고정(policy.ts:42). 경고는 23:00 앞뒤 2분만(chart.ts:302-312). 통자시로 보면 출생 약 4.2%의 일주가 바뀐다(saju-calendar-crosscheck-2026-10.md:30, 250) | 갈림. 규칙 이름조차 엔진마다 다르다(saju-engine-eval.md §6) | 상. 일주가 바뀌면 일간과 풀이 전체가 바뀐다 | S | **ADD**. 보정 시각 23:00~24:00이면 "23시에 날을 바꾸는 만세력에서는 일주가 ○○(다음 날 일진)"을 경고와 limits에 한 줄. 시각 모름의 `DAY_PILLAR_WINDOW`와 같은 형식 |

### 1-5. 타로

| # | 항목 | 계산하는 저장소 | 우리 상태 | 유파 의존도 (근거) | 가치 | 공수 | 권고와 이유 |
|---|---|---|---|---|---|---|---|
| C1 | 이웃 카드 원소 관계(원소 위계) | 우리(3장, 가운데 기준), horosa `dignities.js`(modern 3단 / Mathers 4단, 양옆이 서로 적대면 가운데가 주도), mingyu `tarot-evidence.ts`(배열 순서의 모든 이웃 쌍, 메이저는 원소로 치지 않음) | 3장일 때만(tarot.ts:440). 10장은 교차(1×2)에서 모델이 "부딪히는지 받치는지"를 스스로 판단한다(deepTarot.ts:32). 5장 궁합 카드에는 spread facts가 아예 없다(match.ts:366-374) | 친·적 짝(불·바람, 물·흙은 돕고 불·물, 바람·흙은 부딪힘)은 합의. 불·흙과 바람·물을 중립으로 볼지 약한 도움으로 볼지(horosa 두 판), 메이저 원소는 갈린다. 우리 `RELATION`(tarot.ts:423-429)은 modern 판과 같다 | 중 | S | **ADD-AS-FACT**. 10장의 교차·두 축·지팡이 쌍과 5장 궁합 배열 |
| C2 | 메이저 원소의 근거 | taibu(우리와 22장 모두 같은 대응), mingyu(메이저에 원소를 매기지 않음), horosa(카드별 점성 대응) | 22장 모두 4원소 중 하나(cards.ts:25-47). KB README:36은 "골든 던 대응"이라고 적는다 | 6장(마법사·여사제·여황제·운명의 수레바퀴·탑·태양)은 골든 던이 원소가 아니라 행성만 준다(세계는 토성과 흙을 함께 받는다). 그 6장의 원소는 파생 관례다 | 하 | S | **ADD**(문서·필드에 근거 표기만, §3 B7) |
| C3 | 같은 번호·같은 계급 | 우리(같은 번호), PKT Part III §5(마이너 계급 반복) | 메이저와 마이너를 한 번호로 묶는다(tarot.ts:444-446). 궁정 11~14가 정의·매달린 사람·죽음·절제와 겹친다 | 메이저·마이너 숫자 연결은 현대 관례이고, 궁정의 11~14는 우리 내부 인덱스다 | 중. 10장에서 자주 나온다(0.3 실측) | S | **ADD**(수정, §3 B5) |
| C4 | 수비학 축약(카드 합 → 메이저, 생일 카드) | taibu(생일·영혼·연간 카드: 숫자 자리합을 21 이하까지), awesome-tarot(deckaura 생일 카드 계산기 링크), kaabalah(라이프 패스·개인 연도) | 없음 | 갈림. 두 축약 방식이 생일의 27%에서 다른 카드를 낸다(0.3 실측). 22를 바보로 볼지도 갈린다 | 하(재미 기능으로는 중) | S | **SKIP**(풀이). 생일 카드는 나중에 재미 기능으로만, 방식을 고정해 공개 |
| C5 | 궁정 카드 역할 | 우리(태도 먼저, 사람으로 읽어도 나이·성별·외모로 지목하지 않음: KB README 12항), horosa `courtSystems.js`(원소 체계 2벌, 별자리 체계 2벌, 나이대·머리·눈 색, 기사의 탈것) | 있음(`court.asAttitude`·`asPerson`, 16장) | 갈림. 외모·나이 표는 고정관념 위험이 있다 | – | – | 추가분 **SKIP**. 현행 유지 |
| C6 | 시기 대응 | horosa `timingMethods.js`(한 엔진에 다섯 방식: 수트 단위, 메이저 번호, 메이저 별자리, 데칸 전체, 에이스 찾기) | 금지(NO_DATE, tarot.ts:287) | 갈림 | – | – | **SKIP** |
| C7 | 카발라 대응(히브리 문자, 생명나무 경로) | kaabalah(`getTarotCorrespondenceProfile`) | 공부용 층은 점성만(`attributions.use: "study-only"`) | 체계에 따라 다르다 | 하 | – | **SKIP** |
| C8 | 자리 의미 | 우리(`positionHints`·`positionFallback`, 10장의 두 축·지팡이), mingyu·kaabalah(배열 정의) | 있음 | – | – | – | 추가 없음 |

---

## 2. 우선순위

### 2.1 출시 전 5가지

1. **지장간 역할 이름 바로잡기와 계산 기준 문장** (N12, §3 B1·B9)
   - 무엇: 辰·戌·丑·未의 중기·여기를 한국 관례(ssaju·orrery와 같은 쪽)로 맞추거나, 역할 이름을 빼고 "본기 밖 숨은 글자"로만 쓴다. calculation에 "12운성은 일간 기준, 음간은 거꾸로 세고 戊·己는 丙·丁을 따름", "지장간 표의 출처" 두 줄을 넣는다.
   - 어디: labels.ts:14-19 주석, saju.ts:43·238·269-271·302, sajuTopics.ts:185·252·306, 테스트 sajuTopicFacts.test.ts:65(지금 "辰 속 여기 癸"를 기대함).
   - 완료 확인: 네 지지의 역할이 고른 기준과 같고, 기존 골드 샘플의 "巳 속 중기 庚"(content/samples/saju-prologue.ko.json)은 바뀌지 않는다.
2. **월운 사실 추가(이번 달·다음 달)** (R1)
   - 무엇: 월건 간지, 절입 날짜, 천간·지지 십성, 원국·세운과의 관계. 관찰 절("앞으로 몇 주")이 기댈 근거가 생긴다.
   - 어디: `buildFactSet`·`buildTopicFactSet`에 newyear.ts:85-100 방식의 월건 계산, `allowed`에 글자·십성 추가.
3. **관계 계산 보강 묶음** (N1, N2, R2, R3, R4, M3)
   - 무엇: 세 글자 삼합·방합(원국 안, 그리고 원국+대운+세운에 걸쳐 완성될 때), 세운↔대운 천간 합·충, "같은 글자·같은 간지" 중립 관계, 자형은 한 명식 안에서만. 전부 존재만 말하고 化나 좋고 나쁨은 판단하지 않는다.
   - 어디: saju.ts의 `branchRelations`·`relationsWithin`·`relationsTo`, `annual.luckRelation`(saju.ts:401), sajuTopics.ts:210, newyear.ts:96, match.ts:137-139·168.
4. **보정 23시대 출생의 다른 관법 일주 알림** (T2)
   - 무엇: 시각을 아는 출생에서 보정 시각이 23:00~24:00이면 통자시 기준의 다른 일주를 경고와 limits에 한 줄로 적는다. 다른 만세력과 대조하는 사용자의 신뢰 문제를 미리 막는다.
   - 어디: chart.ts `readKnownTime`의 경고 묶음(시각 모름의 `DAY_PILLAR_WINDOW`와 같은 형식), sajuCriteria.ts.
5. **타로 스프레드 사실 수정·보강** (C1, C3, §3 B5·B6)
   - 무엇: "같은 번호"를 메이저끼리와 마이너 같은 계급(에이스·2~10·시종·기사·여왕·왕)으로 나누고, 궁정은 번호 대신 계급 이름으로 보낸다. 10장의 교차·두 축·지팡이 쌍과 5장 궁합 배열에도 원소 관계 줄을 만든다.
   - 어디: tarot.ts:391·436·440·444-446, deepTarot.ts:96, match.ts:366-374.

### 2.2 나중에

- 공망(N7): 일주 기준, 해당 글자가 원국·대운에 있을 때만 중립 사실로. 문장 규칙과 검증기를 먼저 정한다.
- 대운·세운 12운성(R6), 천극지충(R5, 정의 확정 후).
- 궁합: 두 명식에 걸친 삼합·방합(M1), 양방향 십성 지도(M2).
- 타로: 메이저 원소 근거 표기(C2), 생일 카드 재미 기능(C4, 방식 고정).
- 납음(N11): 일주 이름 정도로만 선택 검토.
- 도화·역마·화개(N8): 사용자 요청이 쌓이면, 연지·일지 기준을 함께 밝히고 순화하는 조건으로 재검토.
- 제품 안 정책 정리(§3 B8): 인연 점수의 원진·삼합 정의, 신년운세 행운 오행 문장.

### 2.3 넣지 않음

신강약·용신·격국·조후 처방(N15), 천을귀인·12신살·원진·귀문·백호·괴강 같은 신살(N5, N9, N10), 암합(N4), 형의 하위 이름(N6), 지장간 가중치·사령(N12), 명궁·태원(N14), 자좌·좌법·인종법 12운성(N13), 연도별 점수·그래프(R8), 궁합 점수·희기 보완(M4, M5), 균시차 기본 적용(T1), 타로 시기 대응·궁정 외모 표·카발라 대응(C5~C7).

---

## 3. 지금 사실 계산의 버그 위험

| # | 위험 | 정확한 위치 | 근거 | 심각도 |
|---|---|---|---|---|
| B1 | 지장간 역할 이름이 辰·戌·丑·未에서 한국 엔진과 반대다. 우리는 lunar-javascript 배열 순서를 그대로 [본기, 중기, 여기]로 읽어 辰=[戊 본기, 乙 중기, 癸 여기], 戌=[戊, 辛 중기, 丁 여기], 丑=[己, 癸 중기, 辛 여기], 未=[己, 丁 중기, 乙 여기]가 된다 | `packages/core/src/saju/labels.ts:14-19`(주석 "본기(정기) first, then 중기, 여기"), `apps/web/lib/ai/prompts/saju.ts:43`(`HIDDEN_ROLE`), :238, :269-271, :302, `sajuTopics.ts:185, 252, 306`, 테스트 `apps/web/lib/ai/sajuTopicFacts.test.ts:65`("시지 辰 속 여기 癸 편인") | ssaju `src/constants.ts` `BRANCH_HIDDEN_STEMS`: 辰 여기 乙·중기 癸, 戌 여기 辛·중기 丁, 丑 여기 癸·중기 辛, 未 여기 丁·중기 乙. orrery `JIJANGGAN`(여기→중기→정기 순): '辰' '乙癸戊', '戌' '辛丁戊', '丑' '癸辛己', '未' '丁乙己'. taibu `HIDDEN_STEM_DETAILS`는 우리와 같은 라벨이다. 한국 교재·KASI 원문과는 대조하지 않았다 | 중. 모델이 역할 이름을 본문에 옮기므로("진(辰) 속 중기 을목") 다른 앱과 대조하는 사용자에게 틀려 보인다. 생지(寅申巳亥)와 午·亥는 한국 엔진과 같다 |
| B2 | 세 글자 삼합을 알아보지 못해 반합 두 개로 나오고, 방합은 계산하지 않는다 | `saju.ts:117-118`(왕지가 낀 쌍만 `반합`), `saju.ts:130-135`(쌍만 순회). 가이드는 삼합·방합을 가르친다(`saju-concepts.ts:416-430, 970-972`) | taibu는 셋째 글자가 있으면 반합을 내지 않고 三合으로 낸다(`BAN_HE_PAIRS` + `missing` 검사). orrery는 쌍과 별도로 `triple`·`directional`을 낸다 | 중하. 틀린 말은 아니지만 덜 말한다 |
| B3 | 같은 글자 처리. 두 글자가 같고 辰·午·酉·亥이면 어디서든 `자형`이 붙고, 나머지 여덟 글자는 아무 관계도 나오지 않는다. 궁합(두 사람)과 세운·대운×원국에도 그대로 적용된다 | `saju.ts:116`, 궁합 `match.ts:138, 168`, 세운 `saju.ts:400`(→`relationsTo` :137-139), 대운 `saju.ts:304` | 같은 상황을 인연 점수는 "같은 띠라 통하는 게 많아요" +4로 본다(`packages/core/src/bonds/score.ts:79, 93`). mingyu는 같은 글자를 同干·同支로 따로 센다 | 중하. 예: 2026 병오년 세운과 원국 午 → "자형"만 나온다 |
| B4 | 운 층 사이 천간 관계 누락 | `saju.ts:329, 401`(세운↔대운 지지만), `sajuTopics.ts:210`(다가오는 해↔대운 지지만), `newyear.ts:96`(월건↔세운 지지만) | mingyu `fortuneTriggerEvidence.ts`는 층마다 천간·지지를 모두 비교한다 | 하(빠짐) |
| B5 | 타로 "같은 번호"가 궁정 계급 11~14와 메이저 11~14를 묶고, 궁정의 내부 번호를 모델에 보낸다 | `apps/web/lib/ai/prompts/tarot.ts:444-446`(kb.number로 묶음), :436(마이너를 "완드 기사(12)"처럼 표기), :391(cardBrief의 `number`) | KB README:34는 number를 "마이너 1–14, 내부 인덱스와 섞지 않음"이라고 적는다. 실측: 엉뚱한 메이저–궁정 묶음이 3장 1.6%, 10장 19.4%. PKT §5의 반복은 마이너 계급끼리다 | 중하. 10장 리딩 다섯 번에 한 번꼴로 근거 없는 숫자 연결이 사실로 들어간다 |
| B6 | 원소 관계 사실이 3장 스프레드에만 있다 | `tarot.ts:440`(`cards.length === 3`), `deepTarot.ts:32`(교차를 모델이 판단), `match.ts:366-374`(5장 궁합에 spreadFacts 없음) | mingyu는 모든 이웃 쌍, horosa는 3장 묶음마다 계산한다 | 하. 모델이 원소 관계를 지어낼 여지 |
| B7 | 메이저 원소의 출처 표기가 실제와 다르다 | `packages/core/src/tarot/cards.ts:25-47`, `content/kb/README.md:36`("골든 던 대응") | 골든 던은 6장에 행성만 준다(마법사 수성, 여사제 달, 여황제 금성, 수레바퀴 목성, 탑 화성, 태양 태양). 세계는 토성과 흙을 함께 받는다. 우리 원소는 taibu와 같은 파생 관례이고, mingyu는 메이저에 원소를 매기지 않는다 | 하(문서 정확성) |
| B8 | 제품 안 정책 불일치 | 원진: `score.ts:40, 95`는 점수·문구에 쓰고 `saju.ts:434`·`match.ts:224`는 금지. 반합: `score.ts:82`(아무 두 글자) vs `saju.ts:117`(왕지 필요). 신년 행운 오행: `newyear.ts:114`가 개수가 가장 적은 오행을 고른다(동률이면 목→화→토→금→수 순 첫째) | saju-reading-quality.md §10은 원진을 D등급(공포 개념)으로 둔다. 가장 적은 오행 보충은 억부식 처방에 가깝다(재미 표시는 있음, newyear.ts:135) | 하 |
| B9 | 계산 기준에 12운성 규칙과 지장간 표가 없다 | `saju.ts:403-407`(calculation), `apps/web/lib/sajuCriteria.ts:12-28`(policyLines) | 우리 12운성은 orrery 표와 같다(0/120). 음간 처리와 지장간 표는 유파 선택이라 밝혀 두는 편이 정직하다 | 하 |

---

## 4. 확인하지 못한 것과 주의

- B1의 "한국 관례"는 한국 오픈소스 엔진 두 곳(ssaju, orrery)의 표가 일치한다는 근거다. 한국 교재나 KASI 원문과는 대조하지 않았다. 중국 쪽 taibu는 우리와 같은 라벨이다. 그래서 "정답이 틀렸다"보다 "한국 사용자가 보는 관례와 어긋난다"로 읽어야 한다. ssaju는 사장님 목록 밖 저장소다.
- mingpan 서비스층의 점수·사건 문구(`LiuNianCalculator.ts`의 "適合投資創業" 등)가 실제 MCP 출력에 실리는지는 확인하지 않았다. README는 "확정 정보만"이라고 적는다.
- bazi-lib은 저장소에 README와 LICENSE만 있어 기능 주장을 확인할 수 없다.
- 명궁 기산법의 차이, 천을귀인의 다른 판본은 이번 저장소들에서 확인하지 못했다(orrery·mingpan·mingyu의 천을귀인 표는 같고, 찾는 기준만 다르다).
- 4.2%(통자시 전환 시 일주 변경)는 기존 `saju-calendar-crosscheck-2026-10.md` 값이다. 실제 앱 화면은 이번에 열지 않았다.
- 타로 비율은 78장 균일 무작위 추첨을 가정한 시뮬레이션이다.
- AGPL 저장소(orrery, mingyu, horosa-skill, kaabalah, taibu 루트)는 규칙만 참고했고 코드는 옮기지 않았다. taibu `packages/core`는 MIT다.
- tarotcardapi는 라이선스가 없다. taibu `public/tarot_cards`의 이미지가 tarotcardapi `images/`와 파일명·바이트 수가 같다. 두 곳의 이미지와 문구는 쓰지 않는다(우리는 1909 스캔을 쓴다).

## 출처

- 우리 코드: 본문에 적은 파일과 줄 번호(2026-10-07 작업 트리 기준)
- rath/orrery: https://github.com/rath/orrery (`packages/core/src/types.ts`, `pillars.ts`, `constants.ts`, `saju.ts`)
- Brhiza/mingyu: https://github.com/Brhiza/mingyu (`packages/core/README.md`, `src/bazi/baziShenSha/variants.ts`, `scope.ts`, `helpers/nobleRules.ts`, `helpers/luRules.ts`, `src/ganzhi/relations.ts`, `src/bazi/fortuneTriggerEvidence.ts`, `src/bazi/compatibilityEvidence.ts`, `src/divination/tarot-evidence.ts`)
- hhszzzz/taibu: https://github.com/hhszzzz/taibu (`LICENSE`, `packages/core/src/domains/bazi/calculate.ts`, `types.ts`, `domains/tarot/calculate.ts`, `data/ganzhi.ts`)
- ChesterRa/mingpan: https://github.com/ChesterRa/mingpan (`README.md`, `src/core/constants/bazi.ts`, `src/core/bazi/BaziCore.ts`, `TrueSolarTime.ts`, `src/services/bazi/analyzers/RelationsAnalyzer.ts`, `calculators/LiuNianCalculator.ts`, `LiuYueCalculator.ts`)
- golbin/ssaju(B1 교차 근거): https://github.com/golbin/ssaju (`src/constants.ts`)
- rokoss21/bazi-lib: https://github.com/rokoss21/bazi-lib (`README.md`)
- miounet11/life-kline: https://github.com/miounet11/life-kline (`README.md`, `constants.ts`)
- Renhuai123/ziwei-doushu: https://github.com/Renhuai123/ziwei-doushu (`lib/ziwei/true-solar-time.ts`)
- Horace-Maxwell/horosa-skill: https://github.com/Horace-Maxwell/horosa-skill (`horosa-skill/horosa-core-js/src/vendor/tarot/engine/dignities.js`, `timingMethods.js`, `tarot/decks/courtSystems.js`)
- mdnm/kaabalah: https://github.com/mdnm/kaabalah (`README.md`, `LICENSE`, `src/tarot/index.ts`, `src/tarot/spreads.ts`)
- krates98/tarotcardapi: https://github.com/krates98/tarotcardapi (`README.md`)
- gokimedia/awesome-tarot: https://github.com/gokimedia/awesome-tarot (`README.md`)
- 기존 조사: `docs/research/saju-engine-eval.md`(§6, §8), `docs/research/saju-reading-quality.md`(§5, §10), `docs/research/saju-calendar-crosscheck-2026-10.md`
