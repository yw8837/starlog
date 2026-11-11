import { isStarlogApp } from "@/lib/inApp";

/**
 * The web side of the Starlog Android app's bridge (plan 2026-11-11 "Contracts"). The shell injects `window.StarlogNative`
 * (AndroidX addWebMessageListener, our origin and the main frame only): `postMessage(json)` out, `onmessage` in.
 * - A request is `{id, type, payload}`; the shell answers `{id, ok: true, data}` or `{id, ok: false, code, message?}`.
 * One `onmessage` dispatcher serves every call, keyed by `id`. Client-safe; on the server nothing here is in the app.
 */

/**
 * A refused or failed call: `code` as the shell sent it ("CANCELED", "PENDING", "UNAVAILABLE", "ERROR"), and UNAVAILABLE
 * also when there is no shell or it never answered.
 */
export class NativeError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? `native ${code}`);
    this.name = "NativeError";
  }
}

interface StarlogNative {
  postMessage(message: string): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

declare global {
  interface Window {
    StarlogNative?: StarlogNative;
  }
}

/** How long a quick call (hello, ad, unfinishedPurchases…) may wait for its answer. */
export const NATIVE_TIMEOUT_MS = 15_000;
/** The person is in Google's own sheet or form (billing, sign-in, the ad consent choices): no short timeout. */
const NO_TIMEOUT = new Set(["purchase", "googleSignIn", "privacyOptions"]);

type Pending = { resolve: (data: unknown) => void; reject: (error: NativeError) => void; timer: ReturnType<typeof setTimeout> | null };

const pending = new Map<string, Pending>();
let installedOn: StarlogNative | null = null;
let seq = 0;

/** The Starlog app's WebView (its user agent ends with ` StarlogApp/<version>`); false on the server. */
export function isApp(): boolean {
  return typeof navigator !== "undefined" && isStarlogApp(navigator.userAgent);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function dispatch(event: { data: unknown }): void {
  let message: unknown = event.data;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return;
    }
  }
  if (!isRecord(message)) return;
  if (typeof message.id === "string") {
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (call.timer) clearTimeout(call.timer);
    if (message.ok === true) call.resolve(message.data);
    else call.reject(new NativeError(typeof message.code === "string" ? message.code : "ERROR", typeof message.message === "string" ? message.message : undefined));
  }
}

/** The shell's object with our dispatcher on it, or null outside the app. */
function native(): StarlogNative | null {
  const found = typeof window === "undefined" ? undefined : window.StarlogNative;
  if (!found) return null;
  if (installedOn !== found) {
    found.onmessage = dispatch;
    installedOn = found;
  }
  return found;
}

/**
 * Asks the shell for `type` and resolves with its `data`. Rejects with a NativeError: the shell's code (CANCELED, PENDING,
 * ERROR), or UNAVAILABLE without a shell, when the message cannot be sent, or after `timeoutMs` (0: wait as long as it takes;
 * purchase, googleSignIn and privacyOptions wait by default).
 */
export function callNative<T = unknown>(type: string, payload?: unknown, timeoutMs: number = NO_TIMEOUT.has(type) ? 0 : NATIVE_TIMEOUT_MS): Promise<T> {
  const shell = native();
  if (!shell) return Promise.reject(new NativeError("UNAVAILABLE"));
  const id = `${Date.now().toString(36)}-${++seq}`;
  return new Promise<T>((resolve, reject) => {
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            pending.delete(id);
            reject(new NativeError("UNAVAILABLE", "native timeout"));
          }, timeoutMs)
        : null;
    pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer });
    try {
      shell.postMessage(JSON.stringify(payload === undefined ? { id, type } : { id, type, payload }));
    } catch {
      pending.delete(id);
      if (timer) clearTimeout(timer);
      reject(new NativeError("UNAVAILABLE"));
    }
  });
}

/** The code of a bridge failure (NativeError's), else ERROR. */
export const nativeCode = (error: unknown): string => (error instanceof NativeError ? error.code : "ERROR");

/** Tests only. */
export function resetBridgeForTests(): void {
  pending.forEach((call) => call.timer && clearTimeout(call.timer));
  pending.clear();
  installedOn = null;
  seq = 0;
}
