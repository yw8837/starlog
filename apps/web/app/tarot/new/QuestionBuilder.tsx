"use client";

import { useRouter } from "next/navigation";
import type { When, Who } from "@starlog/core";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CustomField } from "@/components/ui/CustomField";
import { EMPTY_FLOW, WHEN_OPTIONS, WHO_OPTIONS, allowedWhens, builderTopics, findTopic, summarizeFlow, useFlowState, useFreshFlowOnEntry, type FlowState } from "@/lib/flowState";
import { CUSTOM_MAX, WHO_MAX } from "@/lib/question";
import f from "../flow.module.css";

/** An example that fits the 누구 chip (나 has no detail field). */
const WHO_DETAIL_EXAMPLE: Readonly<Record<Exclude<Who, "me">, string>> = {
  us: "예: 엄마, 팀장님, 전 남친",
  work: "예: 우리 팀, 새 프로젝트, 첫 직장",
  group: "예: 대학 동기, 독서 모임, 가족",
};

/**
 * Step 1a: build the question from 누구 × 무엇 × 언제. Picking 누구 narrows the topics. Under each
 * chip group an optional field takes the user's own words: 누구 adds detail (the chip still picks
 * the spread); 무엇 and 언제 replace their chip (typing clears the chip, a chip clears the text).
 * 무엇 and 언제 chips toggle off on a second tap; 누구 is always one of four.
 */
export function QuestionBuilder() {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  // Answers stay only on a move inside the flow; a refresh or an entry from elsewhere starts clean.
  useFreshFlowOnEntry();
  const state = flow ?? EMPTY_FLOW;
  const topic = findTopic(state.who, state.topicId);
  const whens = allowedWhens(topic);
  const summary = summarizeFlow(flow);
  const question = summary?.question ?? null;

  // Any change to the question drops cards dealt for an earlier one (tapping the chip already
  // chosen changes nothing, so the draw stays).
  const update = (change: (prev: FlowState) => FlowState) =>
    setFlow((prev) => {
      const next = change(prev);
      return next === prev ? prev : { ...next, draw: undefined };
    });

  const pickWho = (who: Who) => update((prev) => (prev.who === who ? prev : { ...prev, who, topicId: undefined, conditions: {} }));

  const pickTopic = (topicId: string) =>
    update((prev) => {
      // The chip already chosen: a second tap takes it back.
      if (prev.topicId === topicId && !prev.topicText) return { ...prev, topicId: undefined, conditions: {} };
      const next = findTopic(prev.who, topicId);
      const nextWhens = allowedWhens(next);
      const when = prev.when && nextWhens.includes(prev.when) ? prev.when : undefined;
      return { ...prev, topicId, topicText: undefined, when, conditions: {} };
    });

  const pickWhen = (when: When) =>
    update((prev) => (prev.when === when && !prev.whenText ? { ...prev, when: undefined } : { ...prev, when, whenText: undefined }));

  return (
    <div className={f.screen}>
      <Stepper step={1} label="질문 만들기" backHref="/" backLabel="홈으로" />

      <div className={f.intro}>
        <h1 className={f.title}>어떤 이야기를 볼까요?</h1>
      </div>

      <div className={f.sentence} aria-live="polite">
        {question ? (
          <>
            <p className={f.sentenceText}>{question}</p>
            {summary?.quote ? <p className={f.sentenceQuote}>{`“${summary.quote}”`}</p> : null}
          </>
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
        {/* 나 needs no detail; for anyone else a name or role makes the reading specific. A short
            one goes into the question; anything else only reaches the reading (lib/question.ts). */}
        {state.who && state.who !== "me" ? (
          <CustomField
            label="구체적으로 적기 (선택)"
            showLabel
            placeholder={WHO_DETAIL_EXAMPLE[state.who]}
            value={state.whoText ?? ""}
            maxLength={WHO_MAX}
            onChange={(whoText) => update((prev) => ({ ...prev, whoText }))}
          />
        ) : null}
      </section>

      <section className={f.group} aria-labelledby="what-label">
        <h2 id="what-label" className={f.groupLabel}>
          무엇
        </h2>
        {state.who ? (
          <>
            <div className={f.chips}>
              {builderTopics(state.who).map((option) => (
                <Chip key={option.id} selected={!state.topicText && state.topicId === option.id} onClick={() => pickTopic(option.id)}>
                  {option.ko}
                </Chip>
              ))}
            </div>
            <CustomField
              label="무엇을 볼지 직접 쓰기"
              placeholder="직접 쓰기 (예: 창업 준비, 전세 계약)"
              value={state.topicText ?? ""}
              maxLength={CUSTOM_MAX}
              onChange={(topicText) => update((prev) => ({ ...prev, topicText, ...(topicText.trim() ? { topicId: undefined, conditions: {} } : {}) }))}
            />
          </>
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
            <Chip key={option.value} selected={!state.whenText && state.when === option.value} onClick={() => pickWhen(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
        <CustomField
          label="언제인지 직접 쓰기"
          placeholder="직접 쓰기 (예: 다음 주 금요일 면접)"
          value={state.whenText ?? ""}
          maxLength={CUSTOM_MAX}
          onChange={(whenText) => update((prev) => ({ ...prev, whenText, ...(whenText.trim() ? { when: undefined } : {}) }))}
        />
      </section>

      <div className={f.footer}>
        <Button block disabled={!question} onClick={() => router.push("/tarot/new/situation")} trailing="→">
          다음
        </Button>
      </div>
    </div>
  );
}
