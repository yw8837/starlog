// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { KAKAO_SDK, type KakaoSdk } from "@/lib/kakaoShare";
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

  it("offers no Kakao button without a key", () => {
    render(<ShareButton text={TEXT} kakao="" />);
    expect(screen.queryByRole("button", { name: "카카오톡으로 보내기" })).toBeNull();
    expect(document.querySelector(`script[src="${KAKAO_SDK.src}"]`)).toBeNull();
  });
});

describe("ShareButton with a Kakao key", () => {
  afterEach(() => {
    delete window.Kakao;
    document.querySelectorAll("script").forEach((node) => node.remove());
  });

  function stubSdk(): KakaoSdk & { sent: unknown[] } {
    let initialized = false;
    const sent: unknown[] = [];
    return {
      sent,
      init: vi.fn(() => {
        initialized = true;
      }),
      isInitialized: () => initialized,
      Share: { sendDefault: vi.fn((template) => sent.push(template)) },
    };
  }

  it("loads the SDK only on the first tap, with the documented integrity, then sends a feed", async () => {
    render(<ShareButton text={TEXT} kakao="test-js-key" />);
    const button = screen.getByRole("button", { name: "카카오톡으로 보내기" });
    expect(button.className).toMatch(/secondary/);
    expect(document.querySelector("script")).toBeNull();

    await act(async () => {
      fireEvent.click(button);
    });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${KAKAO_SDK.src}"]`)!;
    expect(script).not.toBeNull();
    expect(script.integrity).toBe(KAKAO_SDK.integrity);
    expect(script.crossOrigin).toBe("anonymous");

    const sdk = stubSdk();
    await act(async () => {
      window.Kakao = sdk;
      script.dispatchEvent(new Event("load"));
    });
    expect(sdk.init).toHaveBeenCalledWith("test-js-key");
    expect(sdk.sent).toEqual([
      {
        objectType: "feed",
        content: { title: TEXT, imageUrl: `${SITE.url}/opengraph-image`, link: { mobileWebUrl: SITE.url, webUrl: SITE.url } },
        buttons: [{ title: `${SITE.nameKo} 열기`, link: { mobileWebUrl: SITE.url, webUrl: SITE.url } }],
      },
    ]);
  });

  it("uses an SDK that is already loaded without adding another script", async () => {
    const sdk = stubSdk();
    window.Kakao = sdk;
    render(<ShareButton text={TEXT} kakao="test-js-key" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 보내기" }));
    });
    expect(document.querySelector("script")).toBeNull();
    expect(sdk.sent).toHaveLength(1);
  });
});
