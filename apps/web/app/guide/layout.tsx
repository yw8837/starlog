import Script from "next/script";
import type { ReactNode } from "react";
import { adsConfig, adsScriptSrc } from "@/lib/ads";

/**
 * The AdSense script loads under /guide only. Use manual ad units and keep Auto ads off in the
 * AdSense dashboard: the script stays loaded after client-side navigation to reading pages.
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  const ads = adsConfig();
  return (
    <>
      {children}
      {ads ? <Script async src={adsScriptSrc(ads.client)} crossOrigin="anonymous" strategy="afterInteractive" /> : null}
    </>
  );
}
