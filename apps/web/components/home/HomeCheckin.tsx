"use client";

import { useState } from "react";
import { Checkin } from "@/components/reading/Checkin";
import { kstMonthDay } from "@/lib/kst";
import { answerCheckin, dueCheckin, observationOf, useChapters, type StoredChapter } from "@/lib/storage/chapters";

/**
 * 돌아보기 on the home: the newest reading whose observation is due (3+ days old, not yet
 * answered). Nothing renders otherwise, so the home grid closes up around it.
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
        source={`${kstMonthDay(due.createdAt)} ${due.kind === "tarot" ? "타로" : "사주"}`}
        href={`/chapter/${due.id}`}
        onAnswer={(answer) => {
          setHeld(due);
          answerCheckin(due.id, answer);
        }}
      />
    </div>
  );
}
