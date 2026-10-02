import "server-only";
import { TossError, type TossClient, type TossPayment } from "./tossTypes";

type Op = "confirm" | "cancel" | "get";

export interface MockToss extends TossClient {
  reset(): void;
  /**
   * The next `op` call fails with `error`. With `applied`, Toss did the work first and only the
   * answer was lost (a timeout after success); without it, nothing happened.
   */
  failNext(op: Op, error: TossError, options?: { applied?: boolean }): void;
}

/**
 * STARLOG_PAY=mock: an in-memory Toss for tests, e2e and local dev. It behaves like the real API
 * where the app depends on it:
 * - a POST replays its Idempotency-Key's first answer, a refusal included (confirm's key is
 *   `confirm-<orderId>`, as the real client sends). 409 processing and no answer are not kept;
 * - a payment is confirmed once (another order with that paymentKey → ALREADY_PROCESSED_PAYMENT);
 * - a paymentKey starting with "mock_fail" is declined;
 * - cancel empties the balance once (a new key afterwards → ALREADY_CANCELED_PAYMENT).
 */
export function createMockToss(): MockToss {
  const payments = new Map<string, TossPayment>();
  const replies = new Map<string, { payment?: TossPayment; error?: TossError }>();
  const planned = new Map<Op, { error: TossError; applied: boolean }>();
  const notFound = () => new TossError(404, "NOT_FOUND_PAYMENT", "존재하지 않는 결제 정보 입니다.");
  const find = (paymentKey: string) => {
    const payment = payments.get(paymentKey);
    if (!payment) throw notFound();
    return payment;
  };
  const kept = (error: TossError) => error.status >= 400 && error.status !== 409;

  /** A POST under `key`: the first answer is kept and replayed; a planned failure goes first. */
  async function post(op: Op, key: string, work: () => TossPayment): Promise<TossPayment> {
    const seen = replies.get(key);
    if (seen?.error) throw seen.error;
    if (seen?.payment) return seen.payment;
    const plan = planned.get(op);
    planned.delete(op);
    if (plan && !plan.applied) {
      if (kept(plan.error)) replies.set(key, { error: plan.error });
      throw plan.error;
    }
    let payment: TossPayment;
    try {
      payment = work();
    } catch (error) {
      if (error instanceof TossError && kept(error)) replies.set(key, { error });
      throw error;
    }
    replies.set(key, { payment });
    if (plan) throw plan.error;
    return payment;
  }

  async function get(work: () => TossPayment): Promise<TossPayment> {
    const plan = planned.get("get");
    planned.delete("get");
    if (plan) throw plan.error;
    return work();
  }

  return {
    mode: "mock",
    confirm: ({ paymentKey, orderId, amount }) =>
      post("confirm", `confirm-${orderId}`, () => {
        if (payments.has(paymentKey)) throw new TossError(400, "ALREADY_PROCESSED_PAYMENT", "이미 처리된 결제 입니다.");
        if (paymentKey.startsWith("mock_fail")) throw new TossError(403, "REJECT_CARD_PAYMENT", "한도초과 혹은 잔액부족으로 결제에 실패했습니다.");
        const payment: TossPayment = { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString(), receiptUrl: null };
        payments.set(paymentKey, payment);
        return payment;
      }),
    getPayment: (paymentKey) => get(() => find(paymentKey)),
    getPaymentByOrder: (orderId) =>
      get(() => {
        for (const payment of payments.values()) if (payment.orderId === orderId) return payment;
        throw notFound();
      }),
    cancel: (paymentKey, { idempotencyKey }) =>
      post("cancel", idempotencyKey, () => {
        const payment = find(paymentKey);
        if (payment.status === "CANCELED") throw new TossError(400, "ALREADY_CANCELED_PAYMENT", "이미 취소된 결제 입니다.");
        const canceled = { ...payment, status: "CANCELED", balanceAmount: 0 };
        payments.set(paymentKey, canceled);
        return canceled;
      }),
    failNext(op, error, options = {}) {
      planned.set(op, { error, applied: options.applied === true });
    },
    reset() {
      payments.clear();
      replies.clear();
      planned.clear();
    },
  };
}

/** The one mock instance (kept on globalThis so every route bundle in `next dev` shares it). */
export const mockToss: MockToss = ((globalThis as unknown as { __starlogMockToss?: MockToss }).__starlogMockToss ??= createMockToss());
