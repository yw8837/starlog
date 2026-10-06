// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HOME_FAQ_IDS, HomeFaq, homeFaqEntries } from "./HomeEntries";

afterEach(cleanup);

/** What the home's FAQ block opens with: how a reading is made, where the birth date goes, the price, the chatbot comparison. */
const HOME_QUESTIONS = [
  "풀이는 어떻게 만들어지나요?",
  "내 생년월일은 어디에 저장되나요?",
  "스타로그는 무료인가요?",
  "AI 챗봇에 직접 묻는 것과 뭐가 달라요?",
];

describe("HomeFaq", () => {
  it("takes four entries from the FAQ data, in this order", () => {
    expect(HOME_FAQ_IDS).toHaveLength(4);
    expect(homeFaqEntries().map((entry) => entry.q)).toEqual(HOME_QUESTIONS);
  });

  it("shows them as accordion cards that carry the same answers as /faq", () => {
    const entries = homeFaqEntries();
    const { container } = render(<HomeFaq />);
    const cards = [...container.querySelectorAll("details")];
    expect(cards).toHaveLength(HOME_QUESTIONS.length);
    cards.forEach((card, i) => {
      expect(card.querySelector("summary")?.textContent).toContain(HOME_QUESTIONS[i]);
      expect([...card.querySelectorAll("p")].map((p) => p.textContent)).toEqual(entries[i]?.a);
    });
  });

  it("keeps its heading, its lead line and the way to the full list", () => {
    render(<HomeFaq />);
    expect(screen.getByRole("heading", { level: 2, name: "자주 묻는 질문" })).toBeTruthy();
    expect(screen.getByText("처음 쓰기 전에 많이 묻는 것부터 모았어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /전체 FAQ 보기/ }).getAttribute("href")).toBe("/faq");
  });
});
