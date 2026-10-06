# 타로 KB 78장 검수 시트와 PKT 1차 대조 (2026-10)

- 작성: 2026-10-06
- 대상: `content/kb/cards/*.json` 78장과 `_index.json` (스키마 `starlog-tarot-kb/1`, 78장 모두 `review.status = draft`)
- 기준 자료: A. E. Waite, *The Pictorial Key to the Tarot* (Rider, 1910/1922 판, 퍼블릭 도메인). Part II §2(메이저 그림·상징), Part III §2(마이너 그림·점술 의미)·§3(메이저 점술 의미)·§4(마이너 보조 의미). 이하 PKT.
- 짝 문서: `docs/research/tarot-kb-review-sheet.html` (사람 검수용 인쇄 시트. 카드 78장 블록, 체크박스, 메모칸)
- 성격: **AI 1차 점검**이다. 사람 검수가 아니고, KB의 `review.status`·`humanReviewed`는 건드리지 않았다. `content/kb/`와 앱 코드는 수정하지 않았다.

---

## 0. 핵심 결론

1. 78장을 모두 PKT와 대조했다. 플래그는 **35건: High 0, Medium 3, Low 32.** 플래그가 붙은 카드는 31장, 붙지 않은 카드는 47장이다.
2. **KB가 PKT 원문을 옮긴 부분은 거의 정확하다.** `waite.upright/reversed` 78/78장, `imagery.waiteDescription` 56/56장이 Wikisource 본문과 일치한다(부록 A). 두 판본(Wikisource, Gutenberg) 교차 확인에서 갈린 곳은 2곳뿐이고 둘 다 KB가 Wikisource의 전사 오류를 물려받았을 가능성이다(F-34, F-35).
3. **가장 무거운 세 건은 모두 한 문장 수준이다.** 죽음 `oneLine`의 "(실제 죽음과 무관)"(F-01), 검 4 `oneLine`의 "(죽음의 그림이 아님)"(F-03), 악마의 `waite-1911` 라벨이 붙은 "연인 카드의 짝"(F-02). 앞의 둘은 PKT가 말한 내용(mortality, tomb and coffin)을 사실처럼 부정하고, 셋째는 PKT 문장(다섯째 카드와 유사)과 다른 근거를 원전층 라벨로 달았다. 모두 Medium이다.
4. **가장 많은 유형은 극성 차이(15건, 그중 역방향 13건)다.** PKT 역방향은 긍정인데 KB는 부정이거나(여황제·황제·수레바퀴·완드 3·완드 4·컵 8), PKT는 악화인데 KB 기본 모드 `waning`이 회복으로 읽는다(검 3·5·8·9, 펜타클 5, 완드 10, 악마). 프로젝트 정책(현대 의미 우선, PKT는 보관층)에 따른 의도된 차이라서 각각은 Low이고, 필요한 것은 **문서화 통일**이다(5절).
5. **그림 사실은 큰 오류를 찾지 못했다.** PKT와 서술이 다른 9곳은 스캔을 직접 보고 확인했다. 6곳은 PKT 서술이 스캔과 달랐고 KB가 스캔에 맞았다. 3곳(마법사·컵 왕·검 시종)은 KB 표현의 정밀도 문제다. README의 "그림 우선 예외 목록"에 빠진 카드가 있다(5절).

---

## 1. 방법

### 1.1 PKT 원문

| 용도 | 출처 | 결과 |
|---|---|---|
| 주 대조본 | Wikisource "The Pictorial Key to the Tarot" (1910/1922 판), MediaWiki parse API로 Part II·III 본문을 받음 | 메이저 22장 그림 서술(II §2), 점술 의미(III §3), 마이너 56장 그림 서술·점술 의미(III §2), 보조 의미(III §4) 파싱 78/78 |
| 교차 확인 | Project Gutenberg #43548 (L. W. de Laurence, 1918판. Waite 본문의 복제본이라 필사가 독립일 뿐 원문은 같다) | 점술 의미·그림 서술이 철자(미/영식)·구두점 차이 외 일치. 메이저 그림 서술 22장은 단어 단위 유사도 0.99 이상. 예외 1건: 펜타클 왕은 de Laurence판이 축약본이다(KB는 Rider판 문장과 일치) |
| 쓰지 않은 것 | sacred-texts.com | Cloudflare 확인 화면(403)이 떠서 쓰지 않았다. 봇 차단을 우회하지 않았다 |

### 1.2 비교한 항목

- **의미**: `keywordsKo`, `core.upright/reversed/oneLine/shadow`, `reversedModes`(기본 모드와 풀이)를 PKT 정방향·역방향 점술 의미와 대조했다. 보조 의미(III §4)는 참고만 했다.
- **그림**: `imagery.facts`, `commonMisdescriptions`, `glosses`를 PKT의 그림 서술과 문장 단위로 대조했다. PKT가 서술하지 않은 사실(좌우, 수량, 배경)은 "스캔 근거"로 분류하고 위험해 보이는 곳만 스캔으로 확인했다.
- **출처 표기**: `waite`, `imagery.waiteDescription`, `sources[].loc`, `glosses[].school = waite-1911`의 귀속이 PKT 문장과 맞는지 확인했다.
- **범위 밖(참고만)**: 골든 던 점성 대응(`attributions`)은 PKT에 없다. 표준표와 눈으로 대조해 불일치를 찾지 못했다.

### 1.3 판정 기준

| 등급 | 뜻 | 플래그 |
|---|---|---|
| ◎ 부합 | KB 핵심 의미가 PKT 1차 의미와 겹치고 극성이 같다 | 없음 |
| ○ 부분 부합 | PKT의 일부(보조 의미, "another reading" 포함)와만 겹치거나 극성은 같되 초점이 다르다 | 없음 |
| △ 현대 확장 | 겹침은 거의 없으나 상충도 없다. 현대 해석 추가로 기록만 한다 | 없음 |
| ✕ 극성 반대 | PKT 1차 의미(첫 의미군)의 극성과 KB 핵심 의미(첫 두 키워드와 기본 모드)의 극성이 반대다. PKT가 같은 항목에서 반대 극성을 함께 적고 KB가 그것과 겹치면 ○로 둔다 | Low(공개 여부에 따라 문서화 권고) |
| － | PKT에 해당 의미가 없다(컵 2 역방향) | 없음 |

| 심각도 | 기준 |
|---|---|
| High | 사용자에게 나갈 수 있는 문장이 PKT 명시 서술과 정면으로 충돌하고 사실 오류를 낼 위험이 큰 경우. 이번 점검에서는 없음 |
| Medium | KB 문장이 PKT 내용을 사실처럼 부정하거나, PKT 근거가 아닌 것에 원전층 라벨을 붙인 경우. 사람이 고쳐야 할지 정해야 한다 |
| Low | 공개된 현대화 선택, 극성 차이, 표기·수치·표현 정밀도, 누락. 검수자 동의 확인이나 한 줄 보강으로 닫힌다 |

PKT와 다르더라도 현대 해석이 PKT를 부정하지 않으면 플래그로 올리지 않고 카드별 대조표(7절)에 "현대 확장"으로만 적었다. 프로젝트 정책이 "현대 의미 우선, PKT 점술 의미는 보관만 하고 출력하지 않음"이기 때문이다(`tarot-reading-quality.md` 1.13, `content/kb/README.md`).

### 1.4 한계(정직하게)

- 판정은 AI 1차 점검이고 사람 검수가 아니다. 극성 판정은 내 판단이며 7절에 근거를 모두 적었다.
- `topics`·`positionHints`·`asFeelings`·`actionHints`·`combinations`는 PKT에 대응 항목이 없어 전수 정독하지 않았다. 대신 (1) 해석 문장 필드 78장 전수 자동 패턴 검사(금지어, Waite/PKT 언급, 날짜·기간, 그림 언급 표현), (2) 주제문 첫 문장 표본 정독 18장(고위험 8장, 교황, 바보, 임의 8장)만 했다. 자동 검사에서 금지어는 `doNotClaim` 인용 1건(펜타클 4의 "무조건")뿐이었고 해석 문장 필드의 Waite/PKT 언급은 0건이었다. 그림 필드(`commonMisdescriptions` 등)의 Waite 언급 11건은 PKT 문장과 모두 맞았다.
- 스캔은 PKT와 충돌이 의심되거나 좌우·수량을 단정한 곳 19장만 직접 봤다(부록 B). 나머지 59장의 `imagery.facts` 중 PKT가 서술하지 않은 항목(배경, 옷 무늬, 소품 수량 등)은 검증하지 못했다.
- 영문 PKT 문구를 한국어로 옮긴 괄호 풀이("어리석음·광기" 등)는 내 번역이며 원문이 아니다. 인용(*“…”*)은 빌드 때 원문 존재를 기계로 검증했다.

---

## 2. 개수

### 2.1 카드

| 구분 | 장수 | 플래그 있는 카드 | 플래그 없는 카드 |
|---|---|---|---|
| 메이저 아르카나 | 22 | 14 | 8 |
| 완드 | 14 | 3 | 11 |
| 컵 | 14 | 3 | 11 |
| 검 | 14 | 8 | 6 |
| 펜타클 | 14 | 3 | 11 |
| **합계** | **78** | **31** | **47** |

### 2.2 의미 대조 등급

| 등급 | 정방향 | 역방향 |
|---|---|---|
| ◎ 부합 | 60 | 17 |
| ○ 부분 부합 | 16 | 34 |
| △ 현대 확장 | 0 | 13 |
| ✕ 극성 반대 | 2 | 13 |
| － PKT 없음 | 0 | 1 |
| 합계 | 78 | 78 |

### 2.3 플래그

| 심각도 | 문구·해석 추가(C) | 극성 차이(A) | 그림 서술 차이(B) | 원문 전사 차이(D) | 합계 |
|---|---|---|---|---|---|
| High | 0 | 0 | 0 | 0 | 0 |
| Medium | 3 | 0 | 0 | 0 | 3 |
| Low | 6 | 15 | 9 | 2 | 32 |
| **합계** | **9** | **15** | **9** | **2** | **35** |

---

## 3. 플래그 표

Medium 먼저, 그다음 Low를 유형(C → A → B → D)과 카드 순서로 나열했다. "우리 문구"는 KB 원문, "PKT 문구"는 원문 그대로 인용했고 위치(II §2 = Part II §2, III §2·§3 = Part III §2·§3)를 앞에 붙였다. 제안 수정은 적용하지 않았다.

