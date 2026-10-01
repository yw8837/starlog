import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { TodayView } from "./TodayView";

export const metadata: Metadata = {
  title: "오늘의 한 장",
  description: "섞은 카드 세 장 가운데 한 장을 고르면 오늘의 운세가 나와요. 하루에 한 번, 무료예요.",
  alternates: { canonical: "/today" },
};

export default function TodayPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={7} />
      <main className="page-col">
        <TodayView />
      </main>
      <Footer />
    </div>
  );
}
