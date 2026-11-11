// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshAccount, resetAccountForTests } from "@/lib/account/client";
import { MATCH_FLOW_KEY, matchBody, type MatchFlow } from "@/lib/premium/matchFlow";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { resetBotCheck } from "@/lib/reading/api";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY, clearChapters, listChapters } from "@/lib/storage/chapters";
import { MatchPreview } from "./MatchPreview";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26 };
const FLOW = { me: DEFAULT_SAJU_FORM, meStatus: { loveStatus: "single" }, partner: PARTNER, partnerLabel: "민지", relation: "friend", concern: "요즘 연락이 뜸해요", ack: true };
const ID = "abcdefghij0123456789";
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const chart = (image: string) => ({ pillars: [{ label: "일주", gz: "甲子", ko: "갑자" }], elements: { 목: 2, 화: 1, 토: 1, 금: 2, 수: 2 }, dayMaster: { display: "甲 갑목", image } });
const BANDS = ["2026년 10월~12월", "2027년 1월~3월", "2027년 4월~6월", "2027년 7월~9월"];
const TOC = ["한 줄로 보면", "두 사람의 일간", "오행", "기둥 사이", "두 사람의 10년", ...BANDS, "서로에게 맞는 말과 행동", "서로 피하면 좋은 말과 행동", "오늘 해 볼 일", "몇 주 안에 확인해 볼 신호"];
const PREVIEW = {
  facts: ["두 사람의 일간은 갑목과 경금이에요.", "오행은 서로 모자란 쪽을 채워요."],
  charts: { me: chart("큰 나무"), partner: chart("단단한 쇠") },
  summary: { heading: "우리 사이 한눈에", body: "두 사람은 속도가 달라도 같은 쪽을 보고 있어요." },
  lockedToc: TOC,
};
const READING = {
  verdict: "속도를 맞춰 가요",
  saju: { dayMasters: section("일간"), elements: section("오행"), pillars: section("기둥"), luck: section("10년") },
  periods: BANDS.map(section), together: section("서로에게 맞는 말과 행동"), avoid: section("서로 피하면 좋은 말과 행동"),
  action: section("오늘 해 볼 일"), observation: section("신호"), followUps: [],
};

