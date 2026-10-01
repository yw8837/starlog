import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { pageMetadata } from "@/lib/seo";
import { TodayView } from "./TodayView";

export const metadata: Metadata = pageMetadata({
  title: "오늘의 한 장 · 하루 한 번 무료 타로 운세",
  description: "섞은 카드 세 장 가운데 한 장을 고르면 오늘의 운세가 나와요. 오늘의 한마디와 애정, 금전, 일 이야기, 오늘의 색과 숫자를 하루에 한 번 무료로 볼 수 있어요.",
  path: "/today",
});

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
