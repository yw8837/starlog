import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/layout/DemoNotice";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { INVITE_FIXTURE_TOKEN, TAROT_FOLLOW_UPS, TAROT_SAMPLE } from "@/lib/fixtures";
import { LocalChapter } from "./LocalChapter";
import { SampleChapter } from "./SampleChapter";

/** Saved readings get short random ids; `sample` is the fixture demo. */
const LOCAL_ID = /^[a-z0-9]{6,32}$/;

// Personal readings stay out of search (spec section 10); the demo too.
export async function generateMetadata({ params }: PageProps<"/chapter/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id === "sample" ? TAROT_SAMPLE.question : "내 기록", robots: { index: false, follow: false } };
}

export default async function ChapterPage({ params }: PageProps<"/chapter/[id]">) {
  const { id } = await params;
  if (id !== "sample" && !LOCAL_ID.test(id)) notFound();

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        {id === "sample" ? (
          <>
            <DemoNotice />
            <SampleChapter sample={TAROT_SAMPLE} followUps={TAROT_FOLLOW_UPS} inviteUrl={`${SITE.url}/invite/${INVITE_FIXTURE_TOKEN}`} />
          </>
        ) : (
          // Saved on this device only: read in the browser.
          <LocalChapter id={id} />
        )}
      </main>
      <Footer />
      <TabBar active="story" />
    </div>
  );
}
