import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { decisionFor } from "@/lib/decision";
import { assertVoice } from "@/lib/voice/banned";
import { NOW_TYPE_SLUGS, NOW_TYPES, nowFacts, nowShareText, nowType } from "./tarotType";

/** Spec 2026-11-11 entry funnel renewal, 3.4 and 6.8 D: 지금의 한 장's 12 nicknames, by rule, over all 156 card faces. */

const FACES = CARDS.flatMap((card) => (["upright", "reversed"] as const).map((orientation) => ({ cardId: card.id, orientation })));

/** 6.8 D's 면 수 [측정] column. */
const MEASURED: Record<string, number> = {
  "now-fire-go": 20, "now-fire-wait": 13, "now-fire-rethink": 9,
  "now-water-go": 15, "now-water-wait": 9, "now-water-rethink": 14,
  "now-air-go": 15, "now-air-wait": 12, "now-air-rethink": 11,
  "now-earth-go": 18, "now-earth-wait": 8, "now-earth-rethink": 12,
};

describe("지금의 한 장 nicknames (6.8 D)", () => {
  it("has exactly the spec's 12 slugs, names and lines", () => {
    expect(NOW_TYPE_SLUGS).toEqual(Object.keys(MEASURED));
    expect(NOW_TYPE_SLUGS.map((slug) => [slug, NOW_TYPES[slug].name, NOW_TYPES[slug].line])).toEqual([
      ["now-fire-go", "출발 신호 받은 직진러", "불 카드가 '가 보기' 쪽이래. 출발 전에 신발 끈만 한 번 더 확인!"],
      ["now-fire-wait", "시동 걸고 대기 중", "엔진은 따뜻한데 신호가 아직 노란불이래. 신호 바뀌는 거 같이 보자"],
      ["now-fire-rethink", "핸들 고민 중인 직진러", "직진하고 싶은데 카드가 옆길도 보래. 내비 한 번 다시 켜 봐"],
      ["now-water-go", "마음 가는 쪽으로 출발", "마음이 가리키는 쪽으로 가 봐도 된대. 대신 천천히"],
      ["now-water-wait", "마음 숙성 중", "마음이 아직 숙성 중이래. 오늘은 마음 쪽에 시간을 좀 줘 보래"],
      ["now-water-rethink", "마음 다시 보기 중", "이 마음, 한 번 더 들여다보래. 천천히 봐도 괜찮대"],
      ["now-air-go", "말할 타이밍 잡은 형", "생각 정리 끝. 이제 입 밖으로 꺼낼 차례래"],
      ["now-air-wait", "머릿속 회의 연장 중", "회의가 한 번 더 연장됐어. 안건 하나만 더 정리해 볼까"],
      ["now-air-rethink", "플랜 B 회의 소집", "카드가 플랜 B도 꺼내 보래. 회의실 예약해"],
      ["now-earth-go", "실행 버튼 앞에 선 형", "흙 카드가 '가 보기' 쪽이래. 누르기 전에 숫자만 한 번 더 보자"],
      ["now-earth-wait", "자 한 번 더 대 보는 형", "자 한 번 더 대 보래. 꼼꼼한 게 손해는 아니잖아"],
      ["now-earth-rethink", "다른 길도 재 보는 형", "카드가 다른 방법도 한 번 보래. 하나만 보고 정하긴 아깝잖아"],
    ]);
  });

  it("maps every one of the 156 card faces to exactly one of the 12, by its element and the card DB's lean", () => {
    expect(FACES).toHaveLength(156);
    const counts = new Map<string, number>();
    for (const { cardId, orientation } of FACES) {
      const slug = nowType(cardId, orientation);
      expect(NOW_TYPE_SLUGS).toContain(slug);
      // The rule, spelled out: the card's element and its side's lean (lib/decision.ts), nothing else.
      expect(slug).toBe(`now-${getCard(cardId).element}-${decisionFor(cardId, orientation).lean}`);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    // All 12 come up, as often as the spec measured; together they cover the 156 faces once.
    expect(Object.fromEntries(NOW_TYPE_SLUGS.map((slug) => [slug, counts.get(slug)]))).toEqual(MEASURED);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(156);
  });

  it("is the same every time for the same face, whatever the card design", () => {
    for (const { cardId, orientation } of FACES) expect(nowType(cardId, orientation)).toBe(nowType(cardId, orientation));
  });

  it("gives every nickname once", () => {
    const names = NOW_TYPE_SLUGS.map((slug) => NOW_TYPES[slug].name);
    expect(new Set(names).size).toBe(12);
  });

  it("says the facts the way 6.2 N3 and N5 do", () => {
    expect(nowFacts("now-water-wait")).toBe("물 카드 · 조금 더 지켜보기 쪽");
    expect(nowFacts("now-fire-go", { polite: true })).toBe("불 카드 · 가 보기 쪽이에요");
    expect(nowFacts("now-air-rethink")).toBe("바람 카드 · 다른 길도 살펴보기 쪽");
    expect(nowFacts("now-earth-go")).toBe("흙 카드 · 가 보기 쪽");
  });

  it("shares the nickname with the card (N8), or the card only when no nickname was shown (N9)", () => {
    expect(nowShareText({ cardName: "바보", reversed: true, slug: "now-water-wait" })).toBe("타로로 판정: 마음 숙성 중 · 바보(역) | 스타로그 지금의 한 장");
    expect(nowShareText({ cardName: "태양", reversed: false, slug: "now-fire-go" })).toBe("타로로 판정: 출발 신호 받은 직진러 · 태양 | 스타로그 지금의 한 장");
    expect(nowShareText({ cardName: "바보", reversed: true, slug: null })).toBe("스타로그 지금의 한 장 · 바보(역)");
  });

  it("passes the banned list (spec 2.4): every name, line, fact and share text", () => {
    for (const slug of NOW_TYPE_SLUGS) {
      const { name, line } = NOW_TYPES[slug];
      for (const text of [name, line, nowFacts(slug), nowFacts(slug, { polite: true }), nowShareText({ cardName: "바보", reversed: true, slug })]) assertVoice(text);
    }
  });
});
