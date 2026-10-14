// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { clearChapters, deleteChapter, listChapters, saveChapter } from "@/lib/storage/chapters";
import { createShareLink, knownShareLink, stopShareLink } from "./client";

/** The share API as the browser sees it: POST hands back /s/<id>, DELETE stops it; `calls` records both. */
function stubShareApi(options: { failDelete?: boolean } = {}) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({ method, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    if (method === "DELETE") {
      if (options.failDelete) throw new TypeError("offline");
      return new Response(JSON.stringify({ deleted: true }), { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ id: "abcdefghijkl", path: "/s/abcdefghijkl" }), { headers: { "content-type": "application/json" } });
  });
  return calls;
}

const chapterInput = {
  kind: "tarot" as const,
  question: "q",
  conditions: [],
  note: "",
  cards: [{ position: "나의 마음", cardId: "major-09-hermit", orientation: "upright" as const }],
  reading: TAROT_SAMPLE.paid,
  chapterToken: "chapter.token",
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the share link a device remembers per reading", () => {
  it("is the one it made, until it is stopped", async () => {
    stubShareApi();
    const chapter = { id: "chapter01", chapterToken: "chapter.token", reading: { verdict: "v" } };
    expect(knownShareLink(chapter)).toBeNull();
    await createShareLink(chapter, "starlog");
    expect(knownShareLink(chapter)).toEqual({ url: `${location.origin}/s/abcdefghijkl`, imageUrl: `${location.origin}/api/og/share/abcdefghijkl` });
    expect(knownShareLink({ id: "chapter02" })).toBeNull();
    expect(await stopShareLink(chapter)).toBe(true);
    expect(knownShareLink(chapter)).toBeNull();
  });

  it("is stopped when its reading is deleted on the device, with the reading's own token", async () => {
    const calls = stubShareApi();
    const { chapter } = saveChapter(chapterInput);
    await createShareLink(chapter, "starlog");
    deleteChapter(chapter.id);
    expect(listChapters()).toEqual([]);
    await settle();
    expect(calls.at(-1)).toEqual({ method: "DELETE", body: { chapterToken: "chapter.token", reading: TAROT_SAMPLE.paid } });
    expect(knownShareLink(chapter)).toBeNull();
  });

  it("is stopped for every reading when all the device's records are cleared, with each reading's token", async () => {
    const calls = stubShareApi();
    const first = saveChapter({ ...chapterInput, chapterToken: "first.token" }).chapter;
    const second = saveChapter({ ...chapterInput, chapterToken: "second.token" }).chapter;
    saveChapter(chapterInput);
    await createShareLink(first, "starlog");
    await createShareLink(second, "starlog");
    clearChapters();
    expect(listChapters()).toEqual([]);
    await settle();
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.body.chapterToken)).toEqual(["first.token", "second.token"]);
    expect(knownShareLink(first)).toBeNull();
    expect(knownShareLink(second)).toBeNull();
  });

  it("never holds up the clear when offline", async () => {
    stubShareApi({ failDelete: true });
    const shared = saveChapter(chapterInput).chapter;
    await createShareLink(shared, "starlog");
    expect(() => clearChapters()).not.toThrow();
    expect(listChapters()).toEqual([]);
    await settle();
  });

  it("never holds up the delete: offline, or no link at all", async () => {
    const calls = stubShareApi({ failDelete: true });
    const shared = saveChapter(chapterInput).chapter;
    await createShareLink(shared, "starlog");
    const plain = saveChapter(chapterInput).chapter;
    expect(() => deleteChapter(shared.id)).not.toThrow();
    deleteChapter(plain.id);
    expect(listChapters()).toEqual([]);
    await settle();
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  });
});
