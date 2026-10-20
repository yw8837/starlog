import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loginHref, refreshAccount, useAccount } from "@/lib/account/client";
import type { ApiError } from "@/lib/reading/api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError, type ErrorView } from "@/lib/reading/errors";
import { advanceProgress, startProgress, type ProgressPlan, type ProgressState } from "@/lib/reading/progress";
import { mergeServerReadings } from "@/lib/storage/chapters";
import { LATER_CHECK_DELAYS, OPENING_WINDOW_MS, checkDelivery, heldCredit, pullAccountReadings, type DeliveryCheck, type HeldCredit } from "@/lib/storage/sync";
import { clearPremiumResume, pendingResume, runPremiumReading, type PremiumDone } from "./client";
import type { PremiumId } from "./products";

/** Errors after which a paid part may still have been saved (P4 M4): the account is asked before anything is said. */
const UNSETTLED = new Set(["QUALITY", "UPSTREAM", "NETWORK", "TIMEOUT", "INVALID"]);

export interface PremiumOpenOptions<R> {
  id: PremiumId;
  /** What the reading is written from (the request body without unlock and resume); null until the screen has it. */
  input: Record<string, unknown> | null;
  /** One plan per part (premiumProgressPlans). */
  plans: ProgressPlan[];
  /** Where a login comes back to (the preview). */
  returnTo: string;
  /** An account copy of this very reading (its kind and what it was written from), for the check after a cut-off. */
  matches: (chapter: unknown) => boolean;
  /** The finished reading's shape (lib/reading/validate): nothing else is kept. */
  accept: (reading: unknown) => reading is R;
  /** Keeps the finished reading on this device; answers the chapter's address id. */
  save: (done: PremiumDone<R>) => string;
  /**
   * The reading was finished without passing through `save`: the account's copy, found after a cut-off
   * (delivered) or answered by 409 `opened`. Called with its account id before its chapter opens, so the
   * screen binds or forgets what `save` would have (review 2026-10-16 #2, #3); awaited before the chapter opens.
   */
  onDelivered?: (readingId: string) => void | Promise<void>;
  /** Back from checkout (?unlock=paid): open the purchase once, as soon as `ready` (the preview is shown) and it is held. */
  autoOpen?: boolean;
  ready?: boolean;
  /** The preview's address without ?unlock= (put back when the automatic opening starts). */
  cleanHref?: string;
}

export interface PremiumOpen {
  /** The part being written and its progress, while a reading is written. */
  running: { part: number; progress: ProgressState } | null;
  /** What the last opening came to (above the open button). */
  error: ErrorView | null;
  /** The method of the last opening (the refund link is for a purchase only). */
  method: "paid" | "owner";
  /** A cut-off paid opening not settled yet: nothing to buy or open meanwhile. */
  checking: boolean;
  /** The account check ran out of rounds without an answer: 다시 확인하기. */
  stalled: boolean;
  /** Parts of this reading are written in this tab already (이어서 받기). */
  resumable: boolean;
  open: (method: "paid" | "owner") => void;
  /** 다시 확인하기: after the rounds ran out, or while another opening holds the purchase. */
  recheck: () => void;
}

/**
 * Opening a premium reading on its preview screen (plan-reconciled §10), with P4's rules for a paid
 * opening: one request per part (runPremiumReading, the resume token kept in this tab), the finished
 * reading saved on this device first, then its chapter. A part cut off on a purchase is checked with the
 * account before anything is said (delivered → its chapter; kept → open again, 이어서 받기). 409 `opened`
 * brings the account's copy here and opens it; 409 `opening` waits (the panel shows the purchase in use).
 */
