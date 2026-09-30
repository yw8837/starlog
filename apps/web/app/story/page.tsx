import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { ME_FIXTURE, STORY_FIXTURE, nextChapterNumber } from "@/lib/fixtures";
import { EmptyStory, StoryView } from "./StoryView";

// A personal story stays out of search (spec section 10).
export const metadata: Metadata = { title: "나의 스타로그", robots: { index: false, follow: false } };

export default async function StoryPage({ searchParams }: PageProps<"/story">) {
  const query = await searchParams;
  const empty = query.empty === "1";

  return (
    // The full story has a floating 새 장 열기 button on phones (.with-fab keeps the footer clear of it).
    <div className={empty ? "page-shell with-tabbar" : "page-shell with-tabbar with-fab"}>
      <NightSky fixed seed={23} />
      <main className="page-col page-wide">
        {empty ? (
          <EmptyStory />
        ) : (
          <StoryView
            nickname={ME_FIXTURE.nickname}
            chapters={STORY_FIXTURE.chapters}
            scenes={SITE.features.friendScenes ? STORY_FIXTURE.friendScenes : []}
            nextChapter={nextChapterNumber(STORY_FIXTURE.chapters)}
          />
        )}
      </main>
      <Footer />
      <TabBar active="story" />
    </div>
  );
}
