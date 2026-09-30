import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { FOLLOW_UP_ANSWER, INVITE_FIXTURE_TOKEN, SAJU_SAMPLE, STORY_FIXTURE, TAROT_SAMPLE } from "@/lib/fixtures";
import { ChapterView } from "./ChapterView";
import { SajuChapterView } from "./SajuChapterView";

const findChapter = (id: string) => STORY_FIXTURE.chapters.find((c) => c.id === id);

// Personal readings stay out of search (spec section 10).
export async function generateMetadata({ params }: PageProps<"/chapter/[id]">): Promise<Metadata> {
  const { id } = await params;
  const chapter = findChapter(id);
  const title = chapter?.kind === "saju" ? SAJU_SAMPLE.free.title : TAROT_SAMPLE.story.title;
  return { title, robots: { index: false, follow: false } };
}

export default async function ChapterPage({ params, searchParams }: PageProps<"/chapter/[id]">) {
  const { id } = await params;
  const chapter = findChapter(id);
  if (!chapter) notFound();
  const query = await searchParams;
  const generate = query.from === "unlock" && query.instant !== "1";
  const { question, template, input } = TAROT_SAMPLE;

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        {chapter.kind === "saju" ? (
          <SajuChapterView sample={SAJU_SAMPLE} chapterLabel={chapter.label} generate={generate} />
        ) : (
          <ChapterView
            sample={TAROT_SAMPLE}
            chapterLabel={chapter.label}
            generate={generate}
            inviteUrl={`${SITE.url}/invite/${INVITE_FIXTURE_TOKEN}`}
            followUpAnswer={FOLLOW_UP_ANSWER}
            fallback={{ question, template, input: { conditions: input.conditions, note: input.note } }}
          />
        )}
      </main>
      <Footer />
      <TabBar active="story" />
    </div>
  );
}
