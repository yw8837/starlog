import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { TodayView } from "./TodayView";

export const metadata: Metadata = {
  title: "오늘의 한 장",
  description: "쿠키를 열면 오늘의 카드 한 장과 짧은 쪽지가 나와요. 하루에 한 번, 무료예요.",
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
