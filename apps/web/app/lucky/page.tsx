import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { NOINDEX, pageMetadata } from "@/lib/seo";
import { luckyWeekLabel, parseLuckyShare } from "@/lib/luckyShare";
import { LuckyView } from "./LuckyView";
import s from "./LuckyView.module.css";

// Out of search (SEO P2-4): the numbers are drawn in the browser from a birth date, so the server sends a form and a
// loading line, thin to a crawler. The title, description and preview stay for a shared link.
const BASE: Metadata = {
  ...pageMetadata({
    title: "이번 주 행운 번호",
    description: "생년월일의 오행과 이번 주 카드로 고른 번호 6개를 재미로 봐요. 번호마다 왜 골랐는지 함께 알려 드리고, 번호는 한 주 동안 그대로예요.",
    path: "/lucky",
  }),
  robots: NOINDEX,
};

type LuckyProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

/** A shared link (?n=…&w=…) previews those numbers with their own image (owner 2026-10-23). */
export async function generateMetadata({ searchParams }: LuckyProps = {}): Promise<Metadata> {
  const query = (await searchParams) ?? {};
  const shared = parseLuckyShare(query.n, query.w);
  if (!shared) return BASE;
  const title = `친구의 이번 주 행운 번호 · ${shared.numbers.join(" ")}`;
  const image = { url: `/api/og/lucky?n=${shared.numbers.join("-")}&w=${shared.weekId}`, width: 1080, height: 1920, alt: title };
  return { ...BASE, title, openGraph: { ...BASE.openGraph, title, images: [image] }, twitter: { card: "summary_large_image", title, images: [image.url] } };
}

export default async function LuckyPage({ searchParams }: LuckyProps = {}) {
  if (!SITE.features.bonds) notFound();
  const query = (await searchParams) ?? {};
  const shared = parseLuckyShare(query.n, query.w);
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={45} />
      <TabBar />
      <main className={`page-col ${s.screen}`}>
        {shared ? (
          // What the friend shared, then the form for one's own numbers.
          <section className={s.shared} aria-labelledby="shared-lucky-title">
            <h2 id="shared-lucky-title" className={s.sharedTitle}>
              친구의 이번 주 행운 번호
            </h2>
            <p className={s.sharedWeek}>{luckyWeekLabel(shared.weekId)}</p>
            <ol className={s.balls} aria-label="친구의 번호">
              {shared.numbers.map((n) => (
                <li key={n} className={s.ball}>
                  {n}
                </li>
              ))}
            </ol>
            <p className={s.sharedNext}>내 생년월일로 내 번호도 골라 봐요.</p>
          </section>
        ) : null}
        <LuckyView />
      </main>
      <Footer />
    </div>
  );
}
