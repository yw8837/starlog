// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("once the buyer has left the page, an answer that lands later neither opens the reading nor asks for a login (review M1)", async () => {
    // The buyer leaves (e.g. 내 정보로 가기) while the confirm is still on its way; it then comes back paid.
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      url.startsWith("/api/pay/confirm") ? new Promise<Response>((resolve) => (answer = resolve)) : Promise.resolve(Response.json({ payments: true, login: true, owner: false, user: null })),
    ));
    const navigate = vi.fn();
    const { unmount } = render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/pay/confirm", expect.anything()));
    unmount();
    answer(paid());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("has one h1 for the page, whatever it shows (F-14)", async () => {
    stub({ "/api/pay/confirm": [() => Response.json({ code: "PAY_PENDING" }, { status: 409 })], "/api/pay/orders": [order("confirming")] });
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={() => {}} pollMs={60_000} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["결제 확인"]);
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
    // Kakao or Google: the account that paid.
    expect(screen.getByText("이 브라우저에서는 로그인되어 있지 않아요. 결제한 계정으로 로그인하면 바로 열려요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하고 풀이 열기" }).getAttribute("href")).toBe("/login?next=%2Ftarot%2Fresult%3Funlock%3Dpaid");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says why a payment was not completed, and leads back to the reading first, 내 정보 second (F3)", async () => {
    const bodies = stub({
      "/api/pay/confirm": [() => Response.json({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." }, { status: 402 })],
      "/api/pay/orders": [order("failed")],
    });
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={() => {}} />);
    expect(await screen.findByText("결제를 마치지 못했어요")).toBeTruthy();
    expect(screen.getByText("한도초과 혹은 잔액부족으로 결제에 실패했습니다.")).toBeTruthy();
    const back = await screen.findByRole("link", { name: "풀이로 돌아가기" });
    expect(back.getAttribute("href")).toBe("/tarot/result");
    expect(screen.getByRole("link", { name: "내 정보로 가기" }).getAttribute("href")).toBe("/me");
    expect(back.compareDocumentPosition(screen.getByRole("link", { name: "내 정보로 가기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bodies["/api/pay/orders"]).toHaveLength(1);
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

  it("confirms a still-created order again at every check while Toss holds the approval, so a server that comes back still confirms it (F-01)", async () => {
    const bodies = stub({
      "/api/pay/confirm": [() => { throw new TypeError("offline"); }, () => Response.json({ code: "PAY_PENDING" }, { status: 409 })],
      "/api/pay/orders": [order("created"), order("created"), order("paid")],
    });
    const navigate = vi.fn();
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={5} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
    const sent = { paymentKey: "tgen_1", orderId: ORDER, amount: 2900 };
    expect(bodies["/api/pay/confirm"]).toEqual([sent, sent, sent]);
  });

  it("when the confirm keeps failing: soon says the payment is safe, with 다시 확인하기 and 내 정보, and opens the reading once a check gets through (F-01)", async () => {
    let down = true;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const key = url.split("?")[0]!;
      calls.push(key);
      if (key === "/api/pay/confirm") return down ? new Response("<html>bad gateway</html>", { status: 502 }) : paid();
      if (key === "/api/pay/orders") return order("created")();
      return Response.json({ payments: true, login: true, owner: false, user: null });
    }));
    const navigate = vi.fn();
    // The first automatic check is a minute away: only 다시 확인하기 can bring it sooner.
    render(<PaySuccess paymentKey="tgen_1" orderId={ORDER} amount="2900" navigate={navigate} pollMs={60_000} slowMs={10} />);
    expect(await screen.findByText("확인이 조금 늦어지고 있어요. 결제는 안전해요. 확인되면 바로 풀이로 넘어가고, 확인되지 않은 결제는 청구되지 않아요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "내 정보로 가기" }).getAttribute("href")).toBe("/me");
    expect(navigate).not.toHaveBeenCalled();
    down = false;
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
      expect(calls).toContain("/api/pay/orders");
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?unlock=paid"));
  });

  it("checks again by itself about every 15 seconds once the first checks are done", () => {
    const delays = pollSchedule(5_000);
    expect(delays.slice(0, 4)).toEqual([5_000, 7_500, 11_250, 15_000]);
    expect(Math.max(...delays)).toBe(15_000);
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
    expect(Math.max(...delays)).toBe(15_000);
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(15 * 60_000);
    let elapsed = 0;
    const times = delays.map((ms) => (elapsed += ms));
    // Each check may confirm once more too: at most 2 requests a check, still under 20 a minute.
    for (const t of times) expect(2 * times.filter((u) => u > t - 60_000 && u <= t).length).toBeLessThanOrEqual(12);
  });
});
