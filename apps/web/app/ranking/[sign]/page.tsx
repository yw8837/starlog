import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConstellation, isSignId } from "@starlog/core";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { RankingView } from "./RankingView";
import s from "./RankingView.module.css";

type Props = { params: Promise<{ sign: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sign } = await params;
  if (!isSignId(sign)) return NOT_FOUND_METADATA;
  const def = getConstellation(sign);
  return {
    title: `${def.ko} 랭킹`,
    description: `${def.ko}를 완성한 사람들의 별자리 인연 랭킹이에요. 이번 주 랭킹과 명예의 전당을 봐요.`,
    robots: { index: false, follow: false },
  };
}

export default async function RankingPage({ params }: Props) {
  if (!SITE.features.bonds) notFound();
  const { sign } = await params;
  if (!isSignId(sign)) notFound();
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={21} />
      <TabBar />
      <main className={`page-col page-wide ${s.screen}`}>
        <RankingView sign={sign} />
      </main>
      <Footer />
    </div>
  );
}
