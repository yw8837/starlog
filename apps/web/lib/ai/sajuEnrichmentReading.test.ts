import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { SAJU_GAEUN_HEADING, SAJU_NAMES_HEADING, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { mockSajuReading } from "./mock";
import { mockSajuTopicReading } from "./mockSajuTopics";
import { MATCH_SAJU_SYSTEM, buildMatchFacts, matchSajuShared } from "./prompts/match";
import { NEWYEAR_SYSTEM, buildNewYearFacts, newyearShared } from "./prompts/newyear";
import { SAJU_LOCKED_TOC, SAJU_SYSTEM, SINSAL_BASIS_LINE, buildFactSet, sajuFollowUpPrompt, sajuReadingPrompt, sajuTeaserPrompt } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM, topicFactsBlock } from "./prompts/sajuTopicPrompts";
import type { SajuReading } from "./schemas";
import { isSoftViolation } from "./style";
import { charCount, validateSajuFollowUp, validateSajuReading } from "./validate";
import { validateSajuTopicReading } from "./validateSajuTopics";

// docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §3, §4
const NOW = Date.parse("2026-10-08T12:00:00+09:00");
const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const factsOf = (patch: Partial<SajuForm>) => buildFactSet(chartOf(patch), NOW);
const DOBI: Partial<SajuForm> = { year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 }; // 甲辰 壬寅 庚申 戊辰
const NO_NAME: Partial<SajuForm> = { year: 1987, month: 9, day: 9, timeKnown: true, hour: 9, minute: 30 }; // 壬辰 辛酉 己酉 丁卯
const hard = (found: string[]) => found.filter((v) => !isSoftViolation(v));
const NAMES = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_NAMES_HEADING);
const GAEUN = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_GAEUN_HEADING);
const BASIS = SAJU_PROLOGUE_SECTIONS.length - 1;
const added = (r: SajuReading, i: number, extra: string): SajuReading => ({ ...r, sections: r.sections.map((s, j) => (j === i ? { ...s, body: `${s.body} ${extra}` } : s)) });

describe("정통 사주 holds two more sections, before 계산 기준", () => {
  it("names them in the code-owned headings and the locked list", () => {
    expect(SAJU_PROLOGUE_SECTIONS).toHaveLength(9);
    expect([NAMES, GAEUN, BASIS]).toEqual([6, 7, 8]);
    expect(SAJU_NAMES_HEADING).toBe("이름표 풀이 · 이 명식에 붙는 이름들");
    expect(SAJU_GAEUN_HEADING).toBe("기운 채우기 · 적은 기운을 곁에 두는 법");
    expect(SAJU_PROLOGUE_SECTIONS[BASIS]).toMatch(/^계산 기준 · /);
    expect(SAJU_LOCKED_TOC).toHaveLength(11);
  });
});

