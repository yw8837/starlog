import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { loadLeaders } from "./loadLeaders";
import { RankingIndexBody } from "./RankingIndexBody";
import s from "./SignIndex.module.css";

export const metadata: Metadata = {
  title: "별자리 리더보드",
  description: "열두 별자리마다 이번 주 인연 점수 합계 1~3위를 모아 봐요. 별자리를 골라 전체 순위와 명예의 전당도 볼 수 있어요.",
  alternates: { canonical: "/ranking" },
};

/** /ranking: 별자리 리더보드, this week's top 3 of every sign, each card opening the full ranking. */
export default async function RankingIndexPage() {
  if (!SITE.features.bonds) notFound();
  // Per request (the week and the rankings move), never prerendered at build time.
  await connection();
  const leaders = await loadLeaders();
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={21} />
      <TabBar />
      <main className={`page-col page-wide ${s.screen}`}>
        <RankingIndexBody leaders={leaders} />
      </main>
      <Footer />
    </div>
  );
}
