import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConstellation, isSignId } from "@starlog/core";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { NOT_FOUND_METADATA, pageMetadata } from "@/lib/seo";
import { RankingView } from "./RankingView";
import s from "./RankingView.module.css";

type Props = { params: Promise<{ sign: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sign } = await params;
  if (!isSignId(sign)) return NOT_FOUND_METADATA;
  const def = getConstellation(sign);
  return pageMetadata({
    title: `${def.ko} 랭킹`,
    description: `${def.ko}를 완성한 사람들의 별자리 인연 랭킹이에요. 친구들이 별이 되어 채운 별자리의 인연 점수로 순위를 봐요. 순위는 초기화 없이 계속 쌓여요.`,
    path: `/ranking/${sign}`,
  });
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
