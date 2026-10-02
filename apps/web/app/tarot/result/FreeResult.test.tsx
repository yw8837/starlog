// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { FLOW_KEY, saveFlow, summarizeFlow, tarotInput, type FlowState } from "@/lib/flowState";
import { saveTeaser } from "@/lib/reading/teaserCache";
import { clearChapters } from "@/lib/storage/chapters";
import { FreeResult } from "./FreeResult";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CARDS = [
  { position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" as const },
  { position: "흐름", cardId: "major-00-fool", orientation: "reversed" as const },
  { position: "조언", cardId: "major-17-star", orientation: "upright" as const },
];
const ID = "abcdefghij0123456789";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";

/** A question with dealt cards and its teaser, as the draw left them; returns the question. */
function seed(): string {
  const base: FlowState = { who: "me", topicId: "money", when: "week", conditions: {}, note: "" };
  const summary = summarizeFlow(base)!;
  const flow = { ...base, draw: { templateId: summary.template, drawToken: "signed.draw.token", cards: CARDS } };
  saveFlow(flow);
  const input = tarotInput(flow, summary);
  saveTeaser("tarot", `${flow.draw.drawToken}|${JSON.stringify(input)}`, {
    firstCard: { heading: "첫 장", body: "첫 카드 풀이" },
    lockedToc: ["흐름", "조언"],
    cards: CARDS.map((card) => ({ position: card.position, cardId: card.cardId, keyword: "열쇠" })),
  });
  return summary.question;
}

const user = (over: Record<string, unknown> = {}) => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], opening: [], ...over });
const meBody = (over: Record<string, unknown> = {}) => ({ payments: true, login: true, owner: false, user: user(over) });

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
    expect(await screen.findByText("쓸 수 있는 결제한 풀이나 별조각이 없어요", { selector: "#unlock-error" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "2,900원 결제하고 보기" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("while the account is opening a tarot reading, says so, and checking again opens it once saved", async () => {
    const question = seed();
    stub({
      me: [() => Response.json(meBody({ stardust: 10, opening: [{ productId: "tarot", currency: "paid", orderId: ORDER }] })), () => Response.json(meBody({ stardust: 10 }))],
      readings: () => Response.json({ readings: [savedReading(question)], next: null }),
    });
    render(<FreeResult instant />);
    expect(await screen.findByText("열고 있는 풀이가 있어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /별조각 10개로 보기|결제한 풀이 열기/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
  });
});