| ID | 심각도 | 카드 | 필드 | 우리 문구 | PKT 문구 | 이유 | 제안 수정 |
|---|---|---|---|---|---|---|---|
| F-01 | Medium (C) | 죽음 `major-13-death` | `core.oneLine.upright` | 「한 국면을 닫고 다음으로 넘어가기 위해 정리하는 때(실제 죽음과 무관)」 | III §3 정방향: *“End, mortality, destruction, corruption”*<br>II §2 XIII: *“The natural transit of man to the next stage of his being either is or may be one form of his progress”* | KB는 '실제 죽음과 무관'이라고 사실처럼 단정한다. PKT는 정방향에 mortality를 넣고, II부에서 앞 카드(매달린 사람)의 죽음은 신비적 의미지만 이 카드는 그렇지 않다고(this is not the case in the present instance) 쓰며 자연스러운 죽음도 한 형태로 본다. 안전 정책(NO_HEALTH)은 타당하나 문장이 PKT 내용을 부정하는 단정으로 읽힌다. | 괄호를 정책 서술로 교체: '(실제 죽음이나 사건을 예고하는 뜻으로 쓰지 않음)'. '무관' 삭제. core.oneLine은 생성기의 claim 재료(README)라 우선 수정. |
| F-02 | Medium (C) | 악마 `major-15-devil` | `imagery.glosses[2] (school=waite-1911)` | 「타락 뒤의 아담과 이브처럼 그려진, 연인 카드의 짝」 | II §2 XV: *“These are analogous with those of the fifth card, as if Adam and Eve after the Fall.”* | PKT가 이 두 인물에 대응시킨 카드는 다섯째(교황)이고 '타락 뒤의 아담과 이브'는 그 비유다. 연인(여섯째)과 짝이라는 말은 PKT에 없는 현대 추론인데 waite-1911 라벨이 붙어 원전층/현대층 구분(README)을 흐린다. | 문구를 '타락 뒤의 아담과 이브처럼 그려진 두 인물(PKT: 다섯째 카드의 인물과 유사)'로 바꾸고, '연인 카드의 짝'은 school=modern gloss로 분리. |
| F-03 | Medium (C) | 검 4 `swords-04` | `core.oneLine.upright` | 「싸움을 잠시 벽에 걸어 두고 조용히 쉬며 회복하는 때(죽음의 그림이 아님)」 | III §2 정방향: *“tomb and coffin”*<br>III §2 정방향: *“It is these last that have suggested the design.”*<br>III §2 그림: *“The effigy of a knight in the attitude of prayer, at full length upon his tomb.”* | PKT는 그림을 무덤 위 기사상으로 설명하고 'tomb and coffin'이 이 그림을 낳은 의미라고 쓴다. '죽음의 그림이 아님'은 PKT 설명과 어긋난다(시체가 아니라 조각상이라는 뜻이라면 맞다). | '(시체가 아니라 무덤 위 조각상이며, 실제 죽음을 예고하지 않음)'처럼 구체화. |
| F-04 | Low (C) | 연인 `major-06-lovers` | `keywordsKo[0] · core.upright[0]` | 「마음이 향하는 선택」 | II §2 VI: *“It replaces, by recourse to first principles, the old card of marriage, which I have described previously, and the later follies which depicted man between vice and virtue.”*<br>III §3 정방향: *“Attraction, love, beauty, trials overcome.”* | PKT II부는 이 카드가 '두 길 사이의 남자' 도상을 대체했다고 쓰고 정방향을 Attraction·love·beauty로 적는다. KB 1순위 키워드 '선택'은 그 도상을 잇는 현대 해석이다. noteKo가 대체 사실은 밝혔고 현대 통용 의미라 모순은 아니다. | 유지 가능. 키워드 순서에서 '끌림·마주 봄'을 앞에 두고 '선택'을 뒤로 돌리면 PKT 층과 덜 갈린다. |
| F-05 | Low (C) | 힘 `major-08-strength` | `core.reversed[1] · core.oneLine.reversed` | 「흔들리는 자신감」 / 「스스로를 믿는 힘이 약해진 상태」 | II §2 VIII: *“The card has nothing to do with self-confidence in the ordinary sense, though this has been suggested”* | PKT II부는 이 카드가 통상적 의미의 자신감과 무관하다고(신에게 기댄 확신의 문제) 쓴다. KB 역방향은 '자신감이 흔들림'으로 읽는다. 현대 통용 의미이나 PKT가 명시적으로 부정한 틀이다. | '자신감' 대신 '버티는 힘·내면의 힘' 계열로 바꾸거나 noteKo에 PKT의 입장을 한 줄 추가. |
| F-06 | Low (C) | 은둔자 `major-09-hermit` | `keywordsKo[0..2] · core.shadow` | 「혼자 마음을 고르는 중」 / 「한발 물러서기」 / 「정리가 고립으로 굳는 것」 | II §2 IX: *“It is further a card which is understood quite incorrectly when it is connected with the idea of occult isolation”*<br>II §2 IX: *“where I am, you also may be”* | PKT II부는 이 카드를 '오컬트적 고립(personal magnetism의 보호)'과 잇는 것을 잘못된 이해라 하고, 핵심을 도달한 자가 보이는 표지로 읽는다. KB 핵심 키워드는 고독·물러남 중심이고 표지 해석은 gloss에만 있다. PKT가 비판한 것은 오컬트적 고립이라 현대의 고독·성찰 해석과 직접 충돌하지는 않는다. | 유지 가능. noteKo에 'PKT는 고립 해석을 비판'을 한 줄 추가하고, 표지 해석을 core에도 반영할지 검수자가 판단. |
| F-07 | Low (C) | 별 `major-17-star` | `keywordsKo[2] · core.upright[1]` | 「희망」 / 「조용한 희망」 | III §3 정방향: *“Loss, theft, privation, abandonment; another reading says—hope and bright prospects”*<br>II §2 XVII: *“The summary of several tawdry explanations says that it is a card of hope.”* | PKT III부 정방향 1차 의미는 Loss·theft·privation·abandonment이고 hope는 'another reading'이다. II부는 '희망의 카드'라는 요약을 tawdry(값싼 설명)라 평한다. KB는 희망을 핵심으로 쓴다(noteKo로 두 갈래는 공개). | 현 상태 유지 가능. 'PKT는 희망을 부차 의미·값싼 요약으로 봄'을 noteKo에 보강. |
| F-08 | Low (C) | 검 7 `swords-07` | `keywordsKo[1..2]` | 「요령과 편법」 / 「몰래 챙김」 | III §2 정방향: *“Design, attempt, wish, hope, confidence; also quarrelling, a plan that may fail, annoyance.”* | PKT 1차 의미는 Design·attempt·wish·hope·confidence(+실패할 수 있는 계획)이고 도둑·기만 어휘가 없다. KB 키워드는 그림에서 나온 현대의 도덕적 해석이다(주제문 '편법 대신 정직한 방법'까지 이어짐). noteKo가 PKT의 양가성은 밝힌다. | 키워드에 '계획·시도'를 병기하거나 '몰래'를 '~로 읽어요' 해석으로 완충. |
| F-09 | Low (C) | 검 여왕 `swords-13` | `imagery.glosses[0] (school=modern)` | 「판단한 뒤에도 내미는 손, 대화의 여지」 | III §2 그림: *“It does not represent mercy, and, her sword notwithstanding, she is scarcely a symbol of power.”* | PKT는 이 인물이 자비를 나타내지 않는다고 명시한다. KB의 modern gloss는 내민 왼손을 '대화의 여지'로 읽어 방향이 다르다(라벨이 modern이라 허용 범위이나 PKT와 반대 방향). | 유지 가능. 'PKT는 자비가 아니라고 봄'을 noteKo에 병기. |
| F-10 | Low (A) | 바보 `major-00-fool` | `keywordsKo · core.upright (정방향)` | 「가벼운 첫걸음」 / 「호기심」 / 「새 출발」 / 「열린 가능성」 | III §3 정방향: *“Folly, mania, extravagance, intoxication, delirium, frenzy, bewrayment.”* | PKT 정방향은 전부 부정(어리석음·광기·도취)이고 KB는 전부 긍정이다. noteKo로 공개된 의도적 현대화이며 II부의 'the spirit in search of experience'와는 통한다. | 변경 불필요. 검수자가 '현대 의미 우선' 정책에 동의하는지만 확인. |
| F-11 | Low (A) | 여황제 `major-03-empress` | `core.reversed (역방향)` | 「남 돌보다 나를 비움」 / 「과한 챙김」 / 「늘어진 편안함」 / 「결실이 더딤」 | III §3 역방향: *“Light, truth, the unravelling of involved matters, public rejoicings”* | PKT 역방향의 주 의미는 빛·진실·엉킨 일의 풀림(긍정, 뒤에 vacillation)이고 KB는 모두 부정이다. noteKo는 정방향 차이만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-12 | Low (A) | 황제 `major-04-emperor` | `core.reversed (역방향)` | 「고집과 경직」 / 「통제가 지나침」 / 「기준이 흔들림」 / 「책임 떠넘기기」 | III §3 역방향: *“Benevolence, compassion, credit; also confusion to enemies, obstruction, immaturity.”* | PKT 역방향은 Benevolence·compassion·credit이 앞서고 obstruction·immaturity가 뒤따른다. KB는 통제·경직(권위의 그늘)으로 읽는다. noteKo 없음. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-13 | Low (A) | 운명의 수레바퀴 `major-10-wheel-of-fortune` | `core.reversed (역방향)` | 「흐름이 잠시 멈춤」 / 「같은 패턴 반복」 / 「통제 밖의 변화」 / 「타이밍 어긋남」 | III §3 역방향: *“Increase, abundance, superfluity.”* | PKT 역방향은 증가·풍족(긍정, 단서 없음)이고 KB는 정체·반복·어긋남(부정)이다. 이 카드에는 noteKo가 없다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-14 | Low (A) | 악마 `major-15-devil` | `core.reversed · reversedModes.default=waning` | 「사슬을 알아차림」 / 「벗어나려는 시도」 / 「매임이 느슨해지며 벗어날 틈이 보임」 | III §3 역방향: *“Evil fatality, weakness, pettiness, blindness.”* | PKT 역방향은 악화(악한 숙명·무력·눈멂)인데 KB 기본 모드 waning은 '벗어날 틈'(완화)으로 읽는다('더 깊어진 집착'은 PKT와 통함). noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-15 | Low (A) | 완드 3 `wands-03` | `core.reversed (역방향)` | 「기다림이 길어짐」 / 「예상과 다른 결과」 / 「시야가 좁아짐」 / 「혼자 다 하려 함」 | III §2 역방향: *“The end of troubles, suspension or cessation of adversity, toil and disappointment.”* | PKT 역방향은 고난·실망의 종식(긍정)이고 KB는 지연·기대와 다른 결과다(같은 disappointment가 반대 부호). noteKo 없음. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-16 | Low (A) | 완드 4 `wands-04` | `core.reversed (역방향)` | 「흔들리는 기반」 / 「축하가 미뤄짐」 / 「소속감 부족」 / 「겉만 화목함」 | III §2 역방향: *“The meaning remains unaltered; it is prosperity, increase, felicity, beauty, embellishment.”* | PKT는 역방향도 번영 그대로('unaltered')라고 못박았고 KB는 기반 흔들림으로 읽는다. noteKo가 이 차이를 공개한다. | 유지 가능. 역방향을 '정방향이 약해진 모습(waning)' 중심으로 쓰면 PKT와 덜 부딪힌다. |
| F-17 | Low (A) | 완드 10 `wands-10` | `core.reversed · reversedModes.default=waning` | 「짐 내려놓기」 / 「나눠 들기」 / 「버티다 무너짐」 / 「책임 떠넘김」 / 「짐을 하나씩 내려놓고 나누기 시작함」 | III §2 역방향: *“Contrarieties, difficulties, intrigues, and their analogies.”* | PKT 역방향은 어려움·음모의 지속인데 KB 기본 모드 waning은 짐을 내려놓는 완화로 읽는다. noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-18 | Low (A) | 컵 8 `cups-08` | `core.reversed (역방향)` | 「떠나지 못함」 / 「돌아옴」 / 「도망치듯 떠남」 / 「결정을 미룸」 | III §2 역방향: *“Great joy, happiness, feasting.”* | PKT 역방향은 Great joy·happiness·feasting(긍정)이고 KB는 떠나지 못함·도망치듯 떠남이다. noteKo가 차이를 공개한다. | 유지 가능(공개됨). |
| F-19 | Low (A) | 검 3 `swords-03` | `core.reversed · reversedModes.default=waning` | 「아픔이 옅어짐」 / 「속으로 삭인 슬픔」 / 「상처를 되새김」 / 「회복의 시작」 / 「비가 그치듯 아픔이 조금씩 옅어짐」 | III §2 역방향: *“Mental alienation, error, loss, distraction, disorder, confusion.”* | PKT 역방향은 혼란·상실의 악화인데 KB 기본 모드 waning은 아픔이 옅어지는 회복으로 읽는다. noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-20 | Low (A) | 검 5 `swords-05` | `core.reversed · reversedModes.default=waning` | 「물러나 화해함」 / 「앙금이 남음」 / 「패배 인정」 / 「싸움을 내려놓음」 / 「다툼이 가라앉고 물러서거나 화해할 틈이 생김」 | III §2 역방향: *“The same; burial and obsequies.”* | PKT 역방향은 정방향과 같은 부정(굴욕·상실)이고 KB 기본 모드 waning은 화해의 틈으로 읽는다. '앙금이 남음'은 PKT와 통한다. noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-21 | Low (A) | 검 8 `swords-08` | `core.reversed · reversedModes.default=waning` | 「가리개를 벗음」 / 「빠져나오기 시작」 / 「새 관점」 / 「두려움이 커짐」 / 「묶었던 생각이 풀리며 출구가 보임」 | III §2 역방향: *“Disquiet, difficulty, opposition, accident, treachery; what is unforeseen; fatality.”* | PKT 역방향은 불안·곤란·배신의 악화인데 KB 기본 모드 waning은 출구가 보이는 완화로 읽는다. noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-22 | Low (A) | 검 9 `swords-09` | `core.reversed · reversedModes.default=waning` | 「걱정이 옅어짐」 / 「도움을 청함」 / 「속으로 곪는 불안」 / 「악몽에서 깨어남」 / 「밤이 지나가듯 불안이 조금씩 옅어짐」 | III §2 역방향: *“Imprisonment, suspicion, doubt, reasonable fear, shame.”* | PKT 역방향은 구속·의심·합당한 두려움·수치(부정)인데 KB 기본 모드 waning은 불안이 옅어지는 완화로 읽는다. noteKo가 PKT 역방향 내용은 적었으나 극성 차이는 말하지 않는다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-23 | Low (A) | 검 여왕 `swords-13` | `keywordsKo · core.upright (정방향)` | 「분명한 경계」 / 「솔직한 판단」 / 「경험에서 나온 지혜」 / 「독립적인 태도」 | III §2 정방향: *“Widowhood, female sadness and embarrassment, absence, sterility, mourning, privation, separation.”* | PKT 정방향은 전부 슬픔·상실(과부·불임·애도)이고 KB는 명료·독립이다. noteKo가 출력하지 않는 이유를 밝히며, PKT 그림 설명의 'familiarity with sorrow'가 '경험에서 나온 지혜'로 이어진다. | 변경 불필요. 검수자가 현대화에 동의하는지만 확인. |
| F-24 | Low (A) | 펜타클 5 `pentacles-05` | `core.reversed · reversedModes.default=waning` | 「회복의 시작」 / 「도움을 받아들임」 / 「깊어진 고립」 / 「혼자 버팀」 / 「추운 시기가 지나 회복과 도움이 보이기 시작함」 | III §2 역방향: *“Disorder, chaos, ruin, discord, profligacy.”* | PKT 역방향은 무질서·파멸·불화의 악화인데 KB 기본 모드 waning은 회복과 도움으로 읽는다. '깊어진 고립'은 통한다. noteKo는 정방향만 다룬다. | 현대 통용 의미라 유지 가능. noteKo에 극성 차이를 한 줄 추가(5.1 패턴 P2·P3 참조). |
| F-25 | Low (B) | 마법사 `major-01-magician` | `imagery.facts[4]` | 「흰 옷 위에 붉은 겉옷을 걸쳤고 허리에 푸른 띠를 둘렀다」 | II §2 I: *“About his waist is a serpent-cincture, the serpent appearing to devour its own tail.”* | PKT는 허리띠를 꼬리를 무는 뱀(serpent-cincture)이라 쓴다. KB는 '푸른 띠'로만 쓴다(스캔 해상도에서는 푸른 띠로 보임). PKT가 짚은 상징이 빠졌다. | '푸른 띠(PKT는 꼬리를 무는 뱀 허리띠로 서술)'로 병기. |
| F-26 | Low (B) | 전차 `major-07-chariot` | `imagery.facts[1]` | 「오른손에 끝이 뾰족한 긴 지팡이를 들었고, 고삐는 어디에도 없다」 | II §2 VII: *“An erect and princely figure carrying a drawn sword”* | PKT는 인물이 칼(drawn sword)을 든다고 쓴다. KB와 스캔은 끝이 뾰족한 막대다(스캔 직접 확인). README·noteKo에 공개된 의도적 차이. | 변경 불필요. |
| F-27 | Low (B) | 죽음 `major-13-death` | `imagery.facts[5] · glosses[1]` | 「멀리 오른쪽 두 탑 사이 지평선에 해가 걸려 있다」 / 「지평선 두 기둥 사이의 해, 끝 너머로 이어지는 것」 | II §2 XIII: *“Between two pillars on the verge of the horizon there shines the sun of immortality.”* | PKT는 지평선의 'two pillars' 사이의 해라 쓰고 스캔은 두 탑이다(직접 확인). KB는 같은 카드 안에서 사실문은 '탑', waite-1911 gloss는 '기둥'으로 표기가 갈린다. | 사실문을 '두 탑(PKT는 pillars로 서술)'로 통일하고 gloss 표기도 맞춤. |
| F-28 | Low (B) | 절제 `major-14-temperance` | `imagery.facts[6]` | 「왼쪽 물가에서 산 쪽으로 길이 이어지고, 산 위에 해 같은 빛이 떠 있다」 | II §2 XIV: *“above there is a great light, through which a crown is seen vaguely”* | PKT는 길 끝 지평선의 빛 속에 왕관이 어렴풋이 보인다고 쓴다. 스캔에서는 해 같은 빛만 보이고 왕관이 구별되지 않는다(직접 확인). KB는 스캔에 맞다. | 변경 불필요. 필요하면 '(PKT는 빛 속 왕관을 서술하나 스캔에서는 불분명)' 병기. |
| F-29 | Low (B) | 악마 `major-15-devil` | `imagery.facts[0]` | 「염소 뿔과 박쥐 날개를 가진 형상이 검은 받침대 위에 웅크려 앉아 있다」 | II §2 XV: *“is standing on an altar”* | PKT는 제단 위에 서 있다고 쓰고 KB는 '웅크려 앉아'로 쓴다. 스캔은 받침 위에 쭈그린 자세(직접 확인)라 KB가 스캔에 맞다. README 예외 목록에는 없다. | README 예외 목록에 추가. |
| F-30 | Low (B) | 컵 에이스 `cups-01` | `imagery.facts[1]` | 「컵에서 물줄기 다섯 갈래가 넘쳐 아래 연못으로 떨어진다」 | III §2 그림: *“from which four streams are pouring”* | PKT는 물줄기 넷(four streams)이라 쓴다. KB와 스캔은 다섯 갈래다(스캔 직접 확인). README에 공개된 의도적 차이. | 변경 불필요. |
| F-31 | Low (B) | 컵 왕 `cups-14` | `imagery.facts[3] · glosses[1]` | 「왼쪽 바다에서 물고기가 뛰어오르고, 오른쪽엔 배가 떠 있다」 / 「한쪽엔 배, 다른 쪽엔 뛰어오르는 돌고래, 물의 상징」 | III §2 그림: *“on one side a ship is riding and on the other a dolphin is leaping”* | PKT는 뛰어오르는 것이 dolphin이라 쓴다. KB 사실문은 '물고기', 같은 카드 gloss(waite-1911)는 '돌고래'라 서로 어긋난다. 스캔은 물고기와 돌고래의 중간 형상이고, 왼쪽 해양 동물·오른쪽 배 배치는 KB와 일치한다. | '물고기 같은 해양 동물(PKT: 돌고래)'로 통일. |
| F-32 | Low (B) | 검 시종 `swords-11` | `imagery.facts[0]` | 「젊은 시종이 두 손으로 칼을 비스듬히 치켜들고 서 있다」 | III §2 그림: *“holds a sword upright in both hands, while in the act of swift walking”* | PKT는 칼을 곧게(upright) 들고 '재빨리 걷는 중'이라 쓴다. KB는 '비스듬히 치켜들고 서 있다'. 스캔은 한 발 내딛은 자세에 칼이 거의 수직이다(직접 확인). | '걷는 자세로 칼을 세워 든다'로 수정. |
| F-33 | Low (B) | 펜타클 7 `pentacles-07` | `imagery.facts[0..2]` | 「왼쪽 무성한 덩굴 덤불에 펜타클 여섯 개가 달려 있다」 / 「발치에 펜타클 하나가 따로 놓여 있다」 / 「젊은이가 괭이 자루에 두 손과 턱을 괴고 기대어 서 있다」 | III §2 그림: *“A young man, leaning on his staff, looks intently at seven pentacles attached to a clump of greenery on his right”* | PKT는 일곱 개가 모두 덤불에 붙어 있고 인물이 staff에 기댄다고 쓴다. 스캔은 덤불 여섯 개 + 발치 하나, 괭이형 도구다(직접 확인). KB는 스캔을 따랐으나 README의 '그림 우선' 예외 목록에 없다. | README 예외 목록에 추가. |
| F-34 | Low (D) | 심판 `major-20-judgement` | `waite.upright` | 「Another account specifies total loss though lawsuit.」 | Wikisource III §3: *“Another account specifies total loss though lawsuit.”*<br>Gutenberg #43548: *“Another account specifies total loss through lawsuit.”* | KB의 waite.upright는 Wikisource와 같지만 Gutenberg는 'through lawsuit'이다. 'though'는 문맥상 오탈자로 보이며 KB가 Wikisource의 전사 오류를 물려받았을 가능성이 있다. 출력하지 않는 보관 필드라 영향은 작다. | 1910/1911 원본 스캔으로 확인한 뒤 'through'로 정정. |
| F-35 | Low (D) | 펜타클 시종 `pentacles-11` | `waite.reversed` | 「Prodigality, dissipation, liberality. luxury; unfavourable news.」 | Wikisource III §2: *“Prodigality, dissipation, liberality. luxury; unfavourable news.”*<br>Gutenberg #43548: *“Prodigality, dissipation, liberality, luxury, unfavorable news.”* | KB는 Wikisource와 같게 'liberality. luxury;'(마침표)로 적었으나 Gutenberg는 쉼표다. 마침표는 전사 오류로 보인다. 출력하지 않는 보관 필드다. | 원본 스캔으로 확인한 뒤 쉼표로 정정. |

