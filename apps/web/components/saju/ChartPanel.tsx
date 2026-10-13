import { Button } from "@/components/ui/Button";
import { gaeunLine, scarceElements } from "@/lib/sajuEnrichment";
import { ChartCriteria } from "./ChartCriteria";
import { ChartTable } from "./ChartTable";
import { ElementBar } from "./ElementBar";
import { NameChips } from "./NameChips";
import type { ChartResult } from "./useSajuChart";
import s from "./ChartPanel.module.css";

/** Pillars, the names they carry, elements with the 개운 line, and the applied criteria for one computed chart (or why it could not be computed). */
export function ChartPanel({ result }: { result: ChartResult | null }) {
  let content;
  if (result && "chart" in result) {
    content = (
      <>
        <ChartTable chart={result.chart} title="네 기둥" />
        {/* keyed by the birth data, so an open chip closes when another chart comes in */}
        <NameChips key={JSON.stringify(result.chart.input)} chart={result.chart} />
        <ElementBar elements={result.chart.elements} note={gaeunLine(scarceElements(result.chart))} />
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
