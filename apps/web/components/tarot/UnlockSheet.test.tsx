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

  it("shows the saju length as the owner's range (2026-10-08)", () => {
    render(<UnlockSheet {...base} kind="saju" offer={{ mode: "pay", priceKrw: 4900 }} onUnlock={() => {}} />);
    expect(screen.getByText("풀이 전체 · 약 2,500~3,000자")).toBeTruthy();
  });

  it("tarot guest: log in first, with the free first tarot reading named", () => {
    render(<UnlockSheet {...base} offer={{ mode: "login", priceKrw: 2900, gift: true }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).getAttribute("href")).toBe(base.loginHref);
    expect(screen.getByText("처음 가입하면 타로 전체 풀이 1번을 무료로 드려요")).toBeTruthy();
  });

  it("saju guest: log in to pay, with no gift line", () => {
    const { container } = render(<UnlockSheet {...base} kind="saju" offer={{ mode: "login", priceKrw: 4900, gift: false }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    expect(screen.getByText("로그인하면 바로 결제하고 열 수 있어요")).toBeTruthy();
    expect(container.textContent).not.toMatch(/선물|무료로 드려요/);
  });

  it("the signup gift first, paying second, with its last day", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} offer={{ mode: "gift", until: "2026-12-30T14:59:59.999Z", priceKrw: 2900 }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "가입 선물로 무료로 보기" }));
    expect(onUnlock).toHaveBeenCalledWith("free");
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" }).getAttribute("href")).toBe(base.payHref);
    expect(screen.getByText("가입 선물은 12월 30일까지 쓸 수 있어요")).toBeTruthy();
  });

  it("opens a purchase, and lets the owner open free on the side", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet {...base} owner offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "결제한 풀이 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    expect(onUnlock.mock.calls).toEqual([["paid"], ["owner"]]);
    expect(screen.getByText("결제한 풀이는 열기 전이면 결제일로부터 7일 안에 환불할 수 있어요")).toBeTruthy();
  });

  it("offers the refund next to the retry after a failed paid reading", () => {
    render(
      <UnlockSheet {...base} offer={{ mode: "open-paid", orderId: "o1" }} onUnlock={() => {}} refundHref="/me#purchases"
        error={{ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요.", action: "retry" }} />,
    );
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
  });

  it("while a cut-off opening is being checked, offers nothing to press, whatever the offer says", () => {
    const checking = { title: "풀이가 열렸는지 확인하고 있어요", body: "잠시만 기다려 주세요.", action: null };
    for (const offer of [{ mode: "open-paid", orderId: "o1" }, { mode: "gift", until: null, priceKrw: 2900 }, { mode: "pay", priceKrw: 2900 }] as const) {
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

  it("once today's free reading is used, offers the free cards to go on with instead of only a grey button (QA-04)", () => {
    for (const kind of ["tarot", "saju"] as const) {
      render(<UnlockSheet kind={kind} remaining={0} onUnlock={() => {}} />);
      expect(screen.getByText("오늘 무료로 열 수 있는 풀이를 모두 열었어요 · 한국 시간 0시에 다시 채워져요")).toBeTruthy();
      expect((screen.getByRole("button", { name: "전체 풀이 보기" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByRole("link", { name: "지금의 한 장 · 무제한 무료" }).getAttribute("href")).toBe("/now");
      expect(screen.getByRole("link", { name: "오늘의 한 장" }).getAttribute("href")).toBe("/today");
      cleanup();
    }
  });

  it("offers them only when the day is used up", () => {
    render(<UnlockSheet kind="tarot" remaining={1} onUnlock={() => {}} />);
    expect(screen.queryByRole("link", { name: /지금의 한 장|오늘의 한 장/ })).toBeNull();
  });

  it("names the 운 and says what one payment opens (주제별 사주)", () => {
    render(<UnlockSheet {...base} kind="saju" offer={{ mode: "pay", priceKrw: 2900 }} topicLabel="재물운" scopeLine="결제 한 번에 고른 풀이 하나를 열어요" onUnlock={() => {}} />);
    expect(screen.getByRole("heading", { name: "재물운 전체 풀이에 담긴 것" })).toBeTruthy();
    expect(screen.getByText("재물운 전체 풀이 · 2,900원")).toBeTruthy();
    expect(screen.getByText("결제 한 번에 고른 풀이 하나를 열어요")).toBeTruthy();
  });

  it("keeps today's sheet without a 운", () => {
    render(<UnlockSheet {...base} kind="saju" offer={{ mode: "pay", priceKrw: 2900 }} onUnlock={() => {}} />);
    expect(screen.getByRole("heading", { name: "전체 풀이에 담긴 것" })).toBeTruthy();
    expect(screen.getByText("전체 풀이 · 2,900원")).toBeTruthy();
    expect(screen.queryByText("결제 한 번에 고른 풀이 하나를 열어요")).toBeNull();
  });
});
