// @vitest-environment jsdom
import { gradeChartOf } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartFor } from "@/components/saju/useSajuChart";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, type SajuForm } from "@/lib/sajuForm";
import { GRADE_FIXED_LINE, GRADE_NOTICE, currentGradeYear, gradeForYear, gradeObservations, nextBrightLine } from "@/lib/sajuGrade";
import { GRADE_EXAMPLE_FORM, GradeView } from "./GradeView";

/**
 * /saju/grade (spec 2026-11-11 B, E, F C5): the card is computed in the browser; a saved profile shows its result first, none
 * shows the example (예시) with the fields under it. No request ever carries the birth data.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const OWN: SajuForm = { ...DEFAULT_SAJU_FORM, year: 1995, month: 6, day: 1, timeKnown: true, hour: 14, minute: 30 };
const chartOf = (form: SajuForm) => {
  const result = chartFor(form);
  if (!("chart" in result)) throw new Error("no chart");
  return result.chart;
};

/** Every request the screen makes (the premium status, the account): recorded, answered 404. */
let requests: string[] = [];
beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(`${String(input)} ${typeof init?.body === "string" ? init.body : ""}`);
    return new Response("{}", { status: 404 });
  });
  window.history.replaceState(null, "", "/saju/grade");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** No request names the birth data: its year, its date or the form's fields. */
const expectNoBirthInRequests = (form: SajuForm) => {
  for (const r of requests) {
    expect(r).not.toContain(String(form.year));
    expect(r).not.toMatch(/calendar|placeId|birth/);
  }
  expect(window.location.href).not.toContain(String(form.year));
};

const card = () => screen.getByRole("figure");

