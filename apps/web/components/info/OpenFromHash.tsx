"use client";

import { useEffect } from "react";

/**
 * Opens the 이용 가이드 card the address names (/help#tarot-now-guide): a fragment scrolls to a <details> but leaves it
 * closed, and the two guide URLs that moved to /help land on these cards (lib/hostRoutes.ts GUIDE_MOVED_TO_HELP).
 * Renders nothing; without JavaScript the card is still there, one tap away.
 */
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const card = window.location.hash.length > 1 ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
      if (card instanceof HTMLDetailsElement) card.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
