# 심사자용 로그인 안내 (Play Console > 앱 콘텐츠 > 로그인 세부정보)

요건(https://support.google.com/googleplay/android-developer/answer/15748846, 2026-11-12 확인):
"Your sign-in details must be accessible at all times, reusable, and valid regardless of user location." /
"If your app requires sign-in details involving other accounts (such as \"sign-in with Google, Facebook\", or similar), provide all account
information with detailed instructions." / "Your sign-in details must be provided in English."

우리 앱의 로그인은 카카오와 Google뿐이라 심사자가 쓸 수 없다(카카오는 전화번호 인증, Google은 기기 계정). 그래서 사이트에 이미 있는
**심사용 로그인**(아이디·비밀번호, `apps/web/lib/account/review.ts`, 페이지 `/login/review`)을 쓴다. 이 로그인은 Worker 시크릿
`REVIEW_LOGIN_ID`와 `REVIEW_LOGIN_PASSWORD`(20자 이상)가 둘 다 있을 때만 켜진다(없으면 404). 앱에서는 로그인 화면 아래의
`Reviewer sign-in` 링크로 들어간다(시크릿이 있을 때만 보임).

## 사장님이 할 일 (값은 채팅에 쓰지 않는다)
1. 터미널에서 `apps/web` 폴더로 가서 아래 두 줄을 차례로 실행하고, 물어보는 값에 아이디와 비밀번호를 직접 입력한다.
   - `npx wrangler secret put REVIEW_LOGIN_ID`
   - `npx wrangler secret put REVIEW_LOGIN_PASSWORD` (20자 이상. 만들기: `node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"`)
2. Play Console의 로그인 세부정보에 같은 아이디·비밀번호와 아래 영어 안내를 붙여 넣는다.
3. 심사가 끝나도 Play는 업데이트마다 다시 심사하므로 이 계정은 유지한다. 유출되면 비밀번호를 새로 넣는다(예전 계정은 바로 닫힌다:
   `docs/runbook-payments.md` 4절).

## 붙여 넣을 안내 (영어)
**Username / Password**: (the ID and password set above)

**Any other instructions**:
```
Starlog shows our website (https://starlog.yeolmaeapps.kr) and adds Google Play Billing, Google sign-in and one ad banner.
Normal users sign in with Kakao or Google. For review, use the ID/password login:

1. Open the app. Tap the bottom tab "내 정보" (My page), then "로그인" (Sign in).
2. At the bottom of the sign-in screen tap "Reviewer sign-in" and enter the ID and password above. No one-time code is needed.
3. Free content without sign-in: Home > "한 장 뽑기" (one-card reading). A banner ad appears under the result.
4. Paid content: Home > "타로 보기" > answer the questions and pick three cards > on the result tap "2,900원 결제하고 보기" >
   tick "위 내용을 확인했어요" > "Google Play로 2,900원 결제하기". The Google Play purchase sheet opens. After the purchase the full
   reading opens automatically. Purchases are one-time consumable products (ids: tarot, saju). The premium products (tarot_deep, match, newyear_2027) use the same purchase flow but are not open to the reviewer account.
5. Refund of an unopened purchase: "내 정보" > "결제한 풀이" > "환불받기".
6. Report AI-generated text: the "신고" (Report) link under every reading.
7. Delete the account: "내 정보" > "회원 탈퇴" (Delete account).
Readings are written in Korean. Guide articles open in the external browser on purpose.
```

## 확인 필요
- 심사용 계정은 프리미엄 상품(켈틱·궁합·신년운세)을 살 수 없게 돼 있다(`docs/runbook-payments.md` 4절: "premium stays closed to it").
  Play 심사자가 모든 인앱 상품에 접근해야 한다는 문장은 요건 페이지에 없다. 타로·사주 두 상품으로 결제 흐름을 보여 준다.
- 앱의 `Reviewer sign-in` 링크는 이 문서와 함께 추가한다(커밋은 `git log -- apps/web/app/login`).
