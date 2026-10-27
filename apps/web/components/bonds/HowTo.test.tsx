// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HowToButton, HowToCard } from "./HowTo";

// jsdom has no <dialog> methods; Modal calls showModal()/close().
beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

/** Title and sentence of each step, as the approved copy reads them (with 생년월일 where the screens ask for it). */
const STEPS = [
  ["별자리 고르기", "로그인하고 닉네임과 생년월일을 넣은 뒤 채울 별자리를 골라요 (내 별자리는 로그인해서 만들어요)"],
  ["친구에게 보내기", "카톡으로 초대 링크를 보내면 친구가 닉네임과 생년월일을 넣고 카드를 한 장 골라 내 별이 돼요 (로그인 없이, 생년월일은 저장 안 해요)"],
  ["다 채우면 완성", "도감 카드가 생기고, 인연 점수 합계로 랭킹에 올라요"],
] as const;

function expectThreeSteps(scope: HTMLElement) {
  const items = within(scope).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  items.forEach((li, i) => {
    const [title, text] = STEPS[i]!;
    expect(li.textContent).toBe(`${i + 1}${title}${text}`);
    // a small icon per step, decorative
    const icon = li.querySelector("span[aria-hidden='true'] svg");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("focusable")).toBe("false");
  });
  // three different icons
  expect(new Set(items.map((li) => li.querySelector("svg")!.innerHTML)).size).toBe(3);
}

describe("HowToCard (the start screen)", () => {
  it("is a 이렇게 해요 card with the three steps in order, each with an icon", () => {
    render(<HowToCard />);
    const card = screen.getByRole("region", { name: "이렇게 해요" });
    expect(within(card).getByRole("heading", { level: 2, name: "이렇게 해요" })).toBeTruthy();
    expect(within(card).getByRole("list").tagName).toBe("OL");
    expectThreeSteps(card);
  });

  it("says what is true of the screens: no login for a friend, birth dates not stored; the medals speak for themselves", () => {
    const { container } = render(<HowToCard />);
    expect(container.textContent).toContain("로그인 없이");
    expect(container.textContent).toContain("생년월일은 저장 안 해요");
    // one word for it: the steps ask for the 생년월일, so the note says 생년월일 too
    expect(container.textContent).not.toContain("생일");
    expect(container.textContent).not.toContain("메달"); // the podium shows them (owner 2026-10-08)
    // a friend types more than a birth date (nickname, a card), so the card does not say 생년월일만
    expect(container.textContent).not.toContain("생년월일만");
  });
});

describe("HowToButton (사용법, once there is a constellation)", () => {
  it("is a quiet button that opens the same three steps in the Modal, and closes again", () => {
    render(<HowToButton />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "사용법" }));
    const dialog = screen.getByRole("dialog", { name: "이렇게 해요" });
    expectThreeSteps(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
