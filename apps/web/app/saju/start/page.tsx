import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { TopicPicker } from "@/components/saju/TopicPicker";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { sajuStartsWithTopic } from "@/lib/sajuTopics";
import s from "../saju.module.css";

// A step of the flow, not a page to land on from search: /saju/new keeps the guide and the index.
export const metadata: Metadata = { title: "사주 보기 · 무엇이 궁금해요?", robots: { index: false, follow: true } };

/** Saju step 1 of 3 (owner 2026-10-14): what to read, then the birth input, then the chart. */
export default function SajuStartPage() {
  if (!sajuStartsWithTopic()) redirect("/saju/new?new=1");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <div className={s.inputScreen}>
          <div className={s.stepper}>
            <Stepper step={1} total={3} label="사주 보기" backHref="/" backLabel="홈으로" />
          </div>

          <header className={s.greeting}>
            <SpeechBubble as="h1">무엇이 궁금해요?</SpeechBubble>
            <div className={s.cast}>
              <Rabbit outfit="hanbok" size={148} />
              <span className={s.assistant}>
                <Cat outfit="hanbok" size={92} />
              </span>
            </div>
          </header>

          <div className={s.formCol}>
            <TopicPicker />
            {/* the free grade card (spec 2026-11-11 B, 들어오는 곳 2): small, under the topics */}
            <p className={s.gradeLink}>
              <Link href="/saju/grade">올해 내 사주 등급은? · 로그인 없이 무료</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
