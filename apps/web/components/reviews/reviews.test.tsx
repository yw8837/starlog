// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewList } from "./ReviewList";
import { ReviewPrompt } from "./ReviewPrompt";

const { account } = vi.hoisted(() => ({ account: { current: null as null | { login?: boolean; user: { id: string } | null } } }));
vi.mock("@/lib/account/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/account/client")>()), useAccount: () => account.current }));
vi.mock("next/navigation", () => ({ usePathname: () => "/chapter/abc123" }));

type Handler = (url: string, init?: RequestInit) => unknown;
let handle: Handler;
const calls: Array<{ url: string; method: string; body: unknown }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    const answer = handle(url, init) as { status?: number; json: unknown };
    return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REVIEW = { id: "r".repeat(16), product: "tarot", label: "타로", rating: 4, body: "생각보다 구체적이었어요", nickname: "별*냥", createdAt: Date.UTC(2026, 9, 13), edited: false, helpful: 2, helpfulByMe: false };

describe("ReviewPrompt", () => {
  it("opens the line after the stars, then saves the review of this reading", async () => {
    account.current = { user: { id: "u1" } };
    handle = (url, init) =>
      url.startsWith("/api/reviews/mine") ? { json: { review: null } } : init?.method === "POST" ? { json: { review: { ...REVIEW, rating: 5, hidden: false } } } : { json: {} };
    render(<ReviewPrompt readingId={"a".repeat(20)} />);
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/reviews/mine"))).toBe(true));
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "5점 중 5점" })));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "생각보다 구체적이었어요" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "후기 남기기" })));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ readingId: "a".repeat(20), rating: 5, body: "생각보다 구체적이었어요" });
    expect(await screen.findByRole("heading", { name: "후기를 남겨 줘서 고마워요" })).toBeTruthy();
  });

  it("shows the review already left, and says when the owner hid it", async () => {
    account.current = { user: { id: "u1" } };
    handle = () => ({ json: { review: { ...REVIEW, hidden: true } } });
    render(<ReviewPrompt readingId={"a".repeat(20)} />);
    expect(await screen.findByRole("heading", { name: "내가 남긴 후기" })).toBeTruthy();
    expect(screen.getByText("생각보다 구체적이었어요")).toBeTruthy();
    expect(screen.getByText(/운영 원칙에 따라 숨긴 후기예요/)).toBeTruthy();
  });

  it("says why a line was not saved", async () => {
    account.current = { user: { id: "u1" } };
    handle = (url, init) =>
      url.startsWith("/api/reviews/mine") ? { json: { review: null } } : init?.method === "POST" ? { status: 400, json: { code: "BAD_REQUEST", message: "전화번호는 쓸 수 없어요." } } : { json: {} };
    render(<ReviewPrompt readingId={"a".repeat(20)} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "5점 중 3점" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "후기 남기기" })));
    expect((await screen.findByRole("alert")).textContent).toBe("전화번호는 쓸 수 없어요.");
  });

  it("tells a visitor to log in to leave a review, with a way to log in, when login is open", async () => {
    account.current = { login: true, user: null };
    handle = () => ({ json: {} });
    render(<ReviewPrompt readingId={"a".repeat(20)} />);
    expect(screen.getByText("로그인하면 후기를 남길 수 있어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하기" }).getAttribute("href")).toBe("/login?next=%2Fchapter%2Fabc123");
    expect(calls).toEqual([]);
  });

  it("says the same for a reading that is only on this device (no reading id)", () => {
    account.current = { login: true, user: null };
    render(<ReviewPrompt />);
    expect(screen.getByText("로그인하면 후기를 남길 수 있어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하기" })).toBeTruthy();
  });

  it("shows only the stars when login is off, or while the account is not known yet", () => {
    for (const current of [{ login: false, user: null }, null, undefined]) {
      account.current = current as typeof account.current;
      const { container, unmount } = render(<ReviewPrompt />);
      expect(container.textContent).not.toContain("로그인");
      expect(screen.queryByRole("link")).toBeNull();
      unmount();
    }
  });

  it("does not ask a logged-in person to log in, and reads no review for a reading with no saved copy", () => {
    account.current = { login: true, user: { id: "u1" } };
    render(<ReviewPrompt />);
    expect(screen.queryByText("로그인하면 후기를 남길 수 있어요")).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("ReviewList", () => {
  it("shows every review with its stars, product and masked nickname, and the average once there is one", async () => {
    handle = () => ({ json: { reviews: [REVIEW, { ...REVIEW, id: "s".repeat(16), rating: 1, body: null }], next: null, summary: { count: 5, average: 3.4 } } });
    render(<ReviewList />);
    expect(await screen.findByRole("heading", { name: "이용 후기" })).toBeTruthy();
    expect(screen.getByText(/평균 ★ 3.4/)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText(/별\*냥/)).toHaveLength(2);
  });

  it("shows nothing while there is no review", async () => {
    handle = () => ({ json: { reviews: [], next: null, summary: { count: 0, average: null } } });
    const { container } = render(<ReviewList />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(container.textContent).toBe("");
  });

  it("starts a review the viewer already marked as marked, and a tap turns it off using the server's count", async () => {
    handle = (url) =>
      url.startsWith("/api/reviews/helpful")
        ? { json: { ok: true, on: false, helpful: 1 } }
        : { json: { reviews: [{ ...REVIEW, helpful: 2, helpfulByMe: true }], next: null, summary: { count: 1, average: null } } };
    render(<ReviewList />);
    const helpful = await screen.findByRole("button", { name: "도움돼요 2" });
    expect(helpful.getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(helpful));
    expect(calls.find((c) => c.url.startsWith("/api/reviews/helpful"))?.body).toEqual({ id: REVIEW.id, on: false });
    const after = await screen.findByRole("button", { name: "도움돼요 1" });
    expect(after.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the count the server answers with, not its own count plus one", async () => {
    handle = (url) =>
      url.startsWith("/api/reviews/helpful")
        ? { json: { ok: true, on: true, helpful: 2 } }
        : { json: { reviews: [{ ...REVIEW, helpful: 2, helpfulByMe: false }], next: null, summary: { count: 1, average: null } } };
    render(<ReviewList />);
    const helpful = await screen.findByRole("button", { name: "도움돼요 2" });
    await act(async () => fireEvent.click(helpful));
    await waitFor(() => expect(screen.getByRole("button", { name: /도움돼요/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "도움돼요 2" })).toBeTruthy();
  });

  it("asks a visitor to log in before 도움돼요", async () => {
    handle = (url) =>
      url.startsWith("/api/reviews/helpful")
        ? { status: 401, json: { code: "LOGIN_REQUIRED", message: "" } }
        : { json: { reviews: [REVIEW], next: null, summary: { count: 1, average: null } } };
    render(<ReviewList />);
    const helpful = await screen.findByRole("button", { name: "도움돼요 2" });
    await act(async () => fireEvent.click(helpful));
    expect((await screen.findByRole("status")).textContent).toBe("로그인하면 누를 수 있어요.");
  });
});
