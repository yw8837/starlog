import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CodeEntry } from "@/components/bonds/CodeEntry";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import b from "@/components/bonds/bonds.module.css";
import s from "./[code]/JoinFlow.module.css";

export const metadata: Metadata = {
  title: "초대코드로 참여",
  description: "친구에게 받은 초대코드 6자리를 넣고 친구의 별자리에 별이 되어 주세요.",
  robots: { index: false, follow: false },
};

/** 초대코드로 참여: for codes heard aloud or seen in a story, where a link cannot be tapped. */
export default function InviteEntryPage() {
  if (!SITE.features.bonds) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" seed={17} moon={false} />
      <main className={`page-col ${s.screen}`}>
        <header className={s.head}>
          <ConstellationArt sign="libra" lit={2} size={160} decorative className={s.headArt} />
          <h1 className={s.title}>초대코드로 참여</h1>
          <p className={b.helper}>친구에게 받은 6자리 코드를 넣으면 친구의 별자리에 별이 될 수 있어요. 대소문자는 상관없어요.</p>
        </header>
        <div className={b.panel}>
          <CodeEntry autoFocus />
        </div>
        <Button href="/bonds" variant="secondary" block>
          나도 내 별자리 만들기
        </Button>
      </main>
      <Footer />
    </div>
  );
}
