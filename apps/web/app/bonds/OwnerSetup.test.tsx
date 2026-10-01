// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { OwnerSetup } from "./OwnerSetup";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const PROFILE = {
  calendar: "lunar", year: 1993, month: 7, day: 14, isLeapMonth: true, timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const value = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;

describe("OwnerSetup", () => {
  it("fills the birth date from this device's saved saju profile and says so", async () => {
    window.localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(PROFILE));
    render(<OwnerSetup onDone={() => undefined} />);
    expect(await screen.findByText("저장된 사주 정보로 채웠어요")).toBeTruthy();
    expect([value("태어난 연도"), value("태어난 월"), value("태어난 일")]).toEqual(["1993", "7", "14"]);
    expect(screen.getByRole("button", { name: "음력" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("checkbox", { name: "윤달이에요" }) as HTMLInputElement).checked).toBe(true);
    screen.getByRole("button", { name: "바꾸기" }).click();
    expect(document.activeElement).toBe(screen.getByLabelText("태어난 연도"));
  });

  it("leaves the date empty without a saved profile", () => {
    render(<OwnerSetup onDone={() => undefined} />);
    expect([value("태어난 연도"), value("태어난 월"), value("태어난 일")]).toEqual(["", "", ""]);
    expect(screen.queryByText("저장된 사주 정보로 채웠어요")).toBeNull();
    expect(screen.getByRole("textbox", { name: "닉네임" }).getAttribute("placeholder")).toBe("예: 불량감자, 불꽃속성 알감자");
  });
});
