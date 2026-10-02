// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, saveChapter } from "./chapters";
import { deleteAccountReadings, pullAccountReadings } from "./sync";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };
const remote = (n: number) => ({
  id: `${String(n).padStart(2, "0")}cdefghij0123456789`.slice(0, 20),
  createdAt: n,
  chapter: { kind: "tarot", question: `질문 ${n}`, conditions: [], note: "", cards: [card], reading, chapterToken: `t${n}`, createdAt: n, turns: [], followUpsLeft: 3 },
});

describe("pulling the account's readings", () => {
  it("follows every page", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      return url.includes("before=")
        ? Response.json({ readings: [remote(1)], next: null })
        : Response.json({ readings: [remote(3), remote(2)], next: "2.02cdefghij01234567" });
    }) as unknown as typeof fetch;
    expect(await pullAccountReadings(fetchImpl)).toBe(3);
    expect(urls).toEqual(["/api/readings", "/api/readings?before=2.02cdefghij01234567"]);
    expect(listChapters()).toHaveLength(3);
  });

  it("deletes the account's copies and lets this device's chapters stand alone", async () => {
    saveChapter({ kind: "tarot", question: "q", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    const fetchImpl = vi.fn(async () => Response.json({ deleted: 1 })) as unknown as typeof fetch;
    expect(await deleteAccountReadings(fetchImpl)).toBe(true);
    expect(listChapters()[0]?.serverId).toBeUndefined();
  });
});
