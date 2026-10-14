// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import type { DailyData, TarotReadingData } from "@/lib/reading/types";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { BETA_USAGE_KEY, clearBetaUsage, countFullReading, markFreeUsedUp, remainingFree, useRemainingFree } from "./betaUsage";
import {
  CHAPTERS_KEY,
  answerCheckin,
  chaptersPersisted,
  checkinDue,
  checkinSource,
  clearChapters,
  deleteChapter,
  dueCheckin,
  getChapter,
  hasChapterEntry,
  historyFor,
  listChapters,
  newestFirst,
  observationOf,
  parseChapter,
  recordLine,
  sajuChapterEyebrow,
  sajuRecordTitle,
  saveChapter,
  updateChapter,
  useChapters,
  type NewChapter,
  type SajuChapter,
} from "./chapters";
import { DAILY_KEY, readDaily, saveDaily, useDaily } from "./daily";

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-01 12:00 KST
const NOW = Date.parse("2026-10-01T03:00:00.000Z");

const READING: TarotReadingData = {
  verdict: "지금은 지출을 먼저 줄여 보는 쪽이 맞아요",
  cards: [{ position: "지금의 나", cardId: "major-09-hermit", heading: "은둔자 · 혼자 셈하는 시간", body: "…" }],
  connection: { heading: "세 장의 연결", body: "…" },
  timing: { heading: "시기", body: "…" },
  observation: { heading: "며칠 안에 확인해 볼 신호", body: "이번 주 안에 고정 지출 하나가 눈에 띄는지 살펴보세요" },
  scenarios: { heading: "흐름", items: [] },
  messages: { heading: "말", items: [], hint: "" },
  avoid: { heading: "피할 것", items: [] },
  alternatives: { heading: "다른 길", body: "…" },
  action: { heading: "오늘 해 볼 일", body: "…" },
  followUps: [],
};

const TAROT: NewChapter = {
  kind: "tarot",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "지금은 수입이 없음" }],
  note: "",
  cards: [{ position: "지금의 나", cardId: "major-09-hermit", orientation: "upright", keyword: "혼자 셈하기" }],
  reading: READING,
  chapterToken: "chapter.token",
};

const SAJU: NewChapter = {
  kind: "saju",
  birth: DEFAULT_SAJU_FORM,
  title: "한겨울에 뜬 해",
  summary: "한겨울에 태어난 병화 일간이에요.",
  reading: { sections: [{ heading: "월령과 뿌리", body: "…" }], followUps: [] },
  chapterToken: "saju.token",
};

afterEach(() => localStorage.clear());

