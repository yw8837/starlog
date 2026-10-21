// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintFoot, PrintHead, SavePdfButton } from "./SavePdfButton";

const CHROME = navigator.userAgent;
const KAKAO = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410110";
const THREADS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.20.104";
/** 2026-10-20 16:30 UTC is already 10월 21일 in Korea. */
const AT = Date.UTC(2026, 9, 20, 16, 30);

function setUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
}

let print: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.title = "내 기록 | 스타로그";
  print = vi.fn();
  window.print = print as unknown as typeof window.print;
});

afterEach(() => {
  cleanup();
  setUserAgent(CHROME);
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const press = () => fireEvent.click(screen.getByRole("button", { name: "PDF로 저장" }));

describe("PDF로 저장", () => {
  it("opens the print dialog with the file's name as the page title, and puts the title back after printing", () => {
    let titleWhilePrinting = "";
    print.mockImplementation(() => {
      titleWhilePrinting = document.title;
    });
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false }} />);
    press();
    expect(print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toBe("스타로그-타로-2026-10-21");
    expect(document.title).toBe("스타로그-타로-2026-10-21");
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.title).toBe("내 기록 | 스타로그");
  });

  it("names a premium file without the spaces in its product name", () => {
    render(<SavePdfButton type="켈틱 크로스 10장" kept={{ at: AT, inAccount: true }} />);
    press();
    expect(document.title).toBe("스타로그-켈틱크로스10장-2026-10-21");
  });

  it("says where to pick PDF in the print screen", () => {
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false }} />);
    expect(screen.getByText("인쇄 화면에서 'PDF로 저장'을 고르면 돼요")).toBeTruthy();
  });

  it("in an in-app browser shows how to save instead of printing, and copies this page's link", async () => {
    setUserAgent(KAKAO);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: true }} />);
    expect(screen.queryByText("인쇄 화면에서 'PDF로 저장'을 고르면 돼요")).toBeNull();
    press();
    expect(print).not.toHaveBeenCalled();
    expect(document.title).toBe("내 기록 | 스타로그");
    expect(screen.getByText(/앱 안에서는 PDF 저장이 잘 안 돼요/)).toBeTruthy();
    expect(screen.getByText(/크롬이나 사파리에서 열고, 같은 계정으로 로그인하면 저장할 수 있어요/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
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
    render(<SavePdfButton type="타로" kept={{ at: AT, inAccount: false }} />);
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
