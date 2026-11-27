import { readFileSync } from "node:fs";
import { TEMPLATES, TOPICS_BY_WHO } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { gaLocation } from "./analytics";
import { sanitizeFlow, summarizeFlow } from "./flowState";
import { productById } from "./pay/catalog";
import { cameFromFlow } from "./useFlowVisit";
import { voiceProblems } from "./voice/banned";
import { TAROT_WORRY_PATHS } from "./worryPaths";
import {
  HOME_WORRY_IDS,
  NEXT_WORRY_RULES,
  WORRIES,
  findWorry,
  nextWorryFor,
  presetFlow,
  visibleWorries,
  worryMethod,
  worryPath,
  worryProduct,
  worryStart,
  type Worry,
} from "./worries";

/** Spec 2026-11-26 worry catalog §4, §5.1, §11, §12: twelve worries, each only a filled-in doorway into a reading that exists. */

const tarot = WORRIES.filter((worry): worry is Worry & { reading: { kind: "tarot" } } => worry.reading.kind === "tarot");

/** The question each tarot worry starts with (summarizeFlow, the builder's own sentence), pinned. */
const QUESTIONS: Record<string, string> = {
  some: "이번 달 그 사람과 나 사이는 어떻게 될까?",
  "no-reply": "이번 달 그 사람에게 먼저 연락해도 될까?",
  "miss-ex": "이번 달 내 마음, 어떻게 돌보면 좋을까?",
  again: "이번 달 그 사람과 다시 이어질 수 있을까?",
  "after-breakup": "이번 달 내 연애는 어떻게 될까?",
  // A typed 무엇 (§4: no situation chips): the sentence the builder makes of it, as a person would ask it.
  "moved-on": "이번 달 전 애인 소식에 흔들리는 내 마음, 어떻게 추스를까?",
  coworker: "이번 달 그 사람과의 갈등, 어떻게 풀면 좋을까?",
  "stay-or-go": "이번 달 일과 이직, 어떻게 풀릴까?",
};

