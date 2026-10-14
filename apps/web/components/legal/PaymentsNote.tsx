"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/lib/account/client";

/**
 * The legal pages describe the paid service. While sales are closed for this visitor
 * (STARLOG_PAYMENTS off, owner-only or paused), this note keeps the 첫 이용 무료 line. It is read at
 * run time from /api/me, so flipping the flag needs no rebuild of the static pages.
 */
export function PaymentsNote({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (account === undefined || account?.payments) return null;
  return <>{children}</>;
}