describe("GradeView", () => {
  it("the example is 1991-05-20, hour unknown: B in 2026 and A in 2027, the commonest grade first (not DEFAULT_SAJU_FORM's C)", () => {
    expect(GRADE_EXAMPLE_FORM).toMatchObject({ calendar: "solar", year: 1991, month: 5, day: 20, timeKnown: false, hour: null, minute: null });
    expect(DEFAULT_SAJU_FORM).toMatchObject({ year: 1990, month: 1, day: 1 });
    const gc = gradeChartOf(chartOf(GRADE_EXAMPLE_FORM));
    expect(gradeForYear(gc, 2026).grade).toBe("B");
    expect(gradeForYear(gc, 2027).grade).toBe("A");
    expect(gradeForYear(gradeChartOf(chartOf(DEFAULT_SAJU_FORM)), 2026).grade).toBe("C");
  });

  it("without a saved profile: the example card (예시) first, then the fields; consent saves the profile and shows the own card", async () => {
    render(<GradeView />);
    const year = currentGradeYear();
    const example = gradeForYear(gradeChartOf(chartOf(GRADE_EXAMPLE_FORM)), year);
    await waitFor(() => expect(card().textContent).toContain("예시"));
    expect(card().textContent).toContain(`${year} ${example.ko}년 · 올해의 사주 등급`);
    expect(card().textContent).toContain(example.nickname);
    expect(screen.getByText(/^1991년 5월 20일생\(시 모름\)으로 계산한 예시예요\./)).toBeTruthy();
    expect(screen.getByText(GRADE_FIXED_LINE)).toBeTruthy();
    // the fields: no 요즘 상황 chips, the grade's own consent
    const find = document.getElementById("find")!;
    expect(within(find).queryByRole("button", { name: /요즘 상황도 알려 주기/ })).toBeNull();
    const consent = within(find).getByRole("checkbox", { name: "출생 정보를 등급 계산에 쓰는 데 동의해요" });
    // fill the user's own birth: 1995-06-01 14:30
    fireEvent.change(within(find).getByLabelText("태어난 연도"), { target: { value: "1995" } });
    fireEvent.change(within(find).getByLabelText("태어난 월"), { target: { value: "6" } });
    fireEvent.change(within(find).getByLabelText("태어난 일"), { target: { value: "1" } });
    fireEvent.click(within(find).getByRole("button", { name: "알아요" }));
    fireEvent.change(within(find).getByLabelText("태어난 시"), { target: { value: "14" } });
    fireEvent.change(within(find).getByLabelText("태어난 분"), { target: { value: "30" } });
    fireEvent.click(within(find).getByRole("button", { name: "여성" }));
    fireEvent.click(consent);
    fireEvent.click(within(find).getByRole("button", { name: /내 등급 보기/ }));
    await waitFor(() => expect(card().textContent).not.toContain("예시"));
    const own = gradeForYear(gradeChartOf(chartOf(OWN)), year);
    expect(card().textContent).toContain(own.nickname);
    expect(JSON.parse(localStorage.getItem(SAJU_PROFILE_KEY)!)).toMatchObject({ year: 1995, month: 6, day: 1, hour: 14, minute: 30 });
    expectNoBirthInRequests(OWN);
  });

  /** Fills the example's fields with the user's own birth (1995-06-01 14:30) and submits them. */
  const submitOwn = () => {
    const find = document.getElementById("find")!;
    fireEvent.change(within(find).getByLabelText("태어난 연도"), { target: { value: "1995" } });
    fireEvent.change(within(find).getByLabelText("태어난 월"), { target: { value: "6" } });
    fireEvent.change(within(find).getByLabelText("태어난 일"), { target: { value: "1" } });
    fireEvent.click(within(find).getByRole("button", { name: "알아요" }));
    fireEvent.change(within(find).getByLabelText("태어난 시"), { target: { value: "14" } });
    fireEvent.change(within(find).getByLabelText("태어난 분"), { target: { value: "30" } });
    fireEvent.click(within(find).getByRole("button", { name: "여성" }));
    fireEvent.click(within(find).getByRole("checkbox"));
    fireEvent.click(within(find).getByRole("button", { name: /내 등급 보기/ }));
  };

  it("goes back to the card after the fields without throwing where scrollIntoView is missing (jsdom), and uses it where it is", async () => {
    // the frame runs at once, so a throw inside it fails this test instead of surfacing later as an unhandled error
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
    expect(Element.prototype.scrollIntoView).toBeUndefined();
    // React reports a throw in an event handler on window (reportError), not to the caller
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    try {
      render(<GradeView />);
      await waitFor(() => expect(card().textContent).toContain("예시"));
      expect(() => submitOwn()).not.toThrow();
      await waitFor(() => expect(card().textContent).not.toContain("예시"));
    } finally {
      window.removeEventListener("error", onError);
    }
    expect(errors).toEqual([]);
    cleanup();
    localStorage.clear();

    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      render(<GradeView />);
      await waitFor(() => expect(card().textContent).toContain("예시"));
      submitOwn();
      expect(scrolled).toHaveBeenCalledWith({ block: "start" });
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("with a saved profile: the result first, three rule-made lines, the next S·A year, the fixed line and the notice", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    expect(card().textContent).not.toContain("예시");
    const year = currentGradeYear();
    const gc = gradeChartOf(chartOf(OWN));
    for (const line of gradeObservations(gc, year)) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(nextBrightLine(gc, year))).toBeTruthy();
    expect(screen.getByText(GRADE_NOTICE)).toBeTruthy();
    // the form is folded behind 친구 생일로 해 보기
    expect(document.getElementById("find")?.querySelector("form")).toBeFalsy();
    expectNoBirthInRequests(OWN);
  });

  it("a chip changes the card to that year's grade and puts only ?y= in the address", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const target = currentGradeYear() + 2;
    const g = gradeForYear(gradeChartOf(chartOf(OWN)), target);
    const chip = screen.getByRole("button", { name: new RegExp(`^${target} ${g.ko} ${g.grade}$`) });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(card().textContent).toContain(`${target} ${g.ko}년 · 사주 등급`);
    expect(card().textContent).toContain(g.nickname);
    expect(window.location.search).toBe(`?y=${target}`);
    expectNoBirthInRequests(OWN);
  });

  it("opens on the year in ?y= when it is one of the ten chips", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    const target = currentGradeYear() + 3;
    window.history.replaceState(null, "", `/saju/grade?y=${target}`);
    render(<GradeView />);
    await waitFor(() => expect(card().textContent).toContain(`${target} `));
  });

  it("a friend's birth is shown without being saved; back to my own card in one tap", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "친구 생일로 해 보기" }));
    const find = document.getElementById("find")!;
    fireEvent.change(within(find).getByLabelText("태어난 연도"), { target: { value: "2001" } });
    fireEvent.change(within(find).getByLabelText("태어난 월"), { target: { value: "3" } });
    fireEvent.change(within(find).getByLabelText("태어난 일"), { target: { value: "15" } });
    fireEvent.click(within(find).getByRole("button", { name: "남성" }));
    fireEvent.click(within(find).getByRole("checkbox"));
    fireEvent.click(within(find).getByRole("button", { name: /친구 등급 보기/ }));
    await waitFor(() => expect(card().textContent).toContain("친구 생일로 본 등급"));
    expect(JSON.parse(localStorage.getItem(SAJU_PROFILE_KEY)!)).toMatchObject({ year: 1995 });
    fireEvent.click(screen.getByRole("button", { name: "내 등급으로 돌아가기" }));
    expect(card().textContent).not.toContain("친구 생일로 본 등급");
    expectNoBirthInRequests({ ...OWN, year: 2001 });
  });

  it("등급은 어떻게 나와요? loads the 상위 % only when opened, with the population wording", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    expect(screen.queryByText(/인구 통계가 아니에요/)).toBeNull();
    expect(card().textContent).not.toMatch(/%|위에서/);
    const details = screen.getByText("등급은 어떻게 나와요?").closest("details")!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    // S·A·B name a number with the tie rule; C names its band (review 6)
    await waitFor(() => expect(screen.getByText(/가능한 사주 조합 561,600개 가운데 (?:위에서 \d+%.*값이 같으면 같은 등급으로 묶어요|C 구간\(아래쪽 30% 안팎\))/)).toBeTruthy());
    expect(within(details).getByText(/70%까지 B, 나머지는 C예요\. 값이 같으면 같은 등급으로 묶어요\./)).toBeTruthy();
    expect(within(details).getByText(/starlog-grade-v1/)).toBeTruthy();
    expect(within(details).getByRole("link", { name: /규칙 전체 보기/ }).getAttribute("href")).toBe("/saju/grade/how");
  });

  it("hides the locked 이 등급인 이유 block while NEXT_PUBLIC_SAJU_GRADE is off (the default)", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    expect(screen.queryByText(/이 등급인 이유/)).toBeNull();
    expect(requests.some((r) => r.includes("/api/me"))).toBe(false);
  });

  it("with the flag on: the five locked subtitles and 곧 열려요, no buy button", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_GRADE", "on");
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const block = screen.getByRole("region", { name: "이 등급인 이유 · 5개 중 0개 공개" });
    for (const title of ["가장 크게 힘이 된 것", "아직 덜 채워진 칸", "언제, 무엇이 달라지나", "올해 이렇게 써 보기", "확인해 볼 신호"]) {
      expect(within(block).getByText(title)).toBeTruthy();
    }
    expect(within(block).getByText("곧 열려요")).toBeTruthy();
    expect(within(block).getByText(/1,900원 예정/)).toBeTruthy();
    expect(within(block).queryByRole("button")).toBeNull();
    expect(within(block).queryByRole("link")).toBeNull();
  });

  it("never offers the 이유 block on the example: the fields follow the example card right away", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_GRADE", "on");
    render(<GradeView />);
    await waitFor(() => expect(card().textContent).toContain("예시"));
    expect(screen.queryByText(/이 등급인 이유/)).toBeNull();
    const order = [card(), document.getElementById("find")!, screen.getByRole("group", { name: "10년 등급" })];
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shares my card by its year and grade only: 친구는 어떤 등급일까? and the story picture; never the example's or a friend's", async () => {
    const shared: ShareData[] = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void shared.push(data) });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const year = currentGradeYear();
    const g = gradeForYear(gradeChartOf(chartOf(OWN)), year);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /친구는 어떤 등급일까\?/ })));
    expect(shared).toEqual([{ title: "스타로그", text: `나는 올해 ${g.grade} · ${g.nickname}. 너는?`, url: `https://starlog.yeolmaeapps.kr/saju/grade/${year}-${g.grade.toLowerCase()}` }]);
    expect(screen.getByRole("button", { name: "스토리용 이미지(9:16)" })).toBeTruthy();
    expect(screen.getByText("이름·생년월일은 들어가지 않아요")).toBeTruthy();
    cleanup();
    localStorage.clear();
    render(<GradeView />);
    await waitFor(() => expect(card().textContent).toContain("예시"));
    expect(screen.queryByRole("button", { name: /친구는 어떤 등급일까/ })).toBeNull();
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
  });

  it("links the next readings below, the 사주 전체 풀이 at its price", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const saju = screen.getByRole("link", { name: /사주 전체 풀이/ });
    expect(saju.getAttribute("href")).toBe("/saju/chart");
    expect(saju.textContent).toContain("4,900원");
  });

  it("never says 정확, 과학적, 베타 or a model's name, and nothing about a person's worth", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_GRADE", "on");
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    const { container } = render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/정확|과학적|베타|첫 풀이|하루\s?\d|Claude|Anthropic|GPT|OpenAI|Gemini|할인|마감|남은 시간/);
    expect(text).not.toMatch(/(좋은|나쁜|부족한|못난)\s?(사람|사주|명식|팔자)/);
  });
});
