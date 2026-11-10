import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/app/birth-card/BackLink";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { pageMetadata } from "@/lib/seo";
import { GradeView } from "./GradeView";
import s from "./grade.module.css";

export const metadata: Metadata = pageMetadata({
  title: "올해의 사주 등급 · 로그인 없이 무료",
  description:
    "올해 들어오는 세운이 내 명식의 다섯 기운을 얼마나 고르게 채우는지 정해진 규칙으로 계산한 등급 카드예요. 생일은 이 기기에서만 계산하고, 규칙은 모두 공개해요. 재미로 보는 계산이에요.",
  path: "/saju/grade",
});

/**
 * 올해의 사주 등급 (spec 2026-11-11 B, F C5): the card is computed in the browser (GradeView); the server's HTML is the
 * title, the lead and the link to the rule page. ?y= (a chip) is read on the device.
 */
export default function SajuGradePage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={26} />
      <main className={`page-col ${s.screen}`}>
        <BackLink href="/" label="홈으로" />
        <header className={s.intro}>
          <h1 className={s.title}>올해의 사주 등급</h1>
          <p className={s.lead}>
            로그인 없이 무료 · AI가 아니라 정해진 규칙으로 계산해요 · <Link href="/saju/grade/how">규칙 보기</Link>
          </p>
        </header>
        <GradeView />
      </main>
      <Footer />
    </div>
  );
}
