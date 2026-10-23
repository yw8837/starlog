import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { NightSky } from "@/components/sky/NightSky";
import { BIRTH_CARD_PATH, BIRTH_CARD_TITLE } from "@/lib/birthCard";
import {
  GUIDE_ABOUT_PATH,
  GUIDE_ARTICLES,
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_LABEL,
  GUIDE_STARTERS,
  articlesIn,
  findArticle,
  guideIndexPath,
  lastReviewed,
  recentlyReviewed,
  type GuideCategory,
} from "@/lib/guide";
import { appHref, linkHref } from "@/lib/hosts";
import { KEYWORD_PATH, KEYWORD_TITLE } from "@/lib/keyword2027";
import { koreanDate } from "@/lib/legal";
import { guideIndexBreadcrumbJsonLd, guideIndexItemListJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { GuideHost } from "./GuideHost";
import { GuideThumb } from "./GuideThumb";
import s from "./guide.module.css";

/** Each tab has its leader: the cat astrologer reads cards, the rabbit in 두루마기 reads 명식. */
const TAB_COPY: Record<GuideCategory, { title: string; metaTitle: string; hero: [string, string]; description: string; sub: string }> = {
  tarot: {
    title: "타로 가이드",
    metaTitle: "타로 가이드 · 카드 뜻과 읽는 법, 스프레드",
    hero: ["타로 카드를 펼치기 전에", "알아 두면 좋은 이야기"],
    description: "타로 카드 읽는 법과 여러 스프레드, 메이저 아르카나 22장의 뜻까지. 카드를 펼치기 전에 알아 두면 좋은 이야기를 모았어요.",
    sub: "카드 읽는 법과 스프레드, 메이저 아르카나 22장",
  },
  saju: {
    title: "사주 가이드",
    metaTitle: "사주 가이드 · 오행과 천간·지지, 대운, 만세력",
    hero: ["사주 명식을 읽기 전에", "알아 두면 좋은 이야기"],
    description: "오행과 천간·지지, 일간과 십신, 대운과 만세력 보는 법까지. 사주 명식을 읽기 전에 알아 두면 좋은 이야기를 모았어요.",
    sub: "오행과 천간·지지부터 대운과 궁합까지",
  },
};

/** 무료로 해 보기: the app's free tools, each with one line on what it does (after its own page's description). */
const FREE_TOOLS: ReadonlyArray<{ path: string; name: string; line: string }> = [
  { path: "/now", name: "지금의 한 장", line: "고민 하나를 떠올리고 카드 한 장을 골라요. 횟수 제한 없이 무료예요." },
  { path: "/today", name: "오늘의 한 장", line: "하루 한 번, 카드 한 장으로 오늘의 운세와 색, 숫자를 봐요." },
  { path: BIRTH_CARD_PATH, name: BIRTH_CARD_TITLE, line: "생년월일로 메이저 아르카나 22장 가운데 나를 닮은 카드를 찾아요." },
  { path: KEYWORD_PATH, name: KEYWORD_TITLE, line: "생일의 일주로 2027년 정미년에 붙들 키워드를 골라 드려요." },
];

/** How many articles 최근 고친 글 lists. */
const RECENT_COUNT = 5;

function Arrow() {
  return (
    <span className={s.itemArrow} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <path d="M9 5.5 15.5 12 9 18.5" />
      </svg>
    </span>
  );
}

export function guideIndexMetadata(category: GuideCategory): Metadata {
  const copy = TAB_COPY[category];
  return pageMetadata({ title: copy.metaTitle, description: copy.description, path: guideIndexPath(category) });
}

/**
 * A guide tab: a hero (eyebrow, two-line title, lead) with the tab's character as its host, the
 * 타로 / 사주 tabs as category chips, then the tab's article cards (the /help card shape, with an
 * arrow where the accordion has its +).
 */
export function GuideIndex({ category }: { category: GuideCategory }) {
  const copy = TAB_COPY[category];
  // This tab's reading path first, then the other's.
  const starterOrder = [category, ...GUIDE_CATEGORIES.filter((other) => other !== category)];
  const newest = GUIDE_ARTICLES.map(lastReviewed)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} />
      <TabBar active="guide" host="guide" />
      <main className="page-col page-wide">
        <JsonLd data={guideIndexBreadcrumbJsonLd(category)} />
        <JsonLd data={guideIndexItemListJsonLd(category)} />
        <div className={s.index}>
          <header className={s.hero}>
            <div className={s.heroText}>
              <p className={s.heroEyebrow}>GUIDE</p>
              <h1 className={s.heroTitle}>
                <span className={s.heroLine}>{copy.hero[0]}</span> <span className={s.heroLine}>{copy.hero[1]}</span>
              </h1>
              <p className={s.heroLead}>{copy.description}</p>
            </div>
            <GuideHost category={category} />
          </header>

          <section className={s.intro} aria-labelledby="hub-intro-title">
            <h2 id="hub-intro-title" className={s.introTitle}>
              스타로그 가이드는
            </h2>
            <p className={s.introText}>
              타로 카드의 뜻과 읽는 법, 사주 명식을 보는 법을 차근차근 풀어 쓴 글 모음이에요. 타로나 사주를 처음 접하는 분, 풀이를 보기 전에 기본을 알고 싶은 분이
              직접 읽어 볼 수 있게 썼어요. 타로 글은 1909년 원판 그림과 웨이트 원전에, 사주 글은 만세력 계산 규칙에 기대요.
            </p>
            <p className={s.introMeta}>
              {GUIDE_CATEGORIES.map((tab) => `${GUIDE_CATEGORY_LABEL[tab]} ${articlesIn(tab).length}편`).join(" · ")}
              {newest ? (
                <>
                  {" · 마지막 수정 "}
                  <time dateTime={newest}>{koreanDate(newest)}</time>
                </>
              ) : null}
              {" · "}
              <Link href={GUIDE_ABOUT_PATH} className={s.sourcesLink}>
                누가 어떻게 쓰나요
              </Link>
            </p>
          </section>

          <section className={s.group} aria-labelledby="hub-start-title">
            <div className={s.groupHead}>
              <h2 id="hub-start-title" className={s.groupTitle}>
                처음이라면 이 순서로 읽어 보세요
              </h2>
            </div>
            <div className={s.starters}>
              {starterOrder.map((tab) => (
                <div key={tab} className={s.starterGroup}>
                  <h3 className={s.starterTitle}>
                    <span className={s.dot} data-tone={tab} aria-hidden="true" />
                    {`${GUIDE_CATEGORY_LABEL[tab]} 처음이라면`}
                  </h3>
                  <ol className={`${s.list} ${s.starterList}`}>
                    {GUIDE_STARTERS[tab].map((slug, i) => {
                      const article = findArticle(slug);
                      if (!article) return null;
                      return (
                        <li key={slug}>
                          <Link href={`/guide/${slug}`} className={`${s.item} ${s.itemCompact}`}>
                            <GuideThumb article={article} />
                            <span className={s.itemText}>
                              <span className={s.itemDesc}>{`${i + 1}단계`}</span>
                              <span className={s.itemTitle}>{article.title}</span>
                            </span>
                            <Arrow />
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <nav className={s.tabs} aria-label="가이드 분류">
            {GUIDE_CATEGORIES.map((tab) => {
              const current = tab === category;
              return (
                <Link
                  key={tab}
                  href={linkHref(guideIndexPath(tab), "guide")}
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
              {articlesIn(category).map((article, i) => (
                <li key={article.slug}>
                  <Link href={`/guide/${article.slug}`} className={s.item}>
                    <GuideThumb article={article} eager={i < 2} />
                    <span className={s.itemText}>
                      <span className={s.itemTitle}>{article.title}</span>
                      <span className={s.itemDesc}>{article.description}</span>
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={s.group} aria-labelledby="hub-recent-title">
            <div className={s.groupHead}>
              <h2 id="hub-recent-title" className={s.groupTitle}>
                최근 고친 글
              </h2>
              <p className={s.groupSub}>내용을 가장 최근에 고친 글이에요</p>
            </div>
            <ul className={s.list}>
              {recentlyReviewed(RECENT_COUNT).map((article) => {
                const reviewed = lastReviewed(article) as string;
                return (
                  <li key={article.slug}>
                    <Link href={`/guide/${article.slug}`} className={`${s.item} ${s.itemCompact}`}>
                      <GuideThumb article={article} />
                      <span className={s.itemText}>
                        <span className={s.itemTitle}>{article.title}</span>
                        <span className={s.itemDesc}>
                          {`${GUIDE_CATEGORY_LABEL[article.category]} · `}
                          <time dateTime={reviewed}>{koreanDate(reviewed)}</time>
                          {" 수정"}
                        </span>
                      </span>
                      <Arrow />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={s.group} aria-labelledby="hub-tools-title">
            <div className={s.groupHead}>
              <h2 id="hub-tools-title" className={s.groupTitle}>
                무료로 해 보기
              </h2>
              <p className={s.groupSub}>스타로그 앱에서 바로 열려요</p>
            </div>
            <ul className={s.list}>
              {FREE_TOOLS.map((tool) => (
                <li key={tool.path}>
                  {/* An app page: absolute on the app host when the hosts are split, never prefetched from the root domain (F-05). */}
                  <Link href={appHref(tool.path)} prefetch={false} className={`${s.item} ${s.itemCompact} ${s.itemPlain}`}>
                    <span className={s.itemText}>
                      <span className={s.itemTitle}>{tool.name}</span>
                      <span className={s.itemDesc}>{tool.line}</span>
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <Footer host="guide" />
    </div>
  );
}
