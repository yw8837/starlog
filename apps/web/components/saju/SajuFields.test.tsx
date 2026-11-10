// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { SajuFields } from "./SajuForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  router.push.mockReset();
});

describe("SajuFields for the other person (우리 사이 궁합)", () => {
  it("hides the birthplace (서울), the status chips and the user's own consent; hands the form back without saving a profile or leaving", () => {
    const onDone = vi.fn();
    render(<SajuFields initial={{ ...DEFAULT_SAJU_FORM, year: 1992, placeId: "busan" }} partner submitLabel="다음" onDone={onDone} />);
    expect(screen.queryByLabelText("태어난 곳")).toBeNull();
    expect(screen.queryByRole("button", { name: /요즘 상황도 알려 주기/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("10년 흐름(대운)의 방향을 정하는 데만 써요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ year: 1992, placeId: "seoul" }), {});
    expect(localStorage.getItem(SAJU_PROFILE_KEY)).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("for the user's own birth keeps every field and the consent, and hands the form and chips back", () => {
    const onDone = vi.fn();
    render(<SajuFields initial={DEFAULT_SAJU_FORM} submitLabel="다음" onDone={onDone} />);
    expect(screen.getByLabelText("태어난 곳")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(onDone).not.toHaveBeenCalled(); // the consent comes first
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ year: DEFAULT_SAJU_FORM.year }), {});
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("SajuFields for the grade card (사주 등급, spec 2026-11-11 B)", () => {
  it("chips={false} hides the status chips; consentLabel names what the consent is for, in the label and its error", () => {
    const onDone = vi.fn();
    render(<SajuFields initial={DEFAULT_SAJU_FORM} chips={false} consentLabel="출생 정보를 등급 계산에 쓰는 데 동의해요" submitLabel="등급 보기" onDone={onDone} />);
    expect(screen.queryByRole("button", { name: /요즘 상황도 알려 주기/ })).toBeNull();
    expect(screen.getByLabelText("태어난 곳")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "출생 정보를 등급 계산에 쓰는 데 동의해요" })).toBeTruthy();
    expect(screen.queryByText("출생 정보를 풀이에 쓰는 데 동의해요")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /등급 보기/ }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("출생 정보를 등급 계산에 쓰는 데 먼저 동의해 주세요.");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /등급 보기/ }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ year: DEFAULT_SAJU_FORM.year, placeId: DEFAULT_SAJU_FORM.placeId }), {});
    expect(localStorage.getItem(SAJU_PROFILE_KEY)).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});
