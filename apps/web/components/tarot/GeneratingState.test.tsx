// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETRY_CAPTION, checklist, progressPlan } from "@/lib/reading/progress";
import { GeneratingState } from "./GeneratingState";

const STAY = "이 화면을 열어 둔 채로 기다려 주세요.";
const plan = progressPlan("tarot-reading", { positions: ["지금의 나", "필요한 것", "이 시기의 흐름"] });
const SECOND_CARD = plan.stages.findIndex((stage) => stage.key === "cards" && stage.index === 1);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** The bar's length as drawn: the gold fill's scaleX. */
const bar = (container: HTMLElement) => Number(/scaleX\(([\d.]+)\)/.exec(container.querySelector<HTMLElement>('[style*="scaleX"]')!.style.transform)![1]);

describe("GeneratingState: the time under the bar", () => {
  it("counts from when the reading started, with the usual length, and keeps the line to leave the screen open", () => {
    render(<GeneratingState mode="saju" kind="saju-reading" caption="명식을 다시 살피고 있어요" fraction={0} live={false} />);
    expect(screen.getByText("보통 2분 안팎")).toBeTruthy();
    expect(screen.getByText(STAY)).toBeTruthy();
    tick(38_000);
    expect(screen.getByText("38초째 · 보통 2분 안팎")).toBeTruthy();
    tick(113_000);
    expect(screen.getByText("2분 31초째 · 조금 더 걸리고 있어요. 길게는 3분까지 걸려요")).toBeTruthy();
  });

  it("keeps counting through a quality retry (the same screen with a new caption)", () => {
    const { rerender } = render(<GeneratingState kind="tarot-reading" caption="세 장의 연결을 살피고 있어요" fraction={0.4} live={false} />);
    tick(40_000);
    rerender(<GeneratingState kind="tarot-reading" caption={RETRY_CAPTION} fraction={0.4} live={false} />);
    expect(screen.getByText("40초째 · 보통 1분 안팎")).toBeTruthy();
    tick(1_000);
    expect(screen.getByText("41초째 · 보통 1분 안팎")).toBeTruthy();
  });

  it("lets the bar creep with time while the stream is quiet: never backwards, never full before the end", () => {
    const props = { mode: "saju", kind: "saju-reading", caption: "명식을 다시 살피고 있어요", live: false } as const;
    const { container, rerender } = render(<GeneratingState {...props} fraction={0} />);
    expect(bar(container)).toBe(0.04);
    const seen: number[] = [];
    for (let i = 0; i < 24; i++) {
      tick(10_000);
      seen.push(bar(container));
    }
    expect(seen[0]).toBeGreaterThan(0.04);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(Math.max(...seen)).toBeLessThan(1);
    // A stream behind the clock does not pull the bar back; one ahead of it leads.
    const timed = bar(container);
    rerender(<GeneratingState {...props} fraction={0.1} />);
    expect(bar(container)).toBe(timed);
    rerender(<GeneratingState {...props} fraction={0.97} />);
    expect(bar(container)).toBe(0.97);
    rerender(<GeneratingState {...props} fraction={1} />);
    expect(bar(container)).toBe(1);
  });
});

describe("GeneratingState: the reading's steps", () => {
  it("ticks what is written, lights what is being written and dims the rest", () => {
    render(<GeneratingState kind="tarot-reading" caption="필요한 것 카드를 읽고 있어요" fraction={0.3} steps={checklist(plan, SECOND_CARD)} live={false} />);
    const list = screen.getByRole("list", { name: "풀이 순서" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual(["done", "now", "later", "later", "later", "later", "later"]);
    expect(within(items[0]!).getByText("지금의 나 카드")).toBeTruthy();
    // done: a drawn tick (hidden from screen readers), and the state in words for them
    expect(items[0]!.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(items[0]!.textContent).toContain("다 적었어요");
    expect(items[1]!.querySelector("svg")).toBeNull();
    expect(items[1]!.textContent).toContain("적고 있어요");
    expect(items[2]!.textContent).toBe("이 시기의 흐름 카드");
  });
});

describe("GeneratingState: 기다리는 동안", () => {
  it("shows one tip at a time and turns to the next every 8 seconds, round and round", () => {
    render(<GeneratingState kind="tarot-reading" caption="카드를 다시 읽고 있어요" fraction={0} tips={["하나", "둘", "셋"]} live={false} />);
    expect(screen.getByText("기다리는 동안")).toBeTruthy();
    expect(screen.getByText("하나")).toBeTruthy();
    expect(screen.queryByText("둘")).toBeNull();
    tick(7_000);
    expect(screen.getByText("하나")).toBeTruthy();
    tick(1_000);
    expect(screen.getByText("둘")).toBeTruthy();
    expect(screen.queryByText("하나")).toBeNull();
    tick(16_000);
    expect(screen.getByText("하나")).toBeTruthy();
  });
});

describe("GeneratingState: what screen readers hear", () => {
  it("keeps the caption the only live region: the clock, the steps and the tips stay quiet", () => {
    const props = { kind: "saju-reading", mode: "saju", caption: "타고난 바탕을 적고 있어요", fraction: 0.2, steps: checklist(plan, SECOND_CARD), tips: ["하나", "둘"] } as const;
    const { container, rerender } = render(<GeneratingState {...props} />);
    const live = container.querySelectorAll('[role="status"], [role="alert"], [role="log"], [role="timer"], [aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]!.textContent).toBe("타고난 바탕을 적고 있어요");
    expect(container.querySelector("section")!.getAttribute("aria-busy")).toBe("true");
    rerender(<GeneratingState {...props} live={false} />);
    expect(container.querySelectorAll('[role="status"], [role="alert"], [role="log"], [role="timer"], [aria-live]')).toHaveLength(0);
  });
});

describe("GeneratingState inline (a teaser on its way)", () => {
  it("shows the clock only: no steps, no tips, no line to keep the screen open", () => {
    render(<GeneratingState layout="inline" kind="tarot-teaser" caption="카드를 읽고 있어요" fraction={0} steps={checklist(plan, 0)} tips={["하나"]} live={false} />);
    expect(screen.getByText("보통 10초 안팎")).toBeTruthy();
    tick(16_000);
    expect(screen.getByText("16초째 · 조금 더 걸리고 있어요. 길게는 30초까지 걸려요")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("하나")).toBeNull();
    expect(screen.queryByText(STAY)).toBeNull();
  });
});
