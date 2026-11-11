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
