import { BRANCHES, computeChart } from "@starlog/core";
import sajuSample from "@content/samples/saju-prologue.ko.json";
import { describe, expect, it } from "vitest";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { generateSajuReading } from "./generate";
import { mockSajuFollowUp, mockSajuReading, mockSajuTeaser } from "./mock";
import { SAJU_PREAMBLE, SAJU_SYSTEM, buildFactSet, glyphDisplay, sajuReadingPrompt, tenGod, twelveStage, type Relation } from "./prompts/saju";
import { mockProvider } from "./mock";
import type { SajuReading } from "./schemas";
import { allowedFactViolations, validateSajuFollowUp, validateSajuReading, validateSajuTeaser } from "./validate";
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
    expect(year.hidden.map((h) => [h.glyph, h.role, h.tenGod])).toEqual([["戊", "여기", "식신"], ["庚", "중기", "편재"], ["丙", "본기", "비견"]]);
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

/** "type member-member": a relation as one comparable line. */
const lineOf = (r: Relation) => `${r.type} ${r.members.join("-")}`;

describe("facts added before launch (docs/research/analysis-gap-review-2026-10.md §2.1, §3)", () => {
  it("B1: reads the 지장간 by the 월률분야 table, each with its role (辰: 여기 乙, 중기 癸; 子卯午酉亥 with their 여기)", () => {
    expect(factsOf().luck?.current?.hidden).toEqual(["을목(乙木) 여기 정인", "계수(癸水) 중기 정관", "무토(戊土) 본기 식신"]); // 대운 庚辰
    const ox = factsOf({ year: 1960, month: 11, day: 21 }).pillars[2]!; // 일주 癸丑
    expect(ox.gz).toBe("癸丑");
    expect(ox.hidden.map((h) => `${h.glyph} ${h.role} ${h.tenGod}`)).toEqual(["癸 여기 비견", "辛 중기 편인", "己 본기 편관"]);
    // the sample's 월지 子 holds 壬 as its 여기: 편관 to 丙, so the allow-list carries it
    expect(factsOf().pillars[1]!.hidden.map((h) => `${h.glyph} ${h.role} ${h.tenGod}`)).toEqual(["壬 여기 편관", "癸 본기 정관"]);
    expect(factsOf().allowed.tenGods).toContain("편관");
    // 庚子 丁亥 甲子 shows no earth; 亥's 여기 戊 is where it hides
    expect(factsOf({ year: 1960, month: 12, day: 2 }).elements.hiddenOnly).toEqual(["무토(戊土): 월지 亥 속 여기"]);
  });

  it("B9: states the 12운성 rule the code runs and the 지장간 table it uses", () => {
    const calc = factsOf().calculation.join("\n");
    expect(calc).toContain("12운성은 일간 기준");
    expect(calc).toContain("음간은 거꾸로");
    expect(calc).toContain("무토·기토는 병화·정화를 따름");
    expect(calc).toContain("지장간은 월률분야 표(여기·중기·정기)를 따르고 정기를 본기라고 부름");
    // what the line says is what twelveStage does: 戊 follows 丙, 己 follows 丁, a yin stem counts backward
    for (const b of BRANCHES) expect([twelveStage("戊", b), twelveStage("己", b)]).toEqual([twelveStage("丙", b), twelveStage("丁", b)]);
    expect(["子", "亥", "戌"].map((b) => twelveStage("乙", b))).toEqual(["병", "사", "묘"]);
  });

  it("R1: this month's and next month's 월건, the 절 that opens each, their ten gods and relations", () => {
    const f = factsOf(); // 2026-09-30 12:00 KST, day master 丙
    expect(f.monthly?.current).toMatchObject({ gz: "丁酉", ko: "정유", yearGz: "丙午", stemTenGod: "겁재", branchMainTenGod: "정재", term: { name: "백로", kst: "9월 7일 23:41" } });
    expect(f.monthly?.next).toMatchObject({ gz: "戊戌", ko: "무술", yearGz: "丙午", stemTenGod: "식신", branchMainTenGod: "식신", term: { name: "한로", kst: "10월 8일 15:29" } });
    expect(f.monthly?.current.relationsToNatal.map(lineOf)).toEqual(["반합(半合, 쇠 기운) 酉(이번 달 월건 지지)-巳(년지)", "파(破) 酉(이번 달 월건 지지)-子(월지)"]);
    expect(f.monthly?.current.relationToYear).toEqual([]);
    expect(f.monthly?.next.relationToYear.map(lineOf)).toEqual(["반합(半合, 불 기운) 戌(다음 달 월건 지지)-午(丙午 세운 지지)"]);
    expect(f.allowed.glyphs).toEqual(expect.arrayContaining(["丁", "酉", "辛", "戊", "戌"]));
    expect(f.allowed.tenGods).toEqual(expect.arrayContaining(["겁재", "정재", "식신"]));
    expect(sajuReadingPrompt(f)).toContain('"monthly"');
    expect(SAJU_SYSTEM).toMatch(/observation:[^\n]*월건\(monthly\)/);
    // the month after 소한 is 寅월, which opens with 입춘 and a new 세운
    const jan = factsOf({}, Date.parse("2027-01-20T03:00:00Z"));
    expect([jan.monthly?.current.gz, jan.monthly?.next.gz, jan.monthly?.next.yearGz, jan.monthly?.next.term?.name]).toEqual(["辛丑", "壬寅", "丁未", "입춘"]);
    expect(jan.allowed.glyphs).toEqual(expect.arrayContaining(["壬", "寅", "丁", "未"]));
  });

  it("R1: names the 세운 a 월건 meets by its 간지, since the next 월건 may fall in the next 세운 (2027-01-20: 丙午 now, 壬寅 in 丁未)", () => {
    const jan = factsOf({}, Date.parse("2027-01-20T03:00:00Z"));
    expect(jan.annual.gz).toBe("丙午");
    expect(jan.monthly?.current.relationToYear.map(lineOf)).toEqual(["해(害) 丑(이번 달 월건 지지)-午(丙午 세운 지지)", "천간합(天干合) 辛(이번 달 월건 천간)-丙(丙午 세운 천간)"]);
    expect(jan.monthly?.next.relationToYear.map(lineOf)).toEqual(["천간합(天干合) 壬(다음 달 월건 천간)-丁(丁未 세운 천간)"]);
  });

  it("R1: reads the 세운 at the same moment as the 월건 (2027-02-04 08:00 KST, before 입춘 10:46: still 丙午)", () => {
    const before = factsOf({}, Date.parse("2027-02-04T08:00:00+09:00"));
    expect([before.annual.year, before.annual.gz, before.monthly?.current.gz, before.monthly?.current.yearGz]).toEqual([2026, "丙午", "辛丑", "丙午"]);
    const after = factsOf({}, Date.parse("2027-02-04T11:00:00+09:00"));
    expect([after.annual.year, after.annual.gz, after.monthly?.current.gz, after.monthly?.current.yearGz]).toEqual([2027, "丁未", "壬寅", "丁未"]);
  });

  it("N1·N2: a complete natal 삼합 in place of its 반합 pairs, and a complete 방합", () => {
    const fire = factsOf({ year: 1966, month: 11, day: 3 }); // 丙午 戊戌 丙寅
    expect(fire.relations.filter((r) => /합\(/.test(r.type)).map(lineOf)).toEqual(["삼합(三合, 불 기운) 午(년지)-戌(월지)-寅(일지)"]);
    expect(fire.relations.find((r) => r.type.startsWith("삼합"))!.note).toContain("판단하지 않음");
    const summer = factsOf({ year: 1965, month: 7, day: 15 }); // 乙巳 癸未 庚午
    expect(summer.relations.map(lineOf)).toEqual(["육합(六合) 未(월지)-午(일지)", "천간합(天干合) 乙(년간)-庚(일간)", "방합(方合, 불 기운) 巳(년지)-未(월지)-午(일지)"]);
  });

  it("N1: a glyph that stands twice in a 삼합 is named once, with both places", () => {
    const water = factsOf({ year: 1960, month: 8, day: 16, timeKnown: true, hour: 8, minute: 30 }); // 子 申 子 辰
    expect(water.relations.filter((r) => /합\(/.test(r.type)).map(lineOf)).toEqual(["삼합(三合, 물 기운) 子(년지·일지)-申(월지)-辰(시지)"]);
  });

  it("R2: reads the 세운 against the 대운 by stems too", () => {
    const f = factsOf({ year: 1960, month: 2, day: 27 }); // 대운 壬申
    expect(f.luck?.current?.gz).toBe("壬申");
    expect(f.annual.luckRelation.map(lineOf)).toEqual(["천간충(天干沖) 丙(세운 천간)-壬(대운 천간)"]);
  });

  it("R3: names the 삼합·방합 that the 세운, or only the 대운 and 세운 together, complete with the natal chart", () => {
    const f = factsOf({ year: 1962, month: 9, day: 21 }); // 壬寅 己酉 壬戌 + 세운 午
    expect(f.annual.relationsToNatal.map(lineOf)).toEqual([
      "천간충(天干沖) 丙(세운 천간)-壬(년간)", "천간충(天干沖) 丙(세운 천간)-壬(일간)", "삼합(三合, 불 기운) 寅(년지)-戌(일지)-午(세운 지지)",
    ]);
    expect(factsOf({ year: 1965, month: 7, day: 9 }).annual.relationsToNatal.map(lineOf)).toContain("방합(方合, 불 기운) 巳(년지)-未(월지)-午(세운 지지)"); // 乙巳 癸未 甲子
    const both = factsOf({ year: 1960, month: 11, day: 27 }); // 庚子 丁亥 己未, 대운 辛巳
    expect(both.luck?.current?.gz).toBe("辛巳");
    expect(both.annual.luckRelation.map(lineOf)).toEqual(["천간합(天干合) 丙(세운 천간)-辛(대운 천간)", "방합(方合, 불 기운) 未(일지)-巳(대운 지지)-午(세운 지지)"]);
    expect([...both.annual.relationsToNatal, ...both.luck!.current!.relationsToNatal].map((r) => r.type)).not.toContain("방합(方合, 불 기운)");
  });

  it("R4: 같은 글자 for one glyph in two layers, 같은 간지 for a whole pillar; 자형 only inside the natal chart", () => {
    expect(factsOf().annual.relationsToNatal.filter((r) => r.type === "같은 글자").map((r) => r.members.join("-"))).toEqual(["丙(세운 천간)-丙(월간)", "丙(세운 천간)-丙(일간)"]);
    const horse = factsOf({ year: 1966, month: 11, day: 3 }).annual.relationsToNatal.map(lineOf); // 년주 丙午 = 세운
    expect(horse).toContain("같은 간지 丙午(세운)-丙午(년주)");
    expect(horse).not.toContain("같은 글자 丙(세운 천간)-丙(년간)");
    expect(horse).not.toContain("같은 글자 午(세운 지지)-午(년지)");
    expect(horse).toContain("같은 글자 丙(세운 천간)-丙(일간)");
    const twin = factsOf({ year: 1961, month: 12, day: 3 }); // 辛丑 己亥 庚午, 대운 丙午 = 세운
    expect(twin.annual.luckRelation.map(lineOf)).toEqual(["같은 간지 丙午(세운)-丙午(대운)"]);
    expect(twin.annual.relationsToNatal.map(lineOf)).toContain("같은 글자 午(세운 지지)-午(일지)");
    expect(JSON.stringify([twin.annual, twin.luck])).not.toContain("자형");
    expect(factsOf({ year: 1966, month: 6, day: 15 }).relations.map(lineOf)).toContain("자형(自刑) 午(년지)-午(월지)"); // 丙午 甲午: one chart
  });

  it("R4: 같은 글자·같은 간지 keep those words: the preamble says so and the validator rejects 복음·반음·병림, declined or not", () => {
    expect(SAJU_PREAMBLE).toContain("같은 글자·같은 간지는 그 말 그대로 써요");
    const allowed = factsOf().allowed;
    for (const word of ["복음", "伏吟", "반음", "反吟", "병림"]) {
      for (const sentence of [`세운과 월주가 겹쳐 ${word}이라고 읽어요.`, `${word}이라는 이름은 붙이지 않아요.`]) {
        const out: string[] = [];
        allowedFactViolations(sentence, allowed, out);
        expect(out.join(" ")).toContain("복음·반음·병림");
      }
    }
  });

  it("T2: a birth in the 23:00 hour of the corrected clock gets the other calendars' 일주 in limits, and its glyphs pass", () => {
    const f = factsOf({ year: 1963, month: 10, day: 6, timeKnown: true, hour: 23, minute: 50 }); // 일주 壬午, corrected 23:17
    const line = "보정 시각(23:17)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 癸未(계미)가 돼요.";
    expect(f.limits).toContain(line);
    const out: string[] = [];
    allowedFactViolations(line, f.allowed, out);
    expect(out).toEqual([]);
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
    expect(validateSajuReading(edit("시주에 申金이 있어 차분해요."), facts).join(" ")).toMatch(/간지 글자.*申/);
    // 子's 여기 壬 (편관) gives the sample chart all ten gods, so a stray one is checked on 甲子 丁丑 戊午 (no 정관, even inside)
    const stray: string[] = [];
    allowedFactViolations("정관이 두드러져요.", factsOf({ year: 1985, month: 1, day: 19 }).allowed, stray);
    expect(stray.join(" ")).toMatch(/십성.*정관/);
    expect(validateSajuReading(edit("2029년에 큰 변화가 와요."), facts).join(" ")).toMatch(/연도.*2029/);
    for (const bad of ["결혼 운이 들어와요.", "건강 진단을 받아 보세요.", "올해는 좋은 해예요.", "도화가 있어 인기가 많아요.", "신강한 명식이에요.", "반드시 성공해요."]) {
      expect(validateSajuReading(edit(bad), facts).length).toBeGreaterThan(0);
    }
    expect(hard(validateSajuReading(edit("신강·신약 라벨은 붙이지 않았어요."), facts))).toEqual([]);
    expect(hard(validateSajuReading(edit("결정인지 아닌지는 상관없이 기록해 보세요."), facts))).toEqual([]);
  });

  it("keeps this and next month's 월건 (丁酉, 戊戌) to the observation: a section that names it is flagged", () => {
    const said = (r: SajuReading) => validateSajuReading(r, facts).filter((v) => v.includes("월건"));
    const inSection = (extra: string): SajuReading => ({ ...gold, sections: gold.sections.map((s, i) => (i === 5 ? { ...s, body: `${s.body} ${extra}` } : s)) });
    expect(said(gold)).toEqual([]);
    expect(said(inSection("이번 달 월건의 결도 함께 보세요.")).join(" ")).toContain(`'${SAJU_PROLOGUE_SECTIONS[5]}' 절`);
    expect(said(inSection("다음 달 戊戌의 결도 함께 보세요."))).toHaveLength(1);
    expect(said({ ...gold, observation: { ...gold.observation, body: `${gold.observation.body} 이번 달 월건 정유(丁酉)의 결도 보세요.` } })).toEqual([]);
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
    // the smoke chart: no missing element, time known, no user context (the teaser mock ran short)
    { year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male", placeId: "busan" },
  ];

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))("passes its own validators for %s", (_label, patch) => {
    const facts = factsOf(patch);
    expect(validateSajuTeaser(mockSajuTeaser(facts), facts)).toEqual([]);
    expect(validateSajuReading(mockSajuReading(facts), facts)).toEqual([]);
    expect(validateSajuFollowUp(mockSajuFollowUp(facts), facts)).toEqual([]);
  });

  it("passes its own validators across a spread of charts (e2e and key-less dev use the mock)", () => {
    const failures: string[] = [];
    for (let i = 0; i < 48; i++) {
      const patch: Partial<SajuForm> = {
        year: 1960 + ((i * 7) % 50), month: 1 + ((i * 5) % 12), day: 1 + ((i * 11) % 28), gender: i % 2 ? "male" : "female",
        ...(i % 3 ? { timeKnown: true, hour: (i * 5) % 24, minute: (i * 13) % 60 } : {}),
      };
      const facts = factsOf(patch);
      const found = [
        ...validateSajuTeaser(mockSajuTeaser(facts), facts),
        ...validateSajuReading(mockSajuReading(facts), facts),
        ...validateSajuFollowUp(mockSajuFollowUp(facts), facts),
      ];
      if (found.length) failures.push(`${JSON.stringify(patch)}: ${found.join(" | ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("writes a prologue for a non-sample chart through the provider", async () => {
    const facts = factsOf({ year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" });
    const { data } = await generateSajuReading(mockProvider, facts);
    expect(data.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(data.sections[5]!.body).toContain(`${facts.annual.year}년`);
  });
});
