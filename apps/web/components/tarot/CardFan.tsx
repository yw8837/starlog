"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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
  const suppressClick = useRef(false);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const full = picked.length >= max;

  const canPick = (index: number) => !full && !picked.includes(index);

  const setActive = (index: number | null) => {
    activeRef.current = index;
    setActiveState(index);
  };

  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fan-index]");
    return el ? Number(el.dataset.fanIndex) : null;
  };

  const onPointerDown = (e: PointerEvent) => {
    suppressClick.current = false;
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
    if (index !== null && canPick(index)) {
      // The browser may follow with a click on the same card; that click must not un-pick it.
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 500);
      onPick(index);
    }
  };

  const stopScrub = () => {
    scrubbing.current = false;
    setActive(null);
  };

  const onClick = (index: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (canPick(index)) onPick(index);
  };

  const last = indexes.length - 1;
  const wide = indexes.length >= WIDE_FROM;
  const spread = wide ? WIDE_STEP_DEG * last : SPREAD_DEG;
  // The CSS fits the arc to the fan's width from the half-spread's sine and cosine.
  const halfSpread = (spread / 2) * (Math.PI / 180);
  const fanStyle = { "--sin": Math.sin(halfSpread).toFixed(4), "--cos": Math.cos(halfSpread).toFixed(4) } as CSSProperties;

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
        style={wide ? fanStyle : undefined}
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
              onClick={() => onClick(deckIndex)}
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
