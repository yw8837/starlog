// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BondsHomeRow } from "./BondsHomeRow";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const star = (slot: number, score: number, createdAt = 1_000) => ({
  id: `s${slot}`, slot, nickname: `친구${slot}`, message: null, cardId: "wands-01", orientation: "upright", score, parts: [], createdAt, line: "",
});

function respond(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })));
}

describe("BondsHomeRow", () => {
  beforeEach(() => {
    push.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the badge `양자리 2/4 · 174점` and 초대하기 while filling", async () => {
    respond({
      ok: true,
      owner: { nickname: "용우", rankingPublic: true, refillReadyAt: null },
      invite: { code: "K7M4QX" },
      filling: { row: { id: "c1", sign: "aries", status: "filling", total: 174, startedAt: 1, completedAt: null }, stars: [star(0, 87), star(1, 87)] },
      completed: [],
      top5: [],
      ranks: {},
    });
    render(<BondsHomeRow enabled />);
    expect(await screen.findByText("양자리 2/4 · 174점")).toBeTruthy();
    expect(screen.getByRole("button", { name: "초대하기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /별자리 인연, 양자리 2\/4 · 174점/ }).getAttribute("href")).toBe("/bonds");
  });

  it("sparkles the stars that came in after the owner page was last seen", async () => {
    window.localStorage.setItem("starlog.bonds.seen", "1500");
    respond({
      ok: true,
      owner: { nickname: "용우", rankingPublic: true, refillReadyAt: null },
      invite: { code: "K7M4QX" },
      filling: { row: { id: "c1", sign: "libra", status: "filling", total: 160, startedAt: 1, completedAt: null }, stars: [star(0, 80, 1_000), star(1, 80, 2_000)] },
      completed: [],
      top5: [],
      ranks: {},
    });
    const { container } = render(<BondsHomeRow enabled />);
    expect(await screen.findByText("새 별이 1개 들어왔어요")).toBeTruthy();
    expect(container.querySelectorAll("[data-new]")).toHaveLength(1);
  });

  it("invites to start, and takes a friend's code to /b/<CODE>", async () => {
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: "별자리 인연 시작하기" })).getAttribute("href")).toBe("/bonds");
    const input = screen.getByLabelText("초대코드로 참여");
    fireEvent.change(input, { target: { value: "k7m" } });
    fireEvent.click(screen.getByRole("button", { name: "참여" }));
    expect(screen.getByRole("alert").textContent).toBe("코드를 다시 확인해 주세요");
    fireEvent.change(input, { target: { value: "k7m4qx" } });
    fireEvent.click(screen.getByRole("button", { name: "참여" }));
    expect(push).toHaveBeenCalledWith("/b/K7M4QX");
  });

  it("leads on to the leaderboard and this week's lucky numbers in every state", async () => {
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: "별자리 리더보드" })).getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("link", { name: "이번 주 행운 번호" }).getAttribute("href")).toBe("/lucky");
    cleanup();
    respond({
      ok: true,
      owner: { nickname: "용우", rankingPublic: true, refillReadyAt: null },
      invite: { code: "K7M4QX" },
      filling: { row: { id: "c1", sign: "aries", status: "filling", total: 87, startedAt: 1, completedAt: null }, stars: [star(0, 87)] },
      completed: [],
      top5: [],
      ranks: {},
    });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: "별자리 리더보드" })).getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("navigation", { name: "별자리 인연 더 보기" })).toBeTruthy();
  });

  it("renders nothing with the feature off or when the API fails", async () => {
    respond({ ok: true, owner: null });
    const off = render(<BondsHomeRow enabled={false} />);
    expect(off.container.innerHTML).toBe("");
    off.unmount();
    respond({ ok: false, code: "SERVER" });
    const failed = render(<BondsHomeRow enabled />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(failed.container.innerHTML).toBe("");
  });
});