유형: C = 문구·해석 추가(오해 소지), A = 극성 차이, B = 그림 서술 차이, D = 원문 전사 차이(Wikisource와 Gutenberg가 갈리는 곳).

---

## 4. 플래그 없는 카드

47장이다. 정방향·역방향 등급이 모두 ◎·○·△·－ 중에 있고, 플래그 기준(PKT 명시 서술과의 충돌, 오귀속, 사실 오류)에 걸리는 곳이 없다. 사소한 표현 차이·누락·현대 확장은 7절 표에 적었다.

- **메이저 아르카나** (8장): 여사제(◎/△), 교황(○/○), 정의(◎/◎), 매달린 사람(○/△), 탑(◎/◎), 달(◎/◎), 태양(◎/◎), 세계(◎/◎)
- **완드** (11장): 완드 에이스(◎/△), 완드 2(○/○), 완드 5(◎/○), 완드 6(◎/○), 완드 7(◎/○), 완드 8(◎/△), 완드 9(◎/○), 완드 시종(◎/○), 완드 기사(◎/○), 완드 여왕(○/○), 완드 왕(◎/○)
- **컵** (11장): 컵 2(◎/－), 컵 3(◎/◎), 컵 4(◎/◎), 컵 5(◎/○), 컵 6(◎/○), 컵 7(◎/◎), 컵 9(◎/○), 컵 10(◎/◎), 컵 시종(◎/○), 컵 기사(◎/○), 컵 여왕(○/△)
- **검** (6장): 검 에이스(○/○), 검 2(○/△), 검 6(◎/△), 검 10(◎/○), 검 기사(◎/◎), 검 왕(◎/○)
- **펜타클** (11장): 펜타클 에이스(◎/○), 펜타클 2(○/◎), 펜타클 3(◎/◎), 펜타클 4(◎/△), 펜타클 6(◎/○), 펜타클 8(◎/○), 펜타클 9(◎/○), 펜타클 10(◎/○), 펜타클 기사(◎/◎), 펜타클 여왕(◎/△), 펜타클 왕(◎/○)

