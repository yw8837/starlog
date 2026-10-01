"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { getCard, getConstellation, type BondPart, type Orientation, type SignId } from "@starlog/core";
import { BIRTH_MISSING, BirthFields, EMPTY_BIRTH, birthBody, type BirthValue } from "@/components/bonds/BirthFields";
import { CodeEntry } from "@/components/bonds/CodeEntry";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { Cat } from "@/components/characters/Cat";
import { CardFan, fanIndexes } from "@/components/tarot/CardFan";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { bondsApi, bondsMessage } from "@/lib/bonds/client";
import { MESSAGE_MAX, NICKNAME_MAX, NICKNAME_MIN } from "@/lib/bonds/text";
import type { InviteState } from "./loadInvite";
import b from "@/components/bonds/bonds.module.css";
import s from "./JoinFlow.module.css";

type Open = Extract<InviteState, { status: "open" }>;
type Phase = "form" | "shuffle" | "pick" | "message" | "result";

interface JoinResult {
  nickname: string;
  score: number;
  parts: BondPart[];
  completed: boolean;
  sign: SignId;
  slot: number;
  ownerNickname: string;
  card: { cardId: string; orientation: Orientation };
  bondLine: string;
}

const FAN = fanIndexes(78, 21);

/**
 * The friend's side (spec §3 친구, no account): whose constellation this is, then nickname → birth date
 * → a card from the shuffled fan → an optional one-line message, and the result: the 인연 score with
 * its reasons, the 인연 카드 and its line. The birth date only travels in the join request.
 */
export function JoinFlow({ state }: { state: InviteState }) {
  if (state.status === "open") return <OpenInvite invite={state} />;
  return (
    <section className={s.closed}>
      <Cat outfit="tarot" expression={state.status === "choosing" ? "focus" : "surprise"} size={120} reactOnTap={false} />
      <h1 className={s.title}>
        {state.status === "choosing"
          ? `${state.ownerNickname}님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요`
          : state.status === "limited"
            ? "코드 확인이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요"
            : state.status === "error"
              ? "지금은 초대를 열 수 없어요. 잠시 뒤에 다시 시도해 주세요"
              : "코드를 다시 확인해 주세요"}
      </h1>
      {state.status === "bad" ? (
        <div className={`${b.panel} ${s.entry}`}>
          <CodeEntry id="retry-code" />
        </div>
      ) : null}
      <Button href="/bonds" variant="secondary" block>
        나도 내 별자리 만들기
      </Button>
    </section>
  );
}

