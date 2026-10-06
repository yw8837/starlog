// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { clearSajuProfile, saveSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
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

const pick = (label: string, value: number) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
const pickDate = (year: number, month: number, day: number) => {
  pick("태어난 연도", year);
  pick("태어난 월", month);
  pick("태어난 일", day);
};
const consent = () => fireEvent.click(screen.getByLabelText("출생 정보를 풀이에 쓰는 데 동의해요"));
const submit = () => fireEvent.click(screen.getByRole("button", { name: "명식 보기" }));

describe("SajuForm takes no free text", () => {
  it("has no concern field, even with the status chips open", () => {
    render(<SajuForm />);
    fireEvent.click(screen.getByRole("button", { name: /요즘 상황도 알려 주기/ }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("W-07: a first visit starts with the date and the gender empty", () => {
  it("shows 연도·월·일 and no gender pressed, 1–31 days, 서울, and no echo line yet", () => {
    render(<SajuForm />);
    for (const label of ["태어난 연도", "태어난 월", "태어난 일"]) expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe("");
    for (const name of ["여성", "남성"]) expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("태어난 일").querySelectorAll("option:not([disabled])")).toHaveLength(31);
    expect(screen.queryByText(/^→ /)).toBeNull();
    expect((screen.getByLabelText("태어난 곳") as HTMLSelectElement).value).toBe("seoul");
  });

  it("on 명식 보기 with nothing picked: says what is missing, focuses the year, saves nothing", () => {
    render(<SajuForm />);
    submit();
    expect(screen.getByText("태어난 날을 골라 주세요.")).toBeTruthy();
    expect(screen.getByText("성별을 골라 주세요.")).toBeTruthy();
    expect(screen.getByText("출생 정보를 풀이에 쓰는 데 먼저 동의해 주세요.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("태어난 연도"));
    expect(router.push).not.toHaveBeenCalled();
    expect(localStorage.getItem("starlog.saju-profile")).toBeNull();
    expect((screen.getByRole("button", { name: "명식 보기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("focuses the gender when only it is missing, then goes on once it is picked", () => {
    render(<SajuForm />);
    pickDate(1992, 8, 3);
    expect(screen.getByText("→ 1992년 8월 3일 (양력)")).toBeTruthy();
    consent();
    submit();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "여성" }));
    fireEvent.click(screen.getByRole("button", { name: "남성" }));
    submit();
    expect(router.push).toHaveBeenCalledWith("/saju/chart");
    expect(JSON.parse(localStorage.getItem("starlog.saju-profile")!)).toMatchObject({ year: 1992, month: 8, day: 3, gender: "male", placeId: "seoul" });
  });

  it("starts filled from a saved profile", () => {
    saveSajuProfile({ ...DEFAULT_SAJU_FORM, year: 1993, month: 8, day: 17, gender: "male" });
    render(<SajuForm />);
    expect((screen.getByLabelText("태어난 연도") as HTMLSelectElement).value).toBe("1993");
    expect(screen.getByRole("button", { name: "남성" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("→ 1993년 8월 17일 (양력)")).toBeTruthy();
  });
});

describe("the selects before hydration", () => {
  // The first render after hydration (the saved profile and chips read) puts the draft's values back on
  // every select, so a pick made before it was lost, and a year read back as "" became year 0 (e2e on next dev).
  it("take no pick until the form is hydrated, then take one", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(<SajuForm />);
    const selects = () => ["태어난 연도", "태어난 월", "태어난 일", "태어난 곳"].map((label) => (screen.getByLabelText(label) as HTMLSelectElement).disabled);
    expect(selects()).toEqual([true, true, true, true]);

    const recovered: unknown[] = [];
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <SajuForm />, { onRecoverableError: (error) => recovered.push(error) });
    });
    expect(recovered).toEqual([]);
    expect(selects()).toEqual([false, false, false, false]);
    pickDate(1992, 8, 3);
    expect(screen.getByText("→ 1992년 8월 3일 (양력)")).toBeTruthy();
    act(() => root?.unmount());
    container.remove();
  });
});
