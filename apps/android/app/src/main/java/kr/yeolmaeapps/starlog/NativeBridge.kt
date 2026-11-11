package kr.yeolmaeapps.starlog

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * `window.StarlogNative` for pages on [origin] only (main frame only). If the WebView lacks
 * WEB_MESSAGE_LISTENER the bridge is simply absent (no addJavascriptInterface fallback).
 */
class NativeBridge(
    private val router: UrlRouter,
    private val billing: BillingManager,
    private val signIn: GoogleSignIn,
    private val ads: AdsController,
) : WebViewCompat.WebMessageListener {

    private val main = Handler(Looper.getMainLooper())

    /** Must run before the first load. Returns false when the WebView cannot host the bridge. */
    fun install(webView: WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        WebViewCompat.addWebMessageListener(webView, BridgeProtocol.NAME, setOf(router.origin), this)
        return true
    }

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy,
    ) {
        if (!isMainFrame || message.type != WebMessageCompat.TYPE_STRING) return
        // Already enforced by the allowed-origin rule; checked again for defence in depth.
        if (!router.isOurOrigin(sourceOrigin.toString())) return
        val request = BridgeProtocol.parse(message.data) ?: return
        val reply: (BridgeResult) -> Unit = { result ->
            val json = BridgeProtocol.reply(request.id, result)
            main.post { replyProxy.postMessage(json) }
        }

        when (request.type) {
            "hello" -> ads.privacyOptionsRequired { required ->
                reply(BridgeResult.Ok(JSONObject().put("version", BuildConfig.VERSION_NAME).put("privacyOptionsRequired", required)))
            }
            "purchase" -> BridgeProtocol.purchaseArgs(request.payload)
                ?.let { billing.purchase(it, reply) }
                ?: reply(BridgeResult.Fail(BridgeProtocol.ERROR, "bad_payload"))
            "unfinishedPurchases" -> billing.unfinishedPurchases(reply)
            "googleSignIn" -> BridgeProtocol.signInArgs(request.payload)
                ?.let { signIn.signIn(it, reply) }
                ?: reply(BridgeResult.Fail(BridgeProtocol.ERROR, "bad_payload"))
            "ad" -> BridgeProtocol.adShow(request.payload)
                ?.let {
                    ads.setSignal(it)
                    reply(BridgeResult.Ok())
                }
                ?: reply(BridgeResult.Fail(BridgeProtocol.ERROR, "bad_payload"))
            "privacyOptions" -> ads.showPrivacyOptions(reply)
            else -> reply(BridgeResult.Fail(BridgeProtocol.ERROR, "unknown_type"))
        }
    }
}
