"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAccount, type AccountState } from "@/lib/account/client";
import type { FlowState } from "@/lib/flowState";
import { usePremiumStatus, type PremiumStatus } from "@/lib/premium/status";
import s from "./DeepSpreadGate.module.css";

/**
 * Whether this device may stand on 켈틱 크로스 10장: premium is visible here, or the account holds a purchase
 * of it (unopened or being opened: a reading already paid for always opens, plan-reconciled §4.4). Undefined
 * until both have answered what is needed.
 */
export function deepAllowed(status: PremiumStatus | null | undefined, account: AccountState | null | undefined): boolean | undefined {
  if (status?.["tarot-deep"].visible) return true;
  const user = account?.user;
  if (user && [...user.unused, ...user.opening].some((item) => item.productId === "tarot-deep")) return true;
  return status === undefined || account === undefined ? undefined : false;
}

/** Mounted only while the flow asks for the ten cards, so a standard flow asks nothing new. */
function DeepSpreadGate({ onDecide }: { onDecide: (allowed: boolean) => void }) {
  const allowed = deepAllowed(usePremiumStatus(), useAccount());
  useEffect(() => {
    if (allowed !== undefined) onDecide(allowed);
  }, [allowed, onDecide]);
  return null;
}

/**
 * The spread a tarot flow page stands on: "standard" at once for a flow without `spread` (today's flow, no
 * new request), "deep" once this device may have it, undefined while it asks. A deep flow this device may
 * not have (STARLOG_PREMIUM off, no purchase) loses its spread and goes on as the 3-card flow. Render `gate`.
 */
export function useFlowSpread(
  flow: FlowState | null,
  setFlow: (next: (prev: FlowState) => FlowState) => void,
): { spread: "deep" | "standard" | undefined; gate: ReactNode } {
  const wants = flow?.spread === "deep";
  const [allowed, setAllowed] = useState<boolean>();
  const onDecide = useCallback(
    (ok: boolean) => {
      setAllowed(ok);
      if (!ok) setFlow(({ spread: _dropped, ...rest }) => rest);
    },
    [setFlow],
  );
  const spread = flow === null ? undefined : !wants ? "standard" : allowed ? "deep" : undefined;
  return { spread, gate: wants ? <DeepSpreadGate onDecide={onDecide} /> : null };
}

/** The 13px line above the builder and the situation step saying which spread was chosen (not a button). */
export function SpreadChip({ children }: { children: string }) {
  return <p className={s.chip}>{children}</p>;
}
