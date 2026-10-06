// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewLoginForm } from "./ReviewLoginForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill(id: string, password: string) {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

describe("ReviewLoginForm", () => {
  it("says it is for the review account only, sends the ID and password in the POST body only, and goes home", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ ok: true });
    });
    const navigate = vi.fn();
    render(<ReviewLoginForm navigate={navigate} />);
    expect(screen.getByRole("heading", { name: "로그인" })).toBeTruthy();
    expect(screen.getByText("심사용 계정 전용 로그인이에요.")).toBeTruthy();
    expect((screen.getByLabelText("비밀번호") as HTMLInputElement).type).toBe("password");
    fill("card-review", "secret words");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/auth/review");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ id: "card-review", password: "secret words" });
  });

  it("shows the server's one answer when the login is refused, and stays", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "BAD_TOKEN", message: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 400 }));
    const navigate = vi.fn();
    render(<ReviewLoginForm navigate={navigate} />);
    fill("card-review", "wrong");
    expect((await screen.findByRole("alert")).textContent).toBe("아이디 또는 비밀번호가 맞지 않아요.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("asks for both before sending anything", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewLoginForm navigate={vi.fn()} />);
    fill("card-review", "");
    expect(screen.getByRole("alert").textContent).toBe("아이디와 비밀번호를 입력해 주세요.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
