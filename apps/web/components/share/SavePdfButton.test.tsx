// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintFoot, PrintHead, SavePdfButton } from "./SavePdfButton";

const CHROME = navigator.userAgent;
const KAKAO = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410110";
const THREADS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.20.104";
/** A webview no list names: print() does nothing there. */
const UNKNOWN_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36";
const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
/** 2026-10-20 16:30 UTC is already 10월 21일 in Korea. */
const AT = Date.UTC(2026, 9, 20, 16, 30);
const HINT = "인쇄 화면에서 'PDF로 저장'(아이폰은 공유 → 파일에 저장)을 고르면 돼요";
const ACCOUNT_PATH = "/chapter/abcdefghij0123456789";

function setUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
}

let print: ReturnType<typeof vi.fn>;
/** A browser that opens its print dialog says so with beforeprint. */
const opensDialog = () => window.dispatchEvent(new Event("beforeprint"));

beforeEach(() => {
  document.title = "내 기록 | 스타로그";
  print = vi.fn(opensDialog);
  window.print = print as unknown as typeof window.print;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setUserAgent(CHROME);
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const press = () => fireEvent.click(screen.getByRole("button", { name: "PDF로 저장" }));
const afterPrint = () =>
  act(() => {
    window.dispatchEvent(new Event("afterprint"));
  });

describe("PDF로 저장", () => {
  it("opens the print dialog with the file's name as the page title, and puts the title back after printing", () => {
    let titleWhilePrinting = "";
    print.mockImplementation(() => {
      opensDialog();
      titleWhilePrinting = document.title;
    });
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    press();
    expect(print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toBe("스타로그-타로-2026-10-21");
    expect(document.title).toBe("스타로그-타로-2026-10-21");
    afterPrint();
    expect(document.title).toBe("내 기록 | 스타로그");
  });

  it("names a premium file without the spaces in its product name", () => {
    render(<SavePdfButton type="켈틱 크로스 10장" kept={{ at: AT, inAccount: true, path: ACCOUNT_PATH }} />);
    press();
    expect(document.title).toBe("스타로그-켈틱크로스10장-2026-10-21");
  });

  it("a second tap before the dialog is done keeps the page's own title to put back, not the file's name", () => {
    print.mockImplementation(() => {});
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    press();
    press();
    afterPrint();
    expect(document.title).toBe("내 기록 | 스타로그");
  });

  it("says where to pick PDF in the print screen, on iPhones too", () => {
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("keeps the dialog's file name while the dialog is open: no fallback once beforeprint came", () => {
    vi.useFakeTimers();
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    press();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.title).toBe("스타로그-타로-2026-10-21");
    expect(screen.queryByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeNull();
  });

  it("in a webview no list names, where print() does nothing: the title comes back and the in-app note shows", () => {
    vi.useFakeTimers();
    setUserAgent(UNKNOWN_WEBVIEW);
    print.mockImplementation(() => {});
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: true, path: ACCOUNT_PATH }} />);
    press();
    expect(print).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(document.title).toBe("내 기록 | 스타로그");
    expect(screen.getByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "링크 복사" })).toBeTruthy();
  });

  it("on iOS, whose Safari may never say beforeprint, the fallback stays off", () => {
    vi.useFakeTimers();
    setUserAgent(IOS_SAFARI);
    print.mockImplementation(() => {});
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    press();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeNull();
    afterPrint();
    expect(document.title).toBe("내 기록 | 스타로그");
  });

  it("in an in-app browser shows how to save instead of printing, and copies the reading's account address", async () => {
    setUserAgent(KAKAO);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: true, path: ACCOUNT_PATH }} />);
    expect(screen.queryByText(HINT)).toBeNull();
    press();
    expect(print).not.toHaveBeenCalled();
    expect(document.title).toBe("내 기록 | 스타로그");
    expect(screen.getByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeTruthy();
    expect(screen.getByText(/크롬이나 사파리에서 열고, 같은 계정으로 로그인하면 저장할 수 있어요/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${ACCOUNT_PATH}`);
    expect(screen.getByRole("status").textContent).toBe("링크를 복사했어요");
  });

  it("in an in-app browser, the demo opens anywhere: no login to mention", () => {
    setUserAgent(THREADS);
    render(<SavePdfButton type="타로" />);
    press();
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText(/링크를 복사해 크롬이나 사파리에서 열면 저장할 수 있어요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "링크 복사" })).toBeTruthy();
  });

  it("in an in-app browser, a reading kept in this app only offers no link that would open nothing", () => {
    setUserAgent(KAKAO);
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false, path: "/chapter/tarot001" }} />);
    press();
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText(/이 풀이는 이 앱 안에만 보관돼 있어서 다른 브라우저에서는 열리지 않아요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "링크 복사" })).toBeNull();
  });
});

describe("the printed page's header and footer", () => {
  it("print the site and the reading's date in Korea, and the AI note with the address", () => {
    render(
      <>
        <PrintHead at={AT} />
        <PrintFoot />
      </>,
    );
    expect(screen.getByText("스타로그 · starlog.yeolmaeapps.kr")).toBeTruthy();
    expect(screen.getByText("2026년 10월 21일")).toBeTruthy();
    expect(screen.getByText(/AI가 만든 풀이예요/)).toBeTruthy();
    expect(screen.getByText("starlog.yeolmaeapps.kr")).toBeTruthy();
  });

  it("leave the date out for the demo", () => {
    const { container } = render(<PrintHead />);
    expect(container.textContent).toBe("스타로그 · starlog.yeolmaeapps.kr");
  });
});
