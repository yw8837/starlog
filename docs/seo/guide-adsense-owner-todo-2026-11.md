# 가이드 애드센스 재심사: 오너 확인 필요 (내부 메모, 페이지에 싣지 않음)

2026-11-10 작업(`feat/guide-adsense`)에서 저장소만으로는 알 수 없어 페이지에 쓰지 않은 것들이다. 확인되면 해당 위치에 반영한다.

## 저자·편집자 정보 (E-E-A-T)

- [ ] TODO: 편집 책임자(최용우 대표)의 타로·사주 관련 경력, 공부한 기간, 자격 여부. 지금 페이지에는 이름·직함·사업자 정보만 있다(`app/guide/about/page.tsx` #editor). 사실로 확인된 것만 적는다.
- [ ] TODO: 대표가 직접 읽고 승인한 글. `lib/guideReview.ts` `GUIDE_REVIEWS`가 비어 있어 어떤 글에도 '검토' 표시가 없다. 읽은 글과 날짜를 알려 주면 그 글에만 넣는다(일괄 추가 금지).
- [ ] TODO: 문의 답변에 걸리는 기간. `/contact`에는 약속한 기간이 없어서 적지 않았다.

## 직접 경험·원본 자료

- [ ] TODO: 사주 글 31편에 그림이 없다. 캐릭터·카드 그림은 오너가 그리므로 생성하지 않았다. 넣을 그림이 있으면 경로를 알려 준다(데이터 차트·SVG 도표는 만들어도 된다).
- [ ] TODO: '가상의' 예시를 실제 사례로 바꿀지. 실제 사례(동의받은 테스터 풀이 등)가 오면 바꾼다. 해당 페이지 목록은 아래 '가상의 예시' 절에 있다.

## '가상의' 예시를 쓰는 페이지 (2026-11-10 기준 32편, 바꾸지 않고 그대로 둠)

실제 사례가 생기면 아래 페이지의 '가상의' 예시를 바꿀 수 있다. 지금 예시는 모두 '가상의'라고 밝혀 두었고, 사주 예시 명식은 자동 검사가 앱 엔진으로 다시 계산한다. 감사 보고서는 33페이지라고 했지만 저장소 글 데이터에서 찾은 것은 32편이다(나머지 1곳은 확인 못 함).

- 타로 6편: `the-star`, `reunion-tarot`, `the-magician`, `the-chariot`, `the-tower`, `the-moon`
- 사주 개념 16편: `heavenly-stems`, `earthly-branches`, `day-master`, `ten-gods`, `daewoon`, `saju-vs-astrology`, `manseryeok`, `saju-compatibility`, `reunion-saju`, `new-year-fortune`, `four-pillars`, `branch-relations`, `twelve-stages`, `yongsin`, `wolun-iljin`, `saju-glossary`
- 일간 10편: `day-master-gapmok`, `day-master-eulmok`, `day-master-byeonghwa`, `day-master-jeonghwa`, `day-master-muto`, `day-master-gito`, `day-master-gyeonggeum`, `day-master-singeum`, `day-master-imsu`, `day-master-gyesu`

## 원본 자료 글 공개 일정 (publishAt)

- 2026-11-12 `manseryeok-engine-comparison`, 2026-11-16 `jeolip-times-2026-2027`, 2026-11-19 `korea-dst-standard-time`, 2026-11-23 `birthplace-longitude-table`
- 글 주소와 사이트맵은 그날 00:00(한국 시각)부터 요청마다 열린다. 홈·탭 목록, llms-full, RSS는 빌드 때 정해지므로 그날 이후 배포해야 목록에 뜬다.
- TODO: 각 공개일 이후 배포 일정 확인. 100건 교차검증 결과(`scripts/crosscheck-saju/results.json`, `docs/research/saju-calendar-crosscheck-2026-10.md`)도 같은 방식의 다섯 번째 글 후보다.
