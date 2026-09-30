import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { SituationPicker } from "./SituationPicker";

export const metadata: Metadata = { title: "상황 고르기" };

export default function TarotSituationPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <SituationPicker />
      </main>
    </div>
  );
}
