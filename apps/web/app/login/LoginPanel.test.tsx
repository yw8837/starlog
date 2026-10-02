// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const START = "/api/auth/kakao/start?returnTo=%2Ftarot%2Fresult&age=signed-token";

describe("LoginPanel", () => {
  it("offers Kakao only, and goes there only after the 만 14세 check, with the token the server signs for it", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ url: START });
    });
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    expect(screen.queryByText(/Google/)).toBeNull();
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
  });

  it("explains the gift", () => {
    render(<LoginPanel next="/" status={null} navigate={() => {}} />);
    expect(screen.getByText("처음 가입하면 별조각 10개를 드려요")).toBeTruthy();
  });
});
