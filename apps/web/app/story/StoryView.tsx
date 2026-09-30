"use client";

import { useState } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { useSajuChart } from "@/components/saju/useSajuChart";
import { Timeline } from "@/components/story/Timeline";
import { StoryToggle, type ReadingMode } from "@/components/tarot/StoryToggle";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import type { FriendScene, StoryChapter } from "@/lib/fixtures";
import { composeChartTeaser } from "@/lib/sajuPrologue";
import s from "./StoryView.module.css";

type StoryViewProps = {
  nickname: string;
  chapters: StoryChapter[];
  scenes: FriendScene[];
  nextChapter: number;
};

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 나의 스타로그: the timeline, the [이야기 | 풀이] switch, and the one way forward (새 장 열기). */
const PROLOGUE_PENDING = "풀이를 적고 있어요. 다 적으면 여기에 넣어 둘게요.";

/**
 * The saju prologue as the saved chart allows: the written sample only for the sample chart,
 * otherwise the chart's own day pillar with its computed facts and a "being written" line.
 */
function usePrologue(chapter: StoryChapter): StoryChapter {
  const { ready, result, isSample } = useSajuChart();
  if (ready && isSample) return chapter;
  const generic = { ...chapter, title: "나의 프롤로그", saju: undefined };
  if (!ready || !result) return { ...generic, excerpt: { story: " ", plain: " " } };
  if ("error" in result) return { ...generic, excerpt: { story: PROLOGUE_PENDING, plain: PROLOGUE_PENDING } };
  const { chart } = result;
  return {
    ...generic,
    excerpt: { story: PROLOGUE_PENDING, plain: composeChartTeaser(chart) },
    saju: { dayPillar: chart.pillars.day.stem + chart.pillars.day.branch, dayMaster: chart.dayMaster.ko },
  };
}

export function StoryView({ nickname, chapters: fixtureChapters, scenes, nextChapter }: StoryViewProps) {
  const [mode, setMode] = useState<ReadingMode>("story");
  const pending = scenes.filter((scene) => scene.status === "pending");
  const saju = fixtureChapters.find((chapter) => chapter.kind === "saju");
  const prologue = usePrologue(saju ?? fixtureChapters[0]!);
  const chapters = fixtureChapters.map((chapter) => (chapter === saju ? prologue : chapter));

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <p className={s.eyebrow}>{`${nickname}님의 이야기`}</p>
          <h1 className={s.title}>{`나의 ${SITE.nameKo}`}</h1>
          <p className={s.count}>{`장 ${chapters.length}개${pending.length > 0 ? ` · 확인할 친구 장면 ${pending.length}개` : ""}`}</p>
        </header>

        <div className={s.toggle}>
          <StoryToggle value={mode} onChange={setMode} />
        </div>

        <Timeline chapters={chapters} scenes={scenes} mode={mode} />
      </div>

      {/* Desktop: the next chapter sits in a side column. Phones get the floating button instead. */}
      <aside className={s.rail} aria-labelledby="next-chapter-title">
        <div className={s.next}>
          <span className={s.nextCat}>
            <Cat outfit="tarot" size={96} />
          </span>
          <h2 id="next-chapter-title" className={s.nextTitle}>{`${nextChapter}장을 열어볼까요`}</h2>
          <p className={s.nextText}>요즘 마음에 걸리는 일을 카드 세 장으로 이어서 적어요.</p>
          <Button href="/tarot/new" block trailing={<PlusIcon />}>
            새 장 열기
          </Button>
          <Button href="/tarot/draw?template=daily" variant="ghost" size="md" block>
            오늘의 한 장
          </Button>
        </div>
      </aside>

      <div className={s.floating}>
        <Button href="/tarot/new" trailing={<PlusIcon />}>
          새 장 열기
        </Button>
      </div>
    </div>
  );
}

/** Nothing written yet: the rabbit waits with an open book. */
export function EmptyStory() {
  return (
    <div className={s.empty}>
      <h1 className={s.title}>{`나의 ${SITE.nameKo}`}</h1>
      <div className={s.emptyArt}>
        <Rabbit outfit="tarot" action="write" size={176} />
      </div>
      <p className={s.emptyTitle}>아직 첫 장이 비어 있어요</p>
      <p className={s.emptyText}>카드 세 장을 뽑으면 토끼가 첫 장으로 적어 둬요.</p>
      <div className={s.emptyCta}>
        <Button href="/tarot/new" block trailing="→">
          첫 타로 보기
        </Button>
      </div>
    </div>
  );
}
