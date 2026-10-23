// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("shows the badge `양자리 2/4 · 174점` and one invite button while filling (카카오톡으로 초대하기, or 다른 앱으로 보내기 without a Kakao key)", async () => {
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
    expect(screen.getByRole("button", { name: "다른 앱으로 보내기" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
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

  it("invites to start, with no code box: a friend comes in through the invite link /b/<CODE>", async () => {
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: "별자리 인연 시작하기" })).getAttribute("href")).toBe("/bonds");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/초대코드/)).toBeNull();
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

  it("tiles invite a device that has not started to make a constellation, whatever the best record is, and show the way to my numbers", async () => {
    respond({ ok: true, owner: null, weekTop: { sign: "aries", total: 422 } });
    render(<BondsHomeRow enabled />);
    const ranking = await screen.findByRole("link", { name: /^별자리 인연 랭킹/ });
    expect(ranking.textContent).toBe("별자리 인연 랭킹나의 인연들과 별자리를 만들어 봐요");
    expect(ranking.getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("link", { name: /^이번 주 행운 번호/ }).textContent).toBe("이번 주 행운 번호이번 주 내 번호 6개 보기");
    cleanup();
    respond({ ok: true, owner: null, weekTop: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toBe("별자리 인연 랭킹나의 인연들과 별자리를 만들어 봐요");
    cleanup();
    // no record could be read: the same line
    respond({ ok: true, owner: null });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toBe("별자리 인연 랭킹나의 인연들과 별자리를 만들어 봐요");
  });

  it("the ranking tile shows my score and my all-time rank once a constellation is done, else just the score", async () => {
    const owner = (rankingPublic: boolean) => ({ nickname: "용우", rankingPublic, refillReadyAt: null });
    const completed = [{ id: "c1", sign: "aries", status: "complete", total: 412, startedAt: 1, completedAt: 5_000, stars: [star(0, 100), star(1, 100), star(2, 112), star(3, 100)] }];
    const body = { ok: true, invite: { code: "K7M4QX" }, filling: null, completed, top5: [], weekTop: { sign: "leo", total: 500 } };
    const tile = async () => screen.findByRole("link", { name: /^별자리 인연 랭킹/ });

    respond({ ...body, owner: owner(true), ranks: { aries: { all: 12 } } });
    render(<BondsHomeRow enabled />);
    expect((await tile()).textContent).toBe("별자리 인연 랭킹내 양자리 412점 · 12위");
    expect((await tile()).getAttribute("href")).toBe("/ranking");
    cleanup();
    respond({ ...body, owner: owner(true), ranks: { aries: { all: null } } });
    render(<BondsHomeRow enabled />);
    expect((await tile()).textContent).toBe("별자리 인연 랭킹내 양자리 412점");
    cleanup();
    respond({ ...body, owner: owner(false), ranks: { aries: { all: 12 } } });
    render(<BondsHomeRow enabled />);
    expect((await tile()).textContent).toBe("별자리 인연 랭킹내 양자리 412점");
  });

  it("the ranking tile shows the score so far while a constellation fills, and keeps my finished one in front", async () => {
    const owner = { nickname: "용우", rankingPublic: true, refillReadyAt: null };
    const tile = async () => screen.findByRole("link", { name: /^별자리 인연 랭킹/ });
    respond({
      ok: true,
      owner,
      invite: { code: "K7M4QX" },
      filling: { row: { id: "c1", sign: "aries", status: "filling", total: 174, startedAt: 1, completedAt: null }, stars: [star(0, 87), star(1, 87)] },
      completed: [],
      top5: [],
      ranks: {},
    });
    render(<BondsHomeRow enabled />);
    expect((await tile()).textContent).toBe("별자리 인연 랭킹지금 양자리 174점 · 완성하면 순위에 올라요");
    expect(screen.getByText("양자리 2/4 · 174점")).toBeTruthy();
    cleanup();
    // 양자리 is done and 황소자리 started by itself: the tile talks about the finished one
    respond({
      ok: true,
      owner,
      invite: { code: "K7M4QX" },
      filling: { row: { id: "c2", sign: "taurus", status: "filling", total: 60, startedAt: 6_000, completedAt: null }, stars: [star(0, 60)] },
      completed: [{ id: "c1", sign: "aries", status: "complete", total: 412, startedAt: 1, completedAt: 5_000, stars: [star(0, 100), star(1, 100), star(2, 112), star(3, 100)] }],
      top5: [],
      ranks: { aries: { all: 1 } },
    });
    render(<BondsHomeRow enabled />);
    expect((await tile()).textContent).toBe("별자리 인연 랭킹내 양자리 412점 · 1위");
    expect(screen.getByText("황소자리 1/5 · 60점")).toBeTruthy();
  });

  it("the ranking tile invites an owner who has nothing filling or completed yet", async () => {
    respond({ ok: true, owner: { nickname: "용우", rankingPublic: true, refillReadyAt: null }, invite: { code: "K7M4QX" }, filling: null, completed: [], top5: [], ranks: {} });
    render(<BondsHomeRow enabled />);
    expect((await screen.findByRole("link", { name: /^별자리 인연 랭킹/ })).textContent).toBe("별자리 인연 랭킹나의 인연들과 별자리를 만들어 봐요");
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