괄호는 정방향/역방향 등급이다.

---

## 5. 패턴과 결정이 필요한 것

### 5.1 역방향 극성 차이: 문서화 방식을 통일할 것

KB에는 `waite.noteKo`가 78장 중 58장에 있다. 어떤 카드는 PKT와의 차이를 밝히고(바보, 완드 4, 컵 8, 검 여왕) 어떤 카드는 밝히지 않는다(수레바퀴, 완드 3, 황제). 같은 종류의 차이인데 기록이 고르지 않다.

| 패턴 | 설명 | 카드 | 권고 |
|---|---|---|---|
| P1 정방향 현대화 | PKT 정방향이 전부 부정인데 KB는 긍정 | 바보, 검 여왕 | 이미 noteKo로 공개됨. 검수자 동의만 확인 |
| P2 역방향 부호 반대 | PKT 역방향은 긍정·중립인데 KB는 부정 | 여황제, 황제, 수레바퀴, 완드 3, 완드 4, 컵 8 | 공개된 곳(완드 4, 컵 8)은 유지. 나머지 4장은 noteKo에 한 줄 추가 |
| P3 `waning` 기본 모드의 완화 해석 | PKT 역방향은 악화·지속인데 기본 모드 `waning`이 "회복·완화"로 읽힌다 | 검 3·5·8·9, 펜타클 5, 완드 10, 악마 | README 역방향 정책에 "부정 카드의 `waning`은 완화이며 PKT는 악화로 적음"을 한 줄 명시하거나 카드별 noteKo 추가 |

같은 `waning` 풀이가 검 2·달에서는 PKT와 충돌하지 않는다(검 2는 PKT가 사기·거짓이고 KB는 교착 해소라 △. 달은 PKT가 "lesser degrees of deception"이라 완화 해석과 통해 ◎).

### 5.2 사실처럼 단정한 괄호 문구

`oneLine` 끝에 안전 문구를 붙인 카드는 7장이다(죽음, 탑, 검 3·4·9·10, 펜타클 5. 악마의 "(스스로 풀 여지가 있음)"은 다른 성격이라 제외). 형식이 두 가지로 갈린다. "...의 예언이 아님"은 정책 서술이라 PKT와 충돌하지 않는다(탑, 검 3·9·10, 펜타클 5). "...와 무관", "...의 그림이 아님"은 사실 단정이라 PKT와 충돌한다(죽음 F-01, 검 4 F-03). 같은 형식으로 통일하는 편이 안전하다.

### 5.3 README "그림 우선 예외 목록"에 추가할 카드

README는 전차(칼), 컵 에이스(물줄기 넷), 펜타클 기사(들여다보지 않음)만 적었다. 스캔 확인 결과 PKT 서술과 다른 곳이 더 있다.

| 카드 | PKT | 스캔·KB |
|---|---|---|
| 펜타클 7 | 일곱 개가 모두 덤불에 붙음, staff | 덤불 여섯 + 발치 하나, 괭이형 도구 |
| 악마 | standing on an altar | 받침 위에 쭈그린 자세 |
| 죽음 | two pillars | 두 탑 |
| 절제 | 빛 속에 어렴풋한 왕관 | 해 같은 빛만 보임 |
| 마법사 | serpent-cincture(꼬리를 무는 뱀 띠) | 푸른 띠로만 보임 |

### 5.4 현대 해석이 PKT의 명시적 부정과 만나는 곳

힘 역방향의 "자신감", 별의 "희망", 은둔자의 "고립", 연인의 "선택"은 모두 현대 통용 의미이고 모순은 아니다. 다만 PKT II부가 각각 "통상적 자신감과 무관", "희망의 카드라는 요약은 tawdry", "오컬트적 고립 해석은 잘못", "두 길 사이의 남자 도상을 대체"라고 적었다. 이 네 가지는 noteKo에 한 줄씩 있으면 검수자가 근거를 바로 볼 수 있다(F-04~F-07).

---

## 6. 제안하는 후속 순서

1. F-01~F-03(Medium 3건)을 사람이 확인하고 문구 수정 여부를 정한다. 문구 3줄이다.
2. 원문 전사 차이 2건(F-34, F-35)은 1910/1911 원본 스캔으로 확인해 `waite` 필드를 정정한다. 출력하지 않는 필드라 급하지 않다.
3. 5.1의 P2·P3 정책을 한 번에 정한다(README 한 줄 + noteKo 추가). 카드별로 따로 고민할 일이 아니다.
4. 5.3 예외 목록을 README에 추가한다.
5. 사람 검수(HTML 시트)에서 "수정 필요"로 체크된 카드만 KB를 고친다. 검수가 끝난 카드의 `review.status`는 사람이 바꾼다.

---

## 7. 카드별 대조표 (78장)

정/역은 의미 대조 등급이다. 인용 중 *“…”*는 PKT 원문, 「…」는 KB 원문이다. "그림"은 PKT가 직접 뒷받침한 항목, 스캔 근거로만 있는 항목, PKT와 다른 항목을 요약했다.

### 7.1 메이저 아르카나

