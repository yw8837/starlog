"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { setRefundRule } from "@/components/legal/PremiumLegal";
import { trackMetaPurchase } from "@/components/seo/MetaPixel";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { loginHref, refreshAccount } from "@/lib/account/client";
import { withQuery } from "@/lib/account/returnTo";
import { callNative, nativeCode } from "@/lib/app/bridge";
import { SITE, sajuTopicsMode, won } from "@/lib/config";
import { approxCharsText } from "@/lib/pricing";
import { REFUND_DAYS, SET_PRODUCT_ID } from "@/lib/pay/catalog";
import { checkoutTocs } from "@/lib/pay/toc";
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
  /** "play": the Starlog app, where Google Play takes the payment (no Toss) */
  provider: "toss" | "mock" | "play";
  clientKey: string | null;
}

interface OrderInfo {
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
  /** G3, premium only: purchases of this product the buyer holds unopened or is opening */
  held?: number;
  /** the app's order: Google Play's product id and the account tag the purchase carries (obfuscated account id) */
  play?: { productId: string; accountTag: string };
}

/** /api/pay/play/verify's answer for a paid purchase (as /api/pay/confirm's, with the order). */
type PlayPaid = { status: "paid"; orderId: string; returnTo: string; signedIn: boolean };

/** In the app, never cards or 토스 (W2.2). Before Google charged: */
const PLAY_FAILED = "결제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
const PLAY_PENDING = "결제가 아직 끝나지 않았어요. 결제가 끝나면 자동으로 열려요.";
/** After Google charged (a purchase token came back) while the server has not granted it yet: never "결제하지 못했어요". */
const PLAY_CHARGED = "결제는 됐어요. 풀이를 여는 중이에요. 잠시 뒤 자동으로 열려요.";
/** The server's definite refusal of a charged purchase, when it sends no message of its own. */
const PLAY_UNVERIFIED = "결제를 확인하지 못했어요. 문의해 주세요.";
/** Only these answers from /api/pay/play/verify are final; anything else (a lost connection, 5xx, PAY_PENDING…) is asked again. */
const PLAY_FINAL = new Set(["PAY_FAILED", "BAD_REQUEST"]);
/** The waits before asking /api/pay/play/verify again; after them the app's resume check (AppMode) finishes it. */
const PLAY_RETRY_MS = [2_000, 5_000, 10_000] as const;

/** The set (owner 2026-11-10): each reading's whole, the follow-ups, the real saving against the two apart. */
const SET_APART = PREMIUM["newyear-2027"].krw + PREMIUM.match.krw;
const SET_SCOPE = [
  ...SITE.price.set.includes.map((id) => `${PREMIUM[id].name} · ${PREMIUM[id].scope[0]}`),
  `풀이마다 이어서 물어보기 ${PREMIUM.match.followUps}번`,
  `따로 사면 ${won(SET_APART)}, ${won(SET_APART - SITE.price.set.krw)} 아껴요`,
  "이 기기와 계정에 보관",
];

const scopeLines = (productId: string): string[] => {
  if (productId === SET_PRODUCT_ID) return SET_SCOPE;
  if (isPremiumId(productId)) return [...PREMIUM[productId].scope];
  if (productId !== "tarot" && productId !== "saju") return [];
  const chars = approxCharsText(SITE.reading.approxChars[productId]);
  return [
    `풀이 전체 · 약 ${chars}자`,
    `이어서 물어보기 ${SITE.reading.followUps}번`,
    "내 기록에 계속 보관",
    // 주제별 사주: one payment opens the one reading chosen when it is opened (saju-topics spec §9.2).
    ...(productId === "saju" && sajuTopicsMode() === "on" ? [UNLOCK_SCOPE_LINE] : []),
  ];
};

/**
 * The sections, titles only, per reading (both for the set, each under its name); none for a saju topic reading (its
 * sections follow the 운 chosen when it is opened).
 */
const tocs = (productId: string) => (productId === "saju" && sajuTopicsMode() === "on" ? [] : checkoutTocs(productId));

/** Premium clauses apply to the premium readings and to the set, whose two readings are premium. */
const premiumTerms = (productId: string) => isPremiumId(productId) || productId === SET_PRODUCT_ID;

/** When a refund is possible, as every refund line on this page says it: the set's own rule (the unopened reading's part, owner 2026-11-10). */
const refundRule = (productId: string) =>
  productId === SET_PRODUCT_ID ? setRefundRule() : `열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요.`;

/** The details could not be loaded (a server error or a lost connection): payment words, never a reading's (F-03). */
const LOAD_FAILED: ErrorView = { title: "결제 정보를 불러오지 못했어요", body: "청구된 금액은 없어요. 다시 시도해 주세요.", action: "retry" };
const LOAD_FAILURES = new Set(["UPSTREAM", "QUALITY", "TIMEOUT", "INVALID", "NETWORK"]);

