package kr.yeolmaeapps.starlog

import org.junit.Assert.assertEquals
import org.junit.Test

class GoogleClientIdTest {
    private val ours = "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com"
    private val other = "999999999999-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.apps.googleusercontent.com"

    private fun choice(configured: String, fromPage: String?) =
        chooseGoogleClientId(configured, fromPage).fold({ "use:$it" }, { "fail:${it.message}" })

    @Test fun configuredIdWinsAndThePageCannotOverrideIt() {
        assertEquals("use:$ours", choice(ours, ours))
        assertEquals("use:$ours", choice(ours, null))
        assertEquals("fail:client_mismatch", choice(ours, other))
    }

    @Test fun withoutAConfiguredIdThePageValueMustLookLikeAWebClientId() {
        assertEquals("use:$ours", choice("", ours))
        for (bad in listOf(
            null,
            "",
            "evil.example",
            "123-abc.apps.googleusercontent.com.evil.example",
            "123-ABC.apps.googleusercontent.com",
            "abc-123.apps.googleusercontent.com",
            "123-abc.apps.googleusercontent.com/x",
            " $ours",
        )) assertEquals(bad.toString(), "fail:bad_client_id", choice("", bad))
    }
}
