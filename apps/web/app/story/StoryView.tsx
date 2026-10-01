"use client";

import { branchElement, stemElement } from "@starlog/core";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { ELEMENT_KEY } from "@/components/saju/elements";
import { chartFor } from "@/components/saju/useSajuChart";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { kstMonthDay } from "@/lib/kst";
import { checkinDue, newestFirst, recordLine, useChapters, type SajuChapter, type StoredChapter } from "@/lib/storage/chapters";
import s from "./StoryView.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const KIND_LABEL = { tarot: "타로", saju: "사주" } as const;

/** The day pillar as two element tiles, and the day master's name. */
function DayPillar({ chapter }: { chapter: SajuChapter }) {
  const result = chartFor(chapter.birth);
  if (!("chart" in result)) return null;
  const { day } = result.chart.pillars;
  return (
    <span className={s.pillar}>
      <span className={s.glyphs} aria-hidden="true">
        <span className={s.glyph} data-el={ELEMENT_KEY[stemElement(day.stem)]}>
          {day.stem}
        </span>
        <span className={s.glyph} data-el={ELEMENT_KEY[branchElement(day.branch)]}>
          {day.branch}
        </span>
      </span>
      <span className={s.pillarText}>{`일간 ${result.chart.dayMaster.ko}`}</span>
    </span>
  );
}

function Record({ chapter, now }: { chapter: StoredChapter; now: number }) {
  const { question, verdict } = recordLine(chapter);
  const title = chapter.kind === "saju" ? chapter.title || "나의 사주" : question;
  return (
    <li>
      <Link href={`/chapter/${chapter.id}`} className={s.record}>
        <span className={s.recordHead}>
          <span className={s.kind} data-kind={chapter.kind}>
            {KIND_LABEL[chapter.kind]}
          </span>
          <span className={s.date}>{kstMonthDay(chapter.createdAt)}</span>
          {checkinDue(chapter, now) ? <span className={s.due}>돌아볼 때예요</span> : chapter.checkin ? <span className={s.checked}>{`돌아보기 · ${chapter.checkin.answer}`}</span> : null}
        </span>
        <span className={s.recordBody}>
          {chapter.kind === "tarot" ? (
            <span className={s.thumbs} aria-hidden="true">
              {chapter.cards.map((card) => (
                <TarotCard key={card.position} cardId={card.cardId} orientation={card.orientation} faceUp size="sm" className={s.thumb} />
              ))}
            </span>
          ) : (
            <DayPillar chapter={chapter} />
          )}
          <span className={s.recordText}>
            <span className={s.recordTitle}>{title}</span>
            <span className={s.verdict}>{verdict}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** 내 기록: every reading opened on this device, newest first; each opens the saved reading. */
export function StoryView() {
  const chapters = useChapters();
  if (chapters === undefined) {
    return (
      <div className={s.main}>
        <header className={s.head}>
          <h1 className={s.title}>내 기록</h1>
        </header>
      </div>
    );
  }
  if (chapters.length === 0) return <EmptyStory />;
  const now = Date.now();

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <h1 className={s.title}>내 기록</h1>
          <p className={s.count}>{`기록 ${chapters.length}개 · 이 기기에 보관돼요`}</p>
        </header>
        <ol className={s.records} aria-label="기록 목록">
          {newestFirst(chapters).map((chapter) => (
            <Record key={chapter.id} chapter={chapter} now={now} />
          ))}
        </ol>
      </div>

      {/* Desktop: the next reading sits in a side column. Phones get the floating button instead. */}
      <aside className={s.rail} aria-labelledby="next-title">
        <div className={s.next}>
          <span className={s.nextCat}>
            <Cat outfit="tarot" size={96} />
          </span>
          <h2 id="next-title" className={s.nextTitle}>
            새로 물어볼까요?
          </h2>
          <p className={s.nextText}>요즘 마음에 걸리는 일을 카드 세 장으로 봐요.</p>
          <Button href={NEW_TAROT_HREF} block trailing={<PlusIcon />}>
            새로 물어보기
          </Button>
          <Button href="/today" variant="ghost" size="md" block>
            오늘의 한 장
          </Button>
        </div>
      </aside>

      <div className={s.floating}>
        <Button href={NEW_TAROT_HREF} trailing={<PlusIcon />}>
          새로 물어보기
        </Button>
      </div>
    </div>
  );
}

/** Nothing opened yet: the rabbit waits with an open book. */
export function EmptyStory() {
  return (
    <div className={s.empty}>
      <h1 className={s.title}>내 기록</h1>
      <div className={s.emptyArt}>
        <Rabbit outfit="tarot" action="write" size={176} />
      </div>
      <p className={s.emptyTitle}>아직 기록이 없어요</p>
      <p className={s.emptyText}>풀이를 열면 토끼가 여기에 적어 둬요.</p>
      <div className={s.emptyCta}>
        <Button href={NEW_TAROT_HREF} block trailing="→">
          첫 타로 보기
        </Button>
      </div>
    </div>
  );
}