type CheckoutViewProps = {
  productId: string;
  returnTo: string;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
  /** the app: the waits before verifying a charged Google Play purchase again (ms; tests shorten them) */
  retryMs?: readonly number[];
};

/**
 * Spec 5.2. The page shows the product, the server's price, what it holds and the 청약철회 notice,
 * which must be ticked before paying. Then the Toss widget (payment methods and Toss's own terms).
 * Only on 결제하기 is the order created, and only at the server's price. STARLOG_PAY=mock skips the
 * widget and goes straight to /pay/success with a mock payment key. In the Starlog app (provider "play") there is no Toss
 * at all: Google Play's sheet takes the payment (lib/app/bridge.ts `purchase`), /api/pay/play/verify grants it, and the
 * page lands where /pay/success would.
 */
export function CheckoutView({ productId, returnTo, navigate = (url) => window.location.assign(url), retryMs = PLAY_RETRY_MS }: CheckoutViewProps) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  /** G3: an order made while the buyer holds this premium product already, waiting for 하나 더 결제하기 */
  const [again, setAgain] = useState<OrderInfo | null>(null);
  /** 다시 시도 after the details failed to load: loads them again. */
  const [attempt, setAttempt] = useState(0);
  const widgets = useRef<TossWidgets | null>(null);
  /** The page is still open (the app's verify retries stop when it is left). */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const here =`/pay/checkout?${new URLSearchParams({ product: productId, returnTo })}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getJson<CheckoutInfo>(`/api/pay/checkout?product=${encodeURIComponent(productId)}`);
      if (cancelled) return;
      if (!res.ok) {
        if (res.error.code === "LOGIN_REQUIRED") navigate(loginHref(here));
        else setError(LOAD_FAILURES.has(res.error.code) ? LOAD_FAILED : describeApiError(res.error));
        return;
      }
      setInfo(res.data);
      if (res.data.provider !== "toss" || !res.data.clientKey) {
        setReady(res.data.provider === "mock" || res.data.provider === "play");
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
    // `here` and `navigate` follow productId/returnTo; the widget is set up once per product (and per 다시 시도).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, attempt]);

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
    // G3: ask, never refuse: a second 프리미엄 궁합 can be for someone else.
    if ((order.held ?? 0) > 0) {
      setBusy(false);
      setAgain(order);
      return;
    }
    await requestPayment(info, order);
  };

  const requestPayment = async (checkout: CheckoutInfo, order: OrderInfo) => {
    if (checkout.provider === "play") return payOnPlay(order);
    if (checkout.provider === "mock") {
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

  /** The app: Google Play's sheet, then the server grants it, then the reading as after /pay/success. */
  const payOnPlay = async (order: OrderInfo) => {
    const fail = (title: string) => {
      setBusy(false);
      setError({ title, action: "retry" });
    };
    if (!order.play) return fail(PLAY_FAILED);
    let bought: { purchaseToken: string; productId: string };
    try {
      bought = await callNative("purchase", { playProductId: order.play.productId, orderId: order.orderId, accountTag: order.play.accountTag });
    } catch (error) {
      const code = nativeCode(error);
      // The buyer closed Google's sheet: stay here quietly.
      if (code === "CANCELED") return setBusy(false);
      return fail(code === "PENDING" ? PLAY_PENDING : PLAY_FAILED);
    }
    // Google charged: from here a lost or busy answer is never a failure. Asked again after each wait; the pay button stays
    // off (a second purchase would only be refused), and the app's resume check (AppMode) finishes what is still open.
    const verify = () => postJson<PlayPaid>("/api/pay/play/verify", { purchaseToken: bought.purchaseToken, productId: bought.productId });
    let res = await verify();
    for (const delay of retryMs) {
      if (res.ok || PLAY_FINAL.has(res.error.code) || !alive.current) break;
      setError({ title: PLAY_CHARGED, action: null });
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!alive.current) return;
      res = await verify();
    }
    if (!alive.current) return;
    if (!res.ok) {
      if (PLAY_FINAL.has(res.error.code)) return fail(res.error.message ?? PLAY_UNVERIFIED);
      return setError({ title: PLAY_CHARGED, action: null });
    }
    setError(null);
    // Where /pay/success lands after a confirmed payment (PaySuccess finish): the reading with ?unlock=paid, or the login first.
    const target = withQuery(res.data.returnTo, { unlock: "paid" });
    if (res.data.signedIn === false) return navigate(loginHref(target));
    const sent = trackMetaPurchase(res.data.orderId, order.amount);
    void refreshAccount();
    await sent;
    navigate(target);
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
          {/* Sales 2026-11-10 item 1: what the reading holds (titles only) and the one line a buyer hesitates on. */}
          <p className={s.trust}>
            {`${info.productId === SET_PRODUCT_ID ? `한 번 결제로 ${SITE.price.set.includes.map((id) => PREMIUM[id].name).join("와 ")}이 하나씩 열려요.` : "한 번 결제로 풀이 하나가 열려요."} 자동결제는 없어요. ${refundRule(info.productId)}`}
          </p>
          {tocs(info.productId).map(({ name, titles }, i) => (
            <section key={name ?? "toc"} className={s.toc} aria-labelledby={`toc-title-${i}`}>
              <h2 id={`toc-title-${i}`} className={s.noticeTitle}>
                {name ? `${name} 목차` : "풀이 목차"}
              </h2>
              <ol>
                {titles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ol>
            </section>
          ))}
          <section className={s.notice} aria-labelledby="withdrawal-title">
            <h2 id="withdrawal-title" className={s.noticeTitle}>
              결제 전에 확인해 주세요
            </h2>
            <p>결제하면 바로 풀이를 적기 시작해요. 풀이를 적기 시작하면 제공이 시작된 것이라 청약철회가 제한돼요(전자상거래법 제17조 제2항 제5호). 결제 전에 무료로 본 맛보기가 풀이의 일부를 미리 보여 드린 부분이에요.</p>
            <p>
              {`다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 받을 수 있어요. 네 번째로 끊기면 그 결제는 쓴 것으로 처리돼요. ${
                info.productId === SET_PRODUCT_ID ? `${refundRule(info.productId)} 환불은 내 정보에서 받을 수 있어요.` : `열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 내 정보에서 전액 환불받을 수 있어요.`
              } `}
              <Link href="/refund">환불 정책</Link>
            </p>
            <p>만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.</p>
            {/* A premium purchase also agrees to the premium clauses, in force from 2026-10-20 (review 2026-10-20 A1). */}
            {premiumTerms(info.productId) ? (
              <p>
                {"프리미엄 풀이에는 "}
                <Link href="/terms#premium">이용약관 제7조의3</Link>
                {"과 "}
                <Link href="/refund#premium">환불 정책의 프리미엄 풀이</Link>
                {" 항목이 함께 적용돼요."}
              </p>
            ) : null}
          </section>
          <Checkbox checked={agreed} onChange={setAgreed} required>
            {premiumTerms(info.productId) ? "위 내용과 이용약관 제7조의3, 환불 정책의 프리미엄 풀이 항목에 동의해요" : "위 내용을 확인했어요"}
          </Checkbox>
          {info.provider === "toss" ? (
            <>
              <div id="payment-methods" className={s.widget} />
              <div id="payment-agreement" className={s.widget} />
            </>
          ) : info.provider === "mock" ? (
            <p className={s.mock}>테스트 결제예요. 실제로 청구되지 않아요.</p>
          ) : null}
          {error ? (
            <p role="alert" className={s.error}>
              {error.title}
            </p>
          ) : null}
          <div className={s.actions}>
            <div className={s.terms}>
              <p>서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.</p>
              <p>
                {`${refundRule(info.productId)} `}
                <Link href="/refund">환불 정책</Link>
              </p>
              {/* F3: some card companies may still refuse this store; no list of them, only what to do. Not in the app (Google Play). */}
              {info.provider === "play" ? null : <p>결제가 안 되면 다른 카드나 간편결제로 해 보세요.</p>}
            </div>
            <Button block onClick={() => void pay()} disabled={!agreed || !ready || busy}>
              {info.provider === "play" ? `Google Play로 ${won(info.amount)} 결제하기` : `${won(info.amount)} 결제하기`}
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
          <Modal open={again !== null} onClose={() => setAgain(null)} labelledBy="held-title">
            <div className={s.confirm}>
              <h2 id="held-title" className={s.confirmTitle}>
                이미 안 연 구매가 있어요
              </h2>
              <p className={s.confirmText}>그걸로 열거나 하나 더 살 수 있어요.</p>
              <Button block onClick={() => navigate(returnTo)}>
                그걸로 열기
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => {
                  // Closed now, not on the next render: Toss's payment window would open under a modal <dialog>.
                  document.getElementById("held-title")?.closest("dialog")?.close();
                  const order = again;
                  setAgain(null);
                  if (!order) return;
                  setBusy(true);
                  void requestPayment(info, order);
                }}
              >
                하나 더 결제하기
              </Button>
            </div>
          </Modal>
        </>
      ) : error ? (
        <div role="alert" className={s.panel}>
          <p className={s.title}>{error.title}</p>
          {error.body ? <p>{error.body}</p> : null}
          {error.action === "retry" ? (
            <Button
              block
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              다시 시도
            </Button>
          ) : null}
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
