# 타로 카드 지식베이스 (Starlog KB)

Starlog AI 리딩 생성기가 근거로 쓰는 RWS 78장 카드 지식베이스입니다. 한국어 원고, JSON 데이터입니다.

- 스키마: `starlog-tarot-kb/1` (schemaVersion 1)
- 덱: `rws-1909-pcs` (Pamela Colman Smith 1909 원판 스캔)
- 상태: **초안(draft)**. 사람 검수 전입니다. 모든 카드의 `review.status`는 `"draft"`, `imagery.verified.humanReviewed`는 `false`입니다. 전문가 검수를 마치기 전에는 "검수 완료"라고 표기하지 않습니다(기획서 D6).
- 설계 근거: `docs/research/tarot-reading-quality.md` 2절(KB 스키마), 2.5(역방향 정책), 3절(생성 스펙), 4절(루브릭)

## 파일

```
content/kb/
├─ README.md             이 문서
└─ cards/
   ├─ _index.json        카드 id 목록, 스키마 버전, 공용 코드표, 주제·자리 매핑
   └─ {id}.json          카드 1장당 1파일 (78개)
```

`{id}`는 `packages/core/src/tarot/cards.ts`의 id와 같고, 이미지 파일명(`apps/web/public/cards/{id}.webp`)과도 같습니다. 예: `major-09-hermit`, `wands-01`, `pentacles-14`.

## 카드 파일 스키마

| 필드 | 타입 | 내용 |
|---|---|---|
| `schema` | string | `"starlog-tarot-kb/1"` |
| `id` | string | cards.ts id |
| `deck` | string | `"rws-1909-pcs"` |
| `image` | string | 웹 경로 `/cards/{id}.webp` |
| `names` | `{ko, ja, en, koAliases?}` | ko·ja·en은 cards.ts 그대로. `koAliases`는 R1(카드명 추출) 정규식 사전용 별칭 |
| `arcana` | `"major"｜"minor"` | |
| `suit` | `"wands"｜"cups"｜"swords"｜"pentacles"｜null` | |
| `rank` | string｜null | `"ace"`, `"2"`…`"10"`, `"page"`, `"knight"`, `"queen"`, `"king"`. 메이저는 null |
| `number` | number | 메이저 0–21(인쇄 번호), 마이너 1–14. 내부 인덱스와 섞지 않음 |
| `roman` | string | 메이저만. 인쇄 번호(`"IX"`) |
| `element` | string | cards.ts의 원소(골든 던 대응) |
| `attributions` | `{system, astrology, use}` | 골든 던 점성 대응. `use: "study-only"` — 선택형 공부 층, 기본 출력 금지 |
| `keywordsKo` | string[3–6] | 짧은 키워드. 무료 카드 키워드·목차 재료 |
| `imagery` | object | 아래 표 |
| `core` | object | 아래 표 |
| `reversedModes` | `{default, allowed[], gloss{}}` | 역방향 모드. 아래 "역방향 정책" |
| `asFeelings` | `{upright, reversed}` | **사용자 본인**의 감정 각도(해요체). 타인 감정 단정용 아님 |
| `topics` | `{love, contact, work, choice, self, group}` 각 `{upright, reversed}` | 주제별 읽기 각도 1~2문장(해요체). 예언 아님 |
| `positionHints` | `{[자리 이름]: {upright, reversed}}` | 템플릿 자리에 놓였을 때의 읽기. 키는 templates.ts의 자리 이름 |
| `actionHints` | `[{orientation, ko}]` | 오늘 할 수 있는 작은 행동. `orientation`: `upright｜reversed｜both` |
| `cautions` | `[{code, doNotClaim, instead}]` | 이 카드로 주장하면 안 되는 것과 대신 할 말 |
| `combinations` | `[{with｜withGroup, ko}]` | 주목할 조합. `with`는 카드 id, `withGroup`은 `"suit:wands"` 같은 묶음 |
| `court` | `{asPerson, asAttitude}` | 궁정 카드(11–14)만. 사람으로 읽을 때와 태도로 읽을 때 |
| `numerology` | `{stage}` | 숫자·여정 단계. 스프레드 결정적 사실(같은 숫자 반복 등)에 사용 |
| `safety` | `{highRisk, forbid[]}` | 고위험 카드 여부, 이 카드의 `cautions` 코드 모음 |
| `waite` | `{upright, reversed, loc, noteKo?, doNotOutput:true}` | Waite 1910/1911 원문 점술 의미(영문, 퍼블릭 도메인). **출력 금지**, 참고만 |
| `sources` | array | 근거 목록 |
| `review` | `{status, reviewer, history}` | 검수 상태 |

