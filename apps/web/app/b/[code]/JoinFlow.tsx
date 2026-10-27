"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { getCard, getConstellation, type SignId } from "@starlog/core";
import { BIRTH_MISSING, BirthFields, EMPTY_BIRTH, birthBody, savedBirth, type BirthValue } from "@/components/bonds/BirthFields";
import { BondScore } from "@/components/bonds/BondScore";
import { BondShareButton } from "@/components/bonds/BondsShareButton";
import { CodeEntry } from "@/components/bonds/CodeEntry";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { InviteShareButton } from "@/components/bonds/InviteShareButton";
import { Cat } from "@/components/characters/Cat";
import { CardFan, fanIndexes } from "@/components/tarot/CardFan";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { birthProblem } from "@/lib/bonds/birth";
import { CODE_LIMIT_MESSAGE, JOIN_FAILED, bondsApi, bondsMessage } from "@/lib/bonds/client";
import { MESSAGE_MAX, NICKNAME_MAX, nicknameProblem, ordinalStar } from "@/lib/bonds/text";
import { useSajuProfile } from "@/lib/sajuFlow";
import type { FriendResultView, InviteState } from "./loadInvite";
import b from "@/components/bonds/bonds.module.css";
import s from "./JoinFlow.module.css";

type Open = Extract<InviteState, { status: "open" }>;
type Self = Extract<InviteState, { status: "self" }>;
type Phase = "form" | "shuffle" | "pick" | "message" | "result";

type JoinResult = FriendResultView;

const FAN = fanIndexes(78, 21);

/** Where the join would land instead (MOVED, QA 2026-10-27): that constellation filled up, or the owner changed it. */
interface Moved { reason: "complete" | "changed"; constellationId: string; sign: SignId; filled: number; slots: number }

/**
 * The form kept on this device for this visit (QA 2026-10-27): a reload, or KakaoTalk's in-app browser reopening the page,
 * keeps the nickname, the birth date, the consent, the card and the line. sessionStorage only: never sent anywhere,
 * gone when the tab closes, and dropped once the star is in.
 */
interface Draft { nickname: string; birth: BirthValue; consent: boolean; pick: number | null; message: string }
const draftKey = (code: string) => `starlog.bonds.join.${code}`;
function readDraft(code: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(code));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(code: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(draftKey(code), JSON.stringify(draft));
    else window.sessionStorage.removeItem(draftKey(code));
  } catch {
    // private mode or storage off: the form simply is not kept
  }
}

/** The step in the address (#cards, #message), so the back button goes to the step before instead of leaving the page. */
type StepHash = "" | "#cards" | "#message";
function setStep(hash: StepHash, mode: "push" | "replace") {
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (mode === "push") window.history.pushState(window.history.state, "", url);
  else window.history.replaceState(window.history.state, "", url);
}

/**
 * The friend's side (spec §3 친구, no account): whose constellation this is, then nickname → birth date
 * → a card from the shuffled fan → an optional one-line message, and the result: the 인연 score with
 * its reasons, the 인연 카드 and its line. The birth date only travels in the join request.
 */
export function JoinFlow({ state }: { state: InviteState }) {
  if (state.status === "open") return <OpenInvite invite={state} />;
  if (state.status === "self") return <SelfInvite invite={state} />;
  if (state.status === "joined") return <Result result={state.result} again />;
  const earlier = state.status === "choosing" || state.status === "alldone" ? state.earlier : null;
  return (
    <section className={s.closed}>
      <Cat outfit="tarot" expression={state.status === "alldone" ? "happy" : state.status === "choosing" ? "focus" : "surprise"} size={120} reactOnTap={false} />
      <h1 className={s.title}>
        {state.status === "choosing"
          ? `${state.ownerNickname}님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요`
          : state.status === "alldone"
            ? `${state.ownerNickname}님은 열두 별자리를 모두 채웠어요. 함께해 줘서 고마워요`
          : state.status === "limited"
            ? CODE_LIMIT_MESSAGE
            : state.status === "error"
              ? "지금은 초대를 열 수 없어요. 잠시 뒤에 다시 시도해 주세요"
              : "이 초대는 열 수 없어요"}
      </h1>
      {state.status === "bad" ? (
        <>
          {/* Friends get a link, not a code (owner 2026-10-02): what to do first, the code entry folded under it. */}
          <p className={b.helper}>링크가 바뀌었거나 코드가 맞지 않아요. 보낸 친구에게 초대 링크를 다시 받아 주세요.</p>
          <details className={`${b.panel} ${s.entry}`}>
            <summary className={s.entrySummary}>초대코드로 참여하기</summary>
            <CodeEntry id="retry-code" replace />
          </details>
        </>
      ) : null}
      {earlier ? <EarlierStar earlier={earlier} /> : null}
      <Button href="/bonds" variant="secondary" block>
        나도 내 별자리 만들기
      </Button>
    </section>
  );
}

