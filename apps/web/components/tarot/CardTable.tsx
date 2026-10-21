"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import btn from "@/components/ui/Button.module.css";
import { backImage, useDeckPrefs } from "@/lib/deck";
import { prefersReducedMotion } from "@/lib/motion";
import s from "./CardTable.module.css";

export type TableMode = "scatter" | "ring";

/** This device's choice of 흩뿌리기 or 돌리기 (localStorage). */
export const TABLE_MODE_KEY = "starlog.draw.mode";

const MODES: ReadonlyArray<readonly [TableMode, string]> = [
  ["scatter", "흩뿌리기"],
  ["ring", "돌리기"],
];

// The owner-approved prototype's timings (v3, 2026-10-21).
const GATHER_MS = 650;
const GATHER_WAIT_MS = 800;
const CUT_MS = 420;
const CUT_WAIT_MS = 480;
const RIFFLE_MS = 400;
const RIFFLE_WAIT_MS = 520;
const SPREAD_MS = 1000;
const SPREAD_STAGGER_MS = 7;
const FLIGHT_MS = 850;
/** After a pick on the ring, the cards left close the gap after this pause. */
const CLOSE_GAP_MS = 250;
/** An arrow key turns the ring this quickly (CardTable.module.css: [data-turn]). */
const TURN_MS = 300;
/** A press that travels farther than this is a drag, not a tap. */
const SLOP_PX = 7;
/** Degrees the ring turns per pixel dragged. */
const DEG_PER_PX = 0.16;
/** The click a browser sends after a pointer press belongs to that press, which pointerup already decided. */
const CLICK_AFTER_POINTER_MS = 600;
/**
 * A tap this soon on the card just picked (where it was) is the same tap twice, a double tap: the card has
 * left for its slot and the one under it is on top now. As CardFan guarded a re-tap on its rising card.
 */
const RETAP_MS = 300;
/** On the ring, a card this near the top is in view (the stage shows about ±37° of it on a phone). */
const IN_VIEW_DEG = 30;

type CardTableProps = {
  /** Cards in the shuffled deck, all face down on the table. */
  count?: number;
  /** Deck indexes picked so far, in pick order. */
  picked: number[];
  /** How many cards the spread needs. */
  max: number;
  /** Called with the deck index of a card left on the table while the spread still has room. */
  onPick: (index: number) => void;
  /** Where the nth pick (0-based) lands: the card flies there and leaves the table. Without it a picked card stays on the table, raised. */
  slotFor?: (order: number) => Element | null;
  /** 다시 섞기 has gathered, riffled and spread the cards left (the picks stayed). */
  onReshuffled?: () => void;
  /** The cards are being shuffled (true) or are down again (false): the page holds its own input meanwhile (the undo). */
  onShufflingChange?: (shuffling: boolean) => void;
  /** Takes no picks and no reshuffle (e.g. while the picks are being dealt). */
  disabled?: boolean;
  /** No deal-out, shuffle or flight animations (tests). */
  instant?: boolean;
};

