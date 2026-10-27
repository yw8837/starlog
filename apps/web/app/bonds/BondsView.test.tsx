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
    expect(sheet.textContent).toContain("내 별자리와 별이 된 친구들의 닉네임, 인연 점수가 보여요");
    expect(sheet.textContent).toContain("점수 안내 전에 들어온 친구가 있거나 있었던 별자리는 닉네임만 보이고, 친구별 점수와 합계·평균은 넣지 않아요. 남긴 한 줄과 생년월일은 담기지 않아요.");
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    });
    expect(calls).toEqual([{ url: "/api/share/bonds", body: { constellationId: "c1abcdefghijklmnop" } }]);
    expect(sheet.textContent).toContain("/s/bondsshare01");
  });
});

describe("BondsView invites in one go (owner 2026-10-23, the 2026-10-02 decision: no codes to copy, make or type)", () => {
  const EMPTY = { ...OWNER_ME, filling: { row: { id: "c1abcdefghijklmnop", sign: "aries", status: "filling", total: 0, startedAt: 1, completedAt: null }, stars: [] } };

  it("after 코드 새로 만들기, the big invite button sends the new link, not the blocked one (QA H1)", async () => {
    let code = "K7M4QX";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (String(url).endsWith("/api/bonds/invite")) {
        code = "R98GYG";
        return new Response(JSON.stringify({ ok: true, code }));
      }
      return new Response(JSON.stringify({ ...EMPTY, invite: { code } }));
    }));
    const shared: Array<{ url?: string }> = [];
    vi.stubGlobal("navigator", { ...navigator, share: async (data: { url?: string }) => void shared.push(data) });
    render(<BondsView initialSign={null} />);
    const panel = await screen.findByRole("region", { name: /양자리/ });
    fireEvent.click(within(panel).getByRole("button", { name: "코드 새로 만들기", hidden: true }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "새 코드 만들기", hidden: true }));
    });
    await screen.findByText("R98GYG");
    await act(async () => {
      fireEvent.click(within(await screen.findByRole("region", { name: /양자리/ })).getByRole("button", { name: "다른 앱으로 보내기" }));
    });
    expect(shared.at(-1)?.url).toMatch(/\/b\/R98GYG$/);
    expect(calls.filter((c) => c.endsWith("/api/bonds/me")).length).toBeGreaterThanOrEqual(2);
  });

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

describe("BondsView: the owner belongs to the account (owner 2026-10-27)", () => {
  const FILLING = { ...OWNER_ME, filling: { row: { id: "c1abcdefghijklmnop", sign: "aries", status: "filling", total: 0, startedAt: 1, completedAt: null }, stars: [] } };

  it("logged out, the start screen asks to log in first and comes back to /bonds; no form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null, signedIn: false }))));
    render(<BondsView initialSign={null} />);
    expect(await screen.findByRole("heading", { name: "내 별자리는 로그인해서 만들어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /로그인하고 시작하기/ }).getAttribute("href")).toBe("/login?next=%2Fbonds");
    expect(screen.getByText(/친구는 로그인 없이 참여해요/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "닉네임" })).toBeNull();
  });

  it("logged in, the start form shows as before", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null, signedIn: true }))));
    render(<BondsView initialSign={null} />);
    expect(await screen.findByRole("textbox", { name: "닉네임" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /로그인하고 시작하기/ })).toBeNull();
  });

  it("offers 연결하기 for this device's owner and links only on the tap", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    let linked = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/api/bonds/link")) {
        linked = true;
        return new Response(JSON.stringify({ ok: true, kept: "device" }));
      }
      return new Response(JSON.stringify({ ...FILLING, signedIn: true, ...(linked ? {} : { link: { kind: "offer" } }) }));
    }));
    render(<BondsView initialSign={null} />);
    const prompt = (await screen.findByRole("heading", { name: "이 기기에서 만든 별자리를 내 계정에 연결할까요?" })).closest("section")!;
    expect(prompt.textContent).toContain("연결하면 다른 기기에서도 보여요");
    expect(calls.some((c) => c.url.endsWith("/api/bonds/link"))).toBe(false);
    await act(async () => {
      fireEvent.click(within(prompt).getByRole("button", { name: "연결하기" }));
    });
    expect(calls.find((c) => c.url.endsWith("/api/bonds/link"))?.body).toEqual({});
    await screen.findByRole("heading", { level: 1, name: "용우님의 별자리" });
    expect(screen.queryByRole("heading", { name: "이 기기에서 만든 별자리를 내 계정에 연결할까요?" })).toBeNull();
  });

  const CHOOSE = {
    kind: "choose",
    account: { nickname: "용우", sign: "aries", filled: 2, slots: 4, completed: 1, stars: 6, createdAt: Date.parse("2026-10-05T03:00:00Z") },
    device: { nickname: "용우폰", sign: "pisces", filled: 0, slots: 5, completed: 0, stars: 0, createdAt: Date.parse("2026-10-20T03:00:00Z") },
  };

  it("with an owner on the account already: shows both (sign, stars, made on) and keeps the chosen one; dropping friends' stars asks first", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/api/bonds/link")) return new Response(JSON.stringify({ ok: true, kept: "device" }));
      return new Response(JSON.stringify({ ...FILLING, signedIn: true, link: CHOOSE }));
    }));
    render(<BondsView initialSign={null} />);
    const prompt = (await screen.findByRole("heading", { name: "남길 별자리를 하나 골라 주세요" })).closest("section")!;
    const choices = within(prompt).getAllByRole("listitem");
    expect(choices.map((li) => li.textContent)).toEqual([
      "내 계정의 별자리용우님의 양자리별 2/4 · 완성 1개 · 10월 5일에 만들었어요이 별자리 남기기",
      "이 기기에서 만든 별자리용우폰님의 물고기자리별 0/5 · 10월 20일에 만들었어요이 별자리 남기기",
    ]);
    // keeping this device's drops the account's 6 friends' stars: a confirm first
    fireEvent.click(within(choices[1]!).getByRole("button", { name: "이 별자리 남기기" }));
    expect(calls.some((c) => c.url.endsWith("/api/bonds/link"))).toBe(false);
    const dialog = screen.getByRole("dialog", { name: "고르지 않은 별자리를 지울까요?" });
    expect(dialog.textContent).toContain("용우님의 양자리와 친구 별 6개가 지워져요. 지운 별자리는 되돌릴 수 없어요.");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "지우고 남기기" }));
    });
    expect(calls.find((c) => c.url.endsWith("/api/bonds/link"))?.body).toEqual({ keep: "device" });
  });

  it("keeping the account's when this device's holds no star goes at once", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/api/bonds/link")) return new Response(JSON.stringify({ ok: true, kept: "account" }));
      return new Response(JSON.stringify({ ...FILLING, signedIn: true, link: CHOOSE }));
    }));
    render(<BondsView initialSign={null} />);
    const prompt = (await screen.findByRole("heading", { name: "남길 별자리를 하나 골라 주세요" })).closest("section")!;
    await act(async () => {
      fireEvent.click(within(within(prompt).getAllByRole("listitem")[0]!).getByRole("button", { name: "이 별자리 남기기" }));
    });
    expect(screen.queryByRole("dialog", { name: "고르지 않은 별자리를 지울까요?" })).toBeNull();
    expect(calls.find((c) => c.url.endsWith("/api/bonds/link"))?.body).toEqual({ keep: "account" });
  });
});
