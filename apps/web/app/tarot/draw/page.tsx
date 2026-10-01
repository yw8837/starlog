import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { NOINDEX } from "@/lib/seo";
import { DrawStage } from "./DrawStage";

export const metadata: Metadata = { title: "카드 뽑기", robots: NOINDEX };

export default async function TarotDrawPage({ searchParams }: PageProps<"/tarot/draw">) {
  const query = await searchParams;
  // 오늘의 한 장 moved to its own screen (the fortune cookie); old links still land there.
  if (query.template === "daily") redirect("/today");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <DrawStage instant={query.instant === "1"} />
      </main>
    </div>
  );
}
