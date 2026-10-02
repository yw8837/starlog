// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnlockSheet } from "./UnlockSheet";

afterEach(cleanup);

const base = { kind: "tarot" as const, remaining: undefined, loginHref: "/login?next=%2Ftarot%2Fresult", payHref: "/pay/checkout?product=tarot&returnTo=%2Ftarot%2Fresult" };

describe("UnlockSheet offers", () => {
  it("keeps the owner's scope lines in every mode", () => {
    render(<UnlockSheet {...base} offer={{ mode: "pay", priceKrw: 2900 }} onUnlock={() => {}} />);
    expect(screen.getByText("풀이 전체 · 약 2,000자")).toBeTruthy();
    expect(screen.getByText("이어서 물어보기 3번")).toBeTruthy();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    expect(screen.getByText("전체 풀이 · 2,900원")).toBeTruthy();
  });

  it("guest: log in first, with the gift explained", () => {
    render(<UnlockSheet {...base} offer={{ mode: "login", priceKrw: 2900, giftUnits: 10 }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).getAttribute("href")).toBe(base.loginHref);
    expect(screen.getByText("처음 가입하면 별조각 10개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요")).toBeTruthy();
  });

  it("별조각 first, paying second", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} offer={{ mode: "stardust", units: 10, balance: 10, priceKrw: 2900 }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "별조각 10개로 보기" }));
    expect(onUnlock).toHaveBeenCalledWith("free");
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" }).getAttribute("href")).toBe(base.payHref);
  });

  it("opens a purchase, and lets the owner open free on the side", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} owner offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "결제한 풀이 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    expect(onUnlock.mock.calls).toEqual([["paid"], ["owner"]]);
  });

  it("offers the refund next to the retry after a failed paid reading", () => {
    render(
      <UnlockSheet {...base} offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={() => {}} refundHref="/me#orders"
        error={{ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요.", action: "retry" }} />,
    );
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#orders");
  });

  it("while a cut-off opening is being checked, offers nothing to press, whatever the offer says", () => {
    const checking = { title: "풀이가 열렸는지 확인하고 있어요", body: "잠시만 기다려 주세요.", action: null };
    for (const offer of [{ mode: "open-paid", orderId: "o1" }, { mode: "stardust", units: 10, balance: 10, priceKrw: 2900 }, { mode: "pay", priceKrw: 2900 }] as const) {
      render(<UnlockSheet {...base} owner offer={offer} onUnlock={() => {}} error={checking} checking />);
      expect(screen.getByText("풀이가 열렸는지 확인하고 있어요")).toBeTruthy();
      expect(screen.queryAllByRole("button")).toEqual([]);
      expect(screen.queryAllByRole("link")).toEqual([]);
      cleanup();
    }
  });

  it("once the check has run out, the only thing to press is checking again", () => {
    const onCheck = vi.fn();
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} owner offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={onUnlock} checking onCheck={onCheck}
      error={{ title: "풀이가 열렸는지 아직 확인하지 못했어요", action: null }} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["다시 확인하기"]);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("while this kind of reading is being opened, says so instead of offering to buy or open", () => {
    const onCheck = vi.fn();
    render(<UnlockSheet {...base} owner offer={{ mode: "in-progress", currency: "paid" }} onUnlock={() => {}} onCheck={onCheck} />);
    expect(screen.getByText("열고 있는 풀이가 있어요")).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["다시 확인하기"]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("while sales are paused, shows buyers a quiet login link next to the 오픈 기념 reading", () => {
    render(<UnlockSheet {...base} remaining={1} offer={{ mode: "opening", login: true }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "결제한 풀이가 있다면 로그인" }).getAttribute("href")).toBe(base.loginHref);
  });

  it("without an offer it is today's 오픈 기념 sheet, unchanged, with no 베타 anywhere", () => {
    const onUnlock = vi.fn();
    const { container } = render(<UnlockSheet kind="tarot" remaining={1} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: /전체 풀이 보기/ }));
    expect(onUnlock).toHaveBeenCalledWith("opening");
    expect(screen.getByText(/^오픈 기념으로 하루 .+ 무료예요$/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/베타/);
  });
});
