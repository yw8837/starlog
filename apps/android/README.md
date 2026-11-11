# Starlog Android shell (`kr.yeolmaeapps.starlog`)

A single-activity Kotlin app that shows https://starlog.yeolmaeapps.kr in a WebView and adds what the web
cannot do inside a Play app: Google Play Billing, native Sign in with Google (Credential Manager) and an
AdMob banner under free results. This folder is outside the pnpm workspace on purpose (no `package.json`).

- **Bridge contract** (`window.StarlogNative`, message types, app detection by the ` StarlogApp/<version>`
  user-agent suffix, banner paths): `docs/superpowers/plans/2026-11-11-starlog-android-app.md`, section
  "Contracts". The bridge exists only on the `BASE_URL` origin, main frame only
  (`WebViewCompat.addWebMessageListener`); WebViews without that feature get no bridge.
- **Navigation** (`UrlRouter`, unit-tested): our origin and `kakao.com` / `*.kakao.com` (Kakao login) stay
  in the WebView; `intent:` / `kakaotalk:` / `kakaolink:` / `market:` start the matching app (`intent:` is
  hardened like a browser: BROWSABLE, no component/selector, no URI grants; `browser_fallback_url` loads
  in the WebView only if it passes the same rule); every other https link (guides on yeolmaeapps.kr,
  Google refund help, receipts) opens in the user's browser; `javascript:`/`file:`/`data:`/`content:`,
  userinfo URLs and `http:` (release) are blocked.
- **Payments**: the app launches the Play purchase and returns `{purchaseToken, productId}`; the server
  verifies, grants and consumes. The app never acknowledges, consumes or grants anything. Failure codes:
  `CANCELED`, `PENDING`, `UNAVAILABLE`, `ERROR`, and `OWNED` (Play still holds an unconsumed purchase of that
  product; the web then asks `unfinishedPurchases`). The account tag must be 64 lowercase hex (sha256).
- **Google sign-in**: the token's audience is `GOOGLE_WEB_CLIENT_ID` from the build; the page's `clientId` is
  ignored, and a different one is refused (`ERROR client_mismatch`). Only a build without the property (debug,
  local dev) uses the page's value, and only if it looks like `<digits>-<id>.apps.googleusercontent.com`.
- **Banner**: at launch only the UMP consent-information update runs (Google: "at every app launch"); `hello`
  waits for it up to 2.5 s to report `privacyOptionsRequired`. On the web's first `ad {show:true}`: the
  consent form if required → `MobileAds.initialize` (background thread) → one large anchored adaptive banner
  under the WebView. Its slot is reserved at the ad's height (dark, empty) as soon as the signal is on, the
  path is `/now`, `/saju/grade` or `/today` (and below) and consent allows ads, so the page does not jump when
  the ad arrives ("allocate a fixed space for the banner ad"); a failed load collapses it, as do `show:false`,
  every page start and pausing. The large size (50-150dp; about 128dp on a Pixel 7 emulator) is used because 25.x deprecates every
  standard-height anchored adaptive size in favour of it (AdSize reference). The non-adaptive `AdSize.BANNER`
  (320x50) is the only non-deprecated short option.

## Requirements

JDK 21, Android SDK with platform 36 and build-tools 36.0.0. `local.properties` (git-ignored) holds
`sdk.dir`. Gradle 8.14.3 comes from the wrapper (`./gradlew`); AGP 8.13.0, Kotlin 2.2.20,
compile/target SDK 36, min SDK 24.

### Dependencies (checked 2026-11-11)

| Artifact | Version | Source |
|---|---|---|
| `com.android.billingclient:billing-ktx` | 9.1.0 | developer.android.com/google/play/billing/release-notes |
| `com.google.android.gms:play-services-ads` | 25.5.0 | developers.google.com/admob/android/quick-start |
| `com.google.android.ump:user-messaging-platform` | 4.0.0 | developers.google.com/admob/android/privacy |
| `androidx.credentials:credentials`, `credentials-play-services-auth` | 1.6.0 | developer.android.com/jetpack/androidx/releases/credentials |
| `com.google.android.libraries.identity.googleid:googleid` | 1.2.0 | developers.google.com/identity/android-credential-manager/releases |
| `androidx.webkit:webkit` | 1.18.0 | developer.android.com/jetpack/androidx/releases/webkit |
| `androidx.activity:activity` | 1.13.0 | developer.android.com/jetpack/androidx/releases/activity |
| `androidx.core:core` | 1.18.0 | developer.android.com/jetpack/androidx/releases/core |
| `androidx.core:core-splashscreen` | 1.2.0 | developer.android.com/jetpack/androidx/releases/core |
| `junit:junit` / `org.json:json` (tests) | 4.13.2 / 20260814 | repo1.maven.org metadata |

Two are deliberately one step behind the newest: `core` 1.19.x requires compileSdk 37 and AGP 9.1 (its AAR
metadata; the build fails on AGP 8.13 / SDK 36), and `googleid` 1.2.1 ("Minor metric improvements") is
compiled with Kotlin metadata 2.4, which the Kotlin 2.2.20 compiler cannot read. Moving to AGP 9.x and
Kotlin 2.3+ lifts both.

R8: the SDKs ship their own consumer rules. After `bundleRelease`,
`app/build/outputs/mapping/release/mapping.txt` maps
`androidx.credentials.playservices.CredentialProviderPlayServicesImpl` to itself (kept, as Credential
Manager looks it up by name). The bundle contains no native `.so` libraries, so the 16 KB page-size rule
does not apply today; re-check if an SDK update adds any (`unzip -l app-release.aab | grep '\.so$'`).