/**
 * The owner opened their own link (Q-11, spec §11: no joining one's own): says it is their invite link and sends them to
 * their constellation first; sending it on is still one tap away. No code to copy: the link is the invite (owner 2026-10-02).
 */
function SelfInvite({ invite }: { invite: Self }) {
  return (
    <section className={s.closed} aria-labelledby="self-title">
      {invite.sign ? <ConstellationArt sign={invite.sign} lit={invite.filled} size={180} className={s.headArt} /> : null}
      <h1 id="self-title" className={s.title}>
        내 초대 링크예요
      </h1>
      <p className={b.helper}>친구가 이 링크를 열면 내 별자리의 다음 별이 돼요. 내 링크로는 내 별자리에 참여할 수 없어요.</p>
      <div className={`${b.actions} ${s.wide}`}>
        <Button href="/bonds" block trailing="→">
          내 별자리로 가기
        </Button>
        {invite.sign ? <InviteShareButton code={invite.code} sign={invite.sign} filled={invite.filled} ownerNickname={invite.ownerNickname} variant="secondary" /> : null}
      </div>
    </section>
  );
}

/** This device's star in an earlier sign of the same owner (Q-05), folded under 결과 보기. */
function EarlierStar({ earlier }: { earlier: JoinResult }) {
  const def = getConstellation(earlier.sign);
  const card = getCard(earlier.card.cardId);
  return (
    <details className={`${b.panel} ${s.earlier}`}>
      <summary>
        <span className={s.earlierTitle}>이미 {def.ko}에 별이 됐어요</span>
        <span className={s.earlierMore}>결과 보기</span>
      </summary>
      <BondScore score={earlier.score} parts={earlier.parts} />
      <p className={s.line}>
        인연 카드 · {card.names.ko}
        {earlier.card.orientation === "reversed" ? " 역방향" : ""}. {earlier.bondLine}
      </p>
    </details>
  );
}

