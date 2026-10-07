import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { describe, expect, it } from "vitest";
import type { SajuTopicId } from "@/lib/reading/types";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { mockSajuReading } from "./mock";
import { mockSajuTopicReading } from "./mockSajuTopics";
import { PLAIN_WORDS, bareFirstTerms, glossOnce, outsideBrackets } from "./plainWords";
import { SAJU_PREAMBLE, SAJU_SYSTEM, buildFactSet } from "./prompts/saju";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM } from "./prompts/sajuTopicPrompts";
import { NEWYEAR_SYSTEM } from "./prompts/newyear";
import { StoredSajuReadingSchema, type SajuGlance, type SajuReading } from "./schemas";
import { isSoftViolation } from "./style";
import { validateSajuReading } from "./validate";
import { validateSajuTopicReading } from "./validateSajuTopics";

/** 한눈에 보기 (owner 2026-10-07): the card on top of every saju full reading. */

const NOW = Date.parse("2026-10-07T12:00:00+09:00"); // the tester's day
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));
const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), NOW); // 己巳 丙子 丙寅, 2026 丙午
const clean = mockSajuReading(facts);
const withGlance = (r: SajuReading, patch: Partial<SajuGlance>): SajuReading => ({ ...r, glance: { ...r.glance, ...patch } });
const standardHard = (patch: Partial<SajuGlance>) => hard(validateSajuReading(withGlance(clean, patch), facts)).join("\n");

const chartOf = (id: string) => computeChart(toSajuInput(golden.charts.find((c) => c.id === id)!.birth as SajuForm));
const TOPICS: SajuTopicId[] = ["love", "reunion", "money", "career"];
const topicHard = (topic: SajuTopicId, patch: Partial<SajuGlance>, id = "C1") => {
  const f = buildTopicFactSet(chartOf(id), NOW, topic);
  return hard(validateSajuTopicReading(withGlance(mockSajuTopicReading(f), patch), f)).join("\n");
};

describe("plain words (owner 2026-10-07: plain words first, the term in brackets)", () => {
  it("glosses a term once, in the owner's own examples", () => {
    const say = glossOnce();
    expect([say("식신"), say("편관"), say("제왕"), say("식신")]).toEqual(["내 재주를 꺼내 쓰는 힘(식신)", "바깥에서 오는 압박과 책임(편관)", "기운이 가장 꽉 찬 단계(제왕)", "식신"]);
    // a gloss is plain: no term of the list inside it, and no grade
    for (const plain of Object.values(PLAIN_WORDS)) expect([plain, bareFirstTerms(plain)]).toEqual([plain, []]);
  });

  it("finds a term whose first appearance is bare, and leaves 상관없이, 계획을 세운, 3일간 alone", () => {
    expect(bareFirstTerms("식신이 넷이고 편관이 일간과 맞서요.")).toEqual(["식신", "편관", "일간"]);
    expect(bareFirstTerms("내 재주를 꺼내 쓰는 힘(식신)이 넷이에요. 식신은 손에 익은 일에서 드러나요.")).toEqual([]);
    expect(bareFirstTerms("상관없이 해 보세요. 계획을 세운 뒤 3일간 지켜봐요.")).toEqual([]);
    expect(outsideBrackets("한 해의 흐름(세운)이에요")).toBe("한 해의 흐름이에요");
  });
});