describe("chapters store", () => {
  it("saves, lists, updates and deletes readings on this device", () => {
    const { chapter: a, persisted } = saveChapter(TAROT, NOW);
    const { chapter: b } = saveChapter(SAJU, NOW + 1000);
    expect(persisted).toBe(true);
    expect(a.id).toMatch(/^[a-z0-9]{8}$/);
    expect(a).toMatchObject({ createdAt: NOW, turns: [], followUpsLeft: 3 });
    expect(listChapters().map((c) => c.id)).toEqual([a.id, b.id]);
    expect(newestFirst(listChapters()).map((c) => c.id)).toEqual([b.id, a.id]);
    // Stored exactly as returned (follow-ups send it back for a digest check).
    expect(getChapter(a.id)?.reading).toEqual(READING);

    updateChapter(a.id, (c) => ({ ...c, chapterToken: "next", turns: [{ question: "q", answer: "a" }], followUpsLeft: 2 }));
    expect(getChapter(a.id)).toMatchObject({ chapterToken: "next", followUpsLeft: 2, turns: [{ question: "q", answer: "a" }] });

    deleteChapter(a.id);
    expect(listChapters().map((c) => c.id)).toEqual([b.id]);
    clearChapters();
    expect(listChapters()).toEqual([]);
    expect(localStorage.getItem(CHAPTERS_KEY)).toBeNull();
  });

  it("shares saves with every hook (undefined only before hydration)", () => {
    const { result } = renderHook(() => useChapters());
    expect(result.current).toEqual([]);
    act(() => {
      saveChapter(TAROT, NOW);
    });
    expect(result.current).toHaveLength(1);
  });

  it("never drops a stored entry it cannot read when saving, updating or deleting others", () => {
    const future = { id: "future01", kind: "tarot-v9", createdAt: NOW, somethingNew: true };
    const broken = { id: "broken01", kind: "tarot", createdAt: NOW, chapterToken: "t", reading: {} };
    // The first versions stored a bare array: it reads as v1.
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify([future, broken]));
    expect(listChapters()).toEqual([]);
    const { chapter } = saveChapter(TAROT, NOW);
    updateChapter(chapter.id, (c) => ({ ...c, followUpsLeft: 1 }));
    updateChapter("broken01", (c) => ({ ...c, followUpsLeft: 0 }));
    deleteChapter("nothere1");
    const stored = JSON.parse(localStorage.getItem(CHAPTERS_KEY)!);
    expect(stored.v).toBe(1);
    expect(stored.chapters.slice(0, 2)).toEqual([future, broken]);
    expect(listChapters().map((c) => [c.id, c.followUpsLeft])).toEqual([[chapter.id, 1]]);
    deleteChapter(chapter.id);
    expect(JSON.parse(localStorage.getItem(CHAPTERS_KEY)!).chapters).toEqual([future, broken]);
  });

  it("says when the browser would not keep a reading (storage full or blocked)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { chapter, persisted } = saveChapter(TAROT, NOW);
    expect(persisted).toBe(false);
    expect(chaptersPersisted()).toBe(false);
    // Still readable for this visit.
    expect(getChapter(chapter.id)?.id).toBe(chapter.id);
    setItem.mockRestore();
    clearChapters();
    expect(chaptersPersisted()).toBe(true);
  });

  it("skips stored entries that cannot be shown, keeps the rest", () => {
    const good = { ...TAROT, id: "abcdef12", createdAt: NOW, turns: [], followUpsLeft: 3 };
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify([good, { ...good, id: "../x" }, { ...good, id: "zzzzzz99", cards: [] }, { kind: "saju", id: "yyyyyy99" }, "junk"]));
    expect(listChapters().map((c) => c.id)).toEqual(["abcdef12"]);
    expect(parseChapter({ ...SAJU, id: "abcdef12", createdAt: NOW, birth: { year: 1 } })).toBeNull();
  });

  it("keeps the card design a reading was written for, and drops one it does not know", () => {
    const base = { ...TAROT, id: "abcdef12", createdAt: NOW, turns: [], followUpsLeft: 3 };
    expect(parseChapter({ ...base, deck: "starlog" })?.deck).toBe("starlog");
    expect(parseChapter({ ...base, deck: "rws1909" })?.deck).toBe("rws1909");
    expect(parseChapter({ ...base, deck: "tarot-of-elsewhere" })).not.toHaveProperty("deck");
    // Saved before 2026-10-14: no deck, so the record shows the viewer's choice.
    expect(parseChapter(base)).not.toHaveProperty("deck");
  });

  it("keeps a reading saved before the story block was dropped", () => {
    const old = { ...TAROT, id: "abcdef12", createdAt: NOW, reading: { ...READING, observation: undefined, story: { title: "t", body: "b" } } };
    expect(parseChapter(old)?.reading.story).toEqual({ title: "t", body: "b" });
  });
});

describe("돌아보기", () => {
  it("asks about the observation 3 days later, and again 3 days after 아직이에요", () => {
    const { chapter } = saveChapter(TAROT, NOW);
    expect(checkinDue(chapter, NOW + 2 * DAY)).toBe(false);
    expect(checkinDue(chapter, NOW + 3 * DAY)).toBe(true);
    expect(dueCheckin(listChapters(), NOW + 3 * DAY)?.id).toBe(chapter.id);

    answerCheckin(chapter.id, "아직이에요", NOW + 3 * DAY);
    expect(dueCheckin(listChapters(), NOW + 4 * DAY)).toBeUndefined();
    expect(dueCheckin(listChapters(), NOW + 6 * DAY)?.id).toBe(chapter.id);

    answerCheckin(chapter.id, "맞았어요", NOW + 6 * DAY);
    expect(dueCheckin(listChapters(), NOW + 30 * DAY)).toBeUndefined();
    expect(getChapter(chapter.id)?.checkin).toEqual({ answer: "맞았어요", at: NOW + 6 * DAY });
  });

  it("never asks about a reading without an observation", () => {
    const { chapter } = saveChapter({ ...TAROT, reading: { ...READING, observation: undefined } } as NewChapter, NOW);
    expect(checkinDue(chapter, NOW + 10 * DAY)).toBe(false);
  });
});

describe("history sent with a new reading", () => {
  it("sends up to 3 newest records, clipped to the server's caps", () => {
    saveChapter({ ...TAROT, question: "가".repeat(80) }, NOW - 3 * DAY);
    saveChapter(SAJU, NOW - 2 * DAY);
    const { chapter: last } = saveChapter(TAROT, NOW - DAY);
    saveChapter(TAROT, NOW);
    answerCheckin(last.id, "다르게 흘렀어요", NOW);
    const history = historyFor(listChapters());
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({
      date: "2026-10-01",
      kind: "tarot",
      question: TAROT.kind === "tarot" ? TAROT.question : "",
      verdict: READING.verdict,
      observation: READING.observation!.body,
    });
    expect(history[1]).toMatchObject({ date: "2026-09-30", checkin: "다르게 흘렀어요" });
    expect(history[2]).toEqual({ date: "2026-09-29", kind: "saju", question: "사주 · 한겨울에 뜬 해", verdict: "한겨울에 태어난 병화 일간이에요." });
    for (const item of history) {
      expect(item.question.length).toBeLessThanOrEqual(60);
      expect(item.verdict.length).toBeLessThanOrEqual(80);
    }
    expect(historyFor([])).toEqual([]);
  });
});

