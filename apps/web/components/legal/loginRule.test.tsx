// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { BOND_LOGIN_DATE, KEPT_RULE_DATE, LOGIN_RULE_DATE, koreanDate } from "@/lib/legal";

/**
 * Every AI reading result needs a login (owner 2026-11-04, final): the terms (제6조 1호) and the privacy policy change only
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

  it("terms: 제6조 1호 says what a visitor may use and that the 맛보기 and 오늘의 한 장 need a login; a dated notice says so for 30 days", () => {
    let container = render(<TermsPage />).container;
    const members = container.querySelector("#members")?.textContent ?? "";
    // The notice names the clause by its number on the page: the first item of 제6조's numbered list.
    expect(container.querySelector("#members ol > li:first-child")?.textContent).toContain("비회원도 질문 만들기");
    expect(container.textContent).toContain("지금처럼 로그인 없이 쓸 수 있습니다(제6조 1호).");
    expect(container.textContent).not.toContain("제6조 2호");
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
    // The rename is said without the old name (owner: never show "첫 풀이"; code review 2026-11-05).
    expect(notice!.textContent).toContain("무료로 먼저 보는 부분의 이름을 ‘맛보기’로 바꿨어요.");
    const items = container.querySelector("#items")?.textContent ?? "";
    expect(items).toContain("그날 본 맛보기와 새로 쓴 오늘의 한 장의 횟수, 오늘의 한 장(고른 카드와 운세, 고른 자리): 계정 식별값을 되돌릴 수 없는 값(HMAC)으로 바꾼 값과 날짜로 묶어 둡니다.");
    expect(items).not.toContain("오늘의 한 장에 쓰는 무작위 기기 식별값");
    const retention = container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain("오늘의 한 장은 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜로 묶어 호스팅 사업자의 저장소에 36시간 보관한 뒤 자동으로 지웁니다.");
    expect(retention).toContain("하루 이용 횟수 중 IP 주소를 변환한 값별 횟수는 36시간 동안 보관한 뒤 자동으로 지우고, 계정 식별값을 변환한 값별 맛보기와 오늘의 한 장 횟수는 다음 날 낮 12시(한국 시간)가 지나면 자동으로 지웁니다.");
    expect(retention).not.toContain("계정 식별값을 변환한 값별 맛보기 횟수)는 36시간");
    expect(retention).toContain("진행 중인 질문과 타로 맛보기는 탭을 닫으면 지워지는 세션 저장소에 둡니다.");
    // The draw kept for a login that comes back in another tab (lib/flowState.ts backupFlowForLogin).
    expect(retention).toContain("로그인 버튼을 눌러 로그인하러 가는 동안에는 같은 브라우저의 새 탭에서 이어 볼 수 있도록 진행 중인 질문과 뽑은 카드를 이 기기의 로컬 저장소에도 둡니다. 로그인하고 돌아온 결과 화면만 다시 읽고 바로 지우며, 맛보기를 보거나 내 정보에서 기록을 지워도 지웁니다. 1시간이 지난 것은 쓰지 않고 다음에 스타로그를 열 때 지웁니다.");
    expect(container.textContent).toContain("무료로 본 맛보기(타로와 사주)를 공유하면");
    expect(retention).toContain("로그인하지 않고 연 풀이와 맛보기(로그인해서 본 것 포함)의 입력");
    expect(retention).toContain("오늘의 한 장은 로그아웃할 때도 지웁니다.");
    // The kept card carries the account marker, a one-way value and never the id (lib/storage/daily.ts; code review 2026-11-05).
    expect(retention).toContain("이 기기에 남는 오늘의 한 장에는 어느 계정의 카드인지 알아보는 표시(계정 식별값을 되돌릴 수 없게 바꾼 값이며, 계정 식별값 자체는 아닙니다)를 함께 두고, 같은 계정으로 로그인했을 때만 보여 드립니다.");
    const text = container.textContent ?? "";
    expect(text).toContain("오늘 한 후속 질문(이어서 물어보기)의 횟수를 세어 하루 횟수를 지키는 데 씁니다.");
    expect(text).not.toContain("오늘 연 첫 풀이와 후속 질문의 횟수");
    expect(text).not.toContain("첫 풀이");
    expect(text).not.toContain("첫 장 요약");
    // The 시행일 shown stays as it was.
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-31");
    expect(text).toContain("오늘의 한 장에 쓰는 값으로, 로그인한 계정 식별값을 되돌릴 수 없게 바꾼 값과 날짜, 고른 자리, 그날 이 기기에서 새로 쓴 횟수를 담습니다.");
  });

  it("refund: the free part before paying is called 맛보기, needs a login, and a dated notice says so for 30 days without the old names", () => {
    let container = render(<RefundPage />).container;
    const withdrawal = container.querySelector("#withdrawal")?.textContent ?? "";
    expect(withdrawal).toContain("타로는 뽑은 카드와 맛보기(첫 카드 풀이, 이어지는 풀이의 소제목과 분량)를, 사주는 명식과 맛보기를 보고 나서 열지 정할 수 있어요. 맛보기는 카카오나 Google로 로그인하면 무료로 볼 수 있어요.");
    expect(withdrawal).not.toContain("첫 장 요약");
    expect(withdrawal).not.toContain("첫 풀이");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === NOTICE);
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("결제하기 전에 무료로 먼저 보는 부분의 이름을 ‘맛보기’로 바꿨어요. 보여 드리는 내용은 그대로이고, 맛보기는 카카오나 Google로 로그인해야 볼 수 있어요.");
    expect(container.textContent).not.toMatch(/첫 풀이|첫 장 요약/);
    // The 시행일 shown stays as it was.
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-05T00:00:00+09:00"));
    container = render(<RefundPage />).container;
    expect([...container.querySelectorAll("aside")].some((aside) => aside.querySelector("h2")?.textContent === NOTICE)).toBe(false);
    expect(container.querySelector("#withdrawal")?.textContent).toContain("사주는 명식과 맛보기를 보고 나서");
  });
});

/**
 * What a device keeps shows only with a session (owner 2026-11-05): the terms (제6조, the 별자리 인연 clause) and the privacy
 * policy say so, and say what changed, dated by lib/legal.ts KEPT_RULE_DATE, on top for 30 days, as with LOGIN_RULE_DATE.
 */
