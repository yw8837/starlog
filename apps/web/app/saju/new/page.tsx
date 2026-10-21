import type { Metadata } from "next";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { SajuForm } from "@/components/saju/SajuForm";
import { JsonLd } from "@/components/seo/JsonLd";
import { SajuGuide } from "@/components/seo/toolGuides";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { standardProductJsonLd } from "@/lib/jsonld";
import { sajuStartsWithTopic } from "@/lib/sajuTopics";
import { pageMetadata } from "@/lib/seo";
import s from "../saju.module.css";

const DESCRIPTION = "태어난 날과 시, 태어난 곳으로 만세력에 따라 사주 명식을 세우고, 타고난 결과 지금 지나는 10년의 흐름을 읽어요. 태어난 시를 몰라도 세 기둥으로 볼 수 있어요.";

export const metadata: Metadata = pageMetadata({ title: "사주 보기 · 만세력으로 세운 내 명식 풀이", description: DESCRIPTION, path: "/saju/new" });

/** The birth input: step 2 of 3 after the topic step (/saju/start), or step 1 of 2 with the topics off. */
export default function SajuNewPage() {
  const topicFirst = sajuStartsWithTopic();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <JsonLd data={standardProductJsonLd("saju", DESCRIPTION)} />
        <div className={s.inputScreen}>
          <div className={s.stepper}>
            {topicFirst ? (
              <Stepper step={2} total={3} label="사주 보기" backHref="/saju/start" backLabel="주제 고르기로 돌아가기" />
            ) : (
              <Stepper step={1} total={2} label="사주 보기" backHref="/" backLabel="홈으로" />
            )}
          </div>

          <header className={s.greeting}>
            <SpeechBubble as="h1">태어난 날을 알려 주면 사주를 봐 드릴게요</SpeechBubble>
            <div className={s.cast}>
              <Rabbit outfit="hanbok" size={148} />
              <span className={s.assistant}>
                <Cat outfit="hanbok" size={92} />
              </span>
            </div>
          </header>

          <div className={s.formCol}>
            <SajuForm />
          </div>
        </div>
        <SajuGuide />
      </main>
    </div>
  );
}
