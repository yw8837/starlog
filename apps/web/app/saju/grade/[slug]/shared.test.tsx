// @vitest-environment jsdom
import { gradeChartOf } from "@starlog/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartFor } from "@/components/saju/useSajuChart";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, type SajuForm } from "@/lib/sajuForm";
import { GRADE_SLUGS, compareLine, gradeForYear } from "@/lib/sajuGrade";
import { GradeVisitor } from "./GradeVisitor";
import SharedGradePage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

/** /saju/grade/<year>-<grade> (spec 2026-11-11 C): a shared card knows its year and grade only; a visitor finds theirs in one tap. */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => router }));

const OWN: SajuForm = { ...DEFAULT_SAJU_FORM, year: 1995, month: 6, day: 1, timeKnown: true, hour: 14, minute: 30 };
const gradeChart = (form: SajuForm) => {
  const result = chartFor(form);
  if (!("chart" in result)) throw new Error("no chart");
  return gradeChartOf(result.chart);
};

let requests: string[] = [];
beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(`${String(input)} ${typeof init?.body === "string" ? init.body : ""}`);
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as PageProps<"/saju/grade/[slug]">;

describe("the shared card's page", () => {
  it("is built for the 40 slugs, still rendered on demand, and 404s anything else", async () => {
    expect(generateStaticParams()).toEqual(GRADE_SLUGS.map((slug) => ({ slug })));
    expect(dynamicParams).toBe(true);
    for (const slug of ["2025-s", "2026-d", "1995-06-01", "2026-s-1995"]) await expect(SharedGradePage(params(slug))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("previews with its own picture, stays out of search, and says only the year and the grade", async () => {
    const meta = await generateMetadata(params("2028-a"));
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: "/api/og/saju-grade/2028-a", width: 1200, height: 630 })]);
    expect(String(meta.title)).toContain("2028 무신년 A");
    render(await SharedGradePage(params("2028-a")));
    const card = screen.getAllByRole("figure")[0]!;
    expect(card.textContent).toContain("2028 무신년");
    expect(card.textContent).toContain("차오르는 달 사주주");
    expect(screen.getByRole("link", { name: /규칙 보기/ }).getAttribute("href")).toBe("/saju/grade/how");
  });
});

describe("GradeVisitor", () => {
  it("with a profile on this device: 내 등급 보기 shows mine for the same year in one tap, with the compare line", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(OWN));
    render(<GradeVisitor year={2028} grade="A" />);
    fireEvent.click(await screen.findByRole("button", { name: "내 등급 보기" }));
    const mine = gradeForYear(gradeChart(OWN), 2028);
    expect(screen.getByText(compareLine("A", gradeChart(OWN), 2028))).toBeTruthy();
    expect(screen.getByRole("figure").textContent).toContain(mine.nickname);
    expect(screen.getByRole("link", { name: /내 등급 자세히 보기/ }).getAttribute("href")).toBe("/saju/grade?y=2028");
    for (const r of requests) expect(r).not.toContain("1995");
  });

  it("without one: 내 등급 보기 goes to #find on the same page; the birth with consent gives the compare line", async () => {
    render(<GradeVisitor year={2026} grade="S" />);
    const go = await screen.findByRole("link", { name: "내 등급 보기" });
    expect(go.getAttribute("href")).toBe("#find");
    const find = document.getElementById("find")!;
    fireEvent.change(within(find).getByLabelText("태어난 연도"), { target: { value: "1995" } });
    fireEvent.change(within(find).getByLabelText("태어난 월"), { target: { value: "6" } });
    fireEvent.change(within(find).getByLabelText("태어난 일"), { target: { value: "1" } });
    fireEvent.click(within(find).getByRole("button", { name: "알아요" }));
    fireEvent.change(within(find).getByLabelText("태어난 시"), { target: { value: "14" } });
    fireEvent.change(within(find).getByLabelText("태어난 분"), { target: { value: "30" } });
    fireEvent.click(within(find).getByRole("button", { name: "여성" }));
    fireEvent.click(within(find).getByRole("checkbox", { name: "출생 정보를 등급 계산에 쓰는 데 동의해요" }));
    fireEvent.click(within(find).getByRole("button", { name: /내 등급 보기/ }));
    await waitFor(() => expect(screen.getByText(compareLine("S", gradeChart(OWN), 2026))).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(SAJU_PROFILE_KEY)!)).toMatchObject({ year: 1995 });
    for (const r of requests) expect(r).not.toContain("1995");
  });
});
