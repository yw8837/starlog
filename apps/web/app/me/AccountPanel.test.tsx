// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests, type AccountState } from "@/lib/account/client";
import { clearChapters, listChapters, saveChapter } from "@/lib/storage/chapters";
import { AccountPanel } from "./AccountPanel";

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

const account = {
  payments: true,
  login: true,
  owner: false,
  user: { nickname: "별빛", gift: { status: "unused", until: "2026-12-30T14:59:59.999Z" }, unused: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot" }], opening: [] },
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
  clearChapters();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("AccountPanel", () => {
  it("opens each unopened premium purchase where its reading is written: the ten-card builder, the 궁합 form, the 신년운세 form (whatever the premium switch says)", () => {
    const unused = [
      { orderId: "o-deep", productId: "tarot-deep" },
      { orderId: "o-match", productId: "match" },
      { orderId: "o-year", productId: "newyear-2027" },
    ];
    render(<AccountPanel account={{ ...account, user: { ...account.user, unused } }} />);
    const purchases = document.getElementById("purchases")!;
    expect(within(purchases).getAllByRole("link", { name: "열기" }).map((a) => a.getAttribute("href"))).toEqual([
      "/tarot/new?new=1&spread=deep",
      "/premium/match/new",
      "/premium/newyear-2027/new",
    ]);
  });

  it("shows the nickname, the unused gift with its last day, the unopened purchase and the receipt", async () => {
    render(<AccountPanel account={account} />);
    expect(screen.getByRole("heading", { name: "별빛" })).toBeTruthy();
    const gift = document.getElementById("gift")!;
    expect(gift.textContent).toBe("가입 선물타로 전체 풀이 무료 · 12월 30일까지");
    expect(screen.getByText("타로 전체 풀이 · 열지 않음")).toBeTruthy();
    expect((await screen.findByRole("link", { name: "영수증 보기" })).getAttribute("href")).toBe("https://dashboard.tosspayments.com/receipt/x");
    expect(screen.queryByText(/계정에 보관하기/)).toBeNull();
  });

  it("in 결제 내역, labels a purchase used up before its reading was finished apart from one opened, and points to support (F2-b, L-1)", async () => {
    const row = { amount: 2900, status: "paid", createdAt: Date.parse("2026-10-01T03:00:00Z"), receiptUrl: null, method: "카드", refundable: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/pay/orders"
        ? Response.json({ orders: [{ ...row, orderId: "o1", productId: "tarot", opened: false, unfinished: true }, { ...row, orderId: "o2", productId: "saju", opened: true, unfinished: false }] })
        : Response.json({ payments: true, login: true, owner: false, user: null }),
    ));
    render(<AccountPanel account={account} />);
    expect(await screen.findByText("다 받기 전에 끊겨 쓴 것으로 처리됐어요. 문제가 있으면 문의해 주세요.")).toBeTruthy();
    expect(screen.getAllByText("열어 봤어요")).toHaveLength(1);
  });

  it("says a used gift was used, and shows nothing once it expired or was never given; never a count", () => {
    render(<AccountPanel account={{ ...account, user: { ...account.user, gift: { status: "used" } } }} />);
    expect(document.getElementById("gift")?.textContent).toBe("가입 선물사용했어요");
    cleanup();
    const { container } = render(<AccountPanel account={{ ...account, user: { ...account.user, gift: null } }} />);
    expect(document.getElementById("gift")).toBeNull();
    expect(container.textContent).not.toMatch(/가입 선물|\d+개/);
  });

  it("tells a member deleting the account that an unused gift goes with it", () => {
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("쓰지 않은 가입 선물은 사라져요")).toBeTruthy();
    cleanup();
    render(<AccountPanel account={{ ...account, user: { ...account.user, gift: { status: "used" } } }} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.queryByText("쓰지 않은 가입 선물은 사라져요")).toBeNull();
  });

  it("keeps 환불받기 under 결제한 풀이 (#purchases, where the result pages' 환불받기 lands), with or without purchases", () => {
    render(<AccountPanel account={account} />);
    const section = document.getElementById("purchases")!;
    expect(within(section).getByRole("heading", { name: "결제한 풀이" })).toBeTruthy();
    expect(within(section).getByRole("button", { name: "환불받기" })).toBeTruthy();
    cleanup();
    render(<AccountPanel account={{ ...account, user: { ...account.user, unused: [] } }} />);
    expect(within(document.getElementById("purchases")!).getByText("열지 않은 결제가 없어요")).toBeTruthy();
  });

  it("arriving at /me#purchases, brings 결제한 풀이 into view once the account is shown", () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    window.history.replaceState(null, "", "/me#purchases");
    render(<AccountPanel account={account} />);
    expect(scrolled.map((element) => element.id)).toEqual(["purchases"]);
  });

  it("refunds an unopened purchase after a confirm", async () => {
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "전액 환불받기" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/pay/refund" && (r.body as { orderId: string }).orderId === "Ab3_dEf-Gh5iJk7Lm9No1Pq2")).toBe(true));
    expect(await screen.findByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
  });

  it("sends one refund however often 전액 환불받기 is tapped while it runs", async () => {
    let answer: (response: Response) => void = () => {};
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/pay/refund") return base(url, init);
      requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Promise<Response>((resolve) => (answer = resolve));
    }));
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
    const confirm = await screen.findByRole("button", { name: "전액 환불받기" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    answer(Response.json({ ok: true, status: "refunded" }));
    expect(await screen.findByText("환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
    expect(requests.filter((r) => r.url === "/api/pay/refund")).toHaveLength(1);
  });

  it("says until when an unopened purchase can be refunded, and after that a plain line instead of 환불받기", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const until = { ...account, user: { ...account.user, unused: [{ orderId: "Ab3_dEf-Gh5iJk7Lm9No1Pq2", productId: "tarot", refundUntil: "2026-10-13T14:59:59.999Z" }] } };
    vi.setSystemTime(Date.parse("2026-10-13T23:59:59+09:00"));
    render(<AccountPanel account={until} />);
    expect(screen.getByText("10월 13일까지 환불할 수 있어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "환불받기" })).toBeTruthy();
    cleanup();
    vi.setSystemTime(Date.parse("2026-10-14T00:00:00+09:00"));
    render(<AccountPanel account={until} />);
    expect(screen.queryByRole("button", { name: "환불받기" })).toBeNull();
    expect(screen.getByText("환불 가능 기간(결제일로부터 7일)이 지났어요. 문제가 있으면 문의해 주세요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "열기" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("offers 열기 but no 환불받기 for a purchase whose reading the client left while it was being written, and never promises its refund on deletion", () => {
    const left = { ...account, user: { ...account.user, unused: [...account.user.unused, { orderId: "Zz9_yXw-Vu8tSr7Qp6On5Ml4", productId: "saju", refundable: false as const }] } };
    render(<AccountPanel account={left} />);
    const item = screen.getByText("사주 전체 풀이 · 열지 않음").closest("li")!;
    expect(within(item).getByRole("link", { name: "열기" })).toBeTruthy();
    expect(within(item).queryByRole("button", { name: "환불받기" })).toBeNull();
    expect(within(item).getByText("풀이를 받던 중에 나가서 환불은 할 수 없어요. 열기로 다시 받을 수 있어요.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "환불받기" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("열지 않은 결제 1건은 전액 환불돼요")).toBeTruthy();
    expect(screen.getByText("환불할 수 없는 결제 1건은 사라져요")).toBeTruthy();
  });

  it("says what went wrong with a refund in refund words, never payment ones", async () => {
    for (const [body, status, line] of [
      [{ code: "PAY_PENDING" }, 409, "환불을 처리하고 있어요. 결제 내역에서 확인할 수 있어요."],
      [{ code: "PAY_FAILED", message: "환불하지 못했어요. 문의해 주세요." }, 402, "환불하지 못했어요. 문의해 주세요."],
      [{ code: "PAY_FAILED", message: "취소 가능 기간이 지났어요." }, 402, "환불하지 못했어요. 취소 가능 기간이 지났어요."],
      [{ code: "REFUND_WINDOW_CLOSED", message: "환불 가능 기간(결제일로부터 7일)이 지났어요. 문제가 있으면 문의해 주세요." }, 409, "환불 가능 기간(결제일로부터 7일)이 지났어요. 문제가 있으면 문의해 주세요."],
    ] as const) {
      const base = vi.mocked(fetch).getMockImplementation()!;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url === "/api/pay/refund" ? Response.json(body, { status }) : base(url, init))));
      render(<AccountPanel account={account} />);
      fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
      fireEvent.click(await screen.findByRole("button", { name: "전액 환불받기" }));
      expect(await screen.findByText(line)).toBeTruthy();
      expect(screen.queryByText(/결제를 확인하고 있어요|결제를 마치지 못했어요/)).toBeNull();
      cleanup();
    }
  });

  it("asks before deleting the account's copies of readings, and says what goes", async () => {
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "계정에 보관한 풀이 모두 지우기" }));
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    const sheet = (await screen.findByText("계정에 보관한 풀이를 모두 지울까요?")).closest("dialog")!;
    expect(within(sheet).getByText(/다른 기기에서는 볼 수 없어요/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "취소" }));
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "계정에 보관한 풀이 모두 지우기" }));
    fireEvent.click(await screen.findByRole("button", { name: "모두 지우기" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/readings?all=1" && r.method === "DELETE")).toBe(true));
    expect(await screen.findByText("계정에 보관한 풀이를 지웠어요. 이 기기의 기록은 그대로예요.")).toBeTruthy();
  });

  it("logs out and takes the account's readings off this device; readings opened here stay", async () => {
    saveChapter({ kind: "tarot", question: "기기 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t" });
    saveChapter({ kind: "tarot", question: "계정 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    sessionStorage.setItem("starlog.account-synced", "1");
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByText("로그아웃했어요. 이 기기에 받아 둔 계정 풀이는 지웠어요.")).toBeTruthy();
    expect(requests.some((r) => r.url === "/api/auth/logout" && r.method === "POST")).toBe(true);
    expect(listChapters().map((chapter) => (chapter.kind === "tarot" ? chapter.question : chapter.kind === "saju" ? chapter.title : chapter.kind))).toEqual(["기기 질문"]);
    expect(sessionStorage.getItem("starlog.account-synced")).toBeNull();
  });

  it("when the logout does not go through, keeps everything and says so", async () => {
    saveChapter({ kind: "tarot", question: "계정 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    render(<AccountPanel account={account} />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByText("로그아웃하지 못했어요. 다시 시도해 주세요.")).toBeTruthy();
    expect(listChapters()).toHaveLength(1);
  });

  it("for the review account: says how it logged in, and deletes without a Kakao re-check", async () => {
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url === "/api/account/delete-intent" ? Response.json({ url: "/me?account=deleted" }) : base(url, init))));
    const navigate = vi.fn();
    render(<AccountPanel account={{ ...account, user: { ...account.user, nickname: "심사용 계정", review: true } }} navigate={navigate} />);
    expect(screen.getByText("심사용 계정으로 로그인했어요")).toBeTruthy();
    expect(screen.queryByText("카카오로 로그인했어요")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.queryByRole("button", { name: "카카오로 확인하고 탈퇴하기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/me?account=deleted"));
  });

  it("for a Google account: says how it logged in, and deletes through the Google re-check", async () => {
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url === "/api/account/delete-intent" ? Response.json({ url: "/api/auth/google/start?purpose=delete&intent=x" }) : base(url, init))));
    const navigate = vi.fn();
    render(<AccountPanel account={{ ...account, user: { ...account.user, nickname: "별손님", google: true } }} navigate={navigate} />);
    expect(screen.getByText("Google로 로그인했어요")).toBeTruthy();
    expect(screen.queryByText("카카오로 로그인했어요")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.queryByRole("button", { name: "카카오로 확인하고 탈퇴하기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Google로 확인하고 탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/api/auth/google/start?purpose=delete&intent=x"));
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
