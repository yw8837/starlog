package kr.yeolmaeapps.starlog

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import org.json.JSONObject

/**
 * The native AdMob banner under the WebView (never over it).
 * - At app launch ([requestConsentUpdate], once per process): only the UMP consent-information update ("request an
 *   update of the user's consent information at every app launch"); no form, no SDK init, no ad request.
 * - On the web's first `ad {show:true}`, once per process: after that update, the consent form if required →
 *   canRequestAds() → MobileAds.initialize (background thread) → one anchored adaptive banner.
 *
 * The banner container is VISIBLE only while all hold: the web's last signal is show:true, the
 * current URL is a free-result path ([pathAllowed]), consent allows ad requests (the AdView only
 * exists then), the ad has loaded, and the activity is resumed. Otherwise it is GONE and paused,
 * so there is never an empty gap or a banner over content.
 */
class AdsController(
    private val activity: Activity,
    private val root: View,
    private val container: View,
    private val slot: ViewGroup,
    private val bannerId: String,
    private val pathAllowed: () -> Boolean,
) {
    private val consent: ConsentInformation by lazy { UserMessagingPlatform.getConsentInformation(activity) }

    private var wantShow = false
    private var resumed = false
    private var loaded = false
    private var shown = false
    private var adView: AdView? = null
    private var adPaused = false
    private var bannerWidthPx = 0

    init {
        // The adaptive size depends on the width: rebuild the banner after rotation or resizing.
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            if (adView != null && contentWidthPx() != bannerWidthPx) {
                root.post {
                    if (adView != null && contentWidthPx() != bannerWidthPx) {
                        destroyBanner()
                        createBanner()
                    }
                }
            }
        }
    }

    /** Called from onCreate: this launch's consent-information update, nothing else. */
    fun requestConsentUpdate() {
        if (updateStarted) return
        updateStarted = true
        val opened = { main.post { gate.open() } }
        consent.requestConsentInfoUpdate(activity, ConsentRequestParameters.Builder().build(), { opened() }, { opened() })
    }

    /**
     * For the `hello` reply: whether UMP requires a privacy options entry point. Waits for this launch's update for up
     * to [HELLO_WAIT_MS] (the web gives hello 3 s), then answers false.
     */
    fun privacyOptionsRequired(answer: (Boolean) -> Unit) {
        gate.await(HELLO_WAIT_MS) { known -> answer(known && isPrivacyOptionsRequired()) }
    }

    private fun isPrivacyOptionsRequired() =
        consent.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

    fun setSignal(show: Boolean) {
        wantShow = show
        if (show) start()
        update()
    }

    /** Every new page starts without a banner; the page must signal again. */
    fun onPageStarted() {
        wantShow = false
        update()
    }

    /** Same-document navigations (history.pushState) change the path rule's input. */
    fun onUrlChanged() = update()

    fun onResume() {
        resumed = true
        update()
    }

    fun onPause() {
        resumed = false
        update()
    }

    fun destroy() = destroyBanner()

    /** Replies when Google's form is dismissed, or at once when no entry point is required (or not known yet). */
    fun showPrivacyOptions(done: (BridgeResult) -> Unit) {
        if (!gate.isOpen || !isPrivacyOptionsRequired()) {
            return done(BridgeResult.Fail(BridgeProtocol.UNAVAILABLE, "not_required"))
        }
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { formError ->
            if (!consent.canRequestAds()) destroyBanner()
            update()
            done(
                if (formError == null) BridgeResult.Ok(JSONObject())
                else BridgeResult.Fail(BridgeProtocol.UNAVAILABLE, formError.message),
            )
        }
    }

    private fun start() {
        if (formStarted) return afterConsent()
        formStarted = true
        requestConsentUpdate()
        gate.await(null) {
            if (activity.isDestroyed) {
                formStarted = false
                return@await
            }
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { afterConsent() }
        }
    }

    private fun afterConsent() {
        if (activity.isDestroyed || !consent.canRequestAds()) return
        if (sdkReady) return createBanner()
        if (sdkStarting) return
        sdkStarting = true
        val appContext = activity.applicationContext
        Thread {
            MobileAds.initialize(appContext) {}
            activity.runOnUiThread {
                sdkReady = true
                if (!activity.isDestroyed) createBanner()
            }
        }.start()
    }

    private fun createBanner() {
        if (adView != null) return
        bannerWidthPx = contentWidthPx()
        val widthDp = (bannerWidthPx / activity.resources.displayMetrics.density).toInt()
        val view = AdView(activity)
        view.adUnitId = bannerId
        // 25.x: every standard-height anchored adaptive size is deprecated ("Use getLarge...AnchoredAdaptiveBannerAdSize
        // instead", developers.google.com/android/reference/com/google/android/gms/ads/AdSize); large is 50-150dp.
        view.setAdSize(AdSize.getLargeAnchoredAdaptiveBannerAdSize(activity, widthDp))
        view.adListener = object : AdListener() {
            override fun onAdLoaded() {
                loaded = true
                update()
            }

            override fun onAdFailedToLoad(error: LoadAdError) {
                // Collapse; with refresh configured on the ad unit the SDK tries again by itself.
                loaded = false
                update()
            }
        }
        slot.removeAllViews()
        slot.addView(view)
        adView = view
        adPaused = false
        view.loadAd(AdRequest.Builder().build())
    }

    private fun destroyBanner() {
        val view = adView ?: return
        adView = null
        loaded = false
        update()
        slot.removeView(view)
        view.destroy()
    }

    private fun contentWidthPx(): Int =
        (root.width - root.paddingLeft - root.paddingRight).takeIf { it > 0 }
            ?: activity.resources.displayMetrics.widthPixels

    private fun update() {
        val view = adView
        val visible = wantShow && resumed && loaded && view != null && pathAllowed()
        if (visible != shown) {
            shown = visible
            container.visibility = if (visible) View.VISIBLE else View.GONE
        }
        // Pause a loaded banner while hidden (no refresh off-screen); an unloaded one keeps loading.
        if (view != null && loaded) {
            if (visible && adPaused) {
                view.resume()
                adPaused = false
            } else if (!visible && !adPaused) {
                view.pause()
                adPaused = true
            }
        }
    }

    private companion object {
        /** Just under the web's 3 s hello timeout (apps/web/components/app/AppMode.tsx HELLO_TIMEOUT_MS). */
        const val HELLO_WAIT_MS = 2_500L

        // Once per process (an activity recreated after a non-handled config change reuses them).
        val main = Handler(Looper.getMainLooper())
        val gate = ConsentGate { delayMs, action -> main.postDelayed(action, delayMs) }
        var updateStarted = false
        var formStarted = false
        var sdkStarting = false
        var sdkReady = false
    }
}
