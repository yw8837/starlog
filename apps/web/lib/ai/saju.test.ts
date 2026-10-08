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
import { allowLimitPillars, allowedFactViolations, validateSajuFollowUp, validateSajuReading, validateSajuTeaser } from "./validate";
import { validateSajuTopicFollowUp, validateSajuTopicReading } from "./validateSajuTopics";
import { mockSajuTopicFollowUp, mockSajuTopicReading } from "./mockSajuTopics";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM } from "./prompts/sajuTopicPrompts";
import { buildNewYearFacts } from "./prompts/newyear";
import { buildMatchFacts } from "./prompts/match";
import { isSoftViolation } from "./style";

/** Hard violations only (soft style hints may regenerate but never fail a reading). */
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));

const NOW = Date.parse("2026-09-30T03:00:00Z"); // 2026-09-30 12:00 KST
const factsOf = (patch: Partial<SajuForm> = {}, now = NOW) => buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch })), now);
/** A 한눈에 보기 written for the gold sample's chart (己巳 丙子 丙寅) in 2026 丙午. */
const GOLD_GLANCE = {
  goesWell: "불(火) 기운이 셋으로 가장 많아, 앞에 나서서 드러내는 일에서 잘 풀리는 편이에요.",
  watchOut: "쇠(金) 기운이 겉에 없어, 끝낸 일을 셈하고 정리하는 일은 뒤로 밀리기 쉬운 편이에요.",
  remedy: "한 주를 마칠 때 끝낸 일과 쓴 돈을 한 번에 훑어보세요.",
  thisYear: "올해 병오(丙午)년에는 나와 어깨를 나란히 하는 힘(비견)이 실려, 함께 나눌 일이 늘기 쉬운 해로 읽어요.",
  thisYearAction: "함께할 사람과 맡을 몫부터 정해 보세요.",
};

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
    expect(facts.allowed.glyphs).toEqual(expect.arrayContaining(["己", "巳", "丙", "子", "寅", "庚", "戊", "癸", "甲", "辰", "午", "乙"]));
    // the window's 乙丑 is not this chart's day pillar: its 丑 (乙 is the chart's own) only where the limits are copied (review 2026-10-08)
    expect(facts.allowed.limitGlyphs).toEqual(["丑"]);
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
    const f = factsOf({}, Date.parse("2026-09-20T03:00:00Z")); // 2026-09-20 12:00 KST (한로 18 days away), day master 丙
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

  it("R1: never points at a month about to end: with ten days or less of this 월건 left, the next two instead (tester, 2026-10-07 KST, the day before 한로)", () => {
    const f = factsOf({}, Date.parse("2026-10-07T12:00:00+09:00"));
    expect([f.monthly?.current.gz, f.monthly?.current.term?.name, f.monthly?.current.term?.kst, f.monthly?.next.gz, f.monthly?.next.term?.name]).toEqual([
      "戊戌", "한로", "10월 8일 15:29", "己亥", "입동",
    ]);
    // the labels say which months they are: no "이번 달" for a month that has not begun
    const months = JSON.stringify(f.monthly);
    expect(months).toContain("戌(다음 달 월건 지지)");
    expect(months).toContain("(그다음 달 월건 지지)");
    expect(months).not.toContain("이번 달");
    // the ending 丁酉 (백로, 9월 7일) is nowhere in what the model sees, so the reading cannot send her back to it
    const prompt = sajuReadingPrompt(f);
    for (const gone of ["丁酉", "정유", "백로", "9월 7일"]) expect(prompt).not.toContain(gone);
    expect(f.allowed.glyphs).toEqual(expect.arrayContaining(["己", "亥"]));
    // more than ten days left keeps this month; ten days or less moves on (한로 2026-10-08 15:29 KST)
    const at = (iso: string) => factsOf({}, Date.parse(iso)).monthly?.current.gz;
    expect(at("2026-09-28T15:28:00+09:00")).toBe("丁酉");
    expect(at("2026-09-28T15:30:00+09:00")).toBe("戊戌");
    expect(at("2026-09-30T12:00:00+09:00")).toBe("戊戌");
    expect(at("2026-10-08T15:30:00+09:00")).toBe("戊戌"); // 戊戌 itself, once begun, is this month again
    expect(factsOf({}, Date.parse("2026-10-08T15:30:00+09:00")).monthly?.next.gz).toBe("己亥");
  });

  it("R1: names the 세운 a 월건 meets by its 간지, since the next 월건 may fall in the next 세운 (2027-01-20: 丙午 now, 壬寅 in 丁未)", () => {
    const jan = factsOf({}, Date.parse("2027-01-20T03:00:00Z"));
    expect(jan.annual.gz).toBe("丙午");
    expect(jan.monthly?.current.relationToYear.map(lineOf)).toEqual(["해(害) 丑(이번 달 월건 지지)-午(丙午 세운 지지)", "천간합(天干合) 辛(이번 달 월건 천간)-丙(丙午 세운 천간)"]);
    expect(jan.monthly?.next.relationToYear.map(lineOf)).toEqual(["천간합(天干合) 壬(다음 달 월건 천간)-丁(丁未 세운 천간)"]);
  });

  it("R1: reads the 세운 at the same moment as the 월건 (2027-02-04 08:00 KST, before 입춘 10:46: still 丙午)", () => {
    const before = factsOf({}, Date.parse("2027-02-04T08:00:00+09:00"));
    // 辛丑 ends within hours, so the months given are 壬寅 and 癸卯, both in the 丁未 세운 that 입춘 opens
    expect([before.annual.year, before.annual.gz, before.monthly?.current.gz, before.monthly?.current.yearGz]).toEqual([2026, "丙午", "壬寅", "丁未"]);
    const after = factsOf({}, Date.parse("2027-02-04T11:00:00+09:00"));
    expect([after.annual.year, after.annual.gz, after.monthly?.current.gz, after.monthly?.current.yearGz]).toEqual([2027, "丁未", "壬寅", "丁未"]);
  });

  it("N1·N2: a complete natal 삼합 in place of its 반합 pairs, and a complete 방합", () => {
    const fire = factsOf({ year: 1966, month: 11, day: 3 }); // 丙午 戊戌 丙寅
    expect(fire.relations.filter((r) => /합\(/.test(r.type)).map(lineOf)).toEqual(["삼합(三合, 불 기운) 午(년지)-戌(월지)-寅(일지)"]);
    // neutral, so no body copies a disclaimer from it (review 2026-10-08); the preamble says not to claim 化
    expect(fire.relations.find((r) => r.type.startsWith("삼합"))!.note).toBe("세 글자가 모두 있음");
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

  it("T2: a birth in the 23:00 hour of the corrected clock gets the other calendars' 일주 in limits, and its glyphs pass where the limits are copied or quoted", () => {
    const f = factsOf({ year: 1963, month: 10, day: 6, timeKnown: true, hour: 23, minute: 50 }); // 일주 壬午, corrected 23:17
    const line = "보정 시각(23:17)이 밤 11시대예요. 밤 11시대를 다음 날로 보는 만세력에서는 일주가 다음 날 일진인 癸未(계미)가 돼요.";
    expect(f.limits).toContain(line);
    const found = (text: string) => {
      const out: string[] = [];
      allowedFactViolations(text, f.allowed, out);
      return out;
    };
    expect(found(allowLimitPillars(line, f, true))).toEqual([]); // the 계산 기준 절
    expect(found(allowLimitPillars(`앞의 이야기와 이어져요. ${line}`, f))).toEqual([]); // quoted word for word
    expect(found("일주는 계미(癸未)로 읽어요.").join(" ")).toContain("未"); // presented as the chart's own (review 2026-10-08)
  });
});

describe("saju validator", () => {
  const facts = factsOf();
  const gold: SajuReading = { ...sajuSample.paid, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "앞으로 몇 주 동안 끝낸 일의 시간과 돈을 셀 때 힘이 빠지는지, 오히려 개운한지 눈여겨보세요. 개운하다면 巳 속의 경금(庚金)을 꺼내 쓰고 있다는 뜻으로 읽을 수 있어요." }, glance: GOLD_GLANCE, followUps: ["지금 대운에서 해 볼 작은 실험은요?", "오행 지도를 일상에 어떻게 쓸까요?"] };

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

  it("keeps the two 월건 of the facts (戊戌, 己亥 on 2026-09-30, eight days before 한로) to the observation: a section that names one is flagged", () => {
    const said = (r: SajuReading) => validateSajuReading(r, facts).filter((v) => v.includes("월건이 나왔어요"));
    const inSection = (extra: string): SajuReading => ({ ...gold, sections: gold.sections.map((s, i) => (i === 5 ? { ...s, body: `${s.body} ${extra}` } : s)) });
    expect(said(gold)).toEqual([]);
    expect(said(inSection("이번 달 월건의 결도 함께 보세요.")).join(" ")).toContain(`'${SAJU_PROLOGUE_SECTIONS[5]}' 절`);
    expect(said(inSection("다음 달 戊戌의 결도 함께 보세요."))).toHaveLength(1);
    expect(said(inSection("그다음 달 己亥의 결도 함께 보세요."))).toHaveLength(1);
    expect(said({ ...gold, observation: { ...gold.observation, body: `${gold.observation.body} 한로부터 드는 무술(戊戌) 월건의 결도 보세요.` } })).toEqual([]);
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

  it("knows every pillar the limits name, since the 계산 기준 절 copies them all: the chart's own, or in limitGlyphs (a warning may name another hour or day pillar)", () => {
    const named = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g;
    const missing: string[] = [];
    for (let i = 0; i < 48; i++) {
      const facts = factsOf({ year: 1960 + ((i * 7) % 50), month: 1 + ((i * 5) % 12), day: 1 + ((i * 11) % 28), ...(i % 3 ? { timeKnown: true, hour: (i * 5) % 24, minute: (i * 13) % 60 } : {}) });
      const known = new Set([...facts.allowed.glyphs, ...(facts.allowed.limitGlyphs ?? [])]);
      for (const gz of facts.limits.join(" ").match(named) ?? []) for (const g of gz) if (!known.has(g)) missing.push(`${i}: ${gz}`);
    }
    expect(missing).toEqual([]);
  });

  it("writes a prologue for a non-sample chart through the provider", async () => {
    const facts = factsOf({ year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" });
    const { data } = await generateSajuReading(mockProvider, facts);
    expect(data.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(data.sections[5]!.body).toContain(`${facts.annual.year}년`);
  });
});

describe("the pillars the limits name besides the chart's own (review 2026-10-08)", () => {
  // 庚申 戊寅 癸丑 甲寅: born 3 minutes before 05:00 on the corrected clock, so a few minutes later the 시주 would be 乙卯
  const BOUNDARY: Partial<SajuForm> = { year: 1980, month: 2, day: 10, timeKnown: true, hour: 5, minute: 30 };
  const at = Date.parse("2026-10-07T12:00:00+09:00");
  const f = factsOf(BOUNDARY, at);
  const limit = f.limits.find((l) => l.includes("乙卯"))!;
  const clean = mockSajuReading(f);
  const inSection = (i: number, extra: string): SajuReading => ({ ...clean, sections: clean.sections.map((s, j) => (j === i ? { ...s, body: `${s.body} ${extra}` } : s)) });
  const glyphFindings = (found: string[]) => hard(found).filter((v) => v.startsWith("명식에 없는 간지 글자"));

  it("keeps them out of the allow-list, in a set of their own built from the warning's pillars (never shown to the model)", () => {
    expect(f.pillars.map((p) => p.gz)).toEqual(["庚申", "戊寅", "癸丑", "甲寅"]);
    expect(limit).toContain("시주가 乙卯(을묘)가 돼요");
    expect(["乙", "卯"].filter((g) => f.allowed.glyphs.includes(g))).toEqual([]);
    expect(f.allowed.limitGlyphs).toEqual(["乙", "卯"]);
    expect(sajuReadingPrompt(f)).not.toContain("limitGlyphs");
  });

  it("fails 乙卯 on the card or in 4절 and passes it in 계산 기준, which copies the limits", () => {
    expect(validateSajuReading(clean, f)).toEqual([]);
    const card = { ...clean, glance: { ...clean.glance, goesWell: "을묘(乙卯)의 나무 기운이 있어 새로 시작하는 일에서 잘 풀려요." } };
    expect(glyphFindings(validateSajuReading(card, f))).toHaveLength(1);
    expect(glyphFindings(validateSajuReading(inSection(3, "태어난 시의 기둥은 을묘(乙卯)로 읽어요."), f))).toHaveLength(1);
    expect(glyphFindings(validateSajuReading(inSection(6, "실제로 몇 분 늦게 태어났다면 시주가 을묘(乙卯)가 될 수 있어요."), f))).toEqual([]);
  });

  it("passes a limit sentence quoted word for word in an answer, and nothing else of it", () => {
    const answer = (extra: string) => glyphFindings(validateSajuFollowUp({ kind: "clarify", answer: `${mockSajuFollowUp(f).answer} ${extra}` }, f));
    expect(answer(limit)).toEqual([]);
    expect(answer("그러면 시주는 을묘(乙卯)로 읽어요.")).toHaveLength(1);
  });

  it("lets an answer name them in its own words when the question asks about the pillars' basis (a JASI user: 다른 앱은 일주가 계미던데요?), and never a 간지 no limit names", () => {
    const jasi = factsOf({ year: 1963, month: 10, day: 6, timeKnown: true, hour: 23, minute: 50 }, at); // 일주 壬午; calendars that change the day at 23:00 show 癸未
    expect(jasi.allowed.limitGlyphs).toEqual(["未"]);
    const answer = (question: string, extra: string) => glyphFindings(validateSajuFollowUp({ kind: "clarify", answer: `${mockSajuFollowUp(jasi).answer} ${extra}` }, jasi, question));
    const why = "다른 앱에서 일주가 계미(癸未)로 나오는 건 밤 11시대를 다음 날로 보는 만세력을 써서예요.";
    for (const question of ["다른 앱은 일주가 계미던데요?", "시주는 왜 다르게 나와요?", "만세력마다 달라요?", "태어난 시각 기준이 뭐예요?"]) expect(answer(question, why), question).toEqual([]);
    expect(answer("다른 앱은 일주가 계미던데요?", "그 앱의 시주는 갑신(甲申)으로 나올 수도 있어요.").join(" ")).toContain("申");
    // any other question keeps them to a limit quoted word for word ("일주일" is not 일주)
    for (const question of ["올해 일은 어때요?", "일주일 동안 무엇을 해 볼까요?"]) expect(answer(question, why).join(" "), question).toContain("未");
  });

  it("does the same for a 운's answer (시주 乙卯 at the boundary)", () => {
    const t = buildTopicFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...BOUNDARY })), at, "career");
    const answer = (question: string, extra: string) => glyphFindings(validateSajuTopicFollowUp({ kind: "clarify", answer: `${mockSajuTopicFollowUp(t, question).answer} ${extra}` }, t, question));
    const why = "다른 앱에서 시주가 을묘(乙卯)로 나오는 건 시주가 바뀌는 시각과 몇 분 차이라서예요.";
    expect(answer("다른 앱은 시주가 을묘던데요?", why)).toEqual([]);
    expect(answer("다른 앱은 시주가 을묘던데요?", "그 앱의 일주는 갑진(甲辰)으로 나올 수도 있어요.").join(" ")).toContain("辰");
    expect(answer("올해 일은 어때요?", why).join(" ")).toContain("卯");
  });

  it("does the same for a 운: 4절 fails, 6절 계산 기준 passes", () => {
    const t = buildTopicFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...BOUNDARY })), at, "career");
    const r = mockSajuTopicReading(t);
    expect(validateSajuTopicReading(r, t).filter((v) => !isSoftViolation(v))).toEqual([]);
    const topicSection = (i: number, extra: string): SajuReading => ({ ...r, sections: r.sections.map((s, j) => (j === i ? { ...s, body: `${s.body} ${extra}` } : s)) });
    expect(glyphFindings(validateSajuTopicReading(topicSection(3, "이 10년은 을묘(乙卯)의 결로 읽어요."), t))).toHaveLength(1);
    expect(glyphFindings(validateSajuTopicReading(topicSection(5, "몇 분 늦게 태어났다면 시주가 을묘(乙卯)가 될 수 있어요."), t))).toEqual([]);
  });

  it("leaves the 신년운세 and 궁합 allow-lists as HEAD (a086c7a) built them for the same charts and moment", () => {
    const chart = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
    const sorted = (glyphs: string[]) => [...new Set(glyphs)].sort().join("");
    const hour = chart(BOUNDARY); // HOUR_BOUNDARY: 시주 乙卯
    const jasi = chart({ year: 1985, month: 3, day: 14, timeKnown: true, hour: 23, minute: 34 }); // JASI_DAY_PILLAR: 일주 癸丑, 시주 辛亥
    const into = chart({ year: 1985, month: 5, day: 20, timeKnown: true, hour: 23, minute: 30, gender: "male" }); // HOUR_BOUNDARY before 23:00: 시주 丙子, 일주 庚申
    const unknown = chart({}); // DAY_PILLAR_WINDOW
    // the twelve 월건 of 2027 hold every glyph
    for (const c of [hour, jasi, into, unknown]) expect(sorted(buildNewYearFacts(c).allowed.glyphs)).toBe("丁丑丙乙亥午卯壬子寅己巳庚戊戌未甲申癸辛辰酉");
    expect(sorted(buildMatchFacts(hour, jasi, { relation: "lover" }, at).allowed.glyphs)).toBe("丁丑丙乙午卯壬子寅己庚戊戌未甲申癸辛酉");
    expect(sorted(buildMatchFacts(unknown, into, { relation: "lover" }, at).allowed.glyphs)).toBe("丁丑丙乙亥午卯壬子寅己巳庚戊未甲申癸辛辰");
  });
});

