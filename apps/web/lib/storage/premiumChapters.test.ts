// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY, checkinSource, historyFor, isPremiumChapter, listChapters, mergeServerReadings, parseChapter, recordLine, saveChapter } from "./chapters";

afterEach(() => localStorage.clear());

const base = { id: "abcdefghij0123456789", createdAt: Date.parse("2026-10-20T12:00:00+09:00"), chapterToken: "t", turns: [], followUpsLeft: 5 };
const section = { heading: "h", body: "b" };
const DEEP = {
  ...base, kind: "tarot-deep", question: "이번 달 내 재물 흐름은 어떨까?", conditions: [], note: "",
  cards: [{ position: "지금의 나", cardId: "cups-02", orientation: "upright" }],
  reading: { verdict: "v", positions: [], crossing: section, axes: { heading: "a", vertical: section, horizontal: section }, staff: section, timing: section, action: section, observation: { heading: "o", body: "다음 주 지출을 눈여겨보세요." }, followUps: [] },
};
const MATCH = {
  ...base, kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: DEFAULT_SAJU_FORM },
  cards: [{ position: "나의 마음", cardId: "wands-01", orientation: "reversed" }],
  reading: { verdict: "속도를 맞춰 가요", saju: { dayMasters: section, elements: section, pillars: section, luck: section }, cards: [], connection: section, bridge: section, action: section, observation: section, followUps: [] },
};
const YEAR = {
  ...base, kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: "차근차근 쌓아 가는 해",
  reading: { title: "차근차근 쌓아 가는 해", overview: section, luck: section, areas: { heading: "a", work: section, money: section, relations: section, health: section }, lucky: section, months: [], closing: section, observation: section, followUps: [] },
};

describe("premium chapters on the device", () => {
  it("reads the three premium kinds, as the server saves them", () => {
    const kinds = [DEEP, MATCH, YEAR].map((c) => parseChapter(c));
    expect(kinds.map((c) => c?.kind)).toEqual(["tarot-deep", "match", "newyear-2027"]);
    expect(kinds.every((c) => c && isPremiumChapter(c))).toBe(true);
    expect(parseChapter(MATCH)).toMatchObject({ partnerLabel: "민지", relationLabel: "친구" });
  });

  it("skips one missing what its page needs", () => {
    expect(parseChapter({ ...DEEP, cards: [] })).toBeNull();
    expect(parseChapter({ ...DEEP, reading: { ...DEEP.reading, observation: undefined } })).toBeNull();
    // Owner 2026-10-16: a partner's birth kept as text (an older shape) is dropped, never required.
    expect(parseChapter({ ...MATCH, partner: { birth: { year: "x" } } })).not.toHaveProperty("partner");
    expect(parseChapter({ ...YEAR, reading: { ...YEAR.reading, months: "x" } })).toBeNull();
  });

  it("labels them in 내 기록 and 돌아보기, and keeps them out of the history the next reading reads", () => {
    const [deep, match, year] = [DEEP, MATCH, YEAR].map((c) => parseChapter(c)!);
    expect(recordLine(deep!)).toEqual({ question: "이번 달 내 재물 흐름은 어떨까?", verdict: "v" });
    expect(recordLine(match!)).toEqual({ question: "프리미엄 궁합 · 친구", verdict: "속도를 맞춰 가요" });
    expect(recordLine(year!)).toEqual({ question: "2027 신년운세", verdict: "차근차근 쌓아 가는 해" });
    expect(checkinSource(year!)).toBe("10월 20일 2027 신년운세");
    expect(historyFor([deep!, match!, year!])).toEqual([]);
  });

  it("saves a fresh premium reading with its three follow-ups, and brings one from the account", () => {
    const { chapter } = saveChapter({ kind: "newyear-2027", birth: DEFAULT_SAJU_FORM, title: YEAR.title, reading: YEAR.reading, chapterToken: "t" } as never);
    expect(chapter.followUpsLeft).toBe(3);
    expect(mergeServerReadings([{ id: "srvabcdefghij0123456", createdAt: 1, chapter: { ...MATCH, id: undefined } }])).toBe(1);
    expect(listChapters().map((c) => c.kind)).toEqual(["newyear-2027", "match"]);
    expect(JSON.parse(localStorage.getItem(CHAPTERS_KEY)!).chapters).toHaveLength(2);
  });
});
