// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnlockSheet } from "./UnlockSheet";

afterEach(cleanup);

/** The 오픈 기념 무료 caption: one tarot reading per device until 10월 31일, read and kept on this device only. */
const OPENING = "10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 이 기기에서 보고 보관할 수 있어요(이어서 물어보기 제외).";

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

  it("tarot guest: log in to pay, with no signup gift promised (removed, owner 2026-10-14 evening)", () => {
    const { container } = render(<UnlockSheet {...base} offer={{ mode: "login", priceKrw: 2900 }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).getAttribute("href")).toBe(base.loginHref);
    expect(screen.getByText("로그인하면 바로 결제하고 열 수 있어요")).toBeTruthy();
    expect(container.textContent).not.toMatch(/선물|무료로 드려요/);
  });

  it("saju guest: log in to pay, with no gift line", () => {
    const { container } = render(<UnlockSheet {...base} kind="saju" offer={{ mode: "login", priceKrw: 4900 }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    expect(screen.getByText("로그인하면 바로 결제하고 열 수 있어요")).toBeTruthy();
    expect(container.textContent).not.toMatch(/선물|무료로 드려요/);
  });

  it("a signup gift held from before its removal: using it first, paying second, with its last day", () => {
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

  it("a purchase given back after its reading was cut off while written: says it opens again but is not refundable, and offers no 환불받기 (F1)", () => {
    const left = { mode: "open-paid", orderId: "o1", refundable: false } as const;
    const { container } = render(
      <UnlockSheet {...base} offer={left} onUnlock={() => {}} refundHref="/me#purchases"
        error={{ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요.", action: "retry" }} />,
    );
    expect(screen.queryByRole("link", { name: "환불받기" })).toBeNull();
    expect(screen.getByText("풀이를 받던 중에 끊긴 결제라 환불은 할 수 없어요. 다시 열어 끝까지 받을 수 있어요")).toBeTruthy();
    expect(container.textContent).not.toContain("환불할 수 있어요");
    cleanup();
    render(<UnlockSheet {...base} offer={left} onUnlock={() => {}} />);
    expect(screen.getByText("풀이를 받던 중에 끊긴 결제라 환불은 할 수 없어요. 다시 열어 끝까지 받을 수 있어요")).toBeTruthy();
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

  it("while sales are paused, shows buyers a quiet login link next to 오픈 기념 무료, and on the closed saju sheet", () => {
    render(<UnlockSheet {...base} remaining={1} offer={{ mode: "opening", login: true }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "결제한 풀이가 있다면 로그인" }).getAttribute("href")).toBe(base.loginHref);
    cleanup();
    render(<UnlockSheet {...base} kind="saju" offer={{ mode: "closed", login: true }} onUnlock={() => {}} />);
    expect(screen.getByRole("link", { name: "결제한 풀이가 있다면 로그인" }).getAttribute("href")).toBe(base.loginHref);
  });

  it("without an offer it is 오픈 기념 무료: one button that names it, a caption with the rule (until 10월 31일, read and keep only), no follow-ups promised, no 베타 anywhere", () => {
    const onUnlock = vi.fn();
    const { container } = render(<UnlockSheet kind="tarot" remaining={1} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    expect(onUnlock).toHaveBeenCalledWith("opening");
    expect(screen.getByText(OPENING)).toBeTruthy();
    expect(screen.queryByText("이어서 물어보기 3번")).toBeNull();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    expect(container.textContent).not.toMatch(/베타|첫 이용|하루|0시/);
  });

  it("once the free first reading is used, says so for good and offers the free cards to go on with (QA-04)", () => {
    const { container } = render(<UnlockSheet kind="tarot" remaining={0} onUnlock={() => {}} />);
    expect(screen.getByText("이 기기에서는 오픈 기념 무료 풀이를 이미 열었어요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "전체 풀이 보기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "지금의 한 장 · 무제한 무료" }).getAttribute("href")).toBe("/now");
    expect(screen.getByRole("link", { name: "오늘의 한 장" }).getAttribute("href")).toBe("/today");
    expect(container.textContent).not.toMatch(/0시|다시 채워져요/);
  });

  it("puts 오픈 기념 무료 first while sales are open and this device has not used it; logging in, a gift held and paying follow as their sheets show them (owner 2026-10-14)", () => {
    const FIRST = "전체 풀이 보기 · 오픈 기념 무료";
    const actions = (c: HTMLElement) => [...c.querySelectorAll("a, button")].map((el) => [el.textContent, /secondary/.test(el.className) ? "secondary" : /primary/.test(el.className) ? "primary" : "?"]);
    const onUnlock = vi.fn();
    let { container } = render(<UnlockSheet {...base} remaining={1} offer={{ mode: "login", priceKrw: 2900, first: true }} onUnlock={onUnlock} />);
    expect(actions(container)).toEqual([[FIRST, "primary"], ["로그인하고 전체 풀이 보기", "secondary"]]);
    expect(screen.getByRole("link", { name: "로그인하고 전체 풀이 보기" }).getAttribute("href")).toBe(base.loginHref);
    expect(screen.getByText(OPENING)).toBeTruthy();
    expect(container.textContent).not.toMatch(/가입 선물|무료로 드려요/);
    // F-07: above the free button, only what the free opening holds: no price, no follow-ups.
    expect(screen.queryByText("전체 풀이 · 2,900원")).toBeNull();
    expect(screen.queryByText("이어서 물어보기 3번")).toBeNull();
    expect(screen.getByText("풀이 전체 · 약 2,000자")).toBeTruthy();
    expect(screen.getByText("이 기기에 계속 보관")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    expect(onUnlock).toHaveBeenCalledWith("opening");
    cleanup();
    ({ container } = render(<UnlockSheet {...base} remaining={1} offer={{ mode: "gift", until: "2026-12-30T14:59:59.999Z", priceKrw: 2900, first: true }} onUnlock={onUnlock} />));
    expect(actions(container)).toEqual([[FIRST, "primary"], ["가입 선물로 무료로 보기", "secondary"], ["2,900원 결제하고 보기", "secondary"]]);
    fireEvent.click(screen.getByRole("button", { name: "가입 선물로 무료로 보기" }));
    expect(onUnlock).toHaveBeenLastCalledWith("free");
    expect(screen.getByText("가입 선물은 12월 30일까지 쓸 수 있어요")).toBeTruthy();
    cleanup();
    ({ container } = render(<UnlockSheet {...base} remaining={1} offer={{ mode: "pay", priceKrw: 2900, first: true }} onUnlock={onUnlock} />));
    expect(actions(container)).toEqual([[FIRST, "primary"], ["2,900원 결제하고 보기", "secondary"]]);
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" }).getAttribute("href")).toBe(base.payHref);
    expect(screen.queryByText("전체 풀이 · 2,900원")).toBeNull();
    expect(screen.queryByText("이어서 물어보기 3번")).toBeNull();
    expect(container.textContent).not.toContain("이미 열었어요");
  });

  it("with 오픈 기념 무료 first: its caption gives the rule, and crisis words or a redraw add no way to pay (review 2026-10-14)", () => {
    const welcome = { mode: "pay", priceKrw: 2900, first: true } as const;
    render(<UnlockSheet {...base} remaining={1} offer={welcome} onUnlock={() => {}} />);
    expect(screen.getByText(OPENING)).toBeTruthy();
    expect(screen.queryByText("결제하면 바로 열려요")).toBeNull();
    cleanup();
    render(<UnlockSheet {...base} remaining={1} offer={welcome} onUnlock={() => {}} error={{ title: "x", action: null, care: true }} />);
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
    cleanup();
    render(<UnlockSheet {...base} remaining={1} offer={{ mode: "login", priceKrw: 2900, first: true }} onUnlock={() => {}} error={{ title: "x", action: "redraw" }} redrawHref="/tarot/draw" />);
    expect(screen.getByRole("link", { name: "카드 다시 뽑기" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "로그인하고 전체 풀이 보기" })).toBeNull();
  });

  it("once 오픈 기념 무료 is used, the sheet with sales open is as before: its own choice is the gold one", () => {
    const actions = (c: HTMLElement) => [...c.querySelectorAll("a, button")].map((el) => [el.textContent, /secondary/.test(el.className) ? "secondary" : "primary"]);
    const { container } = render(<UnlockSheet {...base} remaining={0} offer={{ mode: "gift", until: null, priceKrw: 2900 }} onUnlock={() => {}} />);
    expect(actions(container)).toEqual([["가입 선물로 무료로 보기", "primary"], ["2,900원 결제하고 보기", "secondary"]]);
    expect(container.textContent).not.toMatch(/오픈 기념 무료/);
  });

  it("offers them only when the free first reading is used", () => {
    render(<UnlockSheet kind="tarot" remaining={1} onUnlock={() => {}} />);
    expect(screen.queryByRole("link", { name: /지금의 한 장|오늘의 한 장/ })).toBeNull();
  });

  it("saju while sales are closed here: no free reading offered or promised, only that it opens with a payment", () => {
    const onUnlock = vi.fn();
    const { container } = render(<UnlockSheet kind="saju" offer={{ mode: "closed", login: false }} onUnlock={onUnlock} />);
    expect(screen.getByText("전체 풀이는 결제하고 열 수 있어요")).toBeTruthy();
    expect(screen.getByText("지금은 결제를 받지 않고 있어요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "전체 풀이 보기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/첫 이용|처음 한 번|무료로 열|오픈 기념/);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("lets the owner open with the pass where nothing else opens: a closed saju sheet, a used free first reading", () => {
    const onUnlock = vi.fn();
    render(<UnlockSheet kind="saju" owner offer={{ mode: "closed", login: false }} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    cleanup();
    render(<UnlockSheet kind="tarot" owner remaining={0} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    cleanup();
    render(<UnlockSheet kind="tarot" owner remaining={1} onUnlock={onUnlock} />);
    expect(screen.queryByRole("button", { name: "운영자로 무료 열기" })).toBeNull();
    expect(onUnlock.mock.calls).toEqual([["owner"], ["owner"]]);
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
