// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { CheckoutView } from "./CheckoutView";

/** The checkout inside the Starlog app (W2.2): the server answers provider "play", and Google Play takes the payment. */

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
const TAG = "c".repeat(64);
const CHECKOUT = { productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "play", clientKey: null, playProductId: "tarot" };
const PAID = { status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: true };

let calls: Array<{ url: string; body?: unknown }> = [];

function stubServer({ verify = () => Response.json(PAID), order = {} }: { verify?: () => Response; order?: Record<string, unknown> } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.startsWith("/api/pay/checkout")) return Response.json(CHECKOUT);
      if (url === "/api/pay/orders") {
        return Response.json({ orderId: ORDER, orderName: "스타로그 타로 전체 풀이", amount: 2900, successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail", play: { productId: "tarot", accountTag: TAG }, ...order });
      }
      if (url === "/api/pay/play/verify") return verify();
      if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } });
      return new Response(null, { status: 404 });
    }),
  );
}

/** The shell's purchase sheet: answers `purchase` with `answer`. */
function fakeShell(answer: { ok: true; data: unknown } | { ok: false; code: string }) {
  const sent: Array<{ type: string; payload?: unknown }> = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { id: string; type: string; payload?: unknown };
      sent.push({ type: message.type, payload: message.payload });
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id: message.id, ...answer }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return sent;
}

beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  resetBridgeForTests();
  resetAccountForTests();
  stubServer();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  delete (window as { TossPayments?: unknown }).TossPayments;
  resetBridgeForTests();
  resetAccountForTests();
});

const CHARGED = "결제는 됐어요. 풀이를 여는 중이에요. 잠시 뒤 자동으로 열려요.";

async function openAndPay(navigate: (url: string) => void = vi.fn()) {
  // the verify retries' waits, short for the test (the page's own are 2 s, 5 s, 10 s)
  render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} retryMs={[5, 5, 5]} />);
  const pay = (await screen.findByRole("button", { name: "Google Play로 2,900원 결제하기" })) as HTMLButtonElement;
  fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
  await waitFor(() => expect(pay.disabled).toBe(false));
  fireEvent.click(pay);
  return pay;
}

