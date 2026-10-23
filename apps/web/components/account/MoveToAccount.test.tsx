// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { clearChapters, listChapters, saveChapter, type NewChapter } from "@/lib/storage/chapters";
import { clearMoveMarks } from "@/lib/storage/move";
import { MoveToAccount } from "./MoveToAccount";

const SYNCED = Date.parse("2026-10-31T12:00:00+09:00");
const BEFORE = Date.parse("2026-10-30T23:59:00+09:00");
const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const tarot = (question: string, extra: Partial<NewChapter> = {}) =>
  saveChapter({ kind: "tarot", question, conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: `t-${question}`, ...extra } as NewChapter).chapter;

const PROMPT = "이 기기에서 본 풀이 2개를 내 계정에 옮길까요?";
const member = { payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [], orders: [] } };

function stubServer(user: unknown = member.user) {
  const moves: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/me") return Response.json({ ...member, user });
      if (url === "/api/readings/move") {
        const body = JSON.parse(String(init?.body)) as { chapters: Array<{ id: string }> };
        moves.push(body);
        const [first, ...rest] = body.chapters;
        return Response.json({ moved: [{ id: first!.id, readingId: "abcdefghij0123456789" }], kept: rest.map((c) => ({ id: c.id, reason: "unverified" })) });
      }
      return Response.json({});
    }),
  );
  return moves;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SYNCED);
});

afterEach(() => {
  cleanup();
  clearChapters();
  clearMoveMarks();
  resetAccountForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("moving this device's readings into the account (account sync)", () => {
  it("asks once logged in, with what goes and where, and moves only on 옮기기; says which stayed on this device", async () => {
    tarot("하나");
    tarot("둘");
    tarot("계정에 있는 것", { serverId: "zzzzzzzzzz0123456789" });
    const moves = stubServer();
    render(<MoveToAccount />);
    const offer = await screen.findByRole("region", { name: PROMPT });
    expect(offer.textContent).toContain("옮기면 다른 기기에서도 보여요");
    expect(offer.textContent).toContain("암호화");
    expect(offer.textContent).toContain("탈퇴");
    expect(moves).toHaveLength(0);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "옮기기" })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1개를 내 계정으로 옮겼어요"));
    expect(screen.getByRole("status").textContent).toContain("1개는 스타로그가 만든 풀이인지 확인할 수 없어 이 기기에만 남겨 뒀어요");
    expect(moves).toHaveLength(1);
    expect(listChapters().filter((c) => c.serverId === "abcdefghij0123456789")).toHaveLength(1);
    // Nothing left to move: no offer any more.
    expect(screen.queryByRole("region", { name: /옮길까요/ })).toBeNull();
  });

  it("lists each record (date, kind, question) to pick from, all picked at first: one taken off stays on this device and is offered again", async () => {
    const one = tarot("하나");
    const two = tarot("둘");
    const moves = stubServer() as Array<{ chapters: Array<{ id: string }> }>;
    render(<MoveToAccount />);
    await screen.findByRole("region", { name: PROMPT });
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => [box.closest("label")?.textContent, box.checked])).toEqual([
      ["10월 31일 · 타로 · 하나", true],
      ["10월 31일 · 타로 · 둘", true],
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "10월 31일 · 타로 · 둘" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "옮기기" })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("풀이 1개를 내 계정으로 옮겼어요"));
    expect(moves.map((m) => m.chapters.map((c) => c.id))).toEqual([[one.id]]);
    expect(listChapters().find((c) => c.id === two.id)?.serverId).toBeUndefined();
    expect(screen.getByRole("region", { name: "이 기기에서 본 풀이 1개를 내 계정에 옮길까요?" })).toBeTruthy();
    // The one taken off stays off: nothing picked, nothing to send, until it is picked again.
    const left = screen.getByRole("checkbox", { name: "10월 31일 · 타로 · 둘" }) as HTMLInputElement;
    expect(left.checked).toBe(false);
    expect((screen.getByRole("button", { name: "옮기기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(left);
    expect((screen.getByRole("button", { name: "옮기기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("나중에 folds it into one line that still moves them, after the same explanation", async () => {
    tarot("하나");
    tarot("둘");
    stubServer();
    render(<MoveToAccount />);
    await screen.findByRole("region", { name: PROMPT });
    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(screen.queryByRole("region", { name: PROMPT })).toBeNull();
    expect(screen.getByText("이 기기에만 있는 풀이 2개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "계정으로 옮기기" }));
    expect(screen.getByRole("region", { name: PROMPT }).textContent).toContain("암호화");
  });

  it("offers nothing before 2026-10-31 00:00 KST, to a visitor who is not logged in, or with nothing to move", async () => {
    tarot("하나");
    tarot("둘");
    vi.setSystemTime(BEFORE);
    stubServer();
    const { unmount } = render(<MoveToAccount />);
    await act(async () => {});
    expect(screen.queryByRole("region")).toBeNull();
    unmount();
    resetAccountForTests();
    vi.setSystemTime(SYNCED);
    stubServer(null);
    const second = render(<MoveToAccount />);
    await act(async () => {});
    expect(screen.queryByRole("region")).toBeNull();
    second.unmount();
    resetAccountForTests();
    clearChapters();
    stubServer();
    render(<MoveToAccount />);
    await act(async () => {});
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(/이 기기에만 있는 풀이/)).toBeNull();
  });
});
