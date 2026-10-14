import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser } from "@/lib/testing/p4";
import { POST as owner } from "./route";

const CODE = "owner-code-for-tests-0001";
const ALERT_AT = 20;

beforeEach(() => {
  vi.stubEnv("STARLOG_OWNER_CODE", CODE);
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const alerts = () => vi.mocked(console.warn).mock.calls.filter(([line]) => String(line).includes("auth.owner_code_alert"));

describe("owner code login", () => {
  it("takes the code only from our own pages", async () => {
    const b = browser("198.51.100.60");
    const bare = await b.send(owner, "/api/owner", { body: { code: CODE } });
    expect(bare.status).toBe(403);
    expect(await bare.json()).toMatchObject({ code: "FORBIDDEN" });
    const crossSite = await owner(new Request("http://localhost/api/owner", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", "cf-connecting-ip": "198.51.100.60" },
      body: JSON.stringify({ code: CODE }),
    }));
    expect(crossSite.status).toBe(403);
    expect(b.jar.has("sl_owner")).toBe(false);
    expect((await b.send(owner, "/api/owner", { body: { code: CODE }, origin: true })).status).toBe(200);
    expect(b.jar.has("sl_owner")).toBe(true);
  });

  it("logs one alert line, without values, once wrong codes from all networks reach the threshold, and never shuts the owner out", async () => {
    for (let i = 0; i < ALERT_AT + 5; i++) {
      expect((await browser(`198.51.100.${100 + i}`).send(owner, "/api/owner", { body: { code: `guess-${i}` }, origin: true })).status).toBe(400);
      expect(alerts()).toHaveLength(i + 1 >= ALERT_AT ? 1 : 0);
    }
    expect(alerts()).toEqual([[JSON.stringify({ evt: "auth.owner_code_alert" })]]);
    expect((await browser("198.51.100.200").send(owner, "/api/owner", { body: { code: CODE }, origin: true })).status).toBe(200);
  });
});
