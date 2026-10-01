import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { LuckyView } from "./LuckyView";
import s from "./LuckyView.module.css";

export const metadata: Metadata = {
  title: "이번 주 행운 번호",
  description: "생년월일의 오행과 이번 주 카드로 고른 번호 6개를 재미로 봐요. 번호마다 왜 골랐는지 함께 알려 드려요.",
  alternates: { canonical: "/lucky" },
};

export default function LuckyPage() {
  if (!SITE.features.bonds) notFound();
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={45} />
      <TabBar />
      <main className={`page-col ${s.screen}`}>
        <LuckyView />
      </main>
      <Footer />
    </div>
  );
}
