import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";
import { NOINDEX } from "@/lib/seo";
import { DeepResult } from "./DeepResult";

export const metadata: Metadata = { title: `${PREMIUM["tarot-deep"].entry} · ${PREMIUM["tarot-deep"].name}`, robots: NOINDEX };

/**
 * 켈틱 크로스 10장's preview and opening (Task 19). Rendered per request: a 404 unless premium is visible here
 * or the logged-in user holds a purchase of it (plan-reconciled §4.7). `?unlock=paid` is checkout's return.
 */
export default async function DeepResultPage({ searchParams }: PageProps<"/premium/deep-tarot/result">) {
  if (!(await premiumPageOpen("tarot-deep"))) notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <DeepResult instant={query.instant === "1"} autoUnlock={query.unlock === "paid"} />
      </main>
      <Footer />
    </div>
  );
}
