// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { FLOW_KEY, saveFlow, summarizeFlow, tarotInput, type FlowState } from "@/lib/flowState";
import { saveTeaser } from "@/lib/reading/teaserCache";
import { TAROT_TIPS } from "@/lib/reading/waitingTips";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { clearBetaUsage } from "@/lib/storage/betaUsage";
import { clearChapters, listChapters } from "@/lib/storage/chapters";
import { FreeResult } from "./FreeResult";
import { duringOpening } from "@/lib/testing/clock";

// These tests open the free first tarot reading (오픈 기념 무료), which ends 2026-10-31: pin the clock inside it.
duringOpening();

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CARDS = [
  { position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" as const },
  { position: "흐름", cardId: "major-00-fool", orientation: "reversed" as const },
  { position: "조언", cardId: "major-17-star", orientation: "upright" as const },
];
const ID = "abcdefghij0123456789";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";

/** A question with dealt cards and its teaser (with `extra` fields), as the draw left them; returns the question. */
function seed(extra: Record<string, unknown> = {}): string {
  const base: FlowState = { who: "me", topicId: "money", when: "week", conditions: {}, note: "" };
  const summary = summarizeFlow(base)!;
  const flow = { ...base, draw: { templateId: summary.template, drawToken: "signed.draw.token", cards: CARDS } };
  saveFlow(flow);
  const input = tarotInput(flow, summary);
  saveTeaser("tarot", `${flow.draw.drawToken}|${JSON.stringify(input)}`, {
    firstCard: { heading: "첫 장", body: "첫 카드 풀이" },
    lockedToc: ["흐름", "조언"],
    cards: CARDS.map((card) => ({ position: card.position, cardId: card.cardId, keyword: "열쇠" })),
    ...extra,
  });
  return summary.question;
}

const user = (over: Record<string, unknown> = {}) => ({ nickname: "별", gift: null, unused: [], opening: [], ...over });
const meBody = (over: Record<string, unknown> = {}) => ({ payments: true, login: true, owner: false, user: user(over) });
const GIFT = { status: "unused", until: "2026-12-30T14:59:59.999Z" };

/** The account's copy of this flow's reading, as GET /api/readings lists it. */
const savedReading = (question: string) => ({
  id: ID,
  createdAt: Date.now(),
  chapter: {
    kind: "tarot", question, conditions: [], note: "", cards: CARDS, chapterToken: "t0", createdAt: 1, turns: [], followUpsLeft: 3,
    reading: { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } },
  },
});

type Routes = { me: Array<() => Response>; reading?: () => Response | Promise<Response>; readings?: () => Response };

function stub(routes: Routes) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/me") return (routes.me.length > 1 ? routes.me.shift()! : routes.me[0]!)();
    if (url === "/api/tarot/reading") return routes.reading ? routes.reading() : Promise.reject(new TypeError("offline"));
    if (url.startsWith("/api/readings")) return routes.readings ? routes.readings() : Response.json({ readings: [], next: null });
    return Response.json({});
  }));
}

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  sessionStorage.clear();
  clearChapters();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("FreeResult and sharing (owner 2026-10-23: \"무료풀이에서도 공유가 가능하게\")", () => {
  beforeEach(() => {
    const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLElement) {
      this.setAttribute("open", "");
    };
  });

  it("shares the free part only: 공유하기 sends the teaser's sealed share, never its text, and the link is the free reading's own page", async () => {
    seed({ share: "sealed.free.share" });
    const posted: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/me") return Response.json(meBody());
      if (url === "/api/share/free") {
        posted.push({ url, body: JSON.parse(String(init?.body)) });
        return Response.json({ id: "freeshare001", path: "/s/freeshare001" });
      }
      return Response.json({ readings: [], next: null });
    }));
    render(<FreeResult instant />);
    await screen.findByRole("region", { name: "전체 풀이에 담긴 것" });
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    const sheet = screen.getByRole("dialog", { name: "결과 공유하기", hidden: true });
    expect(sheet.textContent).toContain("뽑은 카드와 무료로 본 첫 풀이가 보여요");
    expect(sheet.textContent).toContain("결제해야 보이는 뒷부분은 담지 않아요");
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    });
    expect(posted).toEqual([{ url: "/api/share/free", body: { share: "sealed.free.share" } }]);
    expect(sheet.textContent).toContain("/s/freeshare001");
  });

  it("still shows 공유하기 on a teaser kept from before shares were sealed, and says how to share", async () => {
    seed();
    stub({ me: [() => Response.json(meBody())] });
    render(<FreeResult instant />);
    await screen.findByRole("region", { name: "전체 풀이에 담긴 것" });
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    expect(screen.getByRole("dialog", { name: "결과 공유하기", hidden: true }).textContent).toContain("카드를 다시 뽑으면 공유할 수 있어요");
  });
});

