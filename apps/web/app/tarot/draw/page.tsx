import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { DrawStage } from "./DrawStage";

export const metadata: Metadata = { title: "카드 뽑기" };

export default async function TarotDrawPage({ searchParams }: PageProps<"/tarot/draw">) {
  const query = await searchParams;
  const { question, template, input } = TAROT_SAMPLE;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <DrawStage
          instant={query.instant === "1"}
          daily={query.template === "daily"}
          fallback={{ question, template, input: { conditions: input.conditions, note: input.note } }}
        />
      </main>
    </div>
  );
}
