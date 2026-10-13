// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ShareResultButton } from "./ShareResultButton";

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

afterEach(() => {
  cleanup();
  delete (navigator as { share?: unknown }).share;
});

const URL_ = "https://starlog.yeolmaeapps.kr/s/abcdefghijkl";
const IMAGE = "https://starlog.yeolmaeapps.kr/api/og/share/abcdefghijkl";

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function sheet(): HTMLElement {
  return screen.getByRole("dialog", { hidden: true });
}

describe("ShareResultButton", () => {
  it("says what a friend sees and what stays hidden, and makes no link until asked", async () => {
    const create = vi.fn();
    render(<ShareResultButton kind="tarot" text="스타로그에서 뽑은 카드 · 은둔자" create={create} stop={vi.fn()} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    expect(sheet().textContent).toContain("뽑은 카드와 풀이 전체가 보여요");
    expect(sheet().textContent).toContain("질문과 직접 쓴 말, 이어서 물어본 내용은 보이지 않아요");
    expect(create).not.toHaveBeenCalled();
  });

  it("makes the link on 공유 링크 만들기, then shares that link (not the site) from its own tap", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE }));
    render(<ShareResultButton kind="saju" text="나의 스타로그 · 연애운" create={create} stop={vi.fn()} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    expect(sheet().textContent).toContain("생년월일, 명식, 이어서 물어본 내용은 보이지 않아요");
    await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    expect(create).toHaveBeenCalledOnce();
    expect(sheet().textContent).toContain("starlog.yeolmaeapps.kr/s/abcdefghijkl");
    await click(within(sheet()).getByRole("button", { name: "공유하기", hidden: true }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_, text: "나의 스타로그 · 연애운" }));
  });

  it("says why when the link cannot be made, and lets the person try again", async () => {
    const create = vi.fn(async () => ({ ok: false as const, message: "지금은 공유 링크를 만들 수 없어요." }));
    render(<ShareResultButton kind="tarot" text="t" create={create} stop={vi.fn()} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    expect(within(sheet()).getByRole("alert", { hidden: true }).textContent).toBe("지금은 공유 링크를 만들 수 없어요.");
    expect(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true })).toBeTruthy();
  });

  it("takes the link down on 공유 그만하기", async () => {
    const stop = vi.fn(async () => true);
    render(<ShareResultButton kind="tarot" text="t" create={async () => ({ ok: true, url: URL_, imageUrl: IMAGE })} stop={stop} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    await click(within(sheet()).getByRole("button", { name: "공유 그만하기", hidden: true }));
    expect(stop).toHaveBeenCalledOnce();
    expect(within(sheet()).getByRole("status", { hidden: true }).textContent).toContain("보낸 링크는 이제 열리지 않아요");
  });
});
