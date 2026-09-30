import { branchElement, stemElement } from "@starlog/core";
import Link from "next/link";
import { ELEMENT_KEY } from "@/components/saju/elements";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { ReadingMode } from "@/components/tarot/StoryToggle";
import type { FriendScene as FriendSceneData, StoryChapter } from "@/lib/fixtures";
import { FriendScene } from "./FriendScene";
import s from "./Timeline.module.css";

type TimelineProps = {
  chapters: StoryChapter[];
  /** Friend scenes: approved ones sit in the story, pending ones wait for the owner's decision. */
  scenes: FriendSceneData[];
  mode: ReadingMode;
  /** A chapter still being read in the browser: a skeleton with an accessible name stands in for it. */
  loadingId?: string;
};

const KIND_LABEL = { saju: "사주", tarot: "타로" } as const;

function ChapterVisual({ chapter }: { chapter: StoryChapter }) {
  if (chapter.saju) {
    const [stem = "", branch = ""] = Array.from(chapter.saju.dayPillar);
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
  return (
    <span className={s.cards} aria-hidden="true">
      {chapter.cards.map((card) => (
        <TarotCard key={card.cardId} cardId={card.cardId} orientation={card.orientation} faceUp size="sm" className={s.miniCard} />
      ))}
    </span>
  );
}

/** The story so far: chapters in order (prologue first), then the scenes friends left. */
export function Timeline({ chapters, scenes, mode, loadingId }: TimelineProps) {
  return (
    <ol className={s.timeline} aria-label="이야기 목차">
      {chapters.map((chapter) => {
        const loading = chapter.id === loadingId;
        return (
          <li key={chapter.id} className={s.item}>
            <p className={s.marker}>
              <span className={s.label}>{chapter.label}</span>
              <span className={s.kind}>{KIND_LABEL[chapter.kind]}</span>
            </p>
            <article className={s.card} aria-busy={loading || undefined}>
              <ChapterVisual chapter={chapter} />
              <div className={s.text}>
                <h2 className={s.title}>
                  {/* The link covers the whole card; its name stays just the title. */}
                  <Link href={chapter.href} className={s.link}>
                    {loading ? (
                      <>
                        <span className="sr-only">불러오는 중이에요</span>
                        <span className={s.skeletonTitle} aria-hidden="true" />
                      </>
                    ) : (
                      chapter.title
                    )}
                  </Link>
                </h2>
                {chapter.saju ? <p className={s.meta}>{`일주 ${chapter.saju.dayPillar} · 일간 ${chapter.saju.dayMaster}`}</p> : null}
                {chapter.cards.length > 0 ? <p className={s.meta}>{chapter.cards.map((card) => card.name).join(" · ")}</p> : null}
                {loading ? (
                  <span className={s.skeletonLines} aria-hidden="true">
                    <span />
                    <span />
                  </span>
                ) : (
                  <p className={s.excerpt}>{mode === "story" ? chapter.excerpt.story : chapter.excerpt.plain}</p>
                )}
                <span className={s.more} aria-hidden="true">
                  이어 읽기
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                    <path d="M9 5.5 15.5 12 9 18.5" />
                  </svg>
                </span>
              </div>
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