describe("what a device keeps needs a login, in the policies", () => {
  const KEPT_NOTICE = `${koreanDate(KEPT_RULE_DATE)} 바뀐 내용`;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-06T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("terms: 제6조 and the 별자리 인연 clause say it; a dated notice says it is hidden, not deleted, a friend's result too", () => {
    let container = render(<TermsPage />).container;
    expect(container.querySelector("#members")?.textContent).toContain("저장된 풀이 기록과 맛보기는 회원으로 로그인해야 화면에 보여 드립니다.");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.textContent?.includes(`${KEPT_NOTICE} · 저장된 기록 보기`));
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("저장된 기록을 지우는 것은 아니며, 로그인하면 다시 보입니다(제6조).");
    // a friend joins logged in since 2026-11-10: this notice no longer says a friend joins without one
    expect(notice!.textContent).toContain("초대받은 친구가 별자리 인연에 참여한 결과도 다시 보려면 로그인해야 합니다.");
    expect(container.textContent).not.toContain("로그인 없이 별자리 인연에 참여");
    // An owner's own constellation too, one made on a device before accounts included (owner 2026-11-05).
    expect(notice!.textContent).toContain("계정에 연결하지 않고 이 기기에서 만든 내 별자리도 로그인해야 보여 드립니다. 지우는 것은 아니며, 로그인하면 다시 보이고 계정에 연결할 수 있습니다.");
    expect(container.textContent).toContain("내 별자리와 친구들의 점수는 회원으로 로그인해야 보여 드립니다.");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-06T00:00:00+09:00"));
    container = render(<TermsPage />).container;
    expect(container.textContent).not.toContain(`${KEPT_NOTICE} · 저장된 기록 보기`);
    expect(container.querySelector("#members")?.textContent).toContain("회원으로 로그인해야 화면에 보여 드립니다");
  });

  it("privacy: hidden from a device with no session, kept, erasable without a login; a dated notice", () => {
    let container = render(<PrivacyPage />).container;
    const retention = container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain("로그인하지 않은 기기에서는 내 기록과 맛보기, 오늘의 한 장을 화면에 보여 드리지 않습니다. 지우는 것은 아니어서 로그인하면 다시 보이고, 내 정보에서 로그인 없이도 지울 수 있습니다.");
    expect(retention).not.toContain("이 기록들을");
    expect(container.textContent).toContain("이용 중인 기기에 풀이 기록을 보관해 로그인한 뒤 다시 볼 수 있게 하기");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === KEPT_NOTICE);
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("이 기기에 저장된 풀이 기록과 맛보기, 오늘의 한 장은 로그인하지 않으면 화면에 보여 드리지 않아요.");
    expect(notice!.textContent).toContain("초대받은 친구의 결과도 다시 볼 때는 로그인을 요청해요.");
    expect(notice!.textContent).not.toContain("별을 계정에 연결하지는 않아요");
    expect(notice!.textContent).toContain("계정에 연결하지 않고 이 기기에서 만든 내 별자리도 로그인하지 않으면 보여 드리지 않아요. 로그인하면 다시 보이고 계정에 연결할 수 있어요.");
    expect(container.textContent).toContain("계정에 연결하지 않은 별자리는 로그인하지 않으면 화면에 보여 드리지 않습니다.");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-06T00:00:00+09:00"));
    container = render(<PrivacyPage />).container;
    expect([...container.querySelectorAll("aside")].some((aside) => aside.querySelector("h2")?.textContent === KEPT_NOTICE)).toBe(false);
    expect(container.querySelector("#retention")?.textContent).toContain("로그인하지 않은 기기에서는 내 기록과 맛보기, 오늘의 한 장을 화면에 보여 드리지 않습니다.");
  });
});

