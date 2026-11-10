# 사주 등급 카드와 1,900원 등급 풀이 (설계, 2026-11-11)

> 사장님 결정(2026-11-11): 무료 등급 카드(규칙 계산, 로그인 없음) · 풀이 본문은 점수 없음 유지 · 1,900원 '등급의 이유' 상품 추가.
> 조사: D:/Money/apps/saju-tarot-marketing/reports/AI 사주 등급 바이럴 서비스.md


## 요약

사주 등급 카드는 AI를 쓰지 않는 규칙 카드로 만들자. 점수는 **올해 들어오는 세운 두 글자가 내 명식의 다섯 기운을 얼마나 고르게 채우고 상생으로 잇는지**를 보고 매기고, 사람이나 사주의 좋고 나쁨은 다루지 않아. 명리 쪽에서 반박받지 않게 유파마다 판단이 갈리는 신강·신약, 용신, 격국, 조후, 합화는 일부러 뺐어. 앱이 이미 지키는 원칙이기도 해(`D:/Money/apps/saju-tarot/apps/web/lib/ai/validate.ts:664`, `D:/Money/apps/saju-tarot/apps/web/lib/sajuBalance.ts:9`).

임시 스크립트로 전체 조합을 돌려 분포를 재 봤어. 고려한 안 가운데 어느 10년 창에서도 "열 해 내내 C"인 명식이 0개인 건 v1뿐이었어. 상위 %의 모집단은 518,400이 아니라 **561,600**이야. 스타로그 엔진이 밤 11시대 시주를 다음 날 천간으로 세기 때문이고, 엔진으로 직접 확인했어. 1,900원 상품은 프리미엄 경로가 아니라 **표준 단건 경로(catalog STANDARD)**에 얹고, 사러 갈 때 예전 표준 결제권을 쓰지 않도록 상품 지정 결제권(earmark)만 쓰게 하자.

---

## 0. 코디네이터 전제 하나 정정

엔진(`D:/Money/apps/saju-tarot/packages/core/src/saju`)에 충·합·형·파·해가 없다는 말은 맞아. 다만 **웹 쪽에는 이미 있어.**
- `D:/Money/apps/saju-tarot/apps/web/lib/ai/prompts/saju.ts:80-105`에 육합·충·해·파·삼형·삼합·방합·천간합·천간충 표가 있고, `:128-196`에 `branchRelations`·`stemRelations`·`relationsWithin`가 있어. 다만 server-only 파일이라 브라우저에서는 못 써.
- 4,900원 정통 사주는 이미 이 관계들을 사실로 받아(`saju.ts:648`). 프롬프트 규칙도 붙어 있어: 사건으로 읽지 않기, 化 말하지 않기(`:720`), 한 절에 관계 하나(`:754`, `:811`).
- 별자리 인연 점수에도 따로 만든 표가 있어(`D:/Money/apps/saju-tarot/packages/core/src/bonds/score.ts:39-40`, `:73-87`). 그런데 **반합 규칙이 서로 달라.** saju.ts는 왕지(子午卯酉)가 들어가야 반합으로 치고(`:142`), bonds는 같은 삼합 무리 아무 둘이면 쳐(`score.ts:82`). 이건 유파 차이가 코드 안에 이미 들어와 있다는 뜻이야.

그래서 엔진 작업은 **새로 쓰는 게 아니라 core로 옮기고 출처를 붙이는 일**이야(F의 C1). v1 등급 점수에는 합·충을 안 넣었어. 이유는 A8에 적었어.

---

## A. 등급 규칙

### A1. 등급이 뭘 뜻하나
- 카드 이름: **올해의 사주 등급**
- 등급 바로 아래 고정 문구: "등급은 사람이나 사주의 좋고 나쁨이 아니에요. 올해 들어오는 기운이 내 명식의 다섯 기운을 얼마나 고르게 채우고 잇는지를 스타로그 규칙으로 계산한 거예요. 해마다 바뀌어요."
- 규칙은 판 번호를 붙여 전부 공개해: `SAJU_GRADE_RULE = { id: "starlog-grade-v1", date: "2026-11-xx" }`. 같은 입력이면 언제나 같은 결과야.

### A2. 엔진이 계산하는 것 중에서 쓰는 것
엔진이 주는 값은 기둥과 십성, 지장간(`chart.ts:33-43`), 보이는 8글자의 오행 개수(`:153-158`), 대운(`:86-94`), 신살 6종(`sinsal.ts`)이야. 신강·용신·격국은 없어(`sajuBalance.ts:9`).

등급에 쓰는 건 이것뿐이야.
- **보이는 글자**: 시를 알면 8개, 모르면 6개. 지장간은 안 세(BalanceCard와 같은 기준).
- **오행 배속**과 **상생 순서**
- **입춘 기준 세운 간지**

대운은 뺐어. 대운은 성별과 생시에 따라 달라서 모집단을 조합으로 셀 수 없게 돼. 대운은 유료 풀이에서 배경 설명으로만 써.

### A3. 공식 v1
내부 점수는 0~100이고 화면에는 절대 안 나와.

**점수 = 18×고르기 + 12×흐름 + 70×올해 순위**

| 항목 | 계산 |
|---|---|
| 고르기 g (0~1) | 오행 개수 c_k와 n/5의 차이를 다 더한 값을 dev라고 해. g = 1 − (dev − 가장 고르게 나눴을 때 dev) / (한 오행에 몰렸을 때 dev − 가장 고르게 나눴을 때 dev) |
| 흐름 f (0~1) | 이웃한 글자 쌍을 봐. 천간끼리 좌우 3쌍, 지지끼리 좌우 3쌍, 같은 기둥 위아래 4쌍으로 모두 10쌍이야(시를 모르면 7쌍). 상생이면 1, 같은 오행이면 0.5, 상극이면 0을 주고 평균을 내. |
| 올해 맞음 m(Y) | 30 × clamp((세운 2글자를 더한 뒤 g − 원래 g + 0.2) / 0.5, 0, 1) + 20 × (세운이 새로 이은 상생 고리 수) / 2 |
| 올해 순위 r(Y) | 이 명식이 만나는 60갑자 세운 60개 가운데 m(Y)의 순위(0~1, 동점은 평균). "60가지 해 가운데 올해가 나한테 얼마나 맞는 해인가"라는 뜻이야. |
| 등급 | 그해 세운으로 모집단 전체를 같은 방식으로 채점해. 위에서 8%까지 S, 30%까지 A, 70%까지 B, 나머지는 C. 동점은 같은 등급. |

