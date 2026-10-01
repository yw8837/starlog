import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { StoryView } from "./StoryView";

// Personal records stay out of search (spec section 10).
export const metadata: Metadata = { title: "내 기록", robots: { index: false, follow: false } };

export default function StoryPage() {
  return (
    // Phones get a floating 새로 물어보기 button (.with-fab keeps the footer clear of it).
    <div className="page-shell with-tabbar with-fab">
      <NightSky fixed seed={23} />
      <TabBar active="story" />
      <main className="page-col page-wide">
        <StoryView />
      </main>
      <Footer />
    </div>
  );
}
