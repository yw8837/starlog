// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_CONTEXT_KEY, SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { NewYearForm } from "./NewYearForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  router.push.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("2027 신년운세's form (Task 21)", () => {
  it("shows the saved profile as one line with the optional status chips and no concern box; the gold button opens the preview, nothing in the address", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(DEFAULT_SAJU_FORM));
    window.history.replaceState(null, "", "/premium/newyear-2027/new");
    render(<NewYearForm />);
    expect(await screen.findByText(/1990년 1월 1일/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "나의 태어난 날 고치기" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "직장인" }));
    fireEvent.click(screen.getByRole("button", { name: /2027년 미리 보기/ }));
    expect(JSON.parse(localStorage.getItem(SAJU_CONTEXT_KEY)!)).toMatchObject({ workStatus: "employee" });
    expect(router.push).toHaveBeenCalledWith("/premium/newyear-2027/preview");
    expect(window.location.pathname + window.location.search).toBe("/premium/newyear-2027/new");
  });

  it("without a profile asks the birth with every field and its consent", async () => {
    render(<NewYearForm />);
    expect(await screen.findByLabelText("태어난 곳")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: /2027년 미리 보기/ })).toBeTruthy();
  });
});
