import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val siteUrl = "https://starlog.yeolmaeapps.kr"

// Debug builds may load a local web dev server instead: -PstarlogUrl=http://10.0.2.2:3100
val debugSiteUrl = ((findProperty("starlogUrl") as String?) ?: siteUrl).trimEnd('/')
require(Regex("^https?://[^/?#@]+$").matches(debugSiteUrl)) {
    "starlogUrl must be an origin like http://10.0.2.2:3100, got '$debugSiteUrl'"
}

// AdMob ids: Google's test ids by default (gradle.properties); pass the real ones for production.
val admobAppId = findProperty("ADMOB_APP_ID") as String
val admobBannerId = findProperty("ADMOB_BANNER_ID") as String

// Google web client id for native sign-in (the same public value as the web's GOOGLE_CLIENT_ID). Empty by default:
// then the shell accepts the page's id only if it looks like one (debug, local dev). Release builds must set it.
val googleWebClientId = ((findProperty("GOOGLE_WEB_CLIENT_ID") as String?) ?: "").trim()
require(googleWebClientId.isEmpty() || Regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$").matches(googleWebClientId)) {
    "GOOGLE_WEB_CLIENT_ID must look like 1234-abc.apps.googleusercontent.com, got '$googleWebClientId'"
}

// Release guard (review L17): no silent release with Google's TEST ad ids or without the Google client id.
// -PallowTestAds=true / -PallowNoGoogleClientId=true build one on purpose (e.g. an internal-testing AAB).
val googleTestAdsPublisher = "ca-app-pub-3940256099942544"
val releaseProblems = buildList {
    if (findProperty("allowTestAds") != "true" &&
        (admobAppId.startsWith(googleTestAdsPublisher) || admobBannerId.startsWith(googleTestAdsPublisher))
    ) {
        add("ADMOB_APP_ID / ADMOB_BANNER_ID are still Google's TEST ids: pass the real ones (-PADMOB_APP_ID=... -PADMOB_BANNER_ID=...) or -PallowTestAds=true")
    }
    if (findProperty("allowNoGoogleClientId") != "true" && googleWebClientId.isEmpty()) {
        add("GOOGLE_WEB_CLIENT_ID is empty: pass -PGOOGLE_WEB_CLIENT_ID=<the web's GOOGLE_CLIENT_ID> or -PallowNoGoogleClientId=true")
    }
}
val checkReleaseIds = tasks.register("checkReleaseIds") {
    doLast {
        if (releaseProblems.isNotEmpty()) {
            throw GradleException("Release build refused:\n - " + releaseProblems.joinToString("\n - "))
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkReleaseIds) }

// Upload-key signing from apps/android/keystore.properties (git-ignored). Without it the release is unsigned.
val keystoreProps = rootProject.file("keystore.properties").takeIf { it.exists() }?.let { file ->
    Properties().apply { file.inputStream().use { load(it) } }
}

android {
    namespace = "kr.yeolmaeapps.starlog"
    compileSdk = 36

    defaultConfig {
        applicationId = "kr.yeolmaeapps.starlog"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        manifestPlaceholders["admobAppId"] = admobAppId
        buildConfigField("String", "ADMOB_BANNER_ID", "\"$admobBannerId\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    signingConfigs {
        if (keystoreProps != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"$debugSiteUrl\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"$siteUrl\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keystoreProps != null) signingConfigs.getByName("release") else null
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // Versions checked 2026-11-11 on the official release pages / Google Maven (see README).
    // core stays on 1.18.0: 1.19.x needs compileSdk 37 and AGP 9.1 (its AAR metadata); 1.18.0 needs 36 / 8.9.1.
    implementation("androidx.core:core:1.18.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.webkit:webkit:1.18.0")
    implementation("com.android.billingclient:billing-ktx:9.1.0")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    // googleid stays on 1.2.0: 1.2.1 ("Minor metric improvements") is built with Kotlin metadata 2.4,
    // which the Kotlin 2.2.20 compiler cannot read; 1.2.0 carries metadata 2.1.
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")

    testImplementation("junit:junit:4.13.2")
    // Real org.json for JVM unit tests (android.jar only has stubs).
    testImplementation("org.json:json:20260814")
}
