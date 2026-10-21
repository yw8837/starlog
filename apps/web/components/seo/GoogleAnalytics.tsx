"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { GA_CONFIG, GA_MEASUREMENT_ID, type GaPage, gaDisableKey, gaPage, gaScriptSrc } from "@/lib/analytics";
import { readChoice, subscribeChoice } from "@/lib/analyticsConsent";
import { gaRevisionInForce } from "@/lib/legal";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 for both hosts, from the root layout, only for a visitor who allowed it (lib/analyticsConsent.ts) and only once
 * the privacy revision that discloses it is in force (lib/legal.ts GA_REVISION_DATE), by this browser's clock. Nothing
 * on the server (the pages are cached for a year). A choice made later applies without a reload: 허용 loads gtag.js
 * and counts the page on screen, 거부 sets the ga-disable flag so the gtag already loaded sends nothing more.
 *
 * Page views are sent here, one per pathname (not for a hash or a title change), with the redacted fields of
 * lib/analytics.ts gaPage; they are also `set` first so any other event gtag sends carries them, not the raw address.
 * The config sends no page view of its own, and the stream's enhanced measurement is off. `id` is for tests: "" renders nothing.
 */
export function GoogleAnalytics({ id = GA_MEASUREMENT_ID }: { id?: string }) {
  const on = useSyncExternalStore(subscribeChoice, () => id !== "" && gaRevisionInForce() && readChoice() === "granted", () => false);
  const pathname = usePathname();
  /** The page on screen, followed while GA is off too, so the first page_view after 허용 has the right referrer. */
  const page = useRef<{ pathname: string; ga: GaPage } | null>(null);
  /** The pathname of the last page_view sent; null while GA is off. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (page.current?.pathname !== pathname) {
      page.current = { pathname, ga: gaPage(window.location.href, document.title, document.referrer, page.current?.ga ?? null) };
    }
    const flags = window as unknown as Record<string, unknown>;
    if (!on) {
      // 거부 here already set it (lib/analyticsConsent.ts); this covers one made in another tab.
      if (window.gtag) flags[gaDisableKey(id)] = true;
      sent.current = null;
      return;
    }
    if (sent.current === pathname) return;
    sent.current = pathname;
    flags[gaDisableKey(id)] = false;
    const fresh = !window.gtag;
    if (fresh) {
      const dataLayer = (window.dataLayer = window.dataLayer ?? []);
      // gtag.js reads Arguments objects from the data layer, not arrays.
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
    }
    const gtag = window.gtag!;
    const { fields } = page.current.ga;
    gtag("set", fields);
    if (fresh) gtag("config", id, GA_CONFIG);
    gtag("event", "page_view", fields);
  }, [on, pathname, id]);

  return on ? <Script src={gaScriptSrc(id)} strategy="afterInteractive" /> : null;
}
