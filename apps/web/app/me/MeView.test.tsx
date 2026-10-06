// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { clearChapters, listChapters, saveChapter } from "@/lib/storage/chapters";
import { MeView } from "./MeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

// jsdom has no <dialog> methods; Modal calls showModal()/close().
beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: true, login: true, owner: false, user: null })));
  saveChapter({ kind: "tarot", question: "기기 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t" });
  saveChapter({ kind: "tarot", question: "계정 질문", conditions: [], note: "", cards: [card], reading: reading as never, chapterToken: "t", serverId: "abcdefghij0123456789" });
  sessionStorage.setItem("starlog.account-synced", "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  clearChapters();
  sessionStorage.clear();
});

describe("MeView menu", () => {
  it("puts 초대코드로 참여 right under 내 기록, closed", async () => {
    render(<MeView status={null} />);
    const menu = await screen.findByRole("navigation", { name: "계정 메뉴" });
    const rows = [...menu.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows.slice(0, 3)).toEqual([expect.stringMatching(/^내 기록/), "초대코드로 참여", "알림 설정준비 중"]);
    expect(screen.getByRole("button", { name: "초대코드로 참여" }).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("MeView logged out while sales are open", () => {
  it("offers the login page, naming no one provider (Kakao and Google are both there)", async () => {
    render(<MeView status={null} />);
    expect((await screen.findByRole("link", { name: "로그인하기" })).getAttribute("href")).toBe("/login?next=%2Fme");
    expect(screen.queryByText("카카오로 로그인")).toBeNull();
  });
});

describe("MeView after the account was deleted", () => {
  it("takes the account's readings off this device and says so; readings opened here stay", async () => {
    render(<MeView status="탈퇴했어요. 그동안 고마웠어요." accountDeleted />);
    expect(await screen.findByText("탈퇴했어요. 그동안 고마웠어요. 이 기기에 받아 둔 계정 풀이도 지웠어요.")).toBeTruthy();
    expect(listChapters().map((chapter) => (chapter.kind === "tarot" ? chapter.question : chapter.title))).toEqual(["기기 질문"]);
    expect(sessionStorage.getItem("starlog.account-synced")).toBeNull();
  });

  it("leaves this device's readings alone on any other visit", async () => {
    render(<MeView status={null} />);
    await waitFor(() => expect(screen.getByRole("link", { name: /내 기록/ })).toBeTruthy());
    expect(listChapters()).toHaveLength(2);
    expect(sessionStorage.getItem("starlog.account-synced")).toBe("1");
  });
});
