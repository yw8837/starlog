import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { kstDay } from "@/lib/security/quota";
import { dailyStore, resetDailyStore } from "./dailyStore";
import { checkServerLimits, crisisResponse, isCrisisText, readJson, type Gate } from "./http";
import { BUDGET_CEILING, NETWORK_BUDGET_SHARE, addCost, addNetworkCost, budgetState, resetSpendState } from "./spend";

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
  vi.useRealTimers();
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

const FREE_KINDS = ["full", "teaser", "followup", "daily"] as const;
const BUDGET = { code: "AI_UNAVAILABLE", reason: "budget", message: "오늘 준비한 풀이가 모두 나갔어요. 자정에 다시 열려요." };

describe("free-tier cost per network", () => {
  it("refuses free full readings from a network whose free-tier cost today reached 20% of the day's budget; its teasers, follow-ups and daily cards go on (one IP can be a whole office or carrier)", async () => {
    expect(NETWORK_BUDGET_SHARE).toBe(0.2);
    await addNetworkCost("net-a", 1_999, NOW);
    expect(await checkServerLimits(gate(), "full")).toBeNull();
    await addNetworkCost("net-a", 1, NOW);
    const refused = await checkServerLimits(gate(), "full");
    expect(refused?.status).toBe(429);
    expect(await refused!.json()).toMatchObject({ code: "BETA_LIMIT", scope: "network", message: NETWORK_MESSAGE });
    for (const kind of ["teaser", "followup", "daily"] as const) expect(await checkServerLimits(gate(), kind), kind).toBeNull();
    expect(await checkServerLimits(gate({ client: "net-b" }), "full")).toBeNull();
    expect(await checkServerLimits(gate({ now: NOW + DAY }), "full")).toBeNull();
  });

  it("never refuses the owner pass or an opening paid by a credit (the signup gift, a purchase)", async () => {
    await addNetworkCost("net-a", 5_000, NOW);
    expect(await checkServerLimits(gate({ owner: true }), "full")).toBeNull();
    expect(await checkServerLimits(gate(), "full", {}, { credit: true })).toBeNull();
  });

  it("takes the share from BETA_NETWORK_BUDGET_SHARE, read like the budget", async () => {
    await addNetworkCost("net-a", 2_000, NOW);
    vi.stubEnv("BETA_NETWORK_BUDGET_SHARE", "0.5");
    expect(await checkServerLimits(gate(), "full")).toBeNull();
    vi.stubEnv("BETA_NETWORK_BUDGET_SHARE", "not-a-number");
    expect((await checkServerLimits(gate(), "full"))?.status).toBe(429);
  });
});

describe("the day's budget (10,000: the cap trips at 8,000, the ceiling at 16,000)", () => {
  it("at the cap closes free full readings only (503 budget, the gift's included); teasers, follow-ups and the daily card go on", async () => {
    await addCost(7_999, NOW);
    expect(await checkServerLimits(gate(), "full")).toBeNull();
    await addCost(1, NOW);
    for (const options of [{}, { credit: true }]) {
      const closed = await checkServerLimits(gate(), "full", {}, options);
      expect(closed?.status).toBe(503);
      expect(await closed!.json()).toMatchObject(BUDGET);
    }
    for (const kind of ["teaser", "followup", "daily"] as const) expect(await checkServerLimits(gate(), kind), kind).toBeNull();
  });

  it("at the ceiling, twice the cap, closes every free generation, teasers included (it keeps the prepaid model credit for paid readings)", async () => {
    expect(BUDGET_CEILING).toBe(2);
    await addCost(15_999, NOW);
    expect(await checkServerLimits(gate(), "teaser")).toBeNull();
    await addCost(1, NOW);
    for (const kind of FREE_KINDS) {
      const closed = await checkServerLimits(gate(), kind);
      expect(closed?.status, kind).toBe(503);
      expect(await closed!.json()).toMatchObject(BUDGET);
    }
  });

  it("never closes a paid generation or the owner pass, past the ceiling too", async () => {
    await addCost(100_000, NOW);
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
    for (const kind of FREE_KINDS) expect(await checkServerLimits(gate({ owner: true }), kind), kind).toBeNull();
  });

  it("at 0 closes every free generation, still never a paid one or the owner pass", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    for (const kind of FREE_KINDS) expect((await checkServerLimits(gate(), kind))?.status, kind).toBe(503);
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
    expect(await checkServerLimits(gate({ owner: true }), "full")).toBeNull();
  });

  it("with no day cap (off) closes nothing at any total, and no network share applies, as before", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "off");
    await addCost(10_000_000, NOW);
    await addNetworkCost("net-a", 10_000_000, NOW);
    for (const kind of FREE_KINDS) expect(await checkServerLimits(gate(), kind), kind).toBeNull();
  });
});

