import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";
import { NOINDEX } from "@/lib/seo";
import { NewYearPreview } from "./NewYearPreview";

export const metadata: Metadata = { title: PREMIUM["newyear-2027"].name, robots: NOINDEX };

/** 2027 신년운세's preview and opening (Task 21): a 404 unless premium is visible here or bought; `?unlock=paid` is checkout's return. */
export default async function NewYearPreviewPage({ searchParams }: PageProps<"/premium/newyear-2027/preview">) {
  if (!(await premiumPageOpen("newyear-2027"))) notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col">
        <NewYearPreview autoUnlock={query.unlock === "paid"} />
      </main>
      <Footer />
    </div>
  );
}
