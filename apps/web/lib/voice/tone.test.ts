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

describe("near-crisis wording the server's crisis words let through (review 2026-11-11): never teased", () => {
  // The reviewer's 위기 변형 samples. The server's crisis words (lib/crisis.ts) stay as they are; the browser's own check is
  // deliberately wide, since a false hit only hides a nickname.
  it.each(["죽는게 나을까", "살 이유가 없어", "다 포기하고 싶어", "더 버틸 자신이 없어", "그냥 사라질까", "없어지면 편할까", "자 살"])("the facts only: %s", (text) => {
    expect(nowTone(text)).toEqual({ tone: "facts", crisis: null });
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

  it("reads past spaces, marks, digits and invisible characters, but never calls a spaced-out word crisis words", () => {
    for (const text of ["죽 는 게 나 을 까", "자.살", "자1살", "버​틸 자신이 없어", "ㅈㅅ"]) expect(nowTone(text).tone).toBe("facts");
    // "자 살까 말까" is shopping: spaces gone it reads 자살, so it loses the nickname, but no helplines for it.
    expect(nowTone("자 살까 말까")).toEqual({ tone: "facts", crisis: null });
  });

  it("the 3-card tone reads the same way (one function)", () => {
    expect(tarotTone({ texts: ["더 버틸 자신이 없어"], topicId: "crush" })).toEqual({ tone: "facts", crisis: null });
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
