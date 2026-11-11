"use client";

import { useEffect, useLayoutEffect } from "react";
import { refreshAccount } from "@/lib/account/client";
import { callNative, isApp } from "@/lib/app/bridge";
import { setPrivacyOptionsRequired } from "@/lib/app/shell";
import { postJson } from "@/lib/reading/api";

type Unfinished = { purchases: Array<{ purchaseToken: string; productId: string }> };

/** The shell answers hello at once; a page never waits long on it. */
const HELLO_TIMEOUT_MS = 3_000;
/** How often, while the app is in front, the shell is asked again for purchases that went through meanwhile. */
const RECOVER_EVERY_MS = 60_000;
/** A purchase the server refused is left alone this long before it is sent again. */
const REFUSED_REST_MS = 10 * 60_000;

/**
 * Mounted once in the root layout; renders nothing, and does nothing outside the Starlog app.
 * - Keeps <html data-app>: the <head> script sets it before paint, and React's development remount clears it (Next's
 *   "preventing flash before hydration" guide); a no-op in production.
 * - On start: the shell's `hello`, keeping `privacyOptionsRequired` (lib/app/shell.ts) for 내 정보's 광고 개인정보 설정.
 * - On start, whenever the app comes back to the front, and every minute while it is in front: the purchases Google Play holds as bought and not yet consumed
 *   (a client that died mid-purchase, a pending one that went through) go to /api/pay/play/verify, which is safe to repeat.
 *   One that comes back paid refreshes the account, as /pay/success does. Failures stay silent: it runs again on the next resume.
 */
export function AppMode() {
  useLayoutEffect(() => {
    if (isApp()) document.documentElement.dataset.app = "android";
  }, []);

  useEffect(() => {
    if (!isApp()) return;
    // The shell's hello, once per page load: whether 내 정보 offers 광고 개인정보 설정. No answer: it stays off.
    void callNative<{ privacyOptionsRequired?: unknown } | undefined>("hello", undefined, HELLO_TIMEOUT_MS).then(
      (data) => setPrivacyOptionsRequired(data?.privacyOptionsRequired === true),
      () => {},
    );
    let running = false;
    /** Purchases the server refused (400): when each may be sent again. */
    const refusedUntil = new Map<string, number>();
    const recover = async () => {
      if (running) return;
      running = true;
      try {
        const { purchases } = await callNative<Unfinished>("unfinishedPurchases");
        let paid = false;
        for (const { purchaseToken, productId } of purchases ?? []) {
          if ((refusedUntil.get(purchaseToken) ?? 0) > Date.now()) continue;
          const res = await postJson<{ status: string }>("/api/pay/play/verify", { purchaseToken, productId });
          if (res.ok && res.data.status === "paid") paid = true;
          // Refused for good (the server refunds what it cannot match): not sent every minute while that refund is retried.
          else if (!res.ok && res.error.status === 400) refusedUntil.set(purchaseToken, Date.now() + REFUSED_REST_MS);
        }
        if (paid) void refreshAccount();
      } catch {
        // no shell answer: tried again on the next resume
      } finally {
        running = false;
      }
    };
    void recover();
    const onShown = () => {
      if (document.visibilityState === "visible") void recover();
    };
    document.addEventListener("visibilitychange", onShown);
    // A pending payment can go through while the app stays in front (no resume to ask on): ask again now and then.
    const timer = setInterval(onShown, RECOVER_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onShown);
      clearInterval(timer);
    };
  }, []);

  return null;
}
