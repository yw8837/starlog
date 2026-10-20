import { describe, expect, it } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { buildDailySharePayload, buildSharePayload, parseSharePayload } from "./payload";

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
    // F-08: the sentence that quoted the note is dropped; the card's own sentences after it stay.
    expect(payload.reading.cards[0]?.body).toBe(MOCK_TAROT_READING.cards[0]!.body.split(/(?<=[.!?])\s+/).slice(1).join(" "));
    expect(JSON.stringify(payload)).not.toMatch(/회식|팀장님|이직 고민/);
  });

  it("drops a sentence that only quotes the user's hidden words, never leaving \"'○○'이라고 골랐으니\" behind (F-08)", () => {
    const input = { conditions: [{ label: "지금 상황", value: "지금은 수입이 없음" }], note: "비밀메모큐에이문구" };
    expect(sharedVerdict(input, "'지금은 수입이 없음'이라고 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요. 카드는 천천히 가라고 해요.")).toBe("카드는 천천히 가라고 해요.");
    expect(sharedVerdict(input, "그림이 조용해요. 메모에 '비밀메모큐에이문구'라고 적었죠. 그 마음이 그림에 보여요.")).toBe("그림이 조용해요. 그 마음이 그림에 보여요.");
    expect(sharedVerdict(input, '그림이 조용해요.\n메모에 "비밀메모큐에이문구"라고 적었죠.')).toBe("그림이 조용해요.");
    // A hidden word outside quotes reads as a plain blank and stays, as before.
    expect(sharedVerdict(input, "지금은 수입이 없음이라 버틸 기간부터 봐요. 카드는 천천히 가라고 해요.")).toBe("○○이라 버틸 기간부터 봐요. 카드는 천천히 가라고 해요.");
  });

  it("keeps a field whose every sentence quotes hidden words rather than empty it: the words stay hidden (F-08)", () => {
    expect(sharedVerdict({ note: "비밀메모큐에이문구" }, "메모에 '비밀메모큐에이문구'라고 적었죠.")).toBe("메모에 '○○'라고 적었죠.");
  });

  it("hides a quote that is only part of the note", () => {
    const partial = buildSharePayload(tarotCtx, { ...reading, verdict: '"회식 뒤로 답장이 없어요"라고 했지만 기다려 볼 때예요.' });
    if (partial.kind !== "tarot") return;
    expect(partial.reading.verdict).toBe('"○○"라고 했지만 기다려 볼 때예요.');
  });

  it("hides the situations the user picked, like their own words", () => {
    const chip = buildSharePayload(tarotCtx, { ...reading, verdict: "연락이 끊겼어요라는 상황에서는 기다림도 답이에요." });
    if (chip.kind !== "tarot") return;
    expect(chip.reading.verdict).toBe("○○라는 상황에서는 기다림도 답이에요.");
  });

  it("is in the 1909 design for a reading whose chapter names none (it was written for those scans)", () => {
    expect(payload.kind === "tarot" && payload.deck).toBe("rws1909");
  });
});

/** A tarot input with only the given user text, so each case tests one field. */
const only = (input: Record<string, unknown>) => ({ ...tarotCtx, input: { topicId: "custom", whoId: "us" as const, question: "", conditions: [], ...input } }) as ChapterContext;
const sharedVerdict = (input: Record<string, unknown>, verdict: string) => {
  const shared = buildSharePayload(only(input), { ...MOCK_TAROT_READING, verdict });
  return shared.kind === "tarot" ? shared.reading.verdict : "";
};

