// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinFlow } from "./JoinFlow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const OPEN = { status: "open", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4 } as const;

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
    render(<JoinFlow state={{ status: "choosing", code: "K7M4QX", ownerNickname: "용우" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요" })).toBeTruthy();
    cleanup();
    render(<JoinFlow state={{ status: "alldone", code: "K7M4QX", ownerNickname: "용우" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님은 열두 별자리를 모두 채웠어요. 함께해 줘서 고마워요" })).toBeTruthy();
  });
});
