package kr.yeolmaeapps.starlog

import org.json.JSONException
import org.json.JSONObject

/** Outcome of one bridge request, turned into the reply JSON by [BridgeProtocol.reply]. */
sealed interface BridgeResult {
    data class Ok(val data: JSONObject = JSONObject()) : BridgeResult
    data class Fail(val code: String, val message: String? = null) : BridgeResult
}

/**
 * Message format of `window.StarlogNative` (plan 2026-11-11, "Contracts → Bridge").
 * Request `{"id","type","payload"}` → reply `{"id","ok":true,"data"}` or
 * `{"id","ok":false,"code","message"?}`. Pure: no Android types.
 */
object BridgeProtocol {
    const val NAME = "StarlogNative"

    const val CANCELED = "CANCELED"
    const val PENDING = "PENDING"
    const val UNAVAILABLE = "UNAVAILABLE"
    const val ERROR = "ERROR"

    /** `purchase` only: Play still holds an unconsumed purchase of this product; the web then asks `unfinishedPurchases`. */
    const val OWNED = "OWNED"

    val TYPES = setOf("hello", "purchase", "unfinishedPurchases", "googleSignIn", "ad", "privacyOptions")

    /** [id] is the caller's string or number, echoed back unchanged. */
    class Request(val id: Any, val type: String, val payload: JSONObject)

    class PurchaseArgs(val productId: String, val orderId: String, val accountTag: String)

    /** [clientId] is the page's (optional); [chooseGoogleClientId] decides which one is used. */
    class SignInArgs(val clientId: String?, val nonce: String)

    /** Null (ignore, no reply possible) for malformed JSON or a missing/invalid id. */
    fun parse(raw: String?): Request? {
        if (raw == null) return null
        val obj = try {
            JSONObject(raw)
        } catch (e: JSONException) {
            return null
        }
        val id = obj.opt("id")
        if (id !is String && id !is Number) return null
        return Request(
            id = id,
            type = obj.opt("type") as? String ?: "",
            payload = obj.opt("payload") as? JSONObject ?: JSONObject(),
        )
    }

    fun reply(id: Any, result: BridgeResult): String {
        val json = JSONObject().put("id", id)
        when (result) {
            is BridgeResult.Ok -> json.put("ok", true).put("data", result.data)
            is BridgeResult.Fail -> {
                json.put("ok", false).put("code", result.code)
                if (result.message != null) json.put("message", result.message)
            }
        }
        return json.toString()
    }

    /** Our Play product ids are the web ids with `-` → `_` (`tarot_deep`, `newyear_2027`); this is only a sanity
     *  check. Order id and account tag ride as obfuscated ids, which Play limits to 64 characters; the account tag
     *  is the sha256 hex of the user id (apps/web lib/pay/play.ts playAccountTag). */
    fun purchaseArgs(payload: JSONObject): PurchaseArgs? {
        val productId = string(payload, "playProductId")?.takeIf { PRODUCT_ID.matches(it) } ?: return null
        val orderId = string(payload, "orderId")?.takeIf { it.length <= 64 } ?: return null
        val accountTag = string(payload, "accountTag")?.takeIf { ACCOUNT_TAG.matches(it) } ?: return null
        return PurchaseArgs(productId, orderId, accountTag)
    }

    fun signInArgs(payload: JSONObject): SignInArgs? {
        val nonce = string(payload, "nonce") ?: return null
        return SignInArgs(string(payload, "clientId"), nonce)
    }

    fun adShow(payload: JSONObject): Boolean? = payload.opt("show") as? Boolean

    private val PRODUCT_ID = Regex("^[a-z0-9][a-z0-9_.]{0,63}$")
    private val ACCOUNT_TAG = Regex("^[0-9a-f]{64}$")

    /** A non-blank string value; `opt` + type check behaves the same on Android's and Maven's org.json. */
    private fun string(obj: JSONObject, key: String): String? = (obj.opt(key) as? String)?.takeIf { it.isNotBlank() }
}
