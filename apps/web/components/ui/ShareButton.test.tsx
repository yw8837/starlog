// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { ShareButton } from "./ShareButton";

const TEXT = "나의 스타로그 · 뜸해진 연락 앞에서";

function stubNavigator(props: { share?: unknown; clipboard?: unknown }) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

async function press() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
  });
}

afterEach(() => {
  cleanup();
  const nav = navigator as { share?: unknown; clipboard?: unknown };
  delete nav.share;
  delete nav.clipboard;
});

describe("ShareButton", () => {
  it("opens the share sheet with the site's link, never a chapter URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} />);
    await press();
    expect(share).toHaveBeenCalledWith({ title: SITE.nameKo, text: TEXT, url: SITE.url });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("copies the link and shows a toast where there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    render(<ShareButton text={TEXT} />);
    await press();
    expect(writeText).toHaveBeenCalledWith(SITE.url);
    expect(screen.getByRole("status").textContent).toBe("링크를 복사했어요");
  });

  it("does nothing more when the share sheet is closed", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("closed"), { name: "AbortError" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} />);
    await press();
    expect(share).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("falls back to copying when the share sheet fails, and says so when copying fails too", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} />);
    await press();
    expect(writeText).toHaveBeenCalledWith(SITE.url);
    expect(screen.getByRole("status").textContent).toBe("링크를 복사하지 못했어요");
  });

  it("is a secondary button, not a gold primary", () => {
    render(<ShareButton text={TEXT} />);
    const button = screen.getByRole("button", { name: "공유하기" });
    expect(button.className).toMatch(/secondary/);
    expect(button.className).not.toMatch(/primary/);
  });
});