/** Where a card lies on the table: x and y as fractions of the room it has, r its turn in degrees. */
type Spot = { x: number; y: number; r: number };
/** The ring's order, each card's spot on the table and the table's stacking order (bottom first). */
type Deal = { order: number[]; spots: Spot[]; stack: number[] };
type Geometry = { w: number; h: number; cw: number; ch: number; radius: number; pivot: number };
type Press = { id: number; x: number; y: number; from: number; moved: boolean; lastX: number; lastT: number };
type Flight = { el: HTMLElement; target: HTMLElement; timer: number };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function shuffled<T>(list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const jitter = (spread: number) => (Math.random() - 0.5) * spread;
const newSpot = (): Spot => ({ x: 0.08 + Math.random() * 0.84, y: 0.06 + Math.random() * 0.88, r: Math.random() * 70 - 35 });
const deal = (count: number): Deal => ({ order: shuffled(range(count)), spots: range(count).map(() => newSpot()), stack: shuffled(range(count)) });

/** An angle in -180..180. */
const wrap = (deg: number) => (((deg % 360) + 540) % 360) - 180;

/** Each card on the ring (all but the ones that flew to their slots) and how far it is turned from the top. */
function ringTurns(order: readonly number[], picked: readonly number[], flies: boolean, offset: number): Map<number, number> {
  const ring = order.filter((i) => !flies || !picked.includes(i));
  return new Map(ring.map((i, rank) => [i, wrap(rank * (360 / ring.length) + offset)]));
}

/** Of the cards left to pick, the one nearest the top of the ring. */
function topOf(turns: Map<number, number>, picked: readonly number[]): number | null {
  let best: number | null = null;
  let nearest = Infinity;
  for (const [i, turn] of turns) {
    if (!picked.includes(i) && Math.abs(turn) < nearest) {
      nearest = Math.abs(turn);
      best = i;
    }
  }
  return best;
}

function measure(stage: HTMLElement): Geometry {
  // jsdom measures nothing: lay out as on a phone.
  const w = stage.clientWidth || 340;
  const h = stage.clientHeight || 280;
  const cw = Math.round(Math.min(64, Math.max(44, w / 6.2)));
  const ch = (cw * 1040) / 600;
  const radius = Math.max(280, w * 0.95);
  // The top card's centre sits ch/2 + 24px down, leaving room for a raised card and its focus ring.
  return { w, h, cw, ch, radius, pivot: ch / 2 + 24 + radius };
}

const pose = (x: number, y: number, r: number) => `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
const ringPose = (t: number, g: Geometry) =>
  `translate(-50%, -50%) translateY(${g.pivot.toFixed(1)}px) rotate(${t.toFixed(2)}deg) translateY(${(-g.radius).toFixed(1)}px)`;

function savedMode(): TableMode {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(TABLE_MODE_KEY) === "ring" ? "ring" : "scatter";
  } catch {
    return "scatter";
  }
}

function saveMode(mode: TableMode): void {
  try {
    window.localStorage.setItem(TABLE_MODE_KEY, mode);
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

const ShuffleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8C14.3 15 15.5 16 17.5 16H21" />
    <path d="M3 16h3.5c1.3 0 2.3-.5 3.1-1.3" />
    <path d="M13.4 8.3C14.2 7.5 15.2 7 16.5 7H21" />
    <path d="m18 4 3 3-3 3" />
    <path d="m18 13 3 3-3 3" />
  </svg>
);

/**
 * All the deck's cards face down on a table, in one of two ways the visitor can switch between at any
 * time (remembered on this device): 흩뿌리기 scatters them at random spots and turns, overlapping, and a
 * tap picks the card on top under the finger; 돌리기 lays them on a large ring whose top shows, turned
 * by dragging sideways (with a little inertia) or with the arrow keys. A picked card flies to its slot
 * (`slotFor`) and the ring closes the gap. 다시 섞기 keeps the picks and shuffles only the cards left,
 * visibly: they gather into a pile, are cut and riffled twice, and spread again. Face-down picks are
 * random anyway, so which sliver a finger lands on never matters. Cards move by transform only; the
 * positions are written straight to the cards, outside React, so a drag never re-renders 78 buttons.
 */
export function CardTable({ count = 78, picked, max, onPick, slotFor, onReshuffled, onShufflingChange, disabled = false, instant = false }: CardTableProps) {
  const { back } = useDeckPrefs();
  const backSrc = backImage(back, "sm");
  const [mode, setMode] = useState<TableMode>(savedMode);
  const [table, setTable] = useState<Deal>(() => deal(count));
  const [busy, setBusy] = useState(false);
  const [focusCard, setFocusCard] = useState<number | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLButtonElement | null>>([]);
  const geo = useRef<Geometry | null>(null);
  /** The ring's turn in degrees. */
  const offset = useRef(0);
  const timers = useRef(new Set<number>());
  const flights = useRef(new Set<Flight>());
  /** Where each card just picked was (its centre and turn), until its flight starts. */
  const takeoffs = useRef(new Map<number, { x: number; y: number; r: number }>());
  const press = useRef<Press | null>(null);
  const lifted = useRef<number | null>(null);
  const velocity = useRef(0);
  const spin = useRef(0);
  const pointerAt = useRef(0);
  /** A card picked with the keyboard: focus moves on to a card still on the table. */
  const keyPick = useRef<number | null>(null);
  /** The last card a tap picked: when, and its box on screen then. */
  const lastTap = useRef<{ at: number; box: DOMRect } | null>(null);
  const pickedBefore = useRef(picked.length);

  const flies = slotFor !== undefined;
  const full = picked.length >= max;
  const frozen = busy || disabled || full;
  const free = (i: number) => !picked.includes(i);
  // One tab stop for the whole table; on the ring always a card in view (the focused one, or else the one on top).
  const turns = mode === "ring" ? ringTurns(table.order, picked, flies, offset.current) : null;
  const tabStop = turns
    ? focusCard !== null && free(focusCard) && Math.abs(turns.get(focusCard) ?? 180) < IN_VIEW_DEG
      ? focusCard
      : (topOf(turns, picked) ?? table.order[0]!)
    : focusCard !== null && free(focusCard)
      ? focusCard
      : (table.order.find(free) ?? table.order[0]!);

  // What timers, frames and window events read: the latest render's values.
  const latest = useRef({ mode, table, picked, flies, busy });
  useLayoutEffect(() => {
    latest.current = { mode, table, picked, flies, busy };
  });

  const quiet = () => instant || prefersReducedMotion();

  const later = (run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  };

  /** Cards on the ring: all but the ones that flew to their slots. */
  const ringCards = () => {
    const { table: t, picked: p, flies: f } = latest.current;
    return t.order.filter((i) => !f || !p.includes(i));
  };

  /** Writes every card's place for the current mode (CSS transitions carry them there). */
  const layout = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const g = (geo.current ??= measure(stage));
    stage.style.setProperty("--cw", `${g.cw}px`);
    const { mode: m, table: t, picked: p } = latest.current;
    const ring = ringCards();
    const step = 360 / Math.max(1, ring.length);
    const stacked = new Map(t.stack.map((i, k) => [i, k + 1]));
    ring.forEach((i, rank) => {
      const el = cards.current[i];
      if (!el) return;
      let transform: string;
      let z: number;
      if (m === "ring") {
        const turn = wrap(rank * step + offset.current);
        transform = ringPose(turn, g);
        // Right over left, like a deck spread by hand.
        z = Math.round((turn + 180) * 10);
      } else {
        const spot = t.spots[i]!;
        transform = pose((spot.x - 0.5) * g.w, spot.y * (g.h - g.ch) + g.ch / 2, spot.r);
        z = stacked.get(i) ?? 0;
      }
      // A pick with no slot to fly to stays where it was, raised over the rest.
      if (p.includes(i)) {
        transform += " translateY(-14px) scale(1.12)";
        z = 5000;
      }
      el.style.transform = transform;
      el.style.zIndex = String(z);
    });
  };

  /** Runs `place` with transitions off, so the cards jump there. */
  const instantly = (place: () => void) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setAttribute("data-drag", "");
    place();
    void stage.offsetWidth;
    stage.removeAttribute("data-drag");
  };

  /** A card's turn where it lies now. */
  const turnOf = (i: number): number => {
    const { mode: m, table: t } = latest.current;
    if (m === "scatter") return t.spots[i]!.r;
    const ring = ringCards();
    return wrap(ring.indexOf(i) * (360 / ring.length) + offset.current);
  };

  /** The card nearest the top of the ring that can still be picked. */
  const topOfRing = (): number | null => {
    const { table: t, picked: p, flies: f } = latest.current;
    return topOf(ringTurns(t.order, p, f, offset.current), p);
  };

  /** The cards the arrow keys walk through: around the ring, or left to right on the table. */
  const walk = (): number[] => {
    const { mode: m, table: t, picked: p } = latest.current;
    const left = t.order.filter((i) => !p.includes(i));
    return m === "ring" ? left : left.sort((a, b) => t.spots[a]!.x - t.spots[b]!.x);
  };

  const land = (flight: Flight) => {
    window.clearTimeout(flight.timer);
    flight.target.style.visibility = "";
    flight.el.remove();
    flights.current.delete(flight);
  };

  /** A copy of the card travels from where it lay to its slot, which shows once it lands. */
  const fly = (from: { x: number; y: number; r: number }, target: HTMLElement) => {
    const g = geo.current;
    if (!g) return;
    const to = target.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = s.fly ?? "";
    el.dataset.flying = "";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
      left: `${from.x - g.cw / 2}px`,
      top: `${from.y - g.ch / 2}px`,
      width: `${g.cw}px`,
      height: `${g.ch}px`,
      backgroundImage: `url(${backSrc})`,
      transform: `rotate(${from.r.toFixed(2)}deg)`,
    });
    document.body.appendChild(el);
    target.style.visibility = "hidden";
    // Paint the start pose before the trip begins.
    void el.offsetWidth;
    const scale = to.width > 0 ? to.width / g.cw : 1;
    el.style.transform = `translate(${(to.left + to.width / 2 - from.x).toFixed(1)}px, ${(to.top + to.height / 2 - from.y).toFixed(1)}px) scale(${scale.toFixed(3)})`;
    const flight: Flight = { el, target, timer: 0 };
    flight.timer = window.setTimeout(() => land(flight), FLIGHT_MS + 50);
    flights.current.add(flight);
  };

  /** Picks a card left on the table; false when the table takes no pick now. */
  const pick = (i: number, byKey: boolean): boolean => {
    if (frozen || !free(i)) return false;
    if (flies && !quiet()) {
      const box = cards.current[i]?.getBoundingClientRect();
      if (box) takeoffs.current.set(i, { x: box.left + box.width / 2, y: box.top + box.height / 2, r: turnOf(i) });
    }
    if (byKey && flies) {
      // Focus goes on to the card after it (the card itself leaves the table).
      const order = walk();
      const rest = order.filter((c) => c !== i);
      if (rest.length) setFocusCard(rest[order.indexOf(i) % rest.length]!);
      keyPick.current = i;
    }
    onPick(i);
    return true;
  };

  // The table opens: from one pile in the middle (where the shuffle left the deck) the cards spread out.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const g = (geo.current = measure(stage));
    if (quiet()) {
      instantly(layout);
      return;
    }
    const all = ringCards();
    instantly(() =>
      all.forEach((i, k) => {
        const el = cards.current[i];
        if (!el) return;
        el.style.transform = pose(jitter(36), g.h / 2 + jitter(24), jitter(40));
        el.style.zIndex = String(k);
      }),
    );
    all.forEach((i, k) => {
      const el = cards.current[i];
      if (el) el.style.transition = `transform ${SPREAD_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) ${k * SPREAD_STAGGER_MS}ms`;
    });
    layout();
    const clear = () => all.forEach((i) => cards.current[i]?.style.setProperty("transition", ""));
    const timer = window.setTimeout(clear, SPREAD_MS + all.length * SPREAD_STAGGER_MS);
    return () => {
      window.clearTimeout(timer);
      clear();
    };
    // Once, when the table opens.
  }, []);

  // A pick, the undo, a new mode or a reshuffled deal: the cards move to their new places.
  useLayoutEffect(() => {
    const grew = picked.length > pickedBefore.current;
    pickedBefore.current = picked.length;
    for (const [i, from] of takeoffs.current) {
      takeoffs.current.delete(i);
      const order = picked.indexOf(i);
      const target = order >= 0 ? slotFor?.(order) : null;
      if (target instanceof HTMLElement) fly(from, target);
    }
    if (grew && mode === "ring" && flies && !quiet()) {
      // Not over a shuffle that began in the meantime: its spread lays the ring out.
      const timer = window.setTimeout(() => {
        if (!latest.current.busy) layout();
      }, CLOSE_GAP_MS);
      return () => window.clearTimeout(timer);
    }
    layout();
  }, [picked, mode, table]);

  // A card picked with the keyboard left the table: focus the card after it.
  useEffect(() => {
    const i = keyPick.current;
    keyPick.current = null;
    if (i === null || !picked.includes(i)) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== cards.current[i]) return;
    cards.current[tabStop]?.focus({ preventScroll: true });
  }, [picked]);

  // A new screen width lays the table out again at once; nothing in flight is left behind.
  useEffect(() => {
    const onResize = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const before = geo.current;
      const g = measure(stage);
      if (before && before.w === g.w && before.h === g.h) return;
      geo.current = g;
      if (!latest.current.busy) instantly(layout);
    };
    window.addEventListener("resize", onResize);
    const pending = timers.current;
    const inFlight = flights.current;
    return () => {
      window.removeEventListener("resize", onResize);
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
      inFlight.forEach(land);
      cancelAnimationFrame(spin.current);
    };
  }, []);

  const lift = (i: number | null) => {
    if (lifted.current !== null) cards.current[lifted.current]?.removeAttribute("data-lift");
    lifted.current = i;
    if (i !== null) cards.current[i]?.setAttribute("data-lift", "");
  };

  const cardAt = (x: number, y: number): number | null => {
    const hit = document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-card]");
    return hit && stageRef.current?.contains(hit) ? Number(hit.dataset.card) : null;
  };

  /** The ring comes to rest: transitions are back, and Tab enters at the card on top. */
  const settle = () => {
    spin.current = 0;
    stageRef.current?.removeAttribute("data-drag");
    const top = topOfRing();
    if (top !== null) setFocusCard(top);
  };

  const stopSpin = () => {
    if (!spin.current) return;
    cancelAnimationFrame(spin.current);
    spin.current = 0;
    stageRef.current?.removeAttribute("data-drag");
  };

  /** After a flick the ring keeps turning a little, slowing down. */
  const coast = () => {
    if (quiet() || Math.abs(velocity.current) < 0.2) return settle();
    const frame = () => {
      velocity.current *= 0.94;
      offset.current += velocity.current;
      layout();
      if (Math.abs(velocity.current) > 0.05) spin.current = requestAnimationFrame(frame);
      else settle();
    };
    spin.current = requestAnimationFrame(frame);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    stopSpin();
    velocity.current = 0;
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: offset.current, moved: false, lastX: e.clientX, lastT: e.timeStamp };
    lift(cardAt(e.clientX, e.clientY));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    if (!p.moved) {
      if (Math.hypot(dx, e.clientY - p.y) <= SLOP_PX) return;
      p.moved = true;
      lift(null);
      if (mode === "ring") {
        try {
          stageRef.current?.setPointerCapture?.(e.pointerId);
        } catch {
          // A pointer the browser no longer tracks: the drag still follows it while it is over the table.
        }
        stageRef.current?.setAttribute("data-drag", "");
      }
    }
    if (mode !== "ring") return;
    const dt = Math.max(1, e.timeStamp - p.lastT);
    velocity.current = (((e.clientX - p.lastX) * DEG_PER_PX) / dt) * 16;
    p.lastX = e.clientX;
    p.lastT = e.timeStamp;
    offset.current = p.from + dx * DEG_PER_PX;
    layout();
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    press.current = null;
    pointerAt.current = Date.now();
    if (!p.moved) {
      // The card the finger came down on (it was raised), or else the one on top under it now.
      const i = lifted.current ?? cardAt(e.clientX, e.clientY);
      lift(null);
      const last = lastTap.current;
      const { clientX: x, clientY: y } = e;
      if (last && Date.now() - last.at < RETAP_MS && x >= last.box.left && x <= last.box.right && y >= last.box.top && y <= last.box.bottom) return;
      const box = i !== null ? cards.current[i]?.getBoundingClientRect() : undefined;
      if (i !== null && pick(i, false) && box) lastTap.current = { at: Date.now(), box };
      return;
    }
    if (mode === "ring") coast();
  };

  const onPointerCancel = () => {
    press.current = null;
    lift(null);
    stageRef.current?.removeAttribute("data-drag");
  };

  /** Keyboard (Enter or Space) and assistive tech: a click no pointer press has already decided. */
  const onCardClick = (i: number) => {
    if (Date.now() - pointerAt.current < CLICK_AFTER_POINTER_MS) return;
    pick(i, true);
  };

  /** Brings a card to the top of the ring. */
  const turnTo = (i: number) => {
    const ring = ringCards();
    const rank = ring.indexOf(i);
    if (rank < 0) return;
    offset.current += wrap(-rank * (360 / ring.length) - offset.current);
    const stage = stageRef.current;
    stage?.setAttribute("data-turn", "");
    layout();
    later(() => stage?.removeAttribute("data-turn"), TURN_MS);
  };

  // Arrows move focus through the cards left (turning the ring to bring it on top); Home and End jump to the ends.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).dataset?.card;
    if (from === undefined || busy) return;
    const order = walk();
    if (!order.length) return;
    const at = order.indexOf(Number(from));
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? order[(at + 1) % order.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? order[(at - 1 + order.length) % order.length]
          : e.key === "Home"
            ? order[0]
            : e.key === "End"
              ? order[order.length - 1]
              : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setFocusCard(next);
    if (mode === "ring") turnTo(next);
    cards.current[next]?.focus({ preventScroll: true });
  };

  const choose = (next: TableMode) => {
    if (busy || next === mode) return;
    setMode(next);
    saveMode(next);
    if (next === "ring") {
      const top = topOfRing();
      if (top !== null) setFocusCard(top);
    }
  };

  /** The cards left in a new order on the ring and at new spots on the table; the picks keep theirs. */
  const redeal = (): Deal => {
    const { table: t, picked: p } = latest.current;
    return {
      order: [...shuffled(t.order.filter((i) => !p.includes(i))), ...t.order.filter((i) => p.includes(i))],
      spots: t.spots.map((spot, i) => (p.includes(i) ? spot : newSpot())),
      stack: shuffled(t.stack),
    };
  };

  // 다시 섞기: the cards left gather into a loose pile, are cut in two and riffled together twice, then
  // spread again. Input waits until they are down.
  const reshuffle = () => {
    if (frozen) return;
    if (quiet()) {
      setTable(redeal());
      onReshuffled?.();
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    // A flick still coasting would carry the ring over the pile.
    stopSpin();
    press.current = null;
    setBusy(true);
    onShufflingChange?.(true);
    lift(null);
    const g = (geo.current ??= measure(stage));
    const middle = g.h / 2;
    const left = () => latest.current.table.order.filter((i) => !latest.current.picked.includes(i));
    const move = (i: number, x: number, y: number, r: number, ms: number, delay: number, z?: number) => {
      const el = cards.current[i];
      if (!el) return;
      el.style.transition = `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`;
      el.style.transform = pose(x, y, r);
      if (z !== undefined) el.style.zIndex = String(z);
    };
    const cut = () =>
      left().forEach((i, k) => {
        const side = k % 2 ? 1 : -1;
        move(i, side * g.w * 0.22 + jitter(10), middle + jitter(10), side * 14 + jitter(6), CUT_MS, 0);
      });
    const riffle = () => shuffled(left()).forEach((i, k) => move(i, jitter(14), middle - k * 0.35 + 12, jitter(10), RIFFLE_MS, k * 2, k));
    const spread = () => {
      left().forEach((i, k) => {
        const el = cards.current[i];
        if (el) el.style.transition = `transform ${SPREAD_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) ${k * SPREAD_STAGGER_MS}ms`;
      });
      setTable(redeal());
    };
    const done = () => {
      cards.current.forEach((el) => el?.style.setProperty("transition", ""));
      setBusy(false);
      onShufflingChange?.(false);
      onReshuffled?.();
    };

    const n = left().length;
    left().forEach((i, k) => move(i, jitter(36), middle + jitter(24), jitter(40), GATHER_MS, k * 4, k));
    let at = GATHER_WAIT_MS + n * 2;
    later(cut, at);
    later(riffle, (at += CUT_WAIT_MS));
    later(cut, (at += RIFFLE_WAIT_MS + n * 2));
    later(riffle, (at += CUT_WAIT_MS));
    later(spread, (at += RIFFLE_WAIT_MS + n * 2));
    later(done, at + SPREAD_MS + n * SPREAD_STAGGER_MS);
  };

  return (
    <div>
      <div className={s.bar}>
        <div className={s.modes} role="group" aria-label="카드 펼치는 방식">
          {MODES.map(([value, label]) => (
            <button key={value} type="button" className={s.mode} aria-pressed={mode === value} disabled={busy} onClick={() => choose(value)}>
              {label}
            </button>
          ))}
        </div>
        {/* Stays focusable while the cards shuffle (aria-disabled), so focus is never dropped. */}
        <button type="button" className={`${btn.btn} ${btn.secondary} ${btn.md}`} aria-disabled={frozen} onClick={reshuffle} data-reshuffle="">
          <span>다시 섞기</span>
          <span className={btn.trailing} aria-hidden="true">
            <ShuffleIcon />
          </span>
        </button>
      </div>

      <div
        ref={stageRef}
        className={s.stage}
        role="group"
        aria-label={`카드 ${count}장 중 ${max}장 고르기`}
        data-busy={busy ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        {range(count).map((i) => {
          const order = picked.indexOf(i);
          const chosen = order >= 0;
          const classes = [s.card, chosen ? s.chosen : "", full && !chosen ? s.dim : ""].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              ref={(el) => {
                cards.current[i] = el;
              }}
              type="button"
              className={classes}
              data-card={i}
              hidden={chosen && flies}
              tabIndex={i === tabStop ? 0 : -1}
              aria-pressed={chosen}
              aria-disabled={frozen || chosen}
              aria-label={chosen ? `${order + 1}번째로 고른 카드` : `카드 ${i + 1}`}
              onClick={() => onCardClick(i)}
            >
              <img src={backSrc} alt="" width={600} height={1040} draggable={false} />
            </button>
          );
        })}
        {mode === "ring" ? (
          <p className={s.hint} aria-hidden="true">
            ← 끌어서 돌리기 →
          </p>
        ) : null}
      </div>
    </div>
  );
}
