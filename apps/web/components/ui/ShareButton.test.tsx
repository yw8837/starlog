// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { KAKAO_SDK, type KakaoSdk } from "@/lib/kakaoShare";
import { ShareButton } from "./ShareButton";

const TEXT = "완드 3 · 컵 시종 · 완드 2 · 지금은 짧게 안부를 건네 볼 때예요.";
const URL_ = "https://starlog.yeolmaeapps.kr/s/abcdefghijkl";
const IMAGE = "https://starlog.yeolmaeapps.kr/api/og/share/abcdefghijkl";
/** A shared reading's own page (owner 2026-10-23: never the home), with its preview and the visitor's own try. */
const TARGET = {
  url: URL_,
  imageUrl: IMAGE,
  button: "풀이 보기",
  description: "먼저 손을 내미는 쪽이 편해지는 흐름이에요.",
  second: { title: "나도 뽑아 보기", url: "https://starlog.yeolmaeapps.kr/tarot/start" },
};

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
  it("opens the share sheet with the title, the text with the link at its end (apps that show the text only) and the link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} target={TARGET} />);
    await press();
    expect(share).toHaveBeenCalledWith({ title: SITE.nameKo, text: `${TEXT}
${URL_}`, url: URL_ });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("copies the link and shows a toast where there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    render(<ShareButton text={TEXT} target={TARGET} />);
    await press();
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(screen.getByRole("status").textContent).toBe("링크를 복사했어요");
  });

  it("does nothing more when the share sheet is closed", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("closed"), { name: "AbortError" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} target={TARGET} />);
    await press();
    expect(share).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("falls back to copying when the share sheet fails, and says so when copying fails too", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareButton text={TEXT} target={TARGET} />);
    await press();
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(screen.getByRole("status").textContent).toBe("링크를 복사하지 못했어요");
    // QA Q-12: the link is then offered to copy by hand, and stays after the toast fades.
    const field = screen.getByRole("textbox", { name: "링크를 길게 눌러 복사해 주세요" }) as HTMLInputElement;
    expect(field.value).toBe(URL_);
    expect(field.readOnly).toBe(true);
  });

  it("shows no hand-copy field when the link was copied", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ShareButton text={TEXT} target={TARGET} />);
    await press();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("is a secondary button, not a gold primary", () => {
    render(<ShareButton text={TEXT} target={TARGET} />);
    const button = screen.getByRole("button", { name: "공유하기" });
    expect(button.className).toMatch(/secondary/);
    expect(button.className).not.toMatch(/primary/);
  });

  it("attaches the preview image as a PNG where the device can share files (stories), fetched before the tap", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn((data: { files?: File[] }) => Boolean(data.files?.every((f) => f.type === "image/png")));
    stubNavigator({ share, clipboard: { writeText: vi.fn() } });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true, writable: true });
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<ShareButton text={TEXT} target={{ ...TARGET, attachImage: true }} />);
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledWith(IMAGE, expect.anything());
      await press();
      const data = share.mock.calls[0]![0] as { title: string; text: string; url: string; files: File[] };
      expect(data).toMatchObject({ title: SITE.nameKo, text: `${TEXT}
${URL_}`, url: URL_ });
      expect(data.files).toHaveLength(1);
      expect(data.files[0]!.type).toBe("image/png");
    } finally {
      vi.unstubAllGlobals();
      delete (navigator as { canShare?: unknown }).canShare;
    }
  });

  it("offers no Kakao button without a key", () => {
    render(<ShareButton text={TEXT} kakao="" target={TARGET} />);
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

  it("loads the SDK only on the first tap, with the documented integrity, then sends a feed: the 2:1 image, the title and first sentence, 풀이 보기 to the shared page and 나도 뽑아 보기", async () => {
    render(<ShareButton text={TEXT} kakao="test-js-key" target={TARGET} />);
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
        content: {
          title: TEXT,
          description: "먼저 손을 내미는 쪽이 편해지는 흐름이에요.",
          imageUrl: IMAGE,
          imageWidth: 1200,
          imageHeight: 600,
          link: { mobileWebUrl: URL_, webUrl: URL_ },
        },
        buttons: [
          { title: "풀이 보기", link: { mobileWebUrl: URL_, webUrl: URL_ } },
          { title: "나도 뽑아 보기", link: { mobileWebUrl: "https://starlog.yeolmaeapps.kr/tarot/start", webUrl: "https://starlog.yeolmaeapps.kr/tarot/start" } },
        ],
      },
    ]);
  });

  it("says so when Kakao cannot start (a wrong key), and tries afresh on the next tap", async () => {
    render(<ShareButton text={TEXT} kakao="bad-key" target={TARGET} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 보내기" }));
    });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${KAKAO_SDK.src}"]`)!;
    const sdk = stubSdk();
    sdk.init = vi.fn(() => {
      throw new Error("invalid app key");
    });
    await act(async () => {
      window.Kakao = sdk;
      script.dispatchEvent(new Event("load"));
    });
    expect(screen.getByRole("status").textContent).toBe("카카오톡을 열지 못했어요");
    expect(script.isConnected).toBe(false);
    expect(window.Kakao).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 보내기" }));
    });
    expect(document.querySelector(`script[src="${KAKAO_SDK.src}"]`)).not.toBeNull();
  });

  it("uses an SDK that is already loaded without adding another script", async () => {
    const sdk = stubSdk();
    window.Kakao = sdk;
    render(<ShareButton text={TEXT} kakao="test-js-key" target={TARGET} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 보내기" }));
    });
    expect(document.querySelector("script")).toBeNull();
    expect(sdk.sent).toHaveLength(1);
  });
});
