"use client";

import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { GA_MEASUREMENT_ID, gaConfig, gaScriptSrc } from "@/lib/analytics";
import { privacyRevisionInForce } from "@/lib/legal";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const subscribe = () => () => {};

/**
 * GA4 for both hosts, from the root layout. Nothing on the server (the pages are cached for a year) and nothing before
 * the privacy revision that discloses it is in force, by this browser's clock: no script, no gtag call. Then gtag.js
 * after hydration and one config; the SPA's page views come from enhanced measurement's history changes, so none is
 * sent by hand. `id` is for tests: "" renders nothing.
 */
export function GoogleAnalytics({ id = GA_MEASUREMENT_ID }: { id?: string }) {
  const on = useSyncExternalStore(subscribe, () => id !== "" && privacyRevisionInForce(), () => false);

  useEffect(() => {
    if (!on || window.gtag) return;
    const dataLayer = (window.dataLayer = window.dataLayer ?? []);
    // gtag.js reads Arguments objects from the data layer, not arrays.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, gaConfig(window.location.href));
  }, [on, id]);

  return on ? <Script src={gaScriptSrc(id)} strategy="afterInteractive" /> : null;
}
