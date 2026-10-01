import type { Metadata } from "next";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { SajuForm } from "@/components/saju/SajuForm";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { pageMetadata } from "@/lib/seo";
import s from "../saju.module.css";

export const metadata: Metadata = pageMetadata({
  title: "사주 보기 · 만세력으로 세운 내 명식 풀이",
  description: "태어난 날과 시, 태어난 곳으로 만세력에 따라 사주 명식을 세우고, 타고난 결과 지금 지나는 10년의 흐름을 읽어요. 태어난 시를 몰라도 세 기둥으로 볼 수 있어요.",
  path: "/saju/new",
});

export default function SajuNewPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={11} />
      <main className="page-col page-wide">
        <div className={s.inputScreen}>
          <div className={s.stepper}>
            <Stepper step={1} total={2} label="사주 보기" backHref="/" backLabel="홈으로" />
          </div>

          <header className={s.greeting}>
            <SpeechBubble as="h1">태어난 날을 알려주세요</SpeechBubble>
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
      </main>
    </div>
  );
}
