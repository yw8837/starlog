// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutView } from "./CheckoutView";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
let calls: Array<{ url: string; init?: RequestInit }> = [];

function stubFetch(checkout: Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/pay/checkout")) return checkout.clone();
    if (url === "/api/pay/orders") {
      return Response.json({ orderId: ORDER, orderName: "스타로그 타로 전체 풀이", amount: 2900, successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail" });
    }
    return new Response(null, { status: 404 });
  }));
}

beforeEach(() => stubFetch(Response.json({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "mock", clientKey: null })));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckoutView", () => {
  it("shows the product, the price and the 청약철회 notice, and pays only after the check", async () => {
    const navigate = vi.fn();
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} />);
    expect(await screen.findByText("2,900원")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "타로 전체 풀이" })).toBeTruthy();
    expect(screen.getByText(/청약철회가 제한돼요/)).toBeTruthy();
    expect(screen.getByText(/열기 전에는 결제일로부터 7일 안에 내 정보에서 전액 환불받을 수 있어요/)).toBeTruthy();
    expect(screen.getByText("만 19세 미만이 법정대리인의 동의 없이 결제하면 본인이나 법정대리인이 결제를 취소할 수 있어요.")).toBeTruthy();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    const pay = screen.getByRole("button", { name: "2,900원 결제하기" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
    fireEvent.click(pay);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`http://localhost/pay/success?paymentType=NORMAL&orderId=${ORDER}&paymentKey=mock_${ORDER}&amount=2900`),
    );
    expect(JSON.parse(String(calls.find((c) => c.url === "/api/pay/orders")!.init!.body))).toEqual({ productId: "tarot", returnTo: "/tarot/result", ack: true });
  });

  it("says right by the pay button that the reading opens on payment, and how a refund works", async () => {
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={vi.fn()} />);
    const actions = (await screen.findByRole("button", { name: "2,900원 결제하기" })).closest("div")!;
    expect(actions.textContent).toContain("서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.");
    expect(actions.textContent).toContain("열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요.");
    expect(screen.getByText(/풀이가 나오는 동안 화면을 닫아도 3번까지 다시 열어 받을 수 있어요/)).toBeTruthy();
    expect(screen.getByText(/화면에 나오기 시작하면 청약철회가 제한돼요/)).toBeTruthy();
    expect(within(actions).getByRole("link", { name: "환불 정책" }).getAttribute("href")).toBe("/refund");
  });

  it("sends a guest to login and back to this page", async () => {
    stubFetch(Response.json({ code: "LOGIN_REQUIRED", message: "로그인이 필요해요." }, { status: 401 }));
    const navigate = vi.fn();
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?next=%2Fpay%2Fcheckout%3Fproduct%3Dtarot%26returnTo%3D%252Ftarot%252Fresult"));
  });

  it("explains a product that cannot be bought", async () => {
    stubFetch(Response.json({ code: "NOT_AVAILABLE", message: "지금은 열 수 없는 상품이에요." }, { status: 409 }));
    render(<CheckoutView productId="match" returnTo="/" navigate={() => {}} />);
    expect(await screen.findByText("지금은 열 수 없는 상품이에요")).toBeTruthy();
  });

  /** The Toss widget, faked: requestPayment rejects with `failure`. */
  function fakeToss(failure: unknown) {
    stubFetch(Response.json({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "toss", clientKey: "test_gck_x" }));
    const widgets = {
      setAmount: async () => {},
      renderPaymentMethods: async () => {},
      renderAgreement: async () => {},
      requestPayment: vi.fn(async () => {
        throw failure;
      }),
    };
    vi.stubGlobal("TossPayments", () => ({ widgets: () => widgets }));
    return widgets;
  }

  async function payWithToss() {
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={() => {}} />);
    await screen.findByText("2,900원");
    fireEvent.click(screen.getByRole("checkbox", { name: "위 내용을 확인했어요" }));
    const pay = screen.getByRole("button", { name: "2,900원 결제하기" }) as HTMLButtonElement;
    await waitFor(() => expect(pay.disabled).toBe(false));
    fireEvent.click(pay);
    return pay;
  }

  it("stays quiet when the buyer closes the payment window", async () => {
    const widgets = fakeToss({ code: "USER_CANCEL", message: "사용자가 결제를 취소했습니다." });
    const pay = await payWithToss();
    await waitFor(() => expect(widgets.requestPayment).toHaveBeenCalled());
    await waitFor(() => expect(pay.disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the payment window could not open", async () => {
    fakeToss({ code: "INVALID_PARAMETERS", message: "잘못된 요청입니다." });
    await payWithToss();
    expect((await screen.findByRole("alert")).textContent).toBe("결제창을 열지 못했어요");
  });

  it("says one saju payment opens one chosen reading while the topics are on", async () => {
    stubFetch(Response.json({ productId: "saju", name: "사주 전체 풀이", amount: 2900, customerKey: "c_x", provider: "mock", clientKey: null }));
    render(<CheckoutView productId="saju" returnTo="/saju/chart" navigate={vi.fn()} />);
    expect(await screen.findByText("결제 한 번에 고른 풀이 하나를 열어요")).toBeTruthy();
    // the owner's range for saju (2026-10-08)
    expect(screen.getByText("풀이 전체 · 약 2,500~3,000자")).toBeTruthy();
  });

  it("keeps the tarot lines as they are", async () => {
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={vi.fn()} />);
    expect(await screen.findByText("이 기기에 계속 보관")).toBeTruthy();
    expect(screen.getByText("풀이 전체 · 약 2,000자")).toBeTruthy();
    expect(screen.queryByText("결제 한 번에 고른 풀이 하나를 열어요")).toBeNull();
  });
});
