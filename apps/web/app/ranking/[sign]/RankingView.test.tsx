// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankingRowView, RankingView as Ranking } from "@/lib/bonds/service";
import { Board, type BoardTab } from "./RankingView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

const rows = (n: number, mineAt?: number): RankingRowView[] =>
  Array.from({ length: n }, (_, i) => ({ rank: i + 1, nickname: `별${i + 1}`, total: 500 - i * 5, completedAt: 1, mine: i + 1 === mineAt }));

const VIEW: Ranking = { week: [], all: [], mine: null, filling: null, owner: null, invite: null };

const OWNER = { nickname: "용우", rankingPublic: true, refillReadyAt: null };

const mine = (total: number, weekRank: number | null, allRank: number | null): Ranking["mine"] => ({
  row: { id: "c1", sign: "aries", status: "complete", total, startedAt: 1, completedAt: 2 },
  stars: [],
  weekRank,
  allRank,
});

function Harness({ data }: { data: Ranking }) {
  const [tab, setTab] = useState<BoardTab>("week");
  return <Board sign="aries" tab={tab} onTab={setTab} data={data} error="" reload={() => undefined} />;
}

const myBox = () => screen.getByRole("region", { name: "내 순위" });

describe("별자리 랭킹 board (/ranking/<sign>)", () => {
  it("puts 1~3위 on the podium in rank order (1위 in the middle) and lists 4~20위 below", () => {
    render(<Harness data={{ ...VIEW, week: rows(20), all: rows(20) }} />);
    const podium = screen.getByRole("list", { name: "1~3위" });
    const places = within(podium).getAllByRole("listitem");
    expect(places.map((li) => li.getAttribute("data-place"))).toEqual(["first", "second", "third"]);
    expect(places.map((li) => li.textContent)).toEqual(["1위 별1인연 500점1", "2위 별2인연 495점2", "3위 별3인연 490점3"]);
    // the lit figure only on the podium places that are taken
    expect(places[0]!.querySelector("svg")).not.toBeNull();
    const list = screen.getByRole("list", { name: "4~20위" });
    expect(list.getAttribute("start")).toBe("4");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(17);
    expect(items[0]!.textContent).toBe("4위별4인연 485점");
    expect(items.at(-1)!.textContent).toBe("20위별20인연 405점");
  });

  it("switches the same layout between 이번 주 and 명예의 전당, also with the arrow keys", () => {
    render(<Harness data={{ ...VIEW, week: rows(2), all: [{ rank: 1, nickname: "전설", total: 900, completedAt: 1, mine: false }] }} />);
    const week = screen.getByRole("tab", { name: "이번 주" });
    expect(week.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "이번 주" }).textContent).toContain("별2");
    fireEvent.keyDown(week, { key: "ArrowRight" });
    const all = screen.getByRole("tab", { name: "명예의 전당" });
    expect(all.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(all);
    const panel = screen.getByRole("tabpanel", { name: "명예의 전당" });
    expect(panel.textContent).toContain("전설");
    expect(panel.textContent).not.toContain("별2");
  });

  it("shows 내 순위 even far below the list, per tab, without marking anyone in the list", () => {
    render(<Harness data={{ ...VIEW, week: rows(20), all: rows(20), owner: OWNER, mine: mine(285, 37, 52) }} />);
    expect(myBox().textContent).toContain("내 순위37위인연 285점");
    expect(myBox().textContent).toContain("1위와 215점 차이예요");
    expect(myBox().getAttribute("data-state")).toBe("ranked");
    expect(document.querySelectorAll("li[data-mine]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: "명예의 전당" }));
    expect(myBox().textContent).toContain("52위");
  });

  it("highlights my own row in place when it is within the top 20", () => {
    render(<Harness data={{ ...VIEW, week: rows(20, 6), all: rows(20, 6), owner: OWNER, mine: mine(475, 6, 6) }} />);
    const marked = document.querySelectorAll("li[data-mine]");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("별6나");
    expect(myBox().textContent).toContain("6위");
  });

  it("marks 1위 on the podium and says so in 내 순위", () => {
    render(<Harness data={{ ...VIEW, week: rows(3, 1), all: rows(3, 1), owner: OWNER, mine: mine(500, 1, 1) }} />);
    expect(screen.getByRole("list", { name: "1~3위" }).querySelector("[data-place='first']")!.hasAttribute("data-mine")).toBe(true);
    expect(myBox().textContent).toContain("이번 주 1위예요");
  });

  it("explains a constellation completed before this week and points to 명예의 전당", () => {
    render(<Harness data={{ ...VIEW, all: rows(5, 3), owner: OWNER, mine: mine(490, null, 3) }} />);
    expect(myBox().textContent).toContain("이번 주 순위에는 없어요");
    expect(myBox().textContent).toContain("명예의 전당에서는 3위예요.");
    fireEvent.click(within(myBox()).getByRole("button", { name: "명예의 전당 보기" }));
    expect(screen.getByRole("tab", { name: "명예의 전당" }).getAttribute("aria-selected")).toBe("true");
    expect(myBox().textContent).toContain("3위");
  });

  it("says the name is kept off the rankings, with the switch to put it on", () => {
    render(<Harness data={{ ...VIEW, week: rows(4), all: rows(4), owner: { ...OWNER, rankingPublic: false }, mine: mine(300, null, null) }} />);
    expect(myBox().textContent).toContain("랭킹에 이름을 올리지 않았어요");
    expect(myBox().textContent).toContain("켜면 내 순위가 여기에 떠요.");
    expect(within(myBox()).getByRole("checkbox", { name: "랭킹에 내 이름 올리기" })).toBeTruthy();
    expect(myBox().getAttribute("data-state")).toBeNull();
  });

  it("keeps empty boards friendly: empty podium, 명예의 전당 보기 and 이 별자리 채우기 for a visitor", () => {
    render(<Harness data={{ ...VIEW, all: rows(2) }} />);
    const places = screen.getByRole("list", { name: "1~3위", hidden: true }).querySelectorAll("li");
    expect([...places].every((li) => li.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(screen.getByText("이번 주에 양자리를 완성한 사람이 아직 없어요. 첫 번째가 되어 보세요.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: /4~/ })).toBeNull();
    expect(myBox().textContent).toContain("완성하면 여기에 순위가 떠요");
    expect(within(myBox()).getByRole("link", { name: "이 별자리 채우기" }).getAttribute("href")).toBe("/bonds?sign=aries");
    fireEvent.click(screen.getByRole("button", { name: "명예의 전당 보기" }));
    expect(screen.getByRole("tabpanel", { name: "명예의 전당" }).textContent).toContain("별1");
    cleanup();
    render(<Harness data={VIEW} />);
    expect(screen.queryByRole("button", { name: "명예의 전당 보기" })).toBeNull();
  });

  it("shows progress instead of a second start button while this device fills a sign", () => {
    render(<Harness data={{ ...VIEW, owner: OWNER, filling: { sign: "aries", filled: 2, total: 120 } }} />);
    expect(myBox().textContent).toContain("지금 별 2/4개예요.");
    expect(within(myBox()).queryByRole("button", { name: "이 별자리 채우기" })).toBeNull();
    cleanup();
    render(<Harness data={{ ...VIEW, owner: OWNER, filling: { sign: "leo", filled: 1, total: 60 } }} />);
    expect(myBox().textContent).toContain("지금은 사자자리를 채우는 중이에요.");
  });
});
