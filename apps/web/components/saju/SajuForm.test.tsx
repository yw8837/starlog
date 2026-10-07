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

describe("윤달: 평달 / 윤달 / 모름 for lunar dates", () => {
  const leapGroup = () => screen.queryByRole("group", { name: "평달 또는 윤달" });
  const pressed = (name: string) => screen.getByRole("button", { name, pressed: true });

  it("offers the three for 음력 only, 평달 first, and echoes 모름", () => {
    render(<SajuForm />);
    expect(leapGroup()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "음력" }));
    expect([...leapGroup()!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["평달", "윤달", "모름"]);
    expect(pressed("평달")).toBeTruthy();
    pickDate(1990, 1, 1);
    fireEvent.click(screen.getByRole("button", { name: "모름" }));
    expect(screen.getByText("→ 1990년 1월 1일 (음력 · 윤달 모름)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "윤달" }));
    expect(screen.getByText("→ 1990년 윤1월 1일 (음력)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "양력" }));
    expect(leapGroup()).toBeNull();
  });

  it("saves 모름 with the profile", () => {
    render(<SajuForm />);
    fireEvent.click(screen.getByRole("button", { name: "음력" }));
    pickDate(2023, 2, 15);
    fireEvent.click(screen.getByRole("button", { name: "모름" }));
    fireEvent.click(screen.getByRole("button", { name: "여성" }));
    consent();
    submit();
    expect(router.push).toHaveBeenCalledWith("/saju/chart");
    expect(JSON.parse(localStorage.getItem("starlog.saju-profile")!)).toMatchObject({ calendar: "lunar", year: 2023, month: 2, day: 15, isLeapMonth: false, leapMonthUnknown: true });
  });
});

describe("태어난 곳: every 시·군, grouped by 시·도", () => {
  it("credits OpenStreetMap under the select (ODbL), linking its copyright page in a new tab so the form stays", () => {
    render(<SajuForm />);
    const link = screen.getByRole("link", { name: "© OpenStreetMap 기여자" });
    expect(link.getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
    expect([link.getAttribute("target"), link.getAttribute("rel")]).toEqual(["_blank", "noopener noreferrer"]);
    expect(link.closest("p")?.textContent).toBe("출생지 좌표 © OpenStreetMap 기여자");
    // right under the select
    expect(screen.getByLabelText("태어난 곳").closest("span")?.nextElementSibling).toBe(link.closest("p"));
  });

  const place = () => screen.getByLabelText("태어난 곳") as HTMLSelectElement;

  it("lists 161 places in 10 groups and saves the picked 시·군", () => {
    render(<SajuForm />);
    expect([...place().querySelectorAll("optgroup")].map((g) => g.label)).toEqual(["특별시·광역시", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);
    expect(place().querySelectorAll("option")).toHaveLength(161);
    fireEvent.change(place(), { target: { value: "gyeongbuk-pohang" } });
    expect(place().selectedOptions[0]?.textContent).toBe("경북 포항");
    pickDate(1992, 8, 3);
    fireEvent.click(screen.getByRole("button", { name: "남성" }));
    consent();
    submit();
    expect(JSON.parse(localStorage.getItem("starlog.saju-profile")!)).toMatchObject({ placeId: "gyeongbuk-pohang" });
  });

  it("shows a profile saved with a 시·도 id as the city it stood for, and keeps the id until another pick", () => {
    saveSajuProfile({ ...DEFAULT_SAJU_FORM, year: 1993, month: 8, day: 17, gender: "male", placeId: "gyeongbuk" });
    render(<SajuForm />);
    expect(place().value).toBe("gyeongbuk-andong");
    expect(place().selectedOptions[0]?.textContent).toBe("경북 안동");
    consent();
    submit();
    expect(JSON.parse(localStorage.getItem("starlog.saju-profile")!)).toMatchObject({ placeId: "gyeongbuk" });
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
