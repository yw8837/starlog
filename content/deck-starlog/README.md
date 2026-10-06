# content/deck-starlog

스타로그 카드(오리지널 타로 덱). 규칙은 `STYLE.md`, 인쇄는 `PRINT.md`.

```
deck.json                카드 목록(번호, 이름, 키워드)과 활성 프레임 변형("frame": "A" | "B")
cards/<id>.mjs           카드 한 장의 장면 코드: 관절 J, 상징 표시, stage2()(사람), stage3()(고양이·토끼)
stages/<id>/             1-original.webp · 2-simplified.svg/png · 3-character-A.svg/png · 3-character-B.svg/png
svg/<id>.svg             덱 마스터(활성 프레임 변형의 단계 ③). back.svg는 뒷면
render/                  웹용: <id>.webp·png(600×1040), <id>-sm.webp(240×416), <id>@3x.png·webp(1800×3120)
print/                   인쇄용 PNG(76×126mm, 300dpi). back만 커밋, 나머지는 export-print.mjs로 생성
review/                  소유자 리뷰 시트(prototype-v2.png, card-back.png, …), selftest.json, blind/(이름 맞히기용 이미지)
tools/                   생성기(아래), lib/(kit, actors, browser), glyphs.json, .build/(커밋 제외)
prototype/               v1 프로토타입과 FEASIBILITY.md (이력, 수정하지 않는다)
```

파일 이름은 앱의 규칙(`major-00-fool`, `-sm.webp`)과 같다. `render/`를 `/cards/starlog/`에 복사하면 드롭인이다(앱 코드는 이 폴더에서 건드리지 않는다).

## 명령 (`tools/`에서)

```bash
node preview.mjs <id> [2|A|B|all] [배율]   # 한 장 빠르게 보기 (tools/.build/preview/)
node selftest.mjs [id]                     # 90px 스퀸트 테스트 + 이름 맞히기용 이미지
node render.mjs [id]                       # 단계 PNG, 덱 마스터, 웹용 렌더 (--no-3x, --no-build)
node back.mjs                              # 뒷면 svg
node export-print.mjs [--dpi 600] [--guides] [id]   # 인쇄용 PNG
node review.mjs                            # review/prototype-v2.png (selftest.mjs를 먼저)
node review-batch.mjs batch-01             # review/batch-01.png: 수정 확인, 카드별 3단계, 90px 줄, 뒷면 (selftest.mjs 전체를 먼저)
node review-back.mjs                       # review/card-back.png
node check.mjs                             # svg·렌더·인쇄 파일 검사
python3 make-glyphs.py                     # deck.json의 글자를 윤곽으로 (Noto Serif KR 필요)
python3 cmyk-report.py [--all]             # sRGB → CMYK 색역 보고
```

필요한 것: Node 20+, 시스템 Chrome(Playwright `channel: "chrome"`), 저장소 루트의 `node_modules`(react, react-dom, esbuild, playwright, sharp), Python 3 + Pillow + fontTools. 캐릭터는 `apps/web/components/characters`의 실제 컴포넌트를 읽기만 한다.
