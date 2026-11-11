import { postJson } from "@/lib/reading/api";
import { callNative, nativeCode } from "./bridge";

/**
 * Google sign-in inside the Starlog app (W2.4): Google's web sign-in must not run in a WebView, so the app's Credential
 * Manager signs in. /api/auth/google/native/start (the state cookie, a nonce, the client id) → the shell's `googleSignIn`
 * → /api/auth/google/native. Answers what the web flow's redirect would have said:
 * - `{ok: true, returnTo}` after a login, `{ok: true, deleted: true}` after the deletion re-check;
 * - `{ok: false, flag}`: the ?login= / ?delete= flag (failed, closed, mismatch, unavailable, busy…), or null when the person
 *   closed Google's sheet (stay where they are, say nothing).
 */
export type AppGoogleResult = { ok: true; returnTo?: string; deleted?: true } | { ok: false; flag: string | null };

export async function appGoogleSignIn(request: { returnTo: string; age: string } | { purpose: "delete"; intent: string }): Promise<AppGoogleResult> {
  const started = await postJson<{ state: string; nonce: string; clientId: string }>("/api/auth/google/native/start", request);
  if (!started.ok) return { ok: false, flag: started.error.reason ?? (started.error.code === "RATE_LIMIT" ? "busy" : "unavailable") };
  let idToken: string;
  try {
    ({ idToken } = await callNative<{ idToken: string }>("googleSignIn", { clientId: started.data.clientId, nonce: started.data.nonce }));
  } catch (error) {
    return { ok: false, flag: nativeCode(error) === "CANCELED" ? null : "failed" };
  }
  const done = await postJson<{ ok: true; returnTo?: string; deleted?: true }>("/api/auth/google/native", { state: started.data.state, idToken });
  if (!done.ok) return { ok: false, flag: done.error.reason ?? (done.error.code === "RATE_LIMIT" ? "busy" : "failed") };
  return done.data;
}