순위 방식을 고른 이유: 원국 점수에 세운 점수를 그냥 더하는 방식(원국 50 + 세운 50)은 10년 내내 C인 명식이 0.47~1.26% 나왔어. 자기 60해 안 순위를 쓰면 이게 0이 돼.

### A4. 척도와 별칭
4단계로 하고 D는 안 둘게. 학교 낙제 느낌을 피하려고. 달이 차고 기우는 모양으로 묶었고, 별칭은 상태나 행동을 나타내는 말이야. 경쟁사 문구와 겹치지 않아.

| 등급 | 목표 비율 | 별칭 | 카드 한 줄 |
|---|---|---|---|
| S | 위 8% | 보름달 사주주 | 올해 들어오는 기운이 내 명식의 빈칸을 고르게 채워 주는 해예요. |
| A | 다음 22% | 차오르는 달 사주주 | 빈칸 대부분이 채워지는 해예요. 조금씩 다듬으면 고르게 돌아요. |
| B | 다음 40% | 초승달 사주주 | 채워지는 칸과 겹치는 칸이 섞인 해예요. 하나씩 쌓아 가기 좋아요. |
| C | 나머지 30% | 달빛 모으는 사주주 | 올해 기운이 이미 많은 쪽과 겹치는 해예요. 빈칸을 새로 모으는 때예요. |

그림은 기존 파일만 써. `D:/Money/apps/saju-tarot/apps/web/public/characters`에 있는 사주주(토끼) 파일은 6개야.
- `rabbit-hanbok.v2-300.webp`, `rabbit-hanbok.v2-600.webp`: 사주 복장. 등급 카드에는 이걸 공용으로 써.
- `rabbit-tarot.v1-300/600.webp`, `rabbit-tarot-write.v1-300/600.webp`: 타로 복장
- 연결: `D:/Money/apps/saju-tarot/apps/web/components/characters/plush.tsx:15-18`

등급마다 다른 건 CSS로 그리는 달 모양 배지뿐이야. 이건 캐릭터 그림이 아니야.

### A5. 시기에 따라 바뀌나
바뀌어. 카드는 지금 KST 기준 세운(입춘 경계)으로 나오고, 아래에 10년 칩이 있어(2026 병오 S · 2027 정미 A …). 칩을 누르면 카드가 그해 등급으로 바뀌어.

시를 아는 경우 측정 결과야.
- 60해 동안 받는 등급 종류: 3종 23.9%, 4종 76.1%. 한 종류만 받는 명식은 0%야.
- 어느 10년 창에서도 내내 C인 명식은 0개야.
- 10년 동안 A를 한 번도 못 받는 명식은 많아야 8.4%야.
- 10년 동안 S를 한 번 이상 받는 명식은 적어도 39%야.

### A6. 상위 %와 모집단
엔진 기본 정책이 `SPLIT_NEXT_DAY_STEM`이야(`D:/Money/apps/saju-tarot/packages/core/src/saju/policy.ts:24`, `:51`). 엔진에 2024-03-10 23:30을 넣어 보면 계유일에 시주는 **갑자시**가 나와. 오서둔대로라면 임자시여야 해. 그래서 하루에 시주가 13개야.

- 시를 알 때: **561,600 = 연 60 × 월 12 × 일 60 × 시 13**
- 시를 모를 때: **43,200 = 60 × 12 × 60**

실제 달력에 나오는지도 manseryeok으로 세 봤어(연·월·일주 기준).

| 범위 | 나오는 조합 | 비율 |
|---|---|---|
| 1800~2100 (엔진 지원 범위) | 43,200 | 100% |
| 1900~2100 | 43,151 | 99.9% |
| 1900~2026년생 | 34,236 | 79.3% |

그래서 이 숫자는 인구 통계가 아니야.

- 표시 문구: "가능한 사주 조합 561,600개 가운데 위에서 12% · 연 60 × 월 12 × 일 60 × 시 13(밤 11시대를 다음 날 천간으로 세는 스타로그 기준)을 하나씩 같은 무게로 센 순위예요. 인구 통계가 아니에요." 시를 모르면 "시를 모르는 사주 조합 43,200개"라고 써.
- 표시 위치(기본값): 카드 아래 "등급은 어떻게 나와요?" 접힌 칸 안. 카드 앞면과 공유 이미지에는 안 넣어.
- 미리 계산: 세운 60개 × {시 앎, 모름} = 120개 표를 만들어.
  - `sajuGradeCuts.generated.json`(약 2KB): 등급 경계 점수. 기본 번들에 넣어.
  - `sajuGradeRanks.generated.json`: 점수별 누적 개수. 상위 %는 접힌 칸을 열 때만 동적 import로 불러와(번들 무게 때문).
  - 선례: `D:/Money/apps/saju-tarot/apps/web/lib/decision.ts:3-6`

### A7. 분포가 쏠리지 않는지 측정한 결과
임시 스크립트로 쟀어(저장소 밖, `C:\Users\최용우\AppData\Local\Temp\claude\8c14fb0c289473d9\11f3b511-f2fa-4168-89bd-874d0001e2df\scratchpad\grade\final.mjs`, `stuck2.mjs`).

| 지표 | 시 앎 561,600 | 시 모름 43,200 |
|---|---|---|
| 해마다 서로 다른 점수 수(최소) | 78 | 71 |
| 가장 많은 동점 비율 | 6.6% | 5.6% |
| 등급 비율과 목표(8/22/40/30)의 최대 차이 | 2.8%p | 3.1%p |
| 어느 10년 창이든 내내 C | 0개 | 0개 |
| 60해 평균 S 비율(일간 목/화/토/금/수) | 9.3/9.4/6.6/8.9/9.0 | 9.4/9.6/7.2/9.7/9.7 |

**알려야 할 쏠림이 하나 있어.** 그해 오행과 같은 일간은 그해 등급이 낮게 나와.
- 2026 병오년: 화 일간은 S 0.0%, C 50%
- 2027 정미년: 화 일간 C 47%, 토 일간 C 36%
- 2028 무신년: 금 일간 C 49%

규칙대로 계산하면 이렇게 나오는 게 맞아. 같은 기운이 겹치니까. 다만 출시 시점이 병오년이라 how 페이지에 측정값 그대로 적고 G4에서 확인받자.

저장소에 넣을 검증 스크립트는 `D:/Money/apps/saju-tarot/scripts/saju-grade-report.test.ts`야(vitest 별도 config, 명령은 `pnpm grade:table`). 아래를 assert해.
- 해마다 서로 다른 점수 60개 이상
- 동점 8% 이하
- 목표 비율과 4%p 이하 차이
- 60개 시작점 모든 10년 창에서 내내 C 0개
- 일간별 60해 평균 S가 6~11%
- 모든 명식이 60해 동안 2종 이상의 등급을 받음

