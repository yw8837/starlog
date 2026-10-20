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
    "살고 싶지 않아요", "죽어버리고 싶다", "목숨을 끊고 싶어", "뛰어내리고 싶어요", "없어지고 싶어", "죽 고 싶 어", "자살",
    "죽고싶어", "죽고파", "살 기 싫 어", "삶을 끝내고 싶어", "인생을 끝내고 싶다", "생을 마감하고 싶어요", "인생을 마감하고 싶어", "자해", "극단적인 선택",
    "사라지고 싶은 밤", "thinking about suicide", "I want to kill myself",
    "목숨 끊고 싶어", "그만 살고 싶어", "세상을 떠나고 싶어", "살아갈 이유가 없어", "콱 죽어버릴까", "내 인생을 끝내고 싶어", "그냥 인생을 끝내고 싶다",
    "제 삶을 마감하고 싶어요", "힘들어서 더는 살고 싶지 않아요", "이 세상에 살고 싶지 않아", "세상에서 더 살고 싶지 않아", "내가 없어지고 싶어", "죽​고 싶어",
    "I feel suicidal",
  ])("hits %s", (text) => {
    expect(isCrisisText(text)).toBe(true);
    expect(crisisResponse("", text)?.status).toBe(422);
  });

  it.each([
    "연애를 끝내고 싶어요", "회사 그만두고 싶어", "여행 떠나고 싶어", "목숨 걸고 준비한 시험", "남자 살 빼는 법", "ㅈㅅ 늦었어", "이 관계 끝내고 싶어",
    "죽음 카드가 나왔어요", "이직하고 싶어요", "모집 학생을 마감했어요", "인생을 끝내주게 살고 싶어", "삶을 끝내주게 즐기는 법",
    // Fix review #1: ordinary love, job, money and moving questions.
    "솔로 인생을 끝내고 싶어요. 올해 연애운 있을까요?", "모태솔로 인생을 끝내고 싶어요", "백수 인생을 끝내고 싶어요 취업운 봐주세요",
    "월세 인생을 끝내고 내 집 마련하고 싶어요", "해외 삶을 끝내고 한국으로 돌아갈까요?", "30년 직장 인생을 마감하고 창업하려고요",
    "이 집에서 계속 살고 싶지 않아요. 이사운 있나요?", "시댁 근처에 살고 싶지 않은데 남편이 원해요", "그 사람이랑 같이 살고 싶지 않아요",
    "남편이 죽고 파산했어요 재물운이 궁금해요", "뱃살이 없어지고 싶어요", "Suicide Squad 영화 보고 싶어",
  ])("lets %s through", (text) => {
    expect(isCrisisText(text)).toBe(false);
    expect(crisisResponse(text)).toBeNull();
  });
});
