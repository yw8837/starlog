// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ShareResultButton } from "./ShareResultButton";

const { kakao } = vi.hoisted(() => ({ kakao: vi.fn(async () => undefined) }));
vi.mock("@/lib/kakaoShare", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/kakaoShare")>()), shareToKakao: kakao }));

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
    // True to what the link carries: the question's text and the typed words are hidden, the worry itself is in the reading (A2 SHARE-1).
    expect(sheet().textContent).toContain("질문 원문과 직접 쓴 말은 가려요. 다만 풀이에 고민 내용이 담겨 있으니 보낼 사람을 골라 주세요.");
    expect(sheet().textContent).not.toContain("보이지 않아요");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["tarot", "뽑은 카드와 풀이 전체를 볼 수 있어요. 질문 원문과 직접 쓴 말은 가렸어요."],
    // A saju share has no cards and no question (B B08).
    ["saju", "한눈에 보기와 사주 풀이를 볼 수 있어요. 생년월일과 태어난 시각은 가렸어요."],
  ] as const)("the %s Kakao message says only what the link really leaves out", async (kind, description) => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    try {
      const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE }));
      render(<ShareResultButton kind={kind} text="나의 스타로그" create={create} stop={vi.fn()} />);
      await click(screen.getByRole("button", { name: "공유하기" }));
      await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
      await click(within(sheet()).getByRole("button", { name: "카카오톡으로 보내기", hidden: true }));
      expect(kakao).toHaveBeenLastCalledWith("나의 스타로그", "test-key", { url: URL_, imageUrl: IMAGE, button: "풀이 보기", description, attachImage: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("makes the link on 공유 링크 만들기, then shares that link (not the site) from its own tap", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE }));
    render(<ShareResultButton kind="saju" text="나의 스타로그 · 연애운" create={create} stop={vi.fn()} />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    // The reading can name the chart's pillars in Hangul, so the sheet no longer says the 명식 stays out (A2 SHARE-2).
    expect(sheet().textContent).toContain("생년월일과 태어난 시각, 고른 상황은 가려요. 다만 풀이에 내 사주 이야기가 담겨 있으니 보낼 사람을 골라 주세요.");
    expect(sheet().textContent).not.toContain("명식");
    await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
    expect(create).toHaveBeenCalledOnce();
    expect(sheet().textContent).toContain("starlog.yeolmaeapps.kr/s/abcdefghijkl");
    await click(within(sheet()).getByRole("button", { name: "공유하기", hidden: true }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_, text: `나의 스타로그 · 연애운
${URL_}` }));
  });

  it("for 오늘의 한 장, says a friend sees today's card and its reading and nothing personal, and the Kakao message opens that link with 풀이 보기", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    try {
      const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE }));
      render(<ShareResultButton kind="daily" text="오늘의 카드: 작은 빛 하나를 따라가 보는 하루" create={create} stop={vi.fn()} />);
      await click(screen.getByRole("button", { name: "공유하기" }));
      expect(sheet().textContent).toContain("링크를 받은 사람에게는 오늘 뽑은 카드와 풀이가 보여요.");
      expect(sheet().textContent).toContain("이름이나 기기 정보 같은 개인 정보는 담기지 않아요.");
      await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
      await click(within(sheet()).getByRole("button", { name: "카카오톡으로 보내기", hidden: true }));
      expect(kakao).toHaveBeenCalledWith("오늘의 카드: 작은 빛 하나를 따라가 보는 하루", "test-key", {
        url: URL_,
        imageUrl: IMAGE,
        button: "풀이 보기",
        description: "오늘 뽑은 카드와 풀이를 볼 수 있어요. 나도 오늘의 한 장을 뽑아 볼 수 있어요.",
        attachImage: true,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sends what the server said the share holds (owner 2026-10-23 \"텍스트만 날라간다\"): its title and first sentence, 풀이 보기 to the link and the visitor's own try", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    try {
      const preview = { title: "완드 3 · 컵 시종 · 완드 2 · 지금은 짧게 안부를 건네 볼 때예요.", description: "먼저 손을 내미는 쪽이 편해지는 흐름이에요.", try: { label: "나도 뽑아 보기", path: "/tarot/start" } };
      const create = vi.fn(async () => ({ ok: true as const, url: URL_, imageUrl: IMAGE, preview }));
      render(<ShareResultButton kind="tarot" text="스타로그에서 뽑은 카드 · 완드 3 · 컵 시종 · 완드 2" create={create} stop={vi.fn()} />);
      await click(screen.getByRole("button", { name: "공유하기" }));
      await click(within(sheet()).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
      await click(within(sheet()).getByRole("button", { name: "카카오톡으로 보내기", hidden: true }));
      expect(kakao).toHaveBeenLastCalledWith(preview.title, "test-key", {
        url: URL_,
        imageUrl: IMAGE,
        button: "풀이 보기",
        description: preview.description,
        second: { title: "나도 뽑아 보기", url: "https://starlog.yeolmaeapps.kr/tarot/start" },
        attachImage: true,
      });
      await click(within(sheet()).getByRole("button", { name: "공유하기", hidden: true }));
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "스타로그", text: `${preview.title}
${URL_}`, url: URL_ }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still shows 공유하기 when the result cannot be shared yet, and says why instead of making a link", async () => {
    const create = vi.fn();
    render(<ShareResultButton kind="tarot" text="t" create={create} stop={vi.fn()} unavailable="풀이를 다 적으면 공유할 수 있어요" />);
    await click(screen.getByRole("button", { name: "공유하기" }));
    expect(sheet().textContent).toContain("풀이를 다 적으면 공유할 수 있어요");
    expect(within(sheet()).queryByRole("button", { name: "공유 링크 만들기", hidden: true })).toBeNull();
    expect(create).not.toHaveBeenCalled();
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
  // The screen's tokens: the print block at the end (PDF로 저장's paper ink) does not light the sheet.
  const tokens = new Map([...read("app/globals.css").split("@media print")[0]!.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name!, hex!]));
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
