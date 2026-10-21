import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { NOINDEX, pageMetadata } from "@/lib/seo";
import { LuckyView } from "./LuckyView";
import s from "./LuckyView.module.css";

// Out of search (SEO P2-4): the numbers are drawn in the browser from a birth date, so the server sends a form and a
// loading line, thin to a crawler. The title, description and preview stay for a shared link.
export const metadata: Metadata = {
  ...pageMetadata({
    title: "이번 주 행운 번호",
    description: "생년월일의 오행과 이번 주 카드로 고른 번호 6개를 재미로 봐요. 번호마다 왜 골랐는지 함께 알려 드리고, 번호는 한 주 동안 그대로예요.",
    path: "/lucky",
  }),
  robots: NOINDEX,
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
