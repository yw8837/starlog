// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDS, TEMPLATES } from "@starlog/core";
import { resetAccountForTests } from "@/lib/account/client";
import { MATCH_FLOW_KEY } from "@/lib/premium/matchFlow";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { resetBotCheck } from "@/lib/reading/api";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, listChapters } from "@/lib/storage/chapters";
import { MatchPreview } from "./MatchPreview";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26 };
const DRAWN = TEMPLATES.match.positions.map((position, i) => ({ position, cardId: CARDS[i + 20]!.id, orientation: "upright" as const }));
const FLOW = { me: DEFAULT_SAJU_FORM, meStatus: { loveStatus: "single" }, partner: PARTNER, partnerLabel: "민지", relation: "friend", concern: "요즘 연락이 뜸해요", ack: true, draw: { drawToken: "signed.match.draw", cards: DRAWN } };
const ID = "abcdefghij0123456789";
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const chart = (image: string) => ({ pillars: [{ label: "일주", gz: "甲子", ko: "갑자" }], elements: { 목: 2, 화: 1, 토: 1, 금: 2, 수: 2 }, dayMaster: { display: "甲 갑목", image } });
const TOC = ["한 줄로 보면", "두 사람의 일간", "오행", "기둥 사이", "두 사람의 10년", ...DRAWN.map((c) => `${c.position} 카드`), "다섯 장의 연결", "사주와 카드", "이번 주 해 볼 일", "확인해 볼 신호"];
const PREVIEW = {
  facts: ["두 사람의 일간은 갑목과 경금이에요.", "오행은 서로 모자란 쪽을 채워요."],
  charts: { me: chart("큰 나무"), partner: chart("단단한 쇠") },
  cards: DRAWN.map((c) => ({ ...c, keyword: `${c.position} 열쇠` })),
  summary: { heading: "우리 사이 한눈에", body: "두 사람은 속도가 달라도 같은 쪽을 보고 있어요." },
  lockedToc: TOC,
};
const READING = {
  verdict: "속도를 맞춰 가요",
  saju: { dayMasters: section("일간"), elements: section("오행"), pillars: section("기둥"), luck: section("10년") },
  cards: DRAWN.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
  connection: section("연결"), bridge: section("사주와 카드"), action: section("해 볼 일"), observation: section("신호"), followUps: [],
};

function stub(reading: Array<() => Response> = [], teaser: () => Response = () => Response.json({ preview: PREVIEW })) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/premium/status") return Response.json({ products: [{ id: "match", open: true, visible: true, opensAt: null }] });
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [{ orderId: "o", productId: "match" }], opening: [] } });
    if (url === "/api/premium/match/teaser") return teaser();
    if (url === "/api/premium/match/reading") return reading.shift()!();
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

describe("우리 사이 궁합's preview (Task 20)", () => {
  it("shows both charts side by side, the computed lines, the five cards, the summary and the 14 locked headings", async () => {
    const fetchMock = stub();
    render(<MatchPreview instant />);
    expect(await screen.findByText(PREVIEW.summary.body)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "나" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "민지" })).toBeTruthy();
    expect(screen.getByText("단단한 쇠")).toBeTruthy();
    for (const fact of PREVIEW.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "카드 5장" })).getAllByRole("listitem")).toHaveLength(5);
    expect(within(screen.getByRole("region", { name: "이어지는 풀이" })).getAllByRole("listitem")).toHaveLength(14);
    expect(screen.getByText("소제목 14개 · 약 5,000자")).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/premium/match/teaser")!;
    expect(JSON.parse(String(init!.body))).toMatchObject({ me: { birth: DEFAULT_SAJU_FORM, loveStatus: "single" }, partner: { birth: PARTNER, label: "민지" }, relation: "friend", ack: true, drawToken: "signed.match.draw" });
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
    expect(chapter).toMatchObject({ kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요", partner: { birth: PARTNER }, serverId: ID });
    expect(chapter && "deck" in chapter).toBe(false); // the 1909 pictures the reading quotes
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

  it("sends a flow without its answers to the form and one without its five cards to the draw", async () => {
    stub();
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...FLOW, draw: undefined }));
    const { unmount } = render(<MatchPreview instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/premium/match/draw?instant=1"));
    unmount();
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...FLOW, relation: undefined }));
    render(<MatchPreview instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/premium/match/new"));
  });
});
