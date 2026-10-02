import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { buildTopicFactSet, nextIpchun, teaserFreshUntil } from "./prompts/sajuTopics";

const NOW = Date.parse(golden.evalNow); // 2026-10-02 12:00 KST
const TOPICS: SajuTopicId[] = ["love", "reunion", "money", "career"];
const situations = golden.situations as Record<SajuTopicId, Record<string, SajuSituationId>>;
const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const groupsOf = (id: string, topic: SajuTopicId) => Object.fromEntries(buildTopicFactSet(chartOf(id), NOW, topic).groups.items.map((g) => [g.name, g]));

describe("topic facts for the golden charts (spec §6.3, §12.1)", () => {
  it("C1 재물운: no 재성 on the surface, 庚 편재 hidden in 巳, the 대운 that shows it, 2027 丁未", () => {
    const f = buildTopicFactSet(chartOf("C1"), NOW, "money", "leaking");
    const g = Object.fromEntries(f.groups.items.map((x) => [x.name, x]));
    expect(f.schemaVersion).toBe("saju-topic-facts/1");
    expect(f.groups.basis).toBe("시주 없이 여섯 글자 기준(일간 제외)");
    expect(g.재성).toEqual({ name: "재성", visible: [], hidden: ["년지 巳 속 중기 庚 편재"], count: 0, onStem: false, rooted: true });
    expect(g.식상).toEqual({ name: "식상", visible: ["년간 己 상관"], hidden: ["년지 巳 속 여기 戊 식신", "일지 寅 속 여기 戊 식신"], count: 1, onStem: true, rooted: true });
    expect(g.비겁!.visible).toEqual(["년지 巳 비견", "월간 丙 비견"]);
    expect(f.nextAnnual).toMatchObject({ year: 2027, gz: "丁未", ko: "정미", stemTenGod: "겁재", branchMainTenGod: "상관", starts: "입춘 무렵" });
    expect(f.nextAnnual.relationsToNatal.map((r) => `${r.type} ${r.members.join("-")}`)).toEqual(["해(害) 未(다가오는 해 세운 지지)-子(월지)"]);
    expect(f.nextAnnual.luck).toEqual({ gz: "庚辰", ko: "경진", relations: [] });
    expect(f.luckEdge).toBeNull();
    expect(f.dayWindow).toBeNull();
    expect(f.limits.at(-1)).toBe("금액·수익·투자 판단은 이 풀이로 보지 않아요.");
    expect(f.situation).toEqual({ id: "leaking", label: "돈이 안 모이고 자꾸 새요" });
    expect(f.focus.s2).toContain("재성은 겉에 없고 지장간에 숨어 있어요: 년지 巳 속 중기 庚 편재");
    expect(f.focus.s4).toContain("원국 겉에 없는 재성이 지금 대운 천간에 드러나 있어요");
    expect(f.allowed.years).toContain(2027);
    expect(f.allowed.glyphs).toEqual(expect.arrayContaining(["丁", "未", "己", "乙"]));
    expect(f.allowed.yearMonths).toEqual(expect.arrayContaining(["1991-04", "1991-08", "2021-06", "2026-06", "2031-06"]));
    expect(f.allowed.anchors).toMatchObject({ s4: ["庚辰", "경진"], s5: [["丙午", "병오"], ["丁未", "정미"]], zeroS2: ["재성"], zeroS3: [], nextLuck: null });
    expect(f.freshUntil).toBe("2026-11-01T03:00:00.000Z");
  });

  it("C1 연애운: the day-pillar window of the unknown time, and the 상대 limit line", () => {
    const f = buildTopicFactSet(chartOf("C1"), NOW, "love", "long-single");
    expect(f.dayWindow).toEqual({ sentence: "00:00~00:32 사이에 태어났다면 일주가 전날 일진인 乙丑(을축)이 돼요.", range: "00:00~00:32", dayBranch: "축토(丑土)" });
    expect(f.limits.at(-1)).toBe("상대의 명식 없이 내 명식만 읽었어요.");
    expect(f.allowed.anchors.zeroS3).toEqual(["재성"]);
  });

  it("C9: the 대운 changes about now and the unknown time moves it (luckEdge)", () => {
    const f = buildTopicFactSet(chartOf("C9"), NOW, "reunion", "missing");
    expect(f.luckEdge).toBe("지금은 대운이 경진(庚辰)에서 기묘(己卯)로 바뀌는 무렵이에요. 태어난 시각을 몰라 바뀌는 때가 앞뒤 약 2개월 달라질 수 있어요.");
    expect(f.allowed.anchors.s4).toEqual(["己卯", "기묘"]);
  });

  it("C4: the next 대운 within a year (2027-08 戊寅) is an anchor of 4절", () => {
    const f = buildTopicFactSet(chartOf("C4"), NOW, "career", "move");
    expect(f.allowed.anchors.nextLuck).toEqual(["戊寅", "무인"]);
    expect(f.allowed.yearMonths).toContain("2027-08");
    expect(f.nextAnnual.luck?.gz).toBe("己卯");
  });

  it("counts the groups the golden table names (C2·C5 관성 0, C5 식상 3, C7 비겁 5, C8 인성 hidden only, C3 비겁 3 vs 재성 1)", () => {
    expect(groupsOf("C2", "career").관성).toMatchObject({ count: 0, hidden: [] });
    expect(groupsOf("C5", "career").관성).toMatchObject({ count: 0, hidden: [] });
    expect(groupsOf("C5", "money").식상!.count).toBe(3);
    expect(groupsOf("C5", "money").재성).toMatchObject({ count: 0, hidden: ["월지 申 속 중기 壬 정재"] });
    expect(groupsOf("C7", "money").비겁!.count).toBe(5);
    expect(groupsOf("C8", "love").인성).toMatchObject({ count: 0, hidden: ["시지 辰 속 여기 癸 편인"] });
    expect([groupsOf("C3", "money").비겁!.count, groupsOf("C3", "money").재성!.count]).toEqual([3, 1]);
  });

  it("says until when a teaser stays current: 30 days, the next 입춘 or the end of the 대운", () => {
    expect(new Date(nextIpchun(Date.parse("2027-01-20T03:00:00Z"))).toISOString()).toBe("2027-02-04T01:46:00.000Z");
    expect(teaserFreshUntil({ luck: null }, Date.parse("2027-01-20T03:00:00Z"))).toBe("2027-02-04T01:46:00.000Z");
    expect(buildTopicFactSet(chartOf("C4"), Date.parse("2027-07-20T03:00:00Z"), "money").freshUntil).toBe("2027-07-31T15:00:00.000Z");
  });

  it("is deterministic for all 36 golden combinations (snapshot at evalNow)", () => {
    for (const c of golden.charts) {
      for (const topic of TOPICS) {
        const f = buildTopicFactSet(chartOf(c.id), NOW, topic, situations[topic][c.id]);
        expect({ groups: f.groups, nextAnnual: f.nextAnnual, luckEdge: f.luckEdge, dayWindow: f.dayWindow, focus: f.focus, allowed: f.allowed }).toMatchSnapshot(`${c.id} ${topic}`);
      }
    }
  });
});
