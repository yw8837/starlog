// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLOW_KEY } from "@/lib/flowState";
import { forgetRoutes, noteRoute } from "@/lib/lastRoute";
import { assertVoice } from "@/lib/voice/banned";
import { QuestionBuilder } from "./QuestionBuilder";
import { SituationPicker } from "./situation/SituationPicker";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** 이어 읽기 on the builder and the situation step (spec 2026-11-26 beyond trend §3). */

const KEEP = { cardId: "major-17-star", orientation: "reversed" };
const stored = () => JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}");
const notice = () => screen.queryByRole("region", { name: "이어 읽기" });

/** The flow /now's 이어 읽기 wrote, opened from `from` at `path`. */
function arrive(flow: object, path: string, from: string | null) {
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ conditions: {}, note: "", ...flow, savedAt: Date.now() }));
  window.history.replaceState(null, "", path);
  forgetRoutes();
  if (from) noteRoute(from);
}

afterEach(() => {
  cleanup();
  forgetRoutes();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("the builder after 이어 읽기", () => {
  it("says the card from /now goes first, by name, as a fact; the worry fills 무엇 직접 쓰기 once 누구 is picked", () => {
    arrive({ keep: { ...KEEP, worry: "먼저 연락해도 될까?" } }, "/tarot/new", "/now");
    render(<QuestionBuilder />);
    const box = notice()!;
    expect(within(box).getByText("아까 뽑은 카드가 첫 자리에 놓여요")).toBeTruthy();
    expect(within(box).getByText("별 역방향")).toBeTruthy();
    expect(within(box).getByText("나머지 두 장만 더 뽑으면 돼요.")).toBeTruthy();
    for (const node of box.querySelectorAll("p, button")) assertVoice(node.textContent ?? "");
    // Above the screen's question.
    expect(box.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "나와 그 사람" }));
    expect((screen.getByLabelText("무엇을 볼지 직접 쓰기") as HTMLInputElement).value).toBe("먼저 연락해도 될까?");
    expect(stored()).toMatchObject({ who: "us", topicText: "먼저 연락해도 될까?", keep: KEEP });
    expect(stored().keep.worry).toBeUndefined();
    // Once: another 누구 keeps what is typed, a cleared field stays cleared.
    fireEvent.change(screen.getByLabelText("무엇을 볼지 직접 쓰기"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "나", exact: true } as never));
    expect((screen.getByLabelText("무엇을 볼지 직접 쓰기") as HTMLInputElement).value).toBe("");
  });

  it("leaves 직접 쓰기 empty when nothing was typed on /now", () => {
    arrive({ keep: KEEP }, "/tarot/new", "/now");
    render(<QuestionBuilder />);
    expect(notice()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "나", exact: true } as never));
    expect((screen.getByLabelText("무엇을 볼지 직접 쓰기") as HTMLInputElement).value).toBe("");
  });

  it("lets the card go with 새로 세 장 뽑기: today's flow, no line", () => {
    arrive({ keep: KEEP }, "/tarot/new", "/now");
    render(<QuestionBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "새로 세 장 뽑기" }));
    expect(notice()).toBeNull();
    expect(stored().keep).toBeUndefined();
  });

  it("starts clean as before when the builder is reached from anywhere else", () => {
    arrive({ keep: KEEP }, "/tarot/new", "/");
    render(<QuestionBuilder />);
    expect(notice()).toBeNull();
    expect(stored().keep).toBeUndefined();
  });
});

describe("the situation step after 이어 읽기", () => {
  it("says it at the top too, and 새로 세 장 뽑기 lets the card go", () => {
    arrive({ who: "me", topicId: "money", when: "week", keep: KEEP }, "/tarot/new/situation", "/tarot/new");
    render(<SituationPicker />);
    expect(within(notice()!).getByText("별 역방향")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새로 세 장 뽑기" }));
    expect(notice()).toBeNull();
    expect(stored()).toMatchObject({ who: "me", topicId: "money", when: "week" });
    expect(stored().keep).toBeUndefined();
  });
});
