# Starlog 설계: 풀이 후기 (별점·한 줄 후기·도움돼요)

작성일 2026-10-13 · 상태: 설계, 구현 전

## 1. 소유자 결정 (2026-10-13)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 위치 | 결과 화면과 연결된 후기. 별점과 좋아요. 나중에 메인에서 보이게 |
| 2 | 쓸 수 있는 사람 | 풀이를 연 사람만. 풀이 하나에 후기 하나 |
| 3 | 보상 | 없음 (그래서 "혜택 받은 후기" 표시 의무도 없다) |

## 2. 한 줄 정의

결과 화면 끝의 별점("이 풀이, 얼마나 와닿았나요?", 지금은 저장되지 않는다)을 후기로 키운다. 별점을 누르면 한 줄 후기 칸이 열리고, "후기 남기기"로 계정에 저장한 풀이에 후기 하나가 붙는다. 공개되는 것은 별점, 한 줄 후기, 상품 이름과 주제, 가린 닉네임뿐이다. 질문·메모·생년월일·풀이 본문은 절대 공개하지 않는다.

## 3. 범위

넣는다
- 결과 화면의 별점 + 한 줄 후기(선택, 5~200자) 작성·수정·삭제
- 후기 목록(가격 안내 화면, 상품별 묶음), "도움돼요", 신고
- 운영자 숨김(/owner), 자동 차단(욕설·연락처·주민번호·계좌·주소 링크)
- 메인 노출 스위치(후기가 쌓인 뒤 켬)
- 이용약관·개인정보처리방침 문구

뺀다
- 후기 보상, 사진 후기, 댓글, 운영자 답글(나중)
- 검색엔진용 별점 구조화데이터(자기 사이트 후기는 구글이 별점으로 보여 주지 않는다)
- 기기에만 저장된 풀이(계정 사본이 없는 풀이)의 후기: "로그인하면 후기를 남길 수 있어요"

## 4. 자격과 공정성

- 계정에 저장된 풀이(`readings`)의 주인만 쓴다. `source = 'owner'`(운영자 패스) 풀이는 후기를 받지 않는다: 사업자 본인 후기는 기만 광고가 된다.
- 풀이 하나에 후기 하나(`reading_id` UNIQUE). 고치면 `edited_at`을 남긴다.
- 나쁜 후기를 골라 숨기지 않는다(표시광고법). 숨김은 규칙 위반(욕설, 개인정보, 광고, 풀이와 무관한 글)만, 사유를 남긴다. 작성자에게는 "운영 원칙에 따라 숨겼어요"로 보인다.
- 평균 별점은 후기가 5개 이상일 때만 보인다(적은 표본의 숫자로 오해를 만들지 않는다).
- 메인과 목록의 기본 순서는 최신순. "도움순"은 고를 수 있다. 별점으로 걸러 좋은 후기만 보여 주지 않는다.

## 5. 데이터 (D1 `0005_reviews.sql`)

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  reading_id TEXT UNIQUE REFERENCES readings(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  product TEXT NOT NULL,          -- tarot | saju | tarot-deep | match | newyear-2027 | fusion
  topic_label TEXT,               -- 주제별 사주의 주제, 타로의 고른 주제 칩(직접 쓴 주제는 없음)
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,                      -- 5~200자, 자동 차단을 통과한 것
  nickname TEXT NOT NULL,         -- 쓸 때의 닉네임을 가린 것 ("별*냥")
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  hidden_reason TEXT,
  helpful INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE TABLE review_helpful (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (review_id, user_id));
CREATE TABLE review_reports (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, user_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (review_id, user_id));
```

- 풀이를 지워도 후기는 남는다(`reading_id`만 비움). 회원 탈퇴 때는 후기·도움돼요·신고를 함께 지운다.
- 상품과 주제는 서버가 저장된 풀이에서 읽는다(클라이언트가 보낸 이름을 믿지 않는다).

## 6. API

| 경로 | 하는 일 |
|---|---|
| `GET /api/reviews?product=&sort=recent\|helpful&before=` | 공개 후기 목록(20개씩), 상품별 개수·평균(5개 이상일 때) |
| `GET /api/reviews/mine?readingId=` | 내 풀이에 쓴 후기(결과 화면이 상태를 보이려고) |
| `POST /api/reviews {readingId, rating, body?}` | 쓰기·고치기(로그인, 같은 출처, 속도 제한) |
| `DELETE /api/reviews?id=` | 내 후기 지우기 |
| `POST /api/reviews/helpful {id, on}` | 도움돼요(로그인, 내 후기에는 못 누름) |
| `POST /api/reviews/report {id, reason}` | 신고(로그인, 한 사람 한 번) |
| `POST /api/owner/reviews {id, hidden, reason}` | 운영자 숨김·되살리기 |

자동 차단은 서버에서: 전화번호·이메일·주소 링크·주민번호·계좌번호 패턴, 욕설 목록, 같은 글자 반복. 걸리면 저장하지 않고 이유를 한 줄로 알려 준다.

## 7. 화면

- 결과 화면: 별을 누르면 "한 줄 후기를 남겨 볼까요? (선택)" 칸과 "후기 남기기". 남긴 뒤에는 "남긴 후기" 상태와 고치기·지우기. 로그인 전이거나 기기에만 있는 풀이는 "로그인하면 후기를 남길 수 있어요". 질문이나 메모를 후기에 쓰지 말라는 안내 한 줄.
- 후기 카드: 별점, 한 줄 후기, "타로 · 연애" 같은 상품·주제, 가린 닉네임, 날짜, "풀이 확인" 표시, 도움돼요 수, 신고.
- 가격 안내(/pricing)와 각 상품 소개 아래: 그 상품의 최신 후기 3개 + "후기 더 보기".
- 메인: `NEXT_PUBLIC_REVIEWS_HOME` 스위치가 켜지면 최신 후기 줄. 기준은 후기 20개 이상(소유자가 켠다).

## 8. 법·문구

- 이용약관: 게시물(후기)의 권리는 작성자에게, 서비스 안 노출에 쓸 수 있음, 숨김 기준.
- 개인정보처리방침: 후기(별점·내용·가린 닉네임) 수집·이용, 탈퇴 시 삭제.
- 보상이 없으므로 추천·보증 심사지침의 "경제적 이해관계" 표시는 필요 없다. 보상을 도입하면 그 후기에 표시를 붙인다.

## 9. 시험

- 자격: 남의 풀이·운영자 풀이·로그인 전은 거절, 한 풀이에 한 후기.
- 자동 차단 패턴, 닉네임 가리기, 평균은 5개부터.
- 숨김은 사유가 있어야 하고 작성자에게 상태가 보임.
- 탈퇴·풀이 삭제 때의 정리.
- e2e: 결과 화면에서 별점 → 후기 남기기 → 가격 안내에 보임 → 도움돼요.
