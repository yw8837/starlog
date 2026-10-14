import type { ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { guideWebsiteJsonLd } from "@/lib/jsonld";

/**
 * Every /guide page, and so the root domain's "/" (the guide's home), names the site the root domain
 * is: the guides. The AdSense script is not here: it loads on the article pages only
 * (app/guide/[slug]/page.tsx), never on the hubs.
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={guideWebsiteJsonLd()} />
    </>
  );
}
