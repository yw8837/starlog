import { describe, it, expect } from "vitest";
import { createDeck, pickCards, TEMPLATES, TOPICS_BY_WHO, composeQuestion, DEFAULT_REVERSAL_RATE } from "../src";
import type { When, Who } from "../src";

const WHOS: Who[] = ["me", "us", "work", "group"];
const WHENS: When[] = ["today", "week", "month", "year"];

describe("deck", () => {
  it("is a permutation of 78 cards", () => {
    const d = createDeck("seed-a", DEFAULT_REVERSAL_RATE);
    expect(d.order).toHaveLength(78);
    expect(new Set(d.order).size).toBe(78);
    expect(d.orientations).toHaveLength(78);
  });
  it("is deterministic per seed and differs across seeds", () => {
    expect(createDeck("s1", 0.3)).toEqual(createDeck("s1", 0.3));
    expect(createDeck("s1", 0.3).order).not.toEqual(createDeck("s2", 0.3).order);
  });
  it("respects reversal rate 0 and roughly 0.3 over many seeds", () => {
    expect(createDeck("x", 0).orientations.every(o => o === "upright")).toBe(true);
    let rev = 0, n = 0;
    for (let i = 0; i < 200; i++) { const d = createDeck(`k${i}`, 0.3); rev += d.orientations.filter(o => o === "reversed").length; n += 78; }
    expect(rev / n).toBeGreaterThan(0.25); expect(rev / n).toBeLessThan(0.35);
  });
  it("reverses every card at rate 1 and rejects rates outside 0..1", () => {
    expect(createDeck("x", 1).orientations.every(o => o === "reversed")).toBe(true);
    expect(() => createDeck("x", -0.1)).toThrow();
    expect(() => createDeck("x", 1.1)).toThrow();
    expect(() => createDeck("x", Number.NaN)).toThrow();
  });
  it("keeps the same order for the same seed regardless of reversal rate", () => {
    expect(createDeck("s1", 0).order).toEqual(createDeck("s1", 0.7).order);
  });
  it("matches the golden vector, so the shuffle never changes silently", () => {
    const d = createDeck("golden", 0.3);
    expect(d.order.slice(0, 5)).toEqual(["major-00-fool", "wands-14", "major-11-justice", "major-18-moon", "swords-10"]);
    expect(d.orientations.slice(0, 5)).toEqual(["reversed", "upright", "reversed", "reversed", "reversed"]);
  });
});

describe("pickCards", () => {
  it("maps tapped indexes to positions in tap order and forbids duplicates", () => {
    const d = createDeck("p", 0.3);
    const t = TEMPLATES["relationship-contact"];
    const cards = pickCards(d, t, [5, 40, 12]);
    expect(cards.map(c => c.position)).toEqual(["나의 마음", "두 사람 사이", "먼저 움직이면"]);
    expect(cards[0]!.cardId).toBe(d.order[5]);
    expect(() => pickCards(d, t, [5, 5, 1])).toThrow();
    expect(() => pickCards(d, t, [1, 2])).toThrow();
  });
  it("carries the deck orientation and a 0-based slot for each pick", () => {
    const d = createDeck("p2", 0.5);
    const cards = pickCards(d, TEMPLATES.work, [77, 0, 30]);
    expect(cards.map(c => c.slot)).toEqual([0, 1, 2]);
    expect(cards.map(c => c.cardId)).toEqual([d.order[77], d.order[0], d.order[30]]);
    expect(cards.map(c => c.orientation)).toEqual([d.orientations[77], d.orientations[0], d.orientations[30]]);
  });
  it("draws one card for the daily template", () => {
    const d = createDeck("p3", 0.3);
    const cards = pickCards(d, TEMPLATES.daily, [9]);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.position).toBe("오늘의 한 장");
    expect(() => pickCards(d, TEMPLATES.daily, [9, 10])).toThrow();
  });
  it("rejects out-of-range and non-integer indexes", () => {
    const d = createDeck("p4", 0.3);
    const t = TEMPLATES.choice;
    expect(() => pickCards(d, t, [0, 1, 78])).toThrow();
    expect(() => pickCards(d, t, [0, 1, -1])).toThrow();
    expect(() => pickCards(d, t, [0, 1, 2.5])).toThrow();
  });
});

