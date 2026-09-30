import type { Metadata } from "next";
import { DemoNotice } from "@/components/layout/DemoNotice";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { SAJU_SAMPLE, WALLET_FIXTURE } from "@/lib/fixtures";
import { SajuChartView } from "./SajuChartView";

// A personal chart stays out of search (spec section 10).
export const metadata: Metadata = { title: "나의 명식", robots: { index: false, follow: false } };

export default async function SajuChartPage({ searchParams }: PageProps<"/saju/chart">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <DemoNotice />
        <SajuChartView
          free={SAJU_SAMPLE.free}
          visit={query.visit === "returning" ? "returning" : "first"}
          instant={query.instant === "1"}
          wallet={WALLET_FIXTURE}
        />
      </main>
      <Footer />
    </div>
  );
}
