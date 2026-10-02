import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./status/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/premium/status", () => {
  it("lists every premium product with its state and window", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    vi.stubEnv("STARLOG_PAYMENTS", "on");
    const res = await GET(new Request("http://localhost/api/premium/status"));
    expect(res.headers.get("cache-control")).toContain("no-store");
    const { products } = (await res.json()) as { products: Array<{ id: string; open: boolean; opensAt: number | null }> };
    expect(products.map((p) => p.id)).toEqual(["tarot-deep", "match", "newyear-2027"]);
    expect(products[0]).toMatchObject({ open: true, opensAt: null });
    expect(products[2]!.opensAt).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
  });

  it("answers closed when the flag is off", async () => {
    const { products } = (await (await GET(new Request("http://localhost/api/premium/status"))).json()) as { products: Array<{ open: boolean }> };
    expect(products.every((p) => !p.open)).toBe(true);
  });
});
