import { describe, expect, it } from "vitest";
import type { SignId } from "@starlog/core";
import { homeRankLine } from "./rankLine";
import type { OwnerView, StarView } from "./service";

const star = (slot: number, score: number): StarView => ({
  id: `s${slot}`, slot, nickname: `친구${slot}`, message: null, cardId: "wands-01", orientation: "upright", score, parts: [], createdAt: 1, line: "",
});
const sum = (scores: number[]) => scores.reduce((a, b) => a + b, 0);
const done = (sign: SignId, scores: number[], completedAt = 10): OwnerView["completed"][number] => ({
  id: `c-${sign}`, sign, status: "complete", total: sum(scores), startedAt: 1, completedAt, stars: scores.map((score, slot) => star(slot, score)),
});
const filling = (sign: SignId, scores: number[]): NonNullable<OwnerView["filling"]> => ({
  row: { id: `f-${sign}`, sign, status: "filling", total: sum(scores), startedAt: 1, completedAt: null },
  stars: scores.map((score, slot) => star(slot, score)),
});
const view = ({ rankingPublic = true, ...rest }: Partial<OwnerView> & { rankingPublic?: boolean } = {}): OwnerView => ({
  owner: { nickname: "용우", rankingPublic, refillReadyAt: null },
  invite: { code: "K7M4QX" },
  filling: null,
  completed: [],
  top5: [],
  ranks: {},
  ...rest,
});

const ARIES = [100, 100, 112, 100]; // 412점
const INVITE = "나의 인연들과 별자리를 만들어 봐요";

describe("home 별자리 인연 랭킹 tile line", () => {
  it("shows my score and my all-time rank once a constellation is done and the ranking is public", () => {
    expect(homeRankLine(view({ completed: [done("aries", ARIES)], ranks: { aries: { all: 12 } } }))).toBe("내 양자리 412점 · 12위");
    expect(homeRankLine(view({ completed: [done("aries", ARIES)], ranks: { aries: { all: 1 } } }))).toBe("내 양자리 412점 · 1위");
  });

  it("never mentions a week or a hall of fame", () => {
    const line = homeRankLine(view({ completed: [done("aries", ARIES)], ranks: { aries: { all: 3 } } }));
    expect(line).not.toMatch(/이번 주|전체|명예/);
  });

  it("shows only my score when the ranking is hidden or there is no rank", () => {
    const completed = [done("aries", ARIES)];
    expect(homeRankLine(view({ completed, rankingPublic: false, ranks: { aries: { all: null } } }))).toBe("내 양자리 412점");
    // hidden wins even if a rank came along
    expect(homeRankLine(view({ completed, rankingPublic: false, ranks: { aries: { all: 12 } } }))).toBe("내 양자리 412점");
    expect(homeRankLine(view({ completed, ranks: { aries: { all: null } } }))).toBe("내 양자리 412점");
    expect(homeRankLine(view({ completed, ranks: {} }))).toBe("내 양자리 412점");
  });

  it("reads the latest completion, the one ranks are looked up for, whatever the order of the list", () => {
    const completed = [done("leo", [90, 90, 90, 90, 90, 90], 20), done("aries", ARIES, 30), done("taurus", [80, 80, 80, 80, 80], 10)];
    expect(homeRankLine(view({ completed, ranks: { aries: { all: 5 } } }))).toBe("내 양자리 412점 · 5위");
  });

  it("adds the scores of the stars, not a stored total", () => {
    const completed = [{ ...done("leo", [90, 90, 90, 90, 90, 90]), total: 1 }];
    expect(homeRankLine(view({ completed, ranks: { leo: { all: 4 } } }))).toBe("내 사자자리 540점 · 4위");
  });

  it("shows the sign being filled with its score so far, and that finishing it puts the owner on the ranking", () => {
    expect(homeRankLine(view({ filling: filling("aries", [87, 87]) }))).toBe("지금 양자리 174점 · 완성하면 순위에 올라요");
  });

  it("leaves out the ranking promise while the sign is filled by an owner whose ranking is hidden", () => {
    expect(homeRankLine(view({ filling: filling("aries", [87, 87]), rankingPublic: false }))).toBe("지금 양자리 174점");
  });

  it("invites while the sign being filled has no star yet (just chosen, no friend yet), hidden ranking or not", () => {
    expect(homeRankLine(view({ filling: filling("libra", []) }))).toBe(INVITE);
    expect(homeRankLine(view({ filling: filling("libra", []), rankingPublic: false }))).toBe(INVITE);
  });

  it("puts a completed constellation before the one being filled (the next sign starts by itself)", () => {
    const me = view({ completed: [done("aries", ARIES)], filling: filling("taurus", [60]), ranks: { aries: { all: 12 } } });
    expect(homeRankLine(me)).toBe("내 양자리 412점 · 12위");
  });

  it("invites a device that has not started, and an owner with nothing filling or completed", () => {
    expect(homeRankLine({ owner: null })).toBe(INVITE);
    expect(homeRankLine(view())).toBe(INVITE);
  });
});
