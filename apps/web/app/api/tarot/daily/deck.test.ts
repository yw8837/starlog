import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { GET, POST } from "./route";

/** A device that keeps its cookies between calls, like a browser. */
function device() {
  const jar = new Map<string, string>();
  const keep = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
  };
  const headers = () => ({ "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
  const post = async (body: unknown) => {
    const response = await POST(new Request("http://localhost/api", { method: "POST", headers: headers(), body: JSON.stringify(body) }));
    keep(response);
    return { status: response.status, data: (await response.json()) as Record<string, unknown> };
  };
  const get = async () => {
    const response = await GET(new Request("http://localhost/api", { headers: headers() }));
    keep(response);
    return (await response.json()) as Record<string, unknown>;
  };
  return { post, get };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-30T03:00:00Z"));
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("오늘의 한 장 and its card design", () => {
  it("keeps the deck the fortune was written for, and hands it back with the stored fortune whatever deck asks later", async () => {
    const d = device();
    const first = await d.post({ pick: 1, deck: "rws1909" });
    expect(first.status).toBe(200);
    expect(first.data.deck).toBe("rws1909");
    // The reader switched to the Starlog deck later that day: the same fortune, still the 1909 picture it quotes.
    const again = await d.post({ pick: 1, deck: "starlog" });
    expect(again.data).toEqual(first.data);
    expect((await d.get()).deck).toBe("rws1909");
  });

  it("records the Starlog deck when the fortune was read with it", async () => {
    const d = device();
    expect((await d.post({ pick: 0, deck: "starlog" })).data.deck).toBe("starlog");
  });
});
