// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { JoinFlow } from "./JoinFlow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const OPEN = { status: "open", kind: "open", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4, earlier: null, myNickname: null, scoresPrivate: false } as const;
const RESULT = {
  nickname: "하늘", score: 87, parts: [{ id: "stem-generate" as const, points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" }], completed: false,
  sign: "aries" as const, slot: 1, starId: "star0123456789abcdef", ownerNickname: "용우", card: { cardId: "cups-02", orientation: "upright" as const }, bondLine: "요즘 두 사람 사이엔 ‘마음을 주고받음’의 기운이 흘러요",
};

describe("JoinFlow", () => {
  it("names the owner's constellation and warns that the nickname shows on the share image", () => {
    render(<JoinFlow state={OPEN} />);
    expect(screen.getByRole("heading", { level: 1, name: "용우님의 양자리에 별이 되어 주세요" })).toBeTruthy();
    // A shared constellation shows the nickname and the friend's score on its link and image (owner 2026-10-23).
    expect(screen.getByText("용우님이 별자리를 공유하면 내 닉네임과 용우님과의 인연 점수가 공유 링크와 이미지에 보여요.")).toBeTruthy();
  });

  it("tells the friend, right above the consent checkbox and as its description, that the nickname and the score may show on the owner's share and the birth date is not stored", () => {
    render(<JoinFlow state={OPEN} />);
    const note = screen.getByText("내 닉네임과 용우님과의 인연 점수가 용우님의 별자리 공유 링크와 이미지에 나올 수 있어요. 생년월일은 저장하지 않아요.");
    const consent = screen.getByRole("checkbox");
    expect(note.id).not.toBe("");
    expect(consent.getAttribute("aria-describedby")?.split(" ")).toContain(note.id);
    // above the checkbox, in the same group, with nothing between them
    expect(note.nextElementSibling).toBe(consent.closest("label"));
  });

  it("in a constellation whose scores never show (scores_private), says only the nickname shows, and the checkbox agrees to that (review 2026-10-23)", () => {
    render(<JoinFlow state={{ ...OPEN, scoresPrivate: true }} />);
    expect(screen.getAllByText("용우님이 별자리를 공유하면 내 닉네임이 공유 링크와 이미지에 보여요. 인연 점수는 보이지 않아요.").length).toBeGreaterThan(0);
    expect(screen.getByText("내 닉네임이 용우님의 별자리 공유 링크와 이미지에 나올 수 있어요. 인연 점수는 넣지 않아요. 생년월일은 저장하지 않아요.")).toBeTruthy();
    expect(screen.getByRole("checkbox").closest("label")?.textContent).toContain("만 14세 이상이고, 닉네임과 인연 점수가 용우님의 별자리에 남고 용우님이 공유하면 닉네임이 보이는 데 동의해요");
    expect(document.body.textContent).not.toContain("인연 점수가 공유 링크와 이미지에 보여요");
  });

  it("the checkbox agrees to the nickname and score showing when the owner shares (review 2026-10-23)", () => {
    render(<JoinFlow state={OPEN} />);
    expect(screen.getByRole("checkbox").closest("label")?.textContent).toContain("만 14세 이상이고, 닉네임과 인연 점수가 용우님의 별자리에 남고 용우님이 공유하면 닉네임과 점수가 보이는 데 동의해요");
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
    expect(screen.getByRole("heading", { name: "타로로가 카드를 섞고 있어요" })).toBeTruthy();
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

  it("tells the owner on their own link that it is their invite link, and sends them to their constellation first (spec §11)", () => {
    render(<JoinFlow state={{ status: "self", kind: "self", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4 }} />);
    expect(screen.getByRole("heading", { level: 1, name: "내 초대 링크예요" })).toBeTruthy();
    const go = screen.getByRole("link", { name: "내 별자리로 가기" });
    expect(go.getAttribute("href")).toBe("/bonds");
    expect(go.className).toMatch(/primary/);
    expect(screen.getByRole("button", { name: "다른 앱으로 보내기" })).toBeTruthy();
    // no code to copy here: the link is the invite (owner 2026-10-02)
    expect(screen.queryByText("K7M4QX")).toBeNull();
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

  it("shows the friend's score big on a 55–99 gauge with the table of what made it, and shares the friend's own result (owner 2026-10-23)", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return new Response(JSON.stringify({ id: "bondshare001", path: "/s/bondshare001" }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
    proto.showModal ??= function (this: HTMLElement) {
      this.setAttribute("open", "");
    };
    try {
      render(<JoinFlow state={{ status: "joined", kind: "joined", code: "K7M4QX", result: RESULT }} />);
      expect(screen.getByRole("meter", { name: "인연 점수" }).getAttribute("aria-valuenow")).toBe("87");
      const table = screen.getByRole("table", { name: "점수를 만든 항목" });
      expect(within(table).getByText("+10")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "내 인연 공유하기" }));
      const sheet = screen.getByRole("dialog", { name: "결과 공유하기", hidden: true });
      expect(sheet.textContent).toContain("내 인연 카드와 인연 점수가 보여요. 점수 근거와 생년월일, 남긴 한 줄은 담기지 않아요.");
      await act(async () => {
        fireEvent.click(within(sheet).getByRole("button", { name: "공유 링크 만들기", hidden: true }));
      });
      expect(calls).toEqual([{ url: "/api/share/bond", body: { starId: "star0123456789abcdef" } }]);
      expect(sheet.textContent).not.toContain("점수 근거가 보여요");
      expect(sheet.textContent).toContain("/s/bondshare001");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("JoinFlow fills what this device already knows (owner 2026-10-23)", () => {
  it("starts the nickname with the one this device used before", () => {
    render(<JoinFlow state={{ ...OPEN, myNickname: "하늘별" }} />);
    expect((screen.getByRole("textbox", { name: "닉네임" }) as HTMLInputElement).value).toBe("하늘별");
  });
});
