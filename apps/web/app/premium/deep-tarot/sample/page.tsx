import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { PremiumSample } from "@/components/premium/PremiumSample";
import { NightSky } from "@/components/sky/NightSky";
import { premiumStateHere } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";

/** Crawlable (not in robots.txt) so its noindex is read; never in the sitemap. */
export const metadata: Metadata = { title: `${PREMIUM["tarot-deep"].name} 샘플`, robots: { index: false, follow: true } };

/** The whole sample (plan-reconciled §4.6): a 404 unless premium is visible here, like its product page. */
export default async function DeepTarotSamplePage() {
  if (!(await premiumStateHere("tarot-deep")).visible) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <PremiumSample id="tarot-deep" />
      </main>
      <Footer />
    </div>
  );
}