### A8. 항목별 근거 자료와 유파 차이 (코디네이터 요청 2)
주의: 아래 장 이름은 **내가 원문과 대조하지 못했어.** 구현 커밋 전에 ctext.org 등에서 원문을 대조하고, 코드 주석에 출처를 붙여야 해. 지금 `sinsal.ts`에는 출처가 하나도 없어.

| 항목 | 쓰는 표·개념 | 근거 자료(대조 필요) | 유파 차이 |
|---|---|---|---|
| 천간·지지 오행 배속 | 甲乙木 …, 子水·丑土 … | 오행대의(五行大義), 연해자평 | 없음 |
| 상생·상극 순서 | 木→火→土→金→水 | 오행대의 상생·상극 장 | 없음 |
| 월주 천간(오호둔)·시주 천간(오서둔) | 표 | 연해자평·삼명통회의 월건·시건법 | 없음 |
| 야자시 | 23시대 시주를 다음 날 천간으로 | 스타로그 정책(`policy.ts:24`) | **갈림**: 23시에 일진을 바꾸는 쪽이면 모집단이 518,400 |
| 보이는 글자만 셈 | 지장간 제외 | 자체 기준 | **갈림**: 지장간 가중, 월령(득령) 가중 |
| 고르기 | 중화(中和) | 적천수, 임철초 적천수천미 | **갈림**: 원래 중화는 일간 강약(억부) 기준이야. 여기서는 분포로 단순화했어(자체 기준이라고 명시) |
| 흐름 | 위아래·좌우 관계, 통근·개두·절각 | 적천수 "上下貴乎情協 左右貴乎同志" 구절(위치 대조 필요), 통근은 자평진전 | **갈림**: 위치 가중치, 합으로 바뀌는 관계 |
| 세운 | 입춘 기준 해 간지 | 연해자평의 세운 | **갈림**: 동지·설 기준 설이 있음. 입춘을 씀 |
| 올해 순위 | 자기 60해 안 순위 | 자체 기준 | 고전 근거 없음. 그렇다고 공개해 |
| 합·충·형·파·해 (v1 점수에는 없음) | 육합, 삼합, 방합, 충, 해, 파, 삼형·자형, 천간합·천간충 | 삼명통회 권2의 육합·삼합·충·삼형·육해 장(장 이름 대조 필요), 연해자평 | **갈림**: 파를 쓰는지(寅亥·巳申은 합이면서 파), 삼형이 두 글자로도 성립하는지, 자형 목록, 반합 범위, 천간충, 합화 조건 |

v1 점수에서 합·충을 뺀 이유는 세 가지야. 충을 감점하면 "부딪혀서 등급이 낮다"는 무서운 해석이 생겨. 합을 가점하면 합화와 탐합 판단이 유파마다 갈려. 반합 규칙은 이미 코드 두 곳이 서로 달라. 필요하면 v2에서 전문가 검토를 거쳐 합만 "결속" 가점으로 넣는 걸 검토하자.

---

## B. 흐름과 화면

### 경로
| 경로 | 내용 |
|---|---|
| `/saju/grade` | 입력과 결과를 한 화면에서. 브라우저에서 계산해. `?y=2028`(칩), `?unlock=paid` 정도만 주소에 남아. |
| `/saju/grade/[slug]` | 공유된 카드 |
| `/saju/grade/how` | 규칙 공개 페이지. 검색에도 노출. |
| `/saju/grade/sample` | 견본 |

`saju`는 이미 `APP_SEGMENTS`에 있어서 앱 호스트 라우팅은 그대로 돼(`D:/Money/apps/saju-tarot/apps/web/lib/hostRoutes.ts:72-75`).

### 들어오는 곳
1. **홈**: 사주 보기 행(`D:/Money/apps/saju-tarot/apps/web/components/home/HomeEntries.tsx:54-72`) 아래에 얇은 행 "올해 내 사주 등급은? · 로그인 없이 무료"
2. **/saju/start**: 주제 고르기(`D:/Money/apps/saju-tarot/apps/web/app/saju/start/page.tsx:37-39`) 아래에 작은 링크
3. **무료 명식 뒤**: `ChartPanel`(`D:/Money/apps/saju-tarot/apps/web/components/saju/ChartPanel.tsx:17-22`)에 "이 명식의 올해 등급" 미니 카드. 같은 차트로 바로 계산해. 손님도 볼 수 있어.
4. **가이드**: 오행 관련 글 하단에 안내 문구, how 페이지 링크
5. **공유 링크**

### 입력 (기존 것 재사용)
- 저장된 프로필이 있으면 결과부터 보여 줘(`useSajuProfile`, `D:/Money/apps/saju-tarot/apps/web/lib/sajuFlow.ts:92`).
- 없으면 예시 카드(DEFAULT_SAJU_FORM으로 계산한 결과, "예시" 표시)를 위에 두고 그 아래 `SajuFields`를 놔(`D:/Money/apps/saju-tarot/apps/web/components/saju/SajuForm.tsx:105`).
- `SajuFields`에 옵션 두 개를 추가해야 해(`:89-99`).
  - `chips={false}`: 연애·일 상태 칩 숨김
  - `consentLabel`: "출생 정보를 등급 계산에 쓰는 데 동의해요"
- 제출하면 `onDone`에서 `saveSajuProfile`(`sajuFlow.ts:58`)을 부르고 `chartFor`(`D:/Money/apps/saju-tarot/apps/web/components/saju/useSajuChart.ts:11`)로 계산해.
- "친구 생일로 해 보기"는 저장 없이 컴포넌트 상태로만 처리해(BirthCardForm과 같은 방식).

### 결과 화면 (375px, 위에서 아래로)
1. 뒤로 가기
2. **캡처되는 카드**(약 343px)
   - 맨 위 작은 글씨: "2026 병오년 · 올해의 사주 등급"
   - 달 모양 배지 안에 큰 글자 S
   - 별칭 "보름달 사주주"
   - 사주주 그림(`Rabbit outfit="hanbok"` 약 120px)
   - 등급 한 줄
   - 카드 맨 아래 `starlog.yeolmaeapps.kr`
3. 고정 문구: "등급은 좋고 나쁨이 아니에요 …"
4. 10년 칩(가로 스크롤)
5. **규칙으로 만든 한 줄 관찰 3개.** 등급을 만든 재료 그대로라서 정직해.
   - 고르기: "다섯 기운 가운데 넷이 보여요. 물(수)이 비어 있어요." 또는 "불(화)이 네 글자로 가장 많아요."
   - 흐름: "이웃한 글자 10쌍 가운데 6쌍이 서로 살려 주는 사이(상생)예요."
   - 올해 만남: "2026 병오년의 불 기운 두 글자가 비어 있던 칸을 채워요." 겹치거나 반반인 경우도 문구를 따로 둬. 끝에 "다음 S·A 해: 2028 무신년".
   - 단어는 `ELEMENT_WORD` 표기를 써(`sajuBalance.ts:16`).