describe("the 한눈에 보기 card of 전체 흐름", () => {
  it("is in the mock and passes every check, hard and soft", () => {
    expect(Object.keys(clean)).toEqual(["sections", "observation", "glance", "followUps"]);
    expect(validateSajuReading(clean, facts)).toEqual([]);
    // this year's 세운 by its 간지, terms only in brackets
    expect(clean.glance.thisYear).toMatch(/병오\(丙午\)/);
    for (const text of Object.values(clean.glance)) expect(bareFirstTerms(outsideBrackets(text))).toEqual([]);
  });

  it.each([
    ["a grade word", { goesWell: "올해는 대길한 흐름이라 무엇을 해도 잘 풀려요." }, /길흉·점수/],
    ["최고 and 최악", { watchOut: "돈 관리는 이 명식에서 최악인 쪽이라 조심해요." }, /길흉·점수/],
    ["a score", { goesWell: "일하는 힘은 100점 만점에 90점이라 잘 풀려요." }, /길흉·점수/],
    ["a star rating", { thisYear: "올해 병오(丙午)년의 흐름은 ★★★★로 힘이 실리는 해예요." }, /길흉·점수/],
    ["luck graded", { thisYear: "올해 병오(丙午)년은 운이 좋아서 무엇이든 해 볼 만해요." }, /길흉·점수/],
    ["a colour", { remedy: "파란색 소품을 책상에 두고 일해 보세요." }, /색·방향/],
    ["a direction", { remedy: "아침마다 동쪽으로 산책을 나가 보세요." }, /색·방향/],
    ["filling a missing element", { remedy: "모자란 쇠 기운을 채워 줄 물건을 곁에 두세요." }, /색·방향/],
    ["filling by element", { remedy: "물 기운을 채워 주는 습관부터 시작해 보세요." }, /색·방향/],
    ["a 용신 verdict", { remedy: "용신인 물 기운을 살리는 쪽으로 움직여 보세요." }, /용신·신강/],
    ["신강 even declined", { goesWell: "신강·신약은 따지지 않아도 일에서 힘이 붙어요." }, /용신·신강/],
    ["a bare term", { goesWell: "식신이 넷이라 손에 익은 일에서 잘 풀리는 편이에요." }, /괄호/],
    ["the 대운 named bare", { thisYear: "올해 병오(丙午)년은 대운과 겹쳐 움직임이 늘어나는 해로 읽어요." }, /괄호/],
    ["no 세운 간지", { thisYear: "올해는 드러내고 알리는 쪽에 힘이 실리는 해로 읽어요." }, /올해 세운/],
    ["a month", { thisYear: "올해 병오(丙午)년은 9월에 정리하는 힘이 실리는 해예요." }, /시기/],
    ["a countdown", { thisYearAction: "3개월 안에 새 일 하나를 신청해 보세요." }, /시기/],
    ["a season", { thisYearAction: "올해 겨울에는 배우고 싶던 것을 신청해 보세요." }, /시기/],
    ["this and next month's 월건", { thisYearAction: "다음 달 월건의 결에 맞춰 일정을 줄여 보세요." }, /월건/],
    ["two sentences", { remedy: "하루를 마칠 때 끝낸 일을 닫아 두세요. 그러면 다음 날이 가벼워요." }, /한 문장/],
    ["too long", { watchOut: `${"끝맺음과 정리를 미루기 쉬운 편이라서 ".repeat(5)}조심해요.` }, /공백 제외/],
    ["empty", { thisYearAction: "" }, /공백 제외/],
    ["an invented glyph", { goesWell: "申金 기운이 숨어 있어 정리하는 일에서 잘 풀려요." }, /간지 글자/],
    ["the blocklist", { goesWell: "반드시 일에서 잘 풀리는 명식이에요." }, /단정·수치 표현/],
    ["not 해요체", { watchOut: "끝맺음을 미루기 쉬운 편이다." }, /해요체/],
  ] as const)("fails %s", (_label, patch, finding) => {
    expect(standardHard(patch)).toMatch(finding);
  });

  it("passes plain everyday wording with a term in brackets", () => {
    expect(standardHard({
      goesWell: "나와 어깨를 나란히 하는 힘(비견)이 있어, 함께 일할 때 손이 빨라지는 편이에요.",
      remedy: "쉬는 날 하루는 일정을 비우고 푹 쉬면서 기운을 채워 보세요.",
      thisYearAction: "올해 남은 기간에 배우고 싶던 강좌 하나를 신청해 보세요.",
    })).toBe("");
  });

  it("soft-flags a term whose first appearance in the reading is bare", () => {
    const bare = { ...clean, sections: clean.sections.map((s, i) => (i === 0 ? { ...s, body: `편관이 두드러져요. ${s.body}` } : s)) };
    const found = validateSajuReading(bare, facts);
    expect(hard(found)).toEqual([]);
    expect(found.join("\n")).toMatch(/\[문체\] 명리 용어가 처음 나올 때 쉬운 말이 먼저 오지 않았어요: 편관/);
  });
});

