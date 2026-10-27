// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const START = "/api/auth/kakao/start?returnTo=%2Ftarot%2Fresult&age=signed-token";
const GOOGLE_START = "/api/auth/google/start?returnTo=%2Ftarot%2Fresult&age=signed-token";

describe("LoginPanel", () => {
  it("goes to Kakao only after the 만 14세 check, with the token the server signs for it", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ url: START });
    });
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    expect(calls).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("만 14세 이상인지 먼저 확인해 주세요");
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(START));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/auth/age");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ ageConfirmed: true, returnTo: "/tarot/result" });
  });

  it("offers Google under Kakao (white, the G mark), and goes there the same way: after the 만 14세 check, through the server", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ url: GOOGLE_START });
    });
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    const kakao = screen.getByRole("button", { name: "카카오로 계속하기" });
    const google = screen.getByRole("button", { name: "Google로 계속하기" });
    expect(kakao.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(google.querySelector("svg[aria-hidden='true']")?.querySelectorAll("path[fill]")).toHaveLength(4);
    fireEvent.click(google);
    expect(calls).toEqual([]);
    expect(screen.getByRole("alert").textContent).toBe("만 14세 이상인지 먼저 확인해 주세요");
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(google);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GOOGLE_START));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/auth/age");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ ageConfirmed: true, returnTo: "/tarot/result", provider: "google" });
  });

  it("stays on the page and says so when the check cannot be sent", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "RATE_LIMIT" }, { status: 429 }));
    const navigate = vi.fn();
    render(<LoginPanel next="/" status={null} navigate={navigate} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요."));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says what happened on the way back", () => {
    render(<LoginPanel next="/" status="cancel" navigate={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("로그인을 취소했어요");
    cleanup();
    render(<LoginPanel next="/" status="in-app" navigate={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("Google 로그인은 앱 안 브라우저에서는 안 돼요. 카카오로 로그인하거나 Safari·Chrome에서 열어 주세요.");
  });

  it("names what the login is for: a reading by default, 내 별자리 from /bonds, 내 기록 from /me", () => {
    render(<LoginPanel next="/tarot/result?unlock=opening" status={null} navigate={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    cleanup();
    render(<LoginPanel next="/bonds" status={null} navigate={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "로그인하고 내 별자리 만들기" })).toBeTruthy();
    expect(screen.getByText("내 별자리를 계정에 적어둘게요")).toBeTruthy();
    cleanup();
    render(<LoginPanel next="/me" status={null} navigate={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "로그인하고 내 기록 이어 보기" })).toBeTruthy();
  });

  it("tells a visitor in an app's browser (Instagram, Threads, KakaoTalk…) up front that Kakao is the way there", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0" });
    render(<LoginPanel next="/" status={null} navigate={() => {}} />);
    expect(screen.getByText("앱 안 브라우저에서는 카카오로 로그인해 주세요. Google은 Safari·Chrome에서 돼요.")).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    render(<LoginPanel next="/" status={null} navigate={() => {}} />);
    expect(screen.queryByText(/앱 안 브라우저에서는/)).toBeNull();
  });

  it("promises no signup gift (removed, owner 2026-10-14 evening)", () => {
    const { container } = render(<LoginPanel next="/" status={null} navigate={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/선물|무료로 드려요|별조각|달빛|\d+개/);
  });

  it("goes back to where a payment started, not to the checkout that sent here (QA-09)", () => {
    render(<LoginPanel next="/pay/checkout?product=tarot&returnTo=%2Ftarot%2Fresult" status={null} />);
    expect(screen.getByRole("link", { name: "돌아가기" }).getAttribute("href")).toBe("/tarot/result");
  });

  it("goes home from a checkout without a page to return to, and back to `next` otherwise", () => {
    render(<LoginPanel next="/pay/checkout?product=tarot" status={null} />);
    expect(screen.getByRole("link", { name: "돌아가기" }).getAttribute("href")).toBe("/");
    cleanup();
    render(<LoginPanel next="/tarot/result" status={null} />);
    expect(screen.getByRole("link", { name: "돌아가기" }).getAttribute("href")).toBe("/tarot/result");
  });
});
