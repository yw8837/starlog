"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Checkin } from "@/components/reading/Checkin";
import type { AskResult } from "@/components/tarot/FollowUp";
import { faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { ReviewPrompt } from "@/components/reviews/ReviewPrompt";
import type { ShareActions } from "@/components/share/ShareResultButton";
import { useAccount } from "@/lib/account/client";
import { createShareLink, knownShareLink, stopShareLink } from "@/lib/share/client";
import { kstMonthDay } from "@/lib/kst";
import { commitQuota, postGeneration } from "@/lib/reading/api";
import { OPENING_KEEP_ONLY } from "@/lib/helpGuide";
import { describeApiError } from "@/lib/reading/errors";
import type { FollowUpData } from "@/lib/reading/types";
import {
  answerCheckin,
  chaptersPersisted,
  checkinDue,
  deleteChapter,
  getChapter,
  hasChapterEntry,
  isPremiumChapter,
  observationOf,
  sajuChapterEyebrow,
  tidyMatchChapter,
  updateChapter,
  useChapters,
  type StoredChapter,
} from "@/lib/storage/chapters";
import { pullAccountReadings } from "@/lib/storage/sync";
import { ChapterView, type ChapterFollowUp } from "./ChapterView";
import { PremiumRows } from "@/components/premium/PremiumRows";
import { PremiumChapterView } from "./PremiumChapterView";
import { SajuChapterView } from "./SajuChapterView";
import { MATCH_FOLLOWUP_DEVICE_ONLY, PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import s from "./ChapterView.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { isDeepTarotReading, isFollowUpData, isNewYearReading, isStoredMatchReading, isWholeSajuReading, partialTarotReading } from "@/lib/reading/validate";

/** Chapter tokens expire 7 days after the reading, 30 for a premium one (the server's rule): no follow-ups after that. */
export const FOLLOW_UP_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Follow-ups on their way, per reading. Leaving the page does not stop one (the answer is still
 * stored); coming back shows it as pending, and no second question can race the same token.
 */
const inFlight = new Map<string, { question: string; done: Promise<AskResult> }>();

/**
 * Sends a follow-up on a saved reading. The answer, the new chapter token and the count left are
 * stored with the reading even if the page was left meanwhile (the question was answered).
 */
function askFollowUp(id: string, question: string): Promise<AskResult> {
  if (inFlight.has(id)) return Promise.resolve({ error: { title: "앞선 질문의 답을 적고 있어요", action: null } });
  const done = (async (): Promise<AskResult> => {
    const chapter = getChapter(id);
    if (!chapter) return { error: { title: "이 기기에서 기록을 찾지 못했어요", action: null } };
    // Only an answer with the right shape is written into the reading (a malformed one would
    // overwrite the chapter token and make the whole reading unreadable).
    const result = await postGeneration<FollowUpData>(
      "/api/followup",
      {
        chapterToken: chapter.chapterToken,
        reading: chapter.reading,
        question,
        ...(chapter.serverId ? { readingId: chapter.serverId } : {}),
      },
      { accept: isFollowUpData },
    );
    if (result.ok) {
      const { answer, chapterToken, remaining } = result.data;
      updateChapter(id, (c) => ({ ...c, chapterToken, turns: [...c.turns, { question, answer }], followUpsLeft: remaining }));
      if (result.commit) void commitQuota(result.commit);
      return { answer };
    }
    // Used up for this reading, its token expired, or it is 오픈 기념 무료 (read and keep only): no more questions here.
    if ((result.error.code === "BETA_LIMIT" && result.error.scope === "chapter") || result.error.code === "BAD_TOKEN" || result.error.code === "NOT_AVAILABLE") {
      updateChapter(id, (c) => ({ ...c, followUpsLeft: 0 }));
    }
    return { error: describeApiError(result.error, "followup") };
  })();
  inFlight.set(id, { question, done });
  void done.finally(() => inFlight.delete(id));
  return done;
}

/**
 * Erases one stored reading after a second tap (it is the only copy), then goes to 내 기록. For a
 * reading this device cannot read whole.
 */
function EraseRecord({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="secondary" size="md" onClick={() => setConfirming(true)}>
        이 기록 지우기
      </Button>
    );
  }
  return (
    <div className={s.eraseConfirm}>
      <p>지운 기록은 되돌릴 수 없어요. 지울까요?</p>
      <Button
        variant="secondary"
        size="md"
        onClick={() => {
          deleteChapter(id);
          router.replace("/story");
        }}
      >
        지우기
      </Button>
      <Button variant="ghost" size="md" onClick={() => setConfirming(false)}>
        그대로 두기
      </Button>
    </div>
  );
}

/**
 * True when every part of the saved reading can be shown (an older or edited one may lack some). A
 * premium reading is read whole or not at all (parseChapter sends a damaged one to the unreadable-record
 * screen); the same check stands here.
 */
const isWhole = (chapter: StoredChapter) =>
  chapter.kind === "tarot-deep"
    ? isDeepTarotReading(chapter.reading)
    : chapter.kind === "match"
      ? isStoredMatchReading(chapter.reading)
      : chapter.kind === "newyear-2027"
        ? isNewYearReading(chapter.reading)
        : chapter.kind === "tarot"
          ? partialTarotReading(chapter.reading).complete
          : isWholeSajuReading(chapter.reading);

/** A reading saved on this device, as its kind shows it. It never calls the API to be shown again. */
function SavedReading({ chapter }: { chapter: StoredChapter }) {
  const whole = isWhole(chapter);
  // Once answered, the 돌아보기 card stays for this visit (with its thank-you line).
  const [checkinOpen, setCheckinOpen] = useState(() => checkinDue(chapter, Date.now()));
  const observation = observationOf(chapter);
  // A partial reading shows what it can, says so, and can be erased; it takes no more questions
  // (the server checks the reading it is sent).
  const broken = whole ? null : (
    <section className={s.broken} aria-labelledby="broken-title">
      <h2 id="broken-title" className={s.brokenTitle}>
        이 기록의 일부를 읽지 못했어요
      </h2>
      <p className={s.brokenText}>읽을 수 있는 부분만 보여 드려요. 필요 없으면 지워도 돼요.</p>
      <EraseRecord id={chapter.id} />
    </section>
  );
  const checkin =
    broken ??
    (checkinOpen && observation ? (
      <Checkin
        observation={observation}
        onAnswer={(answer) => {
          answerCheckin(chapter.id, answer);
          setCheckinOpen(true);
        }}
      />
    ) : undefined);

  const [openedAt] = useState(() => Date.now());
  const premium = isPremiumChapter(chapter);
  const followUpMs = premium ? PREMIUM_CHAPTER_TTL_MS : FOLLOW_UP_DAYS_MS;
  const expired = openedAt - chapter.createdAt >= followUpMs;
  // A 궁합 from the account carries no token (owner 2026-10-16): asked only where it was written.
  const deviceOnly = chapter.kind === "match" && !chapter.chapterToken && !expired;
  const closed = expired || !whole || deviceOnly;
  // The partner leaves a 궁합 as it is opened: a birth kept as text, and past its 30 days the sealed token.
  useEffect(() => {
    if (chapter.kind === "match") tidyMatchChapter(chapter.id);
  }, [chapter.id, chapter.kind]);
  const suggestions: unknown = chapter.reading.followUps;
  const followUp: ChapterFollowUp = {
    suggestions: Array.isArray(suggestions) ? suggestions.filter((q): q is string => typeof q === "string") : [],
    turns: chapter.turns,
    remaining: closed ? 0 : chapter.followUpsLeft,
    onAsk: (question) => askFollowUp(chapter.id, question),
    awaiting: inFlight.get(chapter.id),
    ...(!whole
      ? { endedText: "이 기록은 일부를 읽지 못해 더 물어볼 수 없어요" }
      : expired && chapter.followUpsLeft > 0
        ? { endedText: `풀이를 연 지 ${Math.round(followUpMs / DAY_MS)}일이 지나 더 물어볼 수 없어요` }
        : deviceOnly
          ? { endedText: MATCH_FOLLOWUP_DEVICE_ONLY }
          : {}),
  };
  const date = kstMonthDay(chapter.createdAt);
  // PDF로 저장: the day it was read; a reading in the account also opens in another browser (after a login), at its account id.
  const kept = { at: chapter.createdAt, inAccount: Boolean(chapter.serverId), path: `/chapter/${chapter.serverId ?? chapter.id}` };
  // Shown in the design the reading was written for: one saved before readings kept their deck was
  // written for the 1909 scans (lib/api/inputs.ts), whatever this device chose since.
  const deck = chapter.deck ?? "rws1909";
  // 풀이 후기: only a reading kept in an account can be reviewed (spec §2); a visitor not logged in is offered
  // the login there. A reading only on this device keeps its own stars.
  const rating = chapter.serverId ? <ReviewPrompt readingId={chapter.serverId} /> : undefined;
  // 오픈 기념 무료 takes no follow-ups (owner 2026-10-14 evening); it is shared like any other (owner 2026-10-23).
  const keepOnly = chapter.opening === true;
  // Every result screen shows 공유하기 (owner 2026-10-23); a record not read whole says why it cannot make a link.
  // A premium reading has no share link: it shares an image of its cards or title (PremiumChapterView, P5 task 23).
  const share: ShareActions | undefined = premium
    ? undefined
    : {
        create: () => createShareLink(chapter),
        stop: () => stopShareLink(chapter),
        current: () => knownShareLink(chapter),
        ...(whole ? {} : { unavailable: "이 기록은 일부를 읽지 못해 공유할 수 없어요." }),
      };

  // The browser would not keep it (storage full or blocked): say so rather than look saved.
  const unsaved = !chaptersPersisted() ? (
    <p className={s.unsaved} role="note">
      이 기기에 저장하지 못했어요. 저장 공간이 가득 찼거나 막혀 있어서, 이 화면을 닫으면 풀이가 사라져요.
    </p>
  ) : null;

  // The next step after a finished standard reading (plan-reconciled §4.3), never gold and only where premium is
  // visible (PremiumRows draws nothing otherwise). A premium reading offers no other product.
  const next = !whole ? undefined : chapter.kind === "tarot" ? (
    <PremiumRows ids={["tarot-deep"]} title="더 깊게 보고 싶다면" lines={{ "tarot-deep": "한 가지 고민을 카드 10장으로, 자리마다 나눠 더 깊게 봐요" }} />
  ) : chapter.kind === "saju" ? (
    <PremiumRows
      ids={["newyear-2027", "match"]}
      onlyOpen
      title="더 깊게 보고 싶다면"
      lines={{ "newyear-2027": "다가올 2027년 한 해를 달마다 미리 봐요", match: "다른 사람과 함께, 두 사람의 사주로 앞으로 1년까지 봐요" }}
    />
  ) : undefined;

  if (isPremiumChapter(chapter)) {
    return (
      <>
        {unsaved}
        <PremiumChapterView chapter={chapter} followUp={followUp} checkin={checkin} rating={rating} shareable={whole} kept={kept} />
      </>
    );
  }
  if (chapter.kind === "saju") {
    return (
      <>
        {unsaved}
        <SajuChapterView eyebrow={sajuChapterEyebrow(chapter)} title={chapter.title || "나의 사주"} birth={chapter.birth} reading={chapter.reading} followUp={followUp} checkin={checkin} share={share} kept={kept} rating={rating} next={next} />
      </>
    );
  }
  return (
    <>
      {unsaved}
      <ChapterView
        eyebrow={`타로 기록 · ${date}`}
        question={chapter.question}
        cards={chapter.cards.map(faceUpCard)}
        deck={deck}
        reading={chapter.reading}
        followUp={keepOnly ? undefined : followUp}
        keepOnly={keepOnly ? OPENING_KEEP_ONLY : undefined}
        checkin={checkin}
        share={share}
        kept={kept}
        rating={rating}
        next={next}
      />
    </>
  );
}

/**
 * An id this device does not hold. Logged in, it may be a reading saved in the account (its account
 * id, the address it has on every device): the account's readings come onto this device, and a match
 * then shows in place. Otherwise it says where readings are kept.
 */
function MissingRecord() {
  const account = useAccount();
  const loggedIn = Boolean(account?.user);
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    if (!loggedIn) return;
    let live = true;
    void pullAccountReadings().finally(() => {
      if (live) setLooked(true);
    });
    return () => {
      live = false;
    };
  }, [loggedIn]);
  if (account === undefined || (loggedIn && !looked)) return <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />;
  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <section className={s.missing} aria-labelledby="missing-title">
        <h1 id="missing-title" className={s.missingTitle}>
          {loggedIn ? "이 주소의 기록을 찾지 못했어요" : "이 기기에 없는 기록이에요"}
        </h1>
        <p className={s.missingText}>
          {loggedIn
            ? "결제하고 연 풀이는 내 기록에 모두 있어요. 그 밖의 풀이는 연 기기에만 보관돼요."
            : "결제하고 연 풀이는 로그인하면 내 기록에서 볼 수 있어요. 그 밖의 풀이는 연 기기에만 보관돼요."}
        </p>
        <Button href={NEW_TAROT_HREF} block trailing="→">
          타로 보기
        </Button>
        <Button href="/story" variant="ghost" size="md" block>
          내 기록으로
        </Button>
      </section>
    </>
  );
}

export function LocalChapter({ id }: { id: string }) {
  const chapters = useChapters();
  if (chapters === undefined) return <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />;
  // Its own id, or (a reading saved in the account) its account id, the same on every device.
  const chapter = chapters.find((c) => c.id === id) ?? chapters.find((c) => c.serverId === id);
  if (chapter) return <SavedReading key={chapter.id} chapter={chapter} />;
  // Stored, but not readable at all: say so and let it be erased.
  if (hasChapterEntry(id)) {
    return (
      <>
        <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
        <section className={s.missing} aria-labelledby="missing-title">
          <h1 id="missing-title" className={s.missingTitle}>
            이 기록을 읽지 못했어요
          </h1>
          <p className={s.missingText}>이 기기에 저장된 기록이 손상됐거나 예전 형식이에요. 필요 없으면 지워도 돼요.</p>
          <EraseRecord id={id} />
          <Button href="/story" variant="ghost" size="md" block>
            내 기록으로
          </Button>
        </section>
      </>
    );
  }
  return <MissingRecord />;
}
