import { describe, expect, it } from "vitest";
import { CRISIS_HITS } from "@/lib/api/crisisSamples";
import { nowTone, tarotTone } from "./tone";

/** Spec 2026-11-11 entry funnel renewal, 2.5: how far the characters may tease, judged before anything is shown. */

describe("지금의 한 장 tone (question only, spec 2.5)", () => {
  it.each(CRISIS_HITS)("crisis words get the care lines, never a nickname: %s", (text) => {
    const verdict = nowTone(text);
    expect(verdict.tone).toBe("crisis");
    expect(verdict.crisis).not.toBeNull();
  });

  it("names the tier, so a stated means or plan leads with the emergency lines", () => {
    expect(nowTone("죽고 싶어. 유서도 써놨어").crisis).toBe("urgent");
    expect(nowTone("살고 싶지 않아요").crisis).toBe("passive");
  });

  it.each(["수술 받아도 될까", "대출 갈아탈까", "병원 옮길까", "주식 지금 팔까", "코인 들어갈까", "소송 걸까", "임신 준비해도 될까"])("a heavy topic gets the facts only: %s", (text) => {
    expect(nowTone(text)).toEqual({ tone: "facts", crisis: null });
  });

  it.each(["헤어진 사람한테 연락할까", "재회할 수 있을까", "이혼할까", "결혼해도 될까", "어제 싸웠는데 먼저 사과할까", "돈 빌려줘도 될까"])("what three cards would read mildly (a breakup, marriage, a fight, money) gets the facts only here: one card has no mild table: %s", (text) => {
    expect(nowTone(text).tone).toBe("facts");
  });

  it.each(["먼저 연락할까", "오늘 먼저 연락해도 될까?", "이직 준비를 시작할까?", "", "   ", "죽음 카드가 나왔어요", "이번 주말 여행 갈까"])("everything else is teased: %j", (text) => {
    expect(nowTone(text)).toEqual({ tone: "spicy", crisis: null });
  });
});

/**
 * Coordinator 2026-11-11: two steps of near-crisis wording the server's crisis words let through. A plain wish to end one's
 * life or to vanish, read in the sentence itself (spaces and jamo tricks included), is the care step: no nickname, no card
 * line, no why, no share, the care lines and contacts. The wide list (죽, 사라지, 없어지, 버티 …) only hides the nickname.
 */
const STRONG_NEAR = [
  "죽는게 나을까", "죽는 게 낫겠다", "그냥 죽는 게 편할 것 같아", "살 이유가 없어", "사는 의미가 없어", "사는 게 싫어",
  "그냥 사라질까", "차라리 사라질까", "없어지면 편할까", "없어지고 싶어", "내가 없어지면 다들 편하겠지", "더 버틸 자신이 없어",
  "이제 못 버티겠어", "더는 못 버티겠다", "다 포기하고 싶어", "요즘 다 포기하고 싶다", "전부 포기하고 싶다", "다 끝내고 싶어",
  "태어나지 말걸 그랬어", "영원히 잠들고 싶어", "깨어나지 않았으면 좋겠어", "세상 떠나고 싶어", "뒤지고 싶다", "자 살",
  // the same with spaces, marks, digits, invisible characters or jamo typed apart
  "죽 는 게 나 을 까", "사 라 지 고 싶 다", "자.살", "자1살", "버​틸 자신이 없어", "주ㄱ는게 나을까",
];
/** Everyday overstatement and things that go missing: the card's line stays (some lose the nickname to the wide list). */
const EVERYDAY_OVERSTATEMENT = [
  "배고파 죽겠어 뭐 먹지", "웃겨 죽겠다 ㅋㅋ", "졸려 죽겠는데 커피 마실까", "더워 죽겠어 에어컨 살까", "보고 싶어 죽겠어 연락할까",
  "귀여워 죽겠어 고양이 입양할까", "시험 공부 죽을 맛이야", "이 노래 죽이는데 공연 갈까", "피곤해 죽을 것 같아 쉴까",
  "회사 더 버텨야 할까", "조금만 버티면 승진할까", "지갑이 없어졌어 찾을 수 있을까", "우산이 사라졌어", "약속이 없어졌는데 뭐 할까",
  "일정이 사라져서 한가해", "사라진 반지 찾을 수 있을까", "자 살까 말까", "죽 먹을까 밥 먹을까", "숙제 다 끝내고 싶어",
  "연애 끝내고 싶어", "다이어트 포기하고 싶어", "쪽팔려서 사라지고 싶어", "죽음 카드가 나왔어요", "택배가 사라졌는데 다시 시킬까",
];