describe("the facts (정통 only)", () => {
  const f = factsOf(DOBI);

  it("carry 도비's names with where they came from, and the scarce element with its row", () => {
    expect(f.sinsal).toEqual([
      { name: "문창귀인", basis: "일간", basisGlyph: "壬", hits: ["일간 壬 → 일지 寅"], meaning: "글과 말, 공부로 생각을 꺼내는 쪽에 붙는 이름" },
      { name: "학당귀인", basis: "일간", basisGlyph: "壬", hits: ["일간 壬 → 월지 申"], meaning: "배움이 자라기 쉬운 자리에 붙는 이름" },
      { name: "역마", basis: "연지", basisGlyph: "辰", hits: ["연지 辰 → 일지 寅", "일지 寅 → 월지 申"], meaning: "움직임과 변화에 열린 배치에 붙는 이름" },
      { name: "화개", basis: "연지", basisGlyph: "辰", hits: ["연지 辰 → 시지 辰"], meaning: "혼자 깊이 파고드는 몰입에 붙는 이름" },
    ]);
    expect(f.scarce).toEqual([
      { element: "불(火)", count: 0, hidden: true, colour: "빨강·주황", direction: "남쪽", habits: ["낮 햇볕 10분", "땀 나는 걷기", "먼저 인사하기"], environment: ["따뜻한 색 조명"] },
    ]);
  });

  it("carry no name and every tied element for a chart with none", () => {
    const none = factsOf(NO_NAME);
    expect(none.sinsal).toEqual([]);
    expect(none.scarce.map((s) => [s.element, s.count, s.hidden])).toEqual([["나무(木)", 1, false], ["불(火)", 1, false], ["물(水)", 1, false]]);
  });

  it("reach the full reading's prompt only: not the teaser, a follow-up, a 운, 신년운세 or 궁합", () => {
    expect(sajuReadingPrompt(f)).toContain('"sinsal":[{"name":"문창귀인"');
    expect(sajuReadingPrompt(f)).toContain('"scarce":[{"element":"불(火)"');
    const elsewhere = [
      sajuTeaserPrompt(f),
      sajuFollowUpPrompt(f, mockSajuReading(f), [], "더 알려 주세요"),
      topicFactsBlock(buildTopicFactSet(chartOf(DOBI), NOW, "career")),
      newyearShared(buildNewYearFacts(chartOf(DOBI))),
      matchSajuShared(buildMatchFacts(chartOf(DOBI), chartOf(NO_NAME), { relation: "lover" }, NOW)),
    ];
    for (const prompt of elsewhere) expect(prompt).not.toMatch(/"sinsal"|"scarce"/);
    expect(buildTopicFactSet(chartOf(DOBI), NOW, "career")).not.toHaveProperty("sinsal");
  });
});

describe("the prompt (정통 only)", () => {
  it("describes 7절 and 8절 in the voice template with their lengths, and the basis sentence for 9절", () => {
    expect(SAJU_SYSTEM).toContain("sections: 정확히 9개");
    expect(SAJU_SYSTEM).toContain("합계 2,700~4,100자");
    expect(SAJU_SYSTEM).toMatch(/7절\(280~420자\)과 8절\(250~380자\)도 같은 네 칸으로/);
    expect(SAJU_SYSTEM).toMatch(/\n {2}7\. 이름표 풀이: <facts>의 sinsal에 있는 이름만[^\n]*이 절 하나/);
    expect(SAJU_SYSTEM).toMatch(/\n {2}8\. 기운 채우기: <facts>의 scarce[^\n]*이사·해외·머리 방향[^\n]*행운의 숫자/);
    expect(SAJU_SYSTEM).toMatch(/\n {2}9\. 계산 기준: [^\n]*귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요/);
    expect(SINSAL_BASIS_LINE).toBe("귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요.");
  });

  it("keeps the 신살 ban as it was in the 운, 신년운세 and 궁합 prompts", () => {
    for (const system of [SAJU_TOPIC_SYSTEM, NEWYEAR_SYSTEM]) {
      expect(system).toContain("신강·신약, 용신, 격국, 신살(도화, 역마, 공망, 귀인 등), 삼재·원진·백호 같은 라벨은 쓰지 않아요.");
      expect(system).not.toMatch(/sinsal|이름표 풀이|scarce/);
    }
    expect(MATCH_SAJU_SYSTEM).toContain("신강·신약, 용신, 격국, 신살(도화, 역마, 원진, 귀인 같은 것) 라벨을 쓰지 않아요.");
  });
});

