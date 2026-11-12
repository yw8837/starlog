// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAccount, resetAccountForTests, type AccountState, type AccountUser } from "@/lib/account/client";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { AccountPanel } from "./AccountPanel";

/** 내 정보 for purchases made in the Starlog app with Google Play (W2.3), and Google's deletion re-check inside the app (W2.4). */

const APP_UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const UNTIL = "2026-11-18T14:59:59.999Z";

const account = (unused: AccountUser["unused"], google = false) =>
  ({
    payments: true,
    login: true,
    owner: false,
    user: { nickname: "별빛", gift: null, unused, opening: [], ...(google ? { google: true as const } : {}) },
  }) satisfies AccountState;

let requests: Array<{ url: string; body: unknown }> = [];
let answers: Record<string, () => Response> = {};

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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-11T03:00:00Z"));
  requests = [];
  answers = {};
  resetBridgeForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (answers[url]) return answers[url]();
      if (url === "/api/pay/orders") {
        return Response.json({
          orders: [
            { orderId: "o-toss", productId: "tarot", amount: 2900, status: "paid", createdAt: Date.parse("2026-11-10T03:00:00Z"), receiptUrl: "https://dashboard.tosspayments.com/receipt/x", method: "카드", refundable: true, opened: false, provider: "toss" },
            { orderId: "o-play", productId: "saju", amount: 2900, status: "paid", createdAt: Date.parse("2026-11-10T04:00:00Z"), receiptUrl: null, method: "Google Play", refundable: true, opened: false, provider: "play" },
          ],
        });
      }
      return Response.json({ payments: true, login: true, owner: false, user: null });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetAccountForTests();
  resetBridgeForTests();
});

