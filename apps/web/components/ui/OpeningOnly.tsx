"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { openingFreeOn } from "@/lib/config";

const subscribe = () => () => {};

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
