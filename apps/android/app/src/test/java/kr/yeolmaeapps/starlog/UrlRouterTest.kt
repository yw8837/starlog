package kr.yeolmaeapps.starlog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlRouterTest {
    private val release = UrlRouter("https://starlog.yeolmaeapps.kr", allowHttp = false)
    private val debugLocal = UrlRouter("http://10.0.2.2:3100", allowHttp = true)

    private fun assertRoute(expected: Route, router: UrlRouter, vararg urls: String) {
        for (url in urls) assertEquals(url, expected, router.route(url))
    }

    @Test fun originIsSchemeHostAndNonDefaultPort() {
        assertEquals("https://starlog.yeolmaeapps.kr", release.origin)
        assertEquals("https://starlog.yeolmaeapps.kr", UrlRouter("https://starlog.yeolmaeapps.kr/", false).origin)
        assertEquals("http://10.0.2.2:3100", debugLocal.origin)
    }

    @Test fun ourOriginStaysInTheWebView() {
        assertRoute(
            Route.InApp, release,
            "https://starlog.yeolmaeapps.kr",
            "https://starlog.yeolmaeapps.kr/",
            "https://starlog.yeolmaeapps.kr/now?x=1#top",
            "https://STARLOG.yeolmaeapps.kr/saju/grade",
            "HTTPS://starlog.yeolmaeapps.kr/today",
            "https://starlog.yeolmaeapps.kr:443/pay",
            "https://starlog.yeolmaeapps.kr/a|b?q={x}",
        )
    }

    @Test fun kakaoLoginHostsStayInTheWebView() {
        assertRoute(
            Route.InApp, release,
            "https://kauth.kakao.com/oauth/authorize?client_id=x&redirect_uri=y",
            "https://accounts.kakao.com/login/?continue=z",
            "https://kakao.com/",
            "https://logins.kakao.com/x",
        )
    }

    @Test fun lookalikeHostsGoToTheBrowser() {
        assertRoute(
            Route.External, release,
            "https://evilkakao.com/",
            "https://kakao.com.evil.example/",
            "https://starlog.yeolmaeapps.kr.evil.example/",
            "https://sub.starlog.yeolmaeapps.kr/",
            "https://starlog.yeolmaeapps.kr:8443/",
            "https://evil.example/?next=https://starlog.yeolmaeapps.kr",
            "https://evil.example#@starlog.yeolmaeapps.kr",
        )
    }

    @Test fun userinfoUrlsAreBlocked() {
        assertRoute(
            Route.Block, release,
            "https://starlog.yeolmaeapps.kr@evil.example/",
            "https://user:pw@starlog.yeolmaeapps.kr/",
        )
    }

    @Test fun guidesAndOtherSitesOpenInTheBrowser() {
        assertRoute(
            Route.External, release,
            "https://yeolmaeapps.kr/guide/tarot-basics",
            "https://www.yeolmaeapps.kr/",
            "https://support.google.com/googleplay/answer/2479637",
            "https://accounts.google.com/o/oauth2/v2/auth?x=1",
            "https://pay.google.com/",
        )
    }

    @Test fun appSchemesAreIntents() {
        assertRoute(
            Route.Intent, release,
            "intent://kakaolink?x=1#Intent;scheme=kakaolink;package=com.kakao.talk;end",
            "INTENT://x#Intent;end",
            "kakaotalk://inappbrowser?url=x",
            "kakaolink://send?x=1",
            "market://details?id=com.kakao.talk",
        )
    }

    @Test fun otherSchemesAreBlocked() {
        assertRoute(
            Route.Block, release,
            "javascript:alert(1)",
            "file:///sdcard/Download/x.html",
            "data:text/html,<b>x</b>",
            "content://media/external/images/1",
            "about:blank",
            "ftp://example.com/",
            "",
            "starlog.yeolmaeapps.kr/now",
            "https://",
            "https:///now",
            "https://starlog.yeolmaeapps.kr:abc/",
        )
    }

    @Test fun httpIsBlockedInRelease() {
        assertRoute(
            Route.Block, release,
            "http://starlog.yeolmaeapps.kr/",
            "http://kauth.kakao.com/oauth/authorize",
            "http://yeolmaeapps.kr/guide",
        )
    }

    @Test fun debugBuildCanUseALocalHttpDevServer() {
        assertRoute(Route.InApp, debugLocal, "http://10.0.2.2:3100/", "http://10.0.2.2:3100/now")
        assertRoute(
            Route.External, debugLocal,
            "http://10.0.2.2:3000/",
            "http://10.0.2.2/",
            "https://starlog.yeolmaeapps.kr/",
        )
        assertRoute(Route.InApp, debugLocal, "https://kauth.kakao.com/oauth/authorize")
    }

    @Test fun ourOriginIsExact() {
        assertTrue(release.isOurOrigin("https://starlog.yeolmaeapps.kr"))
        assertTrue(release.isOurOrigin("https://starlog.yeolmaeapps.kr/"))
        assertFalse(release.isOurOrigin("https://kauth.kakao.com"))
        assertFalse(release.isOurOrigin("http://starlog.yeolmaeapps.kr"))
        assertFalse(release.isOurOrigin("https://yeolmaeapps.kr"))
        assertFalse(release.isOurOrigin("https://starlog.yeolmaeapps.kr@evil.example"))
        assertFalse(release.isOurOrigin("null"))
        assertTrue(debugLocal.isOurOrigin("http://10.0.2.2:3100"))
    }

    @Test fun bannerOnlyOnFreeResultPathsOfOurOrigin() {
        for (url in listOf(
            "https://starlog.yeolmaeapps.kr/now",
            "https://starlog.yeolmaeapps.kr/now/",
            "https://starlog.yeolmaeapps.kr/now?card=3",
            "https://starlog.yeolmaeapps.kr/now#result",
            "https://starlog.yeolmaeapps.kr/saju/grade",
            "https://starlog.yeolmaeapps.kr/saju/grade/abc123",
            "https://starlog.yeolmaeapps.kr/today",
        )) assertTrue(url, release.adAllowed(url))

        for (url in listOf(
            null,
            "https://starlog.yeolmaeapps.kr",
            "https://starlog.yeolmaeapps.kr/",
            "https://starlog.yeolmaeapps.kr/nowhere",
            "https://starlog.yeolmaeapps.kr/saju",
            "https://starlog.yeolmaeapps.kr/saju/gradebook",
            "https://starlog.yeolmaeapps.kr/pay/success",
            "https://starlog.yeolmaeapps.kr/login?next=/now",
            "https://yeolmaeapps.kr/now",
            "https://starlog.yeolmaeapps.kr.evil.example/now",
            "http://starlog.yeolmaeapps.kr/now",
        )) assertFalse(url.toString(), release.adAllowed(url))
    }
}