describe("the validators", () => {
  const f = factsOf(DOBI);
  const clean = mockSajuReading(f);
  const findings = (r: SajuReading) => hard(validateSajuReading(r, f)).join("\n");

  it("pass the mock, which names 도비's names in 7절 and her 불 in 8절", () => {
    expect(validateSajuReading(clean, f)).toEqual([]);
    const seven = clean.sections[NAMES]!.body;
    for (const name of ["문창귀인", "학당귀인", "역마", "화개"]) expect(seven).toContain(name);
    expect(seven).not.toMatch(/천을귀인|도화/);
    expect(clean.sections[GAEUN]!.body).toMatch(/여덟 글자 가운데 불 기운이 0개/);
    expect(clean.sections[BASIS]!.body).toContain(SINSAL_BASIS_LINE);
  });

  it("allow a name of the facts in 7절, and fail the same name anywhere else", () => {
    expect(findings(added(clean, NAMES, "문창귀인은 생각을 글로 먼저 꺼내 보는 쪽에 붙는 이름이에요."))).toBe("");
    expect(findings(added(clean, 2, "문창귀인이라는 이름처럼 글로 생각을 꺼내는 쪽이에요."))).toMatch(/'나를 움직이는 힘[^']*'에 살·귀인 이름\(문창귀인\)/);
    const card = { ...clean, glance: { ...clean.glance, goesWell: "역마라는 이름처럼 움직이며 생각을 정리할 때 잘 풀려요." } };
    expect(findings(card)).toMatch(/살·귀인 이름\(역마\)/);
    expect(findings({ ...clean, observation: { ...clean.observation, body: `${clean.observation.body} 화개의 몰입이 늘어나는지도 보세요.` } })).toMatch(/살·귀인 이름\(화개\)/);
  });

  it("fail a name the facts do not hold, even in 7절", () => {
    expect(findings(added(clean, NAMES, "도화라는 이름도 붙어 사람의 시선을 끌어요."))).toMatch(/붙지 않은 이름\(도화\)/);
    expect(findings(added(clean, NAMES, "천을귀인도 함께 붙어 도움을 청하기 쉬워요."))).toMatch(/붙지 않은 이름\(천을귀인\)/);
  });

  it("fail a hidden or held name anywhere, even declined, 계산 기준 included", () => {
    for (const [i, extra] of [[NAMES, "백호 같은 무서운 이름은 붙지 않았어요."], [BASIS, "공망·원진·삼재는 따지지 않았어요."], [3, "양인 같은 말은 쓰지 않아요."]] as const) {
      expect(findings(added(clean, i, extra)), extra).toMatch(/숨기거나 보류한 살 이름/);
    }
  });

  it("fail a name read as an event or a cause, even declined", () => {
    for (const extra of ["귀인을 만나게 될 거예요.", "귀인이 나타난다는 뜻은 아니에요.", "귀인의 도움을 받기 쉬워요.", "역마살이 있어서 이사가 잦아요.", "문창귀인이 있어서 글을 잘 써요."]) {
      expect(findings(added(clean, NAMES, extra)), extra).toMatch(/사건이나 까닭/);
    }
    expect(findings(added(clean, NAMES, "이 이름들은 누가 나타난다는 예고가 아니에요."))).toBe("");
  });

  it("let 9절 name them in the basis sentence, as copied", () => {
    expect(findings(added(clean, BASIS, "도화·역마·화개는 태어난 해와 날의 지지로 찾았어요."))).toBe("");
  });

  it("8절: no luck number, no promise, no health, directions only as small choices", () => {
    expect(findings(added(clean, GAEUN, "행운의 숫자는 3이에요."))).toMatch(/행운의 숫자/);
    for (const extra of ["빨강을 곁에 두면 운이 트여요.", "따뜻한 조명이 돈이 들어오는 효과가 있어요."]) expect(findings(added(clean, GAEUN, extra)), extra).toMatch(/효과를 약속/);
    for (const extra of ["햇볕을 쬐면 면역이 좋아져요.", "반신욕을 하면 몸이 가벼워져요."]) expect(findings(added(clean, GAEUN, extra)), extra).toMatch(/몸이나 마음 건강/);
    for (const extra of ["남쪽으로 이사해 보세요.", "잘 때 머리를 남쪽으로 두세요."]) expect(findings(added(clean, GAEUN, extra)), extra).toMatch(/큰 방향/);
    expect(findings(added(clean, GAEUN, "출근길도 남쪽으로 난 길을 골라 걸어도 좋아요."))).toBe("");
    // a count is not a lucky number, and a sentence that declines a big move or a promise is fine
    for (const extra of ["숫자로 세면 불 기운은 0개예요.", "이사나 해외처럼 큰 결정과는 상관없는 제안이에요.", "효과를 약속하는 이야기는 아니에요."]) {
      expect(findings(added(clean, GAEUN, extra)), extra).toBe("");
    }
    // the 8절 rules are 8절's: a scene elsewhere may say 불안 or 이사
    expect(findings(added(clean, 4, "이사를 앞두고 짐을 싸던 때를 떠올려 봐도 좋아요."))).toBe("");
  });

  it("ask 7절 for 280~420자, 8절 for 250~380자 and 계산 기준 for 300~550자; the whole for 2,700~4,100자", () => {
    const short = (i: number) => validateSajuReading({ ...clean, sections: clean.sections.map((s, j) => (j === i ? { ...s, body: "짧아요." } : s)) }, f).join("\n");
    expect(short(NAMES)).toContain(`'${SAJU_NAMES_HEADING}' 절이 공백 제외 4자예요. 280~420자로 써 주세요.`);
    expect(short(GAEUN)).toContain(`'${SAJU_GAEUN_HEADING}' 절이 공백 제외 4자예요. 250~380자로 써 주세요.`);
    expect(short(BASIS)).toContain("300~550자로 써 주세요.");
    const total = clean.sections.reduce((n, s) => n + charCount(s.body), 0);
    expect(total).toBeGreaterThanOrEqual(2700 * 0.75);
    expect(validateSajuReading({ ...clean, sections: clean.sections.map((s) => ({ ...s, body: s.body.slice(0, 160) })) }, f).join("\n")).toMatch(/2,700~4,100자로 맞춰 주세요/);
  });

  it("let a follow-up name one only when the question does", () => {
    const answer = "역마는 움직임과 변화에 열린 배치에 붙는 이름이에요. 같은 명식으로 이어서 보면 한자리에 오래 머무는 날보다 자리를 옮겨 가며 생각을 정리하는 날에 마음이 가벼워지기 쉬워요. 이번 주에는 늘 앉던 자리 말고 다른 자리에서 하루 한 번 일을 해 보세요. 그렇게 자리를 바꾼 날에 생각이 어떻게 풀리는지 떠올려 보면 이 이름이 내게 어떻게 닿는지 가늠할 수 있어요.";
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer }, f, "역마가 뭐예요?"))).toEqual([]);
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer }, f, "올해는 어때요?")).join("\n")).toMatch(/살·귀인 이름/);
  });

  it("keep the 운's ban: a name there fails as before, a hidden one even declined", () => {
    const t = buildTopicFactSet(chartOf(DOBI), NOW, "career");
    const r = mockSajuTopicReading(t);
    const topic = (extra: string) => hard(validateSajuTopicReading({ ...r, sections: r.sections.map((s, i) => (i === 2 ? { ...s, body: `${s.body} ${extra}` } : s)) }, t)).join("\n");
    expect(topic("")).toBe("");
    expect(topic("역마가 있어 자리를 자주 옮겨요.")).toMatch(/살·귀인/);
    expect(topic("백호 같은 이름은 쓰지 않았어요.")).toMatch(/숨기거나 보류한 살 이름/);
  });
});