6. 공유: [친구는 어떤 등급일까?] [스토리용 이미지(9:16)], 그 옆에 "이름·생년월일은 들어가지 않아요"
7. **잠긴 이유 칸**
   - 제목: "이 등급인 이유 · 5개 중 0개 공개"
   - 소제목 5개를 자물쇠와 함께 보여 줘(D의 목차와 같음).
   - 범위 줄: "내 명식에 맞춘 풀이 · 2,000자 이상 · 1,900원 · 열기 전 7일 안 전액 환불 · 견본 보기"
   - 버튼: `UnlockSheet` + `unlockOffer(account, product)`(`D:/Money/apps/saju-tarot/apps/web/lib/pay/offer.ts:46`)
8. "등급은 어떻게 나와요?" 접힌 칸: 규칙 요약, 모집단, 상위 %, 판 번호, how 링크
9. **다음 풀이 안내**(위로 문장과 떨어진 아래쪽에 따로 둬)
   - 사주 전체 풀이 4,900원
   - 2027 신년운세 14,900원(판매 기간 안에만)
   - 프리미엄 궁합 7,900원
   - 12/1부터는 세트 18,900원. `sellable(set, now)`(`D:/Money/apps/saju-tarot/apps/web/lib/pay/catalog.ts:108`)일 때만 보여 줘. 타이머는 없어.
10. "재미와 참고를 위한 계산" 고지

### 로그인을 묻는 곳
1,900원 버튼 하나뿐이야. 순서는 이래.
1. 손님이 버튼을 누르면 `LoginFirst`와 `loginHref("/saju/grade?y=2026")`로 로그인
2. 결제 화면 `checkoutHref("saju-grade", …)`
3. 결제 뒤 `?unlock=paid`로 돌아오면 자동으로 열어. 이 패턴은 `D:/Money/apps/saju-tarot/apps/web/app/saju/chart/SajuChartView.tsx:270-278`에 있어.
4. 생성 화면을 거쳐 `/chapter/[id]`

등급 카드, 칩, 관찰, 공유에는 로그인이 없어.

---

## C. 공유

- **주소에는 등급과 해만 넣어.** `/saju/grade/2026-s` 같은 모양이야. 2026~2035년 × 4등급 = 40개를 `generateStaticParams`로 미리 만들고, `dynamicParams = true`로 엣지 누락에 대비해. 나머지 주소는 404야. 패턴은 `D:/Money/apps/saju-tarot/apps/web/app/birth-card/[card]/page.tsx:26-30`과 `:38-40`. 생년월일, 관찰 내용, 상위 %는 넣지 않아. 서명이나 저장된 id도 필요 없어.
- **OG 이미지**: `app/api/og/saju-grade/[slug]/route.tsx`와 `lib/og/gradeImage.tsx`
  - 크기: 1200×630, `?size=story`면 1080×1920(`D:/Money/apps/saju-tarot/apps/web/lib/og/cardsImage.tsx:11-12`)
  - 그림: `inline()`으로 `rabbit-hanbok.v2-600.webp`
  - 글꼴: `ogFonts`(`D:/Money/apps/saju-tarot/apps/web/lib/og/googleFont.ts:3-7`)
  - 캐시: 슬러그 단위로 하루(`D:/Money/apps/saju-tarot/apps/web/app/api/og/birth-card/[card]/route.tsx`와 같은 구조)
  - 이미지 안에 호스트 표기를 넣어.
- **스토리 이미지**: `ShareImageButton imageUrl="/api/og/saju-grade/2026-s?size=story"`. 선례는 `D:/Money/apps/saju-tarot/apps/web/app/chapter/[id]/PremiumChapterView.tsx:124-139`.
- **"친구는 어떤 등급일까?"**: `ShareButton` 타깃(`birth-card/[card]/page.tsx:121-124`과 같은 형태). 문구는 "나는 올해 S · 보름달 사주주. 너는?".
- **공유받은 사람이 자기 카드로 가는 길**
  - 이 기기에 프로필이 있으면 "내 등급 보기" 한 번에 바로 가.
  - 없으면 같은 페이지 `#find`의 입력란으로 한 번에 가.
  - 결과 위에 비교 한 줄을 띄워: "친구 S · 나 B — 2028년엔 나도 S예요". 주소의 등급과 내 계산 결과로 만들어.
  - 그 아래 "둘 사이가 궁금하면: 프리미엄 궁합"
- 카카오 앱 내 브라우저에서는 이미지 저장이 안 될 수 있어. `D:/Money/apps/saju-tarot/apps/web/lib/inApp.ts`로 감지해서 안내하자.

---

## D. 1,900원 상품

### 기본 정보
- **id** `saju-grade`, **이름** "사주 등급 풀이", **설명** "무료 등급 카드가 그렇게 나온 이유"
- **가격** `SITE.price.sajuGradeKrw = 1900`(`D:/Money/apps/saju-tarot/apps/web/lib/config.ts:38-64`)

### 어느 경로에 얹나: 표준 단건
- `D:/Money/apps/saju-tarot/apps/web/lib/pay/catalog.ts:8`의 `StandardProductId`를 넓히고 `:43-46` STANDARD에 추가해. `opensAt`은 약관 시행일로.
- **같이 고쳐야 할 것 (중요)**: `planUnlock`(`D:/Money/apps/saju-tarot/apps/web/lib/api/unlock.ts:82`, `:145`)이 `reserveUnlock`을 부를 때 `earmarked: true`를 넘겨야 해(`D:/Money/apps/saju-tarot/apps/web/lib/pay/ledger.ts:263-266`). 안 그러면 상품을 지정하지 않은 결제권(product_id NULL)이 1,900원 풀이에 쓰여서 이용자가 손해를 봐.
- **프리미엄 경로를 안 쓰는 이유**: 프리미엄은 AI 미리보기(`D:/Money/apps/saju-tarot/apps/web/lib/premium/routes.ts:60-110`), 여러 파트로 이어 쓰기(`:113-167`), 이어서 물어보기 3번(`D:/Money/apps/saju-tarot/apps/web/lib/premium/products.ts:40`), 페이지 3종, `STARLOG_PREMIUM` 플래그를 다 끌고 와. 1,900원에는 비용도 작업도 너무 커. 게다가 맛보기 역할은 무료 카드가 이미 해.
- **판매 플래그**: `NEXT_PUBLIC_SAJU_GRADE` = off/owner/on. `sajuTopicsMode` 패턴을 따라(`config.ts:14`).
- **보관**: 풀이 종류 `saju-grade`로 저장해. 그러려면 마이그레이션 `0024`에서 readings 테이블을 다시 만들어야 해(0003 패턴, `D:/Money/apps/saju-tarot/apps/web/migrations/0003_premium_readings.sql:10`. 먼저 백업).
  - chapterToken 문맥: `{ kind: "saju-grade"; birth; year; paid? }`(`D:/Money/apps/saju-tarot/apps/web/lib/security/chapterToken.ts:31` 옆)
  - 이어서 물어보기 라우트는 이 종류를 거절해(`D:/Money/apps/saju-tarot/apps/web/app/api/followup/route.ts:52`).
  - v1에서는 유료 풀이 공유를 막아. 그러면 shares 테이블 CHECK를 다시 만들 일(`0014_more_share_kinds.sql:8`)이 없어.