describe("templates", () => {
  it("uses the exact Korean position names", () => {
    expect(TEMPLATES["relationship-contact"].positions).toEqual(["나의 마음", "두 사람 사이", "먼저 움직이면"]);
    expect(TEMPLATES.relationship.positions).toEqual(["나의 마음", "상대에게 비친 나", "두 사람의 흐름"]);
    expect(TEMPLATES.work.positions).toEqual(["지금 상황", "막힌 곳", "나아갈 방향"]);
    expect(TEMPLATES.choice.positions).toEqual(["이쪽을 고르면", "저쪽을 고르면", "놓치고 있는 것"]);
    expect(TEMPLATES["self-flow"].positions).toEqual(["지금의 나", "필요한 것", "이 시기의 흐름"]);
    expect(TEMPLATES.group.positions).toEqual(["모임의 분위기", "나의 자리", "도움이 될 태도"]);
    expect(TEMPLATES.daily.positions).toEqual(["오늘의 한 장"]);
  });
  it("has matching Japanese position counts and ids", () => {
    for (const [id, t] of Object.entries(TEMPLATES)) {
      expect(t.id).toBe(id);
      expect(t.positionsJa).toHaveLength(t.positions.length);
    }
  });
});

describe("topics", () => {
  it("maps every topic to a template and matches the topic table", () => {
    const table = (who: Who) => TOPICS_BY_WHO[who].map(t => [t.ko, t.template]);
    expect(table("me")).toEqual([
      ["연애운", "self-flow"], ["재물운", "self-flow"], ["직업·이직", "work"], ["학업·시험", "work"],
      ["건강·컨디션", "self-flow"], ["마음·감정", "self-flow"], ["이사·선택", "choice"], ["오늘의 운", "daily"],
    ]);
    expect(table("us")).toEqual([
      ["썸·고백", "relationship"], ["연애", "relationship"], ["연락", "relationship-contact"],
      ["재회", "relationship-contact"], ["갈등·화해", "relationship"],
    ]);
    expect(table("work")).toEqual([
      ["직업·이직", "work"], ["재물운", "self-flow"], ["학업·시험", "work"], ["창작·도전", "work"], ["협상·대화", "work"],
    ]);
    expect(table("group")).toEqual([
      ["인간관계", "group"], ["갈등·화해", "group"], ["함께 하는 일", "group"], ["모임의 분위기", "group"],
    ]);
    for (const who of WHOS) for (const t of TOPICS_BY_WHO[who]) expect(TEMPLATES[t.template]).toBeDefined();
  });
  it("has unique slug ids per who and a non-empty label, phrase and Japanese label", () => {
    for (const who of WHOS) {
      const ids = TOPICS_BY_WHO[who].map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const t of TOPICS_BY_WHO[who]) {
        expect(t.id).toMatch(/^[a-z]+$/);
        expect(t.ko.length).toBeGreaterThan(0);
        expect(t.ja.length).toBeGreaterThan(0);
        expect(t.phrase.length).toBeGreaterThan(0);
        expect(t.phrase).not.toContain("·");
      }
    }
  });
  it("gives every topic 2-3 condition groups that end with an unsure option", () => {
    for (const who of WHOS) for (const t of TOPICS_BY_WHO[who]) {
      expect(t.conditions.length, `${who}/${t.id}`).toBeGreaterThanOrEqual(2);
      expect(t.conditions.length, `${who}/${t.id}`).toBeLessThanOrEqual(3);
      expect(new Set(t.conditions.map(c => c.id)).size).toBe(t.conditions.length);
      for (const c of t.conditions) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(new Set(c.options).size, `${who}/${t.id}/${c.id}`).toBe(c.options.length);
        expect(c.options.length, `${who}/${t.id}/${c.id}`).toBeGreaterThanOrEqual(3);
        expect(c.options.at(-1), `${who}/${t.id}/${c.id}`).toMatch(/모르겠어요$/);
      }
    }
  });
  it("shares no condition object or options array between topics", () => {
    const groups = WHOS.flatMap(who => TOPICS_BY_WHO[who].flatMap(t => t.conditions));
    expect(new Set(groups).size).toBe(groups.length);
    expect(new Set(groups.map(g => g.options)).size).toBe(groups.length);
  });
  it("uses exclusive, gap-free time buckets for reunion and relationship duration", () => {
    const reunion = TOPICS_BY_WHO.us.find(t => t.id === "reunion")!;
    expect(reunion.conditions.find(c => c.id === "since")!.options)
      .toEqual(["1개월 미만", "1~6개월", "6개월~1년", "1년 넘음", "잘 모르겠어요"]);
    const relationship = TOPICS_BY_WHO.us.find(t => t.id === "relationship")!;
    const duration = relationship.conditions.find(c => c.id === "duration")!;
    expect(duration.label).toBe("사귄 기간");
    expect(duration.options).toEqual(["3개월 미만", "3개월~1년", "1년 넘음", "잘 모르겠어요"]);
  });
  it("defines the contact conditions used by the gold sample", () => {
    const topic = TOPICS_BY_WHO.us.find(t => t.id === "contact")!;
    expect(topic.template).toBe("relationship-contact");
    expect(topic.conditions).toEqual([
      { id: "relation", label: "관계", options: ["알아가는 중", "연인", "친구", "헤어진 사이", "잘 모르겠어요"] },
      { id: "recent-contact", label: "최근 연락", options: ["이어지고 있음", "뜸해짐", "끊긴 지 오래", "잘 모르겠어요"] },
      { id: "goal", label: "원하는 방향", options: ["가볍게 안부", "대화 다시 시작", "오해 풀기", "아직 모르겠어요"] },
    ]);
  });
});

