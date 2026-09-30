"use client";

import { useEffect, useRef } from "react";
import s from "./AdSlot.module.css";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = { client: string; slot: string };

/** One responsive AdSense unit, labelled as an ad. */
export function AdSlot({ client, slot }: Props) {
  // Strict Mode runs effects twice in development; AdSense throws if one unit is filled twice.
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Blocked or not yet loaded: the unit stays empty.
    }
  }, []);

  return (
    <aside className={s.slot} aria-label="광고">
      <p className={s.label} aria-hidden="true">
        광고
      </p>
      <ins
        className={`adsbygoogle ${s.unit}`}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
