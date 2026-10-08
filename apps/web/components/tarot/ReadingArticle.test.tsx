// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingArticle, type ReadingBody } from "./ReadingArticle";

/** The parts of a tarot reading that never show bold (review 2026-10-08): no "**" on screen, none in what the user copies to send. */

afterEach(() => {
  cleanup();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("ReadingArticle without bold marks where it shows none", () => {
  it("shows the verdict, branches, messages and the avoid list without marks, and copies a message as plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    const paid = {
      verdict: "**작게** 움직여 보는 편이 좋아요",
      cards: [],
      scenarios: { heading: "상황에 따라 달라지는 길", items: [{ label: "답이 **빨리** 오면", body: "**반갑게** 받되 길게 끌지 마세요." }] },
      messages: { heading: "보내기 좋은 첫 문장 2가지", items: ["**문득** 생각나서 연락했어", "요즘 어떻게 지내?"], hint: "**짧게** 보내 보세요." },
      avoid: { heading: "피하면 좋은 것", items: ["**연달아** 보내기"] },
    } as unknown as ReadingBody;
    render(<ReadingArticle paid={paid} />);
    expect(document.body.textContent).toContain("문득 생각나서 연락했어");
    expect(document.body.textContent).not.toContain("**");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "첫 문장 1 복사하기" }));
    });
    expect(writeText).toHaveBeenCalledWith("문득 생각나서 연락했어");
  });
});
