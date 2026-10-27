"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ENTRY_TAROT_HREF, TAROT_BRIDGE_HREF } from "@/lib/freshStart";
import { usePremiumStatus } from "@/lib/premium/status";

/**
 * The home's 타로 보기 link: today's question builder, or the 다리 화면 (일반 타로 / 켈틱 크로스 10장) once the
 * premium status says it is visible on this device. The home is prerendered, so the switch is read in
 * the browser; before it answers, when it fails and while premium is off, the link stays the builder.
 */
export function TarotEntryLink({ className, children }: { className: string; children: ReactNode }) {
  const status = usePremiumStatus();
  return (
    <Link href={status?.["tarot-deep"].visible ? TAROT_BRIDGE_HREF : ENTRY_TAROT_HREF} className={className}>
      {children}
    </Link>
  );
}