| 카드 | 정 | 역 | 정방향 대조 | 역방향 대조 | 그림 | 플래그 |
|---|---|---|---|---|---|---|
| 바보<br>`major-00-fool` | ✕ | ○ | PKT *“Folly, mania, extravagance, intoxication”*(어리석음·광기)는 전부 부정, KB는 「가볍게 첫발 떼기」 등 전부 긍정. noteKo로 공개됨. II부의 *“the spirit in search of experience”*와는 부합. | PKT *“Negligence, absence”*·*“carelessness”* ↔ KB 「발밑 확인 없이 뛰기」·「무모함과 겁 사이」가 겹침. | PKT 뒷받침: 절벽 끝·하늘을 보는 시선·장미·막대와 보따리·뛰는 개. 스캔 보강: 해(오른쪽 위)·옷 무늬·설산. 불일치 없음. | F-10 |
| 마법사<br>`major-01-magician` | ◎ | △ | PKT *“Skill, diplomacy, address, subtlety”*·*“self-confidence, will”* ↔ KB 「의지와 실행력」·「말과 기술로 풀기」. *“sickness, pain, loss, disaster, snares of enemies”*는 미반영(noteKo 공개). | PKT *“Physician, Magus, mental disease, disgrace, disquiet”* ↔ KB 「재주만 앞서는 말」·「흩어진 집중」은 현대 해석(겹침도 상충도 없음). | PKT 뒷받침: 오른손 막대 위·왼손 땅을 가리킴·∞ 기호·탁자 위 네 수트 상징·장미와 백합. 차이: PKT는 허리띠를 *“serpent-cincture”*(꼬리를 무는 뱀)로 서술, KB는 '푸른 띠'(스캔은 푸른 띠로 보임). | F-25 |
| 여사제<br>`major-02-high-priestess` | ◎ | △ | PKT *“Secrets, mystery”*·*“silence”*·*“wisdom”* ↔ KB 「말하지 않은 앎」·「조용히 지켜보기」. | PKT *“Passion, moral or physical ardour, conceit, surface knowledge”*(겉으로 드러난 열정·얕은 앎) ↔ KB 「혼자 속으로 삭이기」(안으로 향함). 방향이 달라 noteKo로 공개됨. | PKT 뒷받침: 흑·백 기둥(J·B)·석류와 야자 휘장·반쯤 가린 TORA 두루마리·뿔 관과 원반·가슴 십자·발치 초승달. 스캔 보강: 기둥 좌우(B 왼쪽, J 오른쪽). | - |
| 여황제<br>`major-03-empress` | ◎ | ✕ | PKT *“Fruitfulness, action, initiative”* ↔ KB 「돌봄과 풍요」·「자라는 관계」. *“difficulty, doubt, ignorance”*는 미반영(noteKo 공개). | PKT *“Light, truth, the unravelling of involved matters, public rejoicings”*(긍정) ↔ KB 「과한 챙김」·「결실이 더딤」(부정). noteKo는 정방향 차이만 설명. | PKT 뒷받침: 별 관(PKT는 열두 개)·금성 기호 방패·익어 가는 밀밭·떨어지는 물·구슬 달린 홀. 스캔 보강: 석류 무늬 옷·붉은 쿠션·숲. | F-11 |
| 황제<br>`major-04-emperor` | ◎ | ✕ | PKT *“Stability, power, protection, realization”*·*“authority and will”* ↔ KB 「틀과 기준 세우기」·「책임지는 자리」. | PKT *“Benevolence, compassion, credit”*(긍정이 앞서고 뒤에 *“obstruction, immaturity”*) ↔ KB 「고집과 경직」·「통제가 지나침」(권위의 그늘). noteKo 없음. | PKT 뒷받침: 숫양 머리 왕좌·앙크 모양 홀·왼손 구슬. 스캔 보강: 갑옷 다리·헐벗은 주황 산. | F-12 |
| 교황<br>`major-05-hierophant` | ○ | ○ | PKT *“Marriage, alliance”*·*“inspiration”*·*“the man to whom the Querent has recourse”* ↔ KB 「공식적인 약속」·「믿을 만한 조언」. *“captivity, servitude”*는 shadow에만 약하게 반영. | PKT *“Society, good understanding, concord, over-kindness, weakness”* ↔ KB 「틀에 갇힌 생각」·「남의 기준 따르기」. *“weakness”*와 일부 통하나 전체 방향은 현대 해석. | PKT 뒷받침: 삼중관·성전 기둥이 아닌 두 기둥·삼중 십자 홀·오른손 축복 손짓·엇갈린 열쇠·무릎 꿇은 두 사제. 스캔 보강: 기둥·열쇠 색. | - |
| 연인<br>`major-06-lovers` | ○ | ◎ | PKT *“Attraction, love, beauty, trials overcome”* ↔ KB 「서로 끌림」·「솔직하게 마주 봄」. 1순위 키워드 「마음이 향하는 선택」은 현대 추가(플래그 참조). | PKT *“Failure, foolish designs”*·*“contrarieties of all kinds”* ↔ KB 「마음과 선택이 엇갈림」·「유혹에 흔들림」. | PKT 뒷받침: 천정의 해·날개 달린 큰 인물·남녀 두 사람·남자 뒤 생명나무(열두 열매)·여자 뒤 선악과 나무와 뱀. 스캔 보강: 여자 왼쪽·남자 오른쪽·산. | F-04 |
| 전차<br>`major-07-chariot` | ◎ | ◎ | PKT *“triumph”*·*“Succour, providence”*(*“war”*·*“presumption”*도 포함) ↔ KB 「의지로 밀고 나가기」·「목표를 향한 전진」. | PKT *“Riot, quarrel, dispute, litigation, defeat”* ↔ KB 「힘이 엇갈려 멈춤」·「주도권 잃음」. | PKT 뒷받침: 두 스핑크스가 끎. 차이: PKT *“a drawn sword”* ↔ KB·스캔은 끝이 뾰족한 막대(README 명시). 스캔 보강: 흑(왼쪽)·백(오른쪽) 스핑크스·별 천막·성곽 도시. | F-26 |
| 힘<br>`major-08-strength` | ◎ | ○ | PKT *“Power, energy, action, courage, magnanimity”* ↔ KB 「부드러운 힘」·「인내와 용기」. | PKT *“weakness”*·*“discord”* ↔ KB 「기운이 빠짐」·「참다가 터짐」은 통함. 단 「흔들리는 자신감」은 PKT II부의 부정과 충돌(플래그). | PKT 뒷받침: 사자의 턱을 다루는 여인·머리 위 ∞·꽃 사슬. 스캔 보강: 붉은 사자·흰 옷·왼쪽 뒤 산. | F-05 |
| 은둔자<br>`major-09-hermit` | ○ | ○ | PKT *“Prudence, circumspection”* ↔ KB 「한발 물러서 보기」·「내 기준 세우기」. *“treason, dissimulation, roguery, corruption”*(PKT가 강조한 부분)은 미반영(noteKo 공개). | PKT *“Concealment, disguise, policy, fear, unreasoned caution”* ↔ KB 「고립이 길어짐」·「도움을 밀어냄」이 *“fear”*·*“caution”*과 일부 통함. | PKT 뒷받침: 등불 속 별·높은 곳에서 등불을 들어 올림. 스캔 보강: 왼손 지팡이·회색 망토·하얀 봉우리. | F-06 |
| 운명의 수레바퀴<br>`major-10-wheel-of-fortune` | ○ | ✕ | PKT *“Destiny, fortune, success, elevation, luck, felicity”* ↔ KB 「흐름이 바뀌는 때」·「기회의 순간」. 현대의 순환·타이밍 해석이 중심이라 부분 부합. | PKT *“Increase, abundance, superfluity”*(긍정) ↔ KB 「흐름이 잠시 멈춤」·「같은 패턴 반복」(부정). noteKo 없음. | PKT 뒷받침: 바퀴 위 TARO·신의 이름 글자·뱀(Typhon)·네 모서리 생물·스핑크스. 스캔 보강: 아누비스형 인물·연금술 기호·칼. | F-13 |
| 정의<br>`major-11-justice` | ◎ | ◎ | PKT *“Equity, rightness, probity”* ↔ KB 「공정한 판단」·「원인과 결과」. | PKT *“bigotry, bias, excessive severity”* ↔ KB 「한쪽으로 기운 판단」·「불공평함」. | PKT 뒷받침: 두 기둥 사이 좌정(II부 *“seated between pillars”*). 스캔 보강: 칼·저울·관·보랏빛 휘장. | - |
| 매달린 사람<br>`major-12-hanged-man` | ○ | △ | PKT *“Wisdom, circumspection, discernment, trials, sacrifice, intuition”* ↔ KB 「멈추고 다르게 보기」·「내려놓기」가 일부 통함(관점 전환은 현대 추가). | PKT *“Selfishness, the crowd, body politic”* ↔ KB 「의미 없는 버팀」·「나만 희생하는 관계」는 현대 해석(겹침 없음). | PKT 뒷받침: T자 살아 있는 나무·후광·고통 아닌 몰입의 얼굴. 스캔 보강: 다리 모양(4)·옷 색. | - |
| 죽음<br>`major-13-death` | ◎ | ◎ | PKT *“End, mortality, destruction, corruption”* ↔ KB 「한 국면이 끝남」·「정리하고 넘어가기」. 단 oneLine 「(실제 죽음과 무관)」은 PKT의 *“mortality”*와 충돌(플래그). | PKT *“Inertia, sleep, lethargy, petrifaction”* ↔ KB 「변화를 미룸」·「끝을 붙잡고 버팀」. | PKT 뒷받침: 무기 없는 기사·흰 장미 깃발·쓰러진 왕·아이·소녀·주교·지평선 두 기둥 사이의 해. 스캔 보강: 갑옷 해골·해골 가슴띠·배. | F-01, F-27 |
| 절제<br>`major-14-temperance` | ◎ | ○ | PKT *“Economy, moderation, frugality, management, accommodation”* ↔ KB 「균형 잡기」·「서두르지 않는 조율」. | PKT *“disunion, unfortunate combinations, competing interests”* ↔ KB 「조율이 멈춤」·「한쪽으로 치우침」이 일부 통함. | PKT 뒷받침: 한 발 땅·한 발 물·가슴 네모 안 세모·이마의 해·컵 사이 붓기·지평선 쪽 길. 차이: PKT는 빛 속 *“a crown is seen vaguely”*, 스캔에서는 왕관이 불분명. | F-28 |
| 악마<br>`major-15-devil` | ○ | ✕ | PKT *“force, fatality”*·*“that which is predestined but is not for this reason evil”* ↔ KB 「집착과 매임」은 PKT II부의 *“the chain and fatality of the material life”*와 통하나 '습관·중독' 중심은 현대 해석. | PKT *“Evil fatality, weakness, pettiness, blindness”*(악화) ↔ KB 기본 모드 waning의 「벗어나려는 시도」(완화). 「더 깊어진 집착」만 PKT와 통함. | PKT 뒷받침: 염소 뿔·박쥐 날개·거꾸로 선 오각별·들어 올린 오른손·아래로 향한 횃불·고리에서 이어진 사슬·꼬리 달린 남녀. 차이: PKT *“standing on an altar”* ↔ KB '웅크려 앉아'(스캔은 쭈그린 자세). | F-02, F-14, F-29 |
| 탑<br>`major-16-tower` | ◎ | ◎ | PKT *“ruin”*·*“deception”*·*“unforeseen catastrophe”* ↔ KB 「갑작스러운 흔들림」·「깨지는 착각」. oneLine 「(사고나 재난의 예언이 아님)」은 정책 문구로 PKT와 충돌하지 않음. | PKT *“the same in a lesser degree”* ↔ KB 「천천히 오는 흔들림」·「충격 뒤의 수습」. | PKT 뒷받침: 두 사람이 떨어짐(II부 *“the two persons who are the living sufferers”*). 스캔 보강: 번개·날아간 관·불길·노란 불똥·좌우 인물 특징. | - |
| 별<br>`major-17-star` | ○ | △ | PKT *“Loss, theft, privation, abandonment”*, *“another reading says—hope and bright prospects”* ↔ KB는 후자만 사용(「조용한 희망」·「회복과 치유」). noteKo로 공개됨. | PKT *“Arrogance, haughtiness, impotence”* ↔ KB 「희망이 흐려짐」·「스스로를 못 믿음」은 현대 해석. | PKT 뒷받침: 큰 별(8줄기)+작은 별 7(8줄기)·왼 무릎 땅·오른발 물·두 항아리·오른쪽 나무의 새. 스캔 보강: 땅의 물 갈래·산. | F-07 |
| 달<br>`major-18-moon` | ◎ | ◎ | PKT *“darkness, terror, deception”*·*“error”* ↔ KB 「불안과 상상」·「흐릿한 판단」. *“Hidden enemies”*·*“calumny”*는 미반영(타인 단정 방지). | PKT *“lesser degrees of deception and error”*·*“silence”* ↔ KB 「불안이 걷히기 시작」·「속으로 삭인 두려움」. | PKT 뒷받침: 두 탑 사이 길·개와 늑대·물에서 올라오는 생물·달. 누락: PKT의 *“to the right of the observer”* 차오르는 달과 광선 수(16+16)는 KB에 없음. | - |
| 태양<br>`major-19-sun` | ◎ | ◎ | PKT *“Material happiness, fortunate marriage, contentment”* ↔ KB 「솔직한 기쁨」·「밝고 분명한 흐름」. | PKT *“The same in a lesser sense”* ↔ KB 「기쁨이 줄어듦」·「구름 낀 날의 해」. | PKT 뒷받침: 흰 말 위 벌거벗은 아이·붉은 깃발·담(*“walled garden”*). 스캔 보강: 해의 얼굴·해바라기 네 송이. | - |
| 심판<br>`major-20-judgement` | ◎ | ○ | PKT *“Change of position, renewal, outcome”* ↔ KB 「돌아보고 다시 일어섬」·「새 결심」. | PKT *“Weakness, pusillanimity”* ↔ KB 「부름을 외면함」·「자책에 머묾」이 통함. *“deliberation, decision, sentence”*와 「결정을 미룸」은 방향이 엇갈림. | PKT 뒷받침: 구름 속 천사·십자 깃발 나팔·왼쪽 남자·오른쪽 여자·등 돌린 아이·*“more than three”*. 스캔 확인: 총 여섯 명(KB 수치와 일치). | F-34 |
| 세계<br>`major-21-world` | ◎ | ◎ | PKT *“Assured success, recompense”* ↔ KB 「통합과 성취」·「한 주기의 완성」. *“voyage”*·*“emigration”*·*“change of place”*는 미반영(noteKo 공개). | PKT *“Inertia, fixity, stagnation, permanence”* ↔ KB 「마무리 미룸」·「끝맺지 못한 순환」. | PKT는 II부에 그림 서술이 거의 없어(상징 해설 위주) KB 사실은 전부 스캔 근거. 모순 없음. | - |

### 7.2 완드

