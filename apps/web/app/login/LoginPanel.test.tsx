// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

afterEach(cleanup);

describe("LoginPanel", () => {
  it("offers Kakao only, and goes there only after the 만 14세 check", () => {
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    expect(screen.queryByText(/Google/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("만 14세 이상인지 먼저 확인해 주세요");
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    expect(navigate).toHaveBeenCalledWith("/api/auth/kakao/start?age=1&returnTo=%2Ftarot%2Fresult");
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
