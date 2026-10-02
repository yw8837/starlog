import { beforeEach, describe, expect, it } from "vitest";
import { createTossClient, tossAuthorization, tossClient } from "./toss";
import { mockToss } from "./tossMock";
import { TossError, isPendingTossError } from "./tossTypes";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const SECRET = "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
const PAYMENT = {
  paymentKey: "tgen_20261001",
  orderId: ORDER,
  status: "DONE",
  totalAmount: 2900,
  balanceAmount: 2900,
  method: "카드",
  approvedAt: "2026-10-01T12:00:00+09:00",
  receipt: { url: "https://dashboard.tosspayments.com/receipt/redirection?transactionId=x" },
};

function fakeFetch(responses: Array<{ status: number; body: unknown } | "network">) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift()!;
    if (next === "network") throw new TypeError("fetch failed");
    return Response.json(next.body, { status: next.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("Toss client", () => {
  it("confirms with Basic secret-plus-colon auth, an idempotency key and the amount it is given", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: PAYMENT }]);
    const payment = await createTossClient(SECRET, fetchImpl).confirm({ paymentKey: PAYMENT.paymentKey, orderId: ORDER, amount: 2900 });
    expect(payment).toEqual({
      paymentKey: PAYMENT.paymentKey,
      orderId: ORDER,
      status: "DONE",
      totalAmount: 2900,
      balanceAmount: 2900,
      method: "카드",
      approvedAt: PAYMENT.approvedAt,
      receiptUrl: PAYMENT.receipt.url,
    });
    expect(calls[0]).toMatchObject({ url: "https://api.tosspayments.com/v1/payments/confirm", method: "POST", body: { paymentKey: PAYMENT.paymentKey, orderId: ORDER, amount: 2900 } });
    expect(calls[0]!.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `confirm-${ORDER}`,
    });
    expect(tossAuthorization(SECRET)).toBe(`Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`);
  });

  it("looks payments up by key and by order, without an idempotency key", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: PAYMENT }, { status: 200, body: PAYMENT }]);
    const client = createTossClient(SECRET, fetchImpl);
    await client.getPayment(PAYMENT.paymentKey);
    await client.getPaymentByOrder(ORDER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", `https://api.tosspayments.com/v1/payments/${PAYMENT.paymentKey}`],
      ["GET", `https://api.tosspayments.com/v1/payments/orders/${ORDER}`],
    ]);
    for (const call of calls) expect(Object.keys(call.headers)).toEqual(["Authorization"]);
  });

  it("cancels with the reason and the caller's idempotency key", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: { ...PAYMENT, status: "CANCELED", balanceAmount: 0 } }]);
    const payment = await createTossClient(SECRET, fetchImpl).cancel(PAYMENT.paymentKey, { reason: "열지 않은 풀이 환불", idempotencyKey: `cancel-${ORDER}` });
    expect(payment.status).toBe("CANCELED");
    expect(calls[0]).toMatchObject({ url: `https://api.tosspayments.com/v1/payments/${PAYMENT.paymentKey}/cancel`, method: "POST", body: { cancelReason: "열지 않은 풀이 환불" } });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe(`cancel-${ORDER}`);
  });

  it("turns Toss errors, no response and odd bodies into TossError", async () => {
    const declined = createTossClient(SECRET, fakeFetch([{ status: 403, body: { code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." } }]).fetchImpl);
    await expect(declined.confirm({ paymentKey: "k", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ status: 403, code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    const offline = createTossClient(SECRET, fakeFetch(["network"]).fetchImpl);
    await expect(offline.getPayment("k")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
    const odd = createTossClient(SECRET, fakeFetch([{ status: 200, body: {} }]).fetchImpl);
    await expect(odd.getPayment("k")).rejects.toBeInstanceOf(TossError);
  });

  it("calls an answer unknown when Toss gave none, failed itself, or is still processing the key", () => {
    expect(isPendingTossError(new TossError(0, "NETWORK", ""))).toBe(true);
    expect(isPendingTossError(new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""))).toBe(true);
    expect(isPendingTossError(new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", ""))).toBe(true);
    expect(isPendingTossError(new Error("anything else"))).toBe(true);
    expect(isPendingTossError(new TossError(403, "REJECT_CARD_PAYMENT", ""))).toBe(false);
    expect(isPendingTossError(new TossError(400, "ALREADY_PROCESSED_PAYMENT", ""))).toBe(false);
  });

  it("knows test from live by the secret key", () => {
    expect(createTossClient("test_gsk_x").mode).toBe("test");
    expect(createTossClient("live_gsk_x").mode).toBe("live");
  });

  it("picks the mock with STARLOG_PAY=mock and nothing when the keys are wrong", () => {
    expect(tossClient(env({ STARLOG_PAY: "mock", NODE_ENV: "test" }))).toBe(mockToss);
    expect(tossClient(env({ NODE_ENV: "production" }))).toBeNull();
    expect(tossClient(env({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_a", TOSS_SECRET_KEY: SECRET }))?.mode).toBe("test");
  });
});

describe("mock Toss", () => {
  beforeEach(() => mockToss.reset());

  it("approves a payment once: the same order replays its answer, another order is refused", async () => {
    const payment = await mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 });
    expect(payment).toMatchObject({ status: "DONE", totalAmount: 2900, orderId: ORDER });
    expect(await mockToss.confirm({ paymentKey: "mock_1", orderId: ORDER, amount: 2900 })).toEqual(payment);
    await expect(mockToss.confirm({ paymentKey: "mock_1", orderId: "Other_order_000000000001", amount: 2900 })).rejects.toMatchObject({ code: "ALREADY_PROCESSED_PAYMENT" });
    expect(await mockToss.getPaymentByOrder(ORDER)).toEqual(payment);
  });

  it("replays a key's first answer, a refusal included, and cancels once", async () => {
    await expect(mockToss.confirm({ paymentKey: "mock_fail_1", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ status: 403, code: "REJECT_CARD_PAYMENT" });
    // The same order (the same Idempotency-Key) gets the same refusal, whatever it sends now.
    await expect(mockToss.confirm({ paymentKey: "mock_2", orderId: ORDER, amount: 2900 })).rejects.toMatchObject({ code: "REJECT_CARD_PAYMENT" });
    const other = "Cc3_dEf-Gh5iJk7Lm9No1Pq2";
    await mockToss.confirm({ paymentKey: "mock_2", orderId: other, amount: 2900 });
    expect(await mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-1" })).toMatchObject({ status: "CANCELED", balanceAmount: 0 });
    expect(await mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-1" })).toMatchObject({ status: "CANCELED" });
    await expect(mockToss.cancel("mock_2", { reason: "r", idempotencyKey: "cancel-2" })).rejects.toMatchObject({ code: "ALREADY_CANCELED_PAYMENT" });
    await expect(mockToss.getPayment("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND_PAYMENT" });
  });

  it("can lose an answer after the work, or refuse before it", async () => {
    await mockToss.confirm({ paymentKey: "mock_3", orderId: ORDER, amount: 2900 });
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    await expect(mockToss.cancel("mock_3", { reason: "r", idempotencyKey: "cancel-a" })).rejects.toMatchObject({ status: 0 });
    expect((await mockToss.getPayment("mock_3")).status).toBe("CANCELED");
    expect(await mockToss.cancel("mock_3", { reason: "r", idempotencyKey: "cancel-a" })).toMatchObject({ status: "CANCELED" });
  });

  it("keeps no answer for a key that was still processing", async () => {
    await mockToss.confirm({ paymentKey: "mock_4", orderId: ORDER, amount: 2900 });
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    await expect(mockToss.cancel("mock_4", { reason: "r", idempotencyKey: "cancel-b" })).rejects.toMatchObject({ status: 409 });
    expect((await mockToss.getPayment("mock_4")).status).toBe("DONE");
    expect(await mockToss.cancel("mock_4", { reason: "r", idempotencyKey: "cancel-b" })).toMatchObject({ status: "CANCELED" });
  });
});
