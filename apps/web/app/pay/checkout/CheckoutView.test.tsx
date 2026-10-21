// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutView } from "./CheckoutView";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
let calls: Array<{ url: string; init?: RequestInit }> = [];

function stubFetch(checkout: Response, order: Record<string, unknown> = {}) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/pay/checkout")) return checkout.clone();
    if (url === "/api/pay/orders") {
      return Response.json({ orderId: ORDER, orderName: "스타로그 타로 전체 풀이", amount: 2900, successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail", ...order });
    }
    return new Response(null, { status: 404 });
  }));
}

// jsdom has no <dialog> methods; Modal calls showModal()/close().
beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});

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
    // F2-a: 제공 starts when the reading starts being written, which follows the payment by itself.
    expect(screen.getByText(/결제하면 바로 풀이를 적기 시작해요\. 풀이를 적기 시작하면 제공이 시작된 것이라 청약철회가 제한돼요/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("화면에 나오기");
    // F2-b: the "3번까지" promise says what happens after the third.
    expect(screen.getByText(/다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 받을 수 있어요\. 네 번째로 끊기면 그 결제는 쓴 것으로 처리돼요\./)).toBeTruthy();
    expect(within(actions).getByRole("link", { name: "환불 정책" }).getAttribute("href")).toBe("/refund");
    // F3: some card companies may refuse for now; no list of them, only what to do.
    expect(actions.textContent).toContain("결제가 안 되면 다른 카드나 간편결제로 해 보세요.");
  });

  it("sends a guest to login and back to this page", async () => {
    stubFetch(Response.json({ code: "LOGIN_REQUIRED", message: "로그인이 필요해요." }, { status: 401 }));
    const navigate = vi.fn();
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?next=%2Fpay%2Fcheckout%3Fproduct%3Dtarot%26returnTo%3D%252Ftarot%252Fresult"));
  });

  it("when the payment details cannot be loaded, says so in payment words (never a reading error) and tries again (F-03)", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={vi.fn()} />);
    expect(await screen.findByText("결제 정보를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("청구된 금액은 없어요. 다시 시도해 주세요.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/풀이를 다 적지 못했어요|횟수/);
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "풀이로 돌아가기" }).getAttribute("href")).toBe("/tarot/result");
    stubFetch(Response.json({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: "c_x", provider: "mock", clientKey: null }));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("2,900원")).toBeTruthy();
  });

  it("has a premium buyer agree to the premium clauses (이용약관 제7조의3, the refund policy's premium part), linked, in the one check before the one pay button (review 2026-10-20 A1)", async () => {
    stubFetch(Response.json({ productId: "match", name: "프리미엄 궁합", amount: 7900, customerKey: "c_x", provider: "mock", clientKey: null }));
    render(<CheckoutView productId="match" returnTo="/premium/match/preview" navigate={vi.fn()} />);
    expect(await screen.findByText("7,900원")).toBeTruthy();
    expect(screen.getByRole("link", { name: "이용약관 제7조의3" }).getAttribute("href")).toBe("/terms#premium");
    expect(screen.getByRole("link", { name: "환불 정책의 프리미엄 풀이" }).getAttribute("href")).toBe("/refund#premium");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    const check = screen.getByRole("checkbox", { name: "위 내용과 이용약관 제7조의3, 환불 정책의 프리미엄 풀이 항목에 동의해요" });
    const pay = screen.getByRole("button", { name: "7,900원 결제하기" }) as HTMLButtonElement;
    expect(screen.getAllByRole("button", { name: /결제하기/ })).toHaveLength(1);
    expect(pay.disabled).toBe(true);
    fireEvent.click(check);
    expect(pay.disabled).toBe(false);
  });

  it("keeps the standard readings' check as it is: no premium clause", async () => {
    render(<CheckoutView productId="tarot" returnTo="/tarot/result" navigate={vi.fn()} />);
    expect(await screen.findByRole("checkbox", { name: "위 내용을 확인했어요" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("제7조의3");
  });

  describe("a premium purchase held already (G3)", () => {
    const MATCH = Response.json({ productId: "match", name: "프리미엄 궁합", amount: 7900, customerKey: "c_x", provider: "mock", clientKey: null });
    const SUCCESS = `http://localhost/pay/success?paymentType=NORMAL&orderId=${ORDER}&paymentKey=mock_${ORDER}&amount=7900`;

    async function payForMatch(navigate: (url: string) => void) {
      render(<CheckoutView productId="match" returnTo="/premium/match/preview" navigate={navigate} />);
      await screen.findByText("7,900원");
      fireEvent.click(screen.getByRole("checkbox", { name: "위 내용과 이용약관 제7조의3, 환불 정책의 프리미엄 풀이 항목에 동의해요" }));
      fireEvent.click(screen.getByRole("button", { name: "7,900원 결제하기" }));
    }

    it("asks before a second one: open the one held, back where the buyer came from", async () => {
      stubFetch(MATCH, { orderName: "스타로그 프리미엄 궁합", amount: 7900, held: 1 });
      const navigate = vi.fn();
      await payForMatch(navigate);
      const dialog = (await screen.findByRole("heading", { name: "이미 안 연 구매가 있어요" })).closest("dialog")!;
      expect(dialog.hasAttribute("open")).toBe(true);
      expect(dialog.textContent).toContain("그걸로 열거나 하나 더 살 수 있어요.");
      expect(navigate).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: "그걸로 열기" }));
      expect(navigate).toHaveBeenCalledWith("/premium/match/preview");
    });

    it("buys another when asked to, with the order already made (two 궁합 for two people)", async () => {
      stubFetch(MATCH, { orderName: "스타로그 프리미엄 궁합", amount: 7900, held: 1 });
      const navigate = vi.fn();
      await payForMatch(navigate);
      const dialog = (await screen.findByRole("heading", { name: "이미 안 연 구매가 있어요" })).closest("dialog")!;
      fireEvent.click(within(dialog).getByRole("button", { name: "하나 더 결제하기" }));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(SUCCESS));
      expect(calls.filter((c) => c.url === "/api/pay/orders")).toHaveLength(1);
    });

    it("closes the dialog before Toss opens its payment window, which would sit under a modal <dialog>", async () => {
      stubFetch(Response.json({ productId: "match", name: "프리미엄 궁합", amount: 7900, customerKey: "c_x", provider: "toss", clientKey: "test_gck_x" }), {
        orderName: "스타로그 프리미엄 궁합", amount: 7900, held: 1,
      });
      let dialogOpen: boolean | null = null;
      const widgets = {
        setAmount: async () => {},
        renderPaymentMethods: async () => {},
        renderAgreement: async () => {},
        requestPayment: vi.fn(async () => {
          dialogOpen = document.querySelector("dialog")!.hasAttribute("open");
        }),
      };
      vi.stubGlobal("TossPayments", () => ({ widgets: () => widgets }));
      render(<CheckoutView productId="match" returnTo="/premium/match/preview" navigate={vi.fn()} />);
      await screen.findByText("7,900원");
      fireEvent.click(screen.getByRole("checkbox", { name: "위 내용과 이용약관 제7조의3, 환불 정책의 프리미엄 풀이 항목에 동의해요" }));
      const pay = screen.getByRole("button", { name: "7,900원 결제하기" }) as HTMLButtonElement;
      await waitFor(() => expect(pay.disabled).toBe(false));
      fireEvent.click(pay);
      const dialog = (await screen.findByRole("heading", { name: "이미 안 연 구매가 있어요" })).closest("dialog")!;
      fireEvent.click(within(dialog).getByRole("button", { name: "하나 더 결제하기" }));
      await waitFor(() => expect(widgets.requestPayment).toHaveBeenCalledTimes(1));
      expect(dialogOpen).toBe(false);
    });

    it("goes straight on without one held", async () => {
      stubFetch(MATCH, { orderName: "스타로그 프리미엄 궁합", amount: 7900, held: 0 });
      const navigate = vi.fn();
      await payForMatch(navigate);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(SUCCESS));
      expect(screen.getByText("이미 안 연 구매가 있어요").closest("dialog")!.hasAttribute("open")).toBe(false);
    });
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

describe("CheckoutView notice lines (M-13)", () => {
  it("keeps the link inside a notice line inline, its tap room from padding, so the line is not taller than the rest", () => {
    const file = ["apps/web/app/pay/pay.module.css", "app/pay/pay.module.css"].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(path));
    const rule = /\.notice a \{([^}]*)\}/.exec(readFileSync(file ?? "", "utf8"))?.[1] ?? "";
    expect(rule).toMatch(/display: inline;/);
    expect(rule).not.toMatch(/min-height|inline-flex/);
    expect(rule).toMatch(/padding: 13px 0;/);
  });
});