describe("FreeResult after a paid opening was cut off", () => {
  it("offers nothing to press while it checks whether the reading opened", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] })), () => Response.json(meBody({ opening: [{ productId: "tarot", currency: "paid", orderId: ORDER }] }))] });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText("풀이가 열렸는지 확인하고 있어요", { selector: "#unlock-error" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "결제한 풀이 열기" })).toBeNull();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("once the check finds the purchase kept, 환불받기 goes to 결제한 풀이 in 내 정보, where its button is", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] }))] });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText(/결제한 풀이는 그대로 남아 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
  });

  it("checking again on a reading being opened that turns out kept offers it again with the refund link", async () => {
    seed();
    stub({
      me: [
        () => Response.json(meBody({ opening: [{ productId: "tarot", currency: "paid", orderId: ORDER }] })),
        () => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] })),
      ],
    });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 확인하기" }));
    expect(await screen.findByText(/결제한 풀이는 그대로 남아 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
    expect(await screen.findByRole("button", { name: "결제한 풀이 열기" })).toBeTruthy();
  });

  it("with two purchases of the same reading, the other one still unused does not count as the one used being kept", async () => {
    seed();
    const OTHER = "Zz9_yXw-Vu8tSr7Qp6On5Ml4";
    stub({
      me: [
        () => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }, { orderId: OTHER, productId: "tarot" }] })),
        () => Response.json(meBody({ unused: [{ orderId: OTHER, productId: "tarot" }] })),
      ],
    });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith("/api/readings"))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/결제한 풀이는 그대로 남아 있어요/)).toBeNull();
    expect(screen.getByText("풀이가 열렸는지 확인하고 있어요", { selector: "#unlock-error" })).toBeTruthy();
  });

  it("when the server refuses because the purchase is still taken, checks and opens the delivered reading instead of offering to pay", async () => {
    const question = seed();
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] })), () => Response.json(meBody())],
      reading: () => Response.json({ code: "NO_CREDIT" }, { status: 402 }),
      readings: () => Response.json({ readings: [savedReading(question)], next: null }),
    });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
  });

  it("binds a reading the check found delivered to these cards, so coming back offers it instead of a payment", async () => {
    const question = seed();
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] })), () => Response.json(meBody())],
      readings: () => Response.json({ readings: [savedReading(question)], next: null }),
    });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}").draw.chapterId).toBe(ID);
    expect((await screen.findByRole("link", { name: /열어 둔 풀이 보기/ })).getAttribute("href")).toBe(`/chapter/${ID}`);
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("when the check finds nothing held, opened or saved, says there is nothing to use and offers to pay", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] })), () => Response.json(meBody())], reading: () => Response.json({ code: "NO_CREDIT" }, { status: 402 }) });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText("열 수 있는 결제한 풀이가 없어요", { selector: "#unlock-error" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "2,900원 결제하고 보기" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("while the account is opening a tarot reading, says so, and checking again opens it once saved", async () => {
    const question = seed();
    stub({
      me: [() => Response.json(meBody({ gift: GIFT, opening: [{ productId: "tarot", currency: "paid", orderId: ORDER }] })), () => Response.json(meBody({ gift: GIFT }))],
      readings: () => Response.json({ readings: [savedReading(question)], next: null }),
    });
    render(<FreeResult instant />);
    expect(await screen.findByText("열고 있는 풀이가 있어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /가입 선물로 무료로 보기|결제한 풀이 열기/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
  });
});

describe("FreeResult and a signup gift held from before its removal", () => {
  it("asks a guest to log in to pay, promising no signup gift (removed, owner 2026-10-14 evening)", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })] });
    const { container } = render(<FreeResult instant />);
    expect(await screen.findByRole("link", { name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/가입 선물|무료로 드려요/);
  });

  it("offers the unused gift first and paying second; once used, only paying", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ gift: GIFT }))] });
    render(<FreeResult instant />);
    expect(await screen.findByRole("button", { name: "가입 선물로 무료로 보기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" })).toBeTruthy();
    expect(screen.getByText("가입 선물은 12월 30일까지 쓸 수 있어요")).toBeTruthy();
    cleanup();
    resetAccountForTests();
    stub({ me: [() => Response.json(meBody({ gift: { status: "used" } }))] });
    render(<FreeResult instant />);
    expect(await screen.findByRole("link", { name: "2,900원 결제하고 보기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "가입 선물로 무료로 보기" })).toBeNull();
  });

  it("opens with the gift, and when the reading breaks off says the gift is still there once the account shows it", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ gift: GIFT }))] });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "가입 선물로 무료로 보기" }));
    expect(await screen.findByText("가입 선물은 그대로예요. 한 번 더 시도해 주세요.")).toBeTruthy();
    const sent = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/tarot/reading");
    expect(JSON.parse(String((sent?.[1] as RequestInit | undefined)?.body))).toMatchObject({ unlock: { method: "free" } });
    expect(screen.queryByRole("link", { name: "환불받기" })).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("FreeResult after a reading opens", () => {
  it("goes to a reading saved in the account by its account id, the address it has on every device (QA-02)", async () => {
    seed();
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "tarot" }] }))],
      reading: () => Response.json({ reading: TAROT_SAMPLE.paid, chapterToken: "t1", readingId: ID }),
    });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(listChapters()).toMatchObject([{ serverId: ID }]);
    expect(listChapters()[0]).not.toHaveProperty("opening");
  });
});

