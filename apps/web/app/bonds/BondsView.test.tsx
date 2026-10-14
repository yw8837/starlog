// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BondsView } from "./BondsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BondsView loading (Q-06)", () => {
  it("holds the page's final shape while this device's 별자리 loads", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = render(<BondsView initialSign={null} />);
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "별자리 인연" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("별자리를 불러오는 중이에요");
  });

  it("replaces it with the start form once the device turns out to be new", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null }))));
    const { container } = render(<BondsView initialSign={null} />);
    expect(await screen.findByRole("button", { name: "별자리 인연 시작하기" })).toBeTruthy();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });
});

const OWNER_ME = {
  ok: true,
  owner: { nickname: "용우", rankingPublic: true, refillReadyAt: null },
  invite: { code: "K7M4QX" },
  filling: {
    row: { id: "c1", sign: "aries", status: "filling", total: 87, startedAt: 1, completedAt: null },
    stars: [{ id: "s0", slot: 0, nickname: "친구", message: null, cardId: "wands-01", orientation: "upright", score: 87, parts: [], createdAt: 1, line: "" }],
  },
  completed: [],
  top5: [],
  ranks: {},
};

describe("BondsView how-to (3 steps)", () => {
  it("puts the 이렇게 해요 card on the start screen, above the form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null }))));
    render(<BondsView initialSign={null} />);
    const card = await screen.findByRole("region", { name: "이렇게 해요" });
    expect(within(card).getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent)).toEqual(["1별자리 고르기", "2친구에게 보내기", "3다 채우면 완성"]);
    const start = await screen.findByRole("button", { name: "별자리 인연 시작하기" });
    expect(card.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the card is on the page, so there is no 사용법 button yet
    expect(screen.queryByRole("button", { name: "사용법" })).toBeNull();
  });

  it("gives an owner a quiet 사용법 button instead, which opens the same three steps in the Modal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(OWNER_ME))));
    render(<BondsView initialSign={null} />);
    const open = await screen.findByRole("button", { name: "사용법" });
    expect(screen.queryByRole("region", { name: "이렇게 해요" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "이렇게 해요" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("BondsView 내가 들어간 별자리 (owner 2026-10-14)", () => {
  const JOINED = [
    { ownerNickname: "민지", sign: "aquarius", status: "filling", filled: 3, slots: 7, members: [{ nickname: "지수", me: false }, { nickname: "용우", me: true }, { nickname: "하늘", me: false }] },
    { ownerNickname: "도윤", sign: "virgo", status: "complete", filled: 6, slots: 6, members: [{ nickname: "용우", me: true }] },
  ];
  const listed = () =>
    within(screen.getByRole("region", { name: "내가 들어간 별자리" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);

  it("lists the friends' constellations this device joined under the owner's own, with 나 in its place", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...OWNER_ME, joined: JOINED }))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("heading", { level: 1, name: "용우님의 별자리" });
    expect(listed()).toEqual(["민지님의 물병자리3/7지수 · 나 · 하늘", "도윤님의 처녀자리완성나"]);
  });

  it("shows them on the start screen too, for a device that only joined", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null, joined: JOINED }))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("button", { name: "별자리 인연 시작하기" });
    expect(listed()).toHaveLength(2);
  });

  it("shows no list when the device joined nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(OWNER_ME))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("heading", { level: 1, name: "용우님의 별자리" });
    expect(screen.queryByRole("region", { name: "내가 들어간 별자리" })).toBeNull();
  });
});
