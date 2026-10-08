import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_OBSERVATION_HEADING } from "@/lib/ai/prompts/saju";
import { SITE, sajuTopicsMode } from "./config";
import { SAJU_GLANCE_HEADING } from "./sajuPrologue";
import {
  BACK_TO_OVERALL, OTHER_TOPICS_LABEL, SAJU_TOPICS, SAJU_TOPIC_IDS, SITUATIONS, TEASER_LIMIT_NOTICE, TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS,
  TOPIC_SECTION_LENGTH, TOPIC_SWITCH_HELP, TOPIC_TOTAL_LENGTH, UNLOCK_SCOPE_LINE, isSajuTopic, isSajuTopicId, otherTopicLabels, sajuTopicsVisible,
  situationOf, topicLabel, topicLockedToc, topicName,
} from "./sajuTopics";

describe("the five topics", () => {
  it("lists 전체 흐름 first, then the four 운; the engine's name and the screen's label differ for 직업운 and 전체 흐름 only", () => {
    expect(SAJU_TOPICS.map((t) => [t.id, t.name, t.label])).toEqual([
      ["overall", "전체 흐름", "사주팔자"],
      ["love", "연애운", "연애운"],
      ["reunion", "재회운", "재회운"],
      ["money", "재물운", "재물운"],
      ["career", "직업운", "직장운"],
    ]);
    expect(SAJU_TOPIC_IDS).toEqual(["love", "reunion", "money", "career"]);
    expect([topicName("career"), topicLabel("career")]).toEqual(["직업운", "직장운"]);
    expect([topicName("overall"), topicLabel("overall")]).toEqual(["전체 흐름", "사주팔자"]);
    expect([isSajuTopic("overall"), isSajuTopic("health"), isSajuTopicId("overall"), isSajuTopicId("career")]).toEqual([true, false, false, true]);
  });

  it("keeps the owner's chip wording verbatim, one id each, every label short enough for one chip line", () => {
    expect(Object.fromEntries(SAJU_TOPIC_IDS.map((t) => [t, SITUATIONS[t].map((c) => `${c.id}:${c.label}`)]))).toEqual({
      love: ["long-single:혼자인 지 오래됐어요", "some:썸이 애매해요", "cooling:연애 중인데 마음이 식은 것 같아요", "marriage:결혼을 생각 중이에요"],
      reunion: ["missing:헤어진 사람이 자꾸 생각나요", "no-contact:연락이 끊겼어요", "torn:다시 만나도 될까 고민돼요", "fresh-breakup:이별 직후라 마음 정리가 안 돼요"],
      money: ["leaking:돈이 안 모이고 자꾸 새요", "worry:돈 걱정이 언제 풀릴지 궁금해요", "side-income:월급 말고 수입을 늘리고 싶어요"],
      career: ["job-hunt:취업이 잘 안 풀려요", "move:이직·퇴사를 고민 중이에요", "people:회사 사람 때문에 힘들어요", "exam:시험·자격증 준비 중이에요"],
    });
    const all = SAJU_TOPIC_IDS.flatMap((t) => SITUATIONS[t]);
    expect(new Set(all.map((c) => c.id)).size).toBe(15);
    expect(Math.max(...all.map((c) => c.label.length))).toBeLessThanOrEqual(19);
    expect(situationOf("money", "leaking")?.label).toBe("돈이 안 모이고 자꾸 새요");
    expect(situationOf("money", "some")).toBeUndefined();
    expect(otherTopicLabels("money")).toHaveLength(12);
    expect(otherTopicLabels("money")).not.toContain("돈이 안 모이고 자꾸 새요");
  });

  it("gives each topic six fixed headings (the common first and last) and an eight-item locked list that opens with 한눈에 보기", () => {
    for (const topic of SAJU_TOPIC_IDS) {
      expect(TOPIC_SECTIONS[topic]).toHaveLength(6);
      expect(TOPIC_SECTIONS[topic][0]).toBe("나의 기본 결 · 타고난 바탕");
      expect(TOPIC_SECTIONS[topic][5]).toBe("계산 기준 · 보지 않은 것과 달라질 수 있는 것");
      expect(topicLockedToc(topic)).toEqual([SAJU_GLANCE_HEADING, ...TOPIC_SECTIONS[topic], "앞으로 몇 주 · 확인해 볼 신호"]);
    }
    expect(TOPIC_SECTIONS.reunion[2]).toBe("다시 이어진다면 · 되풀이되기 쉬운 것");
    expect(TOPIC_SECTIONS.reunion[3]).toBe("지금의 10년 · 관계가 다시 움직이는 흐름");
    // plain words in every heading (owner 2026-10-07): no 재성·식상·비겁·인성·관성·월주·십성·일지 in a label or subtitle
    for (const heading of SAJU_TOPIC_IDS.flatMap((topic) => TOPIC_SECTIONS[topic])) {
      for (const term of ["재성", "식상", "비겁", "인성", "관성", "월주", "십성", "일지", "대운", "세운"]) expect(heading, heading).not.toContain(term);
    }
    expect(TOPIC_SECTIONS.money.slice(1, 3)).toEqual(["돈이 들어오는 길 · 다루는 힘과 만들어 내는 힘", "돈을 지키는 힘 · 어울려 나누는 힘과 받쳐 주는 힘"]);
    expect(TOPIC_SECTIONS.career.slice(1, 3)).toEqual(["일하는 방식 · 약속을 지키는 힘과 드러내는 힘", "잘 맞는 일의 결 · 태어난 달의 바탕과 자주 쓰는 힘"]);
    expect(TOPIC_SECTIONS.love[1]).toBe("사랑할 때의 나 · 가장 가까운 자리와 마음");
    expect(TOPIC_OBSERVATION_HEADING).toBe(SAJU_OBSERVATION_HEADING);
    expect(TOPIC_SECTION_LENGTH).toHaveLength(6);
    // reading-voice-2026-10 §5 (owner 2026-10-08): 2~5절 at 350~480자, as real readings already wrote them, and the total with them
    expect(TOPIC_SECTION_LENGTH).toEqual([[300, 400], [350, 480], [350, 480], [350, 480], [350, 480], [200, 400]]);
    expect(TOPIC_TOTAL_LENGTH).toEqual([1900, 2700]);
    expect(TOPIC_SWITCH_HELP).toBe(`새로 여는 맛보기는 하루 ${SITE.beta.teaserPerDay}번까지 볼 수 있어요. 이미 본 맛보기는 횟수를 쓰지 않아요.`);
  });

  it("says the chart page's fixed lines", () => {
    expect(OTHER_TOPICS_LABEL).toBe("다른 운도 볼 수 있어요");
    expect(BACK_TO_OVERALL).toBe("사주팔자로 돌아가기");
    expect(TEASER_LIMIT_NOTICE).toBe("오늘 맛보기를 모두 봤어요. 자정에 다시 열려요. 이미 본 맛보기는 계속 볼 수 있어요.");
    expect(UNLOCK_SCOPE_LINE).toBe("결제 한 번에 고른 풀이 하나를 열어요");
  });
});

