import { Button } from "@/components/ui/Button";
import { ChartCriteria } from "./ChartCriteria";
import { ChartTable } from "./ChartTable";
import { ElementBar } from "./ElementBar";
import type { ChartResult } from "./useSajuChart";
import s from "./ChartPanel.module.css";

/** Pillars, elements and the applied criteria for one computed chart (or why it could not be computed). */
export function ChartPanel({ result }: { result: ChartResult | null }) {
  let content;
  if (result && "chart" in result) {
    content = (
      <>
        <ChartTable chart={result.chart} title="네 기둥" />
        <ElementBar elements={result.chart.elements} />
        <ChartCriteria chart={result.chart} />
      </>
    );
  } else if (result) {
    content = (
      <div className={s.failed} role="alert">
        <p>{result.error.message}</p>
        <Button href="/saju/new" variant="secondary" size="md">
          입력 다시 보기
        </Button>
      </div>
    );
  } else {
    content = <div className={s.placeholder} aria-hidden="true" />;
  }
  return <div className={s.panel}>{content}</div>;
}