describe("the worry list", () => {
  it("holds the twelve worries of §4 under the names of §12.1, each id once", () => {
    expect(WORRIES.map((worry) => worry.id)).toEqual(["some", "no-reply", "miss-ex", "again", "after-breakup", "moved-on", "coworker", "solo", "money-leak", "job", "marry", "stay-or-go"]);
    expect(new Set(WORRIES.map((worry) => worry.id)).size).toBe(WORRIES.length);
    expect(Object.fromEntries(WORRIES.map((worry) => [worry.id, worry.name]))).toEqual({
      some: "이거 썸 맞아?",
      "no-reply": "답 없는 톡, 먼저 할까",
      "miss-ex": "끝났는데 보고 싶어",
      again: "다시 만나도 될까",
      "after-breakup": "헤어지고 멍해",
      "moved-on": "전 애인 소식에 울컥",
      coworker: "일보다 사람이 힘들어",
      solo: "연애는 하고 싶은데",
      "money-leak": "돈 쓰고 또 후회해",
      job: "어떤 일이 나랑 맞지?",
      marry: "결혼 얘기 중인 우리",
      "stay-or-go": "오늘도 퇴사 생각",
    });
    expect(findWorry("job")?.line).toBe("잘하는 일이랑 버티는 일은 달라.");
    expect(findWorry("job")?.reflect).toEqual(["시간 가는 줄 몰랐던 일은 뭐였지?", "잘한다는 말은 들었지만 하기 싫었던 일은 뭐였지?", "다음 자리에서 꼭 피하고 싶은 환경은 뭐지?"]);
    expect(findWorry("nope")).toBeUndefined();
    expect(worryPath("some")).toBe("/w/some");
  });

  it("gives every worry three questions to think over, a reader and a category", () => {
    for (const worry of WORRIES) {
      expect(worry.reflect, worry.id).toHaveLength(3);
      for (const question of worry.reflect) expect(question, worry.id).toMatch(/\?$/);
      expect(worry.reader, worry.id).toBe(worry.reading.kind === "tarot" ? "cat" : "rabbit");
    }
    const byCategory = (category: string) => WORRIES.filter((worry) => worry.category === category).map((worry) => worry.id);
    expect(byCategory("love")).toEqual(["some", "no-reply", "miss-ex", "again", "after-breakup", "moved-on", "solo", "marry"]);
    expect(byCategory("money")).toEqual(["money-leak"]);
    expect(byCategory("work")).toEqual(["coworker", "job", "stay-or-go"]);
  });

  it("starts each tarot worry with values sanitizeFlow keeps as they are, and summarizeFlow makes them a question", () => {
    expect(tarot.map((worry) => worry.id)).toEqual(Object.keys(QUESTIONS));
    for (const worry of tarot) {
      const flow = presetFlow(worry);
      expect(sanitizeFlow(flow), worry.id).toEqual(flow);
      const summary = summarizeFlow(sanitizeFlow(flow));
      expect(summary?.question, worry.id).toBe(QUESTIONS[worry.id]);
      // Nothing typed is said rather than asked: no quote under the question.
      expect(summary?.quote, worry.id).toBeUndefined();
      expect(summary?.custom, worry.id).toBe(worry.id === "moved-on");
      // A new question: no cards from an earlier one, no note.
      expect(flow.draw).toBeUndefined();
      expect(flow.note).toBe("");
    }
    expect(presetFlow(findWorry("stay-or-go")!).spread).toBe("deep");
  });

  it("fills only the values §4 names: the chips exactly as the catalog writes them", () => {
    const flows = Object.fromEntries(tarot.map((worry) => [worry.id, presetFlow(worry)]));
    expect(flows["miss-ex"]).toMatchObject({ who: "me", topicId: "mind", conditions: { cause: "사람 때문에" } });
    expect(flows["after-breakup"]).toMatchObject({ who: "me", topicId: "love", conditions: { status: "헤어진 지 얼마 안 됨", focus: "마음 정리" } });
    expect(flows.coworker).toMatchObject({ who: "us", topicId: "conflict", conditions: { relation: "직장 동료" } });
    expect(flows.some).toMatchObject({ who: "us", topicId: "crush", conditions: {} });
    expect(flows["no-reply"]).toMatchObject({ who: "us", topicId: "contact", conditions: {} });
    expect(flows.again).toMatchObject({ who: "us", topicId: "reunion", conditions: {} });
    // 누구 is 나 (code review 2026-11-26 A2): the three positions are the person's own, not 두 사람의 흐름.
    expect(flows["moved-on"]).toMatchObject({ who: "me", conditions: {} });
    expect(flows["moved-on"]!.topicId).toBeUndefined();
    const movedOn = summarizeFlow(flows["moved-on"]!)!;
    expect(movedOn.question).toBe("이번 달 전 애인 소식에 흔들리는 내 마음, 어떻게 추스를까?");
    expect(TEMPLATES[movedOn.template].positions).toEqual(["지금의 나", "필요한 것", "이 시기의 흐름"]);
    expect(flows["stay-or-go"]).toMatchObject({ who: "me", topicId: "career", conditions: {}, spread: "deep" });
  });

  it("never sells the same reading with the same input under two names (one saju worry per topic)", () => {
    const input = (worry: Worry) => {
      const reading = worry.reading;
      if (reading.kind === "saju") return `saju:${reading.topic}`;
      if (reading.kind === "match") return "match";
      const { who, topicId, topicText, conditions, spread } = reading.flow;
      return `tarot:${JSON.stringify({ who, topicId, topicText, conditions, spread })}`;
    };
    const inputs = WORRIES.map(input);
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(WORRIES.filter((worry) => worry.reading.kind === "saju").map((worry) => worry.reading)).toEqual([
      { kind: "saju", topic: "love" },
      { kind: "saju", topic: "money" },
      { kind: "saju", topic: "career" },
    ]);
  });

  it("writes no price: every method and price is the catalog's", () => {
    const source = readFileSync(new URL("./worries.ts", import.meta.url), "utf8");
    // No amount in 원, no krw field, no 2,900 / 4900-style figure.
    expect(source).not.toMatch(/\d[\d,]*\s*원|krw\s*:\s*\d|\b\d{1,2},?900\b/);
    for (const worry of WORRIES) expect(worryMethod(worry).krw, worry.id).toBe(productById(worryProduct(worry))!.krw);
    const methods = Object.fromEntries(WORRIES.map((worry) => [worry.id, worryMethod(worry).name]));
    expect(methods).toMatchObject({ some: "타로 3장", solo: "사주 연애운", "money-leak": "사주 재물운", job: "사주 직장운", marry: "프리미엄 궁합", "stay-or-go": "켈틱 크로스 10장" });
  });

  it("keeps the banned words (R2, R8 and the rest of the voice list) out of every name, line, scope and question", () => {
    for (const worry of WORRIES) {
      for (const text of [worry.name, worry.line, worry.scope ?? "", ...worry.reflect]) {
        // 집안일 is housework, not the family R8 protects (the list's 집안 is the family's).
        expect(voiceProblems(text.replaceAll("집안일", "")), `${worry.id}: ${text}`).toEqual([]);
      }
    }
  });

  it("says what job and moved-on read first, then briefly what they do not (§12.1)", () => {
    expect(findWorry("job")?.scope).toBe("일하는 방식과 잘 맞는 일의 결을 봐요. 합격 여부나 날짜는 예측하지 않아요.");
    expect(findWorry("moved-on")?.scope).toBe("본 것과 짐작한 것을 나누고 지금 마음을 봐요. 새 연애가 사실인지는 가리지 않아요.");
  });
});

