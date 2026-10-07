// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { RankingIndexBody } from "./RankingIndexBody";
import { SignIndex, signDates } from "./SignIndex";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const LEADERS = {
  aries: [
    { rank: 1, nickname: "용우", total: 412 },
    { rank: 2, nickname: "하늘", total: 398 },
    { rank: 3, nickname: "별빛나리", total: 350 },
  ],
  leo: [{ rank: 1, nickname: "민지", total: 501 }],
};

describe("별자리 인연 랭킹 (/ranking)", () => {
  it("shows a card per sign in zodiac order, each with its dates and a link to the full ranking", () => {
    render(<SignIndex leaders={LEADERS} />);
    const all = screen.getAllByRole("link", { name: /전체 순위$/ });
    expect(all.map((a) => a.getAttribute("href"))).toEqual(CONSTELLATIONS.map((c) => `/ranking/${c.id}`));
    expect(screen.getByRole("heading", { level: 2, name: "양자리" })).toBeTruthy();
    const aries = screen.getByRole("heading", { level: 2, name: "양자리" }).closest("li")!;
    expect(aries.textContent).toContain("3월 21일 ~ 4월 19일");
    // each date is one unbreakable piece
    expect([...aries.querySelectorAll("h2 + p span")].map((el) => el.textContent)).toEqual(["3월 21일", "4월 19일"]);
  });

  it("gives the all-time 1위 the showpiece (lit figure, nickname, big total) and lists 2·3위 beside it", () => {
    render(<SignIndex leaders={LEADERS} />);
    const aries = screen.getByRole("heading", { level: 2, name: "양자리" }).closest("li")!;
    const champ = aries.querySelector("[data-champ='lit']")!;
    expect(champ.textContent).toBe("1위용우인연 412점");
    // the figure is fully lit: every star of 양자리
    expect(champ.querySelectorAll("[data-star='lit']")).toHaveLength(CONSTELLATIONS[0]!.slots);
    const rest = within(aries).getByRole("list", { name: "양자리 2·3위" });
    expect(within(rest).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["2하늘398점", "3별빛나리350점"]);
    // a sign with only a 1위 says the next place is open
    const leo = screen.getByRole("heading", { level: 2, name: "사자자리" }).closest("li")!;
    expect(leo.textContent).toContain("민지");
    expect(leo.textContent).toContain("2위 자리는 아직 비어 있어요");
  });

  it("shows an unlit figure with 첫 1위 자리 and invites to be first where no one has completed the sign yet", () => {
    render(<SignIndex leaders={LEADERS} />);
    expect(screen.getAllByText("첫 1위 자리")).toHaveLength(10);
    const taurus = screen.getByRole("heading", { level: 2, name: "황소자리" }).closest("li")!;
    expect(taurus.querySelector("[data-champ='empty']")).not.toBeNull();
    expect(taurus.querySelectorAll("[data-star='lit']")).toHaveLength(0);
    const first = screen.getAllByRole("link", { name: "첫 번째가 되어 보세요" });
    expect(first).toHaveLength(10);
    expect(first[0]?.getAttribute("href")).toBe("/bonds?sign=taurus");
    // the sentence and the link stand on their own lines, with no separator left dangling
    expect(screen.getAllByText("아직 완성한 별자리가 없어요")).toHaveLength(10);
    expect(document.body.textContent).not.toContain("없어요 ·");
  });

  it("still shows every sign, without names, when the rankings cannot be read", () => {
    render(<SignIndex leaders={null} />);
    expect(screen.getAllByText("지금은 순위를 불러오지 못했어요")).toHaveLength(12);
    expect(screen.getAllByRole("link", { name: /전체 순위$/ })).toHaveLength(12);
    expect(screen.queryByRole("link", { name: "첫 번째가 되어 보세요" })).toBeNull();
    expect(screen.queryByText("첫 1위 자리")).toBeNull();
  });

  it("marks this device's own sign once it is known", async () => {
    window.localStorage.setItem("starlog.bonds.sun", "leo");
    const { container } = render(<SignIndex leaders={LEADERS} />);
    expect(await screen.findByText("내 별자리")).toBeTruthy();
    expect(container.querySelectorAll("[data-mine]")).toHaveLength(1);
    expect(container.querySelector("[data-mine]")?.getAttribute("aria-labelledby")).toBe("sign-leo");
  });

  it("gives every sign the days up to the next one, across the new year", () => {
    const byId = Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, signDates(c)]));
    expect(byId.capricorn).toBe("12월 22일 ~ 1월 19일");
    expect(byId.aquarius).toBe("1월 20일 ~ 2월 18일");
    expect(byId.pisces).toBe("2월 19일 ~ 3월 20일");
  });

  it("has one h1 and a way into 별자리 인연", () => {
    const { container } = render(<RankingIndexBody leaders={LEADERS} />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "내 별자리 채우러 가기" }).getAttribute("href")).toBe("/bonds");
  });

  it("leads with the all-time sentence: no week, no Monday restart", () => {
    const { container } = render(<RankingIndexBody leaders={LEADERS} />);
    expect(screen.getByText("별자리마다 인연 점수 합계 1~3위예요. 같은 별자리를 완성한 사람끼리만 겨뤄요.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/이번 주|월요일|매주/);
  });
});
