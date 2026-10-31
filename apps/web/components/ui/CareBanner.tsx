"use client";

import { useCallback, useEffect, useState } from "react";
import { CARE_BANNER } from "@/lib/crisis";
import { onCareSignal } from "@/lib/reading/careSignal";
import { CrisisContacts } from "./CrisisContacts";
import s from "./CareBanner.module.css";

const CLOSED_KEY = "sl_care_closed";
/** Once closed, quiet for two hours (as Claude's own helpline banner does), so it never nags. */
const QUIET_MS = 2 * 60 * 60 * 1000;
/** Where storage is refused (private mode), the page still remembers a close. */
let closedAtInMemory = 0;

/** Tests: forget a close. */
export function resetCareBanner(): void {
  closedAtInMemory = 0;
}

function closedRecently(now: number): boolean {
  let at = closedAtInMemory;
  try {
    at = Math.max(at, Number(globalThis.localStorage?.getItem(CLOSED_KEY)) || 0);
  } catch {
    // storage refused: the page's memory decides
  }
  return at > 0 && now - at < QUIET_MS;
}

/**
 * 돌봄 모드 (owner 2026-10-31): above a reading written with care (lib/api/stream.ts `care`), the helplines, in a
 * line that acknowledges the feeling; closable with its button or Esc. One in the root layout (before the page, so it
 * comes first in reading and focus order), opened by lib/reading/careSignal.ts.
 */
export function CareBanner() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    closedAtInMemory = Date.now();
    try {
      globalThis.localStorage?.setItem(CLOSED_KEY, String(closedAtInMemory));
    } catch {
      // private mode: the page's memory keeps it
    }
    setOpen(false);
  }, []);
  useEffect(() => onCareSignal(() => setOpen(!closedRecently(Date.now()))), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  return (
    <>
      {/* Always there, filled when the banner opens, so a screen reader announces it (a region added with its text may not be). */}
      <p className={s.live} role="status">
        {open ? CARE_BANNER : ""}
      </p>
      {open ? (
        <aside className={s.banner} aria-label="마음 돌봄 안내">
          <div className={s.head}>
            <p className={s.text}>{CARE_BANNER}</p>
            <button type="button" className={s.close} onClick={close}>
              닫기
            </button>
          </div>
          <CrisisContacts lead={false} compact />
        </aside>
      ) : null}
    </>
  );
}
