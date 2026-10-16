// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATCH_FLOW_KEY } from "@/lib/premium/matchFlow";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { MatchForm } from "./MatchForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26 };
const stored = () => JSON.parse(sessionStorage.getItem(MATCH_FLOW_KEY) ?? "{}");
const primary = () => screen.getByRole("button", { name: /카드 5장 뽑으러 가기/ }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  router.push.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("우리 사이 궁합's form (Task 20)", () => {
  it("with a saved saju profile shows it as one line (고치기) and asks the other person's birth, without a birthplace", async () => {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(DEFAULT_SAJU_FORM));
    render(<MatchForm />);
    expect(await screen.findByRole("heading", { level: 1, name: "그 사람의 태어난 날을 알려 주세요" })).toBeTruthy();
    expect(screen.getByText(/1990년/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "나의 태어난 날 고치기" })).toBeTruthy();
    expect(screen.queryByLabelText("태어난 곳")).toBeNull();
    const label = screen.getByLabelText(/부르는 말/) as HTMLInputElement;
    expect(label.maxLength).toBe(10);
  });

  it("without one asks the user's own birth first, with every field", async () => {
    render(<MatchForm />);
    expect(await screen.findByRole("heading", { level: 1, name: "나의 태어난 날을 알려 주세요" })).toBeTruthy();
    expect(screen.getByLabelText("태어난 곳")).toBeTruthy();
  });

  it("keeps the gold button off until a relation is chosen and the consent box is ticked, then goes to the five cards; nothing enters the address", async () => {
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ me: DEFAULT_SAJU_FORM, partner: PARTNER, partnerLabel: "민지" }));
    window.history.replaceState(null, "", "/premium/match/new");
    render(<MatchForm />);
    expect(await screen.findByRole("heading", { level: 1, name: "어떤 사이인지 알려 주세요" })).toBeTruthy();
    expect(screen.getByText("상대 정보는 이 풀이를 만드는 데만 쓰고, 내 풀이 안에만 저장돼요.")).toBeTruthy();
    expect(primary().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "친구" }));
    expect(primary().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "상대에게 알리거나 동의를 받을 수 있는 사이에서만 입력할게요" }));
    expect(primary().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/고민 한 줄/), { target: { value: "요즘 연락이 뜸해요" } });
    fireEvent.click(primary());
    expect(stored()).toMatchObject({ relation: "friend", ack: true, concern: "요즘 연락이 뜸해요", partnerLabel: "민지" });
    expect(router.push).toHaveBeenCalledWith("/premium/match/draw");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/premium/match/new");
  });
});
