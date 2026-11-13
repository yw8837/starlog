// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingReportDesk } from "./ReadingReportDesk";

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

// 2026-11-13 12:05 KST
const AT = Date.UTC(2026, 10, 13, 3, 5);
const SHARED = { id: "rep_shared", kind: "shared", readingId: "abc123def456", link: "/s/abc123def456", reason: "misleading", note: "숫자가 이상해요", createdAt: AT, handledAt: null };
const TEASER = { id: "rep_teaser", kind: "teaser", readingId: null, link: null, reason: "offensive", note: null, createdAt: AT - 60_000, handledAt: AT };
const SAVED = { id: "rep_saved", kind: "tarot", readingId: "abcdefghij0123456789", link: null, reason: "other", note: null, createdAt: AT - 120_000, handledAt: null };

const page = (reports: unknown[], next: string | null = null) => ({ json: { reports, next } });

describe("ReadingReportDesk", () => {
  it("shows nothing to anyone but the owner, and asks the server for nothing", () => {
    account.current = { owner: false };
    handle = () => page([SHARED]);
    const { container } = render(<ReadingReportDesk />);
    expect(container.textContent).toBe("");
    expect(calls).toEqual([]);
  });

  it("lists each report with its KST time, kind, reading, reason, note and whether it was handled", async () => {
    account.current = { owner: true };
    handle = () => page([SHARED, TEASER, SAVED]);
    render(<ReadingReportDesk />);
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    const shared = within(items[0]!);
    expect(shared.getByText("2026-11-13 12:05")).toBeTruthy();
    expect(shared.getByText("공유 링크")).toBeTruthy();
    expect(shared.getByRole("link", { name: "공유 링크 열기" }).getAttribute("href")).toBe("/s/abc123def456");
    expect(shared.getByText("사실과 다르거나 오해를 부르는 내용이에요")).toBeTruthy();
    expect(shared.getByText("메모: 숫자가 이상해요")).toBeTruthy();
    expect(shared.getByText("확인 전")).toBeTruthy();
    const teaser = within(items[1]!);
    expect(teaser.getByText("맛보기")).toBeTruthy();
    expect(teaser.getByText("풀이 번호 없음 (저장되지 않는 풀이예요)")).toBeTruthy();
    expect(teaser.getByText("메모 없음")).toBeTruthy();
    expect(teaser.getByText("처리함 · 2026-11-13 12:05")).toBeTruthy();
    expect(teaser.getByRole("button", { name: "처리 전으로 되돌리기" })).toBeTruthy();
    const saved = within(items[2]!);
    expect(saved.getByText("타로 전체 풀이")).toBeTruthy();
    expect(saved.getByText("풀이 번호 abcdefghij0123456789 (신고한 사람만 열 수 있어요)")).toBeTruthy();
    expect(saved.queryByRole("link")).toBeNull();
  });

  it("marks a report handled, then back", async () => {
    account.current = { owner: true };
    handle = (url, init) => {
      if (init?.method !== "POST") return page([SHARED]);
      return { json: { ok: true, handledAt: (JSON.parse(String(init.body)) as { handled: boolean }).handled ? AT + 60_000 : null } };
    };
    render(<ReadingReportDesk />);
    const mark = await screen.findByRole("button", { name: "처리 완료로 표시" });
    await act(async () => fireEvent.click(mark));
    expect(calls.find((c) => c.method === "POST")).toEqual({ url: "/api/owner/reading-reports", method: "POST", body: { id: SHARED.id, handled: true } });
    expect(await screen.findByText("처리함 · 2026-11-13 12:06")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "처리 전으로 되돌리기" })));
    expect(calls.filter((c) => c.method === "POST").at(-1)?.body).toEqual({ id: SHARED.id, handled: false });
    expect(await screen.findByText("확인 전")).toBeTruthy();
  });

  it("says so when the change was not saved, and leaves the report as it was", async () => {
    account.current = { owner: true };
    handle = (url, init) => (init?.method === "POST" ? { status: 503, json: { code: "PAY_UNAVAILABLE", message: "" } } : page([SHARED]));
    render(<ReadingReportDesk />);
    const mark = await screen.findByRole("button", { name: "처리 완료로 표시" });
    await act(async () => fireEvent.click(mark));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요."));
    expect(screen.getByText("확인 전")).toBeTruthy();
  });

  it("loads the next page with 더 보기, and says when nothing was reported", async () => {
    account.current = { owner: true };
    handle = (url) => (url.includes("before=") ? page([SAVED]) : page([SHARED], `${SHARED.createdAt}.${SHARED.id}`));
    render(<ReadingReportDesk />);
    const more = await screen.findByRole("button", { name: "더 보기" });
    await act(async () => fireEvent.click(more));
    expect(calls.at(-1)?.url).toBe(`/api/owner/reading-reports?before=${encodeURIComponent(`${SHARED.createdAt}.${SHARED.id}`)}`);
    expect(await screen.findByText("타로 전체 풀이")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
    cleanup();

    handle = () => page([]);
    render(<ReadingReportDesk />);
    expect(await screen.findByText("들어온 신고가 없어요.")).toBeTruthy();
  });
});
