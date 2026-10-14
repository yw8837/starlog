import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { resetDailyStore } from "./dailyStore";
import { checkServerLimits, readJson, type Gate } from "./http";
import { NETWORK_BUDGET_SHARE, addNetworkCost, resetSpendState } from "./spend";

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
