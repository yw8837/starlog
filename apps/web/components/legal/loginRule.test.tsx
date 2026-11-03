// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { LOGIN_RULE_DATE, koreanDate } from "@/lib/legal";

/**
 * Every AI reading result needs a login (owner 2026-11-04, final): the terms (제6조 2호) and the privacy policy change only
 * what became untrue, and say what changed, dated by lib/legal.ts LOGIN_RULE_DATE, on top for 30 days (it went live before
 * the 30 days' notice the terms promise, as the 오픈 기념 무료 change of 2026-10-27 did).
 */

const NOTICE = `${koreanDate(LOGIN_RULE_DATE)} 바뀐 내용`;

describe("AI 풀이 needs a login, in the policies", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-04T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("terms: 제6조 2호 says what a visitor may use and that the 맛보기 and 오늘의 한 장 need a login; a dated notice says so for 30 days", () => {
    let container = render(<TermsPage />).container;
    const members = container.querySelector("#members")?.textContent ?? "";
    expect(members).toContain("비회원도 질문 만들기, 카드 뽑기, 사주 명식, 지금의 한 장 등 일부 서비스를 이용할 수 있습니다. AI가 만드는 타로·사주 맛보기와 오늘의 한 장은 회원으로 로그인해야 이용할 수 있습니다.");
    expect(members).not.toContain("무료로 공개하는 풀이");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.textContent?.includes(`${NOTICE} · AI 풀이 로그인`));
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("타로·사주 맛보기와 오늘의 한 장은 이제 카카오나 Google로 로그인해야 볼 수 있습니다.");
    // The 시행일 shown stays as it was.
    expect(container.textContent).toContain("2026년 10월 31일");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-04T00:00:00+09:00"));
    container = render(<TermsPage />).container;
    expect(container.textContent).not.toContain(`${NOTICE} · AI 풀이 로그인`);
    expect(container.querySelector("#members")?.textContent).toContain("회원으로 로그인해야 이용할 수 있습니다");
  });

  it("privacy: the account's day count and 오늘의 한 장 by a keyed hash of the account, sl_q for follow-ups only, sl_daily as it is; a dated notice for 30 days", () => {
    const container = render(<PrivacyPage />).container;
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === NOTICE);
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("맛보기의 하루 이용 횟수는 기기의 쿠키가 아니라 계정마다 세요.");
    const items = container.querySelector("#items")?.textContent ?? "";
    expect(items).toContain("그날 본 맛보기의 횟수와 오늘의 한 장(고른 카드와 운세, 고른 자리): 계정 식별값을 되돌릴 수 없는 값(HMAC)으로 바꾼 값과 날짜로 묶어 둡니다.");
    expect(items).not.toContain("오늘의 한 장에 쓰는 무작위 기기 식별값");
    const retention = container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain("오늘의 한 장은 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜로 묶어 호스팅 사업자의 저장소에 36시간 보관한 뒤 자동으로 지웁니다.");
    expect(retention).toContain("하루 이용 횟수(IP 주소를 변환한 값별 횟수와 계정 식별값을 변환한 값별 맛보기 횟수)는 36시간 동안 보관한 뒤 자동으로 지웁니다.");
    expect(retention).toContain("로그인하지 않고 연 풀이와 맛보기(로그인해서 본 것 포함)의 입력");
    expect(retention).toContain("오늘의 한 장은 로그아웃할 때도 지웁니다.");
    const text = container.textContent ?? "";
    expect(text).toContain("오늘 한 후속 질문(이어서 물어보기)의 횟수를 세어 하루 횟수를 지키는 데 씁니다.");
    expect(text).not.toContain("오늘 연 첫 풀이와 후속 질문의 횟수");
    expect(text).toContain("오늘의 한 장에 쓰는 값으로, 로그인한 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜, 고른 자리, 그날 이 기기에서 새로 쓴 횟수를 담습니다.");
  });
});