describe("questions", () => {
  it("builds the contact question without duplicated words", () => {
    const topic = TOPICS_BY_WHO.us.find(t => t.id === "contact")!;
    expect(composeQuestion("us", topic, "month")).toBe("이번 달, 그 사람에게 먼저 연락해도 될까");
    const daily = TOPICS_BY_WHO.me.find(t => t.id === "daily")!;
    expect(composeQuestion("me", daily, "today")).toBe("오늘 나의 하루는 어떨까");
  });
  it("fills the when prefix in Korean and Japanese", () => {
    const topic = TOPICS_BY_WHO.us.find(t => t.id === "contact")!;
    expect(composeQuestion("us", topic, "today")).toBe("오늘, 그 사람에게 먼저 연락해도 될까");
    expect(composeQuestion("us", topic, "week")).toMatch(/^이번 주, /);
    expect(composeQuestion("us", topic, "year")).toMatch(/^올해, /);
    expect(composeQuestion("us", topic, "month", "ja")).toMatch(/^今月、/);
    expect(composeQuestion("me", TOPICS_BY_WHO.me.find(t => t.id === "daily")!, "today", "ja")).toMatch(/^今日の/);
  });
  it("never leaves a token, a middle dot or a repeated word in any question", () => {
    for (const who of WHOS) for (const t of TOPICS_BY_WHO[who]) for (const when of t.whens ?? WHENS) {
      for (const locale of ["ko", "ja"] as const) {
        const q = composeQuestion(who, t, when, locale);
        expect(q, `${who}/${t.id}/${locale}`).not.toMatch(/[{}·・]/);
        expect(q.length).toBeGreaterThan(8);
      }
      const words = composeQuestion(who, t, when).replace(/[,.?]/g, "").split(/\s+/);
      expect(new Set(words).size, `${who}/${t.id}/${when}`).toBe(words.length);
    }
  });
  it("rejects a topic that does not belong to the chosen who", () => {
    const contact = TOPICS_BY_WHO.us.find(t => t.id === "contact")!;
    expect(() => composeQuestion("me", contact, "today")).toThrow();
  });
  it("checks topic identity, not just the id: me/career is not a work topic", () => {
    const meCareer = TOPICS_BY_WHO.me.find(t => t.id === "career")!;
    const workCareer = TOPICS_BY_WHO.work.find(t => t.id === "career")!;
    expect(meCareer.id).toBe(workCareer.id);
    expect(() => composeQuestion("work", meCareer, "week")).toThrow();
    expect(() => composeQuestion("me", workCareer, "week")).toThrow();
    expect(composeQuestion("me", meCareer, "week")).toBe("이번 주, 나의 일과 이직의 흐름은 어떨까");
    expect(composeQuestion("work", workCareer, "week")).toBe("이번 주, 나의 일은 어떤 방향으로 나아갈까");
  });
  it("only allows today for the daily topic", () => {
    const daily = TOPICS_BY_WHO.me.find(t => t.id === "daily")!;
    expect(daily.whens).toEqual(["today"]);
    for (const when of ["week", "month", "year"] as const) {
      expect(() => composeQuestion("me", daily, when)).toThrow();
      expect(() => composeQuestion("me", daily, when, "ja")).toThrow();
    }
    expect(composeQuestion("me", daily, "today")).toBe("오늘 나의 하루는 어떨까");
    const others = WHOS.flatMap(who => TOPICS_BY_WHO[who]).filter(t => t !== daily);
    expect(others.every(t => t.whens === undefined)).toBe(true);
  });
  it("varies question endings (at most 4 end with 어떻게 흘러갈까)", () => {
    const questions = WHOS.flatMap(who => TOPICS_BY_WHO[who]).map(t => t.questionKo);
    expect(questions.filter(q => q.endsWith("어떻게 흘러갈까")).length).toBeLessThanOrEqual(4);
  });
  it("uses the spaced form of 어 가다 and never the glued one", () => {
    const questions = WHOS.flatMap(who => TOPICS_BY_WHO[who]).map(t => t.questionKo);
    expect(questions.filter(q => /어가면|려갈까|해나가/.test(q))).toEqual([]);
  });
});