describe("hiding the user's words as the prompt saw them (review 2026-10-14)", () => {
  it("matches a note across a line break or a double space, the way the prompt collapsed it", () => {
    expect(sharedVerdict({ note: "민수가 요즘\n연락이 없어요" }, "민수가 요즘 연락이 없어요. 그래도 기다려 봐요.")).toBe("○○. 그래도 기다려 봐요.");
    expect(sharedVerdict({ note: "팀장님이  나를 싫어해요" }, "팀장님이 나를 싫어해요라는 마음이 보여요.")).toBe("○○라는 마음이 보여요.");
  });

  it("matches words typed with tag brackets or bold marks, which the prompt strips", () => {
    expect(sharedVerdict({ question: "<민수>랑 다시 만날까" }, "민수랑 다시 만날까 하는 물음에 카드가 답해요.")).toBe("○○ 하는 물음에 카드가 답해요.");
    expect(sharedVerdict({ question: "**지훈** 연락 올까" }, "지훈 연락 올까 하는 마음이 보여요.")).toBe("○○ 하는 마음이 보여요.");
  });

  it("matches full-width letters the way NFKC reads them", () => {
    expect(sharedVerdict({ note: "Ｍｉｎｓｕ랑 싸웠어요" }, "Minsu랑 싸웠어요라고 했죠.")).toBe("○○라고 했죠.");
  });

  it("hides a single-quoted span that quotes the user's words, however short, and keeps one that quotes the card", () => {
    const note = { note: "민수가 요즘\n연락이 없어요. 카페에서 만났어요" };
    expect(sharedVerdict(note, "'민수가 요즘 연락이 없어요'라고 적었죠.")).toBe("'○○'라고 적었죠.");
    expect(sharedVerdict(note, "'민수'에게 먼저 말을 걸어 봐요.")).toBe("'○○'에게 먼저 말을 걸어 봐요.");
    expect(sharedVerdict(note, "'카페'에서 만나 봐요. ‘민수가요즘’도 좋아요.")).toBe("'○○'에서 만나 봐요. ‘○○’도 좋아요.");
    expect(sharedVerdict(note, "지금은 '한 주기의 완성' 쪽으로 움직여 봐요.")).toBe("지금은 '한 주기의 완성' 쪽으로 움직여 봐요.");
  });

  it("keeps a double-quoted line that is not the user's", () => {
    expect(sharedVerdict({ note: "비밀 메모예요" }, '"천천히 가도 괜찮아요"라는 그림이에요.')).toBe('"천천히 가도 괜찮아요"라는 그림이에요.');
  });

  it("hides the given name of a 누구 typed as a full name, before a particle, an honorific or a boundary", () => {
    expect(sharedVerdict({ whoText: "김민수" }, "김민수 님은 조용해요. 민수가 먼저 연락할 수도 있어요. 민수 님께, 민수랑, 결국 민수.")).toBe(
      "○○ 님은 조용해요. ○○가 먼저 연락할 수도 있어요. ○○ 님께, ○○랑, 결국 ○○.",
    );
  });

  it("leaves ordinary words alone: inside a longer word, or a 누구 that is not a name", () => {
    expect(sharedVerdict({ whoText: "김민수" }, "시민수업과 민수용 물건이에요.")).toBe("시민수업과 민수용 물건이에요.");
    expect(sharedVerdict({ whoText: "짝사랑" }, "짝사랑 앞에서 사랑이 깊어져요.")).toBe("○○ 앞에서 사랑이 깊어져요.");
  });

  it("hides a name inside a longer 누구: its last word", () => {
    expect(sharedVerdict({ whoText: "전 남친 민수" }, "민수가 먼저 연락할 수도 있어요.")).toBe("○○가 먼저 연락할 수도 있어요.");
  });

  it("hides a full name typed in the question or the note, and its given name, after any particle", () => {
    expect(sharedVerdict({ question: "김민수랑 다시 잘될까" }, "민수 씨와 다시 이어질 흐름이에요. 김민수 님도 같은 마음이에요.")).toBe(
      "○○ 씨와 다시 이어질 흐름이에요. ○○ 님도 같은 마음이에요.",
    );
    expect(sharedVerdict({ note: "어제 박지은이랑 싸웠어요" }, "지은이는 아직 마음이 상해 있어요. 지은 씨에게 먼저 말해 봐요.")).toBe(
      "○○이는 아직 마음이 상해 있어요. ○○ 씨에게 먼저 말해 봐요.",
    );
  });

  it("hides a given name typed without a surname, where the user's words use it for a person", () => {
    expect(sharedVerdict({ question: "민수랑 다시 만날 수 있을까" }, "민수 씨와 다시 이어져요. 민수가 먼저 연락할 수도 있어요.")).toBe(
      "○○ 씨와 다시 이어져요. ○○가 먼저 연락할 수도 있어요.",
    );
    expect(sharedVerdict({ note: "지훈이가 연락이 없어요" }, "지훈이 마음도 살펴봐요.")).toBe("○○이 마음도 살펴봐요.");
    expect(sharedVerdict({ whoText: "남궁민수" }, "민수가 먼저 다가와요.")).toBe("○○가 먼저 다가와요.");
  });

  it("leaves the user's everyday words alone when they are not used for a person", () => {
    const input = { question: "하반기에 이야기가 잘 풀릴까, 소중한 인연이 생길까", note: "우울한 날이 많고 정해진 게 없어요. 반려견이랑 지내요" };
    const verdict = "하반기에는 이야기가 풀려요. 소중한 인연이 와요. 우울한 날도 정해진 흐름 안에 있어요. 반려견이 곁에 있어요.";
    expect(sharedVerdict(input, verdict)).toBe(verdict);
    expect(sharedVerdict({ whoText: "새로 온 직원" }, "직원이 먼저 다가와요.")).toBe("직원이 먼저 다가와요.");
  });

  it("hides the given name before 야말로, 까지, 부터 and the other particles", () => {
    expect(sharedVerdict({ whoText: "김민수" }, "민수야말로 먼저 다가올 사람이에요. 민수까지, 민수부터, 민수에게도.")).toBe(
      "○○야말로 먼저 다가올 사람이에요. ○○까지, ○○부터, ○○에게도.",
    );
  });

  it("leaves ordinary words alone: role words, and everyday words that start like a surname", () => {
    const input = { whoText: "회사 팀장님", question: "전남친이랑 어떻게 될까요? 연애운이 궁금해요", note: "지금은 마음이 복잡해요" };
    const verdict = "팀장님은 바빠요. 남친이 생길 수도 있어요. 지금은 어떻게 할지보다 마음이 먼저예요. 연애운이 좋아요.";
    expect(sharedVerdict(input, verdict)).toBe(verdict);
    expect(sharedVerdict({ whoText: "친한 친구" }, "친구가 먼저 웃어 줄 거예요.")).toBe("친구가 먼저 웃어 줄 거예요.");
  });

  it("hides the picked situations, but not an unsure answer", () => {
    const conditions = [
      { label: "지금 상황", value: "지금은 수입이 없음" },
      { label: "관심 방향", value: "잘 모르겠어요" },
    ];
    expect(sharedVerdict({ conditions }, "지금은 수입이 없음이라 버틸 기간부터 봐요. 잘 모르겠어요도 괜찮아요.")).toBe(
      "○○이라 버틸 기간부터 봐요. 잘 모르겠어요도 괜찮아요.",
    );
  });
});

