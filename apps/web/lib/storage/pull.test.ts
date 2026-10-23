// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearChapters, listChapters, removeServerChapters, saveChapter } from "./chapters";
import { clearMoveMarks, moveMarks, putOffMove } from "./move";
import { deleteAccountReadings, forgetAccountOnDevice, pullAccountReadings, useAccountSync } from "./sync";

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

  it("after a logout or the account's deletion, takes the account's readings off this device and keeps the ones opened here alone", async () => {
    const own = saveChapter({ kind: "tarot", question: "기기에서만 연 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t" }).chapter;
    saveChapter({ kind: "tarot", question: "계정 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    await pullAccountReadings(vi.fn(async () => Response.json({ readings: [remote(3)], next: null })) as unknown as typeof fetch);
    sessionStorage.setItem("starlog.account-synced", "1");
    putOffMove([own]);
    expect(listChapters()).toHaveLength(3);
    expect(forgetAccountOnDevice()).toBe(2);
    expect(listChapters().map((chapter) => chapter.id)).toEqual([own.id]);
    expect(sessionStorage.getItem("starlog.account-synced")).toBeNull();
    expect(removeServerChapters()).toBe(0);
    // Account sync: the next login offers to move this device's readings again.
    expect(moveMarks().later).toEqual([]);
    clearMoveMarks();
  });

  it("pulls on every visit of 내 기록 or 내 정보 while logged in, at most once a minute (account sync: another device's reading shows without a new tab)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.parse("2026-10-31T03:00:00Z"));
      const fetchImpl = vi.fn(async () => Response.json({ readings: [], next: null }));
      vi.stubGlobal("fetch", fetchImpl);
      const logged = { payments: true, login: true, owner: false, user: { nickname: "별" } } as never;
      const visit = () => renderHook(() => useAccountSync(logged)).unmount();
      visit();
      visit();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.parse("2026-10-31T03:01:01Z"));
      visit();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      renderHook(() => useAccountSync({ payments: true, login: true, owner: false, user: null } as never)).unmount();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
      sessionStorage.clear();
    }
  });

  it("deletes the account's copies and lets this device's chapters stand alone", async () => {
    saveChapter({ kind: "tarot", question: "q", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
    const fetchImpl = vi.fn(async () => Response.json({ deleted: 1 })) as unknown as typeof fetch;
    expect(await deleteAccountReadings(fetchImpl)).toBe(true);
    expect(listChapters()[0]?.serverId).toBeUndefined();
  });
});
