"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { TarotCard } from "./TarotCard";
import s from "./CardFan.module.css";

type CardFanProps = {
  /** Cards in the shuffled deck. */
  count?: number;
  /** Face-down cards laid out in the arc, spread evenly through the deck. */
  visible?: number;
  /** Deck indexes picked so far, in tap order. */
  picked: number[];
  /** How many cards the spread needs. */
  max: number;
  /** Called with the deck index of an unpicked card while the spread still has room. */
  onPick: (index: number) => void;
};

const SPREAD_DEG = 54;
/**
 * A fan with at least this many cards opens into a wide arc, WIDE_STEP_DEG per card (21 cards: 150°),
 * with larger cards around a closer pivot, so every card keeps a comfortably tappable slice on a phone.
 */
const WIDE_FROM = 13;
const WIDE_STEP_DEG = 7.5;
/** A picked card's rise (CardFan.module.css: transform 220 ms, up to 32 px), with a margin. */
const RISE_GUARD_MS = 300;
const RISE_PX = 40;

/**
 * Inline CSS variables that fit a wide arc of `cards` cards to its box (with the `.box`, `.wideBox`
 * and `.wide` classes). ShuffleStage uses the full fan's (21) so its deck sits where the fan opens.
 */
export function wideArcStyle(cards = 21): CSSProperties {
  const half = ((WIDE_STEP_DEG * (cards - 1)) / 2) * (Math.PI / 180);
  return { "--sin": Math.sin(half).toFixed(4), "--cos": Math.cos(half).toFixed(4) } as CSSProperties;
}

/** Deck indexes shown in the fan: `visible` cards spread evenly through a deck of `count`. */
export function fanIndexes(count: number, visible: number): number[] {
  const n = Math.min(count, visible);
  return Array.from({ length: n }, (_, i) => Math.floor(((i + 0.5) * count) / n));
}

/**
 * Arc of face-down cards; a big fan (21) opens wide, edge to edge on a phone. Tap (or click, or
 * Enter) picks a card. On touch the finger can also slide along the arc: the card under it rises,
 * and lifting the finger picks that card, so the overlapped slivers never have to be hit exactly.
 * A picked card stays picked here (a second tap on it does nothing); taking a card back is the
 * parent's explicit undo. Vertical scrolling and pinch-zoom still work over the fan.
 */
export function CardFan({ count = 78, visible = 21, picked, max, onPick }: CardFanProps) {
  const indexes = fanIndexes(count, visible);
  const [active, setActiveState] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const [focusSlot, setFocusSlot] = useState(Math.floor(indexes.length / 2));
  const scrubbing = useRef(false);
  /** Until when (Date.now()) the click that follows a touch is ignored; 0 when none is. */
  const ignoreClickUntil = useRef(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  /** The last pick and when it was made (Date.now()). */
  const lastPick = useRef<{ index: number; at: number } | null>(null);
  const full = picked.length >= max;

  const canPick = (index: number) => !full && !picked.includes(index);

  const pick = (index: number) => {
    lastPick.current = { index, at: Date.now() };
    onPick(index);
  };

  /**
   * A picked card rises for 220 ms (CardFan.module.css). A tap or click that soon, on or just below
   * where that card is, is a re-tap on it: what the pointer now hits is the card that was behind it.
   */
  const reTapOnRisingCard = (x: number, y: number): boolean => {
    const last = lastPick.current;
    if (!last || Date.now() - last.at >= RISE_GUARD_MS) return false;
    const box = buttons.current[indexes.indexOf(last.index)]?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom + RISE_PX;
  };

  const setActive = (index: number | null) => {
    activeRef.current = index;
    setActiveState(index);
  };

  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fan-index]");
    return el ? Number(el.dataset.fanIndex) : null;
  };

  const onPointerDown = (e: PointerEvent) => {
    ignoreClickUntil.current = 0;
    if (e.pointerType === "mouse") return;
    scrubbing.current = true;
    setActive(indexAt(e.clientX, e.clientY));
  };

  const onPointerMove = (e: PointerEvent) => {
    if (scrubbing.current) setActive(indexAt(e.clientX, e.clientY));
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    // Pick the card the user sees raised; the raise itself can move it out from under the finger.
    const index = activeRef.current ?? indexAt(e.clientX, e.clientY);
    setActive(null);
    // A touch is decided here, on the card under the finger. The click the browser sends next is
    // ignored whether or not this picked: touch adjustment can retarget it to a neighbour (a re-tap
    // on a picked, lifted card would otherwise pick the card beside it). A deadline, not a timer, so
    // an earlier tap's wait cannot end this one's.
    ignoreClickUntil.current = Date.now() + 500;
    if (index !== null && canPick(index) && !reTapOnRisingCard(e.clientX, e.clientY)) pick(index);
  };

  const stopScrub = () => {
    scrubbing.current = false;
    setActive(null);
  };

  const onClick = (index: number, e: MouseEvent) => {
    if (Date.now() < ignoreClickUntil.current) return;
    // detail 0: Enter or Space, which has no pointer position to doubt.
    if (e.detail !== 0 && reTapOnRisingCard(e.clientX, e.clientY)) return;
    if (canPick(index)) pick(index);
  };

  const last = indexes.length - 1;
  const wide = indexes.length >= WIDE_FROM;
  const spread = wide ? WIDE_STEP_DEG * last : SPREAD_DEG;

  // Roving focus: one tab stop for the whole fan; arrow keys move along the arc, Home/End jump to its ends.
  const onKeyDown = (e: KeyboardEvent, slot: number) => {
    const target =
      e.key === "ArrowRight" ? slot + 1 : e.key === "ArrowLeft" ? slot - 1 : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (target === null) return;
    e.preventDefault();
    const next = Math.min(last, Math.max(0, target));
    setFocusSlot(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className={wide ? `${s.box} ${s.wideBox}` : s.box}>
      <div
        className={wide ? `${s.fan} ${s.wide}` : s.fan}
        style={wide ? wideArcStyle(indexes.length) : undefined}
        role="group"
        aria-label={`카드 ${indexes.length}장 중 ${max}장 고르기`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={stopScrub}
        onPointerLeave={stopScrub}
      >
        {indexes.map((deckIndex, slot) => {
          const order = picked.indexOf(deckIndex);
          const isPicked = order >= 0;
          const angle = last === 0 ? 0 : -spread / 2 + (spread * slot) / last;
          // --d: distance from the middle, so a wide fan deals out from its centre.
          const style = { "--angle": `${angle.toFixed(2)}deg`, "--i": slot, "--d": Math.abs(slot - last / 2) } as CSSProperties;
          const classes = [s.slot, isPicked ? s.picked : "", active === deckIndex && !isPicked ? s.active : "", full && !isPicked ? s.dim : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={deckIndex}
              ref={(el) => {
                buttons.current[slot] = el;
              }}
              type="button"
              className={classes}
              style={style}
              data-fan-index={deckIndex}
              tabIndex={slot === focusSlot ? 0 : -1}
              aria-pressed={isPicked}
              aria-disabled={!canPick(deckIndex)}
              aria-label={isPicked ? `${order + 1}번째로 고른 카드` : `카드 ${slot + 1}`}
              onClick={(e) => onClick(deckIndex, e)}
              onFocus={() => setFocusSlot(slot)}
              onKeyDown={(e) => onKeyDown(e, slot)}
            >
              <TarotCard faceUp={false} size="sm" highlight={isPicked} className={s.card} />
              {isPicked ? (
                <span className={s.badge} aria-hidden="true">
                  {order + 1}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
