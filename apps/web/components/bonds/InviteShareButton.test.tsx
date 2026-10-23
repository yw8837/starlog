// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { InviteShareButton } from "./InviteShareButton";

/**
 * 초대 한 번에 (owner 2026-10-23, the 2026-10-02 decision: no copying and typing codes): 카카오톡으로 초대하기 sends a feed
 * whose button opens /b/<code>; 다른 앱으로 보내기 is the phone's share sheet (title, text, url; never a file), or the link
 * copied where there is none.
 */

const { kakao } = vi.hoisted(() => ({ kakao: vi.fn(async () => undefined) }));
vi.mock("@/lib/kakaoShare", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/kakaoShare")>()), shareToKakao: kakao }));

afterEach(() => {
  cleanup();
  kakao.mockClear();
  vi.unstubAllEnvs();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const LINK = `${SITE.url}/b/K7M4QX`;
const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("InviteShareButton", () => {
  it("leads with 카카오톡으로 초대하기: the constellation's image, '용우님의 양자리에 별이 되어 주세요' and 별 되러 가기 to /b/<code>", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    render(<InviteShareButton code="K7M4QX" sign="aries" filled={1} ownerNickname="용우" />);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["카카오톡으로 초대하기", "다른 앱으로 보내기"]);
    await press("카카오톡으로 초대하기");
    expect(kakao).toHaveBeenCalledWith("용우님의 양자리에 별이 되어 주세요", "test-key", {
      url: LINK,
      imageUrl: `${SITE.url}/api/og/invite/K7M4QX`,
      imageSize: { width: 1200, height: 630 },
      title: "용우님의 양자리에 별이 되어 주세요",
      description: "생년월일과 카드 한 장이면 두 사람의 인연 점수가 나와요 · 별 1/4",
      button: "별 되러 가기",
    });
  });

  it("다른 앱으로 보내기 opens the share sheet with the title, the text and the link, no file and no code to type", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    render(<InviteShareButton code="K7M4QX" sign="aries" filled={1} ownerNickname="용우" />);
    await press("다른 앱으로 보내기");
    expect(share).toHaveBeenCalledWith({ title: "스타로그 별자리 인연", text: "용우님의 양자리에 별이 되어 주세요", url: LINK });
  });

  it("copies the link where there is no share sheet (a computer), and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    render(<InviteShareButton code="K7M4QX" sign="aries" filled={1} ownerNickname="용우" />);
    await press("다른 앱으로 보내기");
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(screen.getByRole("status").textContent).toBe("초대 링크를 복사했어요");
  });

  it("shows only 다른 앱으로 보내기, as the main button, without a Kakao key", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "");
    render(<InviteShareButton code="K7M4QX" sign="aries" filled={1} ownerNickname="용우" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["다른 앱으로 보내기"]);
    expect(buttons[0]!.className).toMatch(/primary/);
  });
});
