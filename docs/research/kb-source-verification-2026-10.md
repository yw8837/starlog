# KB 원전 대조: Waite PKT · 골든 던 Book T (2026-10-07)

- 산출물: `content/kb/sources/pkt.json`, `content/kb/sources/book-t.json`, `content/evidence.json`, 테스트 `apps/web/lib/kb/sources.test.ts`
- KB 수정: 1곳(`pentacles-03` `waite.upright`). Book T 쪽 수정은 없음.
- 성격: 에이전트 1차 작업이다. 스캔은 사람이 아니라 에이전트가 이미지로 읽었고, `quoteKo` 번역도 사람 번역가 검수를 거치지 않았다. 작성과 따로 독립 검증 에이전트가 증거 문구 13개, 번역 78개, Book T 스캔 대조를 다시 봤고, 지적받은 곳은 고쳤다(8절). KB의 `review.status`는 건드리지 않았다.

---

## 0. 결론

1. **PKT 원문 78장**을 위키문헌 전사본에서 받아 카드별로 나눴고, 독립 전사본(Project Gutenberg #43548)과 단어 단위로 대조했다. 둘이 다른 곳 가운데 de Laurence 판의 일괄 수정(미국식 철자, "God" 뒤 "(Nature)", Lévi의 악센트 삭제, 다시 쓴 펜타클 왕)이 아닌 곳은 전부 위키문헌의 원판 스캔으로 확인했다. 위키문헌이 인쇄본과 다른 곳은 4곳이었고, 저장하는 필드에 걸린 3곳은 스캔대로 고쳐 넣었다(1.3).
2. **KB `waite` 필드**는 위 원문과 1곳만 달랐다. 펜타클 3 정방향의 `how-ever`는 줄 끝 하이픈을 옮긴 전사 오류라 `however`로 고쳤다(3절). 별 정방향의 끝 쉼표 생략은 오류가 아니라서 두었다.
3. **Book T**는 전사본 대신 1912년 인쇄본(The Equinox Vol. I No. 8)의 스캔을 직접 읽었다. KB의 메이저 22장·숫자 카드 36장 점성 대응은 Book T와 모두 맞는다. 다만 심판(불)과 세계(토성)는 Book T가 적은 두 대응 중 하나만 적었고, 에이스·궁정 16장은 KB에 대응이 비어 있다. 둘 다 모순이 아니라서 고치지 않았다(4.2).
4. **증거 페이지 사실 13개**를 지정 문서 다섯 곳의 숫자로만 만들었다. README의 역방향 확률 0.5는 코드 기본값 0.3과 달라서 넣지 않았다(5절).

---

## 1. PKT (A. E. Waite, *The Pictorial Key to the Tarot*)

### 1.1 쓴 자료

| 역할 | URL | 비고 |
|---|---|---|
| 본문(정본으로 씀) | https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot | 표제지: London, William Rider & Son, "First Published 1910", "Reprinted 1922". 상태 표시는 validated |
| 2부 | https://en.wikisource.org/w/index.php?title=The_Pictorial_Key_to_the_Tarot/Part_2&oldid=15274517 | 받은 리비전 그대로의 고정 링크 |
| 3부 | https://en.wikisource.org/w/index.php?title=The_Pictorial_Key_to_the_Tarot/Part_3&oldid=15274510 | 〃 |
| 원판 스캔 | https://en.wikisource.org/wiki/Index:The_Pictorial_Key_to_the_Tarot.pdf | 쪽 이미지는 `https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/The_Pictorial_Key_to_the_Tarot.pdf/page{N}-960px-The_Pictorial_Key_to_the_Tarot.pdf.jpg`로 받음 |
| 대조용 전사본 | https://www.gutenberg.org/cache/epub/43548/pg43548-images.html | **Waite 판이 아니다.** L. W. de Laurence가 자기 이름으로 낸 1918년 시카고 판(*The Illustrated Key to the Tarot*)의 전사본이다. 독립 대조에만 썼다 |

과제가 예로 든 두 곳을 쓰지 않은 이유:
- **sacred-texts.com**: robots.txt는 허용하지만 2026년 이용약관(https://sacred-texts.com/terms) 4조가 "scrape"를 금지한다. 카드별로 100쪽 가까이 받아야 해서 수집에 해당한다고 보고 쓰지 않았다(robots.txt, 목차, 약관 3쪽만 받음).
- **Project Gutenberg**: 위 표처럼 de Laurence 판이라 Waite 원문으로 쓸 수 없었다(미국식 철자로 바꾸고, "God" 뒤에 "(Nature)"를 넣고, 펜타클 왕 설명을 줄여 썼다).

요청 수: 위키문헌 4(robots.txt 포함), 위키미디어 업로드 서버 34(robots.txt 1, 쪽 이미지 33: 성공 31, 표준 폭이 아니어서 400이 난 2회. 서로 다른 30쪽), 구텐베르크 2, sacred-texts 3, archive.org 3(1910/1911 Rider 원판 스캔을 찾았으나 없었다). 이미지 요청 사이에 1.5초를 뒀고 UA에 용도를 밝혔다.

### 1.2 방법

1. 위키문헌 HTML을 텍스트로 바꿨다. 인쇄 쪽수 표지는 `loc`의 쪽수로만 쓰고 본문에서는 뺐다. 소프트 하이픈·폭 없는 공백은 지웠고, 마법사 설명의 눕힌 8은 `∞`로 적었다. 도판이 끼어 문장 중간에서 갈린 문단은 이었다.
2. 카드별로 나눴다. 메이저: 그림 = 2부 §2(바보는 XX와 XXI 사이의 "Zero"), 의미 = 3부 §3. 마이너: 그림·의미 = 3부 §2(`Divinatory Meanings:` 앞이 그림, `Reversed:` 뒤가 역방향). 3부 §4의 추가 의미는 넣지 않았다. §2 끝의 소아르카나 총론 문단은 펜타클 에이스에서 잘랐다.
3. 같은 방식으로 나눈 구텐베르크 본과 단어 단위로 비교했다. 실질 차이 72곳(35장), 철자·하이픈만 다른 곳 50곳이었다.
4. de Laurence의 일괄 수정이 아닌 차이는 모두 스캔 쪽을 열어 봤다. 하이픈 낱말 21개는 두 전사본을 비교하고, 한쪽에만 있는 8개를 스캔에서 확인했다. 확인한 인쇄 쪽: 76, 79, 84, 99, 100, 115, 124, 127, 136, 140, 172, 190, 206, 210, 220, 222, 224, 230, 240, 252, 254, 260, 264, 270, 272, 274, 276, 286, 290, 292.
5. `quoteKo`는 각 카드 `pictureEn`의 한 문장(긴 복문은 세미콜론 사이의 독립절 하나)을 옮긴 것이다. 그 영문을 `quoteEn`에 그대로 두었고, 테스트가 `pictureEn` 안에 있는지 확인한다. 피부·머리색 같은 인물 묘사가 든 문장(펜타클 여왕·왕, 완드 왕 등)은 피했다. 최장 70자.

### 1.3 위키문헌이 인쇄본과 다른 곳 (스캔 확인)

| 카드·위치 | 위키문헌 | 인쇄본 | pkt.json |
|---|---|---|---|
| 정의, 2부 §2, p. 115 | "gracious gifts of the poet we have them" | "gifts of the poet : we have them" | 콜론을 넣음 |
| 펜타클 3 정방향, 3부 §2, p. 276 | "usually, how-ever, regarded" | 줄 끝 "how-" + 다음 줄 "ever" | `however` |
| 컵 8 그림, 3부 §2, p. 210 | "enterprise, under-taking or" | 줄 끝 "under-" + "taking" | `undertaking` |
| 컵 3 추가 의미, 3부 §4, p. 290 | "advancement for military man" | "for a military man" | §4는 저장 안 함 |

### 1.4 인쇄본의 오식이나 이상한 곳을 그대로 둔 것

원문 그대로가 원칙이라 고치지 않았다.
- 여사제 p. 79 "her truest and highest name in bolism" (두 전사본과 스캔 모두 "bolism")
- 힘 p. 100 "the same symbol of life which we have seen in the card of the Hierophant" (그림에서 무한대 표시는 마법사 위에 있다)
- 별 p. 136 "A great, radiant, star": 스캔에는 쉼표가 아니라 점에 가까운 자국이 있다. 위키문헌 판독(쉼표)을 따랐다
- 별 정방향 p. 286 "bright prospects, Reversed:" (마침표 대신 쉼표)
- 심판 정방향 p. 286 "total loss though lawsuit" (through의 오식으로 보이지만 인쇄본이 though)
- 컵 에이스 p. 224 "lie behind the Lesser Arcana Divinatory Meanings:" (마침표 없음)
- 펜타클 4 p. 274 "Reversed ;" (세미콜론)
- 펜타클 시종 역방향 p. 260 "liberality. luxury ;" (점으로 찍힘). 완드 4 역방향 p. 190 "felicity. beauty"도 스캔에서는 점처럼 찍혔지만 두 전사본 모두 쉼표로 읽었다. 쉼표 꼬리가 안 찍힌 것으로 보여 어느 쪽도 분명한 오류가 아니라서 KB와 전사본을 그대로 뒀다
- 완드 5 p. 188: 그림 설명이 "and hereto correspond the"로 끝난다. 원문에서는 "Divinatory Meanings:"가 문장의 일부라서 그렇다(두 전사본 모두 같음)
- 컵 10·심판 "ecstacy" 철자(p. 206 확인)
- 줄 끝에서 갈린 "inter-relation"(컵 2, p. 222)과 "nose-gays"(완드 4, p. 190)는 둘 다 가능한 표기라 위키문헌을 따랐다

---

## 2. Book T

### 2.1 쓴 자료

| 역할 | URL | 비고 |
|---|---|---|
| 본문 | https://aleistercrowleytimeline.com/Publications/Crowley/Books/Equinox-1-8/Equinox-1-8-Tarot.pdf | *The Equinox* Vol. I No. 8(London, 1912) pp. 143–210 "A Description of the Cards of the Tarot with their Attributions" 스캔 68쪽. 1912년 인쇄물이라 퍼블릭 도메인. 사이트에 robots.txt가 없다(요청 3회: robots 확인, HEAD, PDF) |

골든 던 원 필사본(1888~1890년대)의 믿을 만한 전문 전사본은 찾지 못했다. 그래서 **Book T를 처음 인쇄한 1912년 판의 스캔**을 썼고, `book-t.json`에도 그렇게 밝혔다. PDF의 OCR은 점성 기호를 거의 읽지 못해서 쓰지 않았고, 쪽 이미지를 직접 봤다(PDF 쪽 = 인쇄 쪽 − 142).

읽은 곳: p. 147–148 "The Titles of the Symbols"(에이스·궁정 칭호), p. 148–149 소수 카드 표(칭호·데칸 행성·별자리), p. 150–152 "The Twenty-two Keys of the Book"(칭호·히브리 문자·대응), p. 153 "Of the Aces", p. 159–171 궁정 카드 16장의 원소 표기(예: "△ of △"), p. 173–175 데칸 표.

### 2.2 읽을 때 정한 것

- **궁정 카드 이름**: 이 판은 Book T의 King(말 탄 인물)을 Knight로, Prince(전차의 인물)를 King으로 부르고(p. 159 각주), Princess를 Knave로 부른다(p. 157 "The Four Princesses are the Knaves of the Tarot Pack"). `book-t.json`은 이 판의 이름(`nameInSource`)과 Book T 역할(`bookTRole`)을 함께 적고, id는 KB의 RWS 이름을 따른다(완드 12 = Knight = "The Lord of the Flame and Lightning").
- **처녀자리와 전갈자리 기호**: p. 148–151 표는 두 별자리를 같은 모양(처녀자리 꼴)으로 찍었다. 컵 5·6·7은 p. 174–175 데칸 표에서 전갈자리 기호로 따로 찍혀 있어 전갈자리로 읽었다. 죽음(눈 נ)은 표의 문자 순서(라메드=천칭과 사메크=궁수 사이)로 전갈자리로 읽었다. 둘 다 `note`에 적었다.
- 칭호는 p. 147–149 목록을 따랐다. 본문 제목과 조금 다른 곳: 완드 기사 "Flame and Lightning"(본문 "Flame and the Lightning"), 검 기사 "Wind"(본문 "Winds"), 컵 8 "Abandoned Success"(p. 174 데칸 표만 "Abundant Success").
- 검 시종 절 끝의 "Throne of the Ace of Wands"(p. 168)는 Swords의 오식으로 보고 `note`에 적었다. 펜타클 여왕의 지배 범위 "20° ♐ to 20° ♍꼴"(p. 170, 염소자리여야 맞음)은 범위를 기록하지 않아서 데이터에 영향이 없다.
- 에이스에는 별자리가 없다. Book T는 "The Four Aces are said to be placed on the North Pole of the Universe"(p. 153)라고만 쓴다.

---

## 3. KB 변경 (전부)

| 파일 | 필드 | 전 | 후 | 근거 |
|---|---|---|---|---|
| `content/kb/cards/pentacles-03.json` | `waite.upright` | "…skilled labour; usually, how-ever, regarded as a card of nobility…" | "…skilled labour; usually, however, regarded as a card of nobility…" | 스캔 p. 276: "skilled labour ; usually, how-" / "ever, regarded as a card of nobility" (줄 끝 하이픈). 구텐베르크 본도 "usually, however, regarded" |

`waite.loc` 78개와 `sources`의 PKT 위치 78개는 모두 맞아서 바꾸지 않았다(테스트가 확인). Book T 쪽 `attributions`는 고칠 곳이 없었다.

## 4. 고치지 않은 불일치와 이유

### 4.1 PKT

| 카드 | 필드 | 내용 | 안 고친 이유 |
|---|---|---|---|
| 별 | `waite.upright` | 인쇄본은 "bright prospects,"로 끝나는데 KB는 쉼표가 없다 | 정·역 구분 기호를 빼는 KB 방식이다. 전사 오류가 아니다 |
| 컵 2 | `waite.noteKo` | "PKT 본문에는 이 카드의 역방향 의미가 적혀 있지 않다." 그러나 3부 §4(p. 290)에 "Reversed: Passion."이 있다 | §2(`waite.loc`) 기준으로는 맞고, `noteKo`는 이번 수정 범위가 아니다. "§2에는 없고 §4에 Passion"으로 고치길 제안 |
| 컵 8 | `imagery.waiteDescription` | "under-taking" (1.3과 같은 줄 끝 하이픈) | `waite` 필드가 아니어서 범위 밖. `undertaking`으로 고치길 제안 |

KB `imagery.waiteDescription` 56개는 컵 8 말고 모두 `pictureEn`과 같다.

### 4.2 Book T

| 카드 | KB `attributions.astrology` | Book T | 판단 |
|---|---|---|---|
| 심판 | 원소 불(Fire) | ש, "⊛ and △" = Spirit and Fire (p. 152) | 둘 중 하나만 적음. 모순 아님 |
| 세계 | 토성(Saturn) | ת, "🜃 and ♄" = Earth and Saturn (p. 152) | 〃 |
| 에이스 4장 | null | 원소의 뿌리(예: "Root of the Powers of Fire") | 비어 있을 뿐 모순 아님 |
| 궁정 16장 | null | 원소 안의 원소(예: 완드 기사 "Fire of Fire") | 〃 |
| 힘·정의 | 사자자리 / 천칭자리 | 11 Fortitude = ט 사자자리, 8 Justice = ל 천칭자리 | 번호는 다르지만 카드 기준 대응은 같다 |

메이저 나머지 20장과 숫자 카드 36장은 KB 영문 표기(괄호 안)가 Book T와 글자까지 같다.

---

## 5. 증거 페이지 사실 (`content/evidence.json`)

지정 문서 다섯 곳(`tarot-kb-modern-crosscheck-2026-10.md`, `tarot-yes-no-consensus.json`, `saju-calendar-crosscheck-2026-10.md`, `saju-engine-eval.md`, `content/kb/README.md`)에 적힌 숫자와 출처만 썼다. 사실마다 `doc`이 그 숫자가 있는 절을 가리키고, 테스트가 그 절 제목이 실제로 있는지 확인한다. 타로 5개, 사주 8개.

넣지 않은 것:
- **역방향 확률**: README는 "확률은 덱 규칙으로 공개(기본 0.5)"라고 쓰지만 `packages/core/src/tarot/draw.ts`의 `DEFAULT_REVERSAL_RATE`는 0.3이다. 문서가 낡은 것으로 보여 증거로 쓰지 않았다(README는 고치지 않음).
- `saju-engine-eval.md` §4.5의 "전이 시점 27개 일치"는 manseryeok 내장표를 검사한 것이다. 제품은 `policy.ts`의 자체 표를 쓰므로 그 대신 교차검증 문서의 440회 비교를 썼다.
- 이번 작업(PKT·Book T) 결과는 지정 문서가 아니어서 넣지 않았다. 필요하면 이 문서를 근거로 추가할 수 있다.

**게시 전에 오너가 정할 것**: `tarot-excluded-sites`는 "약관이 자동 수집을 금지한 곳은 쓰지 않았다"고 말한다. 그런데 같은 문서 1.1절은 사용한 소스인 Labyrinthos의 약관에도 spider·crawl·scrape 금지의 일반 조항이 있어 "저속 1회 수집만 함"이라고 적었다. 두 사실을 한 페이지에 나란히 두면 기준이 엇갈려 보인다. 또 Learning the Tarot의 저작권 고지는 홍보 사용을 금지한다. 출처 이름만 적는 것은 문장 복제가 아니지만, 이름을 노출할지는 오너가 정하는 게 맞다. 데이터는 문서대로 두었다.

## 6. 테스트

`apps/web/lib/kb/sources.test.ts` (기존 KB 테스트와 같은 web 프로젝트):
- `pkt.json`·`book-t.json`이 `_index.json`의 78장을 빠짐없이 덮는지, 위치(`loc`)가 비어 있지 않은지
- `quoteKo`가 한글이고 80자 이하이며 모델·회사 이름과 줄표가 없는지, 그 카드 KB의 오묘사 정규식(`commonMisdescriptions[].regex`)에 걸리지 않는지, `quoteEn`이 `pictureEn` 안에 있는지
- KB `waite.upright`/`reversed`가 `pkt.json`과 같은지(끝 구두점만 무시), `waite.loc`과 `sources` PKT 위치가 맞는지
- KB에 적힌 점성 대응이 Book T와 같은지
- `evidence.json` 각 항목이 해요체 한국어이고, `doc`의 파일과 절 제목(JSON은 최상위 키)이 실제로 있는지

```
STARLOG_AI=mock npx vitest run apps/web/lib/kb apps/web/lib/decision.test.ts --maxWorkers=1
 Test Files  4 passed (4)
      Tests  23 passed (23)
```

KB 수정 전에는 "matches the KB's waite fields" 테스트가 `pentacles-03 waite.upright`에서 실패했다.

## 7. 한계

- PKT는 1922년 재쇄본 한 가지만 스캔으로 봤다. 1910·1911년 초판 스캔은 찾지 못했다(archive.org 검색). 쪽수는 1922년 판 기준이다.
- 스캔 확인은 두 전사본이 다른 곳과 하이픈 낱말에 한정했다. 두 전사본이 같은 곳은 따로 보지 않았다. 미국식 철자 차이 50곳 중 하이픈 말고는 위키문헌(영국식)을 따랐다.
- Book T는 Crowley가 펴낸 1912년 인쇄본이다. 골든 던 필사본과 글자 하나하나 같은지는 확인하지 않았다.
- `quoteKo` 78개와 이 문서의 판단은 에이전트 작업이다. 사람 검수 전이다.

## 8. 독립 검증에서 고친 것

작성에 참여하지 않은 검증 에이전트가 `evidence.json` 13개를 근거 절과, `quoteKo` 78개를 `quoteEn`과, `book-t.json`을 Equinox 스캔과 대조했다. 숫자 불일치는 없었고 Book T는 통과였다. 아래를 고친 뒤 같은 에이전트가 고친 곳만 다시 봤고, 남은 지적 3건(KASI 문구, 출생 비교 문구, 컵 2 조사)도 반영했다. Labyrinthos·Learning the Tarot 건은 5절의 오너 결정으로 남겼다.

| 대상 | 지적 | 고친 뒤 |
|---|---|---|
| 완드 10 `quoteKo` | "짊어진"은 등에 진다는 뜻인데, KB는 "지팡이를 등에 지고 있다"를 오묘사로 등록해 두었다 | "한 남자가 자기가 나르는 지팡이 열 개의 무게에 짓눌려 있다." |
| 컵 3 `quoteKo` | 컵을 든 "pledging one another"는 맹세가 아니라 건배다(KB 그림 사실도 건배) | "서로 건배하듯" |
| 컵 2 `quoteKo` | 같은 이유 | "서로 축배를 들고" |
| 태양 `quoteKo` | 아이가 "언급했다"의 주어처럼 읽혔다 | "…아이가 이 카드와 관련된 더 나은 상징이라는 점은 이미 말했다." |
| 심판 `quoteKo` | "their child"의 소유가 빠졌다 | "둘의 아이" |
| `tarot-modern-sources` | 사람이 쓴 소스 수를 빠뜨렸고, 156은 인용한 절에 없다 | "사람이 직접 쓴 곳만 세면 정방향 6곳, 역방향 4곳", 156 삭제 |
| `tarot-excluded-sites` | 1쪽 확인 요청이 있었으니 "가져오지 않았다"는 넓다 | "수집하지 않았고, 내용도 쓰지 않았어요" |
| `saju-birth-crosscheck` | 기준 라이브러리도 같은 계열이라 "독립 기준"은 과하다. 3건이 일부러 넣은 경계 사례라는 점이 빠졌다. "같은 순간으로 맞춰"는 인용한 §0이 아니라 머리말·§2에 있다 | "별도 기준과 비교", 경계 사례·경고 문장 추가 |
| `saju-solar-term-max` | 32.7초는 분 반올림(최대 30초)만으로는 설명되지 않는다 | "분 단위 반올림에 원천 값의 최대 2.8초 오차가 더해진 차이" |
| `saju-kasi-lunar` | 54,787일 대조 상대는 KASI가 아니라 별도 음력 라이브러리다. 그 라이브러리가 KASI 기반이라는 말은 인용한 §4.4에 없다 | "별도 한국 음력 라이브러리와 … 맞춰 보니", KASI 직접 조회 결과는 §4.4 표대로 따로 적음 |
| `book-t.json` 출처 메모 | Princess = Knave의 근거는 p. 159 각주가 아니라 p. 157이다 | p. 157 인용으로 고침 |
| 문구 다듬기 | 라벨·표현 4곳 | "범위를 넓힌 재검사", "알고리즘 뿌리가 다른", "입력한 출생 시각을 그때의 한국 표준시로 읽어요", "시계를 앞당긴 만큼" |
