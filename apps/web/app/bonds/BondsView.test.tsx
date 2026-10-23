// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("BondsView 인연 점수 한눈에 and 공유하기 (owner 2026-10-23)", () => {
  const TWO = {
    ...OWNER_ME,
    filling: {
      row: { id: "c1abcdefghijklmnop", sign: "aries", status: "filling", total: 156, startedAt: 1, completedAt: null },
      stars: [
        { id: "s0", slot: 0, nickname: "하늘", message: null, cardId: "wands-01", orientation: "upright", score: 87, parts: [{ id: "stem-generate", points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" }, { id: "year-six", points: 8, text: "띠가 짝을 이루는 사이예요" }, { id: "fill-mine", points: 5, text: "내게 부족한 수 기운을 친구가 채워 줘요" }, { id: "day-three", points: 2, text: "x" }], createdAt: 1, line: "" },
        { id: "s1", slot: 1, nickname: "바다", message: null, cardId: "cups-02", orientation: "upright", score: 69, parts: [{ id: "stem-combine", points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" }, { id: "year-clash", points: -5, text: "띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요" }], createdAt: 2, line: "" },
      ],
    },
  };

  it("shows each star's score big on a 55–99 gauge with its table, and the constellation's average and best", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(TWO))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("heading", { level: 1, name: "용우님의 별자리" });
    const meters = screen.getAllByRole("meter", { name: "인연 점수" });
    expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual(["87", "69"]);
    const tables = screen.getAllByRole("table", { name: "점수를 만든 항목" });
    expect(tables).toHaveLength(2);
    expect(within(tables[1]!).getByText("−5")).toBeTruthy();
    expect(screen.getByText("평균").nextSibling?.textContent).toBe("78점");
    expect(screen.getByText("최고").nextSibling?.textContent).toBe("87점");
  });

  it("shares the constellation's own link: 공유하기 makes /s/<id> from the owner's constellation", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).startsWith("/api/share/bonds")) {
          calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify({ id: "bondsshare01", path: "/s/bondsshare01" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify(TWO));
      }),
    );
    render(<BondsView initialSign={null} />);
    await screen.findByRole("heading", { level: 1, name: "용우님의 별자리" });
    fireEvent.click(screen.getByRole("button", { name: "별자리 공유하기" }));
    const sheet = screen.getByRole("dialog", { name: "결과 공유하기", hidden: true });
    expect(sheet.textContent).toContain("내 별자리와 별이 된 친구들의 닉네임이 보여요");
    expect(sheet.textContent).toContain("인연 점수 합계와 평균은 별자리를 다 채운 뒤에만 보여요. 친구마다의 점수와 남긴 한 줄, 생년월일은 담기지 않아요.");
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    });
    expect(calls).toEqual([{ url: "/api/share/bonds", body: { constellationId: "c1abcdefghijklmnop" } }]);
    expect(sheet.textContent).toContain("/s/bondsshare01");
  });
});

describe("BondsView invites in one go (owner 2026-10-23, the 2026-10-02 decision: no codes to copy, make or type)", () => {
  const EMPTY = { ...OWNER_ME, filling: { row: { id: "c1abcdefghijklmnop", sign: "aries", status: "filling", total: 0, startedAt: 1, completedAt: null }, stars: [] } };

  it("puts 카카오톡으로 초대하기 first on a constellation just made, before its figure, and the code folded under 초대코드 보기", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(EMPTY))));
    render(<BondsView initialSign={null} />);
    const panel = await screen.findByRole("region", { name: /양자리/ });
    const first = within(panel).getAllByRole("button")[0]!;
    expect(first.textContent).toBe("카카오톡으로 초대하기");
    expect(within(panel).getByRole("button", { name: "다른 앱으로 보내기" })).toBeTruthy();
    const art = within(panel).getByRole("img", { name: /양자리/ });
    expect(first.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const fold = within(panel).getByText("초대코드 보기").closest("details")!;
    expect(fold.open).toBe(false);
    expect(within(fold).getByText("K7M4QX")).toBeTruthy();
    expect(within(fold).getByRole("button", { name: "코드 복사", hidden: true })).toBeTruthy();
    expect(within(fold).getByRole("button", { name: "코드 새로 만들기", hidden: true })).toBeTruthy();
    vi.unstubAllEnvs();
  });

  it("asks for no friend's code on /bonds (it lives in 내 정보) and says the invite is a link sent on KakaoTalk", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null }))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("button", { name: "별자리 인연 시작하기" });
    expect(screen.queryByText("친구의 초대코드가 있나요?")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /초대코드/ })).toBeNull();
    expect(document.body.textContent).toContain("카톡으로 초대 링크를 보내요");
    expect(document.body.textContent).not.toContain("초대코드를 보내요");
  });

  it("fills the nickname this device already used as a friend, so starting takes fewer steps", async () => {
    const joined = [{ ownerNickname: "민지", sign: "aquarius", status: "filling", filled: 2, slots: 7, members: [{ nickname: "지수", me: false }, { nickname: "용우별", me: true }] }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null, joined }))));
    render(<BondsView initialSign={null} />);
    await screen.findByRole("button", { name: "별자리 인연 시작하기" });
    expect((screen.getByRole("textbox", { name: "닉네임" }) as HTMLInputElement).value).toBe("용우별");
  });
});

describe("BondsView right after making a constellation (owner 2026-10-23)", () => {
  it("brings the invite into view at once (a browser may refuse to open a share sheet by itself, so the button shows big)", async () => {
    const CHOOSING = { ...OWNER_ME, filling: null };
    const EMPTY = { ...OWNER_ME, filling: { row: { id: "c1abcdefghijklmnop", sign: "aries", status: "filling", total: 0, startedAt: 1, completedAt: null }, stars: [] } };
    let chosen = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/bonds/choose")) {
          chosen = true;
          return new Response(JSON.stringify({ ok: true }));
        }
        return new Response(JSON.stringify(chosen ? EMPTY : CHOOSING));
      }),
    );
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      render(<BondsView initialSign={null} />);
      fireEvent.click(await screen.findByRole("button", { name: /양자리/ }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "양자리로 시작하기" }));
      });
      const invite = await screen.findByRole("button", { name: /카카오톡으로 초대하기|다른 앱으로 보내기/ });
      expect(scrolled.some((el) => el.contains(invite))).toBe(true);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
