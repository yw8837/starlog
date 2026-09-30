"use client";

import { useRouter } from "next/navigation";
import { TOPICS_BY_WHO, composeQuestion, type When, type Who } from "@starlog/core";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EMPTY_FLOW, WHEN_OPTIONS, WHO_OPTIONS, allowedWhens, findTopic, useFlowState } from "@/lib/flowState";
import f from "../flow.module.css";

/** Step 1a: build the question from 누구 × 무엇 × 언제. Picking 누구 narrows the topics. */
export function QuestionBuilder() {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  const state = flow ?? EMPTY_FLOW;
  const topic = findTopic(state.who, state.topicId);
  const whens = allowedWhens(topic);
  const question = state.who && topic && state.when ? composeQuestion(state.who, topic, state.when) : null;

  const pickWho = (who: Who) =>
    setFlow((prev) => (prev.who === who ? prev : { ...prev, who, topicId: undefined, conditions: {} }));

  const pickTopic = (topicId: string) =>
    setFlow((prev) => {
      if (prev.topicId === topicId) return prev;
      const next = findTopic(prev.who, topicId);
      const nextWhens = allowedWhens(next);
      // A topic with a single allowed time (오늘의 운) picks it for the user.
      const when = nextWhens.length === 1 ? nextWhens[0] : prev.when && nextWhens.includes(prev.when) ? prev.when : undefined;
      return { ...prev, topicId, when, conditions: {} };
    });

  const pickWhen = (when: When) => setFlow((prev) => ({ ...prev, when }));

  return (
    <div className={f.screen}>
      <Stepper step={1} label="질문 만들기" backHref="/" backLabel="홈으로" />

      <div className={f.intro}>
        <h1 className={f.title}>어떤 이야기를 볼까요?</h1>
      </div>

      <div className={f.sentence} aria-live="polite">
        {question ? (
          <p className={f.sentenceText}>{question}</p>
        ) : (
          <p className={f.sentencePlaceholder}>누구, 무엇, 언제를 고르면 질문이 완성돼요</p>
        )}
      </div>

      <section className={f.group} aria-labelledby="who-label">
        <h2 id="who-label" className={f.groupLabel}>
          누구
        </h2>
        <div className={f.chips}>
          {WHO_OPTIONS.map((option) => (
            <Chip key={option.value} selected={state.who === option.value} onClick={() => pickWho(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className={f.group} aria-labelledby="what-label">
        <h2 id="what-label" className={f.groupLabel}>
          무엇
        </h2>
        {state.who ? (
          <div className={f.chips}>
            {TOPICS_BY_WHO[state.who].map((option) => (
              <Chip key={option.id} selected={state.topicId === option.id} onClick={() => pickTopic(option.id)}>
                {option.ko}
              </Chip>
            ))}
          </div>
        ) : (
          <p className={f.groupHint}>누구를 먼저 고르면 맞는 주제가 보여요</p>
        )}
      </section>

      <section className={f.group} aria-labelledby="when-label">
        <h2 id="when-label" className={f.groupLabel}>
          언제
        </h2>
        <div className={f.chips}>
          {WHEN_OPTIONS.filter((option) => whens.includes(option.value)).map((option) => (
            <Chip key={option.value} selected={state.when === option.value} onClick={() => pickWhen(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <div className={f.footer}>
        <Button block disabled={!question} onClick={() => router.push("/tarot/new/situation")} trailing="→">
          다음
        </Button>
      </div>
    </div>
  );
}
