import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { PremiumLanding } from "@/components/premium/PremiumLanding";
import { NightSky } from "@/components/sky/NightSky";
import { LANDING } from "@/lib/premium/landing";
import { premiumStateHere } from "@/lib/premium/pageGate";
import { premiumPath } from "@/lib/premium/products";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: LANDING["newyear-2027"].title, description: LANDING["newyear-2027"].description, path: premiumPath("newyear-2027") });

/** The product page (plan-reconciled §4.6), rendered per request: a 404 unless premium is visible here (§4.7). */
export default async function NewYearLandingPage() {
  const state = await premiumStateHere("newyear-2027");
  if (!state.visible) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PremiumLanding id="newyear-2027" open={state.open} now={Date.now()} />
      </main>
      <Footer />
    </div>
  );
}
