/**
 * The Toss Payments JS SDK v2 (docs.tosspayments.com/sdk/v2/js), loaded once by script tag: no npm
 * dependency. Only what the checkout uses is typed.
 */

export const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export interface TossWidgets {
  setAmount(amount: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(options: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(options: { selector: string; variantKey?: string }): Promise<unknown>;
  /** Redirect mode: the browser goes to successUrl or failUrl; it rejects if the buyer closes the window. */
  requestPayment(request: { orderId: string; orderName: string; successUrl: string; failUrl: string }): Promise<void>;
}

type TossPaymentsFactory = (clientKey: string) => { widgets(options: { customerKey: string }): TossWidgets };

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

let loading: Promise<TossPaymentsFactory> | null = null;

export function loadTossSdk(): Promise<TossPaymentsFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  loading ??= new Promise<TossPaymentsFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = () => (window.TossPayments ? resolve(window.TossPayments) : reject(new Error("TossPayments missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Toss SDK failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** The buyer closed the payment window (minor 8): every other requestPayment error is a real failure. */
export function isPaymentWindowClosed(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";
}