### `imagery`

| 필드 | 내용 |
|---|---|
| `sideConvention` | 장면 속 위치(왼쪽·오른쪽·위·아래)는 **보는 사람 기준**, 손·발·무릎은 **그림 속 인물 자신 기준** |
| `facts[]` | `{id, ko, salience}`. 1909 스캔에 실제로 그려진 것만. 위치·방향·개수까지. `salience` 1=핵심(카드 절 첫 문장감), 2=보조, 3=배경. 카드당 5~8개 |
| `commonMisdescriptions[]` | `{wrong, correct, regex}`. 흔한 오묘사. `regex`는 JS `RegExp` 소스 문자열로, R3 자동 검사에 그대로 씁니다 |
| `glosses[]` | `{factId, ko, school}`. 그림 사실의 상징 해석. `school`: `waite-1911`(원전), `modern`(현대 통용), `editorial`(Starlog 편집) |
| `reversedImageryMetaphor[]` | 역방향일 때 허용하는 그림 은유. 현재 모두 빈 배열 → 역방향이어도 원래 그림 사실로만 묘사 |
| `waiteDescription` | 마이너만. PKT Part III의 그림 설명 원문(영문, 대조용) |
| `verified` | `{scan, method, by:"ai-draft", humanReviewed:false, at, uncertain?}`. `uncertain`은 스캔에서 확정하지 못한 점 |

### `core`

| 필드 | 내용 |
|---|---|
| `upright[]`, `reversed[]` | 짧은 한국어 구(3~5개). 현대 의미. 역방향은 정방향의 단순 반대가 아님 |
| `oneLine` | `{upright, reversed}` 한 줄 요약(40자 안팎) |
| `shadow` | 정방향이라도 지나치면 생기는 그늘. 알림 문구에는 쓰지 않고 "다르게 볼 수 있는 부분"(R14) 재료로 씀 |

## 역방향 정책

조사 문서 2.5를 따릅니다.

- **켠다.** 확률은 덱 규칙으로 공개(기본 0.5). 결과를 좋게 만들려고 몰래 바꾸지 않습니다. 0.5면 3장 리딩의 87.5%에 역방향이 1장 이상 들어가므로 역방향 원고도 정방향과 같은 분량·같은 기준으로 썼습니다.
- **모드 4가지** (단순 반대 `opposite`는 금지)

  | 코드 | 한국어 | 뜻 |
  |---|---|---|
  | `blocked` | 막힘 | 흐름이 막히거나 늦어짐 |
  | `internalized` | 안으로 | 겉으로 안 나오고 안에서 진행됨 |
  | `excess` | 과함 | 정방향 성질이 지나침 |
  | `waning` | 약해짐 | 그 카드의 국면이 약해지거나 끝나감 |

- **카드별 설정**: `reversedModes.allowed`는 그 카드에 맞는 모드(2~3개), `default`는 기본 모드, `gloss`는 모드별 한 줄 풀이입니다.
- **자리가 기본값을 바꿀 수 있음**: '먼저 움직이면'은 `blocked`가 허용되면 우선, '나의 마음'은 `internalized`가 허용되면 우선. 허용 목록에 없는 모드는 쓰지 않습니다.
- **한 리딩 안에서 고정**: 개요(outline)에 카드별 `reversedMode`와 고른 이유를 적고, 산문과 후속 질문에서 바꾸지 않습니다. 바꿔야 하면 새 사용자 사실(U-id)을 근거로 밝힙니다.
- **결과 자리의 역방향은 "하지 마"가 아님**: '먼저 움직이면' 역방향 `positionHints`는 모두 "지금 조건으로는 이렇게 되기 쉬우니, 조건을 바꾼 뒤 다시 보라"는 형태로 썼습니다.
- **그림 묘사**: 역방향이어도 원래 그림 사실(`facts`)로 묘사합니다. "뒤집혀 쏟아지는 물" 같은 가공은 `reversedImageryMetaphor`에 등록된 것만 허용(현재 없음).
- **화면 도움말**(1회): "역방향은 '반대'나 '나쁨'이 아니라, 그 카드의 힘이 막히거나 안으로 향하거나 지나친 상태로 읽어요."

