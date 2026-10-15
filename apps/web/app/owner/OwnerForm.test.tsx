// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { OwnerForm } from "./OwnerForm";

const me = (owner: boolean) => Response.json({ payments: owner, login: owner, owner, user: null });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

describe("OwnerForm (owner 2026-10-15: show whether this device is the owner's, and where to go next)", () => {
  it("after a right code says this device is confirmed, hides the form, and offers the home and saju", async () => {
    let owner = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/owner") {
        owner = true;
        return Response.json({ ok: true });
      }
      return me(owner);
    }));
    render(<OwnerForm />);
    fireEvent.change(await screen.findByLabelText("운영자 코드"), { target: { value: "right-code" } });
    fireEvent.click(screen.getByRole("button", { name: "확인하기" }));
    expect(await screen.findByRole("heading", { level: 1, name: "운영자로 확인된 기기예요" })).toBeTruthy();
    expect(screen.queryByLabelText("운영자 코드")).toBeNull();
    expect(screen.getByRole("link", { name: "홈으로 가기" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "사주 보러 가기" }).getAttribute("href")).toBe("/saju/start?new=1");
  });

  it("shows the confirmed state on a later visit from a device that already holds the pass", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => me(true)));
    render(<OwnerForm />);
    expect(await screen.findByRole("heading", { level: 1, name: "운영자로 확인된 기기예요" })).toBeTruthy();
    expect(screen.queryByLabelText("운영자 코드")).toBeNull();
  });

  it("keeps the form, with the reason, when the code is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/owner" ? Response.json({ code: "FORBIDDEN", message: "코드가 맞지 않아요." }, { status: 403 }) : me(false),
    ));
    render(<OwnerForm />);
    fireEvent.change(await screen.findByLabelText("운영자 코드"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "확인하기" }));
    expect(await screen.findByText("코드가 맞지 않아요.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "운영자 확인" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "홈으로 가기" })).toBeNull();
  });
});
