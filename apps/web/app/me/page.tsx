import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { INVITE_FIXTURE_TOKEN, ME_FIXTURE, STORY_FIXTURE, TAROT_SAMPLE, WALLET_FIXTURE } from "@/lib/fixtures";
import { MeView } from "./MeView";

export const metadata: Metadata = { title: "내 정보", robots: { index: false, follow: false } };

export default function MePage() {
  const chapter = STORY_FIXTURE.chapters.findLast((c) => c.kind === "tarot");
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={31} />
      <main className="page-col page-wide">
        <MeView
          nickname={ME_FIXTURE.nickname}
          provider={ME_FIXTURE.provider}
          wallet={WALLET_FIXTURE}
          share={{
            card: TAROT_SAMPLE.cards[0],
            question: TAROT_SAMPLE.question,
            chapter: `나의 ${SITE.nameKo} · ${chapter?.label ?? "1장"}`,
            inviteUrl: `${SITE.url}/invite/${INVITE_FIXTURE_TOKEN}`,
          }}
        />
      </main>
      <Footer />
      <TabBar active="me" />
    </div>
  );
}
