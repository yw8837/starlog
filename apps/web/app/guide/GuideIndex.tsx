import type { Metadata } from "next";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath, type GuideCategory } from "@/lib/guide";
import { GuideThumb } from "./GuideThumb";
import s from "./guide.module.css";

/** Each tab has its leader: the cat astrologer reads cards, the rabbit in 두루마기 reads 명식. */
const TAB_COPY: Record<GuideCategory, { title: string; description: string; line: string }> = {
  tarot: {
    title: "타로 가이드",
    description: "타로 카드 읽는 법, 정방향과 역방향, 은둔자와 별 카드 이야기까지. 카드를 펼치기 전에 알아 두면 좋은 이야기를 모았어요.",
    line: "카드 읽는 법, 제가 차근차근 알려 줄게요",
  },
  saju: {
    title: "사주 가이드",
    description: "출생시간을 모를 때 사주를 보는 법과 오행 이야기까지. 명식을 읽기 전에 알아 두면 좋은 이야기를 모았어요.",
    line: "명식 읽는 법은 제가 맡을게요",
  },
};

export function guideIndexMetadata(category: GuideCategory): Metadata {
  const copy = TAB_COPY[category];
  return { title: copy.title, description: copy.description, alternates: { canonical: guideIndexPath(category) } };
}

/** A guide tab: links to both tabs, the tab's character with a line, then its article cards. */
export function GuideIndex({ category }: { category: GuideCategory }) {
  const copy = TAB_COPY[category];
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} />
      <main className="page-col page-wide">
        <div className={s.index}>
          <nav className={s.tabs} aria-label="가이드 분류">
            {GUIDE_CATEGORIES.map((tab) => {
              const current = tab === category;
              return (
                <Link
                  key={tab}
                  href={guideIndexPath(tab)}
                  className={current ? `${s.tab} ${s.tabCurrent}` : s.tab}
                  aria-current={current ? "page" : undefined}
                >
                  {GUIDE_CATEGORY_LABEL[tab]}
                </Link>
              );
            })}
          </nav>

          <header className={s.host}>
            <h1 className={s.indexTitle}>{copy.title}</h1>
            <div className={s.hostRow}>
              <div className={s.hostCast}>{category === "tarot" ? <Cat outfit="tarot" size={104} /> : <Rabbit outfit="hanbok" size={104} />}</div>
              <SpeechBubble tail="left" className={s.hostLine}>
                {copy.line}
              </SpeechBubble>
            </div>
          </header>

          <ul className={s.list}>
            {articlesIn(category).map((article) => (
              <li key={article.slug}>
                <Link href={`/guide/${article.slug}`} className={s.item}>
                  <GuideThumb article={article} />
                  <span className={s.itemText}>
                    <span className={s.itemTitle}>{article.title}</span>
                    <span className={s.itemDesc}>{article.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
      <TabBar active="guide" />
    </div>
  );
}
