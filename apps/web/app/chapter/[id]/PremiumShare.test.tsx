// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { LocalChapter } from "./LocalChapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

/** A premium record's share (plan task 23): the image route gets the allowed fields only, the link is the product page. */

const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));
const POS10 = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
const CARDS10 = POS10.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: i === 1 ? "reversed" : "upright", keyword: "열쇠" }));
const DEEP = {
  id: "deep0001", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 5, kind: "tarot-deep", question: "그 사람에게 연락해도 될까?", conditions: [], note: "비밀 메모", cards: CARDS10,
  reading: {
    verdict: "천천히 가도 괜찮아요", positions: CARDS10.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
    staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};
const SAJU = { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("기둥 사이"), luck: section("두 사람의 10년") };
const MATCH = {
  id: "match0001", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 3, kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요",
  me: { birth: DEFAULT_SAJU_FORM },
  reading: {
    verdict: "속도를 맞춰 가요", saju: SAJU, periods: ["2026년 10월~12월", "2027년 1월~3월", "2027년 4월~6월", "2027년 7월~9월"].map(section),
    together: section("서로에게 맞는 말과 행동"), avoid: section("서로 피하면 좋은 말과 행동"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};
const POS5 = ["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"];
const CARDS5 = POS5.map((position, i) => ({ position, cardId: `wands-0${i + 1}`, orientation: "upright" }));
/** One written with five cards before the 궁합 became saju only. */
const LEGACY_MATCH = {
  ...MATCH, id: "match0002", cards: CARDS5,
  reading: {
    verdict: "속도를 맞춰 가요", saju: SAJU, cards: CARDS5.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    connection: section("다섯 장의 연결"), bridge: section("사주와 카드"), action: section("이번 주 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};
const YEAR = {
  id: "year0001", createdAt: Date.now(), chapterToken: "t", turns: [], followUpsLeft: 5, kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: "차근차근 쌓아 가는 해",
  reading: {
    title: "차근차근 쌓아 가는 해", overview: section("2027 정미년과 나의 명식"), luck: section("지금의 10년 속 2027년"),
    areas: { heading: "영역별로 보면", work: section("일"), money: section("돈"), relations: section("관계"), health: section("몸과 생활 리듬") },
    lucky: section("2027년을 가볍게 돕는 것"), months: [{ month: 1, heading: "1월", body: "본문이에요." }], closing: section("한 해를 보내는 방법"), observation: section("첫 달에 확인해 볼 신호"), followUps: [],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function sharedBody(id: string): Promise<{ url: string; body: Record<string, unknown> }> {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
  vi.stubGlobal("fetch", fetchMock);
  render(<LocalChapter id={id} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "이미지로 공유" }));
  });
  const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/og/premium") as unknown as [string, RequestInit];
  return { url: call[0], body: JSON.parse(String(call[1].body)) as Record<string, unknown> };
}

describe("sharing a premium record", () => {
  it("켈틱 크로스 10장: the ten cards and their directions only, never the question or the note", async () => {
    seed([DEEP]);
    const { body } = await sharedBody("deep0001");
    expect(body).toEqual({ product: "tarot-deep", cards: CARDS10.map(({ cardId, orientation }) => ({ cardId, orientation })) });
  });

  it("궁합: the relation only (saju only, owner 2026-10-17), never the label, the concern or a birth; one written with cards too", async () => {
    seed([MATCH, LEGACY_MATCH]);
    expect((await sharedBody("match0001")).body).toEqual({ product: "match", relation: "friend" });
    cleanup();
    expect((await sharedBody("match0002")).body).toEqual({ product: "match", relation: "friend" });
  });

  it("신년운세: the year's own title only; a title the image would refuse means no share button", async () => {
    seed([YEAR]);
    const { body } = await sharedBody("year0001");
    expect(body).toEqual({ product: "newyear-2027", title: "차근차근 쌓아 가는 해" });
    cleanup();
    seed([{ ...YEAR, id: "year0002", title: "2027! 좋은 해", reading: { ...YEAR.reading, title: "2027! 좋은 해" } }]);
    render(<LocalChapter id="year0002" />);
    expect(screen.queryByRole("button", { name: "이미지로 공유" })).toBeNull();
  });
});
