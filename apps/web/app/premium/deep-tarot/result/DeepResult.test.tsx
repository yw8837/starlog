// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDS, TEMPLATES } from "@starlog/core";
import { resetAccountForTests } from "@/lib/account/client";
import { FLOW_KEY } from "@/lib/flowState";
import { resetBotCheck } from "@/lib/reading/api";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { clearChapters, listChapters } from "@/lib/storage/chapters";
import { DeepResult } from "./DeepResult";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const bot = vi.hoisted(() => ({ token: vi.fn(async () => "turnstile-token") }));
vi.mock("@/lib/reading/turnstile", () => ({ turnstileToken: bot.token }));

const POSITIONS = TEMPLATES["deep-tarot"].positions;
const DRAWN = POSITIONS.map((position, i) => ({ position, cardId: CARDS[i * 3]!.id, orientation: i % 4 === 1 ? ("reversed" as const) : ("upright" as const) }));
const FLOW = { who: "me", topicId: "money", when: "week", conditions: {}, note: "카드값이 많이 나왔어요", spread: "deep", draw: { templateId: "deep-tarot", drawToken: "signed.deep.draw", cards: DRAWN } };
const ID = "abcdefghij0123456789";
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const PREVIEW = {
  cards: DRAWN.map((card) => ({ ...card, keyword: `${card.position} 열쇠` })),
  now: { heading: "지금의 나", body: "지금 당신은 지출을 다시 세는 자리에 서 있어요." },
  lockedToc: ["한 줄 결론", ...POSITIONS.map((p) => `${p} 카드`), "지금과 가로막는 것", "두 갈래", "기둥", "시기", "오늘 해 볼 일", "확인해 볼 신호"],
};
const READING = {
  verdict: "천천히 가도 괜찮아요",
  positions: DRAWN.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
  crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
  staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: ["다음 달은요?"],
};
const me = (unused: Array<{ orderId: string; productId: string }>) =>
  Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused, opening: [] } });

