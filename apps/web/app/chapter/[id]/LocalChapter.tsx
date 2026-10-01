"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Checkin } from "@/components/reading/Checkin";
import type { AskResult } from "@/components/tarot/FollowUp";
import { faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { kstMonthDay } from "@/lib/kst";
import { commitQuota, postGeneration } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import type { FollowUpData } from "@/lib/reading/types";
import {
  answerCheckin,
  chaptersPersisted,
  checkinDue,
  deleteChapter,
  getChapter,
  hasChapterEntry,
  observationOf,
  updateChapter,
  useChapters,
  type StoredChapter,
} from "@/lib/storage/chapters";
import { ChapterView, type ChapterFollowUp } from "./ChapterView";
import { SajuChapterView } from "./SajuChapterView";
import s from "./ChapterView.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { isFollowUpData, isSajuReading, partialTarotReading } from "@/lib/reading/validate";

/** Chapter tokens expire 7 days after the reading (the server's rule): no follow-ups after that. */
const FOLLOW_UP_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
    const result = await postGeneration<FollowUpData>("/api/followup", { chapterToken: chapter.chapterToken, reading: chapter.reading, question }, { accept: isFollowUpData });
    if (result.ok) {
      const { answer, chapterToken, remaining } = result.data;
      updateChapter(id, (c) => ({ ...c, chapterToken, turns: [...c.turns, { question, answer }], followUpsLeft: remaining }));
      if (result.commit) void commitQuota(result.commit);
      return { answer };
    }
    // Used up for this reading, or its token expired: no more questions here.
    if ((result.error.code === "BETA_LIMIT" && result.error.scope === "chapter") || result.error.code === "BAD_TOKEN") {
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

/** True when every part of the saved reading can be shown (an older or edited one may lack some). */
const isWhole = (chapter: StoredChapter) => (chapter.kind === "tarot" ? partialTarotReading(chapter.reading).complete : isSajuReading(chapter.reading));

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
  const expired = openedAt - chapter.createdAt >= FOLLOW_UP_DAYS_MS;
  const closed = expired || !whole;
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
        ? { endedText: "풀이를 연 지 7일이 지나 더 물어볼 수 없어요" }
        : {}),
  };
  const date = kstMonthDay(chapter.createdAt);

  // The browser would not keep it (storage full or blocked): say so rather than look saved.
  const unsaved = !chaptersPersisted() ? (
    <p className={s.unsaved} role="note">
      이 기기에 저장하지 못했어요. 저장 공간이 가득 찼거나 막혀 있어서, 이 화면을 닫으면 풀이가 사라져요.
    </p>
  ) : null;

  if (chapter.kind === "saju") {
    return (
      <>
        {unsaved}
        <SajuChapterView eyebrow={`사주 기록 · ${date}`} title={chapter.title || "나의 사주"} birth={chapter.birth} reading={chapter.reading} followUp={followUp} checkin={checkin} />
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
        reading={chapter.reading}
        followUp={followUp}
        checkin={checkin}
      />
    </>
  );
}

export function LocalChapter({ id }: { id: string }) {
  const chapters = useChapters();
  if (chapters === undefined) return <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />;
  const chapter = chapters.find((c) => c.id === id);
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
  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <section className={s.missing} aria-labelledby="missing-title">
        <h1 id="missing-title" className={s.missingTitle}>
          이 기기에 없는 기록이에요
        </h1>
        <p className={s.missingText}>풀이는 연 기기에만 보관돼요. 지웠거나 다른 기기에서 열었다면 여기서는 볼 수 없어요.</p>
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
