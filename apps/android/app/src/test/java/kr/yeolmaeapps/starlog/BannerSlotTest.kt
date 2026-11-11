package kr.yeolmaeapps.starlog

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BannerSlotTest {
    private val slot = BannerSlot()

    private fun open(resumed: Boolean = true, path: Boolean = true, ads: Boolean = true) = slot.isOpen(resumed, path, ads)

    @Test fun reservedAsSoonAsAResultSignalsBeforeAnyAdLoads() {
        assertFalse(open())
        assertTrue(slot.signal(true))
        assertTrue(open())
    }

    @Test fun onlyOnAllowedPathsWithConsentWhileResumed() {
        slot.signal(true)
        assertFalse(open(path = false))
        assertFalse(open(ads = false))
        assertFalse(open(resumed = false))
    }

    @Test fun failedLoadCollapsesAndALaterRefreshDoesNotReopenTheSameResult() {
        slot.signal(true)
        slot.loadFailed()
        assertFalse(open())
        // A repeated show:true for the same result (no off in between) is not a new result.
        assertFalse(slot.signal(true))
        assertFalse(open())
    }

    @Test fun nextResultReservesAgain() {
        slot.signal(true)
        slot.loadFailed()
        slot.signal(false)
        assertFalse(open())
        assertTrue(slot.signal(true))
        assertTrue(open())
    }

    @Test fun pageStartCollapsesUntilThePageSignalsAgain() {
        slot.signal(true)
        slot.pageStarted()
        assertFalse(open())
        assertTrue(slot.signal(true))
        assertTrue(open())
    }
}
