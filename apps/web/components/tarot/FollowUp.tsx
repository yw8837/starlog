"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SITE } from "@/lib/config";
import s from "./FollowUp.module.css";

type FollowUpProps = {
  suggestions: string[];
  /** P1 fixture: every question gets this answer. */
  answer: string;
  total?: number;
  /** Fixture latency before the answer shows. */
  delayMs?: number;
  /** Who answers: the cat astrologer (tarot) or the rabbit in hanbok (saju). */
  reader?: "cat" | "rabbit";
};

type Turn = { id: number; question: string; answer?: string };

const MAX_LENGTH = 120;

/** Follow-up questions on an opened reading. Only an answered question uses up a turn. */
export function FollowUp({ suggestions, answer, total = SITE.reading.followUps, delayMs = 1000, reader = "cat" }: FollowUpProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const answered = turns.filter((turn) => turn.answer !== undefined).length;
  const remaining = total - answered;
  const pending = turns.some((turn) => turn.answer === undefined);
  const asked = new Set(turns.map((turn) => turn.question));
  const openSuggestions = suggestions.filter((q) => !asked.has(q));
  const canAsk = remaining > 0 && !pending;

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || !canAsk) return;
    const id = turns.length + 1;
    setTurns((prev) => [...prev, { id, question: text }]);
    setDraft("");
    timer.current = window.setTimeout(() => {
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    }, delayMs);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <section className={s.box} aria-labelledby="follow-up-title">
      <h2 id="follow-up-title" className={s.title}>
        이어서 물어보기
        <span className={s.count}>{remaining > 0 ? ` · ${remaining}번 남았어요` : " · 모두 물어봤어요"}</span>
      </h2>

      {turns.length > 0 ? (
        <ol className={s.thread} aria-live="polite">
          {turns.map((turn) => (
            <li key={turn.id} className={s.turn}>
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
                    <span className={s.srOnly}>답을 적는 중이에요</span>
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

      {canAsk && openSuggestions.length > 0 ? (
        <div className={s.suggestions}>
          {openSuggestions.map((q) => (
            <Chip key={q} onClick={() => ask(q)}>
              {q}
            </Chip>
          ))}
        </div>
      ) : null}

      {remaining > 0 ? (
        <form className={s.form} onSubmit={onSubmit}>
          <input
            className={s.input}
            type="text"
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="더 궁금한 걸 적어 주세요"
            aria-label="이어서 물어볼 내용"
            disabled={pending}
            enterKeyHint="send"
          />
          <Button type="submit" variant="secondary" size="md" disabled={!canAsk || !draft.trim()}>
            보내기
          </Button>
        </form>
      ) : (
        <p className={s.done}>이 풀이에서 물어볼 수 있는 질문을 모두 썼어요</p>
      )}
    </section>
  );
}
