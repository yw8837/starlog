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
const TAB_COPY: Record<GuideCategory, { title: string; hero: [string, string]; description: string; line: string; sub: string }> = {
  tarot: {
    title: "타로 가이드",
    hero: ["타로 카드를 펼치기 전에", "알아 두면 좋은 이야기"],
    description: "타로 카드 읽는 법과 여러 스프레드, 메이저 아르카나 22장의 뜻까지. 카드를 펼치기 전에 알아 두면 좋은 이야기를 모았어요.",
    line: "카드 읽는 법, 제가 차근차근 알려 줄게요",
    sub: "카드 읽는 법과 스프레드, 메이저 아르카나 22장",
  },
  saju: {
    title: "사주 가이드",
    hero: ["사주 명식을 읽기 전에", "알아 두면 좋은 이야기"],
    description: "오행과 천간·지지, 일간과 십신, 대운과 만세력 보는 법까지. 사주 명식을 읽기 전에 알아 두면 좋은 이야기를 모았어요.",
    line: "명식 읽는 법은 제가 맡을게요",
    sub: "오행과 천간·지지부터 대운과 궁합까지",
  },
};

export function guideIndexMetadata(category: GuideCategory): Metadata {
  const copy = TAB_COPY[category];
  return { title: copy.title, description: copy.description, alternates: { canonical: guideIndexPath(category) } };
}

/**
 * A guide tab: a hero (eyebrow, two-line title, lead) with the tab's character as its host, the
 * 타로 / 사주 tabs as category chips, then the tab's article cards (the /help card shape, with an
 * arrow where the accordion has its +).
 */
export function GuideIndex({ category }: { category: GuideCategory }) {
  const copy = TAB_COPY[category];
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} />
      <TabBar active="guide" />
      <main className="page-col page-wide">
        <div className={s.index}>
          <header className={s.hero}>
            <div className={s.heroText}>
              <p className={s.heroEyebrow}>GUIDE</p>
              <h1 className={s.heroTitle}>
                <span className={s.heroLine}>{copy.hero[0]}</span> <span className={s.heroLine}>{copy.hero[1]}</span>
              </h1>
              <p className={s.heroLead}>{copy.description}</p>
            </div>
            <div className={s.hostRow}>
              <div className={s.hostCast}>{category === "tarot" ? <Cat outfit="tarot" size={104} /> : <Rabbit outfit="hanbok" size={104} />}</div>
              <SpeechBubble tail="left" className={s.hostLine}>
                {copy.line}
              </SpeechBubble>
            </div>
          </header>

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
                  <span className={s.dot} data-tone={tab} aria-hidden="true" />
                  {GUIDE_CATEGORY_LABEL[tab]}
                </Link>
              );
            })}
          </nav>

          <section className={s.group} aria-labelledby="guide-group-title">
            <div className={s.groupHead}>
              <h2 id="guide-group-title" className={s.groupTitle}>
                <span className={s.dot} data-tone={category} aria-hidden="true" />
                {copy.title}
              </h2>
              <p className={s.groupSub}>{copy.sub}</p>
            </div>
            <ul className={s.list}>
              {articlesIn(category).map((article) => (
                <li key={article.slug}>
                  <Link href={`/guide/${article.slug}`} className={s.item}>
                    <GuideThumb article={article} />
                    <span className={s.itemText}>
                      <span className={s.itemTitle}>{article.title}</span>
                      <span className={s.itemDesc}>{article.description}</span>
                    </span>
                    <span className={s.itemArrow} aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                        <path d="M9 5.5 15.5 12 9 18.5" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