function stub(
  reading: Array<() => Response> = [], teaser: () => Response = () => Response.json({ preview: PREVIEW }),
  readings: () => Response = () => Response.json({ readings: [], next: null }),
  token: () => Response = () => Response.json({ code: "BAD_TOKEN" }, { status: 400 }),
) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/premium/match/chapter") return token();
    if (url === "/api/premium/status") return Response.json({ products: [{ id: "match", open: true, visible: true, opensAt: null }] });
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [{ orderId: "o", productId: "match" }], opening: [] } });
    if (url === "/api/premium/match/teaser") return teaser();
    if (url === "/api/premium/match/reading") return reading.shift()!();
    if (url.startsWith("/api/readings")) return readings();
    return Response.json({ readings: [], next: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify(FLOW));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  resetBotCheck();
  sessionStorage.clear();
  clearChapters();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("프리미엄 궁합's preview (Task 20; saju only, owner 2026-10-17)", () => {
  it("shows both charts side by side, the computed lines, the summary and the 13 locked headings; no card anywhere", async () => {
    const fetchMock = stub();
    render(<MatchPreview instant />);
    expect(await screen.findByText(PREVIEW.summary.body)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "나" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "민지" })).toBeTruthy();
    expect(screen.getByText("단단한 쇠")).toBeTruthy();
    for (const fact of PREVIEW.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "카드 5장" })).toBeNull();
    expect(document.querySelectorAll("img[src*='/cards/']")).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "이어지는 풀이" })).getAllByRole("listitem")).toHaveLength(13);
    expect(screen.getByText("소제목 13개 · 3,100자 이상")).toBeTruthy();
    expect(document.body.textContent).toContain("2단계 중 2/2단계");
    // 신고 on the AI-written preview, the Starlog app only (W2 follow-up 3)
    expect(screen.getByRole("button", { name: "신고" }).closest(".app-only")).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/premium/match/teaser")!;
    expect(JSON.parse(String(init!.body))).toEqual({ me: { birth: DEFAULT_SAJU_FORM, loveStatus: "single" }, partner: { birth: PARTNER, label: "민지" }, relation: "friend", concern: "요즘 연락이 뜸해요", ack: true });
  });

  it("writes and keeps the reading with no cards or card design: every request is the form's answers only", async () => {
    const fetchMock = stub([
      () => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }),
      () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
    ]);
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    const sent = fetchMock.mock.calls.filter(([url]) => url === "/api/premium/match/teaser" || url === "/api/premium/match/reading").map(([, init]) => JSON.parse(String(init!.body)));
    expect(sent).toHaveLength(3);
    for (const body of sent) expect(Object.keys(body).filter((k) => /draw|deck|card/i.test(k))).toEqual([]);
    const [chapter] = listChapters();
    expect(chapter).not.toHaveProperty("cards");
    expect(chapter).not.toHaveProperty("deck");
  });

  it("after the reading is saved, the partner's birth leaves the tab: the flow and the preview kept for it are gone", async () => {
    stub([
      () => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }),
      () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
    ]);
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(sessionStorage.getItem(MATCH_FLOW_KEY)).toBeNull();
    expect(sessionStorage.getItem("starlog.teaser.premium")).toBeNull();
    const [chapter] = listChapters();
    expect(chapter).toMatchObject({ kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요", serverId: ID });
    // Owner 2026-10-16: the partner's birth is never kept as text on the device either (only sealed, inside the token).
    expect(chapter).not.toHaveProperty("partner");
    expect(localStorage.getItem(CHAPTERS_KEY)).not.toContain('"year":1992');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("lets a buyer open the purchase when the free preview cannot be written, then forgets the partner as usual", async () => {
    stub(
      [
        () => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }),
        () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
      ],
      () => Response.json({ code: "AI_UNAVAILABLE", reason: "budget" }, { status: 503 }),
    );
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(listChapters()[0]).toMatchObject({ kind: "match", serverId: ID });
    expect(sessionStorage.getItem(MATCH_FLOW_KEY)).toBeNull();
  });

  it("forgets the partner on both recovery paths too: cut off but delivered, and 409 opened (the flow, the preview, the resume token)", async () => {
    const saved = {
      id: ID, createdAt: Date.now(),
      chapter: { kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요", me: { birth: DEFAULT_SAJU_FORM }, reading: READING, chapterToken: "", createdAt: 1, turns: [], followUpsLeft: 3 },
    };
    const leftovers = () => [MATCH_FLOW_KEY, "starlog.teaser.premium", "starlog.premium-resume.match"].map((key) => sessionStorage.getItem(key));
    stub(
      [() => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }), () => Response.json({ code: "UPSTREAM" }, { status: 502 })],
      undefined,
      () => Response.json({ readings: [saved], next: null }),
    );
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(leftovers()).toEqual([null, null, null]);
    cleanup();
    resetAccountForTests();
    router.push.mockReset();

    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify(FLOW));
    stub([() => Response.json({ code: "NOT_AVAILABLE", reason: "opened", readingId: ID }, { status: 409 })], undefined, () => Response.json({ readings: [saved], next: null }));
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(leftovers()).toEqual([null, null, null]);
  });

  it("gets the chapter token again on both recovery paths before forgetting the partner: the tab's input and its last resume token (review 2026-10-17 H3)", async () => {
    const saved = {
      id: ID, createdAt: Date.now(),
      chapter: { kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요", me: { birth: DEFAULT_SAJU_FORM }, reading: READING, chapterToken: "", createdAt: 1, turns: [], followUpsLeft: 3 },
    };
    const issued = () => Response.json({ chapterToken: "issued.token", followUpsLeft: 3 });
    const sent = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([url]) => url === "/api/premium/match/chapter").map(([, init]) => JSON.parse(String(init!.body)));
    const input = matchBody(FLOW as unknown as MatchFlow);

    // Cut off on the last part, then found delivered in the account.
    let fetchMock = stub(
      [() => Response.json({ status: "continue", resume: "r1", done: 1, of: 2 }), () => Response.json({ code: "UPSTREAM" }, { status: 502 })],
      undefined, () => Response.json({ readings: [saved], next: null }), issued,
    );
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(sent(fetchMock)).toEqual([{ readingId: ID, resume: "r1", input }]);
    expect(listChapters()[0]).toMatchObject({ serverId: ID, chapterToken: "issued.token", followUpsLeft: 3 });
    expect(sessionStorage.getItem("starlog.premium-resume.match")).toBeNull();
    cleanup();
    resetAccountForTests();
    clearChapters();
    router.push.mockReset();

    // The last part's token sent again after delivery: 409 opened.
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify(FLOW));
    sessionStorage.setItem("starlog.premium-resume.match", JSON.stringify({ input: JSON.stringify(input), resume: "r2", done: 1 }));
    fetchMock = stub([() => Response.json({ code: "NOT_AVAILABLE", reason: "opened", readingId: ID }, { status: 409 })], undefined, () => Response.json({ readings: [saved], next: null }), issued);
    render(<MatchPreview instant />);
    fireEvent.click(await screen.findByRole("button", { name: "이어서 받기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(sent(fetchMock)).toEqual([{ readingId: ID, resume: "r2", input }]);
    expect(listChapters()[0]).toMatchObject({ serverId: ID, chapterToken: "issued.token" });
    expect(sessionStorage.getItem(MATCH_FLOW_KEY)).toBeNull();
  });

  it("sends a flow without its answers to the form, and previews an older tab's flow that still holds five cards without them", async () => {
    const fetchMock = stub();
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...FLOW, draw: { drawToken: "signed.match.draw", cards: [{ position: "나의 마음", cardId: "cups-01", orientation: "upright" }] } }));
    const { unmount } = render(<MatchPreview instant />);
    expect(await screen.findByText(PREVIEW.summary.body)).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/premium/match/teaser")!;
    expect(JSON.parse(String(init!.body))).not.toHaveProperty("drawToken");
    expect(router.replace).not.toHaveBeenCalled();
    unmount();
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...FLOW, relation: undefined }));
    render(<MatchPreview instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/premium/match/new"));
  });
});