describe("오늘의 한 장 cache by KST day", () => {
  const DAILY: DailyData = {
    card: { cardId: "major-19-sun", orientation: "upright", keyword: "숨기지 않기" },
    summary: "오늘은 숨기지 않아도 되는 날",
    body: "…",
    areas: { love: "…", money: "…", work: "…" },
    lucky: { color: "금색", number: 7 },
    tip: "…",
  };

  it("keeps the day's cookie until KST midnight, then reads as nothing", () => {
    const beforeMidnight = Date.parse("2026-10-01T14:59:00.000Z"); // 23:59 KST
    const afterMidnight = Date.parse("2026-10-01T15:00:00.000Z"); // 00:00 KST next day
    saveDaily(DAILY, NOW);
    expect(readDaily(NOW)).toEqual(DAILY);
    expect(readDaily(beforeMidnight)).toEqual(DAILY);
    expect(readDaily(afterMidnight)).toBeNull();
    expect(JSON.parse(localStorage.getItem(DAILY_KEY)!).day).toBe("2026-10-01");
  });

  it("reads as not opened before any save, then as today's cookie", () => {
    const { result } = renderHook(() => useDaily(NOW));
    expect(result.current).toBeNull();
    act(() => saveDaily(DAILY, NOW));
    expect(result.current).toEqual(DAILY);
  });
});

describe("첫 이용 무료 shown on the unlock", () => {
  afterEach(() => clearBetaUsage());

  it("counts the free readings this device opened for good: no reset the next KST day", () => {
    const free = SITE.beta.firstFreeTarot;
    const { result } = renderHook(() => useRemainingFree());
    expect(result.current).toBe(free);
    act(() => countFullReading());
    expect(result.current).toBe(Math.max(0, free - 1));
    act(() => markFreeUsedUp());
    expect(result.current).toBe(0);
    // Kept with no day: nothing refills it at KST midnight.
    const stored = JSON.parse(localStorage.getItem(BETA_USAGE_KEY)!);
    expect(stored).not.toHaveProperty("day");
    expect(remainingFree(stored)).toBe(0);
  });

  it("ignores the old daily count, so a device that used a day's free reading before still sees its first one", () => {
    localStorage.setItem("starlog.beta-usage", JSON.stringify({ day: "2026-10-13", full: 1 }));
    expect(BETA_USAGE_KEY).not.toBe("starlog.beta-usage");
    const { result } = renderHook(() => useRemainingFree());
    expect(result.current).toBe(SITE.beta.firstFreeTarot);
  });
});

describe("never writing a broken reading (QA Q-02, Q-03)", () => {
  it("keeps the chapter when an update would leave it unreadable (a follow-up without a token)", () => {
    const { chapter } = saveChapter(TAROT, NOW);
    updateChapter(chapter.id, (c) => ({ ...c, chapterToken: undefined as unknown as string, turns: [...c.turns, { question: "q", answer: "a" }] }));
    expect(getChapter(chapter.id)).toMatchObject({ chapterToken: "chapter.token", turns: [] });
    updateChapter(chapter.id, (c) => ({ ...c, chapterToken: "next.token", followUpsLeft: 2 }));
    expect(getChapter(chapter.id)).toMatchObject({ chapterToken: "next.token", followUpsLeft: 2 });
  });

  it("tells a stored-but-unreadable entry apart from a missing one, and reads a malformed observation as none", () => {
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters: [{ id: "abcdef12", kind: "tarot" }] }));
    expect(getChapter("abcdef12")).toBeUndefined();
    expect(hasChapterEntry("abcdef12")).toBe(true);
    expect(hasChapterEntry("zzzzzz99")).toBe(false);
    const { chapter } = saveChapter({ ...TAROT, reading: { ...READING, observation: {} as TarotReadingData["observation"] } }, NOW);
    expect(observationOf(getChapter(chapter.id)!)).toBeUndefined();
  });

  it("drops a kept 오늘의 한 장 with an unknown card or missing areas", () => {
    const today = new Date(NOW + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const card = { cardId: "major-99-nope", orientation: "upright", keyword: "k" };
    localStorage.setItem(DAILY_KEY, JSON.stringify({ day: today, reading: { card, summary: "s", body: "b", tip: "t", areas: { love: "", money: "", work: "" }, lucky: { color: "c", number: 1 } } }));
    expect(readDaily(NOW)).toBeNull();
    localStorage.setItem(DAILY_KEY, JSON.stringify({ day: today, reading: { card: { ...card, cardId: "major-19-sun" }, summary: "s", body: "b", tip: "t", areas: {}, lucky: {} } }));
    expect(readDaily(NOW)).toBeNull();
  });
});

