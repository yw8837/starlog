"use client";

import type { ReactNode } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { useSajuChart } from "@/components/saju/useSajuChart";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { Stepper } from "@/components/tarot/Stepper";
import { UnlockSheet, type Wallet } from "@/components/tarot/UnlockSheet";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import type { SajuSample } from "@/lib/fixtures";
import { withFlags } from "@/lib/flowState";
import { SAJU_PROLOGUE_SECTIONS, composeChartTeaser } from "@/lib/sajuPrologue";
import s from "./SajuChartView.module.css";

type SajuChartViewProps = {
  free: SajuSample["free"];
  visit: "first" | "returning";
  instant: boolean;
  wallet: Wallet;
};

function Teaser({ eyebrow, title, text, signature }: { eyebrow: string; title: string; text: string; signature: string }) {
  return (
    <Paper as="article" aria-labelledby="prologue-title">
      <p className={s.paperEyebrow}>{eyebrow}</p>
      <h2 id="prologue-title" className={s.paperTitle}>
        {title}
      </h2>
      <p className={s.prose}>{text}</p>
      <footer className={s.signature}>
        <span aria-hidden="true">
          <Rabbit outfit="hanbok" size={52} expression="happy" reactOnTap={false} />
        </span>
        <span>{signature}</span>
      </footer>
    </Paper>
  );
}

/**
 * Step 2/2: the chart computed from the saved input, then the free prologue and the unlock sheet.
 * The written sample prologue is shown only for the sample chart; any other chart gets a teaser of
 * its own computed facts and the generic section list. With nothing saved, the sample is labelled
 * as an example and the one gold button asks for the user's own birth data instead of unlocking.
 */
export function SajuChartView({ free, visit, instant, wallet }: SajuChartViewProps) {
  const { form, ready, saved, result, isSample } = useSajuChart();
  const chart = result && "chart" in result ? result.chart : null;
  const example = ready && !saved;

  const unlock = (
    <UnlockSheet
      visit={visit}
      wallet={wallet}
      loginHref={withFlags("/login?chapter=prologue", { instant })}
      openHref={withFlags("/chapter/prologue?from=unlock", { instant })}
      priceKrw={SITE.price.sajuStandardKrw}
    />
  );

  let body: ReactNode = null;
  if (chart && example) {
    body = (
      <>
        <Teaser eyebrow="예시 프롤로그" title={free.title} text={free.summary} signature="풀이 · 토끼 선생님" />
        <LockedToc items={free.lockedToc} />
        <section className={s.cta} aria-labelledby="own-chart-title">
          <h2 id="own-chart-title" className={s.ctaTitle}>
            내 명식은 어떨까요?
          </h2>
          <p className={s.ctaText}>태어난 날을 넣으면 내 명식을 세우고, 나만의 프롤로그를 열 수 있어요.</p>
          <Button href="/saju/new" block trailing="→">
            태어난 날 입력하기
          </Button>
        </section>
      </>
    );
  } else if (chart && isSample) {
    body = (
      <>
        <Teaser eyebrow="프롤로그" title={free.title} text={free.summary} signature="풀이 · 토끼 선생님" />
        <LockedToc items={free.lockedToc} />
        {unlock}
      </>
    );
  } else if (chart) {
    body = (
      <>
        <Teaser eyebrow="프롤로그" title="명식에서 바로 보이는 것" text={composeChartTeaser(chart)} signature="정리 · 토끼 선생님" />
        <LockedToc items={[...SAJU_PROLOGUE_SECTIONS]} />
        {unlock}
      </>
    );
  }

  return (
    <>
      <Stepper step={2} total={2} label="명식 보기" backHref="/saju/new" backLabel="입력으로 돌아가기" />
      <ReadingLayout
        spreadLabel="명식"
        head={
          <header className={s.head}>
            <div className={s.cast}>
              <Rabbit outfit="hanbok" size={104} expression="focus" />
              <span className={s.assistant}>
                <Cat outfit="hanbok" size={64} />
              </span>
            </div>
            <div className={s.headText}>
              <p className={s.eyebrow}>사주 · 프롤로그</p>
              <h1 className={s.title}>{ready ? (saved ? "나의 명식" : "예시 명식") : " "}</h1>
              <InputLine form={ready ? form : null} className={s.input} />
            </div>
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        {body}
      </ReadingLayout>
    </>
  );
}