| 카드 | 정 | 역 | 정방향 대조 | 역방향 대조 | 그림 | 플래그 |
|---|---|---|---|---|---|---|
| 완드 에이스<br>`wands-01` | ◎ | △ | PKT *“Creation, invention, enterprise”*·*“beginning”* ↔ KB 「새 시작의 불씨」·「의욕과 영감」. | PKT *“Fall, decadence, ruin, perdition”* ↔ KB 「불이 잘 안 붙음」·「시작을 미룸」은 훨씬 순한 현대 해석. | PKT 서술은 한 줄뿐: 구름에서 나온 손이 굵은 지팡이를 쥠(일치). 잎·낙엽·성·강은 스캔 근거. | - |
| 완드 2<br>`wands-02` | ○ | ○ | PKT *“riches, fortune, magnificence”* 대 *“physical suffering, disease, chagrin, sadness, mortification”*의 양가. KB 「가진 것 위에서 더 원함」은 PKT의 *“Alexander”* 해석과 통함. | PKT *“Surprise, wonder, enchantment, emotion, trouble, fear”* ↔ KB 「두려워서 못 떠남」이 *“fear”*와 통함. | PKT 뒷받침: 성가퀴 위 남자·오른손 구슬·왼손 지팡이·고리에 고정된 지팡이·왼쪽 장미·십자·백합. 스캔 보강: 모자·망토·풍경. | - |
| 완드 3<br>`wands-03` | ◎ | ✕ | PKT *“established strength, enterprise, effort, trade, commerce, discovery”*·*“able co-operation in business”* ↔ KB 「확장과 협력」·「시야 넓히기」. | PKT *“The end of troubles, suspension or cessation of adversity, toil and disappointment”*(고난·실망의 종식) ↔ KB 「예상과 다른 결과」·「기다림이 길어짐」(지연·실망). noteKo 없음. | PKT 뒷받침: 등을 보인 인물·절벽에서 바다의 배·땅에 세운 지팡이 셋 중 하나에 기댐. 스캔 확인: 배 세 척(KB 수치 일치). | F-15 |
| 완드 4<br>`wands-04` | ◎ | ✕ | PKT *“repose, concord, harmony, prosperity, peace”* ↔ KB 「축하와 환영」·「안정된 기반」. | PKT *“The meaning remains unaltered”*(번영 그대로) ↔ KB 「흔들리는 기반」·「축하가 미뤄짐」. noteKo가 차이를 공개함. | PKT 뒷받침: 네 지팡이 위 화환·꽃다발 든 두 여인·해자 다리·저택(KB 사실 전부 일치). 스캔 보강: 리본·탑 지붕색. | F-16 |
| 완드 5<br>`wands-05` | ◎ | ○ | PKT *“mimic warfare”*·*“strenuous competition”* ↔ KB 「건강한 경쟁」·「힘겨루기」. | PKT *“Litigation, disputes, trickery, contradiction”* ↔ KB 「속으로 쌓인 신경전」이 *“disputes”*와 통함. 「합의점 찾기」는 현대 해석. | PKT 뒷받침: 지팡이를 휘두르는 젊은이들·흉내 내는 싸움(KB gloss waite-1911 일치). 스캔 보강: 다섯 명·옷 색. | - |
| 완드 6<br>`wands-06` | ◎ | ○ | PKT *“a victor triumphing”*·*“great news”* ↔ KB 「인정받는 성과」·「좋은 소식」. | PKT *“Apprehension, fear”*·*“treachery, disloyalty”*·*“indefinite delay”* ↔ KB 「인정이 늦어짐」만 *“delay”*와 통함. | PKT 뒷받침: 월계관 쓴 기마인·월계 화환 지팡이·곁의 보병들. 스캔 보강: 흰 말·지팡이 여섯. | - |
| 완드 7<br>`wands-07` | ◎ | ○ | PKT *“valour”*·*“vantage position”*·*“competition”* ↔ KB 「내 자리 지키기」·「여럿에 맞서는 용기」. | PKT *“Perplexity, embarrassments, anxiety”* ↔ KB 「압박에 흔들림」이 통함. | PKT 뒷받침: 험한 높은 곳의 젊은이·아래에서 솟은 지팡이 여섯. 스캔 보강: 짝짝이 신발. | - |
| 완드 8<br>`wands-08` | ◎ | △ | PKT *“swiftness”*·*“great haste, great hope”*·*“that which is on the move”* ↔ KB 「빠른 진행」·「도착 직전」. | PKT *“Arrows of jealousy, internal dispute, stingings of conscience, quarrels”* ↔ KB 「엇갈리는 소식」·「속도 지연」은 현대 해석. | PKT 뒷받침: 열린 들판 위를 나는 지팡이·끝에 다다름(*“they draw to the term of their course”*). 스캔 확인: 8개가 왼쪽 위에서 오른쪽 아래로 내려옴(KB와 일치). | - |
| 완드 9<br>`wands-09` | ◎ | ○ | PKT *“strength in opposition”*·*“delay, suspension, adjournment”* ↔ KB 「마지막까지 버팀」·「경계와 회복력」. | PKT *“Obstacles, adversity, calamity”* ↔ KB 「버티다 지침」이 통함. | PKT 뒷받침: 지팡이에 기댄 경계하는 인물·뒤의 여덟 지팡이(울타리). PKT 미언급: 머리 붕대(스캔 근거). KB의 '한 번 다쳤어도'는 여기서 나온 현대 해석. | - |
| 완드 10<br>`wands-10` | ◎ | ✕ | PKT *“oppression”*·*“fortune, gain, any kind of success, and then it is the oppression of these things”* ↔ KB 「무거운 책임」·「과부하」. | PKT *“Contrarieties, difficulties, intrigues”*(어려움 지속) ↔ KB 기본 모드 waning의 「짐 내려놓기」·「나눠 들기」(완화). | PKT 뒷받침: 열 지팡이를 진 남자·가까운 목적지(*“The place which the figure is approaching”*). 스캔 보강: 얼굴 가림·붉은 지붕 집. | F-17 |
| 완드 시종<br>`wands-11` | ◎ | ○ | PKT *“an envoy, a postman”*(전령) ↔ KB 「설레는 소식」·「호기심」. | PKT *“Anecdotes, announcements, evil news”*·*“indecision”* ↔ KB 「성급한 소식」·「자신 없음」이 통함. | PKT *“in the act of proclamation”*(선포) ↔ KB는 지팡이 끝을 올려다보는 시선으로 서술(해석 차이, 모순은 아님). 스캔 보강: 깃털 모자·도롱뇽 무늬·피라미드 언덕. | - |
| 완드 기사<br>`wands-12` | ◎ | ○ | PKT *“Departure, absence, flight, emigration”*·*“Change of residence”* ↔ KB 「모험과 이동」·「빠른 결단」. | PKT *“Rupture, division, interruption, discord”* ↔ KB 「시작만 하고 떠남」이 *“interruption”*과 통함. 단절·불화는 미반영(noteKo 공개). | PKT 뒷받침: 짧은 지팡이·갑옷을 입었으나 전쟁 목적 아님·피라미드(*“mounds or pyramids”*)·성급한 말. 스캔 보강: 깃털·도롱뇽 무늬. | - |
| 완드 여왕<br>`wands-13` | ○ | ○ | PKT *“friendly, chaste, loving, honourable”*·*“more magnetic”* ↔ KB 「따뜻한 자신감」·「사람을 끄는 활기」가 통함. *“love of money”*·사업 성공은 미반영. | PKT *“Good, economical, obliging, serviceable”*, 그리고 *“opposition, jealousy”* ↔ KB 「질투와 예민함」이 *“jealousy”*와 통함. | PKT는 *“always in leaf”*(잎 돋은 지팡이)만 언급 → 사자 왕좌·해바라기·검은 고양이는 스캔 근거. 모순 없음. | - |
| 완드 왕<br>`wands-14` | ◎ | ○ | PKT *“honest and conscientious”*·*“The card always signifies honesty”* ↔ KB 「정직한 추진력」·「대담한 책임」. | PKT *“Good, but severe; austere, yet tolerant”* ↔ KB 「고집과 독단」이 *“severe”*와 통하나 *“tolerant”* 면은 미반영. | PKT 뒷받침: 지팡이·왕좌 등받이의 사자. PKT *“flowering wand”* ↔ KB '잎 돋은 지팡이'(스캔은 새잎). 스캔 보강: 도롱뇽·옆모습. | - |

### 7.3 컵

| 카드 | 정 | 역 | 정방향 대조 | 역방향 대조 | 그림 | 플래그 |
|---|---|---|---|---|---|---|
| 컵 에이스<br>`cups-01` | ◎ | △ | PKT *“House of the true heart, joy, content”*·*“abundance, fertility”* ↔ KB 「넘치는 마음」·「위로와 채움」. | PKT *“House of the false heart, mutation, instability, revolution”* ↔ KB 「감정을 막아 둠」·「마음이 새어 나감」은 현대 해석. | PKT 뒷받침: 구름의 손·컵·비둘기와 십자 제병·수련. 차이: PKT *“four streams”* ↔ KB·스캔 다섯 갈래(README 명시, 스캔 확인). | F-30 |
| 컵 2<br>`cups-02` | ◎ | － | PKT *“Love, passion, friendship, affinity, union, concord, sympathy”* ↔ KB 「서로 끌림」·「마음을 주고받음」. | PKT 본문에 역방향이 없음(§4 보조 의미에 *“Passion”*만). KB 역방향은 전부 현대 해석(noteKo 공개). | PKT 뒷받침: 서로 맹세하는 젊은 남녀·헤르메스 지팡이·날개 사이 사자 머리. 스캔 확인: 여인 왼쪽·남자 오른쪽(KB 일치). | - |
| 컵 3<br>`cups-03` | ◎ | ◎ | PKT *“merriment”*·*“happy issue, victory, fulfilment”* ↔ KB 「함께 기뻐함」·「모임의 즐거움」. | PKT *“excess in physical enjoyment”* ↔ KB 「지나친 즐거움」(noteKo 공개). | PKT 뒷받침: 정원의 여인들·치켜든 컵. 스캔 보강: 가운데 등 돌림·발치 수확물. | - |
| 컵 4<br>`cups-04` | ◎ | ◎ | PKT *“Weariness, disgust, aversion”* ↔ KB 「권태와 무관심」·「놓치는 제안」. | PKT *“Novelty, presage, new instruction, new relations”* ↔ KB 「다시 관심이 생김」·「제안을 알아봄」. | PKT 뒷받침: 나무 아래 앉은 젊은이·컵 셋·구름에서 나온 팔이 내민 컵·불만스러운 표정. 스캔 보강: 팔짱·다리 꼬기. | - |
| 컵 5<br>`cups-05` | ◎ | ○ | PKT *“loss, but something remains over”* ↔ KB 「상실의 아쉬움」·「남은 것을 아직 못 봄」. | PKT *“News, alliances, affinity, consanguinity, ancestry, return”* ↔ KB 「돌아갈 다리」가 *“return”*과 통함. | PKT 뒷받침: 어두운 망토의 인물·쓰러진 컵 셋·선 컵 둘·다리와 작은 성채. 스캔 보강: 컵 속 액체 색. | - |
| 컵 6<br>`cups-06` | ◎ | ○ | PKT *“A card of the past and of memories”* ↔ KB 「추억과 그리움」·「옛 인연 떠올리기」. *“Another reading reverses this”*(새 관계)는 noteKo 공개. | PKT *“The future, renewal”* ↔ KB 「지금으로 돌아옴」은 통하나 기본 모드 excess의 「과거에 머묾」은 방향이 반대. | PKT 뒷받침: 오래된 정원의 아이들·꽃이 담긴 컵. 스캔 보강: 흰 별 모양 꽃·창 든 인물·돌 받침 문양. | - |
| 컵 7<br>`cups-07` | ◎ | ◎ | PKT *“Fairy favours, images of reflection, sentiment, imagination”*·*“nothing permanent or substantial”* ↔ KB 「환상과 상상」·「선택의 혼란」. | PKT *“Desire, will, determination, project”* ↔ KB 「결단」·「현실로 돌아옴」. | PKT 뒷받침: 환상의 잔들(*“Strange chalices of vision”*). 컵 일곱 개의 내용물·인물 실루엣은 스캔 근거. 모순 없음. | - |
| 컵 8<br>`cups-08` | ◎ | ✕ | PKT *“the decline of a matter”*·*“of slight consequence”* ↔ KB 「떠나는 결심」·「미련 두고 가기」. 「더 깊은 의미 찾기」는 현대 추가. | PKT *“Great joy, happiness, feasting”*(긍정) ↔ KB 「떠나지 못함」·「도망치듯 떠남」. noteKo가 차이를 공개함. | PKT 뒷받침: 컵을 두고 떠나는 낙담한 인물(*“dejected aspect”*). 스캔 보강: 컵 8개 배치·얼굴 있는 달·붉은 망토. | F-18 |
| 컵 9<br>`cups-09` | ◎ | ○ | PKT *“Concord, contentment, physical bien-être”* ↔ KB 「만족」·「넉넉한 여유」. | PKT *“Truth, loyalty, liberty; but the readings vary and include mistakes, imperfections”* ↔ KB 「겉으로만 만족」이 *“imperfections”*와 통함. | PKT 뒷받침: 포식한 인물·뒤의 아치형 탁자 위 술. 스캔 보강: 컵 아홉 개 반원·팔짱. | - |
| 컵 10<br>`cups-10` | ◎ | ◎ | PKT *“Contentment, repose of the entire heart”*·*“perfection of human love and friendship”* ↔ KB 「함께하는 행복」·「마음의 평화」. | PKT *“Repose of the false heart”* ↔ KB 「겉으로만 평화」. | PKT 뒷받침: 무지개 위 컵·부부(남자 오른팔로 안고 왼팔 듦, 여자 오른팔 듦)·춤추는 두 아이·멀리 집. KB의 '바깥쪽 팔' 서술과 일치. | - |
| 컵 시종<br>`cups-11` | ◎ | ○ | PKT *“news, message”*·*“a studious youth”*·*“reflection, meditation”* ↔ KB 「감성적인 소식」·「상상력과 영감」. | PKT *“seduction, deception, artifice”* ↔ KB 「숨긴 마음」이 일부 통함. 나머지는 현대 해석. | PKT 뒷받침: 컵에서 올라오는 물고기를 바라보는 시종. PKT *“studious and intent aspect”*와 KB '옅은 미소'는 스캔에서 양립. 스캔 보강: 연꽃 무늬·바다. | - |
| 컵 기사<br>`cups-12` | ◎ | ○ | PKT *“Arrival, approach”*·*“proposition”*·*“invitation”* ↔ KB 「다가오는 제안」·「초대와 방문」. | PKT *“Trickery, artifice, subtlety, swindling, duplicity, fraud”* ↔ KB 「말뿐인 약속」으로 순화(noteKo 공개). | PKT 뒷받침: 조용히 말 탐(*“riding quietly”*)·날개 투구. 스캔 보강: 물고기 무늬·발뒤꿈치 날개. | - |
| 컵 여왕<br>`cups-13` | ○ | △ | PKT *“loving intelligence, and hence the gift of vision”* ↔ KB 「직관과 감수성」·「깊은 공감」이 통함. 인물 평가(*“a perfect spouse and a good mother”*)는 미반영. | PKT *“The accounts vary”*·*“vice, dishonour, depravity”* ↔ KB 「감정에 휩쓸림」·「흐려진 경계」는 현대 해석. | PKT 뒷받침: 잔 속에서 환상을 보는 꿈꾸는 여왕. 스캔 보강: 뚜껑 덮인 컵·물가 왕좌. | - |
| 컵 왕<br>`cups-14` | ○ | ○ | PKT *“responsible, disposed to oblige the Querent”*·*“equity, art and science”* ↔ KB 「너그러운 책임」·「믿을 만한 조언」이 통함. | PKT *“Dishonest, double-dealing man”* ↔ KB 「속을 알 수 없음」이 일부 통함(인물 단정은 출력 안 함, noteKo). | PKT 뒷받침: 오른손 컵·왼손 홀·바다 위 왕좌·배. 차이(표기): PKT *“a dolphin”* ↔ KB 사실문은 '물고기', gloss는 '돌고래'. 스캔 확인: 왼쪽 해양 동물·오른쪽 배. | F-31 |

