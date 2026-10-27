import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { rankingItemListJsonLd } from "@/lib/jsonld";
import { NOINDEX_FOLLOW, pageMetadata } from "@/lib/seo";
import { loadLeaders } from "./loadLeaders";
import { RankingIndexBody } from "./RankingIndexBody";
import s from "./SignIndex.module.css";

/** Out of search, as the twelve sign pages are: thin to a crawler (SEO audit 2026-10-27), its links to them still followed. Not in the sitemaps. */
export const metadata: Metadata = {
  ...pageMetadata({
    title: "별자리 인연 랭킹",
    description: "열두 별자리마다 인연 점수 합계 1~3위를 모아 봐요. 별자리를 골라 전체 순위와 내 순위도 볼 수 있어요. 순위는 초기화 없이 계속 쌓여요.",
    path: "/ranking",
  }),
  robots: NOINDEX_FOLLOW,
};

/** /ranking: 별자리 인연 랭킹, the all-time top 3 of every sign, each card opening the full ranking. */
export default async function RankingIndexPage() {
  if (!SITE.features.bonds) notFound();
  // Per request (the rankings move), never prerendered at build time.
  await connection();
  const leaders = await loadLeaders();
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={21} />
      <TabBar />
      <main className={`page-col page-wide ${s.screen}`}>
        <JsonLd data={rankingItemListJsonLd()} />
        <RankingIndexBody leaders={leaders} />
      </main>
      <Footer />
    </div>
  );
}
