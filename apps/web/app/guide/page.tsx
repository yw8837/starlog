import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { GUIDE_ARTICLES, GUIDE_CATEGORY_LABEL, type GuideCategory } from "@/lib/guide";
import { GuideThumb } from "./GuideThumb";
import s from "./guide.module.css";

export const metadata: Metadata = {
  title: "가이드",
  description: "타로 카드를 읽는 법, 정방향과 역방향, 출생시간을 모를 때의 사주, 오행까지. 카드와 사주를 읽기 전에 알아 두면 좋은 이야기를 모았어요.",
  alternates: { canonical: "/guide" },
};

const CATEGORIES: readonly GuideCategory[] = ["tarot", "saju"];

export default function GuidePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} />
      <main className="page-col page-wide">
        <div className={s.index}>
          <header className={s.indexHead}>
            <h1 className={s.indexTitle}>가이드</h1>
            <p className={s.indexLead}>카드와 사주를 읽기 전에 알아 두면 좋은 이야기</p>
          </header>

          {CATEGORIES.map((category) => (
            <section key={category} className={s.group} aria-labelledby={`guide-${category}`}>
              <h2 id={`guide-${category}`} className={s.groupTitle}>
                {GUIDE_CATEGORY_LABEL[category]}
              </h2>
              <ul className={s.list}>
                {GUIDE_ARTICLES.filter((article) => article.category === category).map((article) => (
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
            </section>
          ))}
        </div>
      </main>
      <Footer />
      <TabBar active="guide" />
    </div>
  );
}
