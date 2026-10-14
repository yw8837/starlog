// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import SajuNewPage from "./new/page";
import SajuStartPage from "./start/page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn((href: string) => { throw new Error(`redirect ${href}`); }));
vi.mock("next/navigation", () => ({ useRouter: () => router, redirect }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: false, login: false, owner: false, user: null })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetAccountForTests();
  redirect.mockClear();
});

const backLink = (name: string) => screen.getByRole("link", { name });

describe("saju in three steps: 무엇이 궁금해요? → 태어난 날 → 명식 (owner 2026-10-14)", () => {
  it("step 1 picks the 운, with the way home", () => {
    render(<SajuStartPage />);
    expect(screen.getByText("3단계 중", { exact: false })).toBeTruthy();
    expect(backLink("홈으로").getAttribute("href")).toBe("/");
    expect(screen.getByRole("list", { name: "무엇이 궁금해요?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "명식 보기" })).toBeNull();
  });

  it("step 2 is the birth input, back to the topic step", () => {
    render(<SajuNewPage />);
    expect(screen.getByText("3단계 중", { exact: false })).toBeTruthy();
    expect(backLink("주제 고르기로 돌아가기").getAttribute("href")).toBe("/saju/start");
    expect(screen.getByRole("button", { name: "명식 보기" })).toBeTruthy();
  });

  it("with the topics off the birth input is step 1 of 2 as before, and the topic step sends there", () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "off");
    render(<SajuNewPage />);
    expect(screen.getByText("2단계 중", { exact: false })).toBeTruthy();
    expect(backLink("홈으로").getAttribute("href")).toBe("/");
    expect(() => SajuStartPage()).toThrow("redirect /saju/new?new=1");
  });
});