### 7.4 검

| 카드 | 정 | 역 | 정방향 대조 | 역방향 대조 | 그림 | 플래그 |
|---|---|---|---|---|---|---|
| 검 에이스<br>`swords-01` | ○ | ○ | PKT *“Triumph, the excessive degree in everything, conquest, triumph of force”* ↔ KB 「결단」이 일부 통함. 「분명한 진실」·「새 기준 세우기」는 현대 해석. | PKT *“the results are disastrous”* ↔ KB 「날 선 말」이 통함. | PKT 뒷받침: 구름의 손·관이 씌워진 칼끝. 스캔 확인: 손·구름 왼쪽(KB 일치). 스캔 보강: 올리브·야자 가지·노란 방울 6·산. | - |
| 검 2<br>`swords-02` | ○ | △ | PKT *“Conformity and the equipoise which it suggests”*·*“concord in a state of arms”* ↔ KB 「팽팽한 균형」이 통함. 「결정 보류」·「보고 싶지 않음」은 현대 해석. | PKT *“Imposture, falsehood, duplicity, disloyalty”* ↔ KB 「가리개를 벗음」·「정보가 드러남」은 현대 해석. | PKT 뒷받침: 눈 가린 여인·두 칼을 어깨 위에 균형(*“balances two swords upon her shoulders”*). 스캔 보강: 바다·바위·초승달. | - |
| 검 3<br>`swords-03` | ◎ | ✕ | PKT *“Removal, absence, delay, division, rupture, dispersion”*·*“all that the design signifies naturally”* ↔ KB 「마음의 아픔」·「상처의 인정」. | PKT *“Mental alienation, error, loss, distraction, disorder, confusion”*(악화) ↔ KB 기본 모드 waning의 「아픔이 옅어짐」·「회복의 시작」(완화). | PKT 뒷받침: 칼 세 자루가 꿰뚫은 심장·구름과 비(KB 사실 전부 일치). | F-19 |
| 검 4<br>`swords-04` | ◎ | ○ | PKT *“Vigilance, retreat, solitude, hermit's repose”* ↔ KB 「쉼과 회복」·「혼자만의 시간」. 단 oneLine 「(죽음의 그림이 아님)」은 PKT의 *“tomb and coffin”*과 충돌(플래그). | PKT *“Wise administration, circumspection”* ↔ KB 「회복을 마치고 일어섬」이 통함. | PKT 뒷받침: 무덤 위 기도하는 기사상(*“effigy of a knight”*). 스캔 보강: 벽의 칼 셋·무덤 옆 칼·스테인드글라스. | F-03 |
| 검 5<br>`swords-05` | ◎ | ✕ | PKT *“Degradation, destruction, revocation, infamy, dishonour, loss”* ↔ KB 「이겨도 씁쓸함」·「관계의 손실」. | PKT *“The same; burial and obsequies”*(같은 부정) ↔ KB 기본 모드 waning의 「물러나 화해함」(완화). 「앙금이 남음」은 통함. | PKT 뒷받침: 경멸하는 승자·후퇴하는 두 사람·땅의 칼 둘·승자의 칼 셋(어깨 둘+손 하나). 스캔 보강: 바다·구름. | F-20 |
| 검 6<br>`swords-06` | ◎ | △ | PKT *“Journey by water, route, way, envoy”* ↔ KB 「떠나 건너감」·「조용한 이동」. | PKT *“Declaration, confession, publicity”* ↔ KB 「떠나지 못함」·「이동이 늦어짐」은 현대 해석. | PKT 뒷받침: 승객을 태운 뱃사공·순탄한 물길(*“The course is smooth”*)·가벼운 짐. 스캔 보강: 칼 여섯·물결 위치. | - |
| 검 7<br>`swords-07` | ○ | ○ | PKT *“Design, attempt, wish, hope, confidence”*·*“a plan that may fail”* ↔ KB는 「요령과 편법」·「몰래 챙김」 중심(현대의 '기만' 해석). noteKo가 PKT의 양가성을 공개. | PKT *“Good advice, counsel, instruction”* ↔ KB 「정면으로 말하기」가 통함. *“slander, babbling”*은 미반영. | PKT 뒷받침: 칼 다섯을 들고 감·땅에 꽂힌 칼 둘·가까운 진영. 차이(뉘앙스): PKT *“rapidly”* ↔ KB '발끝으로 살금살금'. 스캔 보강: 모자·옅은 웃음. | F-08 |
| 검 8<br>`swords-08` | ◎ | ✕ | PKT *“power in trammels”*·*“crisis”*·*“temporary durance”* ↔ KB 「갇힌 느낌」·「무력감」. KB gloss(waite-1911) '잠시 갇힌 상태'와 일치. | PKT *“Disquiet, difficulty, opposition, accident, treachery”*(악화) ↔ KB 기본 모드 waning의 「빠져나오기 시작」(완화). 「두려움이 커짐」만 통함. | PKT 뒷받침: 묶이고 눈 가린 여인·둘레의 칼. 스캔 보강: 칼 8(왼쪽 3·오른쪽 5)·성·물웅덩이. | F-21 |
| 검 9<br>`swords-09` | ◎ | ✕ | PKT *“despair”*·*“disappointment”*·*“a card of utter desolation”* ↔ KB 「밤의 걱정」·「혼자 커지는 두려움」. 「불안과 자책」은 현대 초점(PKT는 비탄·절망). | PKT *“Imprisonment, suspicion, doubt, reasonable fear, shame”*(부정) ↔ KB 기본 모드 waning의 「걱정이 옅어짐」·「도움을 청함」(완화). 「속으로 곪는 불안」은 통함. noteKo는 PKT 역방향 내용만 적음. | PKT 뒷받침: 침상(*“couch”*)에서 비탄하는 인물·위의 칼들. 스캔 보강: 칼 9·장미 이불·침대 조각. | F-22 |
| 검 10<br>`swords-10` | ◎ | ○ | PKT *“pain, affliction, tears, sadness, desolation”*·*“It is not especially a card of violent death”* ↔ KB 「바닥을 침」·「고통의 인정」, oneLine 「(실제 죽음이나 폭력의 예언이 아님)」과 일치. | PKT *“Advantage, profit, success, favour, but none of these are permanent”* ↔ KB 「천천히 일어섬」·「회복의 시작」이 통함. | PKT 뒷받침: 칼이 모두 꽂힌 엎드린 인물. 스캔 보강: 붉은 천·새벽빛·물과 산. | - |
| 검 시종<br>`swords-11` | ◎ | ◎ | PKT *“vigilance, spying, examination”* ↔ KB 「예리한 관찰」·「경계하는 호기심」. | PKT *“More evil side of these qualities”* ↔ KB 「캐기와 뒷말」·「지나친 경계」. | PKT 뒷받침: 두 손에 든 칼·험한 땅·거친 구름·좌우를 살핌. 차이(경미): PKT *“swift walking”*·*“upright”* ↔ KB '서 있다'·'비스듬히'. | F-32 |
| 검 기사<br>`swords-12` | ◎ | ◎ | PKT *“Skill, bravery, capacity”*·*“war”*·*“opposition”* ↔ KB 「거침없는 돌진」·「빠른 판단」. | PKT *“Imprudence, incapacity, extravagance”* ↔ KB 「성급한 충돌」·「힘이 빠져 멈춤」. | PKT 뒷받침: 적을 흩는 듯 전속력으로 달림. 스캔 보강: 흰 말·나비 무늬·붉은 망토. | - |
| 검 여왕<br>`swords-13` | ✕ | ○ | PKT *“Widowhood, female sadness and embarrassment, absence, sterility, mourning, privation, separation”*(전부 슬픔·상실) ↔ KB 「분명한 경계」·「독립적인 태도」(긍정). noteKo 공개. 연결: PKT 그림 설명 *“familiarity with sorrow”* ↔ 「경험에서 나온 지혜」. | PKT *“Malice, bigotry, artifice, prudery, bale, deceit”* ↔ KB 「날 선 비판」·「지나친 냉정」이 일부 통함. | PKT 뒷받침: 칼을 곧게 세운 오른손·내민 왼손·엄한 얼굴. 해석 차이: PKT *“It does not represent mercy”* ↔ KB 현대 gloss '내미는 손=대화의 여지'. | F-09, F-23 |
| 검 왕<br>`swords-14` | ◎ | ○ | PKT *“judgment”*·*“power, command, authority, militant intelligence, law”* ↔ KB 「공정한 판단」·「논리와 원칙」. | PKT *“Cruelty, perversity, barbarity, perfidy, evil intention”* ↔ KB 「냉정한 통제」·「권위의 남용」으로 순화. | PKT 뒷받침: 칼을 든 심판의 자리(*“sits in judgment”*). 스캔 보강: 나비·초승달 무늬·새. | - |

