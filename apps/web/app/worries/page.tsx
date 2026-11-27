import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { WorryTools } from "@/components/worries/WorryCards";
import { WorryList } from "@/components/worries/WorryList";
import { SITE } from "@/lib/config";
import { WORRIES_PATH } from "@/lib/worries";
import { pageMetadata } from "@/lib/seo";
import s from "./worries.module.css";

export const metadata: Metadata = pageMetadata({
  title: "고민 전체 보기",
  description: "썸, 연락, 재회, 이별, 돈, 일과 회사까지 지금 고민을 고르면 맞는 타로나 사주 풀이로 바로 이어져요. 고민마다 보는 것과 가격을 먼저 알려 드려요.",
  path: WORRIES_PATH,
});

/**
 * 고민 전체 (spec 2026-11-26 worry catalog §5.3): every worry by category, then the readings by their tools' names. A plain
 * content page like /pricing: a back bar, no tab bar. Off (SITE.features.worries) it sends home.
 */
export default function WorriesPage() {
  if (!SITE.features.worries) redirect("/");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={17} />
      <main className="page-col page-wide">
        <Stepper label="고민 전체 보기" backHref="/" backLabel="홈으로" />
        <header className={s.head}>
          <h1 className={s.title}>고민 전체 보기</h1>
          {/* True for saju and 궁합 too, which take no question (code review 2026-11-26 A4). */}
          <p className={s.lead}>고민을 고르면 맞는 풀이로 바로 이어져요.</p>
        </header>
        <section className={s.list} aria-labelledby="worries-list-title">
          <h2 id="worries-list-title" className="sr-only">
            고민 목록
          </h2>
          <WorryList />
        </section>
        <div className={s.tools}>
          <WorryTools pricing />
        </div>
      </main>
      <Footer />
    </div>
  );
}
