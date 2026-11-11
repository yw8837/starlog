package kr.yeolmaeapps.starlog

import android.app.Activity
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import org.json.JSONObject

/**
 * Native "Sign in with Google" (Credential Manager). Returns the ID token to the web, which sends it
 * to the server for verification (signature, aud, iss, exp, nonce). The token is never logged.
 */
class GoogleSignIn(private val activity: Activity) {

    private val credentialManager = CredentialManager.create(activity)
    private var busy = false

    fun signIn(args: BridgeProtocol.SignInArgs, done: (BridgeResult) -> Unit) {
        if (busy) return done(BridgeResult.Fail(BridgeProtocol.ERROR, "sign_in_in_progress"))
        busy = true

        val option = GetGoogleIdOption.Builder()
            .setServerClientId(args.clientId)
            .setNonce(args.nonce)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

        credentialManager.getCredentialAsync(
            activity,
            request,
            CancellationSignal(),
            ContextCompat.getMainExecutor(activity),
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    busy = false
                    done(idTokenFrom(result))
                }

                override fun onError(e: GetCredentialException) {
                    busy = false
                    done(
                        when (e) {
                            is GetCredentialCancellationException -> BridgeResult.Fail(BridgeProtocol.CANCELED)
                            is NoCredentialException,
                            is GetCredentialProviderConfigurationException,
                            is GetCredentialUnsupportedException,
                            -> BridgeResult.Fail(BridgeProtocol.UNAVAILABLE, e.javaClass.simpleName)
                            else -> BridgeResult.Fail(BridgeProtocol.ERROR, e.javaClass.simpleName)
                        },
                    )
                }
            },
        )
    }

    private fun idTokenFrom(response: GetCredentialResponse): BridgeResult {
        val credential = response.credential
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            return BridgeResult.Fail(BridgeProtocol.ERROR, "unexpected_credential")
        }
        return try {
            val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            BridgeResult.Ok(JSONObject().put("idToken", idToken))
        } catch (e: GoogleIdTokenParsingException) {
            BridgeResult.Fail(BridgeProtocol.ERROR, "id_token_parse")
        }
    }
}
