import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSignId } from "@starlog/core";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { BondsView } from "./BondsView";
import s from "./BondsView.module.css";

// A personal page: it stays out of search (lib/seo.ts disallows /bonds too).
export const metadata: Metadata = {
  title: "별자리 인연",
  description: "친구가 별이 되어 내 별자리를 채워요. 사주로 본 인연 점수로 별자리 랭킹에 올라요.",
  robots: { index: false, follow: false },
};

export default async function BondsPage({ searchParams }: { searchParams: Promise<{ sign?: string | string[] }> }) {
  if (!SITE.features.bonds) notFound();
  const { sign } = await searchParams;
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={12} />
      <TabBar />
      <main className={`page-col ${s.screen}`}>
        <BondsView initialSign={isSignId(sign) ? sign : null} />
      </main>
      <Footer />
    </div>
  );
}
