package kr.yeolmaeapps.starlog

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.net.URISyntaxException

/** A WebView shell for https://starlog.yeolmaeapps.kr with Play Billing, Google sign-in and a banner below. */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var offline: View
    private lateinit var router: UrlRouter
    private lateinit var billing: BillingManager
    private lateinit var ads: AdsController
    private var mainFrameError = false
    private var webViewGone = false

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        // The site is dark (#0D0A26): light system-bar icons over the window background (the site colour).
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val root = findViewById<View>(R.id.root)
        // Target 36 is always edge-to-edge: keep the page and the banner clear of bars, cutouts and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView = findViewById(R.id.web)
        offline = findViewById(R.id.offline)
        findViewById<View>(R.id.retry).setOnClickListener {
            offline.visibility = View.GONE
            webView.reload()
        }

        router = UrlRouter(BuildConfig.BASE_URL, allowHttp = BuildConfig.DEBUG)
        billing = BillingManager(this).also { it.start() }
        ads = AdsController(
            activity = this,
            root = root,
            container = findViewById(R.id.ad_container),
            slot = findViewById<FrameLayout>(R.id.ad_slot),
            bannerId = BuildConfig.ADMOB_BANNER_ID,
            pathAllowed = { !webViewGone && router.adAllowed(webView.url) },
        )
        ads.requestConsentUpdate()

        configureWebView()
        NativeBridge(router, billing, GoogleSignIn(this), ads).install(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.BASE_URL)
        }
    }

    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            textZoom = 100
            userAgentString = "$userAgentString StarlogApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }
        webView.webViewClient = ShellClient()
    }

    private inner class ShellClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (!request.isForMainFrame) {
                // Frames may load web pages; they never launch apps or other schemes.
                val scheme = url.substringBefore(':').lowercase()
                return scheme != "https" && scheme != "http"
            }
            when (router.route(url)) {
                Route.InApp -> return false
                Route.External -> openExternal(url)
                Route.Intent -> openIntent(url)
                Route.Block -> Unit
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            mainFrameError = false
            ads.onPageStarted()
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            ads.onUrlChanged()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) mainFrameError = true
        }

        override fun onPageFinished(view: WebView, url: String?) {
            // A plain native offline screen: nothing in it can reach the bridge.
            offline.visibility = if (mainFrameError) View.VISIBLE else View.GONE
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's renderer crashed or was killed for memory. WebView's default is to crash the app;
            // instead drop this WebView (it must not be used again) and start over with a fresh activity.
            webViewGone = true
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            recreate()
            return true
        }
    }

    /** Guides on yeolmaeapps.kr, Google help, receipts...: the user's browser, not a Custom Tab. */
    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            // No browser: nothing to do.
        }
    }

    /** `intent:` (KakaoTalk login/share) and `kakaotalk:` / `kakaolink:` / `market:` links. */
    private fun openIntent(url: String) {
        if (!url.startsWith("intent:", ignoreCase = true)) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
            } catch (e: ActivityNotFoundException) {
                // App not installed: ignore.
            }
            return
        }
        val intent = try {
            Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        } catch (e: URISyntaxException) {
            return
        }
        // Same hardening as browsers: only components that accept web links, no explicit target, no URI grants.
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.component = null
        intent.selector = null
        intent.flags = intent.flags and URI_GRANT_FLAGS.inv()
        try {
            startActivity(intent)
            return
        } catch (e: ActivityNotFoundException) {
            // Not installed: fall back below.
        }
        val fallback = intent.getStringExtra("browser_fallback_url") ?: return
        when (router.route(fallback)) {
            Route.InApp -> webView.loadUrl(fallback)
            Route.External -> openExternal(fallback)
            Route.Intent, Route.Block -> Unit
        }
    }

    override fun onResume() {
        super.onResume()
        if (!webViewGone) webView.onResume()
        ads.onResume()
    }

    override fun onPause() {
        ads.onPause()
        if (!webViewGone) webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!webViewGone) webView.saveState(outState)
    }

    override fun onDestroy() {
        ads.destroy()
        billing.end()
        if (!webViewGone) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        const val URI_GRANT_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION or
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
    }
}
