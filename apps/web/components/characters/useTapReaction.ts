"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** How long one tap reaction (happy face, hop, star burst, speech bubble) lasts. */
export const TAP_REACTION_MS = 1400;

export type TapReaction = {
  /** Attach to the character's button. The hop/squish/burst CSS keys off its `data-tap`. */
  ref: RefObject<HTMLButtonElement | null>;
  /** True for TAP_REACTION_MS after the latest tap. Drives the expression swap and bubble. */
  active: boolean;
  trigger(): void;
};

/**
 * Tap reaction timing. Motion lives in CSS (`[data-tap] ...` rules); this hook sets the
 * attribute on the button and replays it on every tap, the same remove/reflow/add trick as
 * the approved v3 sketch, so rapid taps restart the hop instead of being ignored.
 */
export function useTapReaction(): TapReaction {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(false);

  const trigger = useCallback(() => {
    clearTimeout(timer.current);
    const el = ref.current;
    if (el) {
      delete el.dataset.tap;
      void el.getBoundingClientRect(); // flush styles so the CSS animations start over
      el.dataset.tap = "on";
    }
    setActive(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (ref.current) delete ref.current.dataset.tap;
      setActive(false);
    }, TAP_REACTION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { ref, active, trigger };
}