## Build

```sh
./gradlew testDebugUnitTest   # URL rules, bridge messages, billing result codes
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease -PADMOB_APP_ID=... -PADMOB_BANNER_ID=... -PGOOGLE_WEB_CLIENT_ID=...
                              # app/build/outputs/bundle/release/app-release.aab (unsigned without keystore.properties)
./gradlew bundleRelease -PallowTestAds=true -PallowNoGoogleClientId=true
                              # on purpose: an internal-testing AAB with test ads and no fixed client id
./gradlew lintDebug           # app/build/reports/lint-results-debug.html
python tools/make_icons.py    # re-generate launcher icons from apps/web/public/logo.png (Pillow)
```

### Gradle properties

| Property | Default | Use |
|---|---|---|
| `starlogUrl` | `https://starlog.yeolmaeapps.kr` | Debug builds only: the site to load, e.g. `-PstarlogUrl=http://10.0.2.2:3100`. Release always loads production. |
| `ADMOB_APP_ID` | Google's **test** app id | Goes into the manifest (`com.google.android.gms.ads.APPLICATION_ID`). |
| `ADMOB_BANNER_ID` | Google's **test** adaptive banner id | `BuildConfig.ADMOB_BANNER_ID`. |
| `GOOGLE_WEB_CLIENT_ID` | empty | `BuildConfig.GOOGLE_WEB_CLIENT_ID`: the Google web OAuth client id, the same public value as the web's `GOOGLE_CLIENT_ID`. **Release builds must set it.** |
| `allowTestAds` | unset | `true` lets a release build use Google's test AdMob ids (internal testing only). |
| `allowNoGoogleClientId` | unset | `true` lets a release build go without `GOOGLE_WEB_CLIENT_ID`. |

The AdMob defaults in `gradle.properties` are placeholders. For a production build pass the real ids on the
command line (`-PADMOB_APP_ID=... -PADMOB_BANNER_ID=...`) or put them in `~/.gradle/gradle.properties`;
never commit them. `assembleRelease` / `bundleRelease` fail ("Release build refused: ...", task
`checkReleaseIds`) while the AdMob ids are Google's test ids or `GOOGLE_WEB_CLIENT_ID` is empty, unless the
matching `allow...` flag is passed. Debug builds are not checked.

Backups: `allowBackup="false"` plus `dataExtractionRules` (`res/xml/data_extraction_rules.xml`) keep the WebView
session out of cloud backups and device-to-device transfers on Android 12+; `fullBackupContent`
(`res/xml/backup_rules.xml`) repeats the same exclusions for Android 11 and lower.

### Release signing (upload key)

Without `keystore.properties` the release bundle is unsigned. To sign it, the owner creates an upload key once
(keep the `.jks` and its passwords outside git; Play App Signing holds the app signing key):

```sh
keytool -genkeypair -v -keystore starlog-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

and writes `apps/android/keystore.properties` (git-ignored):

```properties
storeFile=starlog-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` is relative to `apps/android`. Then `./gradlew bundleRelease` produces a signed AAB.

### Running against a local web dev server

Start the web app on the host (port 3100 in this example), then build a debug APK that points at the
emulator's alias for the host:

```sh
./gradlew assembleDebug -PstarlogUrl=http://10.0.2.2:3100
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Cleartext http is allowed only in debug builds (`src/debug` network security config). Debug builds also
enable WebView remote debugging (`chrome://inspect`, or `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`).

## Environment notes (this Windows machine)

The Windows user folder has non-ASCII characters, which three tools could not handle. Everything is
redirected to ASCII paths under `C:\starlog-ops\android` (nothing installed; one directory junction):

- **Gradle**: with the default `GRADLE_USER_HOME` (`C:\Users\<user>\.gradle`) the build compiled, but every
  JVM unit-test worker died with `ClassNotFoundException: worker.org.gradle.process.internal.worker.GradleWorkerMain`.
  Run Gradle with `GRADLE_USER_HOME=C:\starlog-ops\android\gradle-home` (PowerShell:
  `$env:GRADLE_USER_HOME='C:\starlog-ops\android\gradle-home'`; Git Bash: `export GRADLE_USER_HOME='C:\starlog-ops\android\gradle-home'`).
- **SDK path**: `C:\starlog-ops\android\sdk` is a junction to `%LOCALAPPDATA%\Android\Sdk`
  (`New-Item -ItemType Junction -Path C:\starlog-ops\android\sdk -Target "$env:LOCALAPPDATA\Android\Sdk"`).
  `local.properties` uses it: `sdk.dir=C\:\\starlog-ops\\android\\sdk` (lint rejects a `\u`-escaped user path).
- **Emulator**: started from the real SDK path it exited (code 21) after
  `Could not open C:\Users\<user>\...\VerifiedBootParams.textproto`. Through the junction it boots:

```powershell
$env:ANDROID_HOME='C:\starlog-ops\android\sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_AVD_HOME='C:\starlog-ops\android\avd'; $env:ANDROID_USER_HOME='C:\starlog-ops\android\user'
& C:\starlog-ops\android\sdk\emulator\emulator.exe -avd starlog35 -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-window -no-audio
```

  The AVD `starlog35` (Pixel 7 profile, `system-images;android-35;google_apis;x86_64`) was created with
  `avdmanager create avd -n starlog35 -k "system-images;android-35;google_apis;x86_64" -d pixel_7` using the
  same variables. Stop it with `adb -s emulator-5554 emu kill`.

On a machine whose user folder is ASCII none of this is needed.
