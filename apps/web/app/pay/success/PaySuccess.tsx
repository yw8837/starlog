"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loginHref, refreshAccount } from "@/lib/account/client";
import { withQuery } from "@/lib/account/returnTo";
import { getJson, postJson, type ApiError, type ApiResult } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import s from "../pay.module.css";

type PaySuccessProps = {
  paymentKey: string;
  orderId: string;
  amount: string;
  navigate?: (url: string) => void;
  /** the first wait before the order's status is asked (ms); later waits grow (pollSchedule) */
  pollMs?: number;
};

type Paid = { status: "paid"; returnTo: string; signedIn: boolean };

/** The only answers that end the page: Toss refused, or the server cannot read the request. Anything else may still be charged. */
const FINAL = new Set(["PAY_FAILED", "BAD_REQUEST"]);
/** Keep asking a little past the server's 15 minutes, after which a confirm that never landed is decided. */
const WAIT_MS = 16 * 60_000;

/**
 * The waits between status checks: `firstMs`, then half as long again each time, at most 6×
 * `firstMs` (5 s → 30 s), until `totalMs`. PAY_LIMITER allows 20 a minute per IP and a shared
 * network shares it, so the page asks rarely.
 */
export function pollSchedule(firstMs: number, totalMs: number = WAIT_MS): number[] {
  const delays: number[] = [];
  let next = firstMs;
  for (let total = 0; total < totalMs; total += delays[delays.length - 1]!) {
    delays.push(next);
    next = Math.min(Math.round(next * 1.5), firstMs * 6);
  }
  return delays;
}

const LATE: ErrorView = { title: "결제를 확인하고 있어요", body: "확인이 늦어지고 있어요. 결제가 끝나면 내 정보의 결제 내역과 결제한 풀이에 나타나요.", action: null };
const NO_DETAILS: ErrorView = { title: "결제 결과는 내 정보에서 볼 수 있어요", body: "결제가 끝났다면 결제 내역과 결제한 풀이에 나타나요.", action: null };

/**
 * Toss's successUrl (spec 5.3). It confirms on the server, then goes back to the reading with
 * ?unlock=paid, and the reading opens. Only a refusal (PAY_FAILED) or an unreadable request ends
 * it; any other answer (a lost connection, 5xx, 429, PAY_PENDING) may still be charged, so it asks
 * for the order's status, less and less often, and confirms once more an order still `created`
 * (safe to repeat). Neither call needs the session (M5): in a browser without it (a card app or
 * KakaoTalk handing over) the page says the payment went through and asks for a login, which
 * returns to the reading and opens it. paymentKey, orderId and amount leave the address bar as soon
 * as they are read.
 */
export function PaySuccess({ paymentKey, orderId, amount, navigate = (url) => window.location.replace(url), pollMs = 5000 }: PaySuccessProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  const [loginTo, setLoginTo] = useState<string | null>(null);
  /** After a refusal: the reading the payment was for, to try another card from (F3). */
  const [back, setBack] = useState<string | null>(null);
  // What the page needs, kept from the first render: the address bar no longer has it.
  const payment = useRef({ paymentKey, orderId, amount });
  const started = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { paymentKey, orderId, amount } = payment.current;
    const url = new URL(window.location.href);
    if (["paymentKey", "orderId", "amount"].some((key) => url.searchParams.has(key))) {
      for (const key of ["paymentKey", "orderId", "amount"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (!paymentKey || !orderId || !amount) {
      setError(NO_DETAILS);
      return;
    }
    const finish = (paid: { returnTo: string; signedIn?: boolean }) => {
      const target = withQuery(paid.returnTo, { unlock: "paid" });
      if (paid.signedIn === false) return setLoginTo(loginHref(target));
      void refreshAccount();
      navigate(target);
    };
    const confirm = (): Promise<ApiResult<Paid>> => postJson<Paid>("/api/pay/confirm", { paymentKey, orderId, amount: Number(amount) });
    /** Nothing was charged: say why, and find the way back to the reading. */
    const fail = (view: ErrorView, returnTo?: string) => {
      setError(view);
      if (returnTo) return setBack(returnTo);
      void getJson<{ returnTo: string }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`).then((res) => {
        if (res.ok && alive.current) setBack(res.data.returnTo);
      });
    };
    /** A final answer: a refusal leads back to the reading; an unreadable request only to 내 정보. */
    const end = (error: ApiError) => (error.code === "PAY_FAILED" ? fail(describeApiError(error)) : setError(describeApiError(error)));
    void (async () => {
      const res = await confirm();
      if (res.ok) return finish(res.data);
      if (FINAL.has(res.error.code)) return end(res.error);
      setPending(true);
      let confirmedAgain = false;
      for (const delay of pollSchedule(pollMs)) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (!alive.current) return;
        const status = await getJson<{ status: string; returnTo: string; signedIn: boolean }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`);
        if (!status.ok) {
          if (status.error.code === "BAD_REQUEST") return setError(describeApiError(status.error));
          continue;
        }
        if (status.data.status === "paid") return finish(status.data);
        if (status.data.status === "failed") return fail({ title: "결제를 마치지 못했어요", body: "청구된 금액은 없어요.", action: "retry" }, status.data.returnTo);
        if (status.data.status === "created" && !confirmedAgain) {
          // The first confirm never landed (Toss keeps the approval open for 10 minutes): once more.
          confirmedAgain = true;
          const again = await confirm();
          if (again.ok) return finish(again.data);
          if (FINAL.has(again.error.code)) return end(again.error);
        }
      }
      if (alive.current) setError(LATE);
    })();
  }, [navigate, pollMs]);

  return (
    <div className={s.screen} aria-busy={!loginTo && !error}>
      {loginTo ? (
        <div role="status" className={s.panel}>
          <p className={s.title}>결제했어요</p>
          <p>이 브라우저에서는 로그인되어 있지 않아요. 결제한 계정으로 로그인하면 바로 열려요.</p>
          <Button href={loginTo} block>
            로그인하고 풀이 열기
          </Button>
        </div>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
          {back ? (
            <Button href={back} block>
              풀이로 돌아가기
            </Button>
          ) : null}
          <Button href="/me" variant="secondary" block>
            내 정보로 가기
          </Button>
        </div>
      ) : (
        <p role="status" className={s.status}>
          {pending ? "결제를 확인하고 있어요" : "결제를 마무리하고 있어요"}
        </p>
      )}
    </div>
  );
}