describe("AccountPanel: a purchase paid with Google Play", () => {
  const BOTH = [
    { orderId: "o-toss", productId: "tarot", refundUntil: UNTIL, refundAmount: 2900 },
    { orderId: "o-play", productId: "saju", refundUntil: UNTIL, refundAmount: 2900, provider: "play" as const },
  ];
  const refundOf = (name: string) => {
    const item = within(document.getElementById("purchases")!).getAllByRole("listitem").find((li) => li.textContent?.includes(name))!;
    fireEvent.click(within(item).getByRole("button", { name: "환불받기" }));
    fireEvent.click(screen.getByRole("button", { name: "전액 환불받기" }));
  };

  it("keeps /api/me's provider play (the after-refund line needs it), and nothing else", () => {
    const parsed = parseAccount({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, opening: [], unused: [{ orderId: "a", productId: "tarot", provider: "play" }, { orderId: "b", productId: "saju", provider: "toss" }] } });
    expect(parsed?.user?.unused).toEqual([{ orderId: "a", productId: "tarot", provider: "play" }, { orderId: "b", productId: "saju" }]);
  });

  it("refunds it with the same 환불받기 as a web purchase, and says it goes back through Google Play", async () => {
    answers["/api/pay/refund"] = () => Response.json({ ok: true, status: "refunded", amount: 2900 });
    render(<AccountPanel account={account(BOTH)} />);
    expect(within(document.getElementById("purchases")!).getAllByRole("button", { name: "환불받기" })).toHaveLength(2);
    refundOf("사주");
    expect(await screen.findByText("2,900원을 환불했어요. Google Play를 통해 환불돼요. 결제 수단에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
    expect(requests.find((r) => r.url === "/api/pay/refund")!.body).toEqual({ orderId: "o-play", amount: 2900 });
  });

  it("a Play set with one reading opened: no 환불받기, the 문의 line with the site's contact page (review L21)", () => {
    const parsed = parseAccount({
      payments: true, login: true, owner: false,
      user: { nickname: "별", gift: null, opening: [], unused: [{ orderId: "o-set", productId: "newyear-2027", refundable: false, noRefund: "play-part", set: true, provider: "play" }] },
    });
    expect(parsed?.user?.unused).toEqual([{ orderId: "o-set", productId: "newyear-2027", refundable: false, noRefund: "play-part", set: true, provider: "play" }]);
    render(<AccountPanel account={account(parsed!.user!.unused)} />);
    const item = within(document.getElementById("purchases")!).getByRole("listitem");
    expect(within(item).queryByRole("button", { name: "환불받기" })).toBeNull();
    expect(item.textContent).toContain("앱에서 결제한 세트는 하나를 열면 남은 풀이를 문의로 환불해 드려요.");
    expect(item.textContent).not.toMatch(/몫만 환불돼요|둘 다 열지 않았으면/);
    expect(within(item).getByRole("link", { name: "문의하기" }).getAttribute("href")).toBe("/contact");
  });

  it("a Play set with neither reading opened: whole through the one 환불받기, and its part through 문의 once one is opened (owner 2026-11-13)", () => {
    const set = [
      { orderId: "o-set", productId: "newyear-2027", refundUntil: UNTIL, refundAmount: 18900, set: true as const, provider: "play" as const },
      { orderId: "o-set", productId: "match", refundUntil: UNTIL, refundAmount: 18900, set: true as const, provider: "play" as const },
    ];
    render(<AccountPanel account={account(set)} />);
    expect(screen.getAllByText("세트로 산 풀이예요. 둘 다 열지 않았으면 전액 환불되고, 하나를 열면 남은 풀이 몫은 문의로 환불해 드려요.")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("하나를 열면 열지 않은 풀이 몫만 환불돼요");
    expect(within(document.getElementById("purchases")!).getAllByRole("button", { name: "환불받기" })).toHaveLength(1);
  });

  it("deleting the account: a Play set's remaining reading keeps the line it had, and is refunded once the deletion is checked (owner 2026-11-13)", () => {
    render(<AccountPanel account={account([{ orderId: "o-set", productId: "newyear-2027", refundable: false, noRefund: "play-part", set: true, provider: "play" }])} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("환불할 수 없는 풀이 1개는 사라져요")).toBeTruthy();
    expect(screen.getByText("앱에서 결제한 세트의 남은 풀이는 탈퇴 뒤 확인해서 환불해 드려요.")).toBeTruthy();
    cleanup();
    // A purchase given back after its reading was cut off: no such line.
    render(<AccountPanel account={account([{ orderId: "o-cut", productId: "saju", refundable: false }])} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    expect(screen.getByText("환불할 수 없는 풀이 1개는 사라져요")).toBeTruthy();
    expect(screen.queryByText("앱에서 결제한 세트의 남은 풀이는 탈퇴 뒤 확인해서 환불해 드려요.")).toBeNull();
  });

  it("keeps the web purchase's line as it was, and shows the server's own refusal as it is", async () => {
    answers["/api/pay/refund"] = () => Response.json({ ok: true, status: "refunded", amount: 2900 });
    const { unmount } = render(<AccountPanel account={account(BOTH)} />);
    refundOf("타로");
    expect(await screen.findByText("2,900원을 환불했어요. 카드사에 따라 며칠 걸릴 수 있어요.")).toBeTruthy();
    unmount();
    const message = "세트 중 하나를 이미 열어서 앱에서는 바로 환불할 수 없어요. 문의해 주시면 확인하고 처리해 드릴게요.";
    answers["/api/pay/refund"] = () => Response.json({ code: "NOT_REFUNDABLE", message }, { status: 409 });
    render(<AccountPanel account={account(BOTH)} />);
    refundOf("사주");
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("shows no receipt for a Google Play order in 결제 내역 (the server keeps none); a web order keeps 영수증 보기", async () => {
    render(<AccountPanel account={account([])} />);
    const orders = await screen.findByRole("region", { name: "결제 내역" });
    const rows = within(orders).getAllByRole("listitem");
    expect(within(rows[0]!).getByRole("link", { name: "영수증 보기" }).getAttribute("href")).toBe("https://dashboard.tosspayments.com/receipt/x");
    expect(within(rows[1]!).queryByRole("link", { name: "영수증 보기" })).toBeNull();
  });
});

/** The shell's Google sign-in: answers googleSignIn with `answer`. */
function fakeShell(answer: { ok: true; data: unknown } | { ok: false; code: string }) {
  const sent: Array<{ type: string; payload?: unknown }> = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { id: string; type: string; payload?: unknown };
      sent.push({ type: message.type, payload: message.payload });
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id: message.id, ...answer }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return sent;
}

describe("AccountPanel in the Starlog app: deleting a Google account", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
    answers["/api/account/delete-intent"] = () => Response.json({ url: "/api/auth/google/start?purpose=delete&intent=intent-token" });
    answers["/api/auth/google/native/start"] = () => Response.json({ state: "state-1", nonce: "nonce-1", clientId: "client.apps.googleusercontent.com" });
  });

  const deleteNow = () => {
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(screen.getByRole("button", { name: "Google로 확인하고 탈퇴하기" }));
  };

  it("re-checks with Google's sign-in in the app (never Google's web page), then lands on 탈퇴했어요", async () => {
    const sent = fakeShell({ ok: true, data: { idToken: "id.token.sig" } });
    answers["/api/auth/google/native"] = () => Response.json({ ok: true, deleted: true });
    const navigate = vi.fn();
    render(<AccountPanel account={account([], true)} navigate={navigate} />);
    deleteNow();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/me?account=deleted"));
    expect(requests.find((r) => r.url === "/api/auth/google/native/start")!.body).toEqual({ purpose: "delete", intent: "intent-token" });
    expect(sent).toEqual([{ type: "googleSignIn", payload: { clientId: "client.apps.googleusercontent.com", nonce: "nonce-1" } }]);
    expect(requests.find((r) => r.url === "/api/auth/google/native")!.body).toEqual({ state: "state-1", idToken: "id.token.sig" });
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/api/auth/google/start"));
  });

  it("says why it stopped (another Google account answered) as the web flow does", async () => {
    fakeShell({ ok: true, data: { idToken: "id.token.sig" } });
    answers["/api/auth/google/native"] = () => Response.json({ code: "FORBIDDEN", reason: "mismatch" }, { status: 403 });
    const navigate = vi.fn();
    render(<AccountPanel account={account([], true)} navigate={navigate} />);
    deleteNow();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/me?delete=mismatch"));
  });

  it("stays when the person closes Google's sheet", async () => {
    fakeShell({ ok: false, code: "CANCELED" });
    const navigate = vi.fn();
    render(<AccountPanel account={account([], true)} navigate={navigate} />);
    deleteNow();
    await waitFor(() => expect(requests.some((r) => r.url === "/api/auth/google/native/start")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(navigate).not.toHaveBeenCalled();
    expect(requests.some((r) => r.url === "/api/auth/google/native")).toBe(false);
  });

  it("keeps Kakao's re-check as it is (it runs inside the app)", async () => {
    answers["/api/account/delete-intent"] = () => Response.json({ url: "/api/auth/kakao/start?purpose=delete&intent=x" });
    const navigate = vi.fn();
    render(<AccountPanel account={account([])} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 확인하고 탈퇴하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?purpose=delete&intent=x"));
  });
});
