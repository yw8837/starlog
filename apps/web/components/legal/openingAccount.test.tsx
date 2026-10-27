// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { OPENING_LAST_DATE, OPENING_LAST_DAY } from "@/lib/config";
import { openingFreeText } from "@/lib/helpGuide";
import { OPENING_ACCOUNT_DATE, koreanDate } from "@/lib/legal";

/**
 * 오픈 기념 무료 per account until 2026-11-30 (owner 2026-10-27): the terms say it and show what changed while it runs; the
 * privacy policy lists the claim record as member data (1항, 2항), kept as member data is (3항: destroyed on deletion), and
 * says what changed on top while it runs. Both notices are dated by lib/legal.ts OPENING_ACCOUNT_DATE alone.
 */

/** Dated by lib/legal.ts OPENING_ACCOUNT_DATE alone (the day the deploy went live): "2026년 10월 27일 바뀐 내용 · 오픈 기념 무료". */
const NOTICE = `${koreanDate(OPENING_ACCOUNT_DATE)} 바뀐 내용 · 오픈 기념 무료`;

describe("오픈 기념 무료 per account, in the policies", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-28T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ends on 11월 30일 (KST) on every screen that names the day", () => {
    expect(OPENING_LAST_DAY).toBe("11월 30일");
    expect(OPENING_LAST_DATE).toBe("2026년 11월 30일");
    expect(openingFreeText()).toBe("11월 30일까지 로그인한 계정마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료, 같은 기기에서는 한 번). 내 기록에 보관돼요(이어서 물어보기 제외).");
  });

  it("terms 제4조: once per logged-in account (once per device) until 2026-11-30 23:59 KST, no longer per device", () => {
    const service = render(<TermsPage />).container.querySelector("#service")?.textContent ?? "";
    expect(service).toContain(
      "운영자는 오픈 기념 무료로 2026년 11월 30일 23시 59분(한국 시간)까지 로그인한 계정마다 한 번(같은 기기에서는 한 번) 타로 전체 풀이를 무료로 제공합니다. 사주 전체 풀이는 무료로 제공하지 않습니다.",
    );
    expect(service).not.toContain("기기(브라우저)마다");
  });

  it("terms: a dated notice says what changed (login, once per account, the longer period) while it runs, and goes with it", () => {
    let container = render(<TermsPage />).container;
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.textContent?.includes(NOTICE));
    expect(notice).toBeTruthy();
    expect([...notice!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "오픈 기념 무료는 이제 카카오나 Google로 로그인해야 받을 수 있고, 기기(브라우저)마다가 아니라 로그인한 계정마다 한 번 드립니다. 같은 기기에서는 계정을 바꿔도 한 번만 받을 수 있습니다.",
      "기간을 2026년 10월 31일에서 2026년 11월 30일 23시 59분(한국 시간)까지로 늘렸습니다.",
    ]);
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-01T00:00:00+09:00"));
    container = render(<TermsPage />).container;
    expect(container.textContent).not.toContain(NOTICE);
  });

  it("privacy 3항: no keep of its own for the claim record (owner 2026-10-27): member data, destroyed on deletion", () => {
    const retention = render(<PrivacyPage />).container.querySelector("#retention")?.textContent ?? "";
    expect(retention).not.toContain("오픈 기념 무료를 받은");
    expect(retention).toContain("회원 정보는 탈퇴할 때까지 보관하고, 탈퇴하면 지체 없이 파기합니다.");
  });

  it("privacy 1항 and 2항: the claim record is a member item, for giving it once per account", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector("#items")?.textContent).toContain(
      "오픈 기념 무료를 받았는지와 받은 시각(2026년 11월 30일까지 진행하는 오픈 기념 무료를 계정마다 한 번만 드리기 위해)",
    );
    expect(container.querySelector("#purposes")?.textContent).toContain("오픈 기념 무료를 계정마다 한 번만 드리기");
  });

  it("privacy: a dated notice of the change on top while the event runs, leaving the 10/31 revision and the 시행일 as they were", () => {
    let container = render(<PrivacyPage />).container;
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.textContent?.startsWith(`${koreanDate(OPENING_ACCOUNT_DATE)} 바뀐 내용`));
    expect(notice?.textContent).toBe(`${koreanDate(OPENING_ACCOUNT_DATE)} 바뀐 내용오픈 기념 무료를 계정마다 한 번 드리기 위해 받은 여부와 시각을 보관해요. 탈퇴하면 함께 지워요.`);
    expect(container.textContent).toContain("개정 예정 · 2026년 10월 31일부터 시행");
    expect(container.querySelector('time[datetime="2026-10-28"]')).not.toBeNull();
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-01T00:00:00+09:00"));
    container = render(<PrivacyPage />).container;
    expect(container.textContent).not.toContain("받은 여부와 시각을 보관해요");
    expect(container.querySelector('time[datetime="2026-10-31"]')).not.toBeNull();
  });
});
