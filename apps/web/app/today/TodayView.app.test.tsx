// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetBridgeForTests } from "@/lib/app/bridge";
import type { DailyData } from "@/lib/reading/types";
import { TodayView } from "./TodayView";

/** 오늘의 한 장 in the Starlog app: the banner signal only while the reading is shown (W2.6), and 신고 under it (W2.5). */

const APP_UA = "Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const READING: DailyData = {
  card: { cardId: "major-17-star", orientation: "upright", keyword: "희망" },
  summary: "작은 빛 하나를 따라가 보는 하루",
  body: "별 카드는 밤하늘 아래 물을 붓는 사람을 그려요.",
  areas: { love: "먼저 안부를 건네 보세요", money: "작은 지출을 적어 봐요", work: "한 가지만 끝내 봐요" },
  lucky: { color: "하늘색", number: 7 },
  tip: "물 한 잔을 천천히 마셔 보세요",
  pick: 1,
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function adShell() {
  const shows: boolean[] = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { id: string; type: string; payload?: { show: boolean } };
      if (message.type === "ad") shows.push(message.payload!.show);
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id: message.id, ok: true }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return shows;
}

beforeEach(() => {
  resetBridgeForTests();
  vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
});
afterEach(() => {
  cleanup();
  resetAccountForTests();
  resetBridgeForTests();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  window.localStorage.clear();
});

describe("TodayView in the Starlog app", () => {
  it("turns the banner on while today's reading is shown, with 신고 under it", async () => {
    const shows = adShell();
    vi.stubGlobal("fetch", vi.fn(async () => respond(READING)));
    render(<TodayView />);
    expect(await screen.findByRole("heading", { level: 1, name: READING.summary })).toBeTruthy();
    await waitFor(() => expect(shows.at(-1)).toBe(true));
    expect(screen.getByRole("button", { name: "신고" })).toBeTruthy();
  });

  it("never turns it on while the login is asked for", async () => {
    const shows = adShell();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/me" ? respond({}) : respond({ code: "LOGIN_REQUIRED" }, 401))));
    render(<TodayView />);
    expect(await screen.findByText("카드를 섞고 있어요")).toBeTruthy();
    expect(shows).not.toContain(true);
    expect(screen.queryByRole("button", { name: "신고" })).toBeNull();
  });
});
