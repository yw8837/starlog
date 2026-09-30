import { DEFAULT_POLICY, computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { TIME_UNKNOWN_LINE, criteriaGroups, policyLines } from "./sajuCriteria";
import { DEFAULT_SAJU_FORM, toSajuInput } from "./sajuForm";

const SEOUL = { name: "서울", longitude: 126.978 };

describe("criteriaGroups", () => {
  it("time unknown: one line for the missing hour, the day-pillar windows only as warnings (no repeat)", () => {
    const chart = computeChart(toSajuInput(DEFAULT_SAJU_FORM));
    const groups = criteriaGroups(chart);
    expect(groups.applied).toEqual([TIME_UNKNOWN_LINE]);
    expect(groups.changes).toEqual(["00:00~00:32 사이에 태어났다면 일주가 전날 일진인 乙丑(을축)이 돼요."]);
    expect(groups.applied.join(" ")).not.toContain("00:32");
  });

  it("time known: the engine's correction notes, and no changes when nothing sits on a boundary", () => {
    const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: 30 }));
    const groups = criteriaGroups(chart);
    expect(groups.applied).toEqual(chart.notes);
    expect(groups.applied.join(" ")).toContain("보정 시각 08:57");
    expect(groups.changes).toEqual([]);
  });

  it("time known on a DST day: both the DST and the longitude notes", () => {
    const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: 1987, month: 7, day: 1, timeKnown: true, hour: 14, minute: 0, placeId: "busan" }));
    expect(criteriaGroups(chart).applied).toEqual(chart.notes);
    expect(chart.notes).toHaveLength(2);
  });
});

describe("policyLines", () => {
  it("describes the default policy at the birthplace", () => {
    expect(policyLines(DEFAULT_POLICY, SEOUL)).toEqual([
      "연주·월주는 태어난 순간과 절기가 바뀌는 시각(절입)을 비교해 정해요.",
      "일주·시주는 태어난 곳(서울, 동경 126.978°)의 평균 태양시로 봐요. 균시차는 넣지 않아요.",
      "밤 11시대(자시)는 일주를 그날로 두고, 시주만 다음 날 기준으로 봐요.",
      "서머타임과 옛 표준시 기간은 당시 시계를 되돌려 계산해요.",
      "오행 개수는 천간과 지지에 보이는 글자만 세요. 지장간은 세지 않아요.",
      "태어난 시를 모르면 정오 같은 시각을 넣지 않고 시주 없이 봐요.",
    ]);
  });

  it("follows the policy when its rules change", () => {
    const lines = policyLines({ ...DEFAULT_POLICY, clock: "ERA_STANDARD", jasi: "DAY_CHANGES_AT_23", applyHistoricalDst: false }, SEOUL);
    expect(lines[1]).toBe("일주·시주는 당시 표준시 그대로 보고, 경도 보정은 하지 않아요.");
    expect(lines[2]).toBe("밤 11시부터는 다음 날 일주로 봐요.");
    expect(lines.some((line) => line.includes("서머타임"))).toBe(false);
  });
});
