import "server-only";
import { payConfigProblems, payProvider } from "./mode";
import { mockToss } from "./tossMock";
import { TossError, parsePayment, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Toss Payments core API (docs.tosspayments.com/reference). Server only: the secret key never
 * leaves the Worker.
 * - Auth is `Basic base64(secretKey + ":")`; the colon is required.
 * - POSTs carry an Idempotency-Key. Toss keeps it 15 days and replays its first answer, errors
 *   included; 409 IDEMPOTENT_REQUEST_PROCESSING means that first request is still running.
 *   Confirm's key is `confirm-<orderId>` (an order is confirmed once); cancel's comes from the
 *   caller (`cancel-<orderId>-<attempt>`, Task 8).
 * - Confirm must run within 10 minutes of the buyer's authentication.
 * - Each call waits at most 30 s. A caller decides nothing from a missing answer: it looks the
 *   payment up (isPendingTossError).
 */

export const TOSS_API = "https://api.tosspayments.com";

export const tossAuthorization = (secretKey: string) => `Basic ${btoa(`${secretKey}:`)}`;

export function createTossClient(secretKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): TossClient {
  const call = async (path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<TossPayment> => {
    const headers: Record<string, string> = { Authorization: tossAuthorization(secretKey) };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    let response: Response;
    try {
      response = await fetchImpl(`${TOSS_API}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TossError(0, "NETWORK", "no response from Toss");
    }
    const data = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
    if (!response.ok) {
      throw new TossError(response.status, typeof data?.code === "string" ? data.code : "UNKNOWN", typeof data?.message === "string" ? data.message : "");
    }
    return parsePayment(data);
  };
  return {
    mode: secretKey.startsWith("live_") ? "live" : "test",
    confirm: ({ paymentKey, orderId, amount }) =>
      call("/v1/payments/confirm", { method: "POST", body: { paymentKey, orderId, amount }, idempotencyKey: `confirm-${orderId}` }),
    getPayment: (paymentKey) => call(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" }),
    getPaymentByOrder: (orderId) => call(`/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
    cancel: (paymentKey, { reason, idempotencyKey }) =>
      call(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { method: "POST", body: { cancelReason: reason }, idempotencyKey }),
  };
}

let loggedProblems = false;

/**
 * This deploy's Toss: the mock under STARLOG_PAY=mock, null when keys are missing or mixed (logged
 * once, by name). `timeoutMs` shortens the 30 s wait per call (the Cron Trigger's own budget).
 */
export function tossClient(env: NodeJS.ProcessEnv = process.env, options: { timeoutMs?: number } = {}): TossClient | null {
  const problems = payConfigProblems(env);
  if (problems.length) {
    if (!loggedProblems) {
      loggedProblems = true;
      console.error(JSON.stringify({ evt: "config.pay_invalid", problems }));
    }
    return null;
  }
  if (payProvider(env) === "mock") return mockToss;
  return createTossClient(env.TOSS_SECRET_KEY!.trim(), fetch, options.timeoutMs);
}
