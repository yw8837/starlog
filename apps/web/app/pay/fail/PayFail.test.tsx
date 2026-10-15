// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PayFail } from "./PayFail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PayFail", () => {
  it("after a refused card: Toss's reason, nothing charged, another card or 간편결제 to try, and the way back (F3)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ orderId: "o1", productId: "tarot", status: "created", returnTo: "/tarot/result", signedIn: true })));
    render(<PayFail code="REJECT_CARD_COMPANY" message="카드사에서 결제를 거절했어요." orderId="o1" />);
    expect(screen.getByText("결제를 마치지 못했어요")).toBeTruthy();
    expect(screen.getByText("카드사에서 결제를 거절했어요.")).toBeTruthy();
    expect(screen.getByText("청구된 금액은 없어요. 다른 카드나 간편결제로 다시 해 보세요.")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "풀이로 돌아가기" })).toBeTruthy();
    await vi.waitFor(() => expect(screen.getByRole("link", { name: "풀이로 돌아가기" }).getAttribute("href")).toBe("/tarot/result"));
  });

  it("after the buyer closed the window: says so, and suggests nothing else", () => {
    render(<PayFail code="PAY_PROCESS_CANCELED" message="사용자에 의해 결제가 취소되었습니다." orderId={null} />);
    expect(screen.getByText("결제를 취소했어요")).toBeTruthy();
    expect(screen.getByText("청구된 금액은 없어요.")).toBeTruthy();
    expect(screen.queryByText(/다른 카드나 간편결제/)).toBeNull();
  });

  it("has one h1 for the page (F-14)", () => {
    render(<PayFail code="PAY_PROCESS_CANCELED" message="" orderId={null} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["결제 결과"]);
  });
});
