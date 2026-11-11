# Starlog Android app — implementation plan (2026-11-11)

Spec: `docs/superpowers/specs/2026-11-11-starlog-android-app-design.md` (5db2e06).
Branch `feat/p1-foundation`. Nothing here deploys, applies a remote migration, or submits to Google Play: those wait for the owner's yes.

## Decisions on top of the spec

1. **Shell library: plain Kotlin WebView shell with a small JS bridge, not Capacitor.** The spec says "Capacitor"; the main session relayed (11/11) that the owner approved the behaviour ("a WebView shell app that loads the live site, with Play Billing, native Google sign-in and AdMob on free results") and that the library is a technical choice. Why:
   - Capacitor's config docs say of `server.url`: "This is intended for use with live-reload servers. **This is not intended for use in production.**", and the same of `server.allowNavigation` (https://capacitorjs.com/docs/config). Our app would be exactly those two settings.
   - All three native features (Play Billing, Credential Manager, AdMob banner) are custom code either way; Capacitor would add only bridge wiring plus a Node toolchain inside the pnpm workspace.
   - Kakao's `intent:` handling and "guide links open outside" need our own `WebViewClient`.
   - The bridge is AndroidX `WebViewCompat.addWebMessageListener` limited to the origin `https://starlog.yeolmaeapps.kr`, so no other page reaches billing or sign-in.
   Behaviour approved by the owner is unchanged.
2. **Personal Play developer account** (owner 11/11, relayed by the main session): its creation date is the first item of the owner checklist; launch steps are written for both cases (section "Launch").
3. **Refund detection: the voided-purchases API on the existing 10-minute cron**, not RTDN. The spec allows either; the pull needs no Pub/Sub topic, no new public endpoint and no extra owner setup. A purchase whose client died is recovered by the app (`queryPurchasesAsync` on start/resume).
4. **Play test purchases** (license testers the owner names in Play Console) are recorded like real ones (`payments.mode = 'play'`, `play_purchases.test = 1`): only owner-named accounts can make them, and the spec's verification needs a test-card purchase to open a reading on production.
5. **신고 and the ad signal exist only in the app** (`data-app`), so the public web is unchanged.
6. Package name `kr.yeolmaeapps.starlog` (permanent once uploaded; the owner confirms it in the checklist).

## Official facts checked 2026-11-11 (full quotes: shared notes `android-policy-billing-build.md`, `android-policy-ads-login.md`)

