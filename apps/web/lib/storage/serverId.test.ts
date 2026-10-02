// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CHAPTERS_KEY, clearChapters, listChapters, parseChapter, saveChapter } from "./chapters";

afterEach(() => clearChapters());

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

describe("serverId on stored chapters", () => {
  it("keeps the account copy's id with the chapter", () => {
    const { chapter } = saveChapter({ kind: "tarot", question: "질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    expect(chapter.serverId).toBe("abcdefghij0123456789");
    expect(listChapters()[0]?.serverId).toBe("abcdefghij0123456789");
    expect(JSON.parse(localStorage.getItem(CHAPTERS_KEY)!).chapters[0].serverId).toBe("abcdefghij0123456789");
  });

  it("drops a malformed serverId instead of the whole chapter", () => {
    const parsed = parseChapter({ id: "abc123", createdAt: 1, chapterToken: "t", kind: "tarot", question: "q", cards: [card], reading, serverId: "../etc" });
    expect(parsed).not.toBeNull();
    expect(parsed?.serverId).toBeUndefined();
  });
});
