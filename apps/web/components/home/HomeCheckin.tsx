"use client";

import { useState } from "react";
import { Checkin } from "@/components/reading/Checkin";
import { answerCheckin, checkinSource, dueCheckin, observationOf, useChapters, type StoredChapter } from "@/lib/storage/chapters";

/**
 * 지난 풀이 돌아보기, shown in 내 정보 (owner 2026-10-20; it was on the home): the newest reading whose
 * observation is due (3+ days old, not yet answered). Nothing renders otherwise.
 */
export function HomeCheckin({ className }: { className?: string }) {
  const chapters = useChapters();
  // Held once shown, so its thank-you line stays after the answer makes it no longer due.
  const [held, setHeld] = useState<StoredChapter | null>(null);
  const due = held ?? (chapters ? dueCheckin(chapters, Date.now()) : undefined);
  const observation = due ? observationOf(due) : undefined;
  if (!due || !observation) return null;
  return (
    <div className={className}>
      <Checkin
        observation={observation}
        source={checkinSource(due)}
        href={`/chapter/${due.id}`}
        onAnswer={(answer) => {
          setHeld(due);
          answerCheckin(due.id, answer);
        }}
      />
    </div>
  );
}