type Routes = { teaser?: Array<() => Response>; reading?: Array<() => Response>; readings?: () => Response; unused?: Array<{ orderId: string; productId: string }> };
function stub(routes: Routes) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/premium/status") return Response.json({ products: [{ id: "tarot-deep", open: true, visible: true, opensAt: null }] });
    if (url === "/api/me") return me(routes.unused ?? [{ orderId: "o-deep", productId: "tarot-deep" }]);
    if (url === "/api/premium/tarot-deep/teaser") return routes.teaser!.shift()!();
    if (url === "/api/premium/tarot-deep/reading") return routes.reading!.shift()!();
    if (url.startsWith("/api/readings")) return routes.readings ? routes.readings() : Response.json({ readings: [], next: null });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const calls = (fetchMock: ReturnType<typeof stub>, url: string) => fetchMock.mock.calls.filter(([u]) => u === url);

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...FLOW, savedAt: Date.now() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  resetBotCheck();
  bot.token.mockClear();
  sessionStorage.clear();
  clearChapters();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("켈틱 크로스 10장's result screen (Task 19)", () => {
  it("shows the free preview: the ten cards laid out and listed with keywords, 지금의 나, the locked contents and the open panel", async () => {
    stub({ teaser: [() => Response.json({ preview: PREVIEW })] });
    render(<DeepResult instant />);
    expect(await screen.findByText(PREVIEW.now.body)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "카드 10장 배치" })).getAllByRole("listitem")).toHaveLength(10);
    const list = screen.getByRole("list", { name: "카드 10장" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(within(list).getByText("지금의 나 열쇠")).toBeTruthy();
    expect(screen.getByText(`소제목 ${PREVIEW.lockedToc.length}개 · 약 5,000자`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "심층 타로에 담긴 것" })).toBeTruthy();
    expect(screen.getByText("켈틱 크로스 10장")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/베타|Claude|Anthropic/);
  });

  it("writes the reading in its two parts, keeps it on this device with the cards' keywords and design, and opens its chapter", async () => {
    const fetchMock = stub({
      teaser: [() => Response.json({ preview: PREVIEW })],
      reading: [
        () => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }),
        () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
      ],
    });
    render(<DeepResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    const sent = calls(fetchMock, "/api/premium/tarot-deep/reading").map(([, init]) => JSON.parse(String(init!.body)));
    expect(sent[0]).toMatchObject({ drawToken: "signed.deep.draw", unlock: { method: "paid" }, input: { topicId: "money", note: "카드값이 많이 나왔어요" } });
    expect(sent[1]).toMatchObject({ resume: "r1", unlock: { method: "paid" } });
    const [chapter] = listChapters();
    expect(chapter).toMatchObject({ kind: "tarot-deep", serverId: ID, followUpsLeft: 5, deck: sent[0].input.deck });
    expect(chapter && "cards" in chapter ? chapter.cards[0]?.keyword : null).toBe("지금의 나 열쇠");
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).draw.chapterId).toBe(chapter!.id);
  });

  it("asks for the browser check like the free previews do: a 403 BOT_CHECK runs Turnstile and sends the preview again with its token", async () => {
    const fetchMock = stub({
      teaser: [() => Response.json({ code: "BOT_CHECK", siteKey: "site-key" }, { status: 403 }), () => Response.json({ preview: PREVIEW })],
    });
    render(<DeepResult instant />);
    expect(await screen.findByText(PREVIEW.now.body)).toBeTruthy();
    expect(bot.token).toHaveBeenCalledWith("site-key", expect.anything());
    const [, second] = calls(fetchMock, "/api/premium/tarot-deep/teaser");
    expect(new Headers(second![1]!.headers).get("x-turnstile-token")).toBe("turnstile-token");
  });

  it("opens the account's copy when the reading was already written and saved (409 opened), never writing it again", async () => {
    const saved = { id: ID, createdAt: Date.now(), chapter: { kind: "tarot-deep", question: "q", conditions: [], note: "", cards: DRAWN, reading: READING, chapterToken: "c", createdAt: 1, turns: [], followUpsLeft: 5 } };
    stub({
      teaser: [() => Response.json({ preview: PREVIEW })],
      reading: [() => Response.json({ code: "NOT_AVAILABLE", reason: "opened", readingId: ID, message: "이미 다 적어서 저장한 풀이예요." }, { status: 409 })],
      readings: () => Response.json({ readings: [saved], next: null }),
    });
    render(<DeepResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(listChapters().map((c) => c.serverId)).toEqual([ID]);
  });

  it("after a part is cut off, checks the account first; with the purchase kept it offers 이어서 받기 from the part written", async () => {
    stub({
      teaser: [() => Response.json({ preview: PREVIEW })],
      reading: [() => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }), () => Response.json({ code: "UPSTREAM" }, { status: 502 })],
    });
    render(<DeepResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText(/결제한 풀이는 그대로 남아 있어요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "이어서 받기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
  });

  it("lets a buyer open the purchase when the free preview cannot be written (day's previews used, browser check refused): kept without keywords", async () => {
    stub({
      teaser: [() => Response.json({ code: "BETA_LIMIT", resetsAt: Date.now() + 3_600_000 }, { status: 429 })],
      reading: [
        () => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }),
        () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
      ],
    });
    render(<DeepResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    const [chapter] = listChapters();
    expect(chapter && "cards" in chapter ? chapter.cards.map((card) => "keyword" in card) : null).toEqual(Array(10).fill(false));
  });

  it("offers no open panel without a purchase when the preview fails: the preview's error and its retry", async () => {
    stub({ teaser: [() => Response.json({ code: "BETA_LIMIT", resetsAt: Date.now() + 3_600_000 }, { status: 429 })], unused: [] });
    render(<DeepResult instant />);
    await waitFor(() => expect(document.body.textContent).toMatch(/오늘|내일|다시/));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("heading", { name: "심층 타로에 담긴 것" })).toBeNull();
  });

  it("binds the draw to the reading on both recovery paths (cut off but delivered, 409 opened), so it is never offered for sale again", async () => {
    let question = "";
    const saved = () => ({ id: ID, createdAt: Date.now(), chapter: { kind: "tarot-deep", question, conditions: [], note: "", cards: DRAWN, reading: READING, chapterToken: "c", createdAt: 1, turns: [], followUpsLeft: 5 } });
    stub({
      teaser: [() => Response.json({ preview: PREVIEW })],
      reading: [() => Response.json({ code: "UPSTREAM" }, { status: 502 })],
      readings: () => Response.json({ readings: [saved()], next: null }),
    });
    render(<DeepResult instant />);
    const open = await screen.findByRole("button", { name: "결제한 풀이 열기" });
    question = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    fireEvent.click(open);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).draw.chapterId).toBe(ID);
    cleanup();
    resetAccountForTests();

    // Back on the preview: the reading it holds, not a second sale.
    stub({ teaser: [() => Response.json({ preview: PREVIEW })], unused: [] });
    render(<DeepResult instant />);
    expect((await screen.findByRole("link", { name: /열어 둔 풀이 보기/ })).getAttribute("href")).toBe(`/chapter/${ID}`);
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("binds the draw on 409 opened too", async () => {
    const saved = { id: ID, createdAt: Date.now(), chapter: { kind: "tarot-deep", question: "q", conditions: [], note: "", cards: DRAWN, reading: READING, chapterToken: "c", createdAt: 1, turns: [], followUpsLeft: 5 } };
    stub({
      teaser: [() => Response.json({ preview: PREVIEW })],
      reading: [() => Response.json({ code: "NOT_AVAILABLE", reason: "opened", readingId: ID }, { status: 409 })],
      readings: () => Response.json({ readings: [saved], next: null }),
    });
    render(<DeepResult instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).draw.chapterId).toBe(ID);
  });

  it("sends a flow without its ten cards to the draw, one without a question to the ten-card builder, and a standard flow to the standard screen", async () => {
    stub({});
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...FLOW, draw: undefined, savedAt: Date.now() }));
    const { unmount } = render(<DeepResult instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tarot/draw?instant=1"));
    unmount();
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ conditions: {}, note: "", spread: "deep", savedAt: Date.now() }));
    const second = render(<DeepResult instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tarot/new?spread=deep"));
    second.unmount();
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...FLOW, spread: undefined, savedAt: Date.now() }));
    render(<DeepResult instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tarot/result?instant=1"));
  });
});