| Topic | Quote | URL |
|---|---|---|
| Ads beside a WebView | "AdMob and Ad Manager in-app ads may be shown in an app next to a WebView as long as the Google Mobile Ads SDK is in use and the publisher is compliant with all other relevant program policies and guidelines." | support.google.com/admob/answer/48182 |
| Banner must not overlay | "Banner ads should not float or hover over app content." / "It is recommended that you allocate a fixed space for the banner ad" | support.google.com/admob/answer/6275345, /6275335 |
| No ads on dead-end screens | "Ads should not be placed on "dead end" or no content screens (e.g., Thank You, Exit, Error pages, etc.)" | support.google.com/publisherpolicies/answer/11112688 |
| WebView API for Ads | required "to monetize by publishing AdSense and Ad Manager ads through a web content viewing frame"; nothing says an app with no web ads must call `registerWebView` (NOT VERIFIED as a duty). Our WebView shows no web ads: guides (AdSense) open outside. | support.google.com/admob/answer/48182, developers.google.com/admob/android/browser/webview/api-for-ads |
| UMP order | "request an update of the user's consent information at every app launch, using requestConsentInfoUpdate()" → `loadAndShowConsentFormIfRequired()` → "Before requesting ads, use canRequestAds()". Artifact `com.google.android.ump:user-messaging-platform:4.0.0`. Messages target "App users in the EEA, the UK, and Switzerland". | developers.google.com/admob/android/privacy, support.google.com/admob/answer/10114020 |
| Ads SDK | `com.google.android.gms:play-services-ads:25.5.0`, min SDK 24, manifest `com.google.android.gms.ads.APPLICATION_ID` or "Missing application ID" crash. Test app id `ca-app-pub-3940256099942544~3347511713`, test adaptive banner `ca-app-pub-3940256099942544/9214589741`. (Maintenance mode; supported to 2027-06-30, sunset 2028-06-30.) | developers.google.com/admob/android/quick-start, /test-ads, /deprecation |
| Kakao in a WebView | "웹뷰에서는 WebViewClient#shouldOverrideUrlLoading 메서드를 오버라이딩(Override)하여 Intent 를 파싱(Parsing)하고, 해당 Activity 를 실행해야 합니다." + `<queries><package android:name="com.kakao.talk" /></queries>`. No ban on WebViews found. Whether the plain REST redirect fires `intent://`: NOT VERIFIED (real device). | developers.kakao.com/docs/latest/ko/javascript/hybrid |
| Google OAuth not in a WebView | "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control." | developers.google.com/identity/protocols/oauth2/policies#browsers |
| Credential Manager | "Set the setServerClientId parameter. The webClientId is the Web Client ID…"; nonce "for server-side verification"; server checks signature, `aud`, `iss` (accounts.google.com or https://accounts.google.com), `exp`; keys at https://www.googleapis.com/oauth2/v3/certs; account key is `sub`. Artifacts `androidx.credentials:credentials:1.6.0`, `credentials-play-services-auth:1.6.0`, `googleid:1.2.1`. Whether an Android OAuth client (package + SHA-1) is also needed: NOT VERIFIED. | developer.android.com/identity/sign-in/credential-manager-siwg-implementation, developers.google.com/identity/gsi/web/guides/verify-google-id-token |
| Play Billing version | "Google Play Billing Library 9.1.0 Release (2026-06-18)"; version 7 is past its extension (2026-11-01), so 8+ is required. | developer.android.com/google/play/billing/release-notes, /deprecation-faq |
| Verify, then consume | "Your app should always verify the legitimacy of purchases before granting benefits"; "purchaseToken is globally unique, so you can safely use this value as a primary key"; "if your app has a secure backend, we recommend that you use Purchases.products:consume"; must be done "within three days so that the purchase isn't automatically refunded"; "Only grant entitlement when the purchase transitions from PENDING to PURCHASED". | developer.android.com/google/play/billing/integrate, /security |
| products.get | `GET …/androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{token}`; `purchaseState` 0 Purchased / 1 Canceled / 2 Pending; `consumptionState`; `purchaseType` 0 = test, absent for a real purchase; `obfuscatedExternalAccountId`, `obfuscatedExternalProfileId`. Consume: `POST …/tokens/{token}:consume`. Scope `https://www.googleapis.com/auth/androidpublisher`; service-account JWT (RS256; iss, scope, aud `https://oauth2.googleapis.com/token`, exp ≤ 1 h, iat) with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. | developers.google.com/android-publisher/api-ref/rest/v3/purchases.products, developers.google.com/identity/protocols/oauth2/service-account |
| Voided purchases | `GET …/purchases/voidedpurchases` (`startTime`, `maxResults`, `token`); "can only show voided purchases that have occurred during the past 30 days"; "6000 queries per day … 30 queries during any 30-second period". | developers.google.com/android-publisher/voided-purchases |
| obfuscated ids | "limited to 64 characters"; "Storing PII in this field results in purchases being blocked." | developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder |
| No other payment method | "apps may not lead users to a payment method other than Google Play's billing system. This prohibition includes … In-app webviews, buttons, links, messaging, advertisements, or other calls to action"; "In-app pricing must match the pricing displayed in the user-facing Play billing interface." | support.google.com/googleplay/android-developer/answer/9858738 |
| Target API | "Starting August 31 2026: New apps and app updates must target Android 16 (API level 36) or higher"; targeting 36, "your app can't opt-out of going edge-to-edge". | developer.android.com/google/play/requirements/target-sdk, /about/versions/16/behavior-changes-16 |
| Account deletion | "provide users with an in-app path to delete their app accounts and associated data; and provide a web link resource" | support.google.com/googleplay/android-developer/answer/13327111 |
| AI content | "Apps that generate content using AI must contain in-app user reporting or flagging features that allow users to report or flag offensive content to developers without needing to exit the app." | support.google.com/googleplay/android-developer/answer/13985936 |
| Own-site WebView | banned: "provide a webview of a website without permission from the website owner or administrator". No fortune-telling policy found (0 hits for astrolog/fortune/horoscope/tarot/psychic/divination/zodiac). | support.google.com/googleplay/android-developer/answer/9899034 |

Machine: JDK 21 (Adoptium), Android SDK platforms 35/36, build-tools 36.0.0, emulator, system image android-35 google_apis x86_64, Gradle 8.14.3 distribution already under `~/.gradle/wrapper/dists`. Nothing needs installing. No AVD and no device yet.

## Contracts (shared by the web and the shell)

**App detection.** The shell appends ` StarlogApp/<versionName>` to the WebView user agent. `lib/inApp.ts` gains `isStarlogApp(userAgent)`. An inline script in `app/layout.tsx` sets `<html data-app="android">` before paint; CSS `.web-only` is hidden under `[data-app]`, `.app-only` is hidden without it. Routes read the request's user agent.

**Bridge.** `window.StarlogNative` (from `addWebMessageListener`, origin-limited, main frame only): `postMessage(json)` and `onmessage`.
- Request `{"id","type","payload"}` → reply `{"id","ok":true,"data"}` or `{"id","ok":false,"code":"CANCELED"|"PENDING"|"UNAVAILABLE"|"ERROR","message"?}`.
- `hello` → `{version, privacyOptionsRequired}`
- `purchase` `{playProductId, orderId, accountTag}` → `{purchaseToken, productId}`
- `unfinishedPurchases` → `{purchases:[{purchaseToken, productId}]}` (PURCHASED, not consumed)
- `googleSignIn` `{clientId, nonce}` → `{idToken}`
- `ad` `{show}` → ok. The shell also hides the banner on every page start and refuses to show it unless the path starts with `/now`, `/saju/grade` or `/today`.
- `privacyOptions` → shows the UMP privacy options form.

**Play products.** Play product id = web product id with `-` → `_` (`tarot`, `saju`, `tarot_deep`, `match`, `newyear_2027`, `set_2027`), consumable, same KRW price as `lib/pay/catalog.ts`.

**Server.**
- `GET /api/pay/checkout` and `POST /api/pay/orders` from the app: need the Play client instead of Toss; checkout answers `provider: "play"`, orders adds `play: {productId, accountTag}` (`accountTag` = sha256 hex of the user id, 64 chars; the order id rides as `obfuscatedProfileId`).
- `POST /api/pay/play/verify {purchaseToken, productId}` (no session, same-origin, PAY_LIMITER; like `/api/pay/confirm`): Google is asked; `purchaseState` must be 0; the order comes from `obfuscatedExternalProfileId` and must match the product and `obfuscatedExternalAccountId`; one batch marks the order paid, writes `payments` (`payment_key = play_<sha256(token)>`, `mode = 'play'`), `play_purchases` (token PK) and the same lots as Toss (`paidLotStatements`); then `consume`. A repeat answers `paid` and changes nothing. Pending → `PAY_PENDING`. A deleted account's purchase is never consumed (Google refunds it after three days) and is logged.
- Cron (`runMaintenance`): consume purchases not consumed yet; list voided purchases since the last run and apply each like a Toss cancellation (`lockPaidLotForRefund` + `applyCancel`).
- `reserveUnlock` accepts `payments.mode = 'play'` beside the deploy's own mode. `/api/pay/refund` refuses a Play order with Google's refund path; `orderHistory` says `provider`.
- `POST /api/auth/google/native/start` → state cookie + `{state, nonce, clientId}`; `POST /api/auth/google/native {state, idToken}` → verifies the ID token (JWKS signature, aud, iss, exp, nonce) and finishes like the callback (login or the deletion re-check). `/api/auth/google/start` sends the app back like an in-app browser.
- `POST /api/readings/report {kind, readingId?, reason, note?}` → `reading_reports` row.
- Secrets/vars: `PLAY_SERVICE_ACCOUNT_JSON` (secret), `PLAY_PACKAGE_NAME` (var), `STARLOG_PLAY=mock` (never in production).

## Tasks (each: failing test first, then code, targeted vitest green)

### W1 — payments on the server (files: `migrations/0024_*`, `lib/pay/*`, `app/api/pay/**`, `lib/inApp.ts`, ops scripts)
- [ ] W1.1 `isStarlogApp` in `lib/inApp.ts` + test.
- [ ] W1.2 migration `0024_play_payments.sql`: rebuild `payments` with `mode CHECK IN ('test','live','mock','play')` (rows kept, as 0023 did for `credit_lots`); `play_purchases (purchase_token PK, order_id UNIQUE FK, play_product_id, google_order_id, test, purchased_at, consumed_at, voided_at, created_at)`; test DB helpers updated.
- [ ] W1.3 `lib/pay/play.ts`: `PlayClient {getPurchase, consume, listVoided}`, service-account token (WebCrypto RS256, cached), `playClient(env)` (null when not configured, mock outside production), `playProductId`/`productFromPlayId`, `playAccountTag`; tests with an injected fetch and a generated RSA key.
- [ ] W1.4 `lib/pay/playOrders.ts`: `verifyPlayPurchase` (rules above, idempotent), `consumePending`, `applyVoided`; tests: paid once, repeat, wrong account tag, wrong product, pending, cancelled, deleted account, set → two lots, voided unopened → refunded, voided opened → revoked.
- [ ] W1.5 `reserveUnlock` accepts `'play'`; contract test: a Play lot opens under test, live and no Toss keys.
- [ ] W1.6 routes: checkout/orders app branch, `play/verify`, refund refusal, `orderHistory.provider`; route tests.
- [ ] W1.7 cron step in `runMaintenance` (before the Toss steps; `meta.play_voided_since`); maintenance route passes the client; tests.
- [ ] W1.8 `check-client-bundle.mjs` / `check-worker-env.mjs` know `PLAY_SERVICE_ACCOUNT_JSON`; `.env.example`; runbook section "Google Play purchases".

### W2 — app mode in the web UI (files: `lib/app/*`, `app/layout.tsx`, globals CSS, checkout/login/me screens, `app/api/auth/google/native/**`, `app/api/readings/report`, `migrations/0025_*`)
- [ ] W2.1 `data-app` inline script, `.web-only`/`.app-only`, `lib/app/bridge.ts` (`isApp`, `callNative`, `useIsApp`) + tests.
- [ ] W2.2 checkout in the app: no Toss SDK, no Toss/card wording, a Google Play button → order → `purchase` → `/api/pay/play/verify` → the same landing as `/pay/success`; unfinished purchases sent to verify on app start.
- [ ] W2.3 web-payment wording hidden in the app (pricing, refund, FAQ, footer, 내 정보: 영수증/환불받기 → Google's path for Play orders).
- [ ] W2.4 Google native login: `lib/account/googleIdToken.ts` (JWKS verify, cached keys), the two routes, LoginPanel and the deletion re-check use the bridge in the app; `/api/auth/google/start` refuses the app; tests with a generated key.
- [ ] W2.5 신고: migration `0025_reading_reports.sql`, route, `ReportReading` control on every AI reading (tarot/saju full, premium, follow-up answers, 맛보기, 오늘의 한 장), app only; tests.
- [ ] W2.6 free-result signal: `AppAdSignal` on 지금의 한 장 (revealed, not the care screen), 사주 등급 카드 (a real result, not the example), 오늘의 한 장 (reading shown); off on unmount; tests.

### A — `apps/android` (no package.json: outside the pnpm workspace)
- [ ] A1 Gradle project (AGP 8.13.0, Gradle 8.14.3 wrapper, Kotlin 2.2.20, compile/target 36, min 24), `kr.yeolmaeapps.starlog`, debug build green.
- [ ] A2 `MainActivity`: WebView over a fixed banner slot, insets, UA suffix, back handling, offline page; `StarlogWebViewClient`: our host and Kakao's login hosts inside, `intent:` → KakaoTalk or fallback, everything else (guides on yeolmaeapps.kr) in the external browser.
- [ ] A3 bridge (`addWebMessageListener`, origin allow-list from `BuildConfig`), unit tests for message parsing and the URL rules.
- [ ] A4 Play Billing 9.1.0 (`enablePendingPurchases(PendingPurchasesParams…enableOneTimeProducts())`, `enableAutoServiceReconnection()`, `QueryProductDetailsResult`, obfuscated ids, unfinished purchases on connect/resume).
- [ ] A5 Google sign-in (Credential Manager, `GetGoogleIdOption`, nonce).
- [ ] A6 AdMob banner + UMP (order above), shown only on the signal and the path rule; ids from Gradle properties, Google's test ids by default (`ADMOB_APP_ID`, `ADMOB_BANNER_ID`).
- [ ] A7 icon (adaptive) and splash from the brand logo; release signing from `keystore.properties` (ignored by git); README with build commands.
- [ ] A8 debug APK and AAB; emulator (AVD from the installed android-35 image): site loads, UA suffix seen by the web, banner signal on a free result, no Toss checkout.

### V — verification (controller)
- [ ] V1 `STARLOG_AI=mock npx vitest run --maxWorkers=2`, `pnpm typecheck` from the root.
- [ ] V2 `OPS_LOG=<scratch> bash scripts/ops/gate3-lite.sh` (HEAD = branch tip).
- [ ] V3 a separate reviewer agent reads the diff; findings fixed; re-run V1.
- [ ] V4 emulator run against a local dev server in app mode; screenshots.

## Launch (after the owner's yes; not part of this run)
1. Back up D1, apply 0024 and 0025 to production (0024 rebuilds `payments`: same steps as 0023 in the payments runbook), deploy the web.
2. Owner checklist (final report) → secrets, real AdMob ids, release keystore → signed AAB.
3. Play Console → internal testing: test-card purchase and refund, Kakao and Google login, banner per screen, deletion, 신고.
4. **Account created after 2023-11-13:** closed testing with at least 12 testers opted in for 14 days in a row, then apply for production access, then production review. **Created before that date:** production review directly. (support.google.com/googleplay/android-developer/answer/14151465)

## Risks kept open
- Kakao login inside the WebView and the KakaoTalk `intent:` hop need a real device with KakaoTalk.
- Credential Manager may need an Android OAuth client (package + SHA-1) in the same Google Cloud project (NOT VERIFIED): in the owner checklist.
- The refund page and terms do not mention Google Play purchases yet: wording for the owner to approve before release.
- 16 KB page size applies only if the bundle carries native libraries: checked on the built APK.
