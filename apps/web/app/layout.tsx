import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Noto_Sans_KR } from "next/font/google";
import { CharacterDefs } from "@/components/characters/defs";
import { SITE } from "@/lib/config";
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

const SITE_TITLE = `${SITE.name} · ${SITE.nameKo}`;
const SITE_DESCRIPTION = "타로와 사주로 오늘의 마음을 차분히 돌아보는 밤하늘 기록";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE_TITLE, template: `%s · ${SITE.name}` },
  description: SITE_DESCRIPTION,
  // og:title and og:description follow each page's title and description (the defaults above on
  // pages without their own); og:image comes from app/opengraph-image.tsx.
  openGraph: { type: "website", siteName: SITE_TITLE, locale: "ko_KR" },
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
        <CharacterDefs />
        {children}
      </body>
    </html>
  );
}
