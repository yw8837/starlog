package kr.yeolmaeapps.starlog

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeProtocolTest {

    @Test fun parsesARequest() {
        val req = BridgeProtocol.parse("""{"id":"a1","type":"purchase","payload":{"playProductId":"tarot"}}""")!!
        assertEquals("a1", req.id)
        assertEquals("purchase", req.type)
        assertEquals("tarot", req.payload.getString("playProductId"))
    }

    @Test fun missingPayloadIsEmpty() {
        val req = BridgeProtocol.parse("""{"id":"h","type":"hello"}""")!!
        assertEquals(0, req.payload.length())
    }

    @Test fun malformedMessagesAreIgnored() {
        for (raw in listOf(
            null, "", "{", "not json", "[]", "[1,2]", "null", "42", "\"hello\"",
            """{"type":"hello"}""",
            """{"id":null,"type":"hello"}""",
            """{"id":{},"type":"hello"}""",
            """{"id":true,"type":"hello"}""",
        )) assertNull(raw.toString(), BridgeProtocol.parse(raw))
    }

    @Test fun unknownOrMissingTypeStillParsesSoItGetsAnErrorReply() {
        assertEquals("nope", BridgeProtocol.parse("""{"id":"x","type":"nope"}""")!!.type)
        assertEquals("", BridgeProtocol.parse("""{"id":"x"}""")!!.type)
        assertEquals("", BridgeProtocol.parse("""{"id":"x","type":5}""")!!.type)
        assertFalse("nope" in BridgeProtocol.TYPES)
        assertFalse("" in BridgeProtocol.TYPES)

        val reply = JSONObject(BridgeProtocol.reply("x", BridgeResult.Fail(BridgeProtocol.ERROR, "unknown type")))
        assertEquals("x", reply.get("id"))
        assertEquals(false, reply.get("ok"))
        assertEquals("ERROR", reply.get("code"))
        assertEquals("unknown type", reply.get("message"))
    }

    @Test fun knownTypesMatchTheContract() {
        assertEquals(
            setOf("hello", "purchase", "unfinishedPurchases", "googleSignIn", "ad", "privacyOptions"),
            BridgeProtocol.TYPES,
        )
    }

    @Test fun okReplyEchoesTheIdAndCarriesData() {
        val reply = JSONObject(BridgeProtocol.reply("p1", BridgeResult.Ok(JSONObject().put("purchaseToken", "tok").put("productId", "tarot"))))
        assertEquals("p1", reply.get("id"))
        assertEquals(true, reply.get("ok"))
        assertEquals("tok", reply.getJSONObject("data").get("purchaseToken"))
        assertEquals("tarot", reply.getJSONObject("data").get("productId"))
        assertFalse(reply.has("code"))
    }

    @Test fun numericIdIsEchoedAsANumber() {
        val req = BridgeProtocol.parse("""{"id":7,"type":"hello"}""")!!
        val reply = JSONObject(BridgeProtocol.reply(req.id, BridgeResult.Ok()))
        assertEquals(7, (reply.get("id") as Number).toInt())
        assertEquals(0, reply.getJSONObject("data").length())
    }

    @Test fun failReplyWithoutMessageHasNoMessageKey() {
        val reply = JSONObject(BridgeProtocol.reply("c", BridgeResult.Fail(BridgeProtocol.CANCELED)))
        assertEquals("CANCELED", reply.get("code"))
        assertFalse(reply.has("message"))
        assertFalse(reply.has("data"))
    }

    @Test fun purchaseArgs() {
        val ok = BridgeProtocol.purchaseArgs(
            JSONObject("""{"playProductId":"tarot_deep","orderId":"ord_123","accountTag":"${"a".repeat(64)}"}"""),
        )
        assertNotNull(ok)
        assertEquals("tarot_deep", ok!!.productId)
        assertEquals("ord_123", ok.orderId)
        assertEquals(64, ok.accountTag.length)

        for (bad in listOf(
            """{}""",
            """{"playProductId":"tarot","orderId":"o"}""",
            """{"playProductId":"tarot","accountTag":"t"}""",
            """{"orderId":"o","accountTag":"t"}""",
            """{"playProductId":"tarot-deep","orderId":"o","accountTag":"t"}""",
            """{"playProductId":"Tarot","orderId":"o","accountTag":"t"}""",
            """{"playProductId":"","orderId":"o","accountTag":"t"}""",
            """{"playProductId":"tarot","orderId":"","accountTag":"t"}""",
            """{"playProductId":"tarot","orderId":"o","accountTag":"${"a".repeat(65)}"}""",
            """{"playProductId":"tarot","orderId":"${"o".repeat(65)}","accountTag":"t"}""",
            """{"playProductId":1,"orderId":"o","accountTag":"t"}""",
        )) assertNull(bad, BridgeProtocol.purchaseArgs(JSONObject(bad)))
    }

    @Test fun signInArgs() {
        val ok = BridgeProtocol.signInArgs(JSONObject("""{"clientId":"123.apps.googleusercontent.com","nonce":"n0"}"""))
        assertEquals("123.apps.googleusercontent.com", ok!!.clientId)
        assertEquals("n0", ok.nonce)
        for (bad in listOf("""{}""", """{"clientId":"c"}""", """{"nonce":"n"}""", """{"clientId":" ","nonce":"n"}""", """{"clientId":"c","nonce":null}""")) {
            assertNull(bad, BridgeProtocol.signInArgs(JSONObject(bad)))
        }
    }

    @Test fun adShow() {
        assertEquals(true, BridgeProtocol.adShow(JSONObject("""{"show":true}""")))
        assertEquals(false, BridgeProtocol.adShow(JSONObject("""{"show":false}""")))
        assertNull(BridgeProtocol.adShow(JSONObject("""{"show":"true"}""")))
        assertNull(BridgeProtocol.adShow(JSONObject("""{}""")))
    }

    /** Exactly what apps/web/lib/app/bridge.ts callNative sends: `{id, type}` without payload, or `{id, type, payload}`. */
    @Test fun webRequestsParse() {
        for (type in listOf("hello", "unfinishedPurchases", "privacyOptions")) {
            val req = BridgeProtocol.parse("""{"id":"mhv3k2x1-1","type":"$type"}""")!!
            assertEquals("mhv3k2x1-1", req.id)
            assertEquals(type, req.type)
            assertEquals(0, req.payload.length())
        }
        val ad = BridgeProtocol.parse("""{"id":"mhv3k2x1-2","type":"ad","payload":{"show":true}}""")!!
        assertEquals(true, BridgeProtocol.adShow(ad.payload))
        // The web only matches string ids: the reply echoes it unchanged.
        assertEquals("mhv3k2x1-2", JSONObject(BridgeProtocol.reply(ad.id, BridgeResult.Ok())).get("id"))
    }

    /** Real values: Play product ids, orderId = randomId(18) (24 base64url chars), accountTag = sha256 hex. */
    @Test fun realPurchaseValuesPass() {
        val orderId = "Zb3_x-9QqLm2Nn8Pp0Rr7Ss1"
        val accountTag = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        assertEquals(24, orderId.length)
        for (product in listOf("tarot", "saju", "tarot_deep", "match", "newyear_2027", "set_2027")) {
            val raw = """{"id":"k1-3","type":"purchase","payload":{"playProductId":"$product","orderId":"$orderId","accountTag":"$accountTag"}}"""
            val args = BridgeProtocol.purchaseArgs(BridgeProtocol.parse(raw)!!.payload)
            assertNotNull(product, args)
            assertEquals(product, args!!.productId)
            assertEquals(orderId, args.orderId)
            assertEquals(accountTag, args.accountTag)
        }
    }

    /** Real values: nonce = randomId(16) (22 base64url chars), the web OAuth client id. */
    @Test fun realSignInValuesPass() {
        val raw = """{"id":"k1-4","type":"googleSignIn","payload":{"clientId":"123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com","nonce":"q8Zx_3-LmN0pQrStUvWxYz"}}"""
        val args = BridgeProtocol.signInArgs(BridgeProtocol.parse(raw)!!.payload)!!
        assertTrue(args.clientId.endsWith(".apps.googleusercontent.com"))
        assertEquals(22, args.nonce.length)
    }

    @Test fun okResultDefaultsToEmptyData() {
        assertTrue(BridgeResult.Ok().data.length() == 0)
    }
}
