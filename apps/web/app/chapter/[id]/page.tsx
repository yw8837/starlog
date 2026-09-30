import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { FOLLOW_UP_ANSWER, INVITE_FIXTURE_TOKEN, STORY_FIXTURE, TAROT_SAMPLE } from "@/lib/fixtures";
import { ChapterView } from "./ChapterView";

// Personal readings stay out of search (spec section 10).
export const metadata: Metadata = { title: TAROT_SAMPLE.story.title, robots: { index: false, follow: false } };

export default async function ChapterPage({ params, searchParams }: PageProps<"/chapter/[id]">) {
  const { id } = await params;
  const chapter = STORY_FIXTURE.chapters.find((c) => c.id === id && c.kind === "tarot");
  if (!chapter) notFound();
  const query = await searchParams;
  const { question, template, input } = TAROT_SAMPLE;

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <ChapterView
          sample={TAROT_SAMPLE}
          chapterLabel={chapter.label}
          generate={query.from === "unlock" && query.instant !== "1"}
          inviteUrl={`${SITE.url}/invite/${INVITE_FIXTURE_TOKEN}`}
          followUpAnswer={FOLLOW_UP_ANSWER}
          fallback={{ question, template, input: { conditions: input.conditions, note: input.note } }}
        />
      </main>
      <Footer />
      <TabBar active="story" />
    </div>
  );
}