describe("near-crisis wording the server's crisis words let through (review 2026-11-11, coordinator's two steps)", () => {
  it("holds at least 20 of each", () => {
    expect(STRONG_NEAR.length).toBeGreaterThanOrEqual(20);
    expect(EVERYDAY_OVERSTATEMENT.length).toBeGreaterThanOrEqual(20);
  });

  it.each(STRONG_NEAR)("a plain wish to end it or vanish hides the card's line (the care step, or the server's crisis words): %s", (text) => {
    expect(["care", "crisis"]).toContain(nowTone(text).tone);
  });

  it.each(EVERYDAY_OVERSTATEMENT)("everyday overstatement keeps the card's line: %s", (text) => {
    expect(["care", "crisis"]).not.toContain(nowTone(text).tone);
  });

  it("the wide list still hides the nickname of what it reads: the facts only", () => {
    for (const text of ["배고파 죽겠어 뭐 먹지", "회사 더 버텨야 할까", "다이어트 포기하고 싶어", "ㅈㅅ", "자 살까 말까", "연애 끝내고 싶어"]) {
      expect(nowTone(text)).toEqual({ tone: "facts", crisis: null });
    }
  });

  it("the care step is the browser's own: no server tier", () => {
    for (const text of ["죽는게 나을까", "살 이유가 없어", "다 포기하고 싶어", "더 버틸 자신이 없어", "그냥 사라질까", "없어지면 편할까", "자 살"]) {
      expect(nowTone(text)).toEqual({ tone: "care", crisis: null });
    }
  });

  it.each([
    ["죽고 싶다", "active"],
    ["죽고싶당", "active"],
    ["살기 싫다 진짜", "passive"],
    ["이직할까? 근데 요즘 죽고 싶어", "active"],
  ] as const)("what the server's crisis words catch gets the care lines: %s", (text, tier) => {
    expect(nowTone(text)).toEqual({ tone: "crisis", crisis: tier });
  });

  it("joins jamo typed apart before the server's crisis words read it: the care lines", () => {
    expect(nowTone("주ㄱ고 싶어")).toEqual({ tone: "crisis", crisis: "active" });
    expect(nowTone("ㅈㅏㅅㅏㄹ하고 싶어")).toEqual({ tone: "crisis", crisis: "active" });
  });

  it("the 3-card tone reads the same way (one function)", () => {
    expect(tarotTone({ texts: ["더 버틸 자신이 없어"], topicId: "crush" })).toEqual({ tone: "care", crisis: null });
    expect(tarotTone({ texts: ["배고파 죽겠어"], topicId: "daily" })).toEqual({ tone: "facts", crisis: null });
    expect(tarotTone({ texts: ["", "주ㄱ고 싶어"], topicId: "career" }).tone).toBe("crisis");
  });
});

/**
 * The review's probe (2026-11-11, tone-probe.ts and regex-probe.mjs): all 57 sensitive samples (its 59 cases but the two it
 * also lists as ordinary) and its 13 ordinary ones, plus the ordinary questions the fix list names.
 */
const REVIEW_SENSITIVE = [
  // 이별·전애인
  "전남친한테 연락 올까?", "전여친 다시 만날 수 있을까", "차였는데 다시 연락해 볼까", "남친이 바람폈어 헤어질까", "남친이 바람폈어", "헤여졌는데 연락할까", "헤 어진 사람 생각나", "이 별 후에 연락해도 될까", "파혼할까", "잠수 탄 그 사람 돌아올까", "손절당한 친구한테 연락할까",
  // 사별
  "엄마가 돌아가셨는데 잘 지내고 계실까", "사별 후에 다시 연애해도 될까", "강아지가 죽었어. 다시 만날 수 있을까", "무지개다리 건넌 우리 애 잘 있을까", "아빠 기일인데 산소 갈까",
  // 병·건강
  "엄마 암이래. 괜찮을까", "약 끊어도 될까", "검사 결과 괜찮을까", "응급실 가야 할까", "우울증 약 먹어야 할까", "공황 때문에 회사 그만둘까", "아파서 출근 못 하겠어", "병 낫을 수 있을까", "정신과 가볼까", "건 강 검진 받을까",
  // 임신
  "유산했는데 다시 가질 수 있을까", "난임 시술 이번엔 될까", "시험관 이번엔 될까", "임 신 했을까", "임테기 두 줄 나올까",
  // 빚·돈
  "카드값 못 갚으면 어떡해", "빛 때문에 너무 힘들어", "연체됐는데 어떡하지", "개인회생 신청할까", "사채 써도 될까", "전세사기 당한 것 같아", "아파트 지금 살까", "비트코인 지금 살까", "적금 깨서 집 살까",
  // 위기 변형
  "죽고 싶다", "주ㄱ고 싶어", "죽고싶당", "살기 싫다 진짜", "그냥 사라질까", "다 포기하고 싶어", "더 버틸 자신이 없어", "자 살", "죽는게 나을까", "없어지면 편할까", "살 이유가 없어",
  // 혼합
  "이직할까? 근데 요즘 죽고 싶어", "회사에서 잘렸어", "왕따 당하는데 전학 갈까", "학폭 신고할까", "성희롱 신고할까", "스토킹 신고할까",
];
const REVIEW_ORDINARY = ["먼저 연락할까", "오늘 먼저 연락해도 될까?", "이직 준비를 시작할까?", "", "   ", "죽음 카드가 나왔어요", "이번 주말 여행 갈까", "고백할까 말까 ㅋㅋ", "시험 떨어졌어 재수할까", "소개팅 나가 볼까", "썸남한테 카톡 보낼까", "이사 갈까", "머리 자를까"];
/** Named in the fix list as ordinary: "살까 말까" is a small purchase. */
const LISTED_ORDINARY = ["연락할까 말까", "이직할까", "오늘 뭐 먹지", "고백해도 될까", "살까 말까"];

