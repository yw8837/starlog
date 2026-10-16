// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("보통 1분 안팎")).toBeTruthy();
    expect(screen.getByText(STAY)).toBeTruthy();
    tick(38_000);
    expect(screen.getByText("38초째 · 보통 1분 안팎")).toBeTruthy();
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

const TIPS = [
  { label: "타로 상식", text: "하나" },
  { label: "타로 상식", text: "둘" },
] as const;
const carousel = () => screen.getByRole("region", { name: "기다리는 동안 읽을거리" });
/** The card on show (the cards beside it, ready to slide in, are hidden from screen readers). */
const shown = () => within(carousel()).getByRole("group");
/** The strip the cards slide in: drag it sideways to turn them. */
const strip = () => shown().parentElement!.parentElement!;
const drag = (from: number, to: number) => {
  fireEvent.pointerDown(strip(), { pointerId: 1, clientX: from });
  fireEvent.pointerMove(strip(), { pointerId: 1, clientX: to });
  fireEvent.pointerUp(strip(), { pointerId: 1, clientX: to });
};
const page = (props: Partial<Parameters<typeof GeneratingState>[0]> = {}) => (
  <GeneratingState kind="tarot-reading" caption="필요한 것 카드를 읽고 있어요" fraction={0.3} steps={checklist(plan, SECOND_CARD)} tips={TIPS} live={false} {...props} />
);

describe("GeneratingState: the cards while a full reading is written (a game-loader carousel)", () => {
  it("shows one card at a time, first the part being written with how far along it is", () => {
    render(page());
    expect(carousel().getAttribute("aria-roledescription")).toBe("carousel");
    const card = shown();
    expect(card.getAttribute("aria-roledescription")).toBe("slide");
    expect(within(card).getByText("지금 적는 중")).toBeTruthy();
    expect(within(card).getByText("필요한 것 카드")).toBeTruthy();
    expect(within(card).getByText("2 / 7")).toBeTruthy();
    // no list of the steps any more
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("keeps the first card on the part the stream is writing now", () => {
    const { rerender } = render(page());
    rerender(page({ steps: checklist(plan, plan.stages.findIndex((stage) => stage.key === "scenarios")) }));
    expect(within(shown()).getByText("흘러갈 갈래")).toBeTruthy();
    expect(within(shown()).getByText("5 / 7")).toBeTruthy();
  });

  it("turns to the next card every 7 seconds, sliding for 0.4 s, round and round", () => {
    render(page());
    tick(6_900);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    tick(500);
    expect(within(shown()).getByText("하나")).toBeTruthy();
    expect(within(shown()).getByText("타로 상식")).toBeTruthy();
    tick(7_400);
    expect(within(shown()).getByText("둘")).toBeTruthy();
    tick(7_400);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
  });

  it("has a dot per card under it: buttons named by place, the current one marked; a dot goes to its card", () => {
    render(page());
    const dots = within(carousel()).getAllByRole("button");
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual(["1번째 카드", "2번째 카드", "3번째 카드"]);
    expect(dots.map((dot) => dot.getAttribute("aria-current"))).toEqual(["true", null, null]);
    fireEvent.click(dots[2]!);
    tick(400);
    expect(within(shown()).getByText("둘")).toBeTruthy();
    expect(within(carousel()).getAllByRole("button").map((dot) => dot.getAttribute("aria-current"))).toEqual([null, null, "true"]);
  });

  it("turns by a swipe: left for the next, right for the previous (round the end), a short drag stays", () => {
    render(page());
    drag(200, 100);
    tick(400);
    expect(within(shown()).getByText("하나")).toBeTruthy();
    drag(100, 130);
    tick(400);
    expect(within(shown()).getByText("하나")).toBeTruthy();
    drag(100, 220);
    tick(400);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    drag(100, 220);
    tick(400);
    expect(within(shown()).getByText("둘")).toBeTruthy();
  });

  it("never turns on a cancelled touch (the page took it to scroll), even when the cancel reports (0, 0) (M-02)", () => {
    render(page());
    fireEvent.pointerDown(strip(), { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(strip(), { pointerId: 1, clientX: 196, clientY: 260 });
    fireEvent.pointerCancel(strip(), { pointerId: 1, clientX: 0, clientY: 0 });
    tick(400);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    // the drag is over: the cards turn on their own again
    tick(7_000);
    expect(within(shown()).getByText("하나")).toBeTruthy();
  });

  it("does not turn on a drag that goes more up or down than sideways (M-02)", () => {
    render(page());
    fireEvent.pointerDown(strip(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(strip(), { pointerId: 1, clientX: 140, clientY: 300 });
    fireEvent.pointerUp(strip(), { pointerId: 1, clientX: 140, clientY: 300 });
    tick(400);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
  });

  it("leaves up and down to the page on the card (touch-action: pan-y)", () => {
    const file = ["apps/web/components/tarot/GeneratingState.module.css", "components/tarot/GeneratingState.module.css"]
      .map((path) => resolve(process.cwd(), path))
      .find((path) => existsSync(path));
    expect(readFileSync(file ?? "", "utf8")).toMatch(/\.viewport \{[^}]*touch-action: pan-y;/);
  });

  it("holds still while a finger or the pointer is on it", () => {
    render(page());
    fireEvent.pointerEnter(carousel());
    tick(30_000);
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    fireEvent.pointerLeave(carousel());
    tick(7_400);
    expect(within(shown()).getByText("하나")).toBeTruthy();
  });

  it("deals the tips alone when there are no steps", () => {
    render(page({ steps: undefined }));
    expect(within(shown()).getByText("하나")).toBeTruthy();
    expect(within(carousel()).getAllByRole("button")).toHaveLength(2);
  });
});

describe("GeneratingState: what screen readers hear", () => {
  it("keeps the caption the only live region: the clock and the cards stay quiet", () => {
    const props = { kind: "saju-reading", mode: "saju", caption: "타고난 바탕을 적고 있어요", fraction: 0.2, steps: checklist(plan, SECOND_CARD), tips: TIPS } as const;
    const { container, rerender } = render(<GeneratingState {...props} />);
    const speaking = '[role="status"], [role="alert"], [role="log"], [role="timer"], [aria-live]:not([aria-live="off"])';
    const live = container.querySelectorAll(speaking);
    expect(live).toHaveLength(1);
    expect(live[0]!.textContent).toBe("타고난 바탕을 적고 있어요");
    expect(container.querySelector('[aria-live="off"]')).not.toBeNull();
    expect(container.querySelector("section")!.getAttribute("aria-busy")).toBe("true");
    tick(7_400);
    expect(container.querySelectorAll(speaking)).toHaveLength(1);
    rerender(<GeneratingState {...props} live={false} />);
    expect(container.querySelectorAll(speaking)).toHaveLength(0);
  });
});

describe("GeneratingState inline (a teaser on its way)", () => {
  it("shows the clock only: no cards, no line to keep the screen open", () => {
    render(<GeneratingState layout="inline" kind="tarot-teaser" caption="카드를 읽고 있어요" fraction={0} steps={checklist(plan, 0)} tips={TIPS} live={false} />);
    expect(screen.getByText("보통 10초 안팎")).toBeTruthy();
    tick(16_000);
    expect(screen.getByText("16초째 · 조금 더 걸리고 있어요. 길게는 30초까지 걸려요")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "기다리는 동안 읽을거리" })).toBeNull();
    expect(screen.queryByText("하나")).toBeNull();
    expect(screen.queryByText(STAY)).toBeNull();
  });
});