### 프롬프트와 검증
- **생성 종류**: `saju-grade-reading`. 환경 변수 접미사 `SAJU_GRADE`, effort medium, `BASE_MAX_TOKENS` 24000(`D:/Money/apps/saju-tarot/apps/web/lib/ai/config.ts:19-76`).
- **사실 묶음** `lib/ai/prompts/sajuGrade.ts`
  - 서버가 `checkSajuForm`으로 차트를 다시 계산하고, core의 grade로 다시 채점해(`D:/Money/apps/saju-tarot/apps/web/lib/api/sajuRequest.ts:26-30` 패턴).
  - 모델에 주는 것: 항목별 순위를 쉬운 말로, 오행 개수, 빈 오행과 많은 오행, 이웃 쌍 목록(자리·관계), 세운 두 글자와 효과, 칩에 나오는 해들(분류만, 예: "빈칸을 많이 채우는 해"), 현재 대운(배경), 관계는 있다는 사실만.
  - **글자 등급, 별칭, 점수, %는 모델에 넘기지 않아.** 그래야 본문에 점수가 안 들어간다는 기존 규칙이 그대로 지켜져. 등급은 본문 밖 머리글에서 규칙으로만 보여 줘.
- **구조와 분량** (공백 제외, 소제목은 고정)

| 소제목 | 분량 |
|---|---|
| 가장 크게 힘이 된 것 | 820~1,000자 |
| 아직 덜 채워진 칸 | 820~1,000자 |
| 언제, 무엇이 달라지나 | 660~800자 |
| 올해 이렇게 써 보기 | 340~420자 |
| 확인해 볼 신호 | 80~120자 |

목표 합계는 2,720~3,340자야. 허용 오차 0.25를 적용한 하한 합이 2,040이라서 **"2,000자 이상"**을 보장할 수 있어. 하한 계산법은 `products.ts:22-26`과 같아.

- **검증기** `lib/ai/validateSajuGrade.ts`. 대부분 기존 걸 재사용해.
  - `lengthCheck`와 `TOLERANCE`(`D:/Money/apps/saju-tarot/apps/web/lib/ai/validate.ts:35`)
  - `SAJU_BLOCKLIST`(`:643-661`): 점수·확률·퍼센트·운명, "좋은 해" 같은 시기 등급
  - `GLANCE_GRADE`(`:847-854`)를 본문 전체에: 등급·점수·%·별점·길흉·최고·최악
  - `GLANCE_SCHOOL`(`:856`): 신강·용신·격국·조후 금지
  - `GLANCE_REMEDY`(`:862-870`)를 넷째 절에: 색·방향·물건으로 보완하는 말 금지
  - 용어가 괄호 밖에 있는지 검사(`:913`)
  - 간지 허용 목록(`:881-889`)에 칩 해들을 더해서
  - **새로 만들 것**: 등급 글자와 별칭 금지(`/[SABC]\s?(등급|급)|보름달 사주주|…/`), 칩 밖의 해 금지, 절마다 근거 앵커 확인(첫 절은 가장 강한 항목의 오행 말, 둘째 절은 빈 오행이나 많은 오행, 셋째 절은 칩에 있는 해 1개 이상)
  - 위기 표현: 이 상품은 이용자가 쓰는 글이 없어서 위기 검사(crisisCheck)가 필요 없어.
- **목업** `lib/ai/mockSajuGrade.ts`(`mockSajuTopics.ts` 패턴)

### 결제 화면, 환불, 가격·약관 페이지
- **결제 목차**: `CHECKOUT_TOC["saju-grade"]`에 위 소제목 5개(`D:/Money/apps/saju-tarot/apps/web/lib/pay/toc.ts:11-17`)
- **범위 줄**: `scopeLines`에 분기 추가(`D:/Money/apps/saju-tarot/apps/web/app/pay/checkout/CheckoutView.tsx:50-62`): "사주 등급 풀이 전체 · 2,000자 이상", "2026 병오년 등급의 이유", "이어서 물어보기는 없어요", "내 기록에 계속 보관"
- **환불 문구**: 표준 문구 그대로야(`:74-75`): "열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요." 결제 직후 자동으로 열린다는 점도 같아(약관 `D:/Money/apps/saju-tarot/apps/web/app/terms/page.tsx:248`).
- **가격 페이지**: `PRODUCTS`에 셋째 줄 추가, `PRICE_SUMMARY`와 메타 설명 수정(`D:/Money/apps/saju-tarot/apps/web/app/pricing/page.tsx:22`, `:31-50`, `:53`)
- **약관**: 제2조의 전체 풀이 정의(`terms/page.tsx:158`)에 "이어서 물어보기 포함"이 들어 있어. 그래서 정의를 하나 더 넣어야 해: "사주 등급 풀이: 무료 등급 카드가 그렇게 나온 이유를 적은 풀이. 건별 1,900원, 이어서 물어보기 없음."
  - 이용자에게 불리한 변경이 아니니 **7일 전 공지**로 충분해(`:166`).
  - `D:/Money/apps/saju-tarot/apps/web/lib/legal.ts`에 `GRADE_RULE_DATE`를 추가해. 패턴은 `SET_RULE_DATE`(`:138-143`): 시행 전엔 "바뀌는 내용", 시행 후 30일은 "바뀐 내용". 판매 시작일이 곧 이 날짜야.
  - 환불 페이지에 한 줄, 개인정보처리방침에 한 줄(같은 날, 7일 공지).
  - 무료 카드는 약관과 상관없어서 공지 전에 먼저 내보내도 돼.
