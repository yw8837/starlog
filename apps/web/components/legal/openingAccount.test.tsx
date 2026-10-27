// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { OPENING_LAST_DATE, OPENING_LAST_DAY } from "@/lib/config";
import { openingFreeText } from "@/lib/helpGuide";

/**
 * 오픈 기념 무료 per account until 2026-11-30 (owner 2026-10-27): the terms say it and show what changed while it runs, and the
 * privacy policy says how long the claim record is kept.
 */

const NOTICE = "2026년 10월 27일 바뀐 내용 · 오픈 기념 무료";

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

  it("privacy 3항: the claim record (the account's keyed id and the time) is kept until the event ends, through a deletion too, then destroyed", () => {
    const retention = render(<PrivacyPage />).container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain(
      "오픈 기념 무료를 받은 계정의 기록(카카오 회원번호나 Google 계정 식별값을 되돌릴 수 없게 바꾼 값과 받은 시각)은 계정마다 한 번만 드리기 위해 오픈 기념 무료가 끝나는 2026년 11월 30일까지 보관하고, 그 사이 탈퇴해도 그때까지 보관한 뒤 파기합니다.",
    );
  });
});