describe("where a worry starts (§5.2, §12.2)", () => {
  it("names the next screen's own step", () => {
    const starts = Object.fromEntries(WORRIES.map((worry) => [worry.id, worryStart(worry)]));
    expect(starts.some).toEqual({ href: "/tarot/new/situation", label: "상황 고르기" });
    expect(starts["stay-or-go"]).toEqual({ href: "/tarot/new/situation", label: "상황 고르기" });
    // A typed 무엇 has no situation chips: straight to the draw.
    expect(starts["moved-on"]).toEqual({ href: "/tarot/draw", label: "카드 뽑기" });
    expect(starts.solo).toEqual({ href: "/saju/new?topic=love", label: "생년월일 넣기" });
    expect(starts["money-leak"]).toEqual({ href: "/saju/new?topic=money", label: "생년월일 넣기" });
    expect(starts.job).toEqual({ href: "/saju/new?topic=career", label: "생년월일 넣기" });
    expect(starts.marry).toEqual({ href: "/premium/match/new", label: "두 사람 생년월일 넣기" });
  });

  it("counts each worry's page views by its own address: the analytics path cleaning keeps /w/<id> (§6), with nothing else in it", () => {
    expect(gaLocation("https://starlog.yeolmaeapps.kr/w/no-reply?from=home#start")).toBe("https://starlog.yeolmaeapps.kr/w/no-reply");
    expect(gaLocation("https://starlog.yeolmaeapps.kr/worries")).toBe("https://starlog.yeolmaeapps.kr/worries");
  });

  // Code review 2026-11-26 A5: the flow pages know the tarot worries' pages from a short list, not from the catalog.
  it("lists exactly the tarot worries' pages for the flow, and the flow hook never imports the catalog", () => {
    expect(TAROT_WORRY_PATHS).toEqual(tarot.map((worry) => worryPath(worry.id)));
    for (const file of ["./useFlowVisit.ts", "./worryPaths.ts"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).not.toMatch(/from\s+["']\.\/worries["']|@\/lib\/worries["']/);
    }
  });

  it("keeps the preset on the move from a tarot worry's page into the situation step, and only from there", () => {
    for (const worry of tarot) expect(cameFromFlow("tarot", worryPath(worry.id), "/tarot/new/situation"), worry.id).toBe(true);
    expect(cameFromFlow("tarot", worryPath("solo"), "/tarot/new/situation")).toBe(false);
    expect(cameFromFlow("tarot", "/worries", "/tarot/new/situation")).toBe(false);
    expect(cameFromFlow("saju", worryPath("some"), "/saju/new")).toBe(false);
  });
});

describe("which worries show", () => {
  const visible = { "tarot-deep": { visible: true }, match: { visible: true }, "newyear-2027": { visible: true } };
  const hidden = { "tarot-deep": { visible: false }, match: { visible: false }, "newyear-2027": { visible: false } };

  it("shows marry and stay-or-go only where their premium product is visible (status unknown: neither)", () => {
    const ids = (list: readonly Worry[]) => list.map((worry) => worry.id);
    expect(ids(visibleWorries(visible, "on"))).toEqual(WORRIES.map((worry) => worry.id));
    for (const status of [hidden, null, undefined]) expect(ids(visibleWorries(status, "on"))).toEqual(WORRIES.filter((w) => w.id !== "marry" && w.id !== "stay-or-go").map((w) => w.id));
    expect(ids(visibleWorries({ ...hidden, match: { visible: true } }, "on"))).toContain("marry");
    expect(ids(visibleWorries({ ...hidden, match: { visible: true } }, "on"))).not.toContain("stay-or-go");
  });

  it("shows the saju worries only while the saju topics are on for everyone (a topic the chart would not read is never promised)", () => {
    for (const mode of ["off", "owner"] as const) expect(visibleWorries(visible, mode).some((worry) => worry.reading.kind === "saju")).toBe(false);
  });

  it("puts six on the home board, in §5.4's order", () => {
    expect(HOME_WORRY_IDS).toEqual(["some", "no-reply", "again", "solo", "money-leak", "job"]);
  });
});

