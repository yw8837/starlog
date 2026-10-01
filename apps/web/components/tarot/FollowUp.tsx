"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import type { ErrorView } from "@/lib/reading/errors";
import s from "./FollowUp.module.css";

export type AskResult = { answer: string } | { error: ErrorView };

type FollowUpProps = {
  /** Suggested questions (the reading's own). Ones already asked are left out. */
  suggestions: string[];
  /** Questions answered so far (a saved reading keeps them). */
  turns: Array<{ question: string; answer: string }>;
  /** Questions still allowed for this reading. */
  remaining: number;
  /** Sends the question; the caller stores the answer and passes the new `turns` and `remaining`. */
  onAsk: (question: string) => Promise<AskResult>;
  /** A question sent before this view mounted that is still being answered: shown as pending. */
  awaiting?: { question: string; done: Promise<AskResult> };
  /** Shown instead of the form when no question can be asked for a reason other than using them all. */
  endedText?: string;
  /** Who answers: the cat astrologer (tarot) or the rabbit in hanbok (saju). */
  reader?: "cat" | "rabbit";
};

const MAX_LENGTH = 120;

/** Follow-up questions on an opened reading. Only an answered question uses up a turn. */
export function FollowUp({ suggestions, turns, remaining, onAsk, awaiting, endedText, reader = "cat" }: FollowUpProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(awaiting?.question ?? null);
  const [error, setError] = useState<ErrorView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A question from an earlier visit to this page: wait for its answer like one sent here.
  const awaitingDone = awaiting?.done;
  useEffect(() => {
    if (!awaitingDone) return;
    void awaitingDone.then((result) => {
      if (!mounted.current) return;
      setPending(null);
      if ("error" in result) setError(result.error);
    });
  }, [awaitingDone]);

  // The last answer replaces the form; if focus was in it, hand it to the closing line instead of the page.
  useEffect(() => {
    if (remaining === 0 && (document.activeElement === document.body || document.activeElement === null)) doneRef.current?.focus();
  }, [remaining]);

  const asked = new Set(turns.map((turn) => turn.question));
  if (pending) asked.add(pending);
  const openSuggestions = suggestions.filter((q) => !asked.has(q));
  const canAsk = remaining > 0 && pending === null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || !canAsk) return;
    setPending(text);
    setError(null);
    setDraft("");
    // A keyboard user's chip or send button goes away or turns inactive; keep their place in the
    // form. A tap never matches :focus-visible, so this never pops up the phone keyboard.
    const used = document.activeElement;
    if (used !== inputRef.current && used instanceof HTMLElement && used.matches(":focus-visible")) inputRef.current?.focus();
    const result = await onAsk(text);
    if (!mounted.current) return;
    setPending(null);
    if ("error" in result) {
      setError(result.error);
      // Nothing was used up: the question comes back to the field to send again.
      if (!suggestions.includes(text)) setDraft(text);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const shown = pending ? [...turns, { question: pending, answer: "" }] : turns;

  return (
    <section className={s.box} aria-labelledby="follow-up-title">
      <h2 id="follow-up-title" className={s.title}>
        이어서 물어보기
        <span className={s.count}>{remaining > 0 ? ` · ${remaining}번 남았어요` : endedText ? "" : " · 모두 물어봤어요"}</span>
      </h2>

      {/* Answers and what went wrong are announced here; the list is always present. */}
      <div aria-live="polite">
        {shown.length > 0 ? (
          <ol className={s.thread}>
            {shown.map((turn, i) => (
              <li key={i} className={s.turn}>
                <p className={s.question}>{turn.question}</p>
                <div className={s.reply}>
                  <span className={s.avatar} aria-hidden="true">
                    {reader === "cat" ? (
                      <Cat outfit="tarot" size={44} expression={turn.answer ? "happy" : "focus"} reactOnTap={false} />
                    ) : (
                      <Rabbit outfit="hanbok" size={44} expression={turn.answer ? "happy" : "focus"} reactOnTap={false} />
                    )}
                  </span>
                  {turn.answer ? (
                    <p className={s.answer}>{turn.answer}</p>
                  ) : (
                    <p className={s.typing}>
                      <span className="sr-only">답을 적는 중이에요</span>
                      <span className={s.dot} aria-hidden="true" />
                      <span className={s.dot} aria-hidden="true" />
                      <span className={s.dot} aria-hidden="true" />
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        {error ? (
          <p className={s.error}>
            {error.title}
            {error.body ? ` ${error.body}` : ""}
          </p>
        ) : null}
        {error?.care ? <CrisisContacts lead={false} /> : null}
      </div>

      {canAsk && openSuggestions.length > 0 ? (
        <div className={s.suggestions}>
          {openSuggestions.map((q) => (
            <Chip key={q} onClick={() => void ask(q)}>
              {q}
            </Chip>
          ))}
        </div>
      ) : null}

      {remaining > 0 ? (
        <form className={s.form} onSubmit={onSubmit}>
          {/* While an answer is on its way the field is read-only, not disabled, so it keeps focus. */}
          <input
            ref={inputRef}
            className={s.input}
            type="text"
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="더 궁금한 걸 적어 주세요"
            aria-label="이어서 물어볼 내용"
            readOnly={pending !== null}
            aria-disabled={pending !== null || undefined}
            enterKeyHint="send"
          />
          <Button type="submit" variant="secondary" size="md" disabled={!canAsk || !draft.trim()}>
            보내기
          </Button>
        </form>
      ) : (
        <p ref={doneRef} className={s.done} tabIndex={-1}>
          {endedText ?? "이 풀이에서 물어볼 수 있는 질문을 모두 썼어요"}
        </p>
      )}
    </section>
  );
}
