// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankingRowView, RankingView as Ranking } from "@/lib/bonds/service";
import { Board, MyCard } from "./RankingView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

const rows = (n: number, mineAt?: number): RankingRowView[] =>
  Array.from({ length: n }, (_, i) => ({ rank: i + 1, nickname: `별${i + 1}`, total: 500 - i * 5, completedAt: 1, mine: i + 1 === mineAt }));

const VIEW: Ranking = { all: [], mine: null, filling: null, owner: null, invite: null };

const OWNER = { nickname: "용우", rankingPublic: true, refillReadyAt: null };

const mine = (total: number, allRank: number | null): Ranking["mine"] => ({
  row: { id: "c1", sign: "aries", status: "complete", total, startedAt: 1, completedAt: 2 },
  stars: [],
  allRank,
});

const show = (data: Ranking) => render(<Board sign="aries" data={data} error="" reload={() => undefined} />);

const myBox = () => screen.getByRole("region", { name: "내 순위" });

describe("별자리 랭킹 board (/ranking/<sign>)", () => {
  it("puts 1~3위 on the podium in rank order (1위 in the middle) and lists 4~50위 below", () => {
    show({ ...VIEW, all: rows(50) });
    const podium = screen.getByRole("list", { name: "1~3위" });
    const places = within(podium).getAllByRole("listitem");
    expect(places.map((li) => li.getAttribute("data-place"))).toEqual(["first", "second", "third"]);
    places.forEach((li, i) => {
      expect(li.textContent).toContain(`${i + 1}위 별${i + 1}인연 ${500 - i * 5}점`);
      // a gold, silver or bronze medal over the name
      expect(li.querySelector("svg[data-rank]")?.getAttribute("data-rank")).toBe(String(i + 1));
    });
    // the sign's constellation behind the podium: decorative, one star per catalog star (양자리: 4)
    const backdrop = podium.parentElement!.querySelector(":scope > svg")!;
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop.querySelectorAll("line")).toHaveLength(3);
    const list = screen.getByRole("list", { name: "4~50위" });
    expect(list.getAttribute("start")).toBe("4");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(47);
    expect(items[0]!.textContent).toBe("4위별4인연 485점");
    expect(items.at(-1)!.textContent).toBe("50위별50인연 255점");
  });

  it("is one all-time board: no tabs, no weekly or hall-of-fame wording, nothing about a Monday restart", () => {
    show({ ...VIEW, all: rows(5), owner: OWNER, mine: mine(485, 4) });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(document.body.textContent).not.toMatch(/이번 주|명예의 전당|월요일|새로 시작/);
    expect(screen.queryByRole("button", { name: /명예의 전당/ })).toBeNull();
  });

  it("shows 내 순위 even far outside the top 50, without marking anyone in the list", () => {
    show({ ...VIEW, all: rows(50), owner: OWNER, mine: mine(285, 63) });
    expect(myBox().textContent).toContain("내 순위63위인연 285점");
    expect(myBox().textContent).toContain("1위와 215점 차이예요");
    expect(myBox().getAttribute("data-state")).toBe("ranked");
    expect(document.querySelectorAll("li[data-mine]")).toHaveLength(0);
  });

  it("highlights my own row in place anywhere in the top 50, down to 50위", () => {
    show({ ...VIEW, all: rows(50, 6), owner: OWNER, mine: mine(475, 6) });
    const marked = document.querySelectorAll("li[data-mine]");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("별6나");
    expect(myBox().textContent).toContain("6위");
    cleanup();
    show({ ...VIEW, all: rows(50, 50), owner: OWNER, mine: mine(255, 50) });
    expect(within(screen.getByRole("list", { name: "4~50위" })).getAllByRole("listitem").at(-1)!.hasAttribute("data-mine")).toBe(true);
    expect(myBox().textContent).toContain("내 순위50위");
  });

  it("marks 1위 on the podium and says so in 내 순위", () => {
    show({ ...VIEW, all: rows(3, 1), owner: OWNER, mine: mine(500, 1) });
    expect(screen.getByRole("list", { name: "1~3위" }).querySelector("[data-place='first']")!.hasAttribute("data-mine")).toBe(true);
    expect(myBox().textContent).toContain("1위예요");
  });

  it("still shows my total while a complete, public record is not counted yet", () => {
    show({ ...VIEW, all: rows(5), owner: OWNER, mine: mine(490, null) });
    expect(myBox().textContent).toContain("내 양자리인연 490점");
    expect(myBox().getAttribute("data-state")).toBeNull();
  });

  it("says the name is kept off the rankings, with the switch to put it on", () => {
    show({ ...VIEW, all: rows(4), owner: { ...OWNER, rankingPublic: false }, mine: mine(300, null) });
    expect(myBox().textContent).toContain("랭킹에 이름을 올리지 않았어요");
    expect(myBox().textContent).toContain("켜면 내 순위가 여기에 떠요.");
    expect(within(myBox()).getByRole("checkbox", { name: "랭킹에 내 이름 올리기" })).toBeTruthy();
    expect(myBox().getAttribute("data-state")).toBeNull();
  });

  it("never says nobody has completed the sign to someone who has, with the name kept off an empty board", () => {
    show({ ...VIEW, owner: { ...OWNER, rankingPublic: false }, mine: mine(300, null) });
    expect(document.body.textContent).not.toContain("완성한 사람이 없어요");
    expect(screen.getByRole("list", { name: "1~3위", hidden: true }).querySelectorAll("li")).toHaveLength(3);
    expect(myBox().textContent).toContain("랭킹에 이름을 올리지 않았어요");
  });

  it("keeps an empty board friendly: empty podium, an all-time line and 이 별자리 채우기 for a visitor", () => {
    show(VIEW);
    const places = screen.getByRole("list", { name: "1~3위", hidden: true }).querySelectorAll("li");
    expect([...places].every((li) => li.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(screen.getByText("아직 양자리를 완성한 사람이 없어요. 첫 번째가 되어 보세요.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: /4~/ })).toBeNull();
    expect(myBox().textContent).toContain("완성하면 여기에 순위가 떠요");
    expect(within(myBox()).getByRole("link", { name: "이 별자리 채우기" }).getAttribute("href")).toBe("/bonds?sign=aries");
    expect(screen.queryByRole("button", { name: /명예의 전당/ })).toBeNull();
  });

  it("shows progress instead of a second start button while this device fills a sign", () => {
    show({ ...VIEW, owner: OWNER, filling: { sign: "aries", filled: 2, total: 120 } });
    expect(myBox().textContent).toContain("지금 별 2/4개예요.");
    expect(within(myBox()).queryByRole("button", { name: "이 별자리 채우기" })).toBeNull();
    cleanup();
    show({ ...VIEW, owner: OWNER, filling: { sign: "leo", filled: 1, total: 60 } });
    expect(myBox().textContent).toContain("지금은 사자자리를 채우는 중이에요.");
  });
});

describe("podium medals", () => {
  const PLACES = [
    { place: "first", name: "1위 금메달", digit: "1" },
    { place: "second", name: "2위 은메달", digit: "2" },
    { place: "third", name: "3위 동메달", digit: "3" },
  ] as const;
  const placeEl = (place: string) => document.querySelector<HTMLElement>(`li[data-place='${place}']`)!;
  const medalOf = (place: string) => placeEl(place).querySelector<SVGElement>("svg[data-rank]")!;

  /** Roughly what a screen reader says for `el`: its text and image labels, nothing under aria-hidden. */
  const spoken = (el: Element): string => {
    if (el.getAttribute("aria-hidden") === "true") return "";
    if (el.getAttribute("role") === "img") return ` ${el.getAttribute("aria-label") ?? ""} `;
    return [...el.childNodes].map((n) => (n instanceof Element ? spoken(n) : n.nodeType === Node.TEXT_NODE ? n.textContent : "")).join("");
  };

  it("hangs a gold, a silver and a bronze medal on 1위 (middle), 2위 (left) and 3위 (right), at full colour with the entry", () => {
    show({ ...VIEW, all: rows(3) });
    const stops: string[] = [];
    for (const { place, digit } of PLACES) {
      const medal = medalOf(place);
      expect(medal.getAttribute("data-rank")).toBe(digit);
      expect(medal.hasAttribute("data-empty")).toBe(false);
      // a ribbon V (two straps), a round disc and the number
      expect(medal.querySelectorAll("path[fill^='url(']")).toHaveLength(2);
      expect(medal.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1);
      expect(medal.textContent).toBe(digit);
      // the entry (name and total) is on the same place
      expect(placeEl(place).textContent).toContain(`${digit}위 별${digit}`);
      stops.push([...medal.querySelectorAll("stop")].map((el) => el.getAttribute("stop-color")).join(","));
    }
    // three different metals
    expect(new Set(stops).size).toBe(3);
  });

  it("reads a held place's rank once: the name already says N위, so its medal is hidden from assistive tech", () => {
    show({ ...VIEW, all: rows(3) });
    for (const { place, digit } of PLACES) {
      expect(medalOf(place).getAttribute("aria-hidden")).toBe("true");
      expect(spoken(placeEl(place)).match(new RegExp(`${digit}위`, "g"))).toHaveLength(1);
    }
    expect(screen.queryAllByRole("img", { name: /메달$/ })).toHaveLength(0);
    // reading order is 1, 2, 3; the layout puts 2위 on the left, 1위 in the middle, 3위 on the right
    const podium = screen.getByRole("list", { name: "1~3위" });
    expect(within(podium).getAllByRole("listitem").map((li) => spoken(li).match(/\d위/)![0])).toEqual(["1위", "2위", "3위"]);
  });

  it("keeps all three medals on an empty podium, where the dashed circle was, dimmed, under 빈 자리", () => {
    show(VIEW);
    for (const { place, name, digit } of PLACES) {
      const li = placeEl(place);
      expect(li.getAttribute("aria-hidden")).toBe("true");
      expect(li.textContent).toContain("빈 자리");
      const medal = within(li).getByRole("img", { name, hidden: true });
      expect(medal.getAttribute("data-rank")).toBe(digit);
      expect(medal.hasAttribute("data-empty")).toBe(true);
      // the medal is the step's only content: no dashed circle left beside it
      expect(medal.parentElement!.children).toHaveLength(1);
    }
  });

  it("dims only the places nobody holds yet, whose medals keep their names", () => {
    show({ ...VIEW, all: rows(1) });
    expect(medalOf("first").hasAttribute("data-empty")).toBe(false);
    expect(medalOf("first").getAttribute("aria-hidden")).toBe("true");
    expect(within(placeEl("second")).getByRole("img", { name: "2위 은메달", hidden: true }).hasAttribute("data-empty")).toBe(true);
    expect(within(placeEl("third")).getByRole("img", { name: "3위 동메달", hidden: true }).hasAttribute("data-empty")).toBe(true);
  });
});

describe("my completed constellation beside the board", () => {
  const card = (data: Ranking) => render(<MyCard sign="aries" data={data} reload={() => undefined} />);

  it("offers 내 순위 공유하기 only while I hold an all-time rank on the public ranking, else the plain 공유하기", () => {
    card({ ...VIEW, all: rows(5), owner: OWNER, mine: mine(485, 4) });
    expect(screen.getByRole("button", { name: "내 순위 공유하기" })).toBeTruthy();
    for (const data of [
      // complete and public, not counted yet
      { ...VIEW, all: rows(5), owner: OWNER, mine: mine(490, null) },
      // kept off the rankings
      { ...VIEW, owner: { ...OWNER, rankingPublic: false }, mine: mine(300, null) },
      // a rank read just before the name went off
      { ...VIEW, all: rows(5), owner: { ...OWNER, rankingPublic: false }, mine: mine(485, 4) },
    ]) {
      cleanup();
      card(data);
      expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "내 순위 공유하기" })).toBeNull();
    }
  });
});
