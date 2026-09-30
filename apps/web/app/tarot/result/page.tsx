import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { TAROT_SAMPLE, WALLET_FIXTURE } from "@/lib/fixtures";
import { FreeResult } from "./FreeResult";

export const metadata: Metadata = { title: "카드 풀이" };

export default async function TarotResultPage({ searchParams }: PageProps<"/tarot/result">) {
  const query = await searchParams;
  const { question, template, input, cards, free } = TAROT_SAMPLE;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <FreeResult
          fallback={{ question, template, input: { conditions: input.conditions, note: input.note } }}
          cards={cards}
          free={free}
          visit={query.visit === "returning" ? "returning" : "first"}
          instant={query.instant === "1"}
          wallet={WALLET_FIXTURE}
        />
      </main>
      <Footer />
    </div>
  );
}
