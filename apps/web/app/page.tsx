import type { Metadata } from "next";
import { BondsHomeRow } from "@/components/bonds/BondsHomeRow";
import { HomeFaq, HomeGuide, HomeHero, QuickCards, SajuEntry, TarotEntry } from "@/components/home/HomeEntries";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { websiteJsonLd } from "@/lib/jsonld";
import { HOME_DESCRIPTION, pageMetadata } from "@/lib/seo";
import s from "./page.module.css";

// The layout's default title (HOME_TITLE) with the home's own description, canonical and og:url.
export const metadata: Metadata = pageMetadata({ description: HOME_DESCRIPTION, path: "/" });

/**
 * Home, the same for every visitor, in reading order: the hero line; 타로 보기 (gold, the one
 * primary) and 사주 보기 with their characters; the two free quick cards; 별자리 인연 (while
 * SITE.features.bonds is on); the guide; four FAQ questions.
 * Desktop keeps that order: 타로 | 사주 side by side, the rest full width.
 */
export default function HomePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky constellation />
      <TabBar active="home" />
      <main className={`page-col page-wide ${s.home}`}>
        {/* The site's name for search (스타로그 / Starlog): on the home, where Google reads it. */}
        <JsonLd data={websiteJsonLd()} />
        <HomeTopBar />
        <HomeHero />

        {/* Rows are auto-placed: a row with nothing to show leaves no gap behind. */}
        <div className={s.grid}>
          <div className={s.tarot}>
            <TarotEntry />
          </div>
          <div className={s.saju}>
            <SajuEntry />
          </div>
          <div className={s.wide}>
            <QuickCards />
          </div>
          {/* 지난 풀이 돌아보기 lives in 내 정보 now (owner 2026-10-20). No premium row here (owner 2026-10-20: the home stays as it was); premium starts from the tarot bridge and the saju list. */}
          {/* Row 4, 별자리 인연: renders nothing until this device's state is loaded (no empty gap). */}
          {SITE.features.bonds ? <BondsHomeRow className={s.wide} /> : null}
        </div>

        <HomeGuide />
        <HomeFaq />
      </main>
      <Footer />
    </div>
  );
}
