// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    expect(sheet().textContent).toContain("질문과 직접 쓴 말, 고른 상황, 이어서 물어본 내용은 보이지 않아요");
    expect(create).not.toHaveBeenCalled();
  });

  it("makes the link on 공유 링크 만들기, then shares that link (not the site) from its own tap", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE }));
    render(<ShareResultButton kind="saju" text="나의 스타로그 · 연애운" create={create} stop={vi.fn()} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    expect(sheet().textContent).toContain("생년월일과 태어난 시각, 명식, 고른 상황, 이어서 물어본 내용은 보이지 않아요");
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

  it("shows the link this reading already has, with 공유 그만하기, without making another", async () => {
    const create = vi.fn();
    render(<ShareResultButton kind="tarot" text="t" create={create} stop={vi.fn()} current={() => ({ url: URL_, imageUrl: IMAGE })} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    expect(sheet().textContent).toContain("starlog.yeolmaeapps.kr/s/abcdefghijkl");
    expect(within(sheet()).getByRole("button", { name: "공유 그만하기", hidden: true })).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("makes a new link after stopping, without a reload", async () => {
    const next = "https://starlog.yeolmaeapps.kr/s/zyxwvutsrqpo";
    const create = vi.fn(async () => ({ ok: true as const, url: next, imageUrl: IMAGE }));
    render(<ShareResultButton kind="tarot" text="t" create={create} stop={async () => true} current={() => ({ url: URL_, imageUrl: IMAGE })} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    await click(within(sheet()).getByRole("button", { name: "공유 그만하기", hidden: true }));
    await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    expect(create).toHaveBeenCalledOnce();
    expect(sheet().textContent).toContain("starlog.yeolmaeapps.kr/s/zyxwvutsrqpo");
  });

  it("keeps the live link and 공유 그만하기 when stopping fails", async () => {
    render(<ShareResultButton kind="tarot" text="t" create={vi.fn()} stop={async () => false} current={() => ({ url: URL_, imageUrl: IMAGE })} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    await click(within(sheet()).getByRole("button", { name: "공유 그만하기", hidden: true }));
    expect(within(sheet()).getByRole("alert", { hidden: true }).textContent).toBe("공유를 멈추지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    expect(sheet().textContent).toContain("starlog.yeolmaeapps.kr/s/abcdefghijkl");
    expect(within(sheet()).getByRole("button", { name: "공유 그만하기", hidden: true })).toBeTruthy();
  });
});

describe("ShareResultButton on the sheet's night gradient (M-01)", () => {
  // Tests run from the repo root or from apps/web.
  const read = (path: string) => readFileSync([`apps/web/${path}`, path].map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p)) ?? "", "utf8");
  const tokens = new Map([...read("app/globals.css").matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name!, hex!]));
  const rgb = (value: string) => {
    const hex = value.startsWith("var(") ? tokens.get(/--([\w-]+)/.exec(value)![1]!)! : value;
    return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  };
  const luminance = (color: number[]) =>
    0.2126 * linear(color[0]!) + 0.7152 * linear(color[1]!) + 0.0722 * linear(color[2]!);
  const linear = (channel: number) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4);
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  // Modal.module.css draws the sheet: a gradient from its top colour to its bottom one.
  const ends = [.../\.dialog \{[^}]*linear-gradient\(([^)]*)\)/.exec(read("components/ui/Modal.module.css"))![1]!.matchAll(/#[0-9a-f]{6}/gi)].map(([hex]) => rgb(hex));
  const css = read("components/share/ShareResultButton.module.css");
  const rule = (selector: string) => new RegExp(`(?:^|\\n)${selector.replace(/\./g, "\\.")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("reads the sheet's two ends", () => {
    expect(ends).toHaveLength(2);
  });

  it.each([".lead", ".lead strong", ".link", ".note", ".stop"])("%s reads at 4.5:1 or more from the top of the sheet to the bottom", (selector) => {
    const color = /(?:^|[;\s])color:\s*([^;]+);/.exec(rule(selector))?.[1]?.trim() ?? "";
    for (const end of ends) expect(contrast(rgb(color), end)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives 공유 그만하기 a target at least 44px tall (M-09)", () => {
    expect(rule(".stop")).toMatch(/min-height: 44px;/);
  });
});
