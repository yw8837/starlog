import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";
import { NOINDEX } from "@/lib/seo";
import { MatchForm } from "./MatchForm";

export const metadata: Metadata = { title: PREMIUM.match.name, robots: NOINDEX };

/** 우리 사이 궁합's form (Task 20): a 404 unless premium is visible here or the user holds a purchase of it (plan-reconciled §4.7). */
export default async function MatchNewPage() {
  if (!(await premiumPageOpen("match"))) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col">
        <MatchForm />
      </main>
    </div>
  );
}