describe("the mock writes 7절 and 8절 in the new voice", () => {
  it.each([["도비", DOBI], ["no name", NO_NAME], ["시 모름 sample", {}]] as const)("%s: a scene question first, 4~8 sentences, its own length, bold, and no finding", (_label, patch) => {
    const f = factsOf(patch);
    const r = mockSajuReading(f);
    for (const [i, [min, max]] of [[NAMES, [280, 420]], [GAEUN, [250, 380]]] as const) {
      const body = r.sections[i]!.body;
      const sentences = body.split(/(?<=[.?!])\s+/);
      expect(sentences[0], body).toMatch(/\?$/);
      expect(sentences.length, body).toBeGreaterThanOrEqual(4);
      expect(sentences.length, body).toBeLessThanOrEqual(8);
      expect(charCount(body), body).toBeGreaterThanOrEqual(min);
      expect(charCount(body), body).toBeLessThanOrEqual(max);
      expect(body.match(/\*\*[^*]+\*\*/g)?.length, body).toBeGreaterThanOrEqual(1);
    }
    expect(validateSajuReading(r, f)).toEqual([]);
  });

  it("says, for a chart with no name, that the common names were checked, without listing them", () => {
    const seven = mockSajuReading(factsOf(NO_NAME)).sections[NAMES]!.body;
    expect(seven).toMatch(/흔히 찾아보는 이름/);
    expect(seven).not.toMatch(/귀인|도화|역마|화개/);
  });
});