describe("who sees the topics (spec §13)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("parses the flag: on in dev and tests, off in production, anything else falls back", async () => {
    expect(sajuTopicsMode("", false)).toBe("on");
    expect(sajuTopicsMode("", true)).toBe("off");
    expect(sajuTopicsMode(" Owner ", true)).toBe("owner");
    expect(sajuTopicsMode("yes", true)).toBe("off");
    expect(sajuTopicsMode("off", false)).toBe("off");
    // With no value passed it reads NEXT_PUBLIC_SAJU_TOPICS, and SITE reads it once when config.ts loads: set the env here
    // (and load config.ts again), so the answer does not depend on the shell that runs the tests.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "");
    expect(sajuTopicsMode()).toBe("on");
    vi.resetModules();
    expect((await import("./config")).SITE.features.sajuTopics).toBe("on");
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "owner");
    expect(sajuTopicsMode()).toBe("owner");
    vi.resetModules();
    expect((await import("./config")).SITE.features.sajuTopics).toBe("owner");
  });

  it("shows them on Korean screens when on, or in owner mode with the owner pass", () => {
    expect(sajuTopicsVisible({ mode: "on", owner: false })).toBe(true);
    expect(sajuTopicsVisible({ mode: "on", owner: false, locale: "en" })).toBe(false);
    expect(sajuTopicsVisible({ mode: "owner", owner: false })).toBe(false);
    expect(sajuTopicsVisible({ mode: "owner", owner: true })).toBe(true);
    expect(sajuTopicsVisible({ mode: "off", owner: true })).toBe(false);
  });
});
