import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Noto_Sans_KR } from "next/font/google";
import { CharacterDefs } from "@/components/characters/defs";
import { RouteTracker } from "@/components/layout/RouteTracker";
import { VersionCheck } from "@/components/layout/VersionCheck";
import { SiteJsonLd } from "@/components/seo/JsonLd";
import { adsConfig } from "@/lib/ads";
import { SITE } from "@/lib/config";
import { FEED_ALTERNATES, HOME_DESCRIPTION, HOME_TITLE, OG_IMAGE, OG_SITE_NAME, siteVerification } from "@/lib/seo";
import "./globals.css";

// Korean webfonts ship as ~100 unicode-range slices. preload:false lets the browser
// fetch only the slices a page actually uses, instead of preloading all of them.
const display = Gowun_Batang({
  weight: ["400", "700"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

const body = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
  preload: false,
});

const ADS = adsConfig();

const VERIFICATION = siteVerification();

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: HOME_TITLE, template: `%s · ${SITE.name}` },
  description: HOME_DESCRIPTION,
  applicationName: SITE.nameKo,
  publisher: SITE.business.name,
  // og:title and og:description follow each page's title and description (the defaults above on
  // pages without their own). Indexable pages set their own openGraph through lib/seo.ts pageMetadata.
  openGraph: { type: "website", siteName: OG_SITE_NAME, locale: "ko_KR", images: [{ ...OG_IMAGE }] },
  // Twitter/X follows Open Graph for title, description and image.
  twitter: { card: "summary_large_image" },
  // Guide articles as RSS for feed readers and 네이버 서치어드바이저 (app/rss.xml/route.ts).
  alternates: { types: FEED_ALTERNATES },
  // Google, Naver and Bing ownership codes from NEXT_PUBLIC_* at build time (lib/seo.ts).
  ...(VERIFICATION ? { verification: VERIFICATION } : {}),
  // AdSense site verification; the ad script itself loads on guide pages only.
  ...(ADS ? { other: { "google-adsense-account": ADS.client } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#0D0A26",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body>
        <SiteJsonLd />
        <CharacterDefs />
        {children}
        <RouteTracker />
        <VersionCheck />
      </body>
    </html>
  );
}