describe("contact details in shared text", () => {
  it("drops every sentence with a link, an email, a phone number or a messenger ID, and keeps the rest", () => {
    const steered = [
      "자세한 건 https://evil.example/x 에서 봐요.",
      "www.evil.example 에 들어가요.",
      "evil-tarot.com 으로 와요.",
      "문의는 help@evil.example 로 보내요.",
      "010-1234-5678로 전화 주세요.",
      "02 345 6789로도 돼요.",
      "카톡 ID: lucky77 로 연락해요.",
      "카카오톡 아이디는 lucky77이에요.",
      "카​톡 아이디는 lucky77이에요.",
      "오픈채팅방에 들어와요.",
      "@lucky_tarot 을 팔로우해요.",
      "ｈｔｔｐｓ://evil.example 로 가요.",
    ];
    const verdict = `좋은 흐름이에요. ${steered.join(" ")} 오늘은 카톡으로 짧게 안부를 건네 봐요.`;
    expect(sharedVerdict({}, verdict)).toBe("좋은 흐름이에요. 오늘은 카톡으로 짧게 안부를 건네 봐요.");
  });

  it("drops a phone number with spaces around its dashes, and a 카카오·카톡·오픈채팅 아이디", () => {
    const steered = ["010 - 1234 - 5678로 연락해요.", "카카오 아이디 abc123 으로 와요.", "카톡 아이디 lucky77 이에요.", "오픈채팅 아이디는 tarot77이에요."];
    expect(sharedVerdict({}, `좋은 흐름이에요. ${steered.join(" ")} 3시간 뒤, 2027년 3월에 다시 봐요.`)).toBe("좋은 흐름이에요. 3시간 뒤, 2027년 3월에 다시 봐요.");
  });

  it("drops a line on its own, and leaves dates, ages and times that are not contact details", () => {
    expect(sharedVerdict({}, "첫 줄이에요.\n연락처 010 1234 5678\n2027년 3월, 15:30, 3~4주 뒤에 봐요.")).toBe("첫 줄이에요.\n2027년 3월, 15:30, 3~4주 뒤에 봐요.");
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

  const sajuBody = (birth: Record<string, unknown>, body: string, profile?: Record<string, string>) => {
    const ctx = { ...sajuCtx, birth: { ...sajuCtx.birth, ...birth }, ...(profile ? { profile } : {}) };
    const shared = buildSharePayload(ctx as never, { ...reading, sections: [{ heading: "타고난 바탕", body }] });
    return shared.kind === "saju" ? shared.reading.sections[0]?.body : "";
  };

  it("hides the birth however it is written: 년생 in two digits, dotted dates with spaces, clock times, and every age", () => {
    const born = { year: 1990, month: 5, day: 3, hour: 15, minute: 30 };
    expect(sajuBody(born, "90년생답게 차분해요. 1990. 5. 3. 태어난 날이에요. 15:30, 오후 3:30 무렵이에요.")).toBe("○○답게 차분해요. ○○. 태어난 날이에요. ○○, ○○ 무렵이에요.");
    expect(sajuBody(born, "지금 대운(34~43세, 2024~2033년)이 이어져요. 만 36세, 36살이에요.")).toBe("지금 대운(○○, 2024~2033년)이 이어져요. ○○, ○○이에요.");
  });

  it("hides a dotted birth date with a two-digit year", () => {
    const born = { year: 1990, month: 3, day: 7 };
    expect(sajuBody(born, "90.3.7에 태어났어요. 90. 3. 7. 생일이에요. 2027년 3월, 3시간 뒤에 봐요.")).toBe("○○에 태어났어요. ○○. 생일이에요. 2027년 3월, 3시간 뒤에 봐요.");
  });

  it("hides a written birth date with a two-digit year", () => {
    const born = { year: 1990, month: 3, day: 7 };
    expect(sajuBody(born, "90년 3월 7일생이에요. 90년 3월에 태어났죠. 2027년 3월에 봐요.")).toBe("○○생이에요. ○○에 태어났죠. 2027년 3월에 봐요.");
  });

  it("keeps the dates, times and words that are not the birth", () => {
    const born = { year: 1990, month: 5, day: 3, hour: 15, minute: 30 };
    expect(sajuBody(born, "2027년 3월에는 기운이 바뀌어요. 10:30에 걸어 봐요. 3세대가 함께 사는 집이에요.")).toBe("2027년 3월에는 기운이 바뀌어요. 10:30에 걸어 봐요. 3세대가 함께 사는 집이에요.");
  });

  it("hides the status the user picked, but not an unsure answer", () => {
    expect(sajuBody({}, "연애 중이라면 함께 사는 생활을 봐요. 일은 잘 모르겠어요라고 했죠.", { loveStatus: "연애 중", workStatus: "잘 모르겠어요" })).toBe(
      "○○이라면 함께 사는 생활을 봐요. 일은 잘 모르겠어요라고 했죠.",
    );
  });

  it("drops a sentence with contact details", () => {
    expect(sajuBody({}, "흐름이 좋아요. 상담은 010-1234-5678로 해요. 천천히 가요.")).toBe("흐름이 좋아요. 천천히 가요.");
  });

  it("drops a sentence that only quotes the status the user picked (F-08)", () => {
    expect(sajuBody({}, "흐름이 좋아요. '연애 중'이라고 골랐으니 함께 사는 생활을 봐요. 천천히 가요.", { loveStatus: "연애 중" })).toBe("흐름이 좋아요. 천천히 가요.");
  });

  it("hides every 간지 pair written in hanja, with its Hangul reading beside it: the pillars give the birth month and year away (A2 SHARE-2)", () => {
    expect(sajuBody({}, "월주 경신(庚申)에 비견이 둘이나 있는 명식이라, 일에서는 혼자 버티는 힘이 커요.")).toBe(
      "월주 ○○에 비견이 둘이나 있는 명식이라, 일에서는 혼자 버티는 힘이 커요.",
    );
    expect(sajuBody({}, "연주 기사(己巳), 일주 병오 (丙午), 시주 甲午(갑오)로 불 기운이 겹쳐요. 庚申월의 쇠 기운도 있어요.")).toBe(
      "연주 ○○, 일주 ○○, 시주 ○○로 불 기운이 겹쳐요. ○○월의 쇠 기운도 있어요.",
    );
    // A word beside the pair that is not its reading stays; so do single stems, elements and relations.
    expect(sajuBody({}, "월주(庚申)를 보면 일간 병화(丙火)와 충(沖), 천간충(天干沖)이 함께 있어요.")).toBe("월주(○○)를 보면 일간 병화(丙火)와 충(沖), 천간충(天干沖)이 함께 있어요.");
    // The glance is hidden the same way.
    const shared = buildSharePayload(sajuCtx as never,{ ...reading, glance: { ...reading.glance, thisYear: "일지 오화(午火)와 병오(丙午)가 만나 불 기운이 강해요." } });
    expect(shared.kind === "saju" ? shared.reading.glance?.thisYear : "").toBe("일지 오화(午火)와 ○○가 만나 불 기운이 강해요.");
  });

  it("keeps a year's own name after a year ('2026년 병오(丙午)년', '올해 丙午년'): it says nothing about the birth", () => {
    expect(sajuBody({}, "2026년 병오(丙午)년에는 불 기운이 강해요. 올해 丙午년은 바빠요. 내년 정미(丁未)년도 이어져요.")).toBe(
      "2026년 병오(丙午)년에는 불 기운이 강해요. 올해 丙午년은 바빠요. 내년 정미(丁未)년도 이어져요.",
    );
    // With 은/는 after the year, or 年/의 after the name (fix review #5).
    expect(sajuBody({}, "올해는 병오(丙午)년이라 불 기운이 강해요. 2026년은 병오(丙午)년이에요. 2026년 丙午年에는 바빠요.")).toBe(
      "올해는 병오(丙午)년이라 불 기운이 강해요. 2026년은 병오(丙午)년이에요. 2026년 丙午年에는 바빠요.",
    );
    // A birth year, or a pair after "년" with no year before it, is still hidden; so is a 대운, even right after a year (fix review R2).
    expect(sajuBody({}, "2031년부터 경신(庚申) 대운이에요. 월주 경신(庚申)의 힘이 커요. 2031년 경신(庚申)의 대운이 시작돼요.")).toBe(
      "2031년부터 ○○ 대운이에요. 월주 ○○의 힘이 커요. 2031년 ○○의 대운이 시작돼요.",
    );
    expect(sajuBody({}, "을해(乙亥)년생이라 2026년 경신(庚申)월에 바빠요. 병오(丙午)년인 올해는 좋아요.")).toBe(
      "○○년생이라 2026년 ○○월에 바빠요. ○○년인 올해는 좋아요.",
    );
  });

  it("keeps a pillar named in Hangul only: without the chart it cannot be told from an ordinary word", () => {
    expect(sajuBody({}, "월주 경신에 비견이 있어요.")).toBe("월주 경신에 비견이 있어요.");
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

describe("buildDailySharePayload (오늘의 한 장, owner 2026-10-20)", () => {
  const stored = {
    card: { cardId: "major-17-star", orientation: "reversed" as const, keyword: "희망" },
    summary: "작은 빛 하나를 따라가 보는 하루",
    body: "별 카드는 밤하늘 아래 물을 붓는 사람을 그려요.",
    areas: { love: "먼저 안부를 건네 보세요", money: "작은 지출을 적어 봐요", work: "한 가지만 끝내 봐요" },
    lucky: { color: "하늘색", number: 7 },
    tip: "물 한 잔을 천천히 마셔 보세요",
    pick: 2,
    deck: "starlog",
    did: "device-id-123",
  };

  it("keeps only the card, its design, what the screen shows and the KST day: no pick, no device", () => {
    const payload = buildDailySharePayload(stored, "2026-10-20");
    expect(payload).toEqual({
      kind: "daily",
      v: 1,
      deck: "starlog",
      day: "2026-10-20",
      reading: {
        card: { cardId: "major-17-star", orientation: "reversed", keyword: "희망" },
        summary: stored.summary,
        body: stored.body,
        areas: stored.areas,
        lucky: stored.lucky,
        tip: stored.tip,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("device-id-123");
  });

  it("is in the 1909 scans for a fortune stored without its design", () => {
    expect(buildDailySharePayload({ ...stored, deck: undefined }, "2026-10-20").deck).toBe("rws1909");
  });

  it("reads back as stored, and a malformed one is refused", () => {
    const payload = buildDailySharePayload(stored, "2026-10-20");
    expect(parseSharePayload(JSON.stringify(payload))).toEqual(payload);
    expect(parseSharePayload(JSON.stringify({ ...payload, deck: "other" }))).toBeNull();
    expect(parseSharePayload(JSON.stringify({ ...payload, day: "어제" }))).toBeNull();
    expect(parseSharePayload(JSON.stringify({ ...payload, reading: { ...payload.reading, card: null } }))).toBeNull();
  });
});
