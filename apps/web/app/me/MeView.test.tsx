// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { clearBetaUsage, markFreeUsedUp } from "@/lib/storage/betaUsage";
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
    // F-13: no 알림 설정 · 준비 중 row.
    expect(rows.slice(0, 3)).toEqual([expect.stringMatching(/^내 기록/), "초대코드로 참여", "이용약관"]);
    expect(menu.textContent).not.toMatch(/알림 설정|준비 중/);
    expect(screen.getByRole("button", { name: "초대코드로 참여" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens 문의하기 as a mail to the address in the footer's business info, no longer 준비 중 (QA-16)", async () => {
    render(<MeView status={null} />);
    const menu = await screen.findByRole("navigation", { name: "계정 메뉴" });
    const contact = within(menu).getByRole("link", { name: "문의하기" });
    expect(contact.getAttribute("href")).toBe(`mailto:${SITE.business.email}`);
    expect(contact.textContent).not.toContain("준비 중");
  });
});

describe("MeView card design", () => {
  it("offers 카드 디자인 after the saju info and before the menu", async () => {
    render(<MeView status={null} />);
    const saju = await screen.findByRole("region", { name: "내 사주 정보" });
    const design = screen.getByRole("region", { name: "카드 디자인" });
    const menu = screen.getByRole("navigation", { name: "계정 메뉴" });
    expect(saju.compareDocumentPosition(design) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(design.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "앞면" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "뒷면" })).toBeTruthy();
  });
});

describe("MeView logged out while sales are open", () => {
  afterEach(() => {
    clearBetaUsage();
    vi.useRealTimers();
  });

  it("offers the login page, naming no one provider (Kakao and Google are both there)", async () => {
    render(<MeView status={null} />);
    expect((await screen.findByRole("link", { name: "로그인하기" })).getAttribute("href")).toBe("/login?next=%2Fme");
    expect(screen.queryByText("카카오로 로그인")).toBeNull();
  });

  it("still names 오픈 기념 무료 until it ends, beside the login (F-17)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-14T03:00:00Z"));
    render(<MeView status={null} />);
    expect(await screen.findByRole("link", { name: "로그인하기" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "오픈 기념 무료" })).toBeTruthy();
    expect(screen.getByText("10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 이 기기에서 보고 보관만 할 수 있어요(이어서 물어보기·공유 제외).")).toBeTruthy();
    expect(screen.getByText("아직 무료로 열 수 있어요")).toBeTruthy();
    cleanup();
    resetAccountForTests();
    vi.setSystemTime(Date.parse("2026-10-31T15:00:00Z"));
    render(<MeView status={null} />);
    expect(await screen.findByRole("link", { name: "로그인하기" })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/오픈 기념|무료로 열/));
  });
});

describe("MeView logged out while sales are closed (오픈 기념 무료)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-14T03:00:00Z"));
  });
  afterEach(() => {
    clearBetaUsage();
    vi.useRealTimers();
  });

  it("names 오픈 기념 무료 with its rule and whether this device has used it, with no daily refill", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: false, login: false, owner: false, user: null })));
    render(<MeView status={null} />);
    expect(await screen.findByRole("heading", { name: "오픈 기념 무료" })).toBeTruthy();
    expect(screen.getByText("10월 31일까지 기기마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료). 이 기기에서 보고 보관만 할 수 있어요(이어서 물어보기·공유 제외).")).toBeTruthy();
    expect(screen.getByText("아직 무료로 열 수 있어요")).toBeTruthy();
    cleanup();
    resetAccountForTests();
    markFreeUsedUp();
    render(<MeView status={null} />);
    expect(await screen.findByText("이 기기에서는 이미 무료로 열었어요")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/첫 이용|다시 채워져요/);
  });

  it("promises nothing free once 오픈 기념 무료 ended (11월 1일 0시 KST)", async () => {
    vi.setSystemTime(Date.parse("2026-10-31T15:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: false, login: true, owner: false, user: null })));
    render(<MeView status={null} />);
    expect(await screen.findByRole("link", { name: "결제한 풀이가 있다면 로그인" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/오픈 기념|무료로 열/);
  });
});

describe("MeView when 내 정보 cannot be loaded (F-11)", () => {
  it("says so with 다시 시도 instead of showing a logged-in member the logged-out view, and recovers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "UPSTREAM" }, { status: 500 })));
    render(<MeView status={null} />);
    expect(await screen.findByRole("heading", { name: "내 정보를 불러오지 못했어요" })).toBeTruthy();
    expect(screen.queryByText("로그인 없이, 기록은 이 기기에 보관돼요")).toBeNull();
    expect(screen.queryByRole("heading", { name: "오픈 기념 무료" })).toBeNull();
    expect(screen.queryByRole("link", { name: "로그인하기" })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: true, login: true, owner: false, user: { nickname: "별빛", gift: null, unused: [], opening: [] } })));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "별빛" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "내 정보를 불러오지 못했어요" })).toBeNull();
  });
});

describe("MeView after the account was deleted", () => {
  it("takes the account's readings off this device and says so; readings opened here stay", async () => {
    render(<MeView status="탈퇴했어요. 그동안 고마웠어요." accountDeleted />);
    expect(await screen.findByText("탈퇴했어요. 그동안 고마웠어요. 이 기기에 받아 둔 계정 풀이도 지웠어요.")).toBeTruthy();
    expect(listChapters().map((chapter) => (chapter.kind === "tarot" ? chapter.question : chapter.kind === "saju" ? chapter.title : chapter.kind))).toEqual(["기기 질문"]);
    expect(sessionStorage.getItem("starlog.account-synced")).toBeNull();
  });

  it("leaves this device's readings alone on any other visit", async () => {
    render(<MeView status={null} />);
    await waitFor(() => expect(screen.getByRole("link", { name: /내 기록/ })).toBeTruthy());
    expect(listChapters()).toHaveLength(2);
    expect(sessionStorage.getItem("starlog.account-synced")).toBe("1");
  });
});
