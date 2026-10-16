import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";
import { NOINDEX } from "@/lib/seo";
import { MatchPreview } from "./MatchPreview";

export const metadata: Metadata = { title: PREMIUM.match.name, robots: NOINDEX };

/** 우리 사이 궁합's preview and opening (Task 20): a 404 unless premium is visible here or bought; `?unlock=paid` is checkout's return. */
export default async function MatchPreviewPage({ searchParams }: PageProps<"/premium/match/preview">) {
  if (!(await premiumPageOpen("match"))) notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col">
        <MatchPreview instant={query.instant === "1"} autoUnlock={query.unlock === "paid"} />
      </main>
      <Footer />
    </div>
  );
}
