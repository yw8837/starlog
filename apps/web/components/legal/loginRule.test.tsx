// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
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
    vi.setSystemTime(Date.parse("2026-11-05T12:00:00+09:00"));
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
    vi.setSystemTime(Date.parse("2026-12-05T00:00:00+09:00"));
    container = render(<TermsPage />).container;
    expect(container.textContent).not.toContain(`${NOTICE} · AI 풀이 로그인`);
    expect(container.querySelector("#members")?.textContent).toContain("회원으로 로그인해야 이용할 수 있습니다");
  });

  it("privacy: the account's day count and 오늘의 한 장 by a keyed hash of the account, sl_q for follow-ups only, sl_daily as it is; a dated notice for 30 days", () => {
    const container = render(<PrivacyPage />).container;
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === NOTICE);
    expect(notice).toBeTruthy();
    // The account counts live in D1 until noon KST the next day (migrations/0021, lib/pay/maintenance.ts), code review 2026-11-04.
    expect(notice!.textContent).toContain("맛보기와 오늘의 한 장을 새로 쓴 하루 횟수는 기기의 쿠키가 아니라 계정마다 세요. 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜별 횟수만 운영자의 저장소(Cloudflare D1)에 두고, 다음 날 낮 12시(한국 시간)가 지나면 자동으로 지워요.");
    expect(notice!.textContent).toContain("‘첫 풀이’라고 쓰던 무료 부분은 ‘맛보기’로 이름을 맞췄어요.");
    const items = container.querySelector("#items")?.textContent ?? "";
    expect(items).toContain("그날 본 맛보기와 새로 쓴 오늘의 한 장의 횟수, 오늘의 한 장(고른 카드와 운세, 고른 자리): 계정 식별값을 되돌릴 수 없는 값(HMAC)으로 바꾼 값과 날짜로 묶어 둡니다.");
    expect(items).not.toContain("오늘의 한 장에 쓰는 무작위 기기 식별값");
    const retention = container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain("오늘의 한 장은 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜로 묶어 호스팅 사업자의 저장소에 36시간 보관한 뒤 자동으로 지웁니다.");
    expect(retention).toContain("하루 이용 횟수 중 IP 주소를 변환한 값별 횟수는 36시간 동안 보관한 뒤 자동으로 지우고, 계정 식별값을 변환한 값별 맛보기와 오늘의 한 장 횟수는 다음 날 낮 12시(한국 시간)가 지나면 자동으로 지웁니다.");
    expect(retention).not.toContain("계정 식별값을 변환한 값별 맛보기 횟수)는 36시간");
    expect(retention).toContain("진행 중인 질문과 타로 맛보기는 탭을 닫으면 지워지는 세션 저장소에 둡니다.");
    // The draw kept for a login that comes back in another tab (lib/flowState.ts backupFlowForLogin).
    expect(retention).toContain("로그인하러 가는 동안에는 같은 브라우저의 새 탭에서 이어 볼 수 있도록 진행 중인 질문과 뽑은 카드를 이 기기의 로컬 저장소에도 둡니다. 1시간이 지난 것은 쓰지 않으며, 결과 화면이 다시 읽거나 맛보기를 보거나 내 정보에서 기록을 지우면 지웁니다.");
    expect(container.textContent).toContain("무료로 본 맛보기(타로와 사주)를 공유하면");
    expect(retention).toContain("로그인하지 않고 연 풀이와 맛보기(로그인해서 본 것 포함)의 입력");
    expect(retention).toContain("오늘의 한 장은 로그아웃할 때도 지웁니다.");
    const text = container.textContent ?? "";
    expect(text).toContain("오늘 한 후속 질문(이어서 물어보기)의 횟수를 세어 하루 횟수를 지키는 데 씁니다.");
    expect(text).not.toContain("오늘 연 첫 풀이와 후속 질문의 횟수");
    expect(text).not.toContain("첫 풀이(");
    expect(text).not.toContain("타로 첫 풀이");
    // The 시행일 shown stays as it was.
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-31");
    expect(text).toContain("오늘의 한 장에 쓰는 값으로, 로그인한 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜, 고른 자리, 그날 이 기기에서 새로 쓴 횟수를 담습니다.");
  });

  it("refund: the free part before paying is called 맛보기 (it was 첫 풀이 and 첫 장 요약), needs a login, and a dated notice says so for 30 days", () => {
    let container = render(<RefundPage />).container;
    const withdrawal = container.querySelector("#withdrawal")?.textContent ?? "";
    expect(withdrawal).toContain("타로는 뽑은 카드와 맛보기(첫 카드 풀이, 이어지는 풀이의 소제목과 분량)를, 사주는 명식과 맛보기를 보고 나서 열지 정할 수 있어요. 맛보기는 카카오나 Google로 로그인하면 무료로 볼 수 있어요.");
    expect(withdrawal).not.toContain("첫 장 요약");
    expect(withdrawal).not.toContain("첫 풀이");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === NOTICE);
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("결제하기 전에 무료로 보는 부분은 ‘맛보기’로 이름을 맞췄어요(전에는 ‘첫 풀이’, ‘첫 장 요약’). 보여 드리는 내용은 그대로이고, 맛보기는 카카오나 Google로 로그인해야 볼 수 있어요.");
    // The 시행일 shown stays as it was.
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-05T00:00:00+09:00"));
    container = render(<RefundPage />).container;
    expect([...container.querySelectorAll("aside")].some((aside) => aside.querySelector("h2")?.textContent === NOTICE)).toBe(false);
    expect(container.querySelector("#withdrawal")?.textContent).toContain("사주는 명식과 맛보기를 보고 나서");
  });
});
