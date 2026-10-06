# Runbook: Google login

Google sign-in sits under Kakao on /login (owner decision 2026-10-06: foreign visitors rarely have Kakao; LINE later).
It works exactly like Kakao login: the same `STARLOG_PAYMENTS` gates and owner pass, the same 만 14세 check, session, signup gift rule and deletion steps (docs/runbook-payments.md).
Code: `apps/web/lib/account/google.ts`, `apps/web/app/api/auth/google/{start,callback}/route.ts`.
Never paste key values into chat, commits or logs.

## 1. Google Cloud (owner, once)

Project "Starlog" (`starlog-510812`), Google Auth Platform:

- **Clients:** the OAuth web client "스타로그 웹". Authorized redirect URIs, exactly:
  - `https://starlog.yeolmaeapps.kr/api/auth/google/callback`
  - `http://localhost:3100/api/auth/google/callback`
  No JavaScript origins are needed: the browser never runs Google's script, the server does the whole exchange.
- **Data access (scopes):** `openid` only. Do not add `email` or `profile`: the privacy policy says Google gives us the account id and nothing else.
- **Branding:** app name 스타로그, home page `https://starlog.yeolmaeapps.kr`, privacy policy `https://starlog.yeolmaeapps.kr/privacy`, terms `https://starlog.yeolmaeapps.kr/terms`, authorized domain `yeolmaeapps.kr`.
- **Audience:** External, now in **Testing**. Testing limits sign-in to the listed test users (100 at most), but Google's help (Google Auth Platform, "Manage App Audience") makes one exception: an app that asks only for basic identity scopes (`openid`, email, profile) needs no test-user listing, shows no warning, and its sign-ins do not expire after 7 days. This app asks only for `openid`, so the exception should apply: check it once with a Google account that is not a test user (section 3). Add the owner's account as a test user anyway, so the owner check works either way.
- **Before the public launch (`STARLOG_PAYMENTS=on`): Audience → Publish app → In production**, whatever that check shows, so the app's status matches its use. With only `openid` no scope verification is needed; if the console asks to verify the branding (name, logo, domain), do what Verification Center says.

## 2. Secrets

```
npx wrangler secret put GOOGLE_CLIENT_ID       # …apps.googleusercontent.com
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

- On Workers both are read from the Worker's own secrets only (never from a build's .env values: `pnpm check:worker-env` already fails a build that carries `GOOGLE_CLIENT_SECRET`).
- Either missing: Google login answers `login=unavailable` and logs `config.google_invalid` with the missing names. Kakao login is unaffected.
- Local real test on http://localhost:3100: both in `apps/web/.env.local`. Without them, `STARLOG_GOOGLE=mock` takes `mock:<name>` codes like `STARLOG_KAKAO=mock` (refused in production).
- Rotating `GOOGLE_CLIENT_SECRET` (add a new secret in the console, `wrangler secret put`, then disable the old one) changes nothing stored. A new OAuth client keeps every account too: Google's account id (`sub`) is the same for every client.

## 3. Owner check in production (owner mode)

On the owner-pass browser, with the owner's Google account listed as a test user:

- [ ] /login shows `카카오로 계속하기`, then `Google로 계속하기` under it (white button, color G)
- [ ] Google login → back with `login=ok`; 내 정보 shows 별손님, `Google로 로그인했어요` and 별조각 10개
- [ ] while the app is still Testing, a Google account that is not a test user (owner pass on that browser too): note whether Google lets it in (section 1), then 회원 탈퇴 that account
- [ ] `SELECT COUNT(*) AS n FROM users WHERE kakao_key LIKE 'google:%'` counts it
- [ ] log out, log in again with Google: the same account, still one gift (`SELECT COUNT(*) AS n FROM gift_claims WHERE kakao_key LIKE 'google:%'`)
- [ ] in KakaoTalk's in-app browser (enter the owner code there too, or it answers 지금은 새로 가입할 수 없어요 first), tick 만 14세 and press Google: /login says `Google 로그인은 카카오톡 밖의 브라우저에서 해 주세요.`
- [ ] 회원 탈퇴 → `Google로 확인하고 탈퇴하기` → Google's account chooser → /me says 탈퇴했어요; https://myaccount.google.com/connections no longer lists 스타로그 (`auth.google_revoke_failed` in the logs if Google refused the revoke; the account is deleted either way)

## 4. What it stores, and what it does not

- `users.kakao_key` = `google:` + a keyed hash (HMAC, from `STARLOG_ACCOUNT_SECRET`) of Google's account id. The id itself, the tokens, names, email addresses and pictures are never stored or even asked for (scope `openid`).
- The nickname is 별손님 (Google is asked for no name).
- `STARLOG_ACCOUNT_SECRET` must still never rotate: every Google account would become a new one, as every Kakao account would.

## 5. Known limits

- **Gift:** one per Google account, as one per Kakao account. A person who signs in with Kakao and with Google has two accounts and two gifts; nothing links them (that would need an identifier both share, such as a verified email, which we do not collect).
- **Deletion re-check:** Google has no forced re-login (`prompt` takes none, consent or select_account; Google does not support re-authentication requests). The re-check shows Google's account chooser (`prompt=select_account`) and the account that answers must be the session's. Unlike Kakao's `prompt=login`, a browser already signed in to that Google account passes without a password.
- **In-app browsers:** Google refuses to sign in inside them (`403 disallowed_useragent`). KakaoTalk's is caught and sent back with a note (login and deletion). Others (Instagram, Facebook, LINE, …) show Google's own error page.
- **Turning Google off** (deleting either secret) also locks existing Google accounts out: no login, so no opening what they bought, no refund button and no deletion re-check. Keep both secrets while `SELECT COUNT(*) AS n FROM users WHERE kakao_key LIKE 'google:%'` is above 0; to stop new sign-ups use `STARLOG_PAYMENTS=paused` (runbook-payments section 9).

## 6. Do not

- Set `STARLOG_GOOGLE=mock` in production (refused: `login=unavailable`).
- Add `email` or `profile` to the scopes without changing the privacy policy first (and announcing it 7 days ahead).
