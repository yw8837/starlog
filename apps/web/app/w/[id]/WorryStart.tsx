"use client";

import { TEMPLATES } from "@starlog/core";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { clearFlow, saveFlow, summarizeFlow } from "@/lib/flowState";
import { findWorry, presetFlow, worryStart, type WorryId } from "@/lib/worries";
import s from "./worry.module.css";

/**
 * 이 풀이가 보는 것 for a tarot worry: the question the builder makes of its values (lib/flowState.ts summarizeFlow) and the
 * positions the cards are read in (packages/core TEMPLATES; 켈틱 크로스 10장's ten for a deep one). Rendered on the server
 * too: summarizeFlow is pure, only its module is the browser's.
 */
export function TarotLooks({ id }: { id: WorryId }) {
  const flow = presetFlow(findWorry(id)!);
  const { question, template } = summarizeFlow(flow)!;
  const positions = TEMPLATES[flow.spread === "deep" ? "deep-tarot" : template].positions;
  return (
    <>
      <p className={s.question}>{question}</p>
      <p className={s.note}>{`카드 ${positions.length}장을 이 자리에 놓고 읽어요`}</p>
      <ol className={s.items}>
        {positions.map((position) => (
          <li key={position}>{position}</li>
        ))}
      </ol>
    </>
  );
}

/**
 * The start (spec 2026-11-26 worry catalog §5.2, §12.2), named after the next screen's step. Tarot writes a new question with
 * the worry's values into the flow (no cards or note of an earlier one) and opens the situation step, where every value
 * can still be changed (a typed 무엇 goes on to the draw); saju opens the birth input on its topic; 궁합 its form. `open` is
 * the page's server answer (app/w/[id]/premiumWorry.tsx for the premium two; code review 2026-11-26 A1): false only for a
 * premium product visible but not yet on sale, which says 준비 중이에요. No status is read in the browser, so the button
 * never waits on one that could not be read, and nobody the server let in is sent away.
 */
export function WorryStart({ id, open = true }: { id: WorryId; open?: boolean }) {
  const router = useRouter();
  const worry = findWorry(id)!;
  const start = worryStart(worry);
  const label = open ? start.label : "준비 중이에요";
  if (worry.reading.kind === "tarot") {
    const begin = () => {
      clearFlow();
      saveFlow(presetFlow(worry));
      router.push(start.href);
    };
    return (
      <Button block trailing="→" onClick={begin} disabled={!open}>
        {label}
      </Button>
    );
  }
  return (
    <Button href={start.href} block trailing="→" disabled={!open}>
      {label}
    </Button>
  );
}
