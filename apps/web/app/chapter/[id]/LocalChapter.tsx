"use client";

import { useState } from "react";
import { Checkin } from "@/components/reading/Checkin";
import type { AskResult } from "@/components/tarot/FollowUp";
import { faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { kstMonthDay } from "@/lib/kst";
import { postGeneration } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import type { FollowUpData } from "@/lib/reading/types";
import { answerCheckin, checkinDue, getChapter, observationOf, updateChapter, useChapters, type StoredChapter } from "@/lib/storage/chapters";
import { ChapterView, type ChapterFollowUp } from "./ChapterView";
import { SajuChapterView } from "./SajuChapterView";
import s from "./ChapterView.module.css";

/**
 * Sends a follow-up on a saved reading. The answer, the new chapter token and the count left are
 * stored with the reading even if the page was left meanwhile (the question was answered).
 */
async function askFollowUp(id: string, question: string): Promise<AskResult> {
  const chapter = getChapter(id);
  if (!chapter) return { error: { title: "이 기기에서 기록을 찾지 못했어요", action: null } };
  const result = await postGeneration<FollowUpData>("/api/followup", { chapterToken: chapter.chapterToken, reading: chapter.reading, question });
  if (result.ok) {
    const { answer, chapterToken, remaining } = result.data;
    updateChapter(id, (c) => ({ ...c, chapterToken, turns: [...c.turns, { question, answer }], followUpsLeft: remaining }));
    return { answer };
  }
  if (result.error.code === "BETA_LIMIT" && result.error.scope === "chapter") updateChapter(id, (c) => ({ ...c, followUpsLeft: 0 }));
  return { error: describeApiError(result.error, "followup") };
}

/** A reading saved on this device, as its kind shows it. It never calls the API to be shown again. */
function SavedReading({ chapter }: { chapter: StoredChapter }) {
  // Once answered, the 돌아보기 card stays for this visit (with its thank-you line).
  const [checkinOpen, setCheckinOpen] = useState(() => checkinDue(chapter, Date.now()));
  const observation = observationOf(chapter);
  const checkin =
    checkinOpen && observation ? (
      <Checkin
        observation={observation}
        onAnswer={(answer) => {
          answerCheckin(chapter.id, answer);
          setCheckinOpen(true);
        }}
      />
    ) : undefined;

  const followUp: ChapterFollowUp = {
    suggestions: chapter.reading.followUps ?? [],
    turns: chapter.turns,
    remaining: chapter.followUpsLeft,
    onAsk: (question) => askFollowUp(chapter.id, question),
  };
  const date = kstMonthDay(chapter.createdAt);

  if (chapter.kind === "saju") {
    return <SajuChapterView eyebrow={`사주 기록 · ${date}`} title={chapter.title || "나의 사주"} birth={chapter.birth} reading={chapter.reading} followUp={followUp} checkin={checkin} />;
  }
  return (
    <ChapterView
      eyebrow={`타로 기록 · ${date}`}
      question={chapter.question}
      cards={chapter.cards.map(faceUpCard)}
      reading={chapter.reading}
      followUp={followUp}
      checkin={checkin}
    />
  );
}

export function LocalChapter({ id }: { id: string }) {
  const chapters = useChapters();
  if (chapters === undefined) return <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />;
  const chapter = chapters.find((c) => c.id === id);
  if (chapter) return <SavedReading key={chapter.id} chapter={chapter} />;
  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <section className={s.missing} aria-labelledby="missing-title">
        <h1 id="missing-title" className={s.missingTitle}>
          이 기기에 없는 기록이에요
        </h1>
        <p className={s.missingText}>풀이는 연 기기에만 보관돼요. 지웠거나 다른 기기에서 열었다면 여기서는 볼 수 없어요.</p>
        <Button href="/tarot/new" block trailing="→">
          타로 보기
        </Button>
        <Button href="/story" variant="ghost" size="md" block>
          내 기록으로
        </Button>
      </section>
    </>
  );
}