- **견본**: `/saju/grade/sample`. 예시 프로필로 한 번 생성하고 검수해서 `content/samples/saju-grade.ko.json`에 넣어. 그리고 `D:/Money/apps/saju-tarot/scripts/check-client-bundle.mjs:12-14`의 samples 목록에 등록해야 유료 글이 클라이언트 번들에 새는 걸 막아.
- **메타 Purchase**: `PaySuccess.tsx:112`의 `trackMetaPurchase(orderId, amount)`로 value 1,900 KRW가 자동으로 나가. 손댈 건 없어. 광고를 가치 기준으로 최적화한다면 평균 구매 가치가 내려간다는 것만 알아 둬.

---

## E. 준수와 안전

- **오락 고지**(카드 아래): "재미로 보는 계산이에요. 사람이나 사주의 좋고 나쁨, 앞으로 일어날 일을 정하지 않아요. 규칙은 '등급은 어떻게 나와요?'에 다 적어 두었어요." "정확", "과학적"은 쓰지 않아. 규칙 공개는 정확도 주장이 아니라 투명성이야. 모델명이나 회사명은 쓰지 않아("AI가 아니라 정해진 규칙으로 계산해요"까지는 괜찮아).
- **위기 안내**: 카드에는 안 붙여. 등급이 괴로운 결과처럼 읽힐 수 있어서야. `/saju/grade/how`와 FAQ에 `CrisisContacts`를 둬(`D:/Money/apps/saju-tarot/apps/web/lib/crisis.ts:1-6`). 유료 풀이도 이용자 글이 없어.
- **개인정보**
  - 무료 카드: 생일은 브라우저에서만 계산하고, 저장은 본인이 동의했을 때 `starlog.saju-profile`(localStorage)에만 해. 생일이 주소에 들어가지 않는다는 기존 원칙과 같아(`sajuFlow.ts:8-12`).
  - 공유 주소와 OG 라우트는 슬러그만 받아.
  - 유료 풀이는 사주 풀이와 같은 본문으로 서버에 가고, 암호화해서 D1에 보관해(readings.payload).
  - GA·메타 픽셀: 이 경로는 비공개 경로 목록에 해당하지 않아(`D:/Money/apps/saju-tarot/apps/web/lib/metaPixel.ts:16`). 주소에 개인정보도 없어.
- **로그인 없이 쓰는 것** (이번 작업 반영 후): 질문 만들기와 카드 뽑기, 무료 사주 명식, 지금의 한 장, 탄생 카드, 2027 키워드, 이번 주 행운 번호(인연 기능이 켜졌을 때), 공유받은 링크, **사주 등급 카드와 공유 카드, 규칙 페이지**. 초대받은 친구는 11/11부터 로그인이 필요해(`legal.ts:113`).
- **로그인이 필요한 것**: 모든 AI 풀이(맛보기, 오늘의 한 장, 전체 풀이, 프리미엄, 사주 등급 풀이).
- **FAQ와 llms 수정**
  - `D:/Money/apps/saju-tarot/apps/web/lib/faq.ts:99`(무료 범위), `:119`(로그인)
  - 새 질문 "C가 나왔어요. 안 좋은 건가요?": 우리 말로 새로 써
  - `D:/Money/apps/saju-tarot/apps/web/lib/llms.ts:25`의 무료 목록, 링크 목록에 `/saju/grade`와 how 페이지 추가

---

## F. 구현 계획 (테스트 먼저, 커밋마다 따로 검증 가능)

| # | 커밋 | 주요 파일 | 먼저 쓸 테스트 |
|---|---|---|---|
| C1 | **관계표를 core로 옮기고 출처 붙이기** (코디네이터 요청 1) | 새 `packages/core/src/saju/relations.ts`. `apps/web/lib/ai/prompts/saju.ts:80-196`은 import로 바꿔. bonds 점수는 공개된 값이라 그대로 둠 | 표 대칭, 寅亥·巳申이 합이면서 파인지, 자형은 같은 차트 안에서만인지. 기존 사실 스냅숏(saju.test, premiumPlumbing 스냅숏)이 안 바뀌는지 |
| C2 | 등급 규칙 | `packages/core/src/saju/grade.ts`(점수 계산, 60해 순위, 조합 열거기, 판 번호) | 손으로 계산한 명식 3개, 같은 입력 같은 결과, 시 모름이면 6글자, 야자시 조합 포함 |
| C3 | 미리 계산한 표 | `scripts/saju-grade-report.test.ts`, vitest 별도 config, `pnpm grade:table`, `lib/sajuGrade*.generated.json` | 병오·정미 표를 다시 계산해서 JSON과 같은지, A7의 assert 전부 |
| C4 | 웹 로직 | `apps/web/lib/sajuGrade.ts`(등급·별칭·지금 세운·칩·관찰 문장·생시에 따라 등급이 바뀌는지 알림) | 모든 관찰 문장 조합이 금지어 검사를 통과하는지, 경계 시각 경고가 있을 때 다른 등급을 알려 주는지 |
| C5 | 무료 카드 화면 | `app/saju/grade/page.tsx`, `GradeView.tsx`, `components/saju/GradeCard.tsx`, `SajuFields` 옵션, `/saju/grade/how` | e2e `e2e/saju-grade.spec.ts`: 로그인 없이 카드가 뜨는지, 생일을 실은 요청이 0건인지, 주소에 생일이 없는지, 칩이 바뀌는지, 375px에 맞는지(fit, screens) |
| C6 | 공유와 OG | `app/saju/grade/[slug]/page.tsx`, `app/api/og/saju-grade/[slug]/route.tsx`, `lib/og/gradeImage.tsx` | 잘못된 슬러그는 404, 스토리 크기, 공유 e2e(공유 페이지에서 한 번에 내 등급, 비교 한 줄) |
| C7 | 들어오는 곳 | HomeEntries, saju/start, ChartPanel, 가이드 | home.spec, saju-story.spec |
| C8 | 무료 카드 문구와 정책 | faq, llms, 개인정보 한 줄 | llms.test, FAQ 테스트 |
| C9 | 상품 배관(꺼진 상태로) | config, catalog(+earmark), unlock.ts, 플래그, toc, CheckoutView, pricing, `migrations/0024` | catalog와 toc 테스트, ledger 통합 테스트 "상품 미지정 결제권은 saju-grade를 못 연다", offer 테스트 |
| C10 | AI | config(새 생성 종류), `prompts/sajuGrade.ts`, schemas, `validateSajuGrade.ts`, mock | 나쁜 초안이 걸리는지(등급, 점수, %, S등급, 신강, 색, 없는 해, 짧은 절), 사실 묶음에 글자 등급·점수가 없는지, 상품명 금지(promptNames) |
| C11 | 라우트와 챕터 | `app/api/saju/grade/reading/route.ts`, chapterToken, storage/chapters, ChapterView 머리글, 이어서 물어보기 거절 | pay-flow e2e(토스 목업): 로그인 → 결제 → 자동 열림 → 2,000자 이상(목업), 열기 전 내 정보에서 환불 |
| C12 | 약관과 공지 | `lib/legal.ts`의 `GRADE_RULE_DATE`, terms, refund, privacy | setRule.test 패턴 |
| C13 | 정통 사주 무료 관계 칩 (아래 별도 안) | `components/saju/RelationChips.tsx` | 칩 테스트 |
| C14 | 실제 생성 측정 | `scripts/saju-grade-real.test.ts` | 실제 5회 돌려서 분량, 검증 통과율, 비용 측정. 비용 들어서 승인 필요 |

