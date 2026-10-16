import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { premiumPageOpen } from "@/lib/premium/pageGate";
import { NOINDEX } from "@/lib/seo";
import { MatchDraw } from "./MatchDraw";

export const metadata: Metadata = { title: "카드 뽑기", robots: NOINDEX };

/** 우리 사이 궁합's five cards (Task 20): a 404 unless premium is visible here or the user holds a purchase of it. */
export default async function MatchDrawPage({ searchParams }: PageProps<"/premium/match/draw">) {
  if (!(await premiumPageOpen("match"))) notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <MatchDraw instant={query.instant === "1"} />
      </main>
    </div>
  );
}