## 생성기는 각 필드를 이렇게 씁니다

파이프라인 2단계(근거 묶음)에서 뽑힌 카드마다 아래를 넘기고, 3단계 개요 → 5단계 산문 → 6단계 자동 검사에서 씁니다.

1. **`imagery.facts`** — 산문에서 허용되는 **유일한 시각 주장**입니다. 카드 절 첫 문장은 `salience: 1` fact에서 고르고, 개요의 `imageryUsed`에 fact `id`를 기록합니다(R8). KB에 없는 시각 묘사는 R3 실패입니다.
2. **`imagery.commonMisdescriptions[].regex`** — R3 정규식 검사에 그대로 씁니다. 매치 0이어야 합니다. 빌드 때 이 정규식이 같은 카드의 `facts`·`topics`·`positionHints` 문장과 겹치지 않는지 확인했습니다.
3. **`imagery.glosses`** — 그림의 뜻을 풀 때 씁니다. `school`이 갈리면 "~로 읽어요"처럼 해석임을 드러냅니다. `waite-1911` 해석은 현대 해석과 다를 수 있으니 한쪽만 쓸 때는 `modern`을 우선합니다.
4. **`core`** — 개요의 `claim` 재료. `shadow`는 대안 해석(R14) 재료.
5. **`reversedModes`** — 위 정책대로 모드를 고르고 그 `gloss`로 읽습니다.
6. **`topics`** — 질문 주제에 맞는 각도. 템플릿이 아니라 **사용자가 고른 주제(TopicDef)**로 고릅니다. `_index.json`의 `topicMap`(예: `us.reunion → ["contact","love"]`, `me.money → ["self"]`)을 쓰고, 첫 번째가 주 각도입니다.
7. **`positionHints`** — 자리 렌즈. 키는 자리 이름이며 여러 템플릿에 같은 이름('나의 마음')이 있으면 같은 뜻으로 씁니다. 모든 카드에 '나의 마음'·'두 사람 사이'·'먼저 움직이면'·'오늘의 한 장'이 있고, 나머지 자리는 카드와 잘 맞을 때만 있습니다. 없으면 `_index.json`의 `positionFallback`대로 `position`(비슷한 자리) → `topic`(주제 각도) + 템플릿의 자리 렌즈 순으로 조합합니다. '이쪽을 고르면'과 '저쪽을 고르면'은 같은 렌즈라 서로 대체합니다.
8. **`asFeelings`** — 사용자 **본인**의 감정만. '두 사람 사이' 같은 자리에서 상대 쪽을 말할 때는 "분위기·흐름"까지만 씁니다(R9).
9. **`actionHints`** — "오늘 해볼 작은 행동" 재료. 방향(`orientation`)이 맞는 것만 씁니다. 사용자 조건 칩에 맞게 다듬되 새 사실을 지어내지 않습니다.
10. **`cautions`** — 개요의 `boundaries`와 경계 문장의 근거. 코드는 아래 표. 경계 문장은 리딩당 1회면 충분합니다(반복하면 책임 회피처럼 들림).
11. **`combinations`** — "세 카드 연결" 절 재료. 뽑힌 카드끼리 `with`가 맞을 때만 씁니다. 뽑히지 않은 카드를 언급하려면 개요 `crossReferences`에 등록해야 합니다(R1). "번호 16과 17" 같은 번호 연결은 입력에 없는 사건을 가정하지 않도록 조합 문구 안에 주의를 달아 두었습니다.
12. **`court`** — 궁정 카드는 **태도(`asAttitude`)로 먼저** 읽습니다. 사람(`asPerson`)으로 읽을 때도 나이·성별·외모로 특정 인물을 지목하지 않고, 그 인물의 속마음은 다루지 않습니다.
13. **`numerology.stage`** — 같은 숫자·계급 반복(PKT §5) 등 결정적 스프레드 사실 계산에 씁니다. 카드 번호로 날짜를 만들지 않습니다(NO_DATE).
14. **`safety.highRisk`** — `true`인 8장(죽음, 악마, 탑, 달, 검 3·9·10, 펜타클 5)은 문자 그대로의 죽음·질병·사고 해석을 막는 `NO_HEALTH` 경계를 반드시 포함합니다. 사용자 입력에 건강 불안이 있으면 의료 판단은 전문가 몫이라는 문장을 1회 넣습니다.
15. **`waite`** — `doNotOutput: true`. 출력에 직접 쓰지 않습니다. 역사 층과 현대 층을 구분하기 위한 보관용입니다(조사 문서 1.3, 1.13).
16. **`attributions`** — 선택형 공부 층. 사용자가 켜지 않으면 출력하지 않습니다. 원소 위계(3.2)는 `element` 필드로 계산합니다.

