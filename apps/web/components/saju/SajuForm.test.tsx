// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { clearSajuProfile } from "@/lib/sajuFlow";
import { SajuForm } from "./SajuForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: false, login: false, owner: false, user: null })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetAccountForTests();
  clearSajuProfile();
  localStorage.clear();
  router.push.mockClear();
});

describe("SajuForm takes no free text", () => {
  it("has no concern field, even with the status chips open", () => {
    render(<SajuForm />);
    fireEvent.click(screen.getByRole("button", { name: /요즘 상황도 알려 주기/ }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
