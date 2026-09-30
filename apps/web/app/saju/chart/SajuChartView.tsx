"use client";

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
import { SITE } from "@/lib/config";
import type { SajuSample } from "@/lib/fixtures";
import { withFlags } from "@/lib/flowState";
import s from "./SajuChartView.module.css";

type SajuChartViewProps = {
  free: SajuSample["free"];
  visit: "first" | "returning";
  instant: boolean;
  wallet: Wallet;
};

/** Step 2/2: the chart computed from the saved input (or the sample), then the free prologue and the unlock sheet. */
export function SajuChartView({ free, visit, instant, wallet }: SajuChartViewProps) {
  const { form, ready, result } = useSajuChart();

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
              <h1 className={s.title}>나의 명식</h1>
              <InputLine form={ready ? form : null} className={s.input} />
            </div>
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        <Paper as="article" aria-labelledby="prologue-title">
          <p className={s.paperEyebrow}>프롤로그</p>
          <h2 id="prologue-title" className={s.paperTitle}>
            {free.title}
          </h2>
          <p className={s.prose}>{free.summary}</p>
          <footer className={s.signature}>
            <span aria-hidden="true">
              <Rabbit outfit="hanbok" size={52} expression="happy" reactOnTap={false} />
            </span>
            <span>풀이 · 토끼 선생님</span>
          </footer>
        </Paper>
        <LockedToc items={free.lockedToc} />
        <UnlockSheet
          visit={visit}
          wallet={wallet}
          loginHref={withFlags("/login?chapter=prologue", { instant })}
          openHref={withFlags("/chapter/prologue?from=unlock", { instant })}
          priceKrw={SITE.price.sajuStandardKrw}
        />
      </ReadingLayout>
    </>
  );
}
