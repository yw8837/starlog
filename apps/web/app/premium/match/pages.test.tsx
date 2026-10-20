import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    await expect(MatchPreviewPage(query)).rejects.toThrow("404");
    expect(gate.asked).toEqual(["match", "match"]);
  });

  it("render otherwise, never indexed", async () => {
    gate.open = true;
    expect(await MatchNewPage()).toBeTruthy();
    expect(await MatchPreviewPage(query)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it("have no card step: the form goes straight to the preview (saju only, owner 2026-10-17)", () => {
    expect(existsSync(fileURLToPath(new URL("./draw/page.tsx", import.meta.url)))).toBe(false);
  });
});
