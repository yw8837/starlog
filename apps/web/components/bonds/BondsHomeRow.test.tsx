// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kstWeekId } from "@starlog/core";
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

  it("is a section with its own h2, and offers two ways in on a first visit: start, or a friend's code to /b/<CODE>", async () => {
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    const section = await screen.findByRole("region", { name: "별자리 인연" });
    expect(within(section).getByRole("heading", { level: 2, name: "별자리 인연" })).toBeTruthy();
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["내 별자리 만들기", "친구 초대코드로 참여"]);
    expect(within(section).getByRole("link", { name: "시작하기" }).getAttribute("href")).toBe("/bonds");
    const input = screen.getByLabelText("친구 초대코드로 참여");
    fireEvent.change(input, { target: { value: "k7m" } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    expect(screen.getByRole("alert").textContent).toBe("코드를 다시 확인해 주세요");
    fireEvent.change(input, { target: { value: "k7m4qx" } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    expect(push).toHaveBeenCalledWith("/b/K7M4QX");
    // no quiet join line before there is a constellation (the card above is the way)
    expect(screen.queryByRole("link", { name: /^친구 초대코드로 참여하기/ })).toBeNull();
  });

  it("keeps an owner's constellation first, with the code entry as one quiet line", async () => {
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
    expect((await screen.findByRole("link", { name: /^친구 초대코드로 참여하기/ })).getAttribute("href")).toBe("/b");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "시작하기" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "별자리 인연" })).toBeTruthy();
  });

  it("leads on to the leaderboard and this week's lucky numbers in every state", async () => {
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("link", { name: /^이번 주 행운 번호/ }).getAttribute("href")).toBe("/lucky");
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
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("navigation", { name: "별자리 인연 더 보기" })).toBeTruthy();
  });

  it("tiles say this week's best record and the way to my numbers", async () => {
    respond({ ok: true, owner: null, weekTop: { sign: "aries", total: 422 } });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toBe("별자리 인연 랭킹이번 주 양자리 1위 422점");
    expect(screen.getByRole("link", { name: /^이번 주 행운 번호/ }).textContent).toBe("이번 주 행운 번호이번 주 내 번호 6개 보기");
    cleanup();
    respond({ ok: true, owner: null, weekTop: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toContain("첫 1위에 도전해 보세요");
    cleanup();
    // no record could be read: a plain line
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toContain("별자리마다 이번 주 1~3위");
  });

  it("previews this device's numbers once /lucky has shown them this week", async () => {
    const weekId = kstWeekId(Date.now());
    const numbers = [3, 12, 18, 27, 33, 41].map((n) => ({ n, reason: "" }));
    window.localStorage.setItem("starlog.lucky", JSON.stringify({ weekId, numbers, card: { cardId: "wands-01", name: "" }, notice: "" }));
    respond({ ok: true, owner: null, weekTop: null });
    render(<BondsHomeRow enabled />);
    const lucky = await screen.findByRole("link", { name: /^이번 주 행운 번호/ });
    expect(lucky.textContent).toBe("이번 주 행운 번호내 번호 3, 12, 18, 27, 33, 41");
    cleanup();
    // last week's numbers are not shown
    window.localStorage.setItem("starlog.lucky", JSON.stringify({ weekId: "2020-01-06", numbers, card: { cardId: "wands-01", name: "" }, notice: "" }));
    respond({ ok: true, owner: null, weekTop: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^이번 주 행운 번호/ })).textContent).toContain("이번 주 내 번호 6개 보기");
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
