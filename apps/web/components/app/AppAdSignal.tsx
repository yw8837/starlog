"use client";

import { useEffect } from "react";
import { callNative, isApp } from "@/lib/app/bridge";

const signal = (show: boolean) => void callNative("ad", { show }).catch(() => {});

/**
 * Tells the Starlog app whether this free result may carry its banner (renders nothing; a browser gets nothing). `on` while
 * the result itself is shown; off otherwise and when the screen goes. AdMob's rule: no ads on dead-end screens (errors,
 * login, thank-you), so only a real result turns it on; the shell also shows it only on /now, /saju/grade and /today.
 */
export function AppAdSignal({ on }: { on: boolean }) {
  useEffect(() => {
    if (!isApp()) return;
    signal(on);
    return () => signal(false);
  }, [on]);
  return null;
}
