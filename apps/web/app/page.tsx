import { HomeFaq, HomeGuide, HomeHero, QuickCards, SajuEntry, TarotEntry } from "@/components/home/HomeEntries";
import { HomeCheckin } from "@/components/home/HomeCheckin";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import s from "./page.module.css";

/**
 * Home, the same for every visitor, in reading order: the hero line; 타로 보기 (gold, the one
 * primary) and 사주 보기 with their characters; the two free quick cards; a 돌아보기 row when a past
 * reading is due; (별자리 인연, P3); the guide; four FAQ questions. No balance pill in the beta
 * (payments are off). Desktop keeps that order: 타로 | 사주 side by side, the rest full width.
 */
export default function HomePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky constellation />
      <TabBar active="home" />
      <main className={`page-col page-wide ${s.home}`}>
        <HomeTopBar wallet={null} />
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
          <HomeCheckin className={s.wide} />
          {/*
           * Row 4, 별자리 인연 (P3): `{SITE.features.bonds ? <div className={s.wide}><BondsHomeRow /></div> : null}`
           * goes here, between the quick cards / 돌아보기 and the guide. Auto-placed, so no gap until then.
           */}
        </div>

        <HomeGuide />
        <HomeFaq />
      </main>
      <Footer />
    </div>
  );
}
