// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("opens in its own layout with its five follow-ups still open after the standard 7 days (30 for premium), and no share yet", () => {
    seed([YEAR]);
    render(<LocalChapter id="year0001" />);
    expect(screen.getByRole("heading", { level: 1, name: "2027년, 차근차근 쌓아 가는 해" })).toBeTruthy();
    expect(screen.getByText(/^2027 신년운세 · /)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "1월 · 신축월" })).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("3월에는 무엇을 하면 좋을까요?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /공유하기/ })).toBeNull();
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
});
