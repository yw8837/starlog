// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { PaySuccess, pollSchedule } from "./PaySuccess";

const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  window.history.replaceState(null, "", "/");
});

const order = (status: string) => () => Response.json({ orderId: ORDER, productId: "tarot", status, returnTo: "/tarot/result", signedIn: true });
const paid = () => Response.json({ status: "paid", orderId: ORDER, productId: "tarot", returnTo: "/tarot/result", signedIn: true });

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

  it("never takes a lost answer, a busy server or a rate limit as the end: it waits for the order", async () => {
    for (const answer of [() => { throw new TypeError("offline"); }, () => Response.json({ code: "RATE_LIMIT" }, { status: 429 }), () => new Response("busy", { status: 503 })]) {
      const bodies = stub({ "/api/pay/confirm": [answer], "/api/pay/orders": [order("confirming"), order("paid")] });
      const navigate = vi.fn();
      render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
      expect(screen.queryByText(/연결이 잠시 끊겼어요/)).toBeNull();
      expect(bodies["/api/pay/orders"]?.length).toBe(2);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("confirms a still-created order once more, and only once", async () => {
    const bodies = stub({
      "/api/pay/confirm": [() => { throw new TypeError("offline"); }, () => Response.json({ code: "PAY_PENDING" }, { status: 409 })],
      "/api/pay/orders": [order("created"), order("created"), order("paid")],
    });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    const sent = { paymentKey: "tgen_1", orderId: ORDER, amount: 2900 };
    expect(bodies["/api/pay/confirm"]).toEqual([sent, sent]);
  });

  it("stops at once on a request the server cannot read", async () => {
    const bodies = stub({ "/api/pay/confirm": [() => Response.json({ code: "BAD_REQUEST" }, { status: 400 })] });
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={() => {}} pollMs={5} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(bodies["/api/pay/orders"]).toBeUndefined();
  });

  it("takes paymentKey, orderId and amount out of the address bar once read, and still confirms with them", async () => {
    window.history.replaceState(null, "", `/pay/success?paymentType=NORMAL&orderId=${ORDER}&paymentKey=tgen_1&amount=2900`);
    const bodies = stub({ "/api/pay/confirm": [paid] });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    expect(window.location.pathname).toBe("/pay/success");
    expect(window.location.search).toBe("?paymentType=NORMAL");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    expect(bodies["/api/pay/confirm"]).toEqual([{ paymentKey: "tgen_1", orderId: ORDER, amount: 2900 }]);
  });

  it("without the payment's details (a reload after they were taken out) points to 내 정보 and asks nothing", async () => {
    const bodies = stub({});
    render(<PaySuccess paymentKey="" orderId="" amount="" navigate={() => {}} />);
    expect(await screen.findByText("결제 결과는 내 정보에서 볼 수 있어요")).toBeTruthy();
    expect(bodies["/api/pay/confirm"]).toBeUndefined();
    expect(screen.getByRole("link", { name: "내 정보로 가기" }).getAttribute("href")).toBe("/me");
  });

  it("asks every 5 seconds at first, then less often, well under the payment limit of 20 a minute", () => {
    const delays = pollSchedule(5_000);
    expect(delays.slice(0, 3)).toEqual([5_000, 7_500, 11_250]);
    expect(Math.max(...delays)).toBe(30_000);
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(15 * 60_000);
    let elapsed = 0;
    const times = delays.map((ms) => (elapsed += ms));
    for (const t of times) expect(times.filter((u) => u > t - 60_000 && u <= t).length).toBeLessThanOrEqual(12);
  });
});
