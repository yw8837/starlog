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
      // The moved guide URLs' redirect puts a query after the fragment (#tarot-now-guide?utm_source=…): the id is before it,
      // and the browser does not scroll to such a fragment by itself.
      const [id = "", query] = decodeURIComponent(window.location.hash.slice(1)).split("?");
      const card = id ? document.getElementById(id) : null;
      if (!(card instanceof HTMLDetailsElement)) return;
      card.open = true;
      if (query !== undefined) card.scrollIntoView?.({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
