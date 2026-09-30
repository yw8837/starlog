// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLOW_KEY } from "@/lib/flowState";
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
  sessionStorage.clear();
});

describe("QuestionBuilder", () => {
  it("keeps the dealt cards when the chip already chosen is tapped again, and drops them on a real change", () => {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ who: "me", topicId: "money", when: "week", conditions: {}, note: "", draw: DRAW }));
    render(<QuestionBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "나", exact: true } as never));
    fireEvent.click(screen.getByRole("button", { name: "재물운" }));
    fireEvent.click(screen.getByRole("button", { name: "이번 주" }));
    expect(stored().draw).toEqual(DRAW);
    fireEvent.click(screen.getByRole("button", { name: "이번 달" }));
    expect(stored().draw).toBeUndefined();
    expect(stored().when).toBe("month");
  });

  it("lets typing replace the chip, and a chip clear the typing", () => {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ who: "me", topicId: "money", when: "week", conditions: {}, note: "" }));
    render(<QuestionBuilder />);
    fireEvent.change(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }), { target: { value: "창업 준비" } });
    expect(screen.getByRole("button", { name: "재물운" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("이번 주, 나의 창업 준비는 어떻게 될까")).toBeTruthy();
    // Clearing gives the field its focus back.
    fireEvent.click(screen.getByRole("button", { name: "무엇을 볼지 직접 쓰기 지우기" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }), { target: { value: "창업" } });
    fireEvent.click(screen.getByRole("button", { name: "재물운" }));
    expect((screen.getByRole("textbox", { name: "무엇을 볼지 직접 쓰기" }) as HTMLInputElement).value).toBe("");
    expect(stored().topicId).toBe("money");
  });
});