describe("topics in saved chapters (saju-topics spec §7.2, §7.8)", () => {
  const MONEY = { ...SAJU, title: "흙 속의 쇠", topic: "money" } as NewChapter;
  const LOVE = { ...SAJU, title: "봄의 촛불", topic: "love" } as NewChapter;
  const CAREER = { ...SAJU, title: "곧은 나무", topic: "career" } as NewChapter;
  const stored = (chapter: object, id: string) => ({ ...chapter, id, createdAt: NOW, turns: [], followUpsLeft: 3 });

  it("keeps a topic; an unknown topic reads as 전체 흐름 and the record stays; a stored chip is not kept", () => {
    expect(parseChapter(stored(MONEY, "abcdef12"))).toMatchObject({ kind: "saju", topic: "money" });
    const odd = parseChapter(stored({ ...MONEY, topic: "health" }, "abcdef13"))!;
    expect(odd.kind).toBe("saju");
    expect(odd).not.toHaveProperty("topic");
    expect(parseChapter(stored({ ...MONEY, situation: "leaking" }, "abcdef14"))).not.toHaveProperty("situation");
  });

  it("names the 운 in a record line with the screen's label", () => {
    expect(recordLine(saveChapter(MONEY, NOW).chapter)).toEqual({ question: "사주 재물운 · 흙 속의 쇠", verdict: "한겨울에 태어난 병화 일간이에요." });
    expect(recordLine(saveChapter(CAREER, NOW).chapter).question).toBe("사주 직장운 · 곧은 나무");
    expect(recordLine(saveChapter(SAJU, NOW).chapter).question).toBe("사주 · 한겨울에 뜬 해");
  });

  it("sends a topic only its own saju records, 전체 흐름 tarot and saju without a topic, tarot everything", () => {
    saveChapter(TAROT, NOW - 4 * DAY);
    saveChapter(SAJU, NOW - 3 * DAY);
    saveChapter(LOVE, NOW - 2 * DAY);
    saveChapter(MONEY, NOW - DAY);
    const all = listChapters();
    expect(historyFor(all, { topic: "money" }).map((h) => [h.kind, h.question, h.topic])).toEqual([["saju", "사주 재물운 · 흙 속의 쇠", "money"]]);
    expect(historyFor(all, { topic: "overall" }).map((h) => h.question)).toEqual(["사주 · 한겨울에 뜬 해", "이번 주, 나의 재물 흐름은 어떨까"]);
    expect(historyFor(all)).toHaveLength(3);
    expect(historyFor(all)[0]).toMatchObject({ kind: "saju", topic: "money" });
  });
});

describe("the 운 on records (saju-topics spec §5.3)", () => {
  // NOW is 2026-10-01 12:00 KST; DEFAULT_SAJU_FORM is 1990-01-01.
  const MONEY = { ...SAJU, topic: "money" } as NewChapter;
  const CAREER = { ...SAJU, topic: "career" } as NewChapter;

  it("titles a saju record '<운> · <생일>'; without a topic it is 사주팔자, or its teaser title while the topics are closed", () => {
    const money = saveChapter(MONEY, NOW).chapter as SajuChapter;
    const career = saveChapter(CAREER, NOW).chapter as SajuChapter;
    const old = saveChapter(SAJU, NOW).chapter as SajuChapter;
    expect(sajuRecordTitle(money, true)).toBe("재물운 · 1990년 1월 1일");
    expect(sajuRecordTitle(money, false)).toBe("재물운 · 1990년 1월 1일");
    expect(sajuRecordTitle(career, true)).toBe("직장운 · 1990년 1월 1일");
    expect(sajuRecordTitle(old, true)).toBe("사주팔자 · 1990년 1월 1일");
    expect(sajuRecordTitle(old, false)).toBe("한겨울에 뜬 해");
    expect(sajuRecordTitle({ ...old, title: "" }, false)).toBe("나의 사주");
  });

  it("names the 운 in the chapter eyebrow and the home 돌아보기's source", () => {
    const career = saveChapter(CAREER, NOW).chapter as SajuChapter;
    const old = saveChapter(SAJU, NOW).chapter as SajuChapter;
    expect(sajuChapterEyebrow(career)).toBe("사주 직장운 · 10월 1일");
    expect(sajuChapterEyebrow(old)).toBe("사주 기록 · 10월 1일");
    expect(checkinSource(career)).toBe("10월 1일 사주 · 직장운");
    expect(checkinSource(old)).toBe("10월 1일 사주");
    expect(checkinSource(saveChapter(TAROT, NOW).chapter)).toBe("10월 1일 타로");
  });
});