describe("FreeResult and 오픈 기념 무료 (the free first tarot reading)", () => {
  const GUEST = () => Response.json({ payments: false, login: false, owner: false, user: null });
  afterEach(() => clearBetaUsage());

  it("opens it with the one button that names it, says first that it is read and keep only, keeps it marked so, and the device then knows it is used", async () => {
    seed();
    stub({ me: [GUEST], reading: () => Response.json({ reading: TAROT_SAMPLE.paid, chapterToken: "t1" }) });
    render(<FreeResult instant />);
    expect(await screen.findByText("10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 내 기록에 보관돼요(이어서 물어보기 제외).")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    // Read and kept on this device only: the record shows no follow-up box or share button.
    expect(listChapters()).toMatchObject([{ opening: true }]);
    cleanup();
    seed();
    render(<FreeResult instant />);
    expect(((await screen.findByRole("button", { name: "전체 풀이 보기" })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("이 기기에서는 오픈 기념 무료 풀이를 이미 열었어요")).toBeTruthy();
  });

  it("offers nothing free from 11월 1일 0시 KST: a guest with sales closed has nothing to open, one with sales open logs in to pay", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-31T15:00:00Z"));
    try {
      seed();
      stub({ me: [GUEST] });
      let { container } = render(<FreeResult instant />);
      expect(((await screen.findByRole("button", { name: "전체 풀이 보기" })) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("전체 풀이는 결제하고 열 수 있어요")).toBeTruthy();
      expect(container.textContent).not.toMatch(/오픈 기념|무료로 열 수 있어요/);
      cleanup();
      resetAccountForTests();
      stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })] });
      ({ container } = render(<FreeResult instant />));
      expect((await screen.findByRole("link", { name: "로그인하고 전체 풀이 보기" })).className).toMatch(/primary/);
      expect(screen.getByText("로그인하면 바로 결제하고 열 수 있어요")).toBeTruthy();
      expect(container.textContent).not.toMatch(/오픈 기념|무료로 열 수 있어요/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes the server's word that it is used, but never a network's day limit for it", async () => {
    seed();
    let answer = Response.json({ code: "BETA_LIMIT", scope: "network", resetsAt: "2099-01-01T15:00:00.000Z", message: "x" }, { status: 429 });
    stub({ me: [GUEST], reading: () => answer });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    expect(await screen.findAllByText("같은 네트워크(와이파이·회사·학교)에서 오늘 열 수 있는 횟수를 다 썼어요")).not.toHaveLength(0);
    answer = Response.json({ code: "BETA_LIMIT", scope: "first", message: "x" }, { status: 429 });
    fireEvent.click(screen.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    expect(await screen.findAllByText("오픈 기념 무료 풀이를 이미 열었어요")).not.toHaveLength(0);
    expect(((await screen.findByRole("button", { name: "전체 풀이 보기" })) as HTMLButtonElement).disabled).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("FreeResult and 오픈 기념 무료 once sales are open (owner 2026-10-14)", () => {
  afterEach(() => clearBetaUsage());

  it("puts it first for a guest, logging in next to it, and opens it as 오픈 기념 무료 (no unlock sent)", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })], reading: () => Response.json({ reading: TAROT_SAMPLE.paid, chapterToken: "t1" }) });
    render(<FreeResult instant />);
    const login = await screen.findByRole("link", { name: "로그인하고 전체 풀이 보기" });
    expect(login.className).toMatch(/secondary/);
    const first = screen.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ });
    expect(first.className).toMatch(/primary/);
    fireEvent.click(first);
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const sent = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/tarot/reading");
    expect(JSON.parse(String((sent?.[1] as RequestInit | undefined)?.body))).not.toHaveProperty("unlock");
    // a teaser without a seal (kept before 감질맛) sends none
    expect(JSON.parse(String((sent?.[1] as RequestInit | undefined)?.body))).not.toHaveProperty("seal");
  });

  it("once the server says it is used, a gift held is the gold choice again and 오픈 기념 무료 is no longer offered", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ gift: GIFT }))], reading: () => Response.json({ code: "BETA_LIMIT", scope: "first", message: "x" }, { status: 429 }) });
    render(<FreeResult instant />);
    expect((await screen.findByRole("button", { name: "가입 선물로 무료로 보기" })).className).toMatch(/secondary/);
    expect(screen.getByRole("link", { name: "2,900원 결제하고 보기" }).className).toMatch(/secondary/);
    fireEvent.click(screen.getByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    expect(await screen.findAllByText("오픈 기념 무료 풀이를 이미 열었어요")).not.toHaveLength(0);
    expect((await screen.findByRole("button", { name: "가입 선물로 무료로 보기" })).className).toMatch(/primary/);
    expect(screen.queryByRole("button", { name: /오픈 기념 무료/ })).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("FreeResult after the free teaser", () => {
  it("puts a small way to the unlock sheet right after the first card, before the locked contents (QA-05)", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: false, login: false, owner: false, user: null })] });
    render(<FreeResult instant />);
    const jump = await screen.findByRole("link", { name: "전체 풀이 보러 가기" });
    expect(jump.getAttribute("href")).toBe("#unlock-title");
    expect(document.getElementById("unlock-title")).toBeTruthy();
    const firstCard = screen.getByText("첫 카드 풀이");
    expect(firstCard.compareDocumentPosition(jump) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(jump.compareDocumentPosition(screen.getByText(/^소제목 2개/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("FreeResult and the 감질맛 teaser (owner 2026-10-14)", () => {
  afterEach(() => clearBetaUsage());
  const SECOND = { heading: "흐름 · 바보", body: "둘째 카드 앞부분이에요.", cut: true };

  it("shows the second card's first part as real text ending in a decorative …, the nudge, then the way down and the locked contents", async () => {
    seed({ secondCard: SECOND, seal: "SEALED_teaser-1" });
    stub({ me: [() => Response.json({ payments: false, login: false, owner: false, user: null })] });
    render(<FreeResult instant />);
    const second = await screen.findByRole("article", { name: "흐름 · 바보" });
    expect(second.textContent).toContain("둘째 카드 앞부분이에요.");
    const dots = [...second.querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent?.trim());
    expect(dots).toContain("…");
    const nudge = screen.getByText("이어지는 이야기는 전체 풀이에서 열려요");
    expect(second.contains(nudge)).toBe(true);
    const first = screen.getByText("첫 카드 풀이");
    const jump = screen.getByRole("link", { name: "전체 풀이 보러 가기" });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(jump) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(jump.compareDocumentPosition(screen.getByText(/^소제목 2개/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends the teaser's seal with the unlock, so the reading reads on from the cut", async () => {
    seed({ secondCard: SECOND, seal: "SEALED_teaser-1" });
    stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })], reading: () => Response.json({ reading: TAROT_SAMPLE.paid, chapterToken: "t1" }) });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const sent = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/tarot/reading");
    expect(JSON.parse(String((sent?.[1] as RequestInit | undefined)?.body))).toMatchObject({ seal: "SEALED_teaser-1" });
  });

  it("while the full reading is written, deals its cards: the step being written (by card position), then 타로 상식", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })], reading: () => new Promise<Response>(() => {}) });
    render(<FreeResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: /^전체 풀이 보기\s*·\s*오픈 기념 무료$/ }));
    const cards = await screen.findByRole("region", { name: "기다리는 동안 읽을거리" });
    const shown = () => within(cards).getByRole("group");
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    expect(within(shown()).getByText("지금의 나 카드")).toBeTruthy();
    expect(within(shown()).getByText("1 / 7")).toBeTruthy();
    const dots = within(cards).getAllByRole("button");
    expect(dots).toHaveLength(1 + TAROT_TIPS.length);
    fireEvent.click(dots[1]!);
    await waitFor(() => expect(within(shown()).getByText(TAROT_TIPS[0]!)).toBeTruthy());
    expect(within(shown()).getByText("타로 상식")).toBeTruthy();
    expect(screen.getByText("보통 1분 안팎")).toBeTruthy();
    expect(screen.getByText("이 화면을 열어 둔 채로 기다려 주세요.")).toBeTruthy();
    clearBetaUsage();
  });

  it("shows no second card for a teaser kept before it", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: false, login: false, owner: false, user: null })] });
    render(<FreeResult instant />);
    await screen.findByRole("link", { name: "전체 풀이 보러 가기" });
    expect(screen.queryByText("이어지는 이야기는 전체 풀이에서 열려요")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
});
