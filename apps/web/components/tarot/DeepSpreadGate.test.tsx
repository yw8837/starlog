// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import type { FlowState } from "@/lib/flowState";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { useFlowSpread } from "./DeepSpreadGate";

/** A tarot flow page standing on 켈틱 크로스 10장: what it decides, and what the flow keeps. */
function Page() {
  const [flow, setFlowState] = useState<FlowState>({ conditions: {}, note: "", spread: "deep" });
  const setFlow = useCallback((next: (prev: FlowState) => FlowState) => setFlowState((prev) => next(prev)), []);
  const { spread, gate } = useFlowSpread(flow, setFlow);
  return (
    <>
      {gate}
      <p data-testid="spread">{String(spread)}</p>
      <p data-testid="kept">{flow.spread ?? "dropped"}</p>
    </>
  );
}

const visible = () => Response.json({ products: [{ id: "tarot-deep", open: true, visible: true, opensAt: null }] });
function stub(status: Array<() => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/premium/status") return (status.shift() ?? (() => Promise.reject(new TypeError("offline"))))();
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: null });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const offline = () => Promise.reject(new TypeError("offline"));
const statusCalls = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([url]) => url === "/api/premium/status").length;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
});

describe("the 켈틱 크로스 10장 gate when the premium status cannot be read (review 2026-10-16 #4)", () => {
  it("asks once more and keeps the ten cards when the second answer says visible", async () => {
    const fetchMock = stub([offline, visible]);
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("spread").textContent).toBe("deep"));
    expect(statusCalls(fetchMock)).toBe(2);
    expect(screen.getByTestId("kept").textContent).toBe("deep");
  });

  it("never drops the chosen spread on a status it could not read: it says so and offers to ask again", async () => {
    const fetchMock = stub([offline, offline, visible]);
    render(<Page />);
    expect(await screen.findByText("켈틱 크로스 10장을 지금 볼 수 있는지 확인하지 못했어요")).toBeTruthy();
    expect(statusCalls(fetchMock)).toBe(2);
    expect(screen.getByTestId("kept").textContent).toBe("deep");
    expect(screen.getByTestId("spread").textContent).toBe("undefined");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    await waitFor(() => expect(screen.getByTestId("spread").textContent).toBe("deep"));
    expect(screen.queryByText("켈틱 크로스 10장을 지금 볼 수 있는지 확인하지 못했어요")).toBeNull();
  });

  it("still drops it when the status says premium is off here (no purchase)", async () => {
    stub([() => Response.json({ products: [{ id: "tarot-deep", open: false, visible: false, opensAt: null }] })]);
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("kept").textContent).toBe("dropped"));
  });
});
