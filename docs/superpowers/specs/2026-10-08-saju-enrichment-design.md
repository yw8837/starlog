# 사주 보강: 살·귀인 이름표와 개운법 (설계, 2026-10-08)

Background: two testers read the new-voice 정통 사주 (도비, Emma) and said it would feel richer with "충·파·살·귀인" as paid content and "개운법". The competitor analysis is in `docs/research/competitor-sajuai-2026-10.md`; sections F-2 and F-3 are the source of this design.

## Owner decisions (2026-10-08)
- Both additions go into the **정통 사주 full reading only** (paid). 주제별 사주 is unchanged.
- **Free**, on the chart page, which anyone sees without paying:
  - **이름 칩**: up to 5 신살·귀인 names that apply to this chart, each with a one-line meaning and its basis.
  - **개운 한 줄**, for example "곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분".
- **Paid**, as two new sections inside 정통 사주:
  - **이름표 풀이 (살·귀인)**
  - **기운 채우기 (개운)**
- Never:
  - scary 신살
  - event predictions ("귀인이 나타난다", "~살이 있어서 ~한다")
  - efficacy claims ("운이 트인다", "돈이 들어온다", "필수", "무조건", "반드시")
  - lucky numbers
  - 용신, 신강/신약 or 격국 labels

The existing policy still holds: everyday advice only, 해요체, no scores.

## 1. Engine: `packages/core/src/saju/sinsal.ts` (new, pure tables)
A hit is the target branch appearing in another visible pillar's 지지. The basis pillar itself does not count. With 시 모름, the hour pillar is not searched.

| 이름 | 기준 | 표 |
|---|---|---|
| 천을귀인 | 일간 | 甲戊庚→丑未 · 乙己→子申 · 丙丁→亥酉 · 辛→寅午 · 壬癸→卯巳 |
| 문창귀인 | 일간 | 甲巳 乙午 丙申 丁酉 戊申 己酉 庚亥 辛子 壬寅 癸卯 |
| 학당귀인 | 일간 (장생지, using our 12운성 convention: 양간 forward, 음간 backward, 戊己 follow 丙丁) | 甲亥 乙午 丙寅 丁酉 戊寅 己酉 庚巳 辛子 壬申 癸卯 |
| 도화 | 연지와 일지, both checked | 申子辰→酉 · 寅午戌→卯 · 巳酉丑→午 · 亥卯未→子 |
| 역마 | 연지와 일지 | 申子辰→寅 · 寅午戌→申 · 巳酉丑→亥 · 亥卯未→巳 |
| 화개 | 연지와 일지 | 申子辰→辰 · 寅午戌→戌 · 巳酉丑→丑 · 亥卯未→未 |

- **Output:** `{ name, basis: "일간"|"연지"|"일지", basisGlyph, hits: [{ pillar, branch }] }[]`, deduped by name. Order: the three 귀인 first, then 도화, 역마, 화개.
- **Not computed in v1 (hold or hide):**
  - hold: 공망, 홍염, 양인, 괴강
  - hide: 백호, 원진, 귀문관, 삼재, 겁살·재살·천살·망신·육해, 탕화, 상문·조객, 고신·과숙
- **Golden check (도비, 1988-08-15 10:22 서울, 시 甲辰 · 일 壬寅 · 월 庚申 · 년 戊辰):**
  - 문창귀인: 일지 寅
  - 학당귀인: 월지 申
  - 역마: by 연지 辰 → 일지 寅; by 일지 寅 → 월지 申
  - 화개: by 연지 辰 → 시지 辰
  - no 천을귀인, no 도화

  Add 4–6 more golden charts covering each rule, 시 모름, and a chart with no hits.
- **계산 기준 line** (one sentence in section 계산 기준): "귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요."

## 2. 개운 (the scarcest element)
- **Input:** the element counts of the 8 visible glyphs (the same counts the chart shows). Pick the minimum; 0 comes first. On a tie, both are candidates: the reading names the one that fits its other advice and may mention the other in one clause. A glyph present only in 지장간 softens the line ("숨은 불씨는 있어요").
- **Table** (traditional correspondences used as labels only):

| 오행 | 색 | 방향 | 습관 예 | 환경 예 |
|---|---|---|---|---|
| 木 | 초록·청록 | 동쪽 | 화분 가꾸기, 숲길 산책, 스트레칭 | 창가에 식물 한 개 |
| 火 | 빨강·주황 포인트 | 남쪽 | 낮 햇볕 10분, 땀 나는 걷기, 먼저 인사하기 | 따뜻한 색 조명 |
| 土 | 노랑·베이지 | 집 안 가운데 | 정해진 시간 식사, 책상 정리 | 책상 위 한 칸 비우기 |
| 金 | 흰색·은색·회색 | 서쪽 | 비우기·청소, 정해 둔 마감, 천천히 호흡 | 물건 줄인 한 구역 |
| 水 | 검정·남색 | 북쪽 | 물 자주 마시기, 반신욕, 충분한 잠 | 조용한 시간 한 칸 |

