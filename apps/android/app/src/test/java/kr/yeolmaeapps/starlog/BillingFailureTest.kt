package kr.yeolmaeapps.starlog

import com.android.billingclient.api.BillingClient.BillingResponseCode
import org.junit.Assert.assertEquals
import org.junit.Test

class BillingFailureTest {

    @Test fun userCancelIsCanceled() {
        assertEquals(BridgeResult.Fail(BridgeProtocol.CANCELED), billingFailure(BillingResponseCode.USER_CANCELED))
    }

    @Test fun storeOrProductMissingIsUnavailable() {
        for (code in listOf(
            BillingResponseCode.BILLING_UNAVAILABLE,
            BillingResponseCode.SERVICE_UNAVAILABLE,
            BillingResponseCode.SERVICE_DISCONNECTED,
            BillingResponseCode.FEATURE_NOT_SUPPORTED,
            BillingResponseCode.ITEM_UNAVAILABLE,
        )) assertEquals(code.toString(), BridgeProtocol.UNAVAILABLE, billingFailure(code).code)
    }

    /** The web then asks unfinishedPurchases and sends them to the server (review M6). */
    @Test fun alreadyOwnedIsOwned() {
        assertEquals(BridgeResult.Fail(BridgeProtocol.OWNED), billingFailure(BillingResponseCode.ITEM_ALREADY_OWNED))
        assertEquals("OWNED", BridgeProtocol.OWNED)
    }

    @Test fun everythingElseIsAnErrorWithTheCode() {
        assertEquals(BridgeResult.Fail(BridgeProtocol.ERROR, "billing_12"), billingFailure(BillingResponseCode.NETWORK_ERROR))
        assertEquals(BridgeResult.Fail(BridgeProtocol.ERROR, "billing_6"), billingFailure(BillingResponseCode.ERROR))
        assertEquals(BridgeResult.Fail(BridgeProtocol.ERROR, "billing_5"), billingFailure(BillingResponseCode.DEVELOPER_ERROR))
    }
}
