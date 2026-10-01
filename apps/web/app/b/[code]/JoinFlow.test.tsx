// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { JoinFlow } from "./JoinFlow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const OPEN = { status: "open", kind: "open", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4, earlier: null } as const;
const RESULT = {
  nickname: "하늘", score: 87, parts: [{ id: "stem-generate" as const, points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" }], completed: false,
  sign: "aries" as const, slot: 1, ownerNickname: "용우", card: { cardId: "cups-02", orientation: "upright" as const }, bondLine: "요즘 두 사람 사이엔 ‘마음을 주고받음’의 기운이 흘러요",
};

describe("JoinFlow", () => {
  it("names the owner's constellation and warns that the nickname shows on the share image", () => {
    render(<JoinFlow state={OPEN} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님의 양자리에 별이 되어 주세요" })).toBeTruthy();
    expect(screen.getByText("용우님이 별자리를 공유하면 이 닉네임이 이미지에 보여요")).toBeTruthy();
  });

  it("does not move on until the birth date is picked (no default date)", () => {
    render(<JoinFlow state={OPEN} />);
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "하늘" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "카드 고르러 가기" }));
    expect(screen.getByText("생년월일을 끝까지 골라 주세요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "바로 펼치기" })).toBeNull();

    fireEvent.change(screen.getByLabelText("태어난 연도"), { target: { value: "1992" } });
    fireEvent.change(screen.getByLabelText("태어난 월"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("태어난 일"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "카드 고르러 가기" }));
    expect(screen.getByRole("heading", { name: "고양이가 카드를 섞고 있어요" })).toBeTruthy();
  });

  it("answers an unknown code and an owner between signs plainly", () => {
    render(<JoinFlow state={{ status: "bad" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "코드를 다시 확인해 주세요" })).toBeTruthy();
    cleanup();
    render(<JoinFlow state={{ status: "choosing", kind: "choosing", code: "K7M4QX", ownerNickname: "용우", earlier: null }} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요" })).toBeTruthy();
    cleanup();
    render(<JoinFlow state={{ status: "alldone", kind: "alldone", code: "K7M4QX", ownerNickname: "용우", earlier: null }} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님은 열두 별자리를 모두 채웠어요. 함께해 줘서 고마워요" })).toBeTruthy();
  });

  it("shows the owner their own code instead of the form", () => {
    render(<JoinFlow state={{ status: "self", kind: "self", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4 }} />);
    expect(screen.getByRole("heading", { level: 1, name: "내 초대코드예요" })).toBeTruthy();
    expect(screen.getByText("K7M4QX")).toBeTruthy();
    expect(screen.getByRole("button", { name: "초대하기" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "닉네임" })).toBeNull();
  });

  it("shows a friend who already joined their result on reload, not the empty form", () => {
    render(<JoinFlow state={{ status: "joined", kind: "joined", code: "K7M4QX", result: RESULT }} />);
    expect(screen.getByRole("heading", { level: 1, name: "이미 양자리에 별이 되어 있어요" })).toBeTruthy();
    expect(screen.getByText("87")).toBeTruthy();
    expect(screen.getByText("두 분의 일간이 서로 살려 주는 사이예요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "나도 내 별자리 만들기" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "닉네임" })).toBeNull();
  });

  it("notes an earlier star above the form for the next sign", () => {
    render(<JoinFlow state={{ ...OPEN, sign: "taurus", filled: 0, slots: 5, earlier: { ...RESULT, completed: true } }} />);
    expect(screen.getByText("이미 양자리에 별이 됐어요")).toBeTruthy();
    expect(screen.getByText("결과 보기")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "용우님의 황소자리에 별이 되어 주세요" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "닉네임" })).toBeTruthy();
  });

  it("fills a friend's birth date from their own saved saju profile, and leaves it empty without one", async () => {
    window.localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify({
      calendar: "solar", year: 1992, month: 8, day: 3, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "male", placeId: "busan",
    }));
    render(<JoinFlow state={OPEN} />);
    expect(await screen.findByText("저장된 사주 정보로 채웠어요")).toBeTruthy();
    const value = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;
    expect([value("태어난 연도"), value("태어난 월"), value("태어난 일")]).toEqual(["1992", "8", "3"]);
    expect(screen.getByRole("textbox", { name: "닉네임" }).getAttribute("placeholder")).toBe("예: 불꽃속성 알감자");
    cleanup();
    window.localStorage.clear();
    render(<JoinFlow state={OPEN} />);
    expect((screen.getByLabelText("태어난 연도") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText("저장된 사주 정보로 채웠어요")).toBeNull();
  });
});
