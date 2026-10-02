// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests, type AccountState } from "@/lib/account/client";
import { AccountPanel } from "./AccountPanel";

const account = {
  payments: true,
  login: true,
  owner: false,
  user: { nickname: "별빛", stardust: 10, stardustExpiresAt: "2026-12-30T14:59:59.999Z", unused: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot" }], opening: [] },
} satisfies AccountState;

let requests: Array<{ url: string; method: string; body: unknown }> = [];

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

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === "/api/pay/orders") {
      return Response.json({ orders: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot", amount: 2900, status: "paid", createdAt: Date.parse("2026-10-01T03:00:00Z"), receiptUrl: "https://dashboard.tosspayments.com/receipt/x", method: "카드", refundable: true, opened: false }] });
    }
    if (url === "/api/pay/refund") return Response.json({ ok: true, status: "refunded" });
    if (url === "/api/account/delete-intent") return Response.json({ url: "/api/auth/kakao/start?purpose=delete&intent=x" });
    return Response.json({ payments: true, login: true, owner: false, user: null });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

describe("AccountPanel", () => {
  it("shows the nickname, 별조각 with their last day, the unopened purchase and the receipt", async () => {
    render(<AccountPanel account={account} />);
    expect(screen.getByRole("heading", { name: "별빛" })).toBeTruthy();
    expect(screen.getByText("10개")).toBeTruthy();
    expect(screen.getByText(/12월 30일까지/)).toBeTruthy();
    expect(screen.getByText("타로 전체 풀이 · 열지 않음")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "영수증 보기" })).getAttribute("href")).toBe("https://dashboard.tosspayments.com/receipt/x");
    expect(screen.queryByText(/계정에 보관하기/)).toBeNull();
  });

  it("refunds an unopened purchase after a confirm", async () => {
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "전액 환불받기" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/pay/refund" && (r.body as { orderId: string }).orderId === "Ab3_dEf-Gh5iJk7Lm9No1Pq2")).toBe(true));
    expect(await screen.findByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
  });

  it("starts the deletion only through the Kakao re-check, and says what it does", async () => {
    const navigate = vi.fn();
    render(<AccountPanel account={account} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("열지 않은 결제 1건은 전액 환불돼요")).toBeTruthy();
    expect(screen.queryByText(/별자리/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "카카오로 확인하고 탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?purpose=delete&intent=x"));
  });
});