describe("the 한눈에 보기 card of each 운 (same card, the topic's own checks)", () => {
  it.each(golden.charts.flatMap((c) => TOPICS.map((topic) => [c.id, topic] as const)))("%s %s: the mock card passes, hard and soft", (id, topic) => {
    const f = buildTopicFactSet(chartOf(id), NOW, topic);
    const r = mockSajuTopicReading(f);
    expect(Object.keys(r)).toEqual(["sections", "observation", "glance", "followUps"]);
    expect(validateSajuTopicReading(r, f).filter((v) => /쉬운 말|한눈에 보기|길흉|올해 세운/.test(v))).toEqual([]);
    expect(hard(validateSajuTopicReading(r, f))).toEqual([]);
    expect(r.glance.thisYear).toContain(f.annual.ko);
  });

  it.each([
    ["money", { thisYear: "올해 병오(丙午)년은 3개월 안에 돈이 모이는 흐름이에요." }, /시기를 지정한 문장/],
    ["money", { goesWell: "재물운이 강해서 돈이 잘 붙는 편이에요." }, /재물운의 세기/],
    ["money", { thisYear: "올해 병오(丙午)년은 돈이 들어오는 해로 읽어요." }, /돈이 들어오는 때/],
    ["reunion", { goesWell: "그 사람과 다시 이어질 거예요." }, /재회를 판정한 문장/],
    ["love", { thisYear: "올해 병오(丙午)년에는 곧 인연이 나타나요." }, /만남·이별을 예언한 문장/],
    ["career", { remedy: "지금 회사는 그만두세요." }, /이직·퇴사를 정해 주는 문장/],
    ["career", { thisYear: "올해 병오(丙午)년 하반기에 일이 바빠지는 해예요." }, /달·계절로 시기를 짚은 문장/],
    ["love", { watchOut: "편관이 많아 관계에서 지치기 쉬운 편이에요." }, /괄호/],
  ] as const)("%s fails %s", (topic, patch, finding) => {
    expect(topicHard(topic, patch)).toMatch(finding);
  });
});

describe("the card's time words (review 2026-10-08)", () => {
  const windows = [
    ["a window in Hangul numbers", { thisYearAction: "한 달 안에 배우고 싶던 강좌 하나를 신청해 보세요." }],
    ["몇 주 뒤", { remedy: "몇 주 뒤에 쓴 돈과 시간을 한 번에 훑어보세요." }],
    ["두 해 이내", { thisYearAction: "두 해 이내에 마칠 공부 하나를 정해 보세요." }],
    ["이번 달", { thisYearAction: "이번 달에는 배우고 싶던 강좌 하나를 신청해 보세요." }],
    ["다음 달", { remedy: "다음 달부터 하루 일정에 아무것도 넣지 않는 빈칸을 만들어 두세요." }],
    ["그다음 달", { thisYearAction: "그다음 달에 미뤄 둔 정리를 시작해 보세요." }],
    ["일주일 안에", { thisYearAction: "일주일 안에 배우고 싶던 강좌 하나를 신청해 보세요." }],
    ["이달 안에", { remedy: "이달 안에 미뤄 둔 정리 하나를 끝내 보세요." }],
    ["열흘 안에", { thisYearAction: "열흘 안에 미뤄 둔 신청 하나를 마쳐 보세요." }],
    ["보름 뒤", { remedy: "보름 뒤에 쓴 돈과 시간을 한 번에 훑어보세요." }],
  ] as const;
  it.each(windows)("전체 흐름 fails %s", (_label, patch) => {
    expect(standardHard(patch)).toMatch(/시기를 짚은 말/);
  });
  it.each(windows)("each 운 fails %s too", (_label, patch) => {
    expect(topicHard("money", patch)).toMatch(/시기를 짚은 말/);
  });

  it("catches a 월건 written in Hangul (기해월) on the card", () => {
    const m = facts.monthly!.next;
    expect(m.gz).toBe("己亥");
    expect(standardHard({ thisYearAction: `${m.ko}월에는 미뤄 둔 정리를 시작해 보세요.` })).toMatch(/월건/);
    expect(topicHard("money", { thisYearAction: `${m.ko}월에는 고정으로 나가는 돈을 점검해 보세요.` })).toMatch(/월건/);
  });

  it("fails a 대운 change's 년·월 on a 운's card (2027년 8월 무렵), which a section may still quote", () => {
    const f = buildTopicFactSet(chartOf("C4"), NOW, "career");
    expect(f.allowed.yearMonths).toContain("2027-08");
    const r = mockSajuTopicReading(f);
    const card = withGlance(r, { thisYear: "올해 병오(丙午)년은 2027년 8월 무렵까지 일하는 방식을 다지는 해로 읽어요." });
    expect(hard(validateSajuTopicReading(card, f)).join("\n")).toMatch(/한눈에 보기에 시기를 짚은 말이 있어요\("8월"\)/);
    const section = { ...r, sections: r.sections.map((s, i) => (i === 3 ? { ...s, body: `${s.body} 2027년 8월 무렵에는 일하는 방식을 다시 살펴보세요.` } : s)) };
    expect(hard(validateSajuTopicReading(section, f))).toEqual([]);
  });
});

