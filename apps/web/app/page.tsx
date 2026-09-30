import { GuideChips, QuickCards, SajuEntry, TarotEntry } from "@/components/home/HomeEntries";
import { HomeCheckin } from "@/components/home/HomeCheckin";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { GUIDE_ARTICLES } from "@/lib/guide";
import s from "./page.module.css";

/**
 * Home, the same for every visitor: 타로 보기 (gold) and 사주 보기 with their characters, the two
 * free quick cards, a 돌아보기 row when a past reading is due, then the guide. No balance pill in
 * the beta (payments are off).
 */
export default function HomePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky constellation />
      <main className={`page-col page-wide ${s.home}`}>
        <HomeTopBar wallet={null} />

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
           * 별자리 인연 (P3) drops in here, full width between the quick cards / 돌아보기 and the guide:
           * <div className={s.wide}><BondsCard /></div>. Until it exists nothing renders, so no gap.
           */}
          <div className={s.wide}>
            <GuideChips articles={GUIDE_ARTICLES} />
          </div>
        </div>
      </main>
      <Footer />
      <TabBar active="home" />
    </div>
  );
}
