import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { PremiumLanding } from "@/components/premium/PremiumLanding";
import { NightSky } from "@/components/sky/NightSky";
import { LANDING } from "@/lib/premium/landing";
import { premiumStateHere } from "@/lib/premium/pageGate";
import { premiumPath } from "@/lib/premium/products";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: LANDING["tarot-deep"].title, description: LANDING["tarot-deep"].description, path: premiumPath("tarot-deep") });

/** The product page (plan-reconciled §4.6), rendered per request: a 404 unless premium is visible here (§4.7). */
export default async function DeepTarotLandingPage() {
  const state = await premiumStateHere("tarot-deep");
  if (!state.visible) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PremiumLanding id="tarot-deep" open={state.open} now={Date.now()} />
      </main>
      <Footer />
    </div>
  );
}