describe("the card's make-up is an everyday act (review 2026-10-08)", () => {
  it.each([
    ["북돋워", { remedy: "쇠 기운을 북돋워 주는 산책을 저녁마다 해 보세요." }],
    ["메워", { remedy: "모자란 기운을 메워 줄 쉬는 시간을 먼저 만들어 보세요." }],
    ["살리는", { remedy: "물 기운을 살리는 습관 하나를 들여 보세요." }],
    ["오행을 북돋는", { remedy: "오행을 북돋는 일 하나를 골라 매일 해 보세요." }],
    ["a pot plant", { remedy: "책상 위에 작은 화분 하나를 두고 돌봐 보세요." }],
    ["a bracelet", { thisYearAction: "올해는 팔찌 하나를 늘 차고 다녀 보세요." }],
    ["a candle", { remedy: "잠들기 전에 향초를 켜고 하루를 정리해 보세요." }],
    ["a prop", { remedy: "마음에 드는 소품 하나를 곁에 두고 일해 보세요." }],
    ["a lucky number", { thisYearAction: "숫자 7이 들어간 날에 새 일을 시작해 보세요." }],
  ] as const)("fails %s", (_label, patch) => {
    expect(standardHard(patch)).toMatch(/색·방향/);
  });

  it("lets goesWell and watchOut describe a tendency (the make-up rules read remedy and thisYearAction only)", () => {
    expect(standardHard({ goesWell: "푸른 나무처럼 곧게 뻗어 가는 일에서 잘 풀리는 편이에요." })).toBe("");
    expect(standardHard({ watchOut: "쇠 기운을 살리기보다 버티는 쪽으로 기울기 쉬운 편이에요." })).toBe("");
  });
});