### 주장 금지 코드 (`cautions[].code`, `safety.forbid`)

| 코드 | 금지하는 주장 |
|---|---|
| `NO_EVENT` | 현실 사건·결과 단정(재회·합격·계약·이별·이사 확정 등) |
| `NO_MIND` | 타인의 속마음·의도 단정 |
| `NO_HEALTH` | 건강·질병·임신·사고·죽음 예언이나 진단 |
| `NO_MONEY` | 투자·재정 결과 단정, 매수·지출 부추김 |
| `NO_DATE` | 카드 번호·장수로 날짜나 기간 만들기 |
| `NO_SCORE` | 길흉 점수·확률·궁합 점수 |

## 글쓰기 규칙 (원고에 적용한 것)

- 문장 필드(`topics`, `positionHints`, `asFeelings`, `actionHints`)는 해요체로 끝납니다.
- 해석은 "~로 읽어요", "~쪽으로 읽어요", "~일 수 있어요"처럼 해석임을 드러냅니다.
- 카드를 주어로 세우지 않습니다("은둔자는 ~라고 말해요" 금지, R12).
- 금지어: 반드시, 무조건, 100%, 틀림없이, 운명(카드 이름 제외), 우주가, 에너지가 흐르, 때가 되면, 절대로.
- 타인의 감정·의도를 사실로 쓰지 않습니다.
- 행동 제안은 오늘 할 수 있는 작은 크기로 씁니다.
- Biddy Tarot·Labyrinthos 등 다른 사이트의 문장을 옮기지 않았습니다. Waite 원문은 퍼블릭 도메인이라 `waite`·`waiteDescription`에 영문 그대로 두었습니다.

## 근거 자료

| id | 자료 | 쓰임 |
|---|---|---|
| `scan-1909` | `apps/web/public/cards/{id}.webp` (1909 RWS 스캔, 600×1028) | 그림 사실. 78장 모두 한 장씩 직접 보고 작성. 개수·방향이 애매한 곳은 확대해서 확인(은둔자 등불, 힘 손·꽃 넝쿨, 컵 에이스 물줄기) |
| `PKT-1910` | A. E. Waite, *The Pictorial Key to the Tarot* (Wikisource, 1910/1922 판). Part II §2(메이저 그림), Part III §2(마이너 그림·점술 의미), §3(메이저 점술 의미) | 그림 사실 대조, `waite`, `waite-1911` 해석 |
| `editorial` | Starlog 편집 원고 | 현대 의미, 주제·자리 각도, 행동, 경계 |
| — | `docs/research/tarot-reading-quality.md` | 스키마, 역방향 정책, 루브릭 |
| — | `content/samples/tarot-contact.ko.json` | 골드 샘플과의 일관성 |

## 골드 샘플과 맞춘 점

