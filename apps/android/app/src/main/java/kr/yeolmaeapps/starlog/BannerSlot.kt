package kr.yeolmaeapps.starlog

/**
 * Whether the banner slot under the WebView is open (pure). The slot is reserved at the ad's height as soon as the
 * page signals a free result (on an allowed path, with consent allowing ads, while resumed), before the ad loads, so
 * the page never shrinks under the user's finger when the ad arrives (AdMob: "allocate a fixed space for the banner
 * ad"). It collapses on show:false, on every page start, and when the ad fails to load; after a failure it stays
 * collapsed for that result even if a later refresh succeeds, and reopens only for the next result.
 */
class BannerSlot {
    private var wantShow = false
    private var failed = false

    /** The page's `ad {show}`. Returns true when a new result starts (off → on). */
    fun signal(show: Boolean): Boolean {
        val newResult = show && !wantShow
        if (newResult) failed = false
        wantShow = show
        return newResult
    }

    fun pageStarted() {
        wantShow = false
    }

    /** The ad failed to load and nothing is on screen. */
    fun loadFailed() {
        failed = true
    }

    fun isOpen(resumed: Boolean, pathAllowed: Boolean, adsAllowed: Boolean): Boolean =
        wantShow && !failed && resumed && pathAllowed && adsAllowed
}