describe("false positives that cost a paid regeneration (review 2026-10-08)", () => {
  it.each([
    ["세운 as 세우다 (계획)", "새로 세운 계획을 먼저 지켜 보세요."],
    ["세운 as 세우다 (기준)", "스스로 세운 기준을 한 줄로 정리해 두세요."],
    ["세운 as 세우다 (목표)", "미리 세운 목표부터 하나씩 해 보세요."],
    ["관성 as inertia", "관성처럼 굴러가던 습관을 한 번 멈춰 보세요."],
    ["식상하다", "식상한 말 대신 내 말로 꺼내 보세요."],
    ["인성 as character", "인성이 좋은 사람으로 기억되는 편이에요."],
    ["지지 as support", "주변의 지지를 받는 편이에요. 응원과 지지가 힘이 돼요. 지지해 주는 사람이 곁에 있어요."],
    ["지지 as support (주변의 지지가)", "주변의 지지가 큰 힘이 되는 편이에요."],
    ["지지 as support (든든한 지지가)", "든든한 지지가 곁에 있을 때 손이 빨라지는 편이에요."],
    ["지지 glossed at its first appearance", "기둥의 아래 글자(지지)에 뿌리가 있어요. 지지에 실린 기운도 함께 봐요."],
    ["세운 as 세우다 (목표 세운 뒤)", "목표 세운 뒤 하루에 하나씩 지켜 보세요."],
    ["기본기", "기본기를 차근차근 다져 보세요."],
    ["천간합 (a relation's name)", "천간합(天干合)은 묶이려는 성질로만 읽어요."],
  ])("is not a bare term: %s", (_label, text) => {
    expect(bareFirstTerms(text)).toEqual([]);
  });

  it.each([
    ["세운", "세운이 들어오는 해예요."],
    ["관성", "관성이 겉에 없어요."],
    ["식상", "식상이 둘이에요."],
    ["인성", "인성이 겉에 없어요."],
    ["지지", "지지에 뿌리가 있어요."],
    ["지지", "그 기둥의 지지가 일지와 부딪혀요."],
    ["월지", "월지가 일지와 부딪혀요."],
  ])("still finds the term %s used bare", (term, text) => {
    expect(bareFirstTerms(text)).toEqual([term]);
  });

  it("still finds 지지 beside 천간, and as the place a group or a 대운 stands in", () => {
    expect(bareFirstTerms("천간과 지지를 함께 봐요.")).toEqual(["천간", "지지"]);
    expect(bareFirstTerms("재성은 지금 대운 지지에 실려 있어요.")).toEqual(["재성", "지지", "대운"]);
    expect(bareFirstTerms("십성은 지지 본기 기준으로 셌어요.")).toEqual(["지지", "본기", "십성"]);
  });

  it.each([
    ["분기점", { thisYear: "올해 병오(丙午)년은 일하는 방식이 바뀌는 분기점으로 읽어요." }],
    ["최악의 경우 as a tendency", { watchOut: "일이 몰리면 최악의 경우부터 떠올리기 쉬운 편이에요." }],
    ["자격 검정", { thisYearAction: "자격 검정 일정을 하나 알아보세요." }],
    ["검정고시", { remedy: "미뤄 둔 검정고시 공부를 하루 한 쪽씩 해 보세요." }],
    ["세운 계획 on the card", { remedy: "새로 세운 계획 하나를 한 주 동안 지켜 보세요." }],
    ["주변의 지지가 on the card", { goesWell: "주변의 지지가 큰 힘이 되어 함께하는 일에서 잘 풀리는 편이에요." }],
    ["든든한 지지가 on the card", { goesWell: "든든한 지지가 곁에 있을 때 맡은 일에서 잘 풀리는 편이에요." }],
    ["목표 세운 뒤 on the card", { remedy: "목표 세운 뒤 한 주 동안 하루에 하나씩 지켜 보세요." }],
    ["최고를 고집 as a habit", { watchOut: "무엇이든 최고를 고집하다 지치기 쉬운 편이에요." }],
  ] as const)("passes the card: %s", (_label, patch) => {
    expect(standardHard(patch)).toBe("");
  });

  it("passes 분기점 on a 운's card and in its sections too", () => {
    expect(topicHard("career", { thisYear: "올해 병오(丙午)년은 일하는 방식이 바뀌는 분기점으로 읽어요." })).toBe("");
  });

  it.each([
    ["다음 분기", { thisYear: "올해 병오(丙午)년은 다음 분기에 힘이 실리는 해예요." }, /시기/],
    ["하반기", { thisYear: "올해 병오(丙午)년은 하반기에 힘이 실리는 해예요." }, /시기/],
    ["검정 as a colour", { remedy: "검정 옷 대신 밝은 옷을 골라 입어 보세요." }, /색·방향/],
    ["최악 as a grade", { watchOut: "돈 관리는 이 명식에서 최악인 쪽이라 조심해요." }, /길흉·점수/],
    ["최고 as a grade", { thisYear: "올해 병오(丙午)년은 일하는 힘이 최고인 해로 읽어요." }, /길흉·점수/],
    ["지지 as a place on the card", { goesWell: "지지에 불 기운이 많아 드러내는 일에서 잘 풀리는 편이에요." }, /괄호 밖에 있어요: 지지/],
  ] as const)("still fails %s", (_label, patch, finding) => {
    expect(standardHard(patch)).toMatch(finding);
  });
});

describe("plain words for the terms a reader meets first (review 2026-10-08)", () => {
  it("glosses 월지, 월령, 재성 and 12운성 in the reviewed words", () => {
    expect(PLAIN_WORDS).toMatchObject({
      월지: "태어난 달의 아래 글자",
      월령: "태어난 계절이 쥔 기운",
      재성: "돈과 살림처럼 내가 다루는 것",
      "12운성": "기운이 자라고 저무는 열두 단계",
    });
  });

  it("adds 천간, 지지, 원국 and 본기, so their bare use is caught", () => {
    for (const term of ["천간", "지지", "원국", "본기"]) expect(PLAIN_WORDS[term], term).toBeTruthy();
    expect(bareFirstTerms("원국에는 천간 둘과 지지 하나가 있고, 본기로 세요.").sort()).toEqual(["본기", "원국", "지지", "천간"]);
    expect(standardHard({ goesWell: "원국에 불 기운이 셋이라 드러내는 일에서 잘 풀리는 편이에요." })).toMatch(/괄호/);
  });
});