### AI 원가 추정 (풀이 1건, 실측 전 추정치)
- **근거**: 기본 모델 출력 단가 $20/M(`D:/Money/apps/saju-tarot/apps/web/lib/ai/cost.ts:10`). "1,500자 ≈ 생각 포함 출력 7~9k 토큰"(`config.ts:63` 주석). 환율 1,500원/달러(`cost.ts:29-31`, 여유분 포함). 실패하면 한 번 다시 시도(`D:/Money/apps/saju-tarot/apps/web/lib/ai/generate.ts:158`).
- **출력**: 약 3,000자면 출력 약 14~18k 토큰 → $0.28~0.36
- **입력**: 캐시가 맞으면 약 $0.01, 첫 호출은 약 $0.03
- **합계**: 보통 **약 450~570원**, 다시 시도하면 **최대 약 1,100원**
- **남는 돈**: 1,900원에서 부가세 약 173원, PG 수수료(추정 3.3~3.5%, 약 65원. 계약 수수료는 확인 못 했어)를 빼면 약 1,660원. 원가를 빼면 보통 약 1,090~1,210원(66~73%), 최악 약 560원.
- **실측 계획**: 5회 실측 비용은 약 $1.8(약 2,700원)이고, 돌리기 전에 승인받아야 해.

### 위험
- **readings 테이블 재생성 마이그레이션**: 운영 D1에서 돌아. 백업 필수.
- **병오년 동안 화 일간의 절반이 C**: 평판 위험. A7과 G4 참고.
- **유파 반론**: "중화는 일간 기준"이라는 반박이 올 수 있어. how 페이지에 자체 기준이라고 명시해.
- **검증기가 정상 글을 막을 수 있음**: 시기 등급 정규식(`validate.ts:660`) 같은 것. 프롬프트에서 "좋은 해" 대신 "고르게 채워지는 해"라고 쓰라고 지시해.
- **번들 크기**: 순위 표는 동적 import로 빼.
- **카카오 앱 내 브라우저**: 저장과 공유가 안 될 수 있어.

---

## 정통 사주에 충·합·형·파·해를 더하는 안 (코디네이터 요청 3, 짧게)

- **지금 상태**: 4,900원 풀이는 이미 이 관계들을 사실로 받아 쉬운 말로 한 개씩 쓰고 있어(`saju.ts:648`, `:720`, `:754`, `:811`). 무료 명식에는 하나도 안 나와.
- **무료 칩** (C13, AI 없음): ChartPanel에 "글자끼리 맺은 관계" 칩을 넣어. **합과 충만** 보여 줘.
  - 이름: 묶이려는 짝(육합), 세 글자가 모인 무리(삼합), 계절이 모인 무리(방합), 위 글자끼리 묶이려는 짝(천간합), 정면으로 마주 보는 짝(충) + 자리 표시
  - 탭하면: "사건으로 읽지 않아요. 이런 배치가 있다는 것만 보여 줘요."
  - **형·파·해는 무료 칩에서 보류**해. 이름 자체가 형벌·깨짐·해침이라 무섭고, 표도 유파마다 갈려. 보류 중인 신살과 같은 처리야.
- **유료 정통 사주**: "한 절에 하나" 규칙은 그대로 두고, 계산 기준 절에 규칙으로 만든 관계 목록 표를 붙여. 정확도를 투명하게 보여 주려는 거야.
- **검증기 추가**: 관계를 사건으로 읽는 말을 막아(예: "충이 있어서 이별·이사·사고"). 지금은 프롬프트 규칙(`:720`)으로만 막고 있는데, 이걸 코드로 강제해.

---

## G. 사장님 확인이 필요한 것 (괄호 안이 내 기본 추천)

1. 등급을 4단계로 하고 D를 없애고, 달 모양 별칭을 쓸지 (그대로 진행)
2. 상위 %를 어디에 보여 줄지 (카드 아래 접힌 칸에만. 공유 이미지에는 안 넣음)
3. 1,900원 풀이에 이어서 물어보기를 넣을지 (0번. 약관에 정의 추가)
4. 병오년에 화 일간의 절반이 C로 나오는 걸 그대로 둘지 (그대로. 규칙 공개 페이지에 측정값을 적고, 다음 S·A 해를 카드에 보여 줌)
5. 등급별로 사주주 그림을 따로 그릴지 (기존 `rabbit-hanbok.v2` 공용. 생성하지 않음)

---

## 트레이드오프

| 선택지 | 좋은 점 | 아쉬운 점 |
|---|---|---|
| v1: 원국 30 + 자기 60해 순위 70 (추천) | 10년 내내 C 0개, 공용 표만 써서 명리로 방어 가능, 해마다 달라짐 | 고전 근거가 없는 자체 기준. 그해 오행과 같은 일간이 불리함 |
| 원국 50 + 세운 50 그대로 더하기 | 설명이 더 직관적 | 10년 내내 C 0.47~1.26% |
| 합·충을 점수에 넣기 | 명리 쪽 "깊이"가 있어 보임 | 무서운 해석, 합화·반합 유파 갈림, 이미 코드 두 곳이 서로 다름 |
| 상품을 표준 단건 경로로 | 작업이 작고, 결제·환불 흐름을 그대로 씀 | 결제권 지정 수정과 테이블 재생성 마이그레이션이 필요 |
| 상품을 프리미엄 경로로 | 이어 쓰기, 미리보기, 페이지 틀이 다 있음 | 1,900원에 비해 원가와 작업이 과하고, 미리보기가 무료 카드와 겹침 |
| 저장을 kind `saju`로 재사용 | 마이그레이션 없음 | 사주 관련 분기 전부에 예외 처리가 필요해서 로직 위험이 커짐 |