- **은둔자**: 등불은 오른손으로 머리 높이까지 들어 올림, 시선은 아래, 왼손에 노란 지팡이, 등불 창살 사이 별 모양 선, 회색 두건·흰 수염, 하얀 봉우리. 키워드 "혼자 마음을 고르는 중". "등불을 낮게 들어 발밑을 비춘다"는 오묘사로 등록.
- **별**: 큰 노란 별 1개와 작은 흰 별 7개, 왼 무릎은 땅·오른발은 물 위, 오른손 항아리는 연못·왼손 항아리는 땅, 땅의 물은 여러 갈래. 키워드 "다시 채워지는 연못". "한 발은 땅, 한 발은 물"은 오묘사로 등록.
- **완드 에이스**: 오른쪽 구름에서 나온 손, 싹 난 지팡이, 떨어지는 잎 8장(스캔에서 셈), 왼쪽 언덕 위 성, 강과 나무. 키워드 "막 돋은 새싹 하나". "불타는 지팡이"는 오묘사로 등록.
- 세 장의 '나의 마음'·'두 사람 사이'·'먼저 움직이면' 힌트와 `contact` 주제 문장은 샘플 유료본의 읽기 방향(내 쪽 답 먼저 확인 / 끊김보다 다시 채워질 여지, 속마음은 확인 안 됨 / 대화 재개 크기)과 같게 썼습니다.

## 스캔에서 확정하지 못한 점 (`imagery.verified.uncertain`)

| 카드 | 내용 |
|---|---|
| 힘 | 꽃 넝쿨이 사자 목을 한 바퀴 두르는지는 불분명. 갈기 쪽으로 이어지는 것까지만 사실로 씀 |
| 은둔자 | 등불 속 별의 꼭짓점 수는 창살에 가려 셀 수 없음(조사 문서는 여섯으로 기록) |
| 컵 에이스 | 컵의 글자는 흔히 뒤집힌 M(W)으로 설명되지만 스캔에서는 좌우 뒤집힌 N에 가까움. 사실에는 "글자 모양 표시"로만 씀 |
| 검 10 | 몸 아래 붉은 부분은 주름 선으로 보아 천(망토)에 가깝지만 피로 읽는 해설도 있음. "붉은 천"으로만 묘사 |
| 펜타클 왕 | 발치의 짐승 머리 조각(흔히 멧돼지)은 형태가 또렷하지 않음 |

그 밖에 Waite 글과 1909 그림이 다른 곳은 그림을 따랐습니다. 전차(Waite는 "칼", 그림은 지팡이), 컵 에이스(Waite는 물줄기 넷, 그림은 다섯), 펜타클 기사("상징을 들여다보지 않는다"는 Waite 설명은 스캔으로 확인이 안 돼 사실에서 뺌).

## 수정할 때

- 이 JSON이 원본입니다. 카드 파일을 직접 고치고, 스키마를 바꾸면 `_index.json`의 `schemaVersion`과 이 문서를 함께 올립니다.
- 그림 사실을 고칠 때는 스캔을 다시 보고, 같은 카드의 `commonMisdescriptions[].regex`가 새 사실 문장과 겹치지 않는지 확인합니다.
- 사람 검수를 마치면 해당 카드의 `review.status`, `review.reviewer`, `imagery.verified.humanReviewed`를 바꾸고 `review.history`에 기록합니다.

## 조사 문서 스키마(2.2)와 다른 이름

JSON camelCase에 맞추고 과제 명세의 필드명을 따랐습니다.

| 조사 문서 | 이 KB |
|---|---|
| `cardId` | `id` |
| `imagery.notDepicted` | `imagery.commonMisdescriptions` (`wrong`·`correct`·`regex`) |
| `misreadings` | `cautions` (`code`·`doNotClaim`·`instead`) |
| `core.upright.themes` / `oneLineKo` / `shadow` | `core.upright[]` / `core.oneLine` / `core.shadow` |
| `core.reversed.allowedModes` / `defaultMode` / `modeNotes` | `reversedModes.allowed` / `default` / `gloss` |
| `core.waite1911` | `waite` |
| `topics.gathering` | `topics.group` |
| `asAction` | `actionHints[]` |
| `positionHints` 키 `템플릿.자리` | 자리 이름만(같은 이름은 같은 렌즈) + `_index.json`의 `positionFallback` |
| `image.sha1` | 없음(`image`는 웹 경로). sha1 고정이 필요하면 추가 |
