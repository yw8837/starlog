import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { FreeResult } from "./FreeResult";

export const metadata: Metadata = { title: "카드 풀이" };

export default async function TarotResultPage({ searchParams }: PageProps<"/tarot/result">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <FreeResult instant={query.instant === "1"} />
      </main>
      <Footer />
    </div>
  );
}
