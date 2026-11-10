"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readMetaGranted, subscribeChoice } from "@/lib/analyticsConsent";
import { META_PIXEL_ID, META_SCRIPT_SRC, metaPageAllowed, metaPixelOn } from "@/lib/metaPixel";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; push: Fbq; loaded: boolean; version: string; disablePushState?: boolean };
type FbWindow = { fbq?: Fbq; _fbq?: Fbq };

/** The pixel may run here and now: an id, its privacy revision in force, and an 허용 that named Meta. */
const pixelAllowed = (id: string) => metaPixelOn(id) && readMetaGranted();

/** Meta's queueing stub (what its snippet sets up), without the script tag: next/script loads that. */
function installStub(id: string): Fbq {
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  // No page views from history changes (each is sent below, only for addresses with nothing personal) and no automatic events.
  fbq.disablePushState = true;
  const w = window as unknown as FbWindow;
  w.fbq = fbq;
  w._fbq ??= fbq;
  fbq("set", "autoConfig", false, id);
  fbq("init", id);
  return fbq;
}

/**
 * The Meta pixel, from the root layout beside GA (sales 2026-11-10 item 7): nothing on the server, nothing without a
 * pixel id (NEXT_PUBLIC_META_PIXEL_ID), nothing before the revision naming Meta (lib/legal.ts META_REVISION_DATE) or
 * without an 허용 that named it. One PageView per pathname, only where the address holds nothing personal
 * (lib/metaPixel.ts metaPageAllowed); 거부 revokes it on the page (lib/analyticsConsent.ts). `id` is for tests.
 */
export function MetaPixel({ id = META_PIXEL_ID }: { id?: string }) {
  const on = useSyncExternalStore(subscribeChoice, () => pixelAllowed(id), () => false);
  const pathname = usePathname();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const w = window as unknown as FbWindow;
    if (!on) {
      w.fbq?.("consent", "revoke");
      sent.current = null;
      return;
    }
    const fbq = w.fbq ?? installStub(id);
    if (sent.current === null) fbq("consent", "grant");
    if (sent.current === pathname) return;
    sent.current = pathname;
    if (metaPageAllowed(window.location.href)) fbq("track", "PageView");
  }, [on, pathname, id]);

  return on ? <Script src={META_SCRIPT_SRC} strategy="afterInteractive" /> : null;
}

const SENT_KEY = "starlog.meta.purchase";

/**
 * Purchase, with its value in KRW, once per order (a reload of /pay/success confirms again), only where the pixel runs.
 * Called by /pay/success after the server confirmed the payment; the address no longer holds the payment's keys then.
 */
export function trackMetaPurchase(orderId: string, valueKrw: number, id: string = META_PIXEL_ID): void {
  const fbq = (window as unknown as FbWindow).fbq;
  if (!fbq || !pixelAllowed(id)) return;
  try {
    if (window.sessionStorage.getItem(SENT_KEY) === orderId) return;
    window.sessionStorage.setItem(SENT_KEY, orderId);
  } catch {
    // Storage refused: sent once on this page all the same.
  }
  fbq("track", "Purchase", { value: valueKrw, currency: "KRW" });
}
