# Starlog Android app (design, 2026-11-11)

Owner request (11/11): "우리가 앱이 없다 웹이랑 연동되는 앱 빌드해야겠어", "앱은 결제 바로 되고 광고도 달수있잖아".
Owner decisions (11/11): Google Play first; Google Play Billing inside the app; a WebView shell app (Capacitor); ads only on free result screens. The owner's Play developer account has already published an app.

## What official sources say (checked 11/11; URLs in the research note below)
- Digital content used in the app must be sold with Google Play's billing system, and the app may not lead users to another payment method (Play Payments policy, answer/9858738). Service fee: 15% of the first USD 1M a year, 30% above (answer/112622).
- Korea's alternative billing cuts the fee by 4 points and needs PCI DSS proof, the alternative billing APIs and 24-hour transaction reports (answer/11222040): not chosen.
- A WebView of one's own site is allowed; an app must still give value of its own (answer/9899034).
- Google OAuth must not run in an embedded WebView (developers.google.com/identity/protocols/oauth2/policies).
- New apps must target Android 16 (API 36) (developer.android.com/google/play/requirements/target-sdk).
- Apps with accounts need an in-app deletion path and a web deletion link (answer/13327111). Generative-AI apps need in-app reporting of offensive content (answer/13985936).
- Closed testing (12 testers, 14 days) applies to personal accounts created after 2023-11-13 (answer/14151465): the owner checks the account's creation date.
- Review may take seven days or longer (answer/9859751).
- Not verified yet: AdMob's rules for ads beside a WebView (read the AdMob policy and "WebView API for Ads" pages before building ads), whether Kakao login works in a WebView, any policy specific to fortune-telling apps.

## Architecture
- `apps/android`: a Capacitor shell whose WebView loads `https://starlog.yeolmaeapps.kr`. A web deploy updates the app's screens; the shell changes only for native features.
- Guide articles (yeolmaeapps.kr, AdSense) open in the external browser, never inside the app, so AdSense content is not framed next to AdMob.
- The web detects the app (a user-agent suffix set by the shell plus the injected bridge) and changes three things only: payment, login, ads. Everything else is the same code and the same account.

## Payments
- Play Console: one consumable in-app product per web product at the same KRW price (tarot, saju, 켈틱, 궁합, 신년운세, the 신년+궁합 set).
- In the app the pay button opens the Play purchase sheet (native billing through the bridge). The purchase token goes to a new server route that verifies it with the Google Play Developer API (service account secret in the Worker), grants the same credit lot the Toss path grants (payments.mode gains a `play` source), then consumes the purchase. Idempotent on the purchase token.
- Opening a reading, the 3 reopenings and the ledger are the existing code. Refunds: ours for an unopened reading (below), and whatever is refunded on Google's side is read from the voided-purchases API on the 10-minute cron, which revokes the lot like a Toss cancellation does (no Real-time developer notifications). A purchase the server cannot accept (wrong order, product or account, a deleted account) is refunded at once through `orders.refund`, never left to Google's 3-day expiry.
- In the app no Toss checkout, no web-payment link or wording appears.
- 환불받기 for a Play purchase (owner 2026-11-11, changed from "points to Google's refund path"): an unopened reading is refunded by our server like on the web, within the same 7 days, through the Play Developer API (`orders.refund` with `revoke=true`); account deletion refunds an unopened Play purchase the same way. Whole orders only: a set with one reading opened goes to the operator. A refund made on Google's side (the buyer's request to Google, Play Console, a chargeback) reaches us through the voided-purchases list on the cron.

## Login
- Google: native account picker (Credential Manager) through the bridge; the server exchanges the ID token for the existing session.
- Kakao: verify on a real device first. If the WebView flow is refused, run it in a Custom Tab with an app-link return.

## Ads (AdMob)
- One banner under free results only: 지금의 한 장, 사주 등급 카드, 오늘의 한 장. Never on paid readings, checkout, login, while drawing cards, loading or error screens.
- The web tells the shell when a free result is on screen; the shell shows or hides the native banner. Consent handled in the shell (UMP) as AdMob requires.

## Policy items
- Account deletion: the existing 내 정보 → 탈퇴 path in the app, plus a web deletion URL in the listing.
- AI content report: a 신고 control on every AI reading in the app.
- Data safety form, privacy policy URL, target API 36.

## Owner steps (guided one screen at a time)
Play Console app and products, payments profile, Play Developer API service account, AdMob account and ad unit, upload key kept safe.

## Verification
- Web changes: unit tests, the deploy gate, deploy as today.
- App: internal testing track on a real device: test-card purchase and refund, each login, banner on and off per screen, deletion, report. Then production review.

## Out of scope
iOS, Korea alternative billing, rewarded ads, a native rewrite, push notifications.
