import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/layout/DemoNotice";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { INVITE_FIXTURE_TOKEN, TAROT_FOLLOW_UPS, TAROT_SAMPLE, demoInviteOn } from "@/lib/fixtures";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { LocalChapter } from "./LocalChapter";
import { SampleChapter } from "./SampleChapter";

/** Saved readings get short random ids; `sample` is the fixture demo. */
const LOCAL_ID = /^[a-z0-9]{6,32}$/;

// Personal readings stay out of search (spec section 10); the demo too.
export async function generateMetadata({ params }: PageProps<"/chapter/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (id !== "sample" && !LOCAL_ID.test(id)) return NOT_FOUND_METADATA;
  return { title: id === "sample" ? TAROT_SAMPLE.question : "내 기록", robots: { index: false, follow: false } };
}

export default async function ChapterPage({ params }: PageProps<"/chapter/[id]">) {
  const { id } = await params;
  if (id !== "sample" && !LOCAL_ID.test(id)) notFound();

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed moon={false} />
      <TabBar active="story" />
      <main className="page-col page-wide">
        {id === "sample" ? (
          <>
            <DemoNotice />
            {/* The demo invite opens in development and e2e only (app/invite/[token]): none to hand out in production (QA-13). */}
            <SampleChapter
              sample={TAROT_SAMPLE}
              followUps={TAROT_FOLLOW_UPS}
              inviteUrl={demoInviteOn() ? `${SITE.url}/invite/${INVITE_FIXTURE_TOKEN}` : undefined}
            />
          </>
        ) : (
          // Saved on this device (logged in: looked up in the account too): read in the browser.
          <LocalChapter id={id} />
        )}
      </main>
      <Footer />
    </div>
  );
}
