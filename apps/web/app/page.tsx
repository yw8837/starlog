import { FriendScenesRow, GuideChips, SajuEntry, TarotEntry, TodayRow } from "@/components/home/HomeEntries";
import { StoryHero, WelcomeHero } from "@/components/home/HomeHero";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { STORY_FIXTURE, WALLET_FIXTURE, nextChapterNumber } from "@/lib/fixtures";
import { SITE } from "@/lib/config";
import { GUIDE_ARTICLES } from "@/lib/guide";
import s from "./page.module.css";

/**
 * Home. Returning visitor (fixture 별지기): story card, tarot (gold) and saju entries, today's card,
 * friend scenes, guide. `?visit=first`: a welcome from both characters and a single first-reading button.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const first = query.visit === "first";
  const pending =
    first || !SITE.features.friendScenes ? [] : STORY_FIXTURE.friendScenes.filter((scene) => scene.status === "pending");
  const lastChapter = STORY_FIXTURE.chapters.findLast((chapter) => chapter.kind === "tarot");

  return (
    <div className="page-shell with-tabbar">
      <NightSky constellation />
      <main className={`page-col page-wide ${s.home}`}>
        <HomeTopBar wallet={first ? null : WALLET_FIXTURE} />

        <div className={first ? `${s.grid} ${s.gridFirst}` : s.grid}>
          <div className={s.hero}>
            {first ? <WelcomeHero /> : <StoryHero nextChapter={nextChapterNumber(STORY_FIXTURE.chapters)} lastTitle={lastChapter?.title ?? null} />}
          </div>

          <div className={s.entries}>
            {first ? null : <TarotEntry />}
            <SajuEntry />
            {/* First visit: today's card joins the entries column (there is no story or friend row yet). */}
            {first ? <TodayRow /> : null}
          </div>

          {first ? null : (
            <div className={s.today}>
              <TodayRow />
            </div>
          )}

          {pending.length > 0 ? (
            <div className={s.friends}>
              <FriendScenesRow scenes={pending} />
            </div>
          ) : null}

          <div className={s.guide}>
            <GuideChips articles={GUIDE_ARTICLES} />
          </div>
        </div>
      </main>
      <Footer />
      <TabBar active="home" />
    </div>
  );
}
