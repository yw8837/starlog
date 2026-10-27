import type { ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { guideWebsiteJsonLd } from "@/lib/jsonld";

/**
 * Every /guide page, and so the root domain's "/" (the guide's home), names the site the root domain
 * is: the guides. The AdSense script is not here: it loads on the article pages only
 * (app/guide/[slug]/page.tsx), never on the hubs. `data-guide-fonts` marks the page for globals.css: body text in the
 * system's Korean font, so a guide page downloads no Noto Sans KR (AdSense audit 2026-10-27).
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <span hidden data-guide-fonts />
      {children}
      <JsonLd data={guideWebsiteJsonLd()} />
    </>
  );
}
