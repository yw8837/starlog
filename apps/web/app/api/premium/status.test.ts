import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./status/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GET /api/premium/status", () => {
  it("lists every premium product with its state and window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-25T12:00:00+09:00")); // after everything went on sale (owner 2026-10-20)
    vi.stubEnv("STARLOG_PREMIUM", "on");
    vi.stubEnv("STARLOG_PAYMENTS", "on");
    const res = await GET(new Request("http://localhost/api/premium/status"));
    // Kept by this browser for a minute (every page's footer asks it), never by a shared cache (review 2026-10-17 L4).
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    const { products } = (await res.json()) as { products: Array<{ id: string; open: boolean; opensAt: number | null }> };
    expect(products.map((p) => p.id)).toEqual(["tarot-deep", "match", "newyear-2027"]);
    // all open, no opening date (owner 2026-10-20); 2027 신년운세 says when it closes
    expect(products.map((p) => [p.open, p.opensAt])).toEqual([[true, null], [true, null], [true, null]]);
    expect((products[2] as { closesAt?: number }).closesAt).toBe(Date.parse("2027-12-01T00:00:00+09:00"));
  });

  it("answers closed and hidden when the flag is off", async () => {
    const { products } = (await (await GET(new Request("http://localhost/api/premium/status"))).json()) as { products: Array<{ open: boolean; visible: boolean }> };
    expect(products.every((p) => !p.open && !p.visible)).toBe(true);
  });

  it("shows a product before its window while the flag is on", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    vi.stubEnv("STARLOG_PAYMENTS", "on");
    const { products } = (await (await GET(new Request("http://localhost/api/premium/status"))).json()) as { products: Array<{ id: string; open: boolean; visible: boolean }> };
    expect(products.every((p) => p.visible)).toBe(true);
  });
});