describe("the review's samples (2026-11-11 #2): every sensitive one loses the nickname, every ordinary one keeps it", () => {
  it("holds the probe's counts", () => {
    expect(REVIEW_SENSITIVE).toHaveLength(57);
    expect(new Set(REVIEW_SENSITIVE).size).toBe(57);
    expect(REVIEW_ORDINARY).toHaveLength(13);
  });

  it.each(REVIEW_SENSITIVE)("not teased: %s", (text) => {
    expect(nowTone(text).tone).not.toBe("spicy");
  });

  it.each([...REVIEW_ORDINARY, ...LISTED_ORDINARY])("teased: %j", (text) => {
    expect(nowTone(text)).toEqual({ tone: "spicy", crisis: null });
  });

  it("names the step: a breakup, a loss, illness, pregnancy, debt, violence or a lost job is the facts only, not crisis", () => {
    for (const text of ["헤여졌는데 연락할까", "무지개다리 건넌 우리 애 잘 있을까", "공황 때문에 회사 그만둘까", "임테기 두 줄 나올까", "빛 때문에 너무 힘들어", "스토킹 신고할까", "회사에서 잘렸어"]) {
      expect(nowTone(text)).toEqual({ tone: "facts", crisis: null });
    }
  });

  it("near misses keep the nickname: hair is not a breakup, 아프리카 is no illness, 유산균 is no pregnancy loss", () => {
    for (const text of ["헤어 컬러 바꿀까", "아프리카 여행 갈까", "유산균 먹어 볼까"]) expect(nowTone(text).tone).toBe("spicy");
  });

  it("3 cards read them the same: the breakup words mild (spec 2.5), the rest the facts only", () => {
    expect(tarotTone({ texts: ["전남친한테 연락 올까?"], topicId: "contact" }).tone).toBe("mild");
    expect(tarotTone({ texts: ["엄마 암이래. 괜찮을까"], topicId: "daily" }).tone).toBe("facts");
    expect(tarotTone({ texts: ["", "학폭 신고할까"], topicId: "people" }).tone).toBe("facts");
  });
});

describe("3장 tone (topic and texts, spec 2.5 order)", () => {
  it("crisis first, whatever the topic", () => {
    expect(tarotTone({ texts: ["그냥 다 끝내고 싶어"], topicId: "crush" }).tone).toBe("crisis");
  });

  it("then a heavy topic in any text, then 건강·컨디션 and 마음·감정: facts only", () => {
    expect(tarotTone({ texts: ["", "대출 갈아탈까"], topicId: "crush" }).tone).toBe("facts");
    expect(tarotTone({ topicId: "health" }).tone).toBe("facts");
    expect(tarotTone({ topicId: "mind" }).tone).toBe("facts");
  });

  it("then 재회, 갈등·화해, 결혼, 재물운, a written topic, a breakup or money text: mild", () => {
    for (const topicId of ["reunion", "conflict", "marriage", "money"]) expect(tarotTone({ topicId }).tone).toBe("mild");
    expect(tarotTone({ topicId: "crush", customTopic: true }).tone).toBe("mild");
    expect(tarotTone({ texts: ["헤어진 사람"], topicId: "contact" }).tone).toBe("mild");
    expect(tarotTone({ texts: ["돈 문제"], topicId: "people" }).tone).toBe("mild");
  });

  it("the rest is teased", () => {
    for (const topicId of ["crush", "relationship", "contact", "love", "career", "study", "creative", "negotiation", "people", "together", "mood", "move", "daily", undefined]) {
      expect(tarotTone({ texts: ["먼저 연락해도 될까?"], topicId }).tone).toBe("spicy");
    }
  });
});
