import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { dailyStore, resetDailyStore } from "./dailyStore";
import { checkServerLimits, crisisResponse, isCrisisText, readJson, type Gate } from "./http";
import { NETWORK_BUDGET_SHARE, addCost, addNetworkCost, resetSpendState } from "./spend";

const NOW = Date.parse("2026-10-14T03:00:00Z"); // 12:00 KST
const DAY = 24 * 60 * 60 * 1000;
const NETWORK_MESSAGE = "지금 쓰는 인터넷(와이파이·통신사)에서 오늘 열 수 있는 풀이를 모두 썼어요. 자정에 다시 열려요.";

const gate = (over: Partial<Gate> = {}): Gate => ({ secret: "s".repeat(40), provider: mockProvider, owner: false, now: NOW, cookies: {}, client: "net-a", ...over });

beforeEach(() => {
  resetDailyStore();
  resetSpendState();
  vi.stubEnv("BETA_DAILY_BUDGET_KRW", "10000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("readJson", () => {
  it("refuses a body-less POST that is not declared JSON", async () => {
    expect(await readJson(new Request("http://localhost/api", { method: "POST" }), 1_000)).toBeNull();
    expect(await readJson(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "text/plain" } }), 1_000)).toBeNull();
  });

  it("reads an empty JSON body as {}", async () => {
    expect(await readJson(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" } }), 1_000)).toEqual({});
    expect(await readJson(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: " " }), 1_000)).toEqual({});
  });
});

describe("free-tier cost per network", () => {
  it("refuses new free-tier generations from a network whose cost today reached 20% of the day's budget, like the network count does", async () => {
    expect(NETWORK_BUDGET_SHARE).toBe(0.2);
    await addNetworkCost("net-a", 1_999, NOW);
    expect(await checkServerLimits(gate(), "teaser")).toBeNull();
    await addNetworkCost("net-a", 1, NOW);
    for (const kind of ["full", "teaser", "followup", "daily"] as const) {
      const refused = await checkServerLimits(gate(), kind);
      expect(refused?.status, kind).toBe(429);
      expect(await refused!.json()).toMatchObject({ code: "BETA_LIMIT", scope: "network", message: NETWORK_MESSAGE });
    }
    expect(await checkServerLimits(gate({ client: "net-b" }), "teaser")).toBeNull();
    expect(await checkServerLimits(gate({ now: NOW + DAY }), "teaser")).toBeNull();
  });

  it("never refuses the owner pass or an opening paid by a credit (the signup gift, a purchase)", async () => {
    await addNetworkCost("net-a", 5_000, NOW);
    expect(await checkServerLimits(gate({ owner: true }), "teaser")).toBeNull();
    expect(await checkServerLimits(gate(), "full", {}, { credit: true })).toBeNull();
  });

  it("takes the share from BETA_NETWORK_BUDGET_SHARE, read like the budget", async () => {
    await addNetworkCost("net-a", 2_000, NOW);
    vi.stubEnv("BETA_NETWORK_BUDGET_SHARE", "0.5");
    expect(await checkServerLimits(gate(), "teaser")).toBeNull();
    vi.stubEnv("BETA_NETWORK_BUDGET_SHARE", "not-a-number");
    expect((await checkServerLimits(gate(), "teaser"))?.status).toBe(429);
  });
});

describe("a paid generation and the free daily budget", () => {
  it("passes a day whose free budget is spent, but not a total that cannot be read", async () => {
    await addCost(9_000, NOW); // past 80% of 10,000
    expect((await checkServerLimits(gate(), "followup", {}, { credit: true }))?.status).toBe(503);
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
    vi.spyOn(dailyStore(), "get").mockRejectedValue(new Error("KV GET failed"));
    const unknown = await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true });
    expect(unknown?.status).toBe(503);
    expect(await unknown!.json()).toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});

