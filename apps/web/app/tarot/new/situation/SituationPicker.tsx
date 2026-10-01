"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NOTE_MAX, summarizeFlow, useFlowState } from "@/lib/flowState";
import { notePlaceholder } from "@/lib/notePlaceholder";
import f from "../../flow.module.css";
import s from "./SituationPicker.module.css";

/**
 * Step 1b: situation chips for the chosen topic plus an optional one-line note. A topic the user
 * typed has no chips: only the note, with a topic-neutral example.
 */
export function SituationPicker() {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  const summary = summarizeFlow(flow);

  // A direct visit without a question goes back to the builder.
  useEffect(() => {
    if (flow && !summary) router.replace("/tarot/new");
  }, [flow, summary, router]);

  if (!flow || !summary) {
    return (
      <div className={f.screen}>
        <Stepper step={1} label="상황 고르기" backHref="/tarot/new" backLabel="질문 만들기로" />
      </div>
    );
  }

  const topic = summary.topic;
  // Any change drops cards dealt for the earlier situation (the draw page deals again).
  const toggle = (conditionId: string, option: string) =>
    setFlow((prev) => {
      const conditions = { ...prev.conditions };
      if (conditions[conditionId] === option) delete conditions[conditionId];
      else conditions[conditionId] = option;
      return { ...prev, conditions, draw: undefined };
    });

  return (
    <div className={f.screen}>
      <Stepper step={1} label="상황 고르기" backHref="/tarot/new" backLabel="질문 만들기로" />

      <div className={f.sentence}>
        <p className={f.sentenceText}>{summary.question}</p>
        {summary.quote ? <p className={f.sentenceQuote}>{`“${summary.quote}”`}</p> : null}
      </div>

      <div className={f.intro}>
        <h1 className={f.title}>{topic ? "지금 상황을 골라 주세요" : "지금 상황을 적어 주세요"}</h1>
        <p className={f.lead}>{topic ? "해당하는 것만 골라도 괜찮아요" : "적지 않아도 괜찮아요"}</p>
      </div>

      {topic?.conditions.map((condition) => (
        <section key={condition.id} className={f.group} aria-labelledby={`condition-${condition.id}`}>
          <h2 id={`condition-${condition.id}`} className={f.groupLabel}>
            {condition.label}
          </h2>
          <div className={f.chips}>
            {condition.options.map((option) => (
              <Chip key={option} selected={flow.conditions[condition.id] === option} onClick={() => toggle(condition.id, option)}>
                {option}
              </Chip>
            ))}
          </div>
        </section>
      ))}

      <section className={f.group}>
        <label htmlFor="situation-note" className={f.groupLabel}>
          한 줄 메모 <span className={s.optional}>(선택)</span>
        </label>
        <textarea
          id="situation-note"
          className={s.note}
          rows={2}
          maxLength={NOTE_MAX}
          value={flow.note}
          onChange={(e) => setFlow((prev) => ({ ...prev, note: e.target.value, draw: undefined }))}
          placeholder={notePlaceholder(topic?.id)}
          aria-describedby="situation-note-count"
        />
        <p id="situation-note-count" className={s.counter}>
          {flow.note.length}/{NOTE_MAX}
        </p>
      </section>

      <div className={f.footer}>
        <Button block onClick={() => router.push("/tarot/draw")} trailing="→">
          카드 뽑기
        </Button>
      </div>
    </div>
  );
}