describe("다음 고민 (§7, narrowed by §12.5)", () => {
  const reading = (conditions: Array<{ label: string; value: string }>, question = "이번 달 그 사람과 나 사이는 어떻게 될까?", note = "") => ({ question, note, conditions });

  it("follows only a situation the person chose: 썸·고백 with 연락이 뜸함 → no-reply, 연락 with 헤어진 사이 → again", () => {
    expect(nextWorryFor(reading([{ label: "관계", value: "연락이 뜸함" }]))?.id).toBe("no-reply");
    expect(nextWorryFor(reading([{ label: "관계", value: "헤어진 사이" }]))?.id).toBe("again");
    expect(nextWorryFor(reading([{ label: "관계", value: "자주 연락하거나 만남" }]))).toBeNull();
    expect(nextWorryFor(reading([]))).toBeNull();
  });

  it("reads each rule's chip as one topic alone: no other topic offers the same label and value", () => {
    for (const rule of NEXT_WORRY_RULES) {
      const owners = Object.entries(TOPICS_BY_WHO).flatMap(([who, topics]) =>
        topics.filter((topic) => topic.conditions.some((c) => c.label === rule.label && c.options.includes(rule.value))).map((topic) => `${who}/${topic.id}`),
      );
      expect(owners, rule.value).toEqual([`${rule.who}/${rule.topicId}`]);
    }
  });

  it("never points at itself or at a worry on the same topic", () => {
    for (const rule of NEXT_WORRY_RULES) {
      const next = findWorry(rule.next)!;
      expect(next.reading.kind).toBe("tarot");
      const flow = (next.reading as { flow: { who: string; topicId?: string } }).flow;
      expect(`${flow.who}/${flow.topicId}`).not.toBe(`${rule.who}/${rule.topicId}`);
    }
  });

  // Code review 2026-11-26 A6: run nextWorryFor on the chips those readings really carry, and show that crisis words are
  // what stops a reading that would otherwise match.
  it("is never offered after 이별 직후 or a 마음·감정 reading, whatever chips they carry", () => {
    // after-breakup's and miss-ex's own readings, with the chips and question summarizeFlow makes of them.
    for (const id of ["after-breakup", "miss-ex"]) {
      const summary = summarizeFlow(presetFlow(findWorry(id)!))!;
      expect(summary.conditions.length, id).toBeGreaterThan(0);
      expect(nextWorryFor(reading(summary.conditions, summary.question)), id).toBeNull();
    }
    // Every chip those two topics (me/love, me/mind) offer, one at a time and all at once.
    for (const topicId of ["love", "mind"]) {
      const topic = TOPICS_BY_WHO.me.find((t) => t.id === topicId)!;
      const chips = topic.conditions.flatMap((c) => c.options.map((value) => ({ label: c.label, value })));
      expect(chips.length, topicId).toBeGreaterThan(0);
      for (const chip of chips) expect(nextWorryFor(reading([chip])), `${topicId}: ${chip.label} ${chip.value}`).toBeNull();
      expect(nextWorryFor(reading(chips)), topicId).toBeNull();
    }
  });

  it("is never offered after crisis words, in the question or the note, even with a matching chip", () => {
    for (const [chip, next] of [[{ label: "관계", value: "연락이 뜸함" }, "no-reply"], [{ label: "관계", value: "헤어진 사이" }, "again"]] as const) {
      // The same reading without crisis words matches, so crisis words are what stops it.
      expect(nextWorryFor(reading([chip]))?.id).toBe(next);
      expect(nextWorryFor(reading([chip], "그냥 죽고 싶어요")), next).toBeNull();
      expect(nextWorryFor(reading([chip], "이번 주 그 사람에게 먼저 연락해도 될까?", "요즘 살기 싫어요")), next).toBeNull();
    }
  });
});
