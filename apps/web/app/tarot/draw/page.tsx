import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { TAROT_FALLBACK } from "@/lib/fixtures";
import { DrawStage } from "./DrawStage";

export const metadata: Metadata = { title: "카드 뽑기" };

export default async function TarotDrawPage({ searchParams }: PageProps<"/tarot/draw">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <DrawStage
          instant={query.instant === "1"}
          daily={query.template === "daily"}
          fallback={TAROT_FALLBACK}
        />
      </main>
    </div>
  );
}