function OpenInvite({ invite }: { invite: Open }) {
  const def = getConstellation(invite.sign);
  const [phase, setPhase] = useState<Phase>("form");
  // The nickname this device already used, if any (the birth date comes from the saved saju profile, below).
  const [nickname, setNickname] = useState(invite.myNickname ?? "");
  // What the owner's share shows of this star: its score too, unless this constellation's scores never show (0017).
  const shareNotice = invite.scoresPrivate
    ? `${invite.ownerNickname}님이 별자리를 공유하면 내 닉네임이 공유 링크와 이미지에 보여요. 인연 점수는 보이지 않아요.`
    : `${invite.ownerNickname}님이 별자리를 공유하면 내 닉네임과 ${invite.ownerNickname}님과의 인연 점수가 공유 링크와 이미지에 보여요.`;
  const [birth, setBirthValue] = useState<BirthValue>(EMPTY_BIRTH);
  // This device's own saved saju profile fills the date once it is read, unless the friend already chose one.
  const { profile } = useSajuProfile();
  const [prefilled, setPrefilled] = useState(false);
  const [touched, setTouched] = useState(false);
  const saved = savedBirth(profile);
  useEffect(() => {
    if (!saved || touched || prefilled) return;
    setBirthValue(saved);
    setPrefilled(true);
  }, [saved, touched, prefilled]);
  const setBirth = (value: BirthValue) => {
    setTouched(true);
    setBirthValue(value);
  };
  const [consent, setConsent] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ nickname?: string; birth?: string; consent?: string; message?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  // The constellation this star goes to: the one shown, or the one the friend agreed to after MOVED.
  const [target, setTarget] = useState(invite.constellationId);
  const [moved, setMoved] = useState<Moved | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const drawRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pickRef = useRef<number | null>(null);
  pickRef.current = pick;
  const doneRef = useRef(false);
  const [restored, setRestored] = useState(false);

  // Back to this page in the same visit: the kept form, and the step its address names.
  useEffect(() => {
    const draft = readDraft(invite.code);
    const hash = window.location.hash;
    if (draft) {
      setNickname(draft.nickname);
      if (draft.birth.year !== null) {
        setTouched(true);
        setBirthValue(draft.birth);
      }
      setConsent(draft.consent);
      setPick(draft.pick);
      setMessage(draft.message);
      if (hash === "#message" && draft.pick !== null) setPhase("message");
      else if (hash === "#cards") setPhase("pick");
    } else if (hash === "#cards" || hash === "#message") setStep("", "replace");
    setRestored(true);
  }, [invite.code]);

  useEffect(() => {
    if (!restored || doneRef.current) return;
    writeDraft(invite.code, { nickname, birth, consent, pick, message });
  }, [restored, invite.code, nickname, birth, consent, pick, message]);

  // The back button walks the steps: message → cards → form (QA 2026-10-27: it used to leave the invite).
  useEffect(() => {
    const onPop = () => {
      if (doneRef.current) return;
      const hash = window.location.hash;
      setPhase(hash === "#message" && pickRef.current !== null ? "message" : hash === "#cards" ? "pick" : "form");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
    const found: typeof errors = {};
    // The rules the join checks, here before the cards (QA 2026-10-27: a blocked name or a missing 윤달 was refused after them).
    const nicknameError = nicknameProblem(nickname);
    if (nicknameError) found.nickname = nicknameError;
    const birthDate = birthBody(birth);
    if (!birthDate) found.birth = BIRTH_MISSING;
    else {
      const problem = birthProblem(birthDate, Date.now());
      if (problem) found.birth = problem;
    }
    if (!consent) found.consent = "확인에 체크해 주세요";
    flushSync(() => setErrors(found));
    if (Object.keys(found).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setPhase("shuffle");
    setStep("#cards", "push");
  };

  const submit = async (constellationId: string = target) => {
    const birthDate = birthBody(birth);
    if (pick === null || !birthDate) return;
    setBusy(true);
    setErrors({});
    setMoved(null);
    const res = await bondsApi<JoinResult>("join", {
      // this form said the score shows on the owner's share (above 별 되기), unless this constellation's never do
      scoreNotice: !invite.scoresPrivate,
      code: invite.code,
      nickname: nickname.trim(),
      birth: birthDate,
      pick,
      message: message.trim() || null,
      expectedConstellationId: constellationId,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.code === "MOVED") {
        setMoved(res as unknown as Moved);
        return;
      }
      const text = bondsMessage(res, JOIN_FAILED);
      if (res.field === "nickname" || res.field === "birth") {
        setErrors({ [res.field]: text });
        setPhase("form");
        setStep("", "replace");
      } else if (res.field === "message") setErrors({ message: text });
      else setErrors({ form: text });
      return;
    }
    const { ok: _ok, ...joined } = res;
    // The birth date and the rest of the form are not kept once the star is in.
    doneRef.current = true;
    writeDraft(invite.code, null);
    setBirthValue(EMPTY_BIRTH);
    setMessage("");
    setResult(joined as JoinResult);
    setPhase("result");
    setStep("", "replace");
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

      {phase === "form" && invite.earlier ? <EarlierStar earlier={invite.earlier} /> : null}
      {phase === "form" ? (
        <form ref={formRef} className={`${b.panel} ${b.form}`} onSubmit={next} noValidate>
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
              placeholder="예: 불꽃속성 알감자"
              autoComplete="nickname"
              aria-invalid={Boolean(errors.nickname)}
              aria-describedby="friend-nickname-help"
            />
            <p id="friend-nickname-help" className={b.helper}>
              실명 대신 별명을 권해요. {invite.ownerNickname}님의 별자리에 이 닉네임으로 별이 돼요.
            </p>
            {errors.nickname ? (
              <p className={b.error} role="alert">
                {errors.nickname}
              </p>
            ) : null}
          </div>
          <BirthFields
            id="friend-birth"
            prefilled={prefilled}
            value={birth}
            onChange={setBirth}
            error={errors.birth}
            helper="두 사람의 인연 점수를 계산하는 데만 쓰고 저장하지 않아요. 태어난 시간은 쓰지 않아요."
          />
          <div className={b.group}>
            {/* The share notice itself is said once, right above 별 되기 (QA L5); this box is the agreement to it. */}
            <p id="friend-consent-note" className={b.helper}>
              생년월일은 저장하지 않아요.
            </p>
            <Checkbox checked={consent} onChange={setConsent} invalid={Boolean(errors.consent)} describedBy="friend-consent-note" required>
              {`만 14세 이상이고, 닉네임과 인연 점수가 ${invite.ownerNickname}님의 별자리에 남고 ${invite.ownerNickname}님이 공유하면 ${invite.scoresPrivate ? "닉네임이" : "닉네임과 점수가"} 보이는 데 동의해요`}
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
              {phase === "shuffle" ? "타로로가 카드를 섞고 있어요" : "두 사람을 떠올리며 한 장을 골라요"}
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
                  window.setTimeout(() => {
                    setPhase("message");
                    setStep("#message", "push");
                  }, 450);
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
              {invite.ownerNickname}님의 별자리 화면에만 보이고, 공유 이미지와 링크에는 들어가지 않아요
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
          {moved ? <MovedNotice moved={moved} invite={invite} busy={busy} onGo={() => {
            setTarget(moved.constellationId);
            void submit(moved.constellationId);
          }} /> : null}
          {/* Said right above the button that joins (owner 2026-10-23), once on the page (QA L5): this marks the star's score as shown. */}
          <p className={b.helper}>{shareNotice}</p>
          <Button block onClick={() => void submit()} disabled={busy}>
            {busy ? "별을 다는 중이에요" : "별 되기"}
          </Button>
        </section>
      ) : null}
    </>
  );
}

/**
 * The constellation shown filled up, or the owner switched or refilled it, while the friend was on the form (QA M1): say
 * where the star would go now and join only when they agree.
 */
function MovedNotice({ moved, invite, busy, onGo }: { moved: Moved; invite: Open; busy: boolean; onGo: () => void }) {
  const shown = getConstellation(invite.sign).ko;
  const now = getConstellation(moved.sign).ko;
  const why =
    moved.reason === "complete"
      ? `그 사이 ${shown}가 다 차서`
      : moved.sign === invite.sign
        ? `그 사이 ${invite.ownerNickname}님이 ${shown}를 새로 채우기 시작해서`
        : `그 사이 ${invite.ownerNickname}님이 별자리를 바꿔서`;
  return (
    <div className={s.moved} role="alert">
      <p>{`${why} 지금은 ${now}의 ${ordinalStar(moved.filled + 1)}이 돼요. 그대로 들어갈까요?`}</p>
      <Button block onClick={onGo} disabled={busy}>
        그대로 들어가기
      </Button>
      {/* A full load: a soft link to this same page kept the notice and the constellation it was about. The form comes back from the draft. */}
      <Button variant="ghost" block onClick={() => window.location.replace(`/b/${invite.code}`)}>
        처음부터 다시 볼게요
      </Button>
    </div>
  );
}

function Result({ result, headingRef, again = false }: { result: JoinResult; headingRef?: RefObject<HTMLHeadingElement | null>; again?: boolean }) {
  const def = getConstellation(result.sign);
  const card = getCard(result.card.cardId);
  const reversed = result.card.orientation === "reversed";
  return (
    <section className={s.result} aria-labelledby="result-title">
      <p className={b.eyebrow}>
        {result.ownerNickname}님의 {def.ko} · {ordinalStar(result.slot + 1)}
      </p>
      <h1 id="result-title" ref={headingRef} tabIndex={-1} className={s.title}>
        {again ? `이미 ${def.ko}에 별이 되어 있어요` : result.completed ? `${def.ko}가 완성됐어요` : `${def.ko}에 별이 됐어요`}
      </h1>
      {/* 인연 점수 한눈에 (owner 2026-10-23): the number, the 55–99 gauge and the table of what made it. */}
      <div className={`${b.panel} ${b.panelGold} ${s.scoreCard}`}>
        <BondScore score={result.score} parts={result.parts} caption="두 사람의 생년월일로 본 사주 궁합이에요. 언제 다시 봐도 같은 점수예요." />
        <div className={s.shareRow}>
          <BondShareButton starId={result.starId} text={`${result.nickname}님과 ${result.ownerNickname}님의 인연 ${result.score}점`} />
        </div>
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
