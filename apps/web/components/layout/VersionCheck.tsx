"use client";

import { useEffect } from "react";

/** The build this page's JavaScript came from; the deploy script sets it (empty in dev and tests). */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_GAP_MS = 60_000;

/** True while a reading is being written (GeneratingState marks itself aria-busy): never reload then. */
const generating = () => document.querySelector('[aria-busy="true"]') !== null;

/**
 * Stale tabs after a deploy (owner: a tab opened before a deploy kept the old /today). When the
 * visitor comes back to the tab, ask the server which build it serves; if it changed, reload once so
 * old JavaScript never mixes with new pages. Readings and saved records live in browser storage, so
 * a reload loses nothing; it never interrupts a reading being written.
 */
export function VersionCheck() {
  useEffect(() => {
    if (!BUILD) return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string | null };
        if (build && build !== BUILD && !generating()) window.location.reload();
      } catch {
        // Offline or blocked: the next visit checks again.
      }
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  return null;
}
