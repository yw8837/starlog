import { branchElement, stemElement } from "@starlog/core";
import Link from "next/link";
import { ELEMENT_KEY } from "@/components/saju/elements";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FriendScene as FriendSceneData, StoryChapter } from "@/lib/fixtures";
import { FriendScene } from "./FriendScene";
import s from "./Timeline.module.css";

type TimelineProps = {
  chapters: StoryChapter[];
  /** Friend scenes: approved ones sit in the story, pending ones wait for the owner's decision. */
  scenes: FriendSceneData[];
  /** A chapter still being read in the browser: a skeleton with an accessible name stands in for it. */
  loadingId?: string;
};

const KIND_LABEL = { saju: "사주", tarot: "타로" } as const;

function DayPillar({ dayPillar }: { dayPillar: string }) {
  const [stem = "", branch = ""] = Array.from(dayPillar);
  return (
    <span className={s.pillar} aria-hidden="true">
      <span className={s.glyph} data-el={ELEMENT_KEY[stemElement(stem)]}>
        {stem}
      </span>
      <span className={s.glyph} data-el={ELEMENT_KEY[branchElement(branch)]}>
        {branch}
      </span>
    </span>
  );
}

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9 5.5 15.5 12 9 18.5" />
  </svg>
);

/**
 * The story so far, read straight through: every chapter's whole story and its short reading
 * inline (prologue first), a link to the chapter's full reading, then the scenes friends left.
 */
export function Timeline({ chapters, scenes, loadingId }: TimelineProps) {
  return (
    <ol className={s.timeline} aria-label="이야기 목차">
      {chapters.map((chapter) => {
        const loading = chapter.id === loadingId;
        const titleId = `chapter-${chapter.id}-title`;
        const { story, plain } = chapter.excerpt;
        return (
          <li key={chapter.id} className={s.item}>
            <p className={s.marker}>
              <span className={s.label}>{chapter.label}</span>
              <span className={s.kind}>{KIND_LABEL[chapter.kind]}</span>
            </p>
            <article className={s.card} aria-busy={loading || undefined} aria-labelledby={titleId}>
              {chapter.cards.length > 0 ? (
                // Not a nested list: the timeline's items are its chapters and scenes only.
                <div className={s.cards}>
                  {chapter.cards.map((card) => (
                    <TarotCard
                      key={card.cardId}
                      cardId={card.cardId}
                      orientation={card.orientation}
                      faceUp
                      size="sm"
                      label={`${card.name} · ${card.orientation === "reversed" ? "역방향" : "정방향"}`}
                      className={s.storyCard}
                    />
                  ))}
                </div>
              ) : null}
              <div className={s.titleRow}>
                {chapter.saju ? <DayPillar dayPillar={chapter.saju.dayPillar} /> : null}
                <div className={s.titleText}>
                  <h2 id={titleId} className={s.title}>
                    {loading ? (
                      <>
                        <span className="sr-only">불러오는 중이에요</span>
                        <span className={s.skeletonTitle} aria-hidden="true" />
                      </>
                    ) : (
                      chapter.title
                    )}
                  </h2>
                  {chapter.saju ? <p className={s.meta}>{`일주 ${chapter.saju.dayPillar} · 일간 ${chapter.saju.dayMaster}`}</p> : null}
                  {chapter.cards.length > 0 ? <p className={s.meta}>{chapter.cards.map((card) => card.name).join(" · ")}</p> : null}
                </div>
              </div>
              {loading ? (
                <span className={s.skeletonLines} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <>
                  <p className={s.story}>{story}</p>
                  {plain && plain !== story ? (
                    <section className={s.plain} aria-labelledby={`${titleId}-plain`}>
                      <h3 id={`${titleId}-plain`} className={s.plainLabel}>
                        풀이
                      </h3>
                      <p className={s.plainText}>{plain}</p>
                    </section>
                  ) : null}
                  <Link href={chapter.href} className={s.more} aria-label={`${chapter.title} 풀이 전체 보기`}>
                    풀이 전체 보기
                    <ArrowIcon />
                  </Link>
                </>
              )}
            </article>
          </li>
        );
      })}
      {scenes.map((scene) => (
        <li key={scene.id} className={`${s.item} ${s.friendItem}`}>
          <p className={s.marker}>
            <span className={s.label}>친구 장면</span>
          </p>
          <FriendScene scene={scene} />
        </li>
      ))}
    </ol>
  );
}