describe("crisis words (one pattern for every server check)", () => {
  it.each([
    // Phrases that mean one thing anywhere.
    "죽고싶어", "죽 고 싶 어", "죽어버리고 싶다", "자살", "자해", "극단적인 선택", "살 기 싫 어", "사라지고 싶은 밤",
    "목숨을 끊고 싶어", "목숨 끊고 싶어", "세상을 떠나고 싶어", "살아갈 이유가 없어", "콱 죽어버릴까", "차라리 죽어버릴까",
    "thinking about suicide", "I feel suicidal", "I want to kill myself",
    // Phrases that are also ordinary questions: at the start of a sentence or after the person's own word.
    "살고 싶지 않아요", "살고 싶지 않아. 너무 지쳤어", "요즘 살고 싶지 않아요", "이제 살고 싶지 않아", "정말 살고 싶지 않아", "그냥 살고 싶지 않아",
    "이 세상에 살고 싶지 않아", "세상에서 더 살고 싶지 않아", "그만 살고 싶어", "이제 그만 살고 싶어", "없어지고 싶어", "내가 없어지고 싶어",
    "삶을 끝내고 싶어", "인생을 끝내고 싶다", "내 인생을 끝내고 싶어", "그냥 인생을 끝내고 싶다", "이 인생을 끝내고 싶어",
    "생을 마감하고 싶어요", "인생을 마감하고 싶어", "제 삶을 마감하고 싶어요", "삶을 포기하고 싶어", "그냥 인생을 포기하고 싶어요",
    // Invisible characters cannot split a phrase.
    "죽\u200B고 싶어", "죽\u2060고 싶어", "죽\u00AD고 싶어",
  ])("hits %s", (text) => {
    expect(isCrisisText(text)).toBe(true);
    expect(crisisResponse("", text)?.status).toBe(422);
  });

  it.each([
    "연애를 끝내고 싶어요", "회사 그만두고 싶어", "여행 떠나고 싶어", "목숨 걸고 준비한 시험", "남자 살 빼는 법", "ㅈㅅ 늦었어", "이 관계 끝내고 싶어",
    "죽음 카드가 나왔어요", "이직하고 싶어요", "모집 학생을 마감했어요", "인생을 끝내주게 살고 싶어", "삶을 끝내주게 즐기는 법",
    // Fix reviews 1 and 2: ordinary love, marriage, divorce, job, money, moving, pet and grief questions.
    "솔로 인생을 끝내고 싶어요. 올해 연애운 있을까요?", "모태솔로 인생을 끝내고 싶어요", "백수 인생을 끝내고 싶어요 취업운 봐주세요",
    "월세 인생을 끝내고 내 집 마련하고 싶어요", "해외 삶을 끝내고 한국으로 돌아갈까요?", "30년 직장 인생을 마감하고 창업하려고요",
    "이 집에서 계속 살고 싶지 않아요. 이사운 있나요?", "시댁 근처에 살고 싶지 않은데 남편이 원해요", "그 사람이랑 같이 살고 싶지 않아요",
    "남편이 죽고 파산했어요 재물운이 궁금해요", "뱃살이 없어지고 싶어요", "빚이 없어지고 싶어요", "Suicide Squad 영화 보고 싶어",
    "평생 혼자 살고 싶지 않아요. 결혼운 있을까요?", "혼자 살고 싶지 않아요", "남편과 더 이상 살고 싶지 않아요. 이혼해야 할까요?",
    "이 남자와 평생 살고 싶지 않아요", "이렇게 살고 싶지 않아요. 이직할까요?", "매일 야근하며 이렇게 살고 싶지 않아요",
    "평범하게 살고 싶지 않아요", "남들처럼 살고 싶지 않아요", "부모님 뜻대로 살고 싶지 않아요", "가난하게 살고 싶지 않아요",
    "시골에서 살고 싶지 않아요", "서울에서 더 이상 살고 싶지 않아요", "월세 그만 살고 싶어요", "고시원 그만 살고 싶어요",
    "강아지가 죽어버릴까 봐 걱정돼요", "화분이 죽어버릴까 걱정이에요", "할머니가 생을 마감하셨어요", "아버지가 생을 마감하신 지 1년이 됐어요",
    "생을 마감하기 전에 꼭 해보고 싶은 일", "인생을 마감하는 날까지 행복하고 싶어요", "번지점프 뛰어내리고 싶어요", "남편이랑 더는 살고 싶지 않아요",
    "꿈을 포기하고 싶어요", "솔로 인생을 포기하고 싶어요", "배고파 죽겠어", "시어머니랑 같이 살고 싶지 않아요", "이 관계를 마감하고 싶어요",
  ])("lets %s through", (text) => {
    expect(isCrisisText(text)).toBe(false);
    expect(crisisResponse(text)).toBeNull();
  });
});