function OpenInvite({ invite }: { invite: Open }) {
  const def = getConstellation(invite.sign);
  const [phase, setPhase] = useState<Phase>("form");
  const [nickname, setNickname] = useState("");
  const [birth, setBirth] = useState<BirthValue>(EMPTY_BIRTH);
  const [consent, setConsent] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ nickname?: string; birth?: string; consent?: string; message?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const drawRef = useRef<HTMLElement>(null);

  // The form may have been scrolled far down: bring the shuffle and the fan into view.
  useEffect(() => {
    if (phase !== "shuffle") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    drawRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [phase]);

  useEffect(() => {
    if (phase === "result") resultRef.current?.focus();
  }, [phase]);

  const next = (e: FormEvent) => {
    e.preventDefault();
    const length = Array.from(nickname.trim()).length;
    const found: typeof errors = {};
    if (length < NICKNAME_MIN || length > NICKNAME_MAX) found.nickname = `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 지어 주세요`;
    if (!birthBody(birth)) found.birth = BIRTH_MISSING;
    if (!consent) found.consent = "확인에 체크해 주세요";
    setErrors(found);
    if (Object.keys(found).length === 0) setPhase("shuffle");
  };

  const submit = async () => {
    const birthDate = birthBody(birth);
    if (pick === null || !birthDate) return;
    setBusy(true);
    setErrors({});
    const res = await bondsApi<JoinResult>("join", {
      code: invite.code,
      nickname: nickname.trim(),
      birth: birthDate,
      pick,
      message: message.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      const text = bondsMessage(res);
      if (res.field === "nickname" || res.field === "birth") {
        setErrors({ [res.field]: text });
        setPhase("form");
      } else if (res.field === "message") setErrors({ message: text });
      else setErrors({ form: text });
      return;
    }
    const { ok: _ok, ...joined } = res;
    // The birth date and the rest of the form are not kept once the star is in.
    setBirth(EMPTY_BIRTH);
    setMessage("");
    setResult(joined as JoinResult);
    setPhase("result");
  };

  if (phase === "result" && result) return <Result result={result} headingRef={resultRef} />;

  return (
    <>
      <header className={s.head}>
        <ConstellationArt sign={def.id} lit={invite.filled} size={200} className={s.headArt} />
        <h1 className={s.title}>
          {invite.ownerNickname}님의 {def.ko}에 별이 되어 주세요
        </h1>
        <p className={s.progress}>
          <strong>
            {invite.filled}/{def.slots}
          </strong>{" "}
          · 들어온 순서대로 다음 칸의 별이 돼요
        </p>
      </header>

      {phase === "form" ? (
        <form className={`${b.panel} ${b.form}`} onSubmit={next} noValidate>
          <div className={b.group}>
            <div className={b.labelRow}>
              <label htmlFor="friend-nickname" className={b.label}>
                닉네임
              </label>
              <span className={b.count} aria-hidden="true">
                {Array.from(nickname).length}/{NICKNAME_MAX}
              </span>
            </div>
            <input
              id="friend-nickname"
              className={b.input}
              value={nickname}
              maxLength={NICKNAME_MAX + 4}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 하늘"
              autoComplete="nickname"
              aria-invalid={Boolean(errors.nickname)}
              aria-describedby="friend-nickname-help"
            />
            <p id="friend-nickname-help" className={b.helper}>
              {invite.ownerNickname}님이 별자리를 공유하면 이 닉네임이 이미지에 보여요
            </p>
            {errors.nickname ? (
              <p className={b.error} role="alert">
                {errors.nickname}
              </p>
            ) : null}
          </div>
          <BirthFields
            id="friend-birth"
            value={birth}
            onChange={setBirth}
            error={errors.birth}
            helper="두 사람의 인연 점수를 계산하는 데만 쓰고 저장하지 않아요. 태어난 시간은 쓰지 않아요."
          />
          <div className={b.group}>
            <Checkbox checked={consent} onChange={setConsent} invalid={Boolean(errors.consent)} required>
              만 14세 이상이고, 닉네임과 인연 점수가 {invite.ownerNickname}님의 별자리에 남는 데 동의해요
            </Checkbox>
            {errors.consent ? (
              <p className={b.error} role="alert">
                {errors.consent}
              </p>
            ) : null}
          </div>
          <Button type="submit" block>
            카드 고르러 가기
          </Button>
        </form>
      ) : null}

      {phase === "shuffle" || phase === "pick" ? (
        <section ref={drawRef} className={s.draw} aria-labelledby="draw-title">
          <div className={s.drawHead}>
            <Cat outfit="tarot" action={phase === "shuffle" ? "shuffle" : "none"} expression="focus" size={96} reactOnTap={false} />
            <h2 id="draw-title" className={b.sectionTitle}>
              {phase === "shuffle" ? "고양이가 카드를 섞고 있어요" : "두 사람을 떠올리며 한 장을 골라요"}
            </h2>
          </div>
          <p className={b.helper} role="status">
            {phase === "pick" ? "고른 카드는 이 별의 인연 카드가 돼요. 점수에는 들어가지 않아요." : ""}
          </p>
          <div className={s.stage}>
            {phase === "shuffle" ? (
              <ShuffleStage onDone={() => setPhase("pick")} />
            ) : (
              <CardFan
                picked={pick === null ? [] : [FAN[pick]!]}
                max={1}
                onPick={(index) => {
                  const slot = FAN.indexOf(index);
                  if (slot < 0) return;
                  setPick(slot);
                  window.setTimeout(() => setPhase("message"), 450);
                }}
              />
            )}
          </div>
        </section>
      ) : null}

      {phase === "message" ? (
        <section className={`${b.panel} ${b.form}`} aria-labelledby="message-title">
          <div className={b.group}>
            <div className={b.labelRow}>
              <label id="message-title" htmlFor="friend-message" className={b.label}>
                한 줄 남기기 (선택)
              </label>
              <span className={b.count} aria-hidden="true">
                {Array.from(message).length}/{MESSAGE_MAX}
              </span>
            </div>
            <input
              id="friend-message"
              className={b.input}
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`${invite.ownerNickname}님에게 한마디`}
              autoComplete="off"
              aria-invalid={Boolean(errors.message)}
              aria-describedby="friend-message-help"
            />
            <p id="friend-message-help" className={b.helper}>
              {invite.ownerNickname}님의 별자리 화면에만 보이고, 공유 이미지에는 들어가지 않아요
            </p>
            {errors.message ? (
              <p className={b.error} role="alert">
                {errors.message}
              </p>
            ) : null}
          </div>
          {errors.form ? (
            <p className={b.error} role="alert">
              {errors.form}
            </p>
          ) : null}
          <Button block onClick={submit} disabled={busy}>
            {busy ? "별을 다는 중이에요" : "별 되기"}
          </Button>
        </section>
      ) : null}
    </>
  );
}

function Result({ result, headingRef }: { result: JoinResult; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const def = getConstellation(result.sign);
  const card = getCard(result.card.cardId);
  const reversed = result.card.orientation === "reversed";
  return (
    <section className={s.result} aria-labelledby="result-title">
      <p className={b.eyebrow}>
        {result.ownerNickname}님의 {def.ko} · {result.slot + 1}번째 별
      </p>
      <h1 id="result-title" ref={headingRef} tabIndex={-1} className={s.title}>
        {result.completed ? `${def.ko}가 완성됐어요` : `${def.ko}에 별이 됐어요`}
      </h1>
      <div className={`${b.panel} ${b.panelGold} ${s.scoreCard}`}>
        <p className={s.score}>
          인연 <strong>{result.score}</strong>점
        </p>
        <p className={b.helper}>두 사람의 생년월일로 본 사주 궁합이에요. 언제 다시 봐도 같은 점수예요.</p>
        <ul className={s.parts} aria-label="점수 근거">
          {result.parts.length === 0 ? (
            <li>
              <span>더하거나 뺄 항목이 없어 기본 점수예요</span>
              <span>62</span>
            </li>
          ) : null}
          {result.parts.map((part) => (
            <li key={part.id}>
              <span>{part.text}</span>
              <span>{part.points > 0 ? `+${part.points}` : part.points === 0 ? "" : part.points}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`${b.panel} ${s.cardPanel}`}>
        <TarotCard cardId={result.card.cardId} orientation={result.card.orientation} faceUp size="md" label={`${card.names.ko}${reversed ? " 역방향" : ""}`} />
        <div className={s.cardText}>
          <p className={b.eyebrow}>인연 카드 · {card.names.ko}{reversed ? " 역방향" : ""}</p>
          <p className={s.line}>{result.bondLine}</p>
        </div>
      </div>
      <div className={b.actions}>
        <Button href="/today" variant="secondary" block>
          오늘의 한 장 받기
        </Button>
        <Button href="/bonds" block>
          나도 내 별자리 만들기
        </Button>
      </div>
      <p className={b.helper}>
        생년월일은 점수를 내는 데만 쓰고 저장하지 않았어요. {result.ownerNickname}님에게는 닉네임, 한 줄, 고른 카드, 인연 점수와 점수 근거만 보여요.{" "}
        <Link href="/privacy" className={s.inlineLink}>
          개인정보처리방침
        </Link>
      </p>
    </section>
  );
}
