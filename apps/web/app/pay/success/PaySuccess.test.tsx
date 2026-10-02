// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { PaySuccess } from "./PaySuccess";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

function stub(routes: Record<string, Array<() => Response>>) {
  const bodies: Record<string, unknown[]> = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = url.split("?")[0]!;
    (bodies[key] ??= []).push(init?.body ? JSON.parse(String(init.body)) : null);
    const queue = routes[key] ?? [() => Response.json({ payments: true, login: true, owner: false, user: null })];
    return (queue.length > 1 ? queue.shift()! : queue[0]!)();
  }));
  return bodies;
}

describe("PaySuccess", () => {
  it("confirms with the query's values and opens the reading", async () => {
    const bodies = stub({ "/api/pay/confirm": [() => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: true })] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(bodies["/api/pay/confirm"]).toEqual([{ paymentKey: "tgen_1", orderId: ORDER, amount: 2900 }]);
  });

  it("waits while the payment is being checked", async () => {
    stub({
      "/api/pay/confirm": [() => Response.json({ code: "PAY_PENDING" }, { status: 409 })],
      "/api/pay/orders": [
        () => Response.json({ orderId: ORDER, productId: "saju", status: "confirming", returnTo: "/saju/chart", signedIn: true }),
        () => Response.json({ orderId: ORDER, productId: "saju", status: "paid", returnTo: "/saju/chart", signedIn: true }),
      ],
    });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
    expect(await screen.findByText("결제를 확인하고 있어요")).toBeTruthy();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/saju/chart?unlock=paid"));
  });

  it("in a browser without the session, says the payment went through and asks for a login to open it", async () => {
    stub({ "/api/pay/confirm": [() => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: false })] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    expect(await screen.findByText("결제했어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하고 풀이 열기" }).getAttribute("href")).toBe("/login?next=%2Ftarot%2Fresult%3Funlock%3Dpaid");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says why a payment was not completed", async () => {
    stub({ "/api/pay/confirm": [() => Response.json({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." }, { status: 402 })] });
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={() => {}} />);
    expect(await screen.findByText("결제를 마치지 못했어요")).toBeTruthy();
    expect(screen.getByText("한도초과 혹은 잔액부족으로 결제에 실패했습니다.")).toBeTruthy();
  });
});
