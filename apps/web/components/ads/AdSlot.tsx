"use client";

import { useEffect, useRef, useState } from "react";
import s from "./AdSlot.module.css";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = { client: string; slot: string };

/** What AdSense has done with the unit, from its data-ad-status ("filled" or "unfilled"); "pending" until it says. */
type AdState = "pending" | "filled" | "unfilled";

/**
 * One responsive AdSense unit, labelled as an ad once it holds one. Until AdSense marks the unit filled the slot shows
 * nothing and takes no room (no label, no reserved height), and an unfilled unit (the site not yet approved, no ad to
 * show) hides the whole slot, so an empty box never reads as a broken page. An ad blocker leaves it pending: nothing.
 */
export function AdSlot({ client, slot }: Props) {
  // Strict Mode runs effects twice in development; AdSense throws if one unit is filled twice.
  const pushed = useRef(false);
  const unit = useRef<HTMLModElement>(null);
  const [state, setState] = useState<AdState>("pending");

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Blocked or not yet loaded: the unit stays empty.
    }
  }, []);

  useEffect(() => {
    const ins = unit.current;
    if (!ins) return;
    const read = () => {
      const status = ins.getAttribute("data-ad-status");
      if (status === "filled" || status === "unfilled") setState(status);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => observer.disconnect();
  }, []);

  return (
    <aside className={s.slot} aria-label="광고" data-ad-state={state} hidden={state === "unfilled"}>
      {state === "filled" ? (
        <p className={s.label} aria-hidden="true">
          광고
        </p>
      ) : null}
      <ins
        ref={unit}
        className={`adsbygoogle ${s.unit}`}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
