package kr.yeolmaeapps.starlog

import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject

/** Bridge code for a failed Play Billing call. */
internal fun billingFailure(responseCode: Int): BridgeResult.Fail = when (responseCode) {
    BillingResponseCode.USER_CANCELED -> BridgeResult.Fail(BridgeProtocol.CANCELED)
    BillingResponseCode.ITEM_ALREADY_OWNED -> BridgeResult.Fail(BridgeProtocol.OWNED)
    BillingResponseCode.BILLING_UNAVAILABLE,
    BillingResponseCode.SERVICE_UNAVAILABLE,
    BillingResponseCode.SERVICE_DISCONNECTED,
    BillingResponseCode.FEATURE_NOT_SUPPORTED,
    BillingResponseCode.ITEM_UNAVAILABLE,
    -> BridgeResult.Fail(BridgeProtocol.UNAVAILABLE)
    else -> BridgeResult.Fail(BridgeProtocol.ERROR, "billing_$responseCode")
}

/**
 * Play Billing 9.x for one-time (consumable) products. The app only buys and reports: the SERVER
 * verifies, grants and consumes (`/api/pay/play/verify`), so nothing here acknowledges, consumes
 * or grants anything. One purchase flow at a time.
 */
class BillingManager(private val activity: Activity) : PurchasesUpdatedListener {

    private class Pending(val productId: String, val done: (BridgeResult) -> Unit)

    private val main = Handler(Looper.getMainLooper())
    private var pending: Pending? = null

    private val client: BillingClient = BillingClient.newBuilder(activity.applicationContext)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    fun start() {
        client.startConnection(object : BillingClientStateListener {
            // Failures surface on the next call (as UNAVAILABLE); reconnection is automatic.
            override fun onBillingSetupFinished(result: BillingResult) = Unit
            override fun onBillingServiceDisconnected() = Unit
        })
    }

    fun end() {
        pending = null
        client.endConnection()
    }

    fun purchase(args: BridgeProtocol.PurchaseArgs, done: (BridgeResult) -> Unit) {
        if (pending != null) return done(BridgeResult.Fail(BridgeProtocol.ERROR, "purchase_in_progress"))
        pending = Pending(args.productId, done)

        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(args.productId)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val query = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(query) { result, details ->
            main.post {
                if (result.responseCode != BillingResponseCode.OK) return@post finish(billingFailure(result.responseCode))
                val productDetails = details.productDetailsList.firstOrNull { it.productId == args.productId }
                    ?: return@post finish(BridgeResult.Fail(BridgeProtocol.UNAVAILABLE, "product_not_found"))

                val params = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(productDetails)
                // One purchase option per product: its offer token, when Play returns one.
                productDetails.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken?.let { params.setOfferToken(it) }

                val flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(params.build()))
                    .setObfuscatedAccountId(args.accountTag)
                    .setObfuscatedProfileId(args.orderId)
                    .build()
                val launch = client.launchBillingFlow(activity, flow)
                if (launch.responseCode != BillingResponseCode.OK) finish(billingFailure(launch.responseCode))
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        main.post {
            // No flow in progress (e.g. a PENDING purchase that went through later): there is no request to answer and
            // the bridge has no shell-initiated messages. Play keeps it as PURCHASED and unacknowledged, and the web's
            // AppMode asks `unfinishedPurchases` on every page load and whenever the page becomes visible again.
            val wanted = pending?.productId ?: return@post
            if (result.responseCode != BillingResponseCode.OK) return@post finish(billingFailure(result.responseCode))
            val purchase = purchases?.firstOrNull { wanted in it.products }
                ?: return@post finish(BridgeResult.Fail(BridgeProtocol.ERROR, "no_purchase"))
            finish(
                when (purchase.purchaseState) {
                    Purchase.PurchaseState.PURCHASED -> BridgeResult.Ok(
                        JSONObject().put("purchaseToken", purchase.purchaseToken).put("productId", wanted),
                    )
                    Purchase.PurchaseState.PENDING -> BridgeResult.Fail(BridgeProtocol.PENDING)
                    else -> BridgeResult.Fail(BridgeProtocol.ERROR, "no_purchase")
                },
            )
        }
    }

    /** Purchases in PURCHASED state that the server has not consumed yet (the web sends each to verify). */
    fun unfinishedPurchases(done: (BridgeResult) -> Unit) {
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            main.post {
                if (result.responseCode != BillingResponseCode.OK) return@post done(billingFailure(result.responseCode))
                val list = JSONArray()
                for (p in purchases) {
                    val productId = p.products.firstOrNull() ?: continue
                    if (p.purchaseState == Purchase.PurchaseState.PURCHASED) {
                        list.put(JSONObject().put("purchaseToken", p.purchaseToken).put("productId", productId))
                    }
                }
                done(BridgeResult.Ok(JSONObject().put("purchases", list)))
            }
        }
    }

    private fun finish(result: BridgeResult) {
        val p = pending ?: return
        pending = null
        p.done(result)
    }
}
