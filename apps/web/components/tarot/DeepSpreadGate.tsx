"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useAccount, type AccountState } from "@/lib/account/client";
import type { FlowState } from "@/lib/flowState";
import { refreshPremiumStatus, usePremiumStatus, type PremiumStatus } from "@/lib/premium/status";
import s from "./DeepSpreadGate.module.css";

/**
 * Whether this device may stand on 켈틱 크로스 10장: premium is visible here, or the account holds a purchase
 * of it (unopened or being opened: a reading already paid for always opens, plan-reconciled §4.4). Undefined
 * until both have answered what is needed, and while the status could not be read (null): a choice is never
 * dropped on a guess (review 2026-10-16 #4).
 */
export function deepAllowed(status: PremiumStatus | null | undefined, account: AccountState | null | undefined): boolean | undefined {
  if (status?.["tarot-deep"].visible) return true;
  const user = account?.user;
  if (user && [...user.unused, ...user.opening].some((item) => item.productId === "tarot-deep")) return true;
  return status === undefined || status === null || account === undefined ? undefined : false;
}

/**
 * Mounted only while the flow asks for the ten cards, so a standard flow asks nothing new. A status that
 * could not be read is asked once more; failing again, the flow goes on as the 3-card one when the account
 * answered and holds no purchase of it (review 2026-10-17 L3), and only while the account cannot be read
 * either does it say so and offer 다시 확인하기, keeping the choice.
 */
function DeepSpreadGate({ onDecide }: { onDecide: (allowed: boolean) => void }) {
  const status = usePremiumStatus();
  const account = useAccount();
  const allowed = deepAllowed(status, account);
  const retried = useRef(false);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (allowed !== undefined) onDecide(allowed);
  }, [allowed, onDecide]);
  // The status failed twice and the account answered without a purchase of it (deepAllowed would be true with one).
  const fallBack = unread && allowed === undefined && Boolean(account);
  useEffect(() => {
    if (fallBack) onDecide(false);
  }, [fallBack, onDecide]);
  useEffect(() => {
    if (status !== null) return setUnread(false);
    if (retried.current) return setUnread(true);
    retried.current = true;
    // A second null changes nothing in the store, so the answer of this try is read here.
    let live = true;
    void refreshPremiumStatus().then((next) => {
      if (live && next === null) setUnread(true);
    });
    return () => {
      live = false;
    };
  }, [status]);
  if (allowed !== undefined || !unread || fallBack) return null;
  return (
    <div className={s.unread} role="status">
      <p className={s.unreadText}>켈틱 크로스 10장을 지금 볼 수 있는지 확인하지 못했어요</p>
      <Button variant="secondary" size="md" onClick={() => void refreshPremiumStatus()}>
        다시 확인하기
      </Button>
    </div>
  );
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
