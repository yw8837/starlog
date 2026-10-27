"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { BOT_CHECK_LINE, timeFraction, waitLine, type ChecklistStep, type WaitKind } from "@/lib/reading/progress";
import { useBotCheck } from "@/lib/reading/useBotCheck";
import { useElapsed } from "@/lib/reading/useElapsed";
import type { TipCard } from "@/lib/reading/waitingTips";
import s from "./GeneratingState.module.css";

/** A card stays this long before the next one slides in. */
const ADVANCE_MS = 7000;
/** One page turn (the slide's CSS transition). */
const SLIDE_MS = 400;
/** A drag this far sideways turns the card; a shorter one springs back. */
const SWIPE_PX = 40;

type GeneratingStateProps = {
  /** Tarot: the cat reads, the rabbit librarian writes. Saju: roles swap, both in hanbok. */
  mode?: "tarot" | "saju";
  /** What is being generated: its usual length sets the line under the bar and how the bar creeps. */
  kind: WaitKind;
  /** What is being written now (from the stream's section events). */
  caption: string;
  /** 0..1 from the stream; the bar shows the larger of this and the time's share, so it never stands still. */
  fraction: number;
  /** A full reading's steps (checklist() in lib/reading/progress.ts): the first card names the one being written; page only. */
  steps?: readonly ChecklistStep[];
  /** 기다리는 동안 cards (lib/reading/waitingTips.ts) after it; page only. */
  tips?: readonly TipCard[];
  /**
   * `page`: the whole screen while a full reading is written (the page's only heading).
   * `inline`: in place of the text that is on its way, under the cards already shown.
   */
  layout?: "page" | "inline";
  /** The page keeps its own stable live region; this caption then stays plain text. */
  live?: boolean;
};

type Slide = { label: string; title?: string; text?: string; count?: string };

/**
 * Waiting screen while a reading is written: the leader reads; the assistant joins near the end. The page
 * layout is a game loader: the characters on top, a carousel of cards (the part being written, then tips),
 * the progress at the bottom. The clock starts with this screen (when the generation starts) and runs on
 * through a quality retry. Only the caption may be a live region: the clock and the cards change quietly.
 */