describe("months named by 절기 and 간지 only (review 2026-10-08)", () => {
  const OBSERVATION = "앞으로 몇 주 · 확인해 볼 신호";
  const monthFindings = (r: SajuReading, f: ReturnType<typeof factsOf>) => hard(validateSajuReading(r, f)).filter((v) => v.includes("절기와 간지로만"));

  it.each(["2026-09-30T12:00:00+09:00", "2026-10-07T12:00:00+09:00"])("labels the two 월건 at %s (한로 within ten days: 다음 달, 그다음 달) where the model sees them, and the observation names no month", (iso) => {
    const f = factsOf({}, Date.parse(iso));
    expect([f.monthly?.current.label, f.monthly?.current.gz, f.monthly?.next.label, f.monthly?.next.gz]).toEqual(["다음 달", "戊戌", "그다음 달", "己亥"]);
    expect(sajuReadingPrompt(f)).toContain('{"label":"다음 달","gz":"戊戌"');
    const r = mockSajuReading(f);
    const said = (extra: string) => monthFindings({ ...r, observation: { heading: OBSERVATION, body: `${r.observation.body} ${extra}` } }, f);
    expect(said("")).toEqual([]);
    for (const month of ["9월에는 끝낸 일을 셈해 보세요.", "10월 한 달은 끝낸 일을 셈해 보세요.", "이번 달에는 끝낸 일을 셈해 보세요.", "다음 달 무술(戊戌)의 결을 보세요."]) expect(said(month), month).toHaveLength(1);
    expect(said("한로부터 드는 무술(戊戌)월의 결을 눈여겨보세요.")).toEqual([]);
  });

  it("holds for a 운's observation too: no '이번 달'·'다음 달' besides N월 (on 2026-10-07 the '다음 달' label is the 戊戌 that opens tomorrow)", () => {
    const t = buildTopicFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-07T12:00:00+09:00"), "money");
    expect([t.monthly?.current.label, t.monthly?.current.gz]).toEqual(["다음 달", "戊戌"]);
    const r = mockSajuTopicReading(t);
    const said = (extra: string) => hard(validateSajuTopicReading({ ...r, observation: { ...r.observation, body: `${r.observation.body} ${extra}` } }, t)).filter((v) => /달을 가리키는|달·계절로/.test(v));
    expect(said("")).toEqual([]);
    for (const month of ["다음 달 무술(戊戌)의 결을 눈여겨보세요.", "이번 달에는 새는 돈을 셈해 보세요.", "이달 안에 새는 돈을 셈해 보세요.", "10월에는 새는 돈을 셈해 보세요."]) expect(said(month), month).toHaveLength(1);
    expect(said("한로부터 드는 무술(戊戌)월의 결을 눈여겨보세요.")).toEqual([]);
    expect(SAJU_TOPIC_SYSTEM).toMatch(/- observation:[^\n]*'이번 달'·'다음 달'/);
  });

  it("labels 이번 달 and 다음 달 while more than ten days are left (2026-09-20)", () => {
    const f = factsOf({}, Date.parse("2026-09-20T12:00:00+09:00"));
    expect([f.monthly?.current.label, f.monthly?.current.gz, f.monthly?.next.label, f.monthly?.next.gz]).toEqual(["이번 달", "丁酉", "다음 달", "戊戌"]);
  });

  it("tells the model what the labels say and to call a month by its 절기 and 간지, never '9월에는'", () => {
    expect(SAJU_SYSTEM).toMatch(/- observation:[^\n]*label\(이번 달·다음 달·그다음 달\)[^\n]*'9월에는'/);
    expect(SAJU_TOPIC_SYSTEM).toMatch(/- observation:[^\n]*label\(이번 달·다음 달·그다음 달\)[^\n]*'9월에는'/);
  });
});

describe("the preamble's section names in the plain headings (review 2026-10-08)", () => {
  it("maps 십성·일지·대운 절 and 지금의 10년 절 onto sections 3, 4 and 6", () => {
    const formats = SAJU_SYSTEM.slice(SAJU_PREAMBLE.length);
    for (const name of ["십성·일지·대운 절", "십성이나 일지 절", "지금의 10년 절"]) expect(SAJU_PREAMBLE).toContain(name);
    expect(formats).toMatch(/\n {2}3\. 나를 움직이는 힘\(위 규칙의 "십성 절"이 이 절이에요\)/);
    expect(formats).toMatch(/\n {2}4\. 가까운 관계 속 나\(위 규칙의 "일지 절"이 이 절이에요\)/);
    expect(formats).toMatch(/\n {2}6\. 지금의 10년과 올해\(위 규칙의 "대운 절"과 "지금의 10년 절"이 이 절이에요\)/);
  });
});