**반론**: 신강·신약을 보는 명리가는 "약한 화 일간에게 병오년은 도움이 되는 해"라고 할 거야. 그 반박은 맞아. 그래서 등급을 "좋은 해"가 아니라 "고르게 채워지는 해"라고만 부르고, 그 한계를 공개하는 걸로 대응해.

---

## 참고 파일

- `D:/Money/apps/saju-tarot/packages/core/src/saju/chart.ts:111-158`: 기둥, 일간, 오행 개수
- `D:/Money/apps/saju-tarot/packages/core/src/saju/policy.ts:24-25`, `:48-51`, `:103-104`: 야자시 정책, 지원 날짜 범위
- `D:/Money/apps/saju-tarot/packages/core/src/saju/sinsal.ts:1-4`: 출처 없음
- `D:/Money/apps/saju-tarot/packages/core/src/bonds/score.ts:39-40`, `:73-87`: 원진, 반합 규칙 차이
- `D:/Money/apps/saju-tarot/apps/web/lib/ai/prompts/saju.ts:80-196`, `:648`, `:720`, `:754`, `:811`: 관계표와 정통 사주 규칙
- `D:/Money/apps/saju-tarot/apps/web/lib/sajuBalance.ts:3-10`, `:16`
- `D:/Money/apps/saju-tarot/apps/web/lib/ai/validate.ts:35`, `:643-664`, `:846-870`, `:881-889`, `:913`
- `D:/Money/apps/saju-tarot/apps/web/lib/ai/config.ts:19-76`, `D:/Money/apps/saju-tarot/apps/web/lib/ai/cost.ts:10`, `:29-31`, `D:/Money/apps/saju-tarot/apps/web/lib/ai/generate.ts:158`
- `D:/Money/apps/saju-tarot/apps/web/lib/pay/catalog.ts:8`, `:41-46`, `:108`; `D:/Money/apps/saju-tarot/apps/web/lib/pay/ledger.ts:263-266`; `D:/Money/apps/saju-tarot/apps/web/lib/api/unlock.ts:82`, `:145`
- `D:/Money/apps/saju-tarot/apps/web/lib/pay/toc.ts:11-17`; `D:/Money/apps/saju-tarot/apps/web/app/pay/checkout/CheckoutView.tsx:50-75`; `D:/Money/apps/saju-tarot/apps/web/lib/pay/offer.ts:46`, `:56`
- `D:/Money/apps/saju-tarot/apps/web/lib/premium/routes.ts:60-167`; `D:/Money/apps/saju-tarot/apps/web/lib/premium/products.ts:22-60`
- `D:/Money/apps/saju-tarot/apps/web/components/saju/SajuForm.tsx:89-107`, `:185-189`; `D:/Money/apps/saju-tarot/apps/web/components/saju/useSajuChart.ts:11-17`; `D:/Money/apps/saju-tarot/apps/web/lib/sajuFlow.ts:8-12`, `:58`, `:92`
- `D:/Money/apps/saju-tarot/apps/web/app/saju/chart/SajuChartView.tsx:58-59`, `:270-278`, `:386-403`
- `D:/Money/apps/saju-tarot/apps/web/app/birth-card/[card]/page.tsx:26-40`, `:121-124`; `D:/Money/apps/saju-tarot/apps/web/app/api/og/birth-card/[card]/route.tsx`; `D:/Money/apps/saju-tarot/apps/web/lib/og/cardsImage.tsx:11-12`; `D:/Money/apps/saju-tarot/apps/web/lib/og/googleFont.ts:3-7`; `D:/Money/apps/saju-tarot/apps/web/app/chapter/[id]/PremiumChapterView.tsx:124-139`
- `D:/Money/apps/saju-tarot/apps/web/components/characters/plush.tsx:10-19`; `D:/Money/apps/saju-tarot/apps/web/public/characters/`(rabbit 파일 6개)
- `D:/Money/apps/saju-tarot/apps/web/lib/legal.ts:113-143`; `D:/Money/apps/saju-tarot/apps/web/app/terms/page.tsx:158`, `:166`, `:248`
- `D:/Money/apps/saju-tarot/apps/web/lib/faq.ts:99`, `:119`; `D:/Money/apps/saju-tarot/apps/web/lib/llms.ts:25`; `D:/Money/apps/saju-tarot/apps/web/lib/metaPixel.ts:16`
- `D:/Money/apps/saju-tarot/apps/web/migrations/0003_premium_readings.sql:10`, `0014_more_share_kinds.sql:8`
- `D:/Money/apps/saju-tarot/apps/web/lib/hostRoutes.ts:72-75`; `D:/Money/apps/saju-tarot/scripts/check-client-bundle.mjs:12-14`
- 측정 스크립트(저장소 밖): `C:\Users\최용우\AppData\Local\Temp\claude\8c14fb0c289473d9\11f3b511-f2fa-4168-89bd-874d0001e2df\scratchpad\grade\`의 `sim.mjs`, `tune.mjs`, `tune2.mjs`, `final.mjs`, `stuck2.mjs`, `realized.mjs`, `jasi.mjs`

---

## 확정 사항 (사장님 확인 2026-11-11: 쏠림은 그대로 두고 공개, 4단계와 달 별칭 그대로)

1. **등급 척도**: S·A·B·C 4단계, D 없음. 별칭은 S 보름달 사주주, A 차오르는 달 사주주, B 초승달 사주주, C 달빛 모으는 사주주. 그해 목표 비율은 8/22/40/30%야.
2. **상위 %**: 카드 아래 "등급은 어떻게 나와요?" 접힌 칸에만 보여 줘. 모집단(시 앎 561,600 / 시 모름 43,200)과 "인구 통계가 아니에요"를 숫자 옆에 함께 적어. 카드 앞면, 공유 이미지, OG에는 넣지 않아.
3. **사주 등급 풀이(1,900원)**: 이어서 물어보기 0번. 약관 제2조에 정의를 추가하고, `GRADE_RULE_DATE`로 7일 전에 공지해.
4. **병오년 화 일간 쏠림**: 규칙은 그대로 둬. `/saju/grade/how`에 측정값을 공개해(2026 병오년 화 일간 S 0.0%·C 50%, 2027 정미년 화 C 47%·토 C 36%, 2028 무신년 금 C 49%, 60해 평균 S 목 9.3·화 9.4·토 6.6·금 8.9·수 9.0%). 카드에는 다음 S·A 해를 보여 줘.
5. **사주주 그림**: 모든 등급에서 `rabbit-hanbok.v2`(300·600) 한 장을 공용으로 써. 등급마다 다른 건 CSS 달 모양 배지뿐이고, 새 그림은 생성하지 않아.
