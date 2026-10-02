"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loginHref, refreshAccount } from "@/lib/account/client";
import { withQuery } from "@/lib/account/returnTo";
import { getJson, postJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import s from "../pay.module.css";

type PaySuccessProps = {
  paymentKey: string;
  orderId: string;
  amount: string;
  navigate?: (url: string) => void;
  /** how often a pending payment is checked (ms) */
  pollMs?: number;
};

const POLLS = 30;

/**
 * Toss's successUrl (spec 5.3). It confirms on the server, then goes back to the reading with
 * ?unlock=paid, and the reading opens. If Toss's answer is late, it asks for the order's status
 * every couple of seconds. Neither call needs the session (M5): in a browser without it (a card app
 * or KakaoTalk handing over) the page says the payment went through and asks for a login, which
 * returns to the reading and opens it.
 */
export function PaySuccess({ paymentKey, orderId, amount, navigate = (url) => window.location.replace(url), pollMs = 2000 }: PaySuccessProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  const [loginTo, setLoginTo] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = (paid: { returnTo: string; signedIn?: boolean }) => {
      const target = withQuery(paid.returnTo, { unlock: "paid" });
      if (paid.signedIn === false) return setLoginTo(loginHref(target));
      void refreshAccount();
      navigate(target);
    };
    void (async () => {
      const res = await postJson<{ status: "paid"; returnTo: string; signedIn: boolean }>("/api/pay/confirm", { paymentKey, orderId, amount: Number(amount) });
      if (res.ok) return finish(res.data);
      if (res.error.code !== "PAY_PENDING") return setError(describeApiError(res.error));
      setPending(true);
      for (let i = 0; i < POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const status = await getJson<{ status: string; returnTo: string; signedIn: boolean }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`);
        if (status.ok && status.data.status === "paid") return finish(status.data);
        if (status.ok && status.data.status === "failed") return setError({ title: "결제를 마치지 못했어요", body: "청구된 금액은 없어요.", action: "retry" });
      }
      setError({ title: "결제를 확인하고 있어요", body: "확인이 늦어지고 있어요. 결제가 끝나면 내 정보의 결제 내역과 결제한 풀이에 나타나요.", action: null });
    })();
  }, [paymentKey, orderId, amount, navigate, pollMs]);

  return (
    <div className={s.screen} aria-busy={!loginTo && !error}>
      {loginTo ? (
        <div role="status" className={s.panel}>
          <p className={s.title}>결제했어요</p>
          <p>이 브라우저에서는 로그인되어 있지 않아요. 결제한 카카오 계정으로 로그인하면 바로 열려요.</p>
          <Button href={loginTo} block>
            로그인하고 풀이 열기
          </Button>
        </div>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
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
