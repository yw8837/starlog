package kr.yeolmaeapps.starlog

/** Where a main-frame navigation goes. */
enum class Route {
    /** Load in the WebView: our origin and Kakao's login pages. */
    InApp,

    /** Hand to the user's browser (guides on yeolmaeapps.kr, Google help, receipts, everything else). */
    External,

    /** `intent:` / `kakaotalk:` / `kakaolink:` / `market:`: start the app that handles it. */
    Intent,

    /** Never load (`javascript:`, `file:`, `data:`, `content:`, userinfo URLs, `http:` in release, ...). */
    Block,
}

/**
 * The shell's navigation rules. Pure (no Android types) so they are unit-tested on the JVM.
 *
 * URLs are parsed leniently by hand rather than with java.net.URI, which rejects characters
 * WebView passes through unescaped (for example `|` or `{` in a query) and would push our own
 * pages out to the browser. Anything ambiguous (userinfo, a bad port, no host) is blocked.
 */
class UrlRouter(baseUrl: String, private val allowHttp: Boolean) {

    /** `scheme://host[:port]` of BuildConfig.BASE_URL; the bridge is limited to it. */
    val origin: String = requireNotNull(parse(baseUrl)) { "bad base url: $baseUrl" }.origin

    fun route(url: String): Route {
        return when (url.substringBefore(':', "").lowercase()) {
            "intent", "kakaotalk", "kakaolink", "market" -> Route.Intent
            "https" -> webRoute(url)
            "http" -> if (allowHttp) webRoute(url) else Route.Block
            else -> Route.Block
        }
    }

    /** Exactly BASE_URL's origin (Kakao's hosts are not ours: they never reach the bridge). */
    fun isOurOrigin(url: String): Boolean = parse(url)?.origin == origin

    /** Free-result pages where the native banner may show: /now, /saju/grade, /today (and below) on our origin. */
    fun adAllowed(url: String?): Boolean {
        val parsed = url?.let(::parse) ?: return false
        return parsed.origin == origin &&
            AD_PATHS.any { parsed.path == it || parsed.path.startsWith("$it/") }
    }

    private fun webRoute(url: String): Route {
        val parsed = parse(url) ?: return Route.Block
        return when {
            parsed.origin == origin -> Route.InApp
            parsed.scheme == "https" && (parsed.host == "kakao.com" || parsed.host.endsWith(".kakao.com")) -> Route.InApp
            else -> Route.External
        }
    }

    private class Parsed(val scheme: String, val host: String, val origin: String, val path: String)

    private companion object {
        val AD_PATHS = listOf("/now", "/saju/grade", "/today")

        /** Splits an http(s) URL; null when it is not one or its authority is ambiguous. */
        fun parse(url: String): Parsed? {
            val sep = url.indexOf("://")
            if (sep <= 0) return null
            val scheme = url.substring(0, sep).lowercase()
            if (scheme != "http" && scheme != "https") return null

            val rest = url.substring(sep + 3)
            val authorityEnd = rest.indexOfFirst { it == '/' || it == '?' || it == '#' || it == '\\' }
            val authority = (if (authorityEnd < 0) rest else rest.substring(0, authorityEnd)).lowercase()
            if ('@' in authority) return null

            val colon = authority.lastIndexOf(':')
            val hasPort = colon > authority.lastIndexOf(']')
            val host = if (hasPort) authority.substring(0, colon) else authority
            val port = if (hasPort) authority.substring(colon + 1) else ""
            if (host.isEmpty() || port.any { !it.isDigit() }) return null

            val defaultPort = if (scheme == "https") "443" else "80"
            val origin = if (port.isEmpty() || port == defaultPort) "$scheme://$host" else "$scheme://$host:$port"

            val afterAuthority = if (authorityEnd < 0) "" else rest.substring(authorityEnd)
            val path = afterAuthority.substringBefore('?').substringBefore('#')
            return Parsed(scheme, host, origin, path)
        }
    }
}
