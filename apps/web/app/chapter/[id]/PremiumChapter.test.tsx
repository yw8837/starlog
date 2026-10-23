// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DECK_KEY } from "@/lib/deck";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

const DAY = 24 * 60 * 60 * 1000;
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));

const YEAR = {
  id: "year0001", createdAt: Date.now() - 20 * DAY, chapterToken: "t", turns: [], followUpsLeft: 5, kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: "차근차근 쌓아 가는 해",
  reading: {
    title: "차근차근 쌓아 가는 해", overview: section("2027 정미년과 나의 명식"), luck: section("지금의 10년 속 2027년"),
    areas: { heading: "영역별로 보면", work: section("일"), money: section("돈"), relations: section("관계"), health: section("몸과 생활 리듬") },
    lucky: section("2027년을 가볍게 돕는 것"), months: [{ month: 1, heading: "1월 · 신축월", body: "1월 본문이에요." }],
    closing: section("한 해를 보내는 방법"), observation: section("첫 달에 확인해 볼 신호"), followUps: ["3월에는 무엇을 하면 좋을까요?"],
  },
};

const POS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
const CARDS = POS.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: "upright" }));
const DEEP = {
  id: "deep0001", createdAt: Date.now() - 31 * DAY, chapterToken: "t", turns: [], followUpsLeft: 5, kind: "tarot-deep", question: "이번 달 내 재물 흐름은 어떨까?", conditions: [], note: "", cards: CARDS,
  reading: {
    verdict: "천천히 가도 괜찮아요", positions: CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
    staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a premium reading saved on this device", () => {
  it("opens in its own layout with its five follow-ups still open after the standard 7 days (30 for premium), and 공유하기 (owner 2026-10-23)", () => {
    seed([YEAR]);
    render(<LocalChapter id="year0001" />);
    expect(screen.getByRole("heading", { level: 1, name: "2027년, 차근차근 쌓아 가는 해" })).toBeTruthy();
    expect(screen.getByText(/^2027 신년운세 · /)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "1월 · 신축월" })).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("3월에는 무엇을 하면 좋을까요?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
  });

  it("shows the ten cards beside the 10-card reading and closes its questions after 30 days", () => {
    seed([DEEP]);
    render(<LocalChapter id="deep0001" />);
    expect(screen.getByRole("heading", { level: 1, name: "이번 달 내 재물 흐름은 어떨까?" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "카드 10장 배치" })).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByRole("list", { name: "카드 10장 배치" })).toHaveLength(1);
    expect(screen.getByText("풀이를 연 지 30일이 지나 더 물어볼 수 없어요")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens a 궁합 read from the two people's saju only (owner 2026-10-17): both parts, the four bands of the year, no cards and no chart beside it", () => {
    const bands = ["2026년 10월~12월", "2027년 1월~3월", "2027년 4월~6월", "2027년 7월~9월"];
    seed([{
      id: "pair0004", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 3, kind: "match", relation: "friend", relationLabel: "친구",
      me: { birth: DEFAULT_SAJU_FORM },
      reading: {
        verdict: "결론", saju: { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("두 일지"), luck: section("10년") },
        periods: bands.map(section), together: section("서로에게 맞는 말과 행동"), avoid: section("서로 피하면 좋은 말과 행동"),
        action: section("오늘 해 볼 일"), observation: section("몇 주 안에 확인해 볼 신호"), followUps: ["앞으로 석 달 먼저 해 볼 일은요?"],
      },
    }]);
    const { container } = render(<LocalChapter id="pair0004" />);
    expect(screen.getByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeTruthy();
    for (const name of ["사주로 본 두 사람", "앞으로 1년과 서로 대하는 법", ...bands, "서로에게 맞는 말과 행동", "서로 피하면 좋은 말과 행동", "오늘 해 볼 일"]) {
      expect(screen.getByRole("heading", { name }), name).toBeTruthy();
    }
    expect(container.querySelectorAll("img[src*='/cards/']")).toHaveLength(0);
    expect(screen.queryByRole("complementary", { name: "뽑은 카드" })).toBeNull();
    expect(screen.queryByText("명식")).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows a 궁합's five cards in the deck it recorded, and one saved before 궁합 kept its deck in the 1909 scans it was written for (owner 2026-10-17)", () => {
    const pair = {
      id: "pair0002", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 5, kind: "match", relation: "friend", relationLabel: "친구",
      me: { birth: DEFAULT_SAJU_FORM }, cards: CARDS.slice(0, 5),
      reading: {
        verdict: "결론", saju: { dayMasters: section("일간"), elements: section("오행"), pillars: section("기둥"), luck: section("10년") },
        cards: CARDS.slice(0, 5).map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
        connection: section("연결"), bridge: section("사주와 카드"), action: section("해 볼 일"), observation: section("신호"), followUps: [],
      },
    };
    const faces = (container: HTMLElement) => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes("cups-01"));
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "constellation" }));
    seed([{ ...pair, deck: "starlog" }, { ...pair, id: "pair0003" }]);
    let { container } = render(<LocalChapter id="pair0002" />);
    expect(screen.getByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeTruthy();
    expect(faces(container).length).toBeGreaterThan(0);
    for (const src of faces(container)) expect(src.startsWith("/cards/starlog/cups-01")).toBe(true);
    cleanup();
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "constellation" }));
    ({ container } = render(<LocalChapter id="pair0003" />));
    expect(faces(container).length).toBeGreaterThan(0);
    for (const src of faces(container)) expect(src.startsWith("/cards/cups-01")).toBe(true);
  });

  it("sends a record whose reading lost a part its page reads (or names a card no deck has) to the damaged-record screen, never a broken page", () => {
    const match = {
      id: "pair0001", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 5, kind: "match", relation: "friend", relationLabel: "친구",
      me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: DEFAULT_SAJU_FORM }, cards: CARDS.slice(0, 5),
      reading: {
        verdict: "결론", saju: { dayMasters: section("일간"), elements: section("오행"), pillars: section("기둥") },
        cards: CARDS.slice(0, 5).map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
        connection: section("연결"), bridge: section("사주와 카드"), action: section("해 볼 일"), observation: section("신호"), followUps: [],
      },
    };
    const broken = [
      { ...DEEP, id: "deep0002", reading: { ...DEEP.reading, axes: { vertical: section("세로"), horizontal: section("가로") } } },
      { ...DEEP, id: "deep0003", cards: [{ position: "지금의 나", cardId: "no-such-card", orientation: "upright" }] },
      { ...YEAR, id: "year0002", reading: { ...YEAR.reading, areas: { heading: "영역별로 보면" } } },
      match,
    ];
    seed(broken);
    for (const { id } of broken) {
      render(<LocalChapter id={id} />);
      expect(screen.getByRole("heading", { level: 1, name: "이 기록을 읽지 못했어요" }), id).toBeTruthy();
      cleanup();
    }
  });
});
