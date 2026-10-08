import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { isSajuTopicId } from "@/lib/sajuTopics";
import { SajuChartView } from "./SajuChartView";

// A personal chart stays out of search (spec section 10).
export const metadata: Metadata = { title: "나의 명식", robots: { index: false, follow: false } };

export default async function SajuChartPage({ searchParams }: PageProps<"/saju/chart">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <SajuChartView
          autoUnlock={query.unlock === "paid" ? "paid" : null}
          loginFlag={typeof query.login === "string" ? query.login : null}
          initialTopic={isSajuTopicId(query.topic) ? query.topic : null}
        />
      </main>
      <Footer />
    </div>
  );
}
