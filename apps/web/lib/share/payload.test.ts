import { describe, expect, it } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { buildSharePayload, parseSharePayload } from "./payload";

const MOCK_TAROT_READING = TAROT_SAMPLE.paid;

const tarotCtx = {
  kind: "tarot" as const,
  templateId: "relationship-contact" as const,
  input: {
    topicId: "custom",
    whoId: "us" as const,
    question: "팀장님께 연락해도 될까요?",
    conditions: [{ label: "상황", value: "연락이 끊겼어요" }],
    note: "지난달 회식 뒤로 답장이 없어요",
    topicText: "이직 고민",
    whoText: "팀장님",
  },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ] as Array<[string, "upright" | "reversed"]>,
};

describe("buildSharePayload (tarot)", () => {
  const reading = {
    ...MOCK_TAROT_READING,
    verdict: "팀장님께 먼저 짧게 안부를 건네 볼 만한 때예요.",
    cards: MOCK_TAROT_READING.cards.map((card, i) =>
      i === 0 ? { ...card, body: `메모에 적은 "지난달 회식 뒤로 답장이 없어요"라는 말처럼 ${card.body}` } : card,
    ),
    followUps: ["다음 주에 다시 물어봐도 될까요?"],
    story: { title: "이야기", body: "옛 블록" },
  };
  const payload = buildSharePayload(tarotCtx, reading);

  it("keeps the cards with their positions, and the whole reading", () => {
    expect(payload.kind).toBe("tarot");
    if (payload.kind !== "tarot") return;
    expect(payload.cards).toEqual([
      { cardId: "major-09-hermit", orientation: "upright", position: "나의 마음" },
      { cardId: "major-17-star", orientation: "reversed", position: "두 사람 사이" },
      { cardId: "cups-03", orientation: "upright", position: "먼저 움직이면" },
    ]);
    expect(payload.reading.cards).toHaveLength(reading.cards.length);
    expect(payload.reading.action).toEqual(reading.action);
  });

  it("leaves out the question, the note, the follow-up suggestions and the old story block", () => {
    const text = JSON.stringify(payload);
    expect(text).not.toContain("팀장님께 연락해도 될까요");
    expect(text).not.toContain("followUps");
    expect(text).not.toContain("옛 블록");
    expect(text).not.toContain("input");
  });

  it("hides the user's own words wherever the reading quotes them", () => {
    if (payload.kind !== "tarot") return;
    expect(payload.reading.verdict).toBe("○○께 먼저 짧게 안부를 건네 볼 만한 때예요.");
    expect(payload.reading.cards[0]?.body.startsWith('메모에 적은 "○○"라는 말처럼')).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/회식|팀장님|이직 고민/);
  });

  it("hides a quote that is only part of the note", () => {
    const partial = buildSharePayload(tarotCtx, { ...reading, verdict: '"회식 뒤로 답장이 없어요"라고 했지만 기다려 볼 때예요.' });
    if (partial.kind !== "tarot") return;
    expect(partial.reading.verdict).toBe('"○○"라고 했지만 기다려 볼 때예요.');
  });

  it("keeps the preset chips: they are the service's own words", () => {
    const chip = buildSharePayload(tarotCtx, { ...reading, verdict: "연락이 끊겼어요라는 상황에서는 기다림도 답이에요." });
    if (chip.kind !== "tarot") return;
    expect(chip.reading.verdict).toContain("연락이 끊겼어요");
  });
});

describe("buildSharePayload (saju)", () => {
  const sajuCtx = { kind: "saju" as const, birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, gender: "female", timeKnown: true, hour: 12, minute: 30, placeId: "seoul" }, topic: "love" as const };
  const reading = {
    glance: { goesWell: "사람을 모으는 일", watchOut: "서두르는 말", remedy: "아침에 햇볕 쬐기", thisYear: "올해는 불 기운이 강해요.", thisYearAction: "새 모임에 나가 보기" },
    sections: [
      { heading: "타고난 바탕 · 태어난 계절", body: "1990년 1월 1일에 태어난 병화 일간이에요. 낮 12시 30분 무렵이라 시주가 정해져요. 2027년 3월에는 기운이 바뀌어요. 3시간쯤 걸려요." },
      { heading: "계산 기준 · 보지 않은 것과 달라질 수 있는 것", body: "양력 1990-01-01, 서울 기준이에요." },
    ],
    observation: { heading: "돌아보기", body: "이번 주에 한 번 살펴봐요." },
    followUps: ["연애는 언제 풀릴까요?"],
  };
  const payload = buildSharePayload(sajuCtx as never, reading);

  it("names the topic, keeps the glance and the sections, and drops the 계산 기준 section", () => {
    expect(payload.kind).toBe("saju");
    if (payload.kind !== "saju") return;
    expect(payload.topic).toBe("love");
    expect(payload.reading.glance).toEqual(reading.glance);
    expect(payload.reading.sections.map((section) => section.heading)).toEqual(["타고난 바탕 · 태어난 계절"]);
    expect(payload.reading.observation).toEqual(reading.observation);
  });

  it("never carries the birth data: no birth block, no dates or times in the text", () => {
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/1990|1월 1일|12시 30분|birth|placeId|followUps/);
    if (payload.kind !== "saju") return;
    expect(payload.reading.sections[0]?.body).toBe("○○에 태어난 병화 일간이에요. ○○ 무렵이라 시주가 정해져요. 2027년 3월에는 기운이 바뀌어요. 3시간쯤 걸려요.");
  });
});

describe("parseSharePayload", () => {
  it("reads back what buildSharePayload stored, and refuses anything else", () => {
    const payload = buildSharePayload(tarotCtx, MOCK_TAROT_READING);
    expect(parseSharePayload(JSON.stringify(payload))).toEqual(payload);
    expect(parseSharePayload("{}")).toBeNull();
    expect(parseSharePayload("not json")).toBeNull();
    expect(parseSharePayload(JSON.stringify({ kind: "tarot", v: 2, cards: [], reading: {} }))).toBeNull();
  });
});
