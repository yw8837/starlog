import { computeChart } from "@starlog/core";
import sajuSample from "@content/samples/saju-prologue.ko.json";
import { describe, expect, it } from "vitest";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { generateSajuReading } from "./generate";
import { mockSajuFollowUp, mockSajuReading, mockSajuTeaser } from "./mock";
import { buildFactSet, glyphDisplay, sajuReadingPrompt, tenGod, twelveStage } from "./prompts/saju";
import { mockProvider } from "./mock";
import type { SajuReading } from "./schemas";
import { validateSajuFollowUp, validateSajuReading, validateSajuTeaser } from "./validate";
import { isSoftViolation } from "./style";

/** Hard violations only (soft style hints may regenerate but never fail a reading). */
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));

const NOW = Date.parse("2026-09-30T03:00:00Z"); // 2026-09-30 12:00 KST
const factsOf = (patch: Partial<SajuForm> = {}, now = NOW) => buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch })), now);

describe("FactSet for the sample chart (1990-01-01, female, 서울, time unknown)", () => {
  const facts = factsOf();

  it("matches the verified pillars, ten gods, hidden stems and 12운성 of the gold sample", () => {
    const { chart } = sajuSample;
    expect(facts.pillars.map((p) => p.gz)).toEqual(["己巳", "丙子", "丙寅"]);
    const [year, month, day] = facts.pillars as [typeof facts.pillars[0], typeof facts.pillars[0], typeof facts.pillars[0]];
    expect([year.stem.tenGod, year.branch.mainTenGod]).toEqual([chart.pillars.year.stemGod, chart.pillars.year.branchGod]);
    expect([month.stem.tenGod, month.branch.mainTenGod]).toEqual([chart.pillars.month.stemGod, chart.pillars.month.branchGod]);
    expect(day.branch.mainTenGod).toBe(chart.pillars.day.branchGod);
    expect(facts.pillars.map((p) => p.branch.twelveStage)).toEqual([chart.twelveStages.year, chart.twelveStages.month, chart.twelveStages.day]);
    expect(year.hidden.map((h) => [h.glyph, h.tenGod])).toEqual([["丙", "비견"], ["庚", "편재"], ["戊", "식신"]]);
    expect(facts.elements.counts).toEqual(chart.elements);
    expect(facts.dayMaster.display).toBe("병화(丙火)");
    expect(facts.elements.hiddenOnly.join()).toContain("경금(庚金)");
  });

  it("knows the current 대운 range and this year's 세운 (2026 丙午)", () => {
    expect(facts.luck?.direction).toBe("순행");
    expect(facts.luck?.current).toMatchObject({ gz: "庚辰", from: "2021-06", to: "2031-06", stemTenGod: "편재", branchMainTenGod: "식신" });
    expect(facts.luck?.start).toContain("앞뒤 약 2개월");
    expect(facts.annual).toMatchObject({ year: 2026, gz: "丙午", stemTenGod: "비견", branchMainTenGod: "겁재" });
    const annualRelations = facts.annual.relationsToNatal.map((r) => r.type).join();
    expect(annualRelations).toContain("충(沖)"); // 午 × 子(월지)
    expect(annualRelations).toContain("반합"); // 午 × 寅(일지)
  });

  it("records the natal 寅巳 relation as existence only, and the time-unknown limits", () => {
    expect(facts.relations.map((r) => r.type)).toEqual(expect.arrayContaining(["해(害)", "형(刑)"]));
    expect(facts.limits.join(" ")).toMatch(/시주 없이/);
    expect(facts.limits.join(" ")).toMatch(/乙丑/);
    expect(facts.allowed.glyphs).toEqual(expect.arrayContaining(["己", "巳", "丙", "子", "寅", "庚", "戊", "癸", "甲", "辰", "午", "乙", "丑"]));
  });

  it("builds the prompt from the FactSet with the seven fixed headings and no birth date", () => {
    const prompt = sajuReadingPrompt(facts);
    for (const heading of SAJU_PROLOGUE_SECTIONS) expect(prompt).toContain(heading);
    expect(prompt).toContain("庚辰");
    expect(prompt).not.toContain("1990-01-01");
    expect(prompt).not.toContain('"allowed"');
  });
});