describe("the card names only this chart's 간지, and this 세운 as it stands (review 2026-10-08)", () => {
  it("catches a 간지 the facts do not hold even in Hangul alone (정미년)", () => {
    expect(standardHard({ thisYear: "올해 병오(丙午)년은 정미년을 앞두고 힘을 모으는 해로 읽어요." })).toMatch(/없는 간지/);
    // a 운's facts hold the coming year's 丁未
    expect(topicHard("money", { thisYear: "올해 병오(丙午)년은 다가오는 정미년을 앞두고 새는 돈을 막는 해로 읽어요." })).not.toMatch(/없는 간지/);
  });

  it("does not call the 丙午 still running before 입춘 '올해 병오년' (2027-01-20)", () => {
    const jan = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2027-01-20T12:00:00+09:00"));
    expect(jan.annual).toMatchObject({ year: 2026, gz: "丙午", beforeIpchun: true });
    expect(facts.annual.beforeIpchun).toBeUndefined();
    const janClean = mockSajuReading(jan);
    expect(janClean.glance.thisYear).toMatch(/^입춘 전까지 이어지는 병오\(丙午\)년/);
    expect(hard(validateSajuReading(janClean, jan))).toEqual([]);
    const janHard = (patch: Partial<SajuGlance>) => hard(validateSajuReading(withGlance(janClean, patch), jan)).join("\n");
    expect(janHard({ thisYear: "올해 병오(丙午)년에는 함께하는 일에 힘이 붙는 해로 읽어요." })).toMatch(/입춘/);
    expect(janHard({ thisYear: "병오(丙午)년의 남은 기간에는 함께하는 일에 힘이 붙어요." })).toBe("");
    expect(janHard({ thisYear: "입춘 전까지 이어지는 병오(丙午)년 뒤 정미년에는 일이 늘어요." })).toMatch(/없는 간지/);
    expect(SAJU_SYSTEM).toContain("beforeIpchun");
  });
});

describe("a saved reading whose card cannot be read (review 2026-10-08)", () => {
  it("still takes follow-ups: the stored shape drops the card alone", () => {
    const parsed = StoredSajuReadingSchema.safeParse({ ...clean, glance: { goesWell: 3 } });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.glance).toBeUndefined();
    expect(StoredSajuReadingSchema.safeParse(clean).data?.glance).toEqual(clean.glance);
    expect(StoredSajuReadingSchema.safeParse({ ...clean, sections: "x" }).success).toBe(false);
  });
});

describe("the prompts ask for the card and the plain words, and leave 신년운세 alone", () => {
  it("adds one shared block to the standard and topic prompts, after the unchanged preamble", () => {
    for (const system of [SAJU_SYSTEM, SAJU_TOPIC_SYSTEM]) {
      expect(system.startsWith(SAJU_PREAMBLE)).toBe(true);
      expect(system).toContain("# 쉬운 말");
      expect(system).toContain("내 재주를 꺼내 쓰는 힘(식신)");
      expect(system).toContain("- 편관: 바깥에서 오는 압박과 책임");
      expect(system).toMatch(/- glance:/);
      for (const label of ["잘 풀리는 쪽", "조심할 쪽", "이렇게 보완", "올해 흐름"]) expect(system).toContain(label);
      expect(system).toMatch(/색·방향|색, 방향/);
      expect(system).not.toContain("베타");
    }
    expect(NEWYEAR_SYSTEM).not.toContain("# 쉬운 말");
    expect(NEWYEAR_SYSTEM).not.toContain("- glance:");
  });

  it("tells the topic prompt what the card speaks about for each 운", () => {
    for (const words of ["돈이 들어오는 길", "새기 쉬운", "올해 돈의 흐름", "일에서", "관계에서", "마음을"]) expect(SAJU_TOPIC_SYSTEM).toContain(words);
  });
});
