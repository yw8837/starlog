// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDesk } from "./ReviewDesk";

const { account } = vi.hoisted(() => ({ account: { current: null as null | { owner: boolean } } }));
vi.mock("@/lib/account/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/account/client")>()), useAccount: () => account.current }));

type Handler = (url: string, init?: RequestInit) => { status?: number; json: unknown };
let handle: Handler;
const calls: Array<{ url: string; method: string; body: unknown }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    const answer = handle(url, init);
    return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = { product: "tarot", label: "타로", nickname: "별*냥", edited: false, helpful: 0, helpfulByMe: false, hiddenReason: null };
const NEWER = { ...base, id: "n".repeat(16), rating: 1, body: "여기로 연락 주세요 상담해 드려요", createdAt: Date.UTC(2026, 9, 13), status: "visible", reports: 3, reasons: "광고·홍보, 광고·홍보, 개인정보" };
const OLDER = { ...base, id: "o".repeat(16), rating: 5, body: "정말 좋았어요 고마워요", createdAt: Date.UTC(2026, 9, 10), status: "hidden", hiddenReason: "욕설·비하", reports: 1, reasons: "욕설·비하" };

const listing = (reviews: unknown[]) => ({ json: { reviews } });

describe("ReviewDesk", () => {
  it("shows nothing to anyone but the owner, and asks the server for nothing", () => {
    account.current = { owner: false };
    handle = () => listing([NEWER]);
    const { container } = render(<ReviewDesk />);
    expect(container.textContent).toBe("");
    expect(calls).toEqual([]);
  });

  it("lists the reported reviews as the server sends them, with body, stars, report count and reasons", async () => {
    account.current = { owner: true };
    handle = () => listing([NEWER, OLDER]);
    render(<ReviewDesk />);
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0]!);
    expect(first.getByText("여기로 연락 주세요 상담해 드려요")).toBeTruthy();
    expect(first.getByLabelText("5점 중 1점")).toBeTruthy();
    expect(first.getByText("신고 3건 (광고·홍보 2, 개인정보 1)")).toBeTruthy();
    const second = within(items[1]!);
    expect(second.getByText(/숨김 · 욕설·비하/)).toBeTruthy();
    expect(second.getByRole("button", { name: "다시 보이기" })).toBeTruthy();
    expect(second.queryByRole("button", { name: "숨기기" })).toBeNull();
  });

  it("hides a review with the chosen rule reason, then restores it", async () => {
    account.current = { owner: true };
    handle = (url, init) => (init?.method === "POST" ? { json: { ok: true } } : listing([NEWER]));
    render(<ReviewDesk />);
    const select = await screen.findByLabelText("숨김 사유");
    expect((select as HTMLSelectElement).value).toBe("광고·홍보");
    fireEvent.change(select, { target: { value: "개인정보" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "숨기기" })));
    expect(calls.find((c) => c.method === "POST")).toEqual({ url: "/api/owner/reviews", method: "POST", body: { id: NEWER.id, hidden: true, reason: "개인정보" } });
    const restore = await screen.findByRole("button", { name: "다시 보이기" });
    expect(screen.getByText(/숨김 · 개인정보/)).toBeTruthy();
    await act(async () => fireEvent.click(restore));
    expect(calls.filter((c) => c.method === "POST").at(-1)?.body).toEqual({ id: NEWER.id, hidden: false });
    expect(await screen.findByRole("button", { name: "숨기기" })).toBeTruthy();
  });

  it("says so when the change was not saved, and leaves the review as it was", async () => {
    account.current = { owner: true };
    handle = (url, init) => (init?.method === "POST" ? { status: 503, json: { code: "PAY_UNAVAILABLE", message: "" } } : listing([NEWER]));
    render(<ReviewDesk />);
    const hide = await screen.findByRole("button", { name: "숨기기" });
    await act(async () => fireEvent.click(hide));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요."));
    expect(screen.getByRole("button", { name: "숨기기" })).toBeTruthy();
  });

  it("says when nothing is reported", async () => {
    account.current = { owner: true };
    handle = () => listing([]);
    render(<ReviewDesk />);
    expect(await screen.findByText("신고된 후기가 없어요.")).toBeTruthy();
  });
});
