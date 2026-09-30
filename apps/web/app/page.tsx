import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import s from "./page.module.css";

// Minimal home for the tarot flow. The full home (story card, today's card, friends, guide) lands next.
export default function HomePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky constellation />
      <main className={`page-col ${s.home}`}>
        <header className={s.header}>
          <h1 className={s.wordmark}>{SITE.name}</h1>
          <p className={s.sub}>{SITE.nameKo}</p>
        </header>

        <div className={s.pair}>
          <Cat outfit="tarot" size={168} />
          <Rabbit outfit="tarot" size={128} />
        </div>
        <p className={s.lead}>타로와 사주로 오늘의 마음을 차분히 돌아보는 밤하늘 기록</p>

        <div className={s.actions}>
          <Button href="/tarot/new" block trailing="→">
            타로 보기
          </Button>
          <Button href="/tarot/draw?template=daily" variant="secondary" block>
            오늘의 한 장
          </Button>
        </div>
      </main>
      <Footer />
      <TabBar active="home" />
    </div>
  );
}