export function GeneratingState({ mode = "tarot", kind, caption, fraction, steps = [], tips = [], layout = "page", live = true }: GeneratingStateProps) {
  const inline = layout === "inline";
  const size = inline ? 120 : 188;
  const late = fraction >= 0.7;
  const checking = useBotCheck();
  const elapsed = useElapsed(checking);
  // Both only grow, so the bar never moves back.
  const shown = Math.max(fraction, timeFraction(kind, elapsed));

  // 지금 적는 중: the step being written (the last one once all are written), "n / total".
  const at = steps.findIndex((step) => step.state === "now");
  const current = at >= 0 ? at : steps.length - 1;
  const slides: Slide[] = inline
    ? []
    : [...(steps.length > 0 ? [{ label: "지금 적는 중", title: steps[current]!.label, count: `${current + 1} / ${steps.length}` }] : []), ...tips];

  return (
    <section className={inline ? `${s.stage} ${s.inline}` : `${s.stage} ${s.page}`} aria-labelledby="generating-title" aria-busy="true">
      {/* The page's only heading while a full reading is written; inline, a section heading. */}
      {inline ? (
        <h2 id="generating-title" className="sr-only">
          풀이를 적고 있어요
        </h2>
      ) : (
        <h1 id="generating-title" className="sr-only">
          풀이를 적고 있어요
        </h1>
      )}
      <div className={s.characters}>
        <span className={s.glow} aria-hidden="true" />
        {mode === "tarot" ? (
          <Cat outfit="tarot" action="glow" expression="focus" size={size} reactOnTap={false} />
        ) : (
          <Rabbit outfit="hanbok" expression="focus" size={size} reactOnTap={false} />
        )}
        {late && !inline ? (
          <span className={s.rabbit}>
            {mode === "tarot" ? (
              <Rabbit outfit="tarot" action="write" expression="focus" size={112} reactOnTap={false} />
            ) : (
              <Cat outfit="hanbok" expression="happy" size={112} reactOnTap={false} />
            )}
          </span>
        ) : null}
      </div>
      {slides.length > 0 ? <Cards slides={slides} /> : null}
      <div className={s.status}>
        <p id="generating-caption" className={s.caption} role={live ? "status" : undefined}>
          {/* Re-keyed per caption to replay its fade. */}
          <span key={caption} className={s.captionText}>
            {caption}
          </span>
        </p>
        <div className={s.track} aria-hidden="true">
          <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.04, shown)})` }} />
        </div>
        <p className={s.hint}>
          <span className={s.elapsed}>{checking ? BOT_CHECK_LINE : waitLine(kind, elapsed)}</span>
          {inline ? null : <span className={s.stay}>이 화면을 열어 둔 채로 기다려 주세요.</span>}
        </p>
      </div>
    </section>
  );
}

/**
 * 기다리는 동안: one card at a time, turned like a page every ADVANCE_MS, round and round; a swipe or a dot
 * turns it too, and a finger or the pointer on it holds it still. Three panes (the card, and the ones beside
 * it) slide in a strip; after a turn the strip recentres on the new card without moving. Under reduced
 * motion globals.css drops the transition, so a turn is a plain swap. Never a live region.
 */
function Cards({ slides }: { slides: readonly Slide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  /** The turn under way: towards the next pane (1) or the previous (-1), showing `incoming`. */
  const [turn, setTurn] = useState<{ dir: 1 | -1; incoming: number } | null>(null);
  /** The strip slides (a turn, or springing back after a short drag). */
  const [moving, setMoving] = useState(false);
  /** Sideways drag in px while a finger or the mouse holds the card. */
  const [drag, setDrag] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const grab = useRef<{ id: number; x: number; y: number } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const wrap = (i: number) => (i + count) % count;
  const after = (done: () => void) => {
    clearTimeout(settle.current);
    settle.current = setTimeout(done, SLIDE_MS);
  };
  const go = (dir: 1 | -1, target = wrap(index + dir)) => {
    if (turn || count < 2) return;
    setDrag(null);
    setTurn({ dir, incoming: target });
    setMoving(true);
    after(() => {
      setIndex(target);
      setTurn(null);
      setMoving(false);
    });
  };

  const paused = hovered || drag !== null;
  useEffect(() => {
    if (paused || turn || count < 2) return;
    const timer = setTimeout(() => go(1), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [paused, turn, count, index]); // go reads this render's index

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (turn || count < 2) return;
    grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(0);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (grab.current?.id === e.pointerId) setDrag(e.clientX - grab.current.x);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (grab.current?.id !== e.pointerId) return;
    const dx = e.clientX - grab.current.x;
    const dy = e.clientY - grab.current.y;
    grab.current = null;
    // A turn is a release far enough sideways, more sideways than up or down. A cancel (the page took the
    // touch to scroll) is never one: its position may be (0, 0). Anything else springs back (M-02).
    if (e.type === "pointerup" && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    setDrag(null);
    setMoving(true);
    after(() => setMoving(false));
  };

  const panes = [turn?.dir === -1 ? turn.incoming : wrap(index - 1), index, turn?.dir === 1 ? turn.incoming : wrap(index + 1)];
  const offset = -100 * (1 + (turn?.dir ?? 0));

  return (
    <div
      className={s.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="기다리는 동안 읽을거리"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className={s.viewport} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div
          className={s.strip}
          aria-live="off"
          style={{ transform: `translateX(calc(${offset}% + ${drag ?? 0}px))`, transition: moving && drag === null ? `transform ${SLIDE_MS}ms ease` : "none" }}
        >
          {panes.map((at, pane) => {
            const slide = slides[at]!;
            const shownPane = pane === 1;
            return (
              <div
                key={pane}
                className={s.slide}
                role={shownPane ? "group" : undefined}
                aria-roledescription={shownPane ? "slide" : undefined}
                aria-label={shownPane ? `${count}장 중 ${at + 1}번째` : undefined}
                aria-hidden={shownPane ? undefined : true}
              >
                <p className={s.slideLabel}>{slide.label}</p>
                {slide.title ? <p className={s.slideTitle}>{slide.title}</p> : null}
                {slide.text ? <p className={s.slideText}>{slide.text}</p> : null}
                {slide.count ? <p className={s.slideCount}>{slide.count}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
      {count > 1 ? (
        <div className={s.dots}>
          {slides.map((_, at) => (
            <button
              key={at}
              type="button"
              className={s.dot}
              aria-label={`${at + 1}번째 카드`}
              aria-current={at === index ? "true" : undefined}
              onClick={() => at !== index && go(at > index ? 1 : -1, at)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