### 7.5 펜타클

| 카드 | 정 | 역 | 정방향 대조 | 역방향 대조 | 그림 | 플래그 |
|---|---|---|---|---|---|---|
| 펜타클 에이스<br>`pentacles-01` | ◎ | ○ | PKT *“Perfect contentment, felicity, ecstasy”*·*“gold”* ↔ KB 「손에 잡히는 결실」·「안정의 씨앗」. | PKT *“The evil side of wealth”* ↔ KB 「물질에 매임」이 통함. | PKT 뒷받침: 구름에서 나온 손에 펜타클(KB 사실 일치). 스캔 확인: 손·구름 왼쪽(KB 일치). 스캔 보강: 정원·백합·아치·산. | - |
| 펜타클 2<br>`pentacles-02` | ○ | ◎ | PKT *“gaiety, recreation”*·*“obstacles, agitation, trouble, embroilment”* ↔ KB 「가볍게 즐기기」가 통함. 「균형 잡기」·「여러 일 굴리기」는 현대 해석. | PKT *“Enforced gaiety, simulated enjoyment”* ↔ KB 「억지 명랑함」. | PKT 뒷받침: 춤추는 젊은이·두 펜타클·누운 8자 끈(*“like the number 8 reversed”*). 스캔 보강: 높은 파도·배 두 척. | - |
| 펜타클 3<br>`pentacles-03` | ◎ | ◎ | PKT *“Métier, trade, skilled labour”*·*“nobility, aristocracy, renown, glory”* ↔ KB 「기술과 숙련」·「인정받는 작업」. | PKT *“Mediocrity, in work and otherwise”*·*“pettiness, weakness”* ↔ KB 「평범한 결과」·「인정받지 못함」. | PKT 뒷받침: 수도원의 조각가(*“A sculptor at his work in a monastery”*). 스캔 보강: 두 방문자·설계도·아치 위 펜타클 3. | - |
| 펜타클 4<br>`pentacles-04` | ◎ | △ | PKT *“The surety of possessions, cleaving to that which one has”* ↔ KB 「지키려는 마음」·「닫힌 손」. | PKT *“Suspense, delay, opposition”* ↔ KB 「느슨해진 손」·「나누기 시작」은 현대 해석(혼합). | PKT 뒷받침: 관 위 펜타클·품에 안은 펜타클·발밑 둘(KB 사실 완전 일치). | - |
| 펜타클 5<br>`pentacles-05` | ◎ | ✕ | PKT *“material trouble above all”*·*“destitution”* ↔ KB 「결핍과 걱정」·「어려운 시기」. noteKo: *“a card of love and lovers”* 해석도 공개. | PKT *“Disorder, chaos, ruin, discord, profligacy”*(악화) ↔ KB 기본 모드 waning의 「회복의 시작」·「도움을 받아들임」(완화). 「깊어진 고립」만 통함. | PKT 뒷받침: 눈보라 속 두 걸인·불 켜진 창(*“a lighted casement”*). 스캔 보강: 목발·붕대·방울·펜타클 5. | F-24 |
| 펜타클 6<br>`pentacles-06` | ◎ | ○ | PKT *“Presents, gifts, gratification”* ↔ KB 「나눔과 도움」·「주고받음」. | PKT *“Desire, cupidity, envy, jealousy, illusion”* ↔ KB 「조건 있는 도움」·「기울어진 관계」가 *“cupidity”*와 통함. | PKT 뒷받침: 저울을 든 상인·궁핍한 이에게 나눠 줌. 스캔 보강: 두 사람 무릎·공중 펜타클 6. | - |
| 펜타클 7<br>`pentacles-07` | ○ | △ | PKT *“money, business, barter”*·*“altercation, quarrel”* 또는 *“innocence, ingenuity, purgation”*의 모순 ↔ KB 「중간 점검」·「인내와 기다림」은 현대 해석. gloss(waite-1911) '보물을 바라봄'은 일치. | PKT *“Cause for anxiety regarding money which it may be proposed to lend”* ↔ KB 「조급한 수확」·「헛수고 같은 느낌」은 현대 해석. | 차이: PKT *“seven pentacles attached to a clump of greenery”*·*“staff”* ↔ KB·스캔은 덤불 여섯+발치 하나·괭이형 도구(스캔 확인). 뒷받침: 펜타클을 바라보는 젊은이. | F-33 |
| 펜타클 8<br>`pentacles-08` | ◎ | ○ | PKT *“Work, employment, commission, craftsmanship”*·*“perhaps in the preparatory stage”* ↔ KB 「꾸준한 연습」·「기술 익히기」. | PKT *“Voided ambition, vanity, cupidity”* ↔ KB 「방향 없는 노력」이 *“Voided ambition”*과 통함. | PKT 뒷받침: 돌을 다루는 장인·완성품을 전시(*“exhibits in the form of trophies”*). 스캔 보강: 펜타클 8개 배치. | - |
| 펜타클 9<br>`pentacles-09` | ◎ | ○ | PKT *“Prudence, safety, success, accomplishment, certitude, discernment”* ↔ KB 「자립과 여유」·「스스로 이룬 풍요」. | PKT *“Roguery, deception, voided project, bad faith”* ↔ KB 「겉만 번듯함」이 *“deception”*과 통함. | PKT 뒷받침: 손목의 새·포도밭·저택. 스캔 보강: 두건 쓴 매·달팽이. | - |
| 펜타클 10<br>`pentacles-10` | ◎ | ○ | PKT *“Gain, riches; family matters”*·*“the abode of a family”* ↔ KB 「가족과 유산」·「오래 가는 안정」. | PKT *“Chance, fatality, loss, robbery”* ↔ KB 「유산과 돈 문제」·「집안 갈등」이 *“loss”*와 통함. | PKT 뒷받침: 아치 아래 남녀·아이·노인과 개 두 마리·집(*“two dogs accosting an ancient personage”*). 스캔 보강: 펜타클 10 배치·문장 방패. | - |
| 펜타클 시종<br>`pentacles-11` | ◎ | ○ | PKT *“Application, study, scholarship, reflection”* ↔ KB 「배움의 시작」·「성실한 호기심」. | PKT *“Prodigality, dissipation”* ↔ KB 「흩어진 집중」이 *“dissipation”*과 통함. | PKT 뒷받침: 펜타클을 응시하는 젊은이·주변을 의식 못 함. 스캔 보강: 초원·밭. | F-35 |
| 펜타클 기사<br>`pentacles-12` | ◎ | ◎ | PKT *“Utility, serviceableness, interest, responsibility, rectitude”* ↔ KB 「꾸준함」·「신중한 책임」. | PKT *“inertia, idleness”*·*“stagnation”* ↔ KB 「정체」·「지루함과 무기력」. | PKT 뒷받침: 느리고 무거운 말(*“a slow, enduring, heavy horse”*)·상징을 내보임. 누락: PKT *“does not look therein”*(들여다보지 않음)은 스캔 불확실로 제외(README 명시). | - |
| 펜타클 여왕<br>`pentacles-13` | ◎ | △ | PKT *“Opulence, generosity, magnificence, security, liberty”* ↔ KB 「풍요로운 안정」·「현실적인 돌봄」. | PKT *“Evil, suspicion, suspense, fear, mistrust”* ↔ KB 「돌봄에 지침」·「나를 돌보지 못함」은 현대('번아웃') 해석. | PKT 뒷받침: 상징을 응시(*“she contemplates her symbol”*). 스캔 보강: 염소 머리 팔걸이·토끼·장미 덩굴. | - |
| 펜타클 왕<br>`pentacles-14` | ◎ | ○ | PKT *“Valour, realizing intelligence, business”* ↔ KB 「관리와 경영」·「든든한 책임」. | PKT *“Vice, weakness, ugliness, perversity, corruption, peril”* ↔ KB 「욕심과 과시」·「고집스러운 안정」으로 순화. | PKT 뒷받침: 왕좌의 황소 머리(*“The bull's head”*). 스캔 보강: 포도 무늬 옷·성·발치 짐승 머리 조각(스캔 불확실, README 명시). | - |

---

## 부록 A. 자동 대조 기록

| 검사 | 결과 |
|---|---|
| KB `waite.upright/reversed` ↔ Wikisource III §2·§3 | 78/78 일치(공백·대소문자 정규화 뒤). 펜타클 4 역방향 앞의 세미콜론 1건은 Wikisource 원문 표기다. 단 Wikisource 자체의 전사 오류가 KB로 옮겨진 2곳은 아래 교차 확인 행 참조 |
| KB `imagery.waiteDescription` ↔ Wikisource III §2 그림 서술 | 56/56 일치 |
| KB `waite.loc` | 메이저 22장 "PKT Part III §3", 마이너 56장 "PKT Part III §2" |
| KB `sources[].loc` | 78/78 일관(메이저는 "Part II §2 {번호}, Part III §3", 마이너는 "Part III §2 {수트}") |
| Wikisource ↔ Gutenberg #43548 | 철자(미/영식)·하이픈·구두점을 정규화한 뒤 점술 의미·그림 서술이 일치. 남은 차이: 심판 정방향 though/through(F-34), 펜타클 시종 역방향 구두점(F-35), 펜타클 왕은 de Laurence판이 축약(KB는 Rider판 문장). 메이저 그림 서술 22/22 단어 유사도 0.99 이상 |
| `names.ko/en/ja`, 번호, 로마 숫자 | 이상 없음(힘 VIII, 정의 XI는 PKT II §2와 같은 순서). 한국어 번역어 선택(교황, 시종 등)은 평가하지 않음 |
| 골든 던 대응(`attributions`) | 메이저 22장·마이너 36장 표준 데칸 표와 일치. PKT 범위 밖이라 참고만 |
| `noteKo` 내용 | 58장을 모두 읽고 PKT 서술과 어긋나는 곳을 찾지 못함 |
| `glosses[].school = waite-1911` 귀속 | PKT 문장과 대조해 악마 1건만 귀속 오류(F-02) |

## 부록 B. 직접 본 스캔 19장

`apps/web/public/cards/`의 1909 스캔 중 PKT와 충돌이 의심되거나 좌우·수량을 단정한 곳을 확인했다: 마법사, 바보, 교황, 전차, 악마, 탑, 죽음, 절제, 심판, 완드 3, 완드 8, 컵 에이스, 컵 2, 컵 시종, 컵 왕, 검 에이스, 검 시종, 펜타클 에이스, 펜타클 7. 확인 결과 KB의 좌우·수량 단정(손과 구름의 방향, 지팡이 방향, 배 세 척, 여섯 명, 물줄기 다섯, 여섯+하나)은 모두 스캔과 맞았다.

