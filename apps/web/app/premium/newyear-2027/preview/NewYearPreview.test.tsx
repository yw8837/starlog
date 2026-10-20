// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { resetBotCheck } from "@/lib/reading/api";
import { SAJU_CONTEXT_KEY, SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { clearChapters, listChapters, saveChapter } from "@/lib/storage/chapters";
import { NewYearPreview } from "./NewYearPreview";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ID = "abcdefghij0123456789";
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const TOC = ["2027 정미년과 나의 명식", "지금의 10년 속 2027년", "일", "돈", "관계", "몸과 생활 리듬", "2027년을 가볍게 돕는 것", ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`), "한 해를 보내는 방법", "첫 달에 확인해 볼 신호"];
const PREVIEW = {
  title: "차근차근 쌓아 가는 해",
  facts: ["2027년은 丁未년이에요.", "지금 지나는 10년은 …", "2027년에 힘을 보태는 기운은 …"],
  summary: { heading: "2027년 미리 보기", body: "한 걸음씩 다지면 연말에 손에 남는 게 많은 해예요." },
  lockedToc: TOC,
};
const READING = {
  title: "차근차근 쌓아 가는 해", overview: section("2027 정미년과 나의 명식"), luck: section("지금의 10년 속 2027년"),
  areas: { heading: "영역별로 보면", work: section("일"), money: section("돈"), relations: section("관계"), health: section("몸과 생활 리듬") },
  lucky: section("2027년을 가볍게 돕는 것"), months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, heading: `${i + 1}월`, body: "본문이에요." })),
  closing: section("한 해를 보내는 방법"), observation: section("첫 달에 확인해 볼 신호"), followUps: [],
};

function stub(teaser: () => Response, reading: Array<() => Response> = [], unused: Array<{ orderId: string; productId: string }> = [{ orderId: "o", productId: "newyear-2027" }]) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/premium/status") return Response.json({ products: [{ id: "newyear-2027", open: true, visible: true, opensAt: Date.parse("2026-11-15T00:00:00+09:00") }] });
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused, opening: [] } });
    if (url === "/api/premium/newyear-2027/teaser") return teaser();
    if (url === "/api/premium/newyear-2027/reading") return reading.shift()!();
    return Response.json({ readings: [], next: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(DEFAULT_SAJU_FORM));
  localStorage.setItem(SAJU_CONTEXT_KEY, JSON.stringify({ workStatus: "employee", savedAt: Date.now() }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  resetBotCheck();
  localStorage.clear();
  sessionStorage.clear();
  clearChapters();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("2027 신년운세's preview (Task 21)", () => {
  it("shows the year's theme, the three computed lines, the summary and the 21 locked headings", async () => {
    const fetchMock = stub(() => Response.json({ preview: PREVIEW }));
    render(<NewYearPreview />);
    expect(await screen.findByRole("heading", { level: 1, name: "2027년, 차근차근 쌓아 가는 해" })).toBeTruthy();
    for (const fact of PREVIEW.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(screen.getByText(PREVIEW.summary.body)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "이어지는 풀이" })).getAllByRole("listitem")).toHaveLength(21);
    expect(screen.getByText("소제목 21개 · 약 6,800자")).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/premium/newyear-2027/teaser")!;
    expect(JSON.parse(String(init!.body))).toEqual({ birth: DEFAULT_SAJU_FORM, workStatus: "employee" });
  });

  it("on sale now with no opening date (owner 2026-10-20): a 409 from the preview is its error, never an opening date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-20T12:00:00+09:00"));
    stub(() => Response.json({ code: "NOT_AVAILABLE" }, { status: 409 }), [], []);
    render(<NewYearPreview />);
    expect((await screen.findAllByText("지금은 열 수 없는 상품이에요")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/열려요/)).toBeNull();
  });

  it("from 2026-11-15 00:00 KST a 409 is not its opening date any more (review 2026-10-16 #6): the preview's error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-20T12:00:00+09:00"));
    stub(() => Response.json({ code: "NOT_AVAILABLE" }, { status: 409 }), [], []);
    render(<NewYearPreview />);
    expect((await screen.findAllByText("지금은 열 수 없는 상품이에요")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/11월 15일 0시에 열려요/)).toBeNull();
  });

  it("writes the reading in three parts, sending each resume token in order, and opens the chapter", async () => {
    const fetchMock = stub(() => Response.json({ preview: PREVIEW }), [
      () => Response.json({ status: "continue", resume: "r1", done: 1, of: 3 }),
      () => Response.json({ status: "continue", resume: "r2", done: 2, of: 3 }),
      () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
    ]);
    render(<NewYearPreview />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    const sent = fetchMock.mock.calls.filter(([url]) => url === "/api/premium/newyear-2027/reading").map(([, init]) => JSON.parse(String(init!.body)));
    expect(sent.map((b) => b.resume)).toEqual([undefined, "r1", "r2"]);
    expect(sent.every((b) => b.unlock.method === "paid")).toBe(true);
    expect(listChapters()[0]).toMatchObject({ kind: "newyear-2027", title: "차근차근 쌓아 가는 해", context: { workStatus: "employee" }, serverId: ID });
  });

  it("lets a buyer open the purchase when the free preview cannot be written", async () => {
    stub(() => Response.json({ code: "BOT_CHECK_FAILED" }, { status: 403 }), [
      () => Response.json({ status: "continue", resume: "r1", done: 1, of: 3 }),
      () => Response.json({ status: "continue", resume: "r2", done: 2, of: 3 }),
      () => Response.json({ status: "done", reading: READING, chapterToken: "c1", readingId: ID }),
    ]);
    render(<NewYearPreview />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(listChapters()[0]).toMatchObject({ kind: "newyear-2027", serverId: ID });
  });

  it("after the year is opened, back on the preview it offers that reading, never the payment again", async () => {
    saveChapter({ kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: READING.title, reading: READING as never, chapterToken: "c", serverId: ID });
    stub(() => Response.json({ preview: PREVIEW }), [], []);
    render(<NewYearPreview />);
    expect((await screen.findByRole("link", { name: /열어 둔 풀이 보기/ })).getAttribute("href")).toMatch(/^\/chapter\//);
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("still opens a second purchase held for the same birth", async () => {
    saveChapter({ kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: READING.title, reading: READING as never, chapterToken: "c", serverId: ID });
    stub(() => Response.json({ preview: PREVIEW }));
    render(<NewYearPreview />);
    expect(await screen.findByRole("button", { name: "결제한 풀이 열기" })).toBeTruthy();
  });

  it("sends a visit without a saved birth to the form", async () => {
    localStorage.removeItem(SAJU_PROFILE_KEY);
    stub(() => Response.json({ preview: PREVIEW }));
    render(<NewYearPreview />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/premium/newyear-2027/new"));
  });
});
