"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { openingFreeOn, SITE } from "@/lib/config";

/** The longest wait a browser timer holds (about 24.8 days); a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;
const ENDS_AT = Date.parse(SITE.beta.openingEndsAt);

/** A re-render at the cutoff (review LOW-6), so a tab left open hides the offer at 12월 1일 00:00 KST; nothing once it has ended. */
const subscribe = (listener: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    const left = ENDS_AT - Date.now();
    if (left <= 0) return;
    timer = setTimeout(() => {
      listener();
      schedule();
    }, Math.min(left, MAX_TIMER_MS));
  };
  schedule();
  return () => clearTimeout(timer);
};

/**
 * 오픈 기념 무료 is still on, by this browser's clock (openingFreeOn, SITE.beta.openingEndsAt). False on the server and
 * while hydrating: the pages that state it are cached for a year, so their HTML must never carry a dated offer.
 */
export function useOpeningFree(): boolean {
  return useSyncExternalStore(subscribe, () => openingFreeOn(), () => false);
}

/**
 * Its children only in the browser, only before 오픈 기념 무료 ends: the line goes away by itself on 2026-12-01 00:00 KST,
 * with no deploy. The server renders nothing, so a static page leads with what stays true.
 */
export function OpeningOnly({ children }: { children: ReactNode }) {
  return useOpeningFree() ? <>{children}</> : null;
}
