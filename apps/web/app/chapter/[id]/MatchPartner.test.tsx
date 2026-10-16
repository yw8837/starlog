// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY, listChapters } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

/**
 * Owner 2026-10-16: the 궁합 partner lives on the device only as the sealed part of the chapter token, for the 30
 * follow-up days; a copy synced from the account has no token and asks nothing; the record shows no partner chart.
 */

const DAY = 24 * 60 * 60 * 1000;
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const POS = ["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"];
const CARDS = POS.map((position, i) => ({ position, cardId: `wands-0${i + 1}`, orientation: "upright" }));
const MATCH = {
  id: "match0001", createdAt: Date.now() - 3 * DAY, chapterToken: "sealed.token", turns: [], followUpsLeft: 5,
  kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", me: { birth: DEFAULT_SAJU_FORM }, cards: CARDS,
  reading: {
    verdict: "속도를 맞춰 가요", saju: { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("기둥 사이"), luck: section("두 사람의 10년") },
    cards: CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    connection: section("다섯 장의 연결"), bridge: section("사주와 카드"), action: section("이번 주 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};
const PARTNER_BIRTH = { ...DEFAULT_SAJU_FORM, year: 1987, month: 7, day: 13 };
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));
const raw = () => localStorage.getItem(CHAPTERS_KEY) ?? "";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a 궁합 record and its partner (owner 2026-10-16)", () => {
  it("asks follow-ups on the device that wrote it, within its 30 days", () => {
    seed([MATCH]);
    render(<LocalChapter id="match0001" />);
    expect(screen.getByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeTruthy();
    // The line above the title says the date only: the product's name is in the title already (coordinator 2026-10-17).
    expect(screen.getByRole("heading", { level: 1 }).parentElement?.textContent?.match(/프리미엄 궁합/g)).toHaveLength(1);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("asks nothing on a copy synced from the account (no token) and says where it can be asked", () => {
    seed([{ ...MATCH, chapterToken: "", serverId: "abcdefghij0123456789" }]);
    render(<LocalChapter id="match0001" />);
    expect(screen.getByText("이어서 물어보기는 풀이한 기기에서만 돼요.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("drops the sealed partner (the token) once its 30 days are over, when the record is opened", async () => {
    seed([{ ...MATCH, createdAt: Date.now() - 31 * DAY }]);
    render(<LocalChapter id="match0001" />);
    expect(screen.getByText("풀이를 연 지 30일이 지나 더 물어볼 수 없어요")).toBeTruthy();
    await waitFor(() => expect(listChapters()[0]?.chapterToken).toBe(""));
    expect(raw()).not.toContain("sealed.token");
  });

  it("reads an older record that still holds the partner's birth as text without it, and drops it from storage when it is opened, with that version's token (it held the birth too, review 2026-10-17 L1)", async () => {
    seed([{ ...MATCH, partner: { birth: PARTNER_BIRTH } }]);
    expect(listChapters()[0]).not.toHaveProperty("partner");
    render(<LocalChapter id="match0001" />);
    await waitFor(() => expect(raw()).not.toContain("1987"));
    expect(raw()).not.toContain("sealed.token");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("shows no chart beside the record, only the five cards (eight letters of a chart nearly give a birth date away)", () => {
    seed([MATCH]);
    const { container } = render(<LocalChapter id="match0001" />);
    expect(screen.queryByText("명식")).toBeNull();
    expect(container.textContent).not.toMatch(/1987|1990년/);
  });
});