describe("CheckoutView in the Starlog app (provider play)", () => {
  it("loads no Toss SDK and shows no widget or web payment wording, and keeps every notice and the 청약철회 check", async () => {
    const toss = vi.fn();
    vi.stubGlobal("TossPayments", toss);
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={vi.fn()} />);
    const pay = (await screen.findByRole("button", { name: "Google Play로 2,900원 결제하기" })) as HTMLButtonElement;
    expect(toss).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="tosspayments"]')).toBeNull();
    expect(document.getElementById("payment-methods")).toBeNull();
    expect(document.getElementById("payment-agreement")).toBeNull();
    expect(document.body.textContent).not.toMatch(/토스|카드나|간편결제|테스트 결제/);
    expect(screen.getByText(/청약철회가 제한돼요/)).toBeTruthy();
    expect(screen.getByText("만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.")).toBeTruthy();
    expect(screen.getByText("서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.")).toBeTruthy();
    expect(pay.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
    expect(pay.disabled).toBe(false);
  });

  it("orders, buys on Google Play with the order's ids, verifies, and lands where /pay/success lands (?unlock=paid)", async () => {
    const sent = fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    const navigate = vi.fn();
    await openAndPay(navigate);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(calls.find((c) => c.url === "/api/pay/orders")!.body).toEqual({ productId: "tarot", returnTo: "/tarot/result", ack: true });
    expect(sent).toEqual([{ type: "purchase", payload: { playProductId: "tarot", orderId: ORDER, accountTag: TAG } }]);
    expect(calls.find((c) => c.url === "/api/pay/play/verify")!.body).toEqual({ purchaseToken: "play-token", productId: "tarot" });
    expect(calls.some((c) => c.url === "/api/me")).toBe(true);
  });

  it("asks for the login on the way back when the payment's account is not logged in here", async () => {
    fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    stubServer({ verify: () => Response.json({ ...PAID, signedIn: false }) });
    const navigate = vi.fn();
    await openAndPay(navigate);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?next=%2Ftarot%2Fresult%3Funlock%3Dpaid"));
  });

  it("stays on the page quietly when the buyer closes Google's sheet", async () => {
    fakeShell({ ok: false, code: "CANCELED" });
    const navigate = vi.fn();
    const pay = await openAndPay(navigate);
    await waitFor(() => expect(pay.disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calls.some((c) => c.url === "/api/pay/play/verify")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says a payment Google still holds as pending opens by itself once it is done", async () => {
    fakeShell({ ok: false, code: "PENDING" });
    await openAndPay();
    expect((await screen.findByRole("alert")).textContent).toBe("결제가 아직 끝나지 않았어요. 결제가 끝나면 자동으로 열려요.");
    expect(calls.some((c) => c.url === "/api/pay/play/verify")).toBe(false);
  });

  it("once Google charged, never says the payment failed: a lost answer is asked again (backoff) and lands when it comes", async () => {
    fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    const answers = [() => new Response("bad gateway", { status: 502 }), () => Response.json({ code: "PAY_PENDING" }, { status: 409 }), () => Response.json(PAID)];
    stubServer({ verify: () => answers.shift()!() });
    const navigate = vi.fn();
    await openAndPay(navigate);
    expect((await screen.findByRole("alert")).textContent).toBe(CHARGED);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(calls.filter((c) => c.url === "/api/pay/play/verify")).toHaveLength(3);
    expect(document.body.textContent).not.toContain("결제하지 못했어요");
  });

  it("after the retries leaves the 'paid, opening' line on screen with the pay button off (the app's resume check finishes it)", async () => {
    fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    const unavailable = [
      () => Response.json({ code: "PAY_UNAVAILABLE" }, { status: 503 }),
      () => Promise.reject(new TypeError("network")),
      () => Response.json({ code: "PAY_PENDING" }, { status: 409 }),
      () => new Response("down", { status: 500 }),
    ];
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.startsWith("/api/pay/checkout")) return Response.json(CHECKOUT);
        if (url === "/api/pay/orders") return Response.json({ orderId: ORDER, orderName: "x", amount: 2900, successUrl: "s", failUrl: "f", play: { productId: "tarot", accountTag: TAG } });
        if (url === "/api/pay/play/verify") return unavailable.shift()!();
        return new Response(null, { status: 404 });
      }),
    );
    const navigate = vi.fn();
    const pay = await openAndPay(navigate);
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/pay/play/verify")).toHaveLength(4));
    expect((await screen.findByRole("alert")).textContent).toBe(CHARGED);
    expect(pay.disabled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows a definite refusal from the server (PAY_FAILED, BAD_REQUEST): its message, else a plain line", async () => {
    fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    stubServer({ verify: () => Response.json({ code: "PAY_FAILED", message: "구매를 확인하지 못했어요. 청구된 금액은 없어요." }, { status: 402 }) });
    await openAndPay();
    expect((await screen.findByRole("alert")).textContent).toBe("구매를 확인하지 못했어요. 청구된 금액은 없어요.");
    expect(calls.filter((c) => c.url === "/api/pay/play/verify")).toHaveLength(1);
    cleanup();
    resetBridgeForTests();
    fakeShell({ ok: true, data: { purchaseToken: "play-token", productId: "tarot" } });
    stubServer({ verify: () => Response.json({ code: "BAD_REQUEST" }, { status: 400 }) });
    await openAndPay();
    expect((await screen.findByRole("alert")).textContent).toBe("결제를 확인하지 못했어요. 문의해 주세요.");
  });

  describe("Google Play says the product is owned already (an earlier purchase of it was never finished)", () => {
    /** The shell: `purchase` answers OWNED, `unfinishedPurchases` lists `unfinished` (or fails). */
    function ownedShell(unfinished: Array<{ purchaseToken: string; productId: string }> | "ERROR") {
      const sent: string[] = [];
      const native = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        postMessage: (raw: string) => {
          const { id, type } = JSON.parse(raw) as { id: string; type: string };
          sent.push(type);
          const answer =
            type === "purchase" ? { ok: false, code: "OWNED" } : unfinished === "ERROR" ? { ok: false, code: "ERROR" } : { ok: true, data: { purchases: unfinished } };
          queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id, ...answer }) }));
        },
      };
      Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
      return sent;
    }
    const OWNED_LINE = "이전 결제를 정리하고 있어요. 잠시 뒤 다시 시도해 주세요.";

    it("finishes the earlier purchase and lands as after a normal one when it was this product", async () => {
      const sent = ownedShell([
        { purchaseToken: "old-saju", productId: "saju" },
        { purchaseToken: "old-tarot", productId: "tarot" },
      ]);
      const verified: Record<string, unknown> = {
        "old-saju": { status: "paid", orderId: "o-saju", productId: "saju", returnTo: "/saju/chart", signedIn: true },
        "old-tarot": { status: "paid", orderId: "o-tarot", productId: "tarot", returnTo: "/tarot/result", signedIn: true },
      };
      calls = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          const body = init?.body ? (JSON.parse(String(init.body)) as { purchaseToken?: string }) : undefined;
          calls.push({ url, body });
          if (url.startsWith("/api/pay/checkout")) return Response.json(CHECKOUT);
          if (url === "/api/pay/orders") return Response.json({ orderId: ORDER, orderName: "x", amount: 2900, successUrl: "s", failUrl: "f", play: { productId: "tarot", accountTag: TAG } });
          if (url === "/api/pay/play/verify") return Response.json(verified[body!.purchaseToken!]);
          return Response.json({ payments: true, login: true, owner: false, user: null });
        }),
      );
      const navigate = vi.fn();
      await openAndPay(navigate);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
      expect(sent).toEqual(["purchase", "unfinishedPurchases"]);
      expect(calls.filter((c) => c.url === "/api/pay/play/verify").map((c) => c.body)).toEqual([
        { purchaseToken: "old-saju", productId: "saju" },
        { purchaseToken: "old-tarot", productId: "tarot" },
      ]);
      expect(document.body.textContent).not.toContain("결제하지 못했어요");
    });

    it("says the earlier payment is being sorted out when none of them was this product, or they could not be read", async () => {
      ownedShell([{ purchaseToken: "old-saju", productId: "saju" }]);
      stubServer({ verify: () => Response.json({ status: "paid", orderId: "o-saju", productId: "saju", returnTo: "/saju/chart", signedIn: true }) });
      const navigate = vi.fn();
      const pay = await openAndPay(navigate);
      expect((await screen.findByRole("alert")).textContent).toBe(OWNED_LINE);
      await waitFor(() => expect(pay.disabled).toBe(false));
      expect(navigate).not.toHaveBeenCalled();
      cleanup();
      resetBridgeForTests();
      ownedShell([{ purchaseToken: "unknown", productId: "tarot" }]);
      stubServer({ verify: () => Response.json({ code: "BAD_REQUEST" }, { status: 400 }) });
      await openAndPay();
      expect((await screen.findByRole("alert")).textContent).toBe(OWNED_LINE);
      cleanup();
      resetBridgeForTests();
      ownedShell("ERROR");
      stubServer();
      await openAndPay();
      expect((await screen.findByRole("alert")).textContent).toBe(OWNED_LINE);
      expect(document.body.textContent).not.toContain("결제하지 못했어요");
    });
  });

  it("says a plain line when the app's purchase fails before any charge (never cards or 토스)", async () => {
    fakeShell({ ok: false, code: "ERROR" });
    await openAndPay();
    expect((await screen.findByRole("alert")).textContent).toBe("결제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  });

  it("says so when the app's billing is missing (no shell answer)", async () => {
    await openAndPay();
    expect((await screen.findByRole("alert")).textContent).toBe("결제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  });
});
