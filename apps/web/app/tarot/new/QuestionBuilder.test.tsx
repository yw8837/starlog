// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLOW_KEY } from "@/lib/flowState";
import { forgetFlowPages, leaveFlowPage } from "@/lib/useFlowVisit";
import { QuestionBuilder } from "./QuestionBuilder";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DRAW = {
  templateId: "self-flow",
  drawToken: "signed.token",
  cards: [{ position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" }],
};
const stored = () => JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}");

afterEach(() => {
  cleanup();
  forgetFlowPages();
  sessionStorage.clear();
});

/**
 * A flow as the builder saved it `ago` ms before now, reached from inside the flow (as if the
 * situation step was just left). With `fromFlow` false it is a refresh: the builder starts clean.
 */
const seed = (flow: object, ago = 0, fromFlow = true) => {
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ conditions: {}, note: "", ...flow, savedAt: Date.now() - ago }));
  window.history.replaceState(null, "", "/tarot/new");
  if (fromFlow) leaveFlowPage("tarot");
};
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const next = () => screen.getByRole("button", { name: /^다음/ }) as HTMLButtonElement;

afterEach(() => window.history.replaceState(null, "", "/"));

describe("QuestionBuilder", () => {
  it("keeps the dealt cards when the selected 누구 is tapped again, and drops them on a real change", () => {
    seed({ who: "me", topicId: "money", when: "week", draw: DRAW });
    render(<QuestionBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "나", exact: true } as never));
    expect(pressed("나")).toBe("true");
    expect(stored().draw).toEqual(DRAW);
    fireEvent.click(screen.getByRole("button", { name: "이번 달" }));
    expect(stored().draw).toBeUndefined();
    expect(stored().when).toBe("month");
  });

  it("takes a 무엇 or 언제 chip back on a second tap; 다음 waits until both are set again", () => {
    seed({ who: "me", topicId: "money", when: "week" });
    render(<QuestionBuilder />);
    expect(next().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "재물운" }));
    expect(pressed("재물운")).toBe("false");
    expect(stored().topicId).toBeUndefined();
    expect(screen.getByText("누구, 무엇, 언제를 고르면 질문이 완성돼요")).toBeTruthy();
    expect(next().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이번 주" }));
    expect(pressed("이번 주")).toBe("false");
    expect(stored().when).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "재물운" }));
    expect(next().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이번 주" }));
    expect(next().disabled).toBe(false);
    expect(screen.getByText("이번 주 내 재물 흐름은 어떨까?")).toBeTruthy();
  });

  it("lets typing replace the chip, and a chip clear the typing", () => {
    seed({ who: "me", topicId: "money", when: "week" });
    render(<QuestionBuilder />);
    fireEvent.change(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }), { target: { value: "창업 준비" } });
    expect(pressed("재물운")).toBe("false");
    expect(screen.getByText("이번 주 내 창업 준비는 어떻게 될까?")).toBeTruthy();
    // Clearing gives the field its focus back.
    fireEvent.click(screen.getByRole("button", { name: "무엇을 볼지 직접 쓰기 지우기" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }), { target: { value: "창업" } });
    fireEvent.click(screen.getByRole("button", { name: "재물운" }));
    expect((screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }) as HTMLInputElement).value).toBe("");
    expect(stored().topicId).toBe("money");
  });

  it("labels the 누구 detail 구체적으로 적기 (선택) with an example for the chosen chip; 나 has none", () => {
    seed({ who: "me" });
    render(<QuestionBuilder />);
    expect(screen.queryByRole("textbox", { name: "구체적으로 적기 (선택)" })).toBeNull();
    const examples: Array<[string, string]> = [
      ["나와 그 사람", "예: 엄마, 팀장님, 전 남친"],
      ["나의 일", "예: 우리 팀, 새 프로젝트, 첫 직장"],
      ["우리 모임", "예: 대학 동기, 독서 모임, 가족"],
    ];
    for (const [chip, example] of examples) {
      fireEvent.click(screen.getByRole("button", { name: chip }));
      const field = screen.getByRole("textbox", { name: "구체적으로 적기 (선택)" }) as HTMLInputElement;
      expect(field.placeholder, chip).toBe(example);
      // The label is on screen, not only read out.
      expect(screen.getByText("구체적으로 적기 (선택)").tagName).toBe("LABEL");
    }
  });

  it("takes a short 누구 (10 characters) and keeps a sentence typed there out of the question", () => {
    seed({ who: "us", topicId: "crush", when: "week" });
    render(<QuestionBuilder />);
    const field = screen.getByRole("textbox", { name: "구체적으로 적기 (선택)" }) as HTMLInputElement;
    expect(field.maxLength).toBe(10);
    fireEvent.change(field, { target: { value: "티끌을 얼마나 모아" } });
    expect(screen.getByText("이번 주 그 사람과 나 사이는 어떻게 될까?")).toBeTruthy();
    fireEvent.change(field, { target: { value: "엄마" } });
    expect(screen.getByText("이번 주 엄마와 나 사이는 어떻게 될까?")).toBeTruthy();
  });

  it("shows a 무엇 said rather than named under the question, never in it", () => {
    seed({ who: "group", whoText: "울산 AI 자동화방", topicText: "다같이 부자 되어봅시다~", when: "year" });
    render(<QuestionBuilder />);
    expect(screen.getByText("올해 울산 AI 자동화방, 어떻게 될까?")).toBeTruthy();
    expect(screen.getByText("“다같이 부자 되어봅시다”")).toBeTruthy();
  });

  it("starts clean when opened as a new question (?new=1) and drops the flag from the address", () => {
    seed({ who: "me", topicId: "money", when: "week", note: "메모", draw: DRAW });
    window.history.replaceState(null, "", "/tarot/new?new=1");
    render(<QuestionBuilder />);
    expect(pressed("나")).toBe("false");
    expect(pressed("이번 주")).toBe("false");
    expect(stored()).toMatchObject({ conditions: {}, note: "" });
    expect(stored().who).toBeUndefined();
    expect(stored().draw).toBeUndefined();
    expect(window.location.pathname + window.location.search).toBe("/tarot/new");
  });

  it("starts clean on a refresh or a visit from elsewhere (no in-flow mark)", () => {
    seed({ who: "me", topicId: "money", when: "week", note: "메모" }, 0, false);
    render(<QuestionBuilder />);
    expect(pressed("나")).toBe("false");
    expect(stored()).toMatchObject({ conditions: {}, note: "" });
    expect(stored().topicId).toBeUndefined();
  });

  it("keeps answers on an in-flow return, and forgets them once they are 30 minutes old", () => {
    seed({ who: "me", topicId: "money", when: "week" }, 29 * 60 * 1000);
    const first = render(<QuestionBuilder />);
    expect(pressed("재물운")).toBe("true");
    first.unmount();
    cleanup();
    seed({ who: "me", topicId: "money", when: "week" }, 31 * 60 * 1000);
    render(<QuestionBuilder />);
    expect(pressed("나")).toBe("false");
    expect(stored().topicId).toBeUndefined();
  });
});