describe("saju helpers", () => {
  it("computes ten gods, 12운성 and display names", () => {
    expect(tenGod("丙", "癸")).toBe("정관");
    expect(tenGod("丙", "甲")).toBe("편인");
    expect(tenGod("丙", "己")).toBe("상관");
    expect(tenGod("甲", "辛")).toBe("정관");
    expect(tenGod("乙", "乙")).toBe("비견");
    expect(twelveStage("丙", "寅")).toBe("장생");
    expect(twelveStage("乙", "巳")).toBe("목욕");
    expect(glyphDisplay("子")).toBe("자수(子水)");
    expect(glyphDisplay("甲")).toBe("갑목(甲木)");
  });
});

describe("saju validator", () => {
  const facts = factsOf();
  const gold: SajuReading = { ...sajuSample.paid, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "앞으로 몇 주 동안 끝낸 일의 시간과 돈을 셀 때 힘이 빠지는지, 오히려 개운한지 눈여겨보세요. 개운하다면 巳 속의 경금(庚金)을 꺼내 쓰고 있다는 뜻으로 읽을 수 있어요." }, followUps: ["지금 대운에서 해 볼 작은 실험은요?", "오행 지도를 일상에 어떻게 쓸까요?"] };

  it("passes the gold prologue for its own chart", () => {
    expect(hard(validateSajuReading(gold, facts))).toEqual([]);
    // The judge's finding: the gold asks the reader to write things down in six places.
    expect(validateSajuReading(gold, facts).join(" ")).toMatch(/\[문체\] 행동 제안이 비슷하게/);
    expect(validateSajuTeaser({ title: sajuSample.free.title, summary: sajuSample.free.summary }, facts)).toEqual([]);
  });

  it("catches an invented stem, a ten god the chart does not have, a stray year and forbidden topics", () => {
    const edit = (extra: string): SajuReading => ({ ...gold, sections: gold.sections.map((s, i) => (i === 2 ? { ...s, body: `${s.body} ${extra}` } : s)) });
    expect(validateSajuReading(edit("시주에 壬水가 있어 차분해요."), facts).join(" ")).toMatch(/간지 글자.*壬/);
    expect(validateSajuReading(edit("편관이 두드러져요."), facts).join(" ")).toMatch(/십성.*편관/);
    expect(validateSajuReading(edit("2029년에 큰 변화가 와요."), facts).join(" ")).toMatch(/연도.*2029/);
    for (const bad of ["결혼 운이 들어와요.", "건강 진단을 받아 보세요.", "올해는 좋은 해예요.", "도화가 있어 인기가 많아요.", "신강한 명식이에요.", "반드시 성공해요."]) {
      expect(validateSajuReading(edit(bad), facts).length).toBeGreaterThan(0);
    }
    expect(hard(validateSajuReading(edit("신강·신약 라벨은 붙이지 않았어요."), facts))).toEqual([]);
    expect(hard(validateSajuReading(edit("결정인지 아닌지는 상관없이 기록해 보세요."), facts))).toEqual([]);
  });

  it("catches a missing section and a missing time-unknown limit", () => {
    expect(validateSajuReading({ ...gold, sections: gold.sections.slice(0, 6) }, facts).join(" ")).toMatch(/정확히 7개/);
    const noLimit = { ...gold, sections: gold.sections.map((s, i) => (i === 6 ? { ...s, body: "계산 기준을 적어 둬요. ".repeat(20) } : s)) };
    expect(validateSajuReading(noLimit, facts).join(" ")).toMatch(/시를 몰라/);
  });
});

describe("saju mock", () => {
  const cases: Array<Partial<SajuForm>> = [
    {},
    { timeKnown: true, hour: 9, minute: 30 },
    { year: 1985, month: 7, day: 14, gender: "male", timeKnown: true, hour: 23, minute: 40 },
    { calendar: "lunar", year: 1992, month: 3, day: 8, placeId: "busan" },
    { year: 2020, month: 2, day: 4 },
    { year: 1964, month: 11, day: 30, gender: "male" },
    { year: 2003, month: 12, day: 22, timeKnown: true, hour: 0, minute: 10, placeId: "jeju" },
  ];

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))("passes its own validators for %s", (_label, patch) => {
    const facts = factsOf(patch);
    expect(validateSajuTeaser(mockSajuTeaser(facts), facts)).toEqual([]);
    expect(validateSajuReading(mockSajuReading(facts), facts)).toEqual([]);
    expect(validateSajuFollowUp(mockSajuFollowUp(facts), facts)).toEqual([]);
  });

  it("writes a prologue for a non-sample chart through the provider", async () => {
    const facts = factsOf({ year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" });
    const { data } = await generateSajuReading(mockProvider, facts);
    expect(data.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(data.sections[5]!.body).toContain(`${facts.annual.year}년`);
  });
});