describe("a day total that cannot be trusted", () => {
  it("that cannot be read at all closes every free generation (the network counts would read 0), never a paid one or the owner pass", async () => {
    for (const cap of ["10000", "off"]) {
      vi.stubEnv("BETA_DAILY_BUDGET_KRW", cap);
      const get = vi.spyOn(dailyStore(), "get").mockRejectedValue(new Error("KV GET failed"));
      expect(await budgetState(NOW), cap).toBe("unknown");
      for (const kind of FREE_KINDS) {
        const closed = await checkServerLimits(gate(), kind);
        expect(closed?.status, `${cap} ${kind}`).toBe(503);
        const body = await closed!.json();
        expect(body).toMatchObject({ code: "AI_UNAVAILABLE" });
        expect(body.reason).toBeUndefined();
      }
      expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true }), cap).toBeNull();
      for (const kind of FREE_KINDS) expect(await checkServerLimits(gate({ owner: true }), kind), `${cap} ${kind}`).toBeNull();
      get.mockRestore();
    }
  });

  it("whose cost writes keep failing while reads work closes every free generation (the total stopped growing); paid and the owner stay open", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const put = vi.spyOn(dailyStore(), "put").mockRejectedValue(new Error("KV PUT failed: 429 Too Many Requests"));
    for (let i = 0; i < 3; i++) await addCost(100, NOW);
    put.mockRestore();
    expect(await budgetState(NOW)).toBe("lagging");
    const closed = await checkServerLimits(gate(), "full");
    expect(closed?.status).toBe(503);
    expect((await closed!.json()).reason).toBeUndefined();
    for (const kind of ["teaser", "followup", "daily"] as const) expect((await checkServerLimits(gate(), kind))?.status, kind).toBe(503);
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
    expect(await checkServerLimits(gate({ owner: true }), "full")).toBeNull();
    // What could be read is past the ceiling: the total is only higher in truth.
    await dailyStore().put(`cost:${kstDay(NOW)}:0`, 16_000, 3_600);
    expect(await budgetState(NOW)).toBe("ceiling");
    expect(await (await checkServerLimits(gate(), "teaser"))!.json()).toMatchObject(BUDGET);
  });
});

