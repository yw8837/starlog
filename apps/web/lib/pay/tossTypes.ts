/** Shapes shared by the real Toss client and the mock (docs.tosspayments.com/reference). */

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  /** READY, IN_PROGRESS, WAITING_FOR_DEPOSIT, DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED */
  status: string;
  totalAmount: number;
  /** what is left to cancel */
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  receiptUrl: string | null;
}

/** A Toss error answer (`{code, message}`), or status 0 / code NETWORK when nothing came back. */
export class TossError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message || code);
  }
}

/**
 * An answer that says nothing about the payment (M2): no answer, a Toss-side 5xx, or 409
 * IDEMPOTENT_REQUEST_PROCESSING (the first request with this Idempotency-Key is still running).
 * Anything that is not a TossError counts too. Never treat these as a refusal: look the payment up.
 */
export function isPendingTossError(error: unknown): boolean {
  if (!(error instanceof TossError)) return true;
  return error.status === 0 || error.status >= 500 || error.status === 409 || error.code === "IDEMPOTENT_REQUEST_PROCESSING";
}

export interface TossClient {
  readonly mode: "test" | "live" | "mock";
  confirm(input: { paymentKey: string; orderId: string; amount: number }): Promise<TossPayment>;
  getPayment(paymentKey: string): Promise<TossPayment>;
  getPaymentByOrder(orderId: string): Promise<TossPayment>;
  cancel(paymentKey: string, input: { reason: string; idempotencyKey: string }): Promise<TossPayment>;
}

/** The fields we use from a Payment object; anything that is not one is a TossError. */
export function parsePayment(value: unknown): TossPayment {
  const v = (value ?? {}) as Record<string, unknown>;
  if (typeof v.paymentKey !== "string" || typeof v.orderId !== "string" || typeof v.status !== "string" || typeof v.totalAmount !== "number") {
    throw new TossError(502, "BAD_RESPONSE", "unexpected payment object");
  }
  const receipt = v.receipt as { url?: unknown } | null | undefined;
  return {
    paymentKey: v.paymentKey,
    orderId: v.orderId,
    status: v.status,
    totalAmount: v.totalAmount,
    balanceAmount: typeof v.balanceAmount === "number" ? v.balanceAmount : v.totalAmount,
    method: typeof v.method === "string" ? v.method : null,
    approvedAt: typeof v.approvedAt === "string" ? v.approvedAt : null,
    receiptUrl: typeof receipt?.url === "string" ? receipt.url : null,
  };
}
