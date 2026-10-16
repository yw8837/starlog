import { afterEach, describe, expect, it, vi } from "vitest";
import MatchDrawPage from "./draw/page";
import MatchNewPage, { metadata } from "./new/page";
import MatchPreviewPage from "./preview/page";

const gate = vi.hoisted(() => ({ open: false, asked: [] as string[] }));
vi.mock("@/lib/premium/pageGate", () => ({
  premiumPageOpen: async (id: string) => {
    gate.asked.push(id);
    return gate.open;
  },
}));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const query = { searchParams: Promise.resolve({}) } as never;

afterEach(() => {
  notFound.mockClear();
  gate.asked = [];
});

describe("우리 사이 궁합's pages", () => {
  it("are 404 while premium is off here and nothing of it was bought", async () => {
    gate.open = false;
    await expect(MatchNewPage()).rejects.toThrow("404");
    await expect(MatchDrawPage(query)).rejects.toThrow("404");
    await expect(MatchPreviewPage(query)).rejects.toThrow("404");
    expect(gate.asked).toEqual(["match", "match", "match"]);
  });

  it("render otherwise, never indexed", async () => {
    gate.open = true;
    expect(await MatchNewPage()).toBeTruthy();
    expect(await MatchDrawPage(query)).toBeTruthy();
    expect(await MatchPreviewPage(query)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