export function usePremiumOpen<R>({ id, input, plans, returnTo, matches, accept, save, onDelivered, autoOpen = false, ready = false, cleanHref = returnTo }: PremiumOpenOptions<R>): PremiumOpen {
  const router = useRouter();
  const account = useAccount();
  const [running, setRunning] = useState<PremiumOpen["running"]>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [method, setMethod] = useState<"paid" | "owner">("paid");
  const [check, setCheck] = useState<"running" | "stalled" | null>(null);
  const firstTry = useRef<number | null>(null);
  const work = useRef<AbortController | null>(null);
  // One opening at a time: a second tap before the screen changes must not start (and abort) another (review 2026-10-16 #7).
  const opening = useRef(false);
  useEffect(() => () => work.current?.abort(), []);

  /** Since when an account reading of this flow counts as this opening's: a try made here, or the longest a reservation lives. */
  const since = (now: number) => Math.min(now - OPENING_WINDOW_MS, firstTry.current ?? now);

  const settle = async (startedAt: number, held: HeldCredit, after: "cut" | "refused" | "recheck") => {
    work.current?.abort();
    const controller = new AbortController();
    work.current = controller;
    const flow = { startedAt, matches, method: "paid" as const, productId: id, held };
    const stopWhenNone = after !== "cut";
    const apply = (result: DeliveryCheck): boolean => {
      if (result.status === "unknown") return false;
      setCheck(null);
      void refreshAccount();
      if (result.status === "delivered") {
        mergeServerReadings([result.reading]);
        const readingId = result.reading.id;
        void (async () => {
          await onDelivered?.(readingId);
          // Done: a resume token left in this tab would make the next purchase with this input read as opened (B12).
          // Only after onDelivered, which may still need it (a 궁합 asks its chapter token again with it, H3).
          clearPremiumResume(id);
          router.push(`/chapter/${readingId}`);
        })();
      } else if (result.status === "kept") {
        setError(creditKept("paid"));
      } else {
        setError(after === "refused" ? describeApiError({ code: "NO_CREDIT", status: 402 }, "paid") : null);
      }
      return true;
    };
    setCheck("running");
    setError(CREDIT_CHECKING);
    if (apply(await checkDelivery(flow, { signal: controller.signal, stopWhenNone }))) return;
    if (controller.signal.aborted) return;
    setError(creditUnknown("paid"));
    if (apply(await checkDelivery(flow, { delays: LATER_CHECK_DELAYS, signal: controller.signal, stopWhenNone }))) return;
    if (controller.signal.aborted) return;
    setCheck("stalled");
    void refreshAccount();
  };

  const fail = async (failure: ApiError, chosen: "paid" | "owner", startedAt: number, held: HeldCredit) => {
    if (failure.code === "LOGIN_REQUIRED") {
      router.push(loginHref(returnTo));
      return;
    }
    if (failure.code === "NOT_AVAILABLE" && failure.reason === "opened" && failure.readingId) {
      // Already written and saved (a retry after a missed answer): bring the account's copy here and open it.
      await pullAccountReadings();
      void refreshAccount();
      await onDelivered?.(failure.readingId);
      clearPremiumResume(id);
      router.push(`/chapter/${failure.readingId}`);
      return;
    }
    if (failure.code === "NOT_AVAILABLE" && failure.reason === "opening") {
      // Another opening holds this purchase (another tab, a lost resume token): the panel waits with 다시 확인하기.
      void refreshAccount();
      setError({ title: failure.message ?? "조금 전에 시작한 풀이가 아직 열리는 중이에요", action: null });
      return;
    }
    if (chosen === "paid" && UNSETTLED.has(failure.code)) return void settle(startedAt, held, "cut");
    if (chosen === "paid" && failure.code === "NO_CREDIT") return void settle(since(startedAt), held, "refused");
    if (failure.code === "PAYMENT_REQUIRED") void refreshAccount();
    setError(describeApiError(failure, chosen === "paid" ? "paid" : "reading"));
  };

  const open = (chosen: "paid" | "owner") => {
    if (!input || opening.current) return;
    opening.current = true;
    work.current?.abort();
    const controller = new AbortController();
    work.current = controller;
    setMethod(chosen);
    setError(null);
    setCheck(null);
    window.scrollTo(0, 0);
    const startedAt = Date.now();
    if (chosen === "paid") firstTry.current ??= startedAt;
    // What the account held as it started: "kept" later means all of it is back.
    const held = heldCredit(account?.user, id);
    const first = pendingResume(id, input)?.done ?? 0;
    setRunning({ part: first, progress: startProgress(plans[Math.min(first, plans.length - 1)]!) });
    void (async () => {
      let result: Awaited<ReturnType<typeof runPremiumReading<R>>>;
      try {
        result = await runPremiumReading<R>(id, input, {
          method: chosen,
          of: plans.length,
          signal: controller.signal,
          onProgress: ({ part, progress }) => {
            if (controller.signal.aborted) return;
            const plan = plans[Math.min(part, plans.length - 1)]!;
            setRunning((prev) => ({ part, progress: progress === null || !prev || prev.part !== part ? startProgress(plan) : advanceProgress(prev.progress, progress, plan) }));
          },
        });
      } finally {
        opening.current = false;
      }
      if (controller.signal.aborted) return;
      if (result.ok && accept(result.data.reading)) {
        // Kept on this device first, then its chapter.
        const chapterId = save(result.data);
        void refreshAccount();
        router.push(`/chapter/${chapterId}`);
        return;
      }
      setRunning(null);
      await fail(result.ok ? { code: "INVALID", status: 502 } : result.error, chosen, startedAt, held);
    })();
  };

  // After checkout (?unlock=paid): once, when the preview is shown and the account holds the purchase. Without
  // what the reading is written from (the flow was lost on another browser) nothing runs; the purchase waits in 내 정보.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoOpen || !ready || autoStarted.current || !input || account === undefined) return;
    if (!account?.user?.unused.some((item) => item.productId === id)) return;
    autoStarted.current = true;
    router.replace(cleanHref);
    open("paid");
  });

  const recheck = () => {
    setMethod("paid");
    void settle(since(Date.now()), heldCredit(account?.user, id), check === "stalled" ? "cut" : "recheck");
  };

  return {
    running,
    error,
    method,
    checking: check !== null,
    stalled: check === "stalled",
    resumable: input ? pendingResume(id, input) !== null : false,
    open,
    recheck,
  };
}
