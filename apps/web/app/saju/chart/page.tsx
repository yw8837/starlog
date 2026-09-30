import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { SajuChartView } from "./SajuChartView";

// A personal chart stays out of search (spec section 10).
export const metadata: Metadata = { title: "나의 명식", robots: { index: false, follow: false } };

export default function SajuChartPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <SajuChartView />
      </main>
      <Footer />
    </div>
  );
}