describe("MatchPreview with a preview kept in this tab (owner 2026-11-05)", () => {
  it("without a session: hidden behind the login and kept; with a session it shows again", async () => {
    stub();
    render(<MatchPreview instant />);
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    const kept = sessionStorage.getItem("starlog.teaser.premium");
    expect(kept).toContain("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    cleanup();
    resetAccountForTests();
    resetPremiumStatusForTests();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: null });
      if (url === "/api/premium/match/teaser") return Response.json({ code: "LOGIN_REQUIRED", reason: "teaser", message: "x" }, { status: 401 });
      if (url === "/api/premium/status") return Response.json({ products: [] });
      return Response.json({ readings: [], next: null });
    }));
    render(<MatchPreview instant />);
    await screen.findByRole("region", { name: "미리보기는 로그인하고 볼 수 있어요" });
    expect(document.body.textContent).not.toContain("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    expect(sessionStorage.getItem("starlog.teaser.premium")).toBe(kept);
    cleanup();
    resetAccountForTests();
    resetPremiumStatusForTests();
    stub();
    render(<MatchPreview instant />);
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
  });
});

describe("MatchPreview when the session could not be checked and a preview is kept (code review 2026-11-05)", () => {
  it("shows no preview, spends none, and 다시 시도 asks again", async () => {
    stub();
    render(<MatchPreview instant />);
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    cleanup();
    resetAccountForTests();
    resetPremiumStatusForTests();
    let me: () => Response = () => new Response("", { status: 503 });
    const asked = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/me") return me();
      if (url === "/api/premium/match/teaser") asked();
      if (url === "/api/premium/status") return Response.json({ products: [] });
      return Response.json({ readings: [], next: null });
    }));
    render(<MatchPreview instant />);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(document.body.textContent).not.toContain("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    expect(asked).not.toHaveBeenCalled();
    me = () => Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } });
    fireEvent.click(retry);
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("MatchPreview once the viewer is confirmed a visitor, after its preview was written here (code review 2026-11-06)", () => {
  const written = async () => {
    let me: () => Response = () => Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } });
    const base = stub();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url === "/api/me" ? me() : base(url, init))));
    render(<MatchPreview instant />);
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    return { answer: (next: () => Response) => (me = next), asks: () => base.mock.calls.filter(([url]) => url === "/api/premium/match/teaser").length };
  };

  it("hides it behind the login and asks nothing again; a login brings the same one back", async () => {
    const { answer, asks } = await written();
    answer(() => Response.json({ payments: true, login: true, owner: false, user: null }));
    await act(async () => {
      await refreshAccount();
    });
    await screen.findByRole("region", { name: "미리보기는 로그인하고 볼 수 있어요" });
    expect(document.body.textContent).not.toContain("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    answer(() => Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } }));
    await act(async () => {
      await refreshAccount();
    });
    await screen.findByText("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    expect(asks()).toBe(1);
  });

  it("keeps what was just received when /api/me failed: only a real answer changes what shows", async () => {
    const { answer, asks } = await written();
    answer(() => new Response("", { status: 503 }));
    await act(async () => {
      await refreshAccount();
    });
    expect(document.body.textContent).toContain("두 사람은 속도가 달라도 같은 쪽을 보고 있어요.");
    expect(asks()).toBe(1);
  });
});