- **Direction** is used only for small choices: a walking route, which side of the desk you sit on. Never 이사, 머리 방향, 해외.
- **Free one line:** "곁에 두면 좋은 것: {색} 포인트 · {습관 하나}". The code builds it from the table, so it costs nothing to generate.
- **Fixed note** (code-owned, shown under the paid section): "오행 개수로 고른 재미로 보는 생활 제안이에요. 해 보고 안 맞으면 그만둬도 돼요."

## 3. 정통 사주 structure
- **Order:** sections 1–6 as now, then **7. 이름표 풀이 · 이 명식에 붙는 이름들**, then **8. 기운 채우기 · 적은 기운을 곁에 두는 법**, then 계산 기준 last.
- Headings are code-owned (`lib/sajuPrologue.ts`). The locked TOC and the length display change with them.
- **Section 7** (280–420자):
  - For each name: which pillar it came from, one everyday scene, one small action, and one line on what it does NOT mean. Keep to the voice template.
  - With no hits: one short paragraph saying the common names were checked and none applies, then a strength from the chart instead.
- **Section 8** (250–380자):
  - Why this element: "여덟 글자 중 불 기운이 0개".
  - Then colour, direction, habit and environment as 3–4 concrete actions tied to the reading's own advice.
- **Facts:** `buildFactSet` adds `sinsal` (the engine output) and `scarce` (element, count, hidden). The prompt lists the allowed names, and the model may not name any other.
- **Expected impact:** +600–900자. Generation time +10–20 s. Keep total output under about 12k tokens; the route budget is 240 s.
  - Re-measure on real readings, then update `SITE.reading.approxChars.saju`. It is shown as 약 2,500~3,000자 today.

## 4. Validators
- `lib/ai/validate.ts` has one regex (around line 502) that bans 삼재·원진·백호·도화·역마·공망·귀인·신살. Split it:
  - **Allowed:** an allow-listed name only in section 7 (and the glance card, if used), and only if that name is in `facts.sinsal`.
  - **Always banned:** hidden or held names anywhere. "귀인을 만난다/나타난다/도움 받는다" and "~살이 있어서" event phrasing.
- **Section 8:** ban numbers used as luck, efficacy words, and health or body claims. Directions only as small choices.
- Update `prompts/saju.ts` line 683 and `prompts/match.ts` line 229 (the 신살 ban lines). Make them conditional: 정통 allows the allow-list in section 7 only; match and the topic prompts keep the ban.

## 5. UI
- **Chart page** (`app/saju/chart/SajuChartView.tsx` / chart card):
  - Below 네 기둥, a chip row titled "이 명식에 붙는 이름". Tapping a chip shows a one-line meaning (about 40자) plus its basis.
  - Under the 오행 bars, the 개운 한 줄.
  - Both are free and code-built (no AI).
- **One-line meanings** (code-owned, no fear, no events):
  - 천을귀인: 막힐 때 도움을 청하고 받는 데 마음이 열린 배치에 붙는 이름
  - 문창귀인: 글과 말, 공부로 생각을 꺼내는 쪽에 붙는 이름
  - 학당귀인: 배움이 자라기 쉬운 자리에 붙는 이름
  - 도화: 사람의 시선을 끄는 매력과 표현에 붙는 이름
  - 역마: 움직임과 변화에 열린 배치에 붙는 이름
  - 화개: 혼자 깊이 파고드는 몰입에 붙는 이름
- **Chapter view:** the two new sections render like the others (BoldText).

## 6. Tests and checks
- **core:** the sinsal and scarce tables with golden charts (above).
- **prompts:** facts snapshot, allowed names, hash re-pin with a reason.
- **validators:** allowed name in section 7 passes; the same name elsewhere fails; a name not in facts fails; hidden names fail; event phrasing fails.
- **UI:** chips and the 개운 line render for 도비 and for a chart with no hits.
- **e2e:** the chart page shows the chips.
- **Real check:** one 정통 reading on 도비's chart after implementation (about 500원). Look for 0 hard findings, the time, and the length.

## 7. Later
- A 신살 guide article: the SEO audit lists it as a gap.
- A 60-day-pillar nickname table, shared by the share card and an SEO hub.
- 학당귀인 and 천을귀인 variants differ by school; revisit if testers ask.