/**
 * A friend logs in to join 별자리 인연 (owner 2026-11-10): the terms (제8조의2 1호) and the privacy policy change what became
 * untrue, and say what changed, dated by lib/legal.ts BOND_LOGIN_DATE, on top for 30 days, as with LOGIN_RULE_DATE.
 */
describe("a friend logs in to join 별자리 인연, in the policies", () => {
  const BOND_NOTICE = `${koreanDate(BOND_LOGIN_DATE)} 바뀐 내용`;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-10T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("terms: 제8조의2 1호 says a friend joins logged in, once per account a round, the star shown wherever it logs in; a dated notice says what changed", () => {
    let container = render(<TermsPage />).container;
    const clause = container.querySelector("#bonds ol > li:first-child")?.textContent ?? "";
    expect(clause).toContain("친구는 회원으로 로그인해야 참여할 수 있고, 한 계정으로 같은 별자리 한 회차에 한 번 참여할 수 있습니다.");
    expect(clause).toContain("참여한 별은 그 계정에 연결되어, 같은 계정으로 로그인하면 어느 기기에서든 결과를 다시 보여 드립니다.");
    expect(container.textContent).not.toMatch(/친구는 로그인 없이|로그인 없이 별자리 인연에 참여/);
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.textContent?.includes(`${BOND_NOTICE} · 별자리 인연 참여`));
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("초대받은 친구도 이제 카카오나 Google로 로그인해야 별자리 인연에 참여할 수 있습니다.");
    expect(notice!.textContent).toContain("초대 링크를 열어 누가 어떤 별자리에 초대했는지 보는 것은 지금처럼 로그인 없이 할 수 있습니다(제8조의2 1호).");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-10T00:00:00+09:00"));
    container = render(<TermsPage />).container;
    expect(container.textContent).not.toContain(`${BOND_NOTICE} · 별자리 인연 참여`);
    expect(container.querySelector("#bonds")?.textContent).toContain("친구는 회원으로 로그인해야 참여할 수 있고");
  });

  it("privacy: the friend's star is kept under a value made from the account, not the device; a dated notice says what changed", () => {
    let container = render(<PrivacyPage />).container;
    expect(container.textContent).toContain("친구는 회원으로 로그인해 참여하고, 참여한 별은 그 계정에 연결해 같은 계정으로 로그인하면 어느 기기에서든 보여 드립니다.");
    expect(container.textContent).toContain("같은 사람의 중복 참여를 막는 계정 식별값을 되돌릴 수 없게 바꾼 값");
    expect(container.textContent).not.toContain("로그인해도 별을 계정에 연결하지는 않고");
    const notice = [...container.querySelectorAll("aside")].find((aside) => aside.querySelector("h2")?.textContent === BOND_NOTICE);
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("초대받은 친구도 카카오나 Google로 로그인해야 별자리 인연에 참여할 수 있어요.");
    expect(notice!.textContent).toContain("기기 식별값의 해시 대신 계정 식별값을 되돌릴 수 없게 바꾼 값");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-10T00:00:00+09:00"));
    container = render(<PrivacyPage />).container;
    expect([...container.querySelectorAll("aside")].some((aside) => aside.querySelector("h2")?.textContent === BOND_NOTICE)).toBe(false);
  });
});
