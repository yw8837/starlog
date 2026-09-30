"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cat } from "@/components/characters/Cat";
import { CardFan } from "@/components/tarot/CardFan";
import { Paper } from "@/components/tarot/Paper";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { SITE } from "@/lib/config";
import type { INVITE_FIXTURE } from "@/lib/fixtures";
import { prefersReducedMotion } from "@/lib/motion";
import s from "./InviteFlow.module.css";

type Phase = "intro" | "shuffle" | "pick" | "result" | "sent";

type InviteFlowProps = {
  invite: typeof INVITE_FIXTURE;
  /** Skip the shuffle and the flip delays (tests). */
  instant: boolean;
};

const NAME_MAX = 12;
const MESSAGE_MAX = 40;
const PICK_HOLD_MS = 450;

/**
 * A friend's visit, no sign-in: pick one card from a small fan, read a short result of their own,
 * then optionally leave the card (and a line) for the inviter, who approves it before it joins the story.
 */
export function InviteFlow({ invite, instant }: InviteFlowProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [picked, setPicked] = useState<number[]>([]);
  const [faceUp, setFaceUp] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const inviter = `${invite.inviter}님`;
  const { card } = invite;

  // Picked: hold the lifted card a beat, then show it face down and turn it over.
  useEffect(() => {
    if (phase !== "pick" || picked.length === 0) return;
    const timer = window.setTimeout(() => setPhase("result"), instant ? 0 : PICK_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, picked, instant]);

  useEffect(() => {
    if (phase !== "result" || faceUp) return;
    const quick = instant || prefersReducedMotion();
    const timer = window.setTimeout(() => setFaceUp(true), quick ? 0 : 350);
    return () => window.clearTimeout(timer);
  }, [phase, faceUp, instant]);

  const start = () => setPhase(instant ? "pick" : "shuffle");

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    setPhase("sent");
    window.scrollTo(0, 0);
  };

  const bubble =
    phase === "intro"
      ? `${inviter}이 이야기에 한 장 부탁했어요`
      : phase === "pick"
        ? "마음이 가는 카드를 한 장 골라 주세요"
        : phase === "sent"
          ? `${inviter} 이야기에 남겼어요`
          : null;

  return (
    <div className={s.flow}>
      <header className={s.bar}>
        <span className={s.wordmark}>{SITE.name}</span>
        <span className={s.guest}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          로그인 없이 보는 중
        </span>
      </header>

      {bubble ? (
        <div className={s.greeting}>
          <SpeechBubble as="h1" key={phase}>
            {bubble}
          </SpeechBubble>
          <Cat
            outfit="tarot"
            size={phase === "intro" ? 176 : phase === "pick" ? 120 : 150}
            expression={phase === "sent" ? "happy" : phase === "pick" ? "focus" : "idle"}
          />
        </div>
      ) : null}

      {phase === "intro" ? (
        <section className={s.intro} aria-label="카드 한 장 뽑기 안내">
          <ul className={s.explain}>
            <li>
              <span className={s.explainIcon} aria-hidden="true">
                1
              </span>
              카드 한 장을 뽑으면 나를 위한 짧은 풀이를 받아요.
            </li>
            <li>
              <span className={s.explainIcon} aria-hidden="true">
                2
              </span>
              {`남긴 카드는 ${inviter}이 확인한 뒤 이야기에 들어가요.`}
            </li>
          </ul>
          <Button block onClick={start}>
            카드 한 장 뽑기
          </Button>
        </section>
      ) : null}

      {phase === "shuffle" ? (
        <div className={`${s.stage} ${s.stageAlone}`}>
          <ShuffleStage onDone={() => setPhase("pick")} />
        </div>
      ) : null}

      {phase === "pick" ? (
        <div className={s.stage}>
          <CardFan visible={7} max={1} picked={picked} onPick={(index) => setPicked((prev) => (prev.length ? prev : [index]))} />
        </div>
      ) : null}

      {phase === "result" ? (
        <div className={s.result}>
          <div className={s.reveal}>
            <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp={faceUp} size="lg" className={s.revealCard} label={`${card.name} 카드`} />
          </div>

          {faceUp ? (
            <>
              <Paper as="article" className={s.reading} aria-labelledby="friend-result-title">
                <p className={s.readingEyebrow}>나를 위한 한 장</p>
                <h1 id="friend-result-title" className={s.readingTitle}>
                  <span className={s.readingNumber}>{card.number}</span>
                  {card.name}
                  <span className={s.readingOrientation}>{card.orientation === "reversed" ? " · 역방향" : " · 정방향"}</span>
                </h1>
                <p className={s.readingText}>{invite.result}</p>
              </Paper>

              <form className={s.leave} onSubmit={send} noValidate>
                <h2 className={s.leaveTitle}>{`${inviter}에게 이 카드 남기기`}</h2>
                <label className={s.field}>
                  <span className={s.fieldLabel}>
                    {`${inviter}에게 보일 이름`}
                    <span className={s.requiredHint}> (필수)</span>
                  </span>
                  <input
                    ref={nameRef}
                    className={s.input}
                    value={name}
                    maxLength={NAME_MAX}
                    autoComplete="nickname"
                    aria-required="true"
                    onChange={(e) => {
                      setName(e.target.value);
                      if (e.target.value.trim()) setNameError(false);
                    }}
                    aria-invalid={nameError}
                    aria-describedby={nameError ? "name-error" : undefined}
                  />
                </label>
                {nameError ? (
                  <p id="name-error" className={s.error} role="alert">
                    {`${inviter}에게 보일 이름을 적어 주세요.`}
                  </p>
                ) : null}
                <label className={s.field}>
                  <span className={s.fieldLabel}>{`${inviter}에게 한마디 남기기 (선택)`}</span>
                  <input className={s.input} value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} />
                </label>
                <p className={s.note}>{`남긴 카드는 ${inviter}이 확인한 뒤 이야기에 들어가요. ${inviter}에게는 이름과 카드, 남긴 말만 보여요.`}</p>
                <Button type="submit" block>
                  {`${inviter} 이야기에 남기기`}
                </Button>
              </form>

              <Button href="/?visit=first" variant="secondary" block>
                {`나도 내 ${SITE.nameKo} 시작하기`}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {phase === "sent" ? (
        <section className={s.sent} aria-label="남긴 카드">
          <p className={s.sentText}>{`${inviter}이 확인하면 ${inviter}의 이야기에 들어가요.`}</p>
          <Button href="/?visit=first" block trailing="→">
            {`나도 내 ${SITE.nameKo} 시작하기`}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
