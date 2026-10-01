// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareImageButton } from "./ShareImageButton";

const PROPS = { imageUrl: "/api/og/bonds/c1", fileName: "starlog-aries.png", shareText: "내 양자리 완성! 인연 342점", shareUrl: "https://starlog.yeolmaeapps.kr/ranking/aries" };

function stubNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

async function press() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
  });
}

describe("ShareImageButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }))));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    const nav = navigator as { share?: unknown; canShare?: unknown; clipboard?: unknown };
    delete nav.share;
    delete nav.canShare;
    delete nav.clipboard;
  });

  it("shares the PNG as a file when the device can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, canShare: vi.fn(() => true), clipboard: { writeText } });
    render(<ShareImageButton {...PROPS} />);
    await press();
    expect(fetch).toHaveBeenCalledWith(PROPS.imageUrl);
    const data = share.mock.calls[0]![0] as { files: File[]; text: string; url: string };
    expect(data.files).toHaveLength(1);
    expect(data.files[0]!.name).toBe(PROPS.fileName);
    expect(data.files[0]!.type).toBe("image/png");
    expect(data).toMatchObject({ text: PROPS.shareText, url: PROPS.shareUrl });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("downloads the image and copies the link where files cannot be shared", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    URL.createObjectURL = vi.fn(() => "blob:starlog");
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    render(<ShareImageButton {...PROPS} />);
    await press();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.getAttribute("download")).toBe(PROPS.fileName);
    expect(clicks[0]!.href).toBe("blob:starlog");
    expect(writeText).toHaveBeenCalledWith(PROPS.shareUrl);
    expect(screen.getByRole("status").textContent).toBe("이미지를 저장하고 링크를 복사했어요");
    click.mockRestore();
  });

  it("says so when the image cannot be made", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    render(<ShareImageButton {...PROPS} />);
    await press();
    expect(screen.getByRole("status").textContent).toBe("이미지를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요");
  });
});
