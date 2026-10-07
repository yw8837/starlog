import { DEFAULT_POLICY, computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { TIME_UNKNOWN_LINE, criteriaGroups, policyLines } from "./sajuCriteria";
import { DEFAULT_SAJU_FORM, toSajuInput, withLeapChoice } from "./sajuForm";

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
    const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 10, minute: 30 }));
    const groups = criteriaGroups(chart);
    expect(groups.applied).toEqual(chart.notes);
    expect(groups.applied.join(" ")).toContain("보정 시각 09:57");
    expect(groups.changes).toEqual([]);
  });

  it("time known within 10 minutes of a 시진 boundary: the 시주 across it joins the changes (09:30 in 서울 reads 08:57)", () => {
    const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, timeKnown: true, hour: 9, minute: 30 }));
    // 1990-01-01 is 丙寅 day: 子 hour 戊子, so 辰 壬辰 (this chart) and 巳 癸巳
    expect(criteriaGroups(chart).changes).toEqual(["보정 시각(08:57)이 시주가 바뀌는 시각(09:00)과 3분 차이예요. 실제로 몇 분 늦게 태어났다면 시주가 癸巳(계사)가 돼요."]);
  });

  it("time known in the 23:00 hour of the corrected clock: the other calendars' 일주 joins the changes", () => {
    const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: 1990, month: 1, day: 1, timeKnown: true, hour: 23, minute: 50 }));
    expect(chart.correctedLocalTime).toBe("23:17");
    expect(criteriaGroups(chart).changes).toEqual(["보정 시각(23:17)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 丁卯(정묘)가 돼요."]);
  });

  it("윤달 모름 on a day only the 윤달 has (1952 음5-30): says it was computed as 윤달, with the time unknown too", () => {
    const lunar = withLeapChoice({ ...DEFAULT_SAJU_FORM, calendar: "lunar", year: 1952, month: 5, day: 30 }, "unknown");
    const leapLine = "음력 1952년 5월 30일은 윤달에만 있는 날이라 윤달로 계산했어요.";
    expect(criteriaGroups(computeChart(toSajuInput(lunar))).applied).toEqual([leapLine, TIME_UNKNOWN_LINE]);
    const known = computeChart(toSajuInput({ ...lunar, timeKnown: true, hour: 12, minute: 0 }));
    expect(criteriaGroups(known).applied).toEqual(known.notes);
    expect(known.notes[0]).toBe(leapLine);
    // 평달 when that month has the day: no such line, the 윤달 chart goes to the changes
    const both = criteriaGroups(computeChart(toSajuInput({ ...lunar, year: 2023, month: 2, day: 15 })));
    expect(both.applied).toEqual([TIME_UNKNOWN_LINE]);
    expect(both.changes[0]).toContain("윤달이라면 양력 4월 5일생이고");
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