describe("a paid generation and the free daily budget", () => {
  it("passes a day whose free budget is spent, and a total that cannot be read (paid never closes)", async () => {
    await addCost(9_000, NOW); // past 80% of 10,000
    expect((await checkServerLimits(gate(), "full", {}, { credit: true }))?.status).toBe(503);
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
    vi.spyOn(dailyStore(), "get").mockRejectedValue(new Error("KV GET failed"));
    expect(await checkServerLimits(gate(), "followup", {}, { credit: true, paid: true })).toBeNull();
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
    // Missed before (launch day, 2026-10-21): said alone, or after the person's own word or how hard things are.
    "다 끝내고 싶어", "그냥 다 끝내고 싶어", "이제 다 끝내고 싶어요", "너무 지쳤어. 다 끝내고 싶어", "다 끝내고 싶다는 생각만 들어",
    "죽을래", "그냥 죽을래", "나 죽을래", "차라리 죽을래요", "그냥 죽을까", "그냥 죽을까 싶어", "차라리 죽을까", "나 그냥 죽을까",
    "너무 힘들어서 살고 싶지 않아", "힘들어서 더는 살고 싶지 않아요", "너무 힘들어서 더 이상 살고 싶지 않아요", "괴로워서 살고 싶지 않아",
    "지쳐서 더는 살고 싶지 않아", "더는 살고 싶지 않아요", "정말 더 이상 살고 싶지 않아",
    // Review of 2026-10-21: the same phrases said a little differently.
    "그냥 죽을까요?", "차라리 죽을까요?", "너무 힘들어서 그냥 죽을까", "힘들어 그냥 죽을까", "요즘 그냥 죽을까 생각해",
    "힘들어서 더 살고 싶지 않아요", "살고 싶지가 않아요", "힘들어서 더 이상은 살고 싶지 않아", "나 그냥 죽을래요", "그냥 죽어버릴래",
    "나 그냥 다 끝내고 싶어", "다 끝내고 싶습니다", "너무 힘들어서 살고 싶지 않은 마음뿐이야", "너무 힘들어서 살고 싶지 않은데 어떻게 해야 할까요?", "지쳐서 더는 살고 싶지 않은데 버텨야 할까요", "너무 힘들어서 그냥 죽을까 싶어", "요즘 그냥 죽을까 싶어", "요즘 너무 지쳐\n다 끝내고 싶어", "힘들어… 살고 싶지 않아",
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

  // Before the pattern grew (다 끝내고 싶, 죽을래, 그냥 죽을까, 힘들어서 살고 싶지 않): everyday questions
  // that use the same words, which must keep their reading.
  it.each([
    // 죽다 as an everyday word: hyperbole, pets and plants, health worries, grief.
    "더워 죽을래 ㅠㅠ 여름휴가 언제 갈까요", "귀여워 죽을래 우리 고양이랑 궁합 봐주세요", "배고파 죽을래 오늘 뭐 먹을까요",
    "힘들어 죽을래 시험 언제 끝나요?", "친구가 너 죽을래? 하고 장난쳐요", "아 진짜 졸려 죽을래요", "보고 싶어 죽을래 그 사람도 내 생각할까요?",
    "강아지가 그냥 죽을까 봐 걱정돼요", "화분이 이러다 죽을까요?", "키우던 물고기가 죽을까 봐 무서워요",
    "우리 강아지가 아픈데 그냥 죽을까요? 병원에 가야 할까요", "강아지가 많이 아파요. 그냥 죽을까요?", "화분이 시들었어요. 그냥 죽을까요?", "그냥 죽을까 봐 무서워요. 건강운 봐주세요", "할머니가 돌아가실까 봐 걱정돼요",
    "죽을 만큼 사랑했던 사람이 다시 연락할까요?", "죽을 때까지 함께할 사람 만날 수 있을까요", "죽을힘을 다해 준비한 시험 결과가 궁금해요",
    "죽도록 일만 했는데 승진할까요", "죽이 잘 맞는 친구를 만날까요", "엄마가 하늘나라에 가셨어요. 잘 지내실까요?",
    "강아지가 무지개다리를 건넜어요. 다시 만날 수 있을까요?", "반려묘가 떠난 뒤로 너무 힘들어요", "아버지 돌아가신 지 1년인데 마음이 너무 힘들어요",
    // 끝내다 about work, study, money and relationships.
    "오늘 안에 일 다 끝내고 싶어요", "이번 달 안에 이사 준비 다 끝내고 싶어요", "연말까지 대출 상환을 다 끝내고 싶어요",
    "숙제 다 끝내고 싶은데 집중이 안 돼요", "이 관계 이제 다 끝내고 싶어요. 그 사람 마음은요?", "빨리 다 끝내고 싶어요. 이직운 봐주세요",
    "그 사람과 다 끝내고 싶어요", "프로젝트를 다 끝내고 싶은데 언제 끝날까요?", "논문을 올해 다 끝내고 싶어요", "결혼 준비를 다 끝내고 싶어요",
    "육아휴직 전에 일을 다 끝내고 싶어요", "일이 많은데, 그냥 오늘 다 끝내고 싶어요", "남편과 끝내고 싶은데 아이가 걱정돼요",
    "지금 회사 생활을 끝내고 싶어요. 이직할까요?", "끝내주는 하루 보내고 싶어요", "시험 끝내고 여행 가고 싶어요",
    // 힘들다 and 살고 싶지 않 about a place, a marriage or family, a job.
    "시댁이 너무 힘들어서 같이 살고 싶지 않아요", "이 집이 너무 힘들어서 여기서 살고 싶지 않아요. 이사운 있나요?",
    "서울살이가 힘들어서 서울에서 살고 싶지 않아요", "회사가 너무 힘들어서 그만두고 싶어요", "육아가 너무 힘들어서 쉬고 싶어요",
    "요즘 일이 너무 힘들어요. 이직할까요?", "힘들어서 다 그만두고 싶어요 이직운 봐주세요", "남편과 성격이 안 맞아서 더는 같이 살고 싶지 않아요",
    "시어머니와 더 이상 함께 살고 싶지 않아요", "월세가 힘들어서 더는 이 집에 살고 싶지 않아요", "기숙사 생활에 지쳐서 혼자 살고 싶어요",
    "외로워서 혼자 살고 싶지 않아요", "재혼해서 행복하게 살고 싶어요", "부모님과 더는 같이 살고 싶지 않아요. 독립운 있을까요?",
    "이혼하고 새 출발하고 싶어요", "사업을 접고 싶어요", "인생 2막을 시작하고 싶어요", "내 인생 이대로 괜찮을까요",
    "그냥 이대로 살고 싶어요", "더는 미루고 싶지 않아요. 고백할까요?", "이제 그만 싸우고 싶어요", "다 내려놓고 쉬고 싶어요. 휴직해도 될까요?",
    // Review of 2026-10-21: a breakup, divorce or job question that opens with 다 끝내고 싶, a place one cannot bear, jokes.
    "다 끝내고 싶은데 재회운이 있을까요?", "정말 다 끝내고 싶은데 이혼하면 후회할까요?", "이제 다 끝내고 싶은데 그 사람이 붙잡을까요?",
    "난 다 끝내고 싶은데 그 사람 마음은요?", "다 끝내고 싶은 마음에 이혼 고민해요", "다 끝내고 싶어서 퇴사 고민 중", "그냥 다 끝내고 싶어요 그 사람이랑",
    "너무 힘들어서 살고 싶지 않은 집이에요", "지쳐서 더는 살고 싶지 않은 동네예요. 이사운 있나요?", "나 죽을래 ㅋㅋ 너무 웃겨", "죽을래 살래 고민 중인 메뉴",
    "이 집에서 더 살고 싶지 않아요. 이사운 봐주세요", "남편과 같이 살고 싶지가 않아요",
    // Second review: any noun after 살고 싶지 않은 but a feeling; 요즘·힘들어 그냥 죽을까 about a pet or a plant.
    "힘들어서 살고 싶지 않은 시골이에요. 이사운 있나요?", "지쳐서 더는 살고 싶지 않은 서울, 떠나도 될까요?", "힘들어서 살고 싶지 않은 기숙사예요",
    "괴로워서 살고 싶지 않은 회사 사택이에요", "화분이 요즘 그냥 죽을까 걱정이에요", "강아지가 요즘 그냥 죽을까 싶을 정도로 기운이 없어요",
    "물고기 키우기 힘들어 그냥 죽을까 걱정", "고양이가 힘들어서 그냥 죽을까 걱정돼요",
  ])("lets the everyday question %s through", (text) => {
    expect(isCrisisText(text)).toBe(false);
    expect(crisisResponse(text)).toBeNull();
  });
});
