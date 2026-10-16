import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { PREMIUM } from "@/lib/premium/products";
import { NOINDEX } from "@/lib/seo";
import { NewYearForm } from "./NewYearForm";

export const metadata: Metadata = { title: PREMIUM["newyear-2027"].name, robots: NOINDEX };

/** 2027 신년운세's form (Task 21): a 404 unless premium is visible here or the user holds a purchase of it (plan-reconciled §4.7). */
export default async function NewYearNewPage() {
  if (!(await premiumPageOpen("newyear-2027"))) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col">
        <NewYearForm />
      </main>
    </div>
  );
}
