"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginHref } from "@/lib/account/client";
import { SITE, sajuTopicsMode, won } from "@/lib/config";
import { approxCharsText } from "@/lib/pricing";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { isPaymentWindowClosed, loadTossSdk, type TossWidgets } from "@/lib/pay/tossSdk";
import { PREMIUM, isPremiumId } from "@/lib/premium/products";
import { getJson, postJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import { UNLOCK_SCOPE_LINE } from "@/lib/sajuTopics";
import s from "../pay.module.css";

interface CheckoutInfo {
  productId: string;
  name: string;
  amount: number;
  customerKey: string;
  provider: "toss" | "mock";
  clientKey: string | null;
}

interface OrderInfo {
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
}

const scopeLines = (productId: string): string[] => {
  if (isPremiumId(productId)) return [...PREMIUM[productId].scope];
  if (productId !== "tarot" && productId !== "saju") return [];
  const chars = approxCharsText(SITE.reading.approxChars[productId]);
  return [
    `풀이 전체 · 약 ${chars}자`,
    `이어서 물어보기 ${SITE.reading.followUps}번`,
    "이 기기에 계속 보관",
    // 주제별 사주: one payment opens the one reading chosen when it is opened (saju-topics spec §9.2).
    ...(productId === "saju" && sajuTopicsMode() === "on" ? [UNLOCK_SCOPE_LINE] : []),
  ];
};

type CheckoutViewProps = {
  productId: string;
  returnTo: string;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * Spec 5.2. The page shows the product, the server's price, what it holds and the 청약철회 notice,
 * which must be ticked before paying. Then the Toss widget (payment methods and Toss's own terms).
 * Only on 결제하기 is the order created, and only at the server's price. STARLOG_PAY=mock skips the
 * widget and goes straight to /pay/success with a mock payment key.
 */
export function CheckoutView({ productId, returnTo, navigate = (url) => window.location.assign(url) }: CheckoutViewProps) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const widgets = useRef<TossWidgets | null>(null);
  const here = `/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getJson<CheckoutInfo>(`/api/pay/checkout?product=${encodeURIComponent(productId)}`);
      if (cancelled) return;
      if (!res.ok) {
        if (res.error.code === "LOGIN_REQUIRED") navigate(loginHref(here));
        else setError(describeApiError(res.error));
        return;
      }
      setInfo(res.data);
      if (res.data.provider === "mock" || !res.data.clientKey) {
        setReady(res.data.provider === "mock");
        return;
      }
      try {
        const TossPayments = await loadTossSdk();
        const created = TossPayments(res.data.clientKey).widgets({ customerKey: res.data.customerKey });
        await created.setAmount({ currency: "KRW", value: res.data.amount });
        await Promise.all([
          created.renderPaymentMethods({ selector: "#payment-methods", variantKey: "DEFAULT" }),
          created.renderAgreement({ selector: "#payment-agreement", variantKey: "AGREEMENT" }),
        ]);
        if (!cancelled) {
          widgets.current = created;
          setReady(true);
        }
      } catch {
        if (!cancelled) setError({ title: "결제창을 불러오지 못했어요", body: "잠시 뒤에 다시 시도해 주세요.", action: "retry" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `here` and `navigate` follow productId/returnTo; the widget is set up once per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const pay = async () => {
    if (!info || !agreed || !ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await postJson<OrderInfo>("/api/pay/orders", { productId: info.productId, returnTo, ack: true });
    if (!res.ok) {
      setBusy(false);
      setError(describeApiError(res.error));
      return;
    }
    const order = res.data;
    if (order.amount !== info.amount) {
      setBusy(false);
      setError({ title: "가격이 바뀌었어요", body: "화면을 새로 고친 뒤 다시 확인해 주세요.", action: "retry" });
      return;
    }
    if (info.provider === "mock") {
      navigate(`${order.successUrl}?${new URLSearchParams({ paymentType: "NORMAL", orderId: order.orderId, paymentKey: `mock_${order.orderId}`, amount: String(order.amount) })}`);
      return;
    }
    try {
      await widgets.current!.requestPayment({ orderId: order.orderId, orderName: order.orderName, successUrl: order.successUrl, failUrl: order.failUrl });
    } catch (error) {
      setBusy(false);
      // The buyer closed the window: stay here quietly. Anything else is a real failure.
      if (!isPaymentWindowClosed(error)) setError({ title: "결제창을 열지 못했어요", body: "잠시 뒤에 다시 시도해 주세요. 청구된 금액은 없어요.", action: "retry" });
    }
  };

  return (
    <div className={s.screen} aria-busy={busy}>
      <Stepper label="결제" backHref={returnTo} backLabel="풀이로 돌아가기" />
      {info ? (
        <>
          <header className={s.head}>
            <h1 className={s.title}>{info.name}</h1>
            <p className={s.price}>{won(info.amount)}</p>
          </header>
          <ul className={s.includes}>
            {scopeLines(info.productId).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <section className={s.notice} aria-labelledby="withdrawal-title">
            <h2 id="withdrawal-title" className={s.noticeTitle}>
              결제 전에 확인해 주세요
            </h2>
            <p>결제한 풀이는 화면에 나오기 시작하면 청약철회가 제한돼요(전자상거래법 제17조 제2항 제5호). 무료로 본 첫 풀이가 맛보기예요.</p>
            <p>
              {`풀이가 나오는 동안 화면을 닫아도 3번까지 다시 열어 받을 수 있어요. 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 내 정보에서 전액 환불받을 수 있어요. `}
              <Link href="/refund">환불 정책</Link>
            </p>
            <p>만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.</p>
          </section>
          <Checkbox checked={agreed} onChange={setAgreed} required>
            위 내용을 확인했어요
          </Checkbox>
          {info.provider === "toss" ? (
            <>
              <div id="payment-methods" className={s.widget} />
              <div id="payment-agreement" className={s.widget} />
            </>
          ) : (
            <p className={s.mock}>테스트 결제예요. 실제로 청구되지 않아요.</p>
          )}
          {error ? (
            <p role="alert" className={s.error}>
              {error.title}
            </p>
          ) : null}
          <div className={s.actions}>
            <div className={s.terms}>
              <p>서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.</p>
              <p>
                {`열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. `}
                <Link href="/refund">환불 정책</Link>
              </p>
            </div>
            <Button block onClick={() => void pay()} disabled={!agreed || !ready || busy}>
              {`${won(info.amount)} 결제하기`}
            </Button>
            {info.provider === "mock" ? (
              <Button
                variant="ghost"
                block
                onClick={() => navigate(`/pay/fail?${new URLSearchParams({ code: "PAY_PROCESS_CANCELED", message: "사용자에 의해 결제가 취소되었습니다." })}`)}
              >
                테스트 결제 실패
              </Button>
            ) : null}
          </div>
        </>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
          <Button href={returnTo} variant="secondary" block>
            풀이로 돌아가기
          </Button>
        </div>
      ) : (
        <p role="status" className={s.status}>
          결제 정보를 불러오고 있어요
        </p>
      )}
    </div>
  );
}
