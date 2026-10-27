// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const text = (node: ReactElement) => render(node).container.textContent ?? "";
const MODEL_NAMES = /Claude|클로드|Opus|오푸스|Sonnet|GPT|Gemini/;

describe("policies for the paid launch", () => {
  it("/pricing sells the two standard readings by name and price, and no packs", () => {
    const page = text(<PricingPage />);
    expect(page).toContain("타로 전체 풀이");
    expect(page).toContain("사주 전체 풀이");
    expect(page).toContain("2,900원");
    expect(page).toContain("내 기록에 계속 보관");
    expect(page).not.toContain("가입 선물");
    expect(page).toContain("열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요");
    expect(page).not.toContain("언제든 전액 환불");
    expect(page).not.toMatch(/충전|심층 풀이|프롤로그/);
    expect(page).not.toMatch(/셀틱|celtic/i);
  });

  it("/refund: 제공 starts when the reading starts being written (right after payment); one left halfway reopens (3 times) but is not refunded, a fourth time uses it up; unopened is refundable for 7 KST days, failures on our side whenever", () => {
    const page = text(<RefundPage />);
    expect(page).toContain("제17조 제2항 제5호");
    // F2-a: the server counts 제공 from the moment the model starts answering, not from anything on screen.
    expect(page).not.toContain("화면에 나오기");
    expect(page).toContain("결제한 풀이를 적기 시작하면 제공이 시작된 것으로 봐요. 풀이는 결제 직후 자동으로 적기 시작해요.");
    expect(page).toContain("3번까지 다시 열어 끝까지 받을 수 있어요");
    expect(page).toContain("이미 제공이 시작된 풀이라 이때는 환불되지 않아요");
    // F2-b: what happens after the third (lib/pay/ledger.ts MAX_RESTORES).
    expect(page).toContain("3번까지 다시 열어 끝까지 받을 수 있어요. 네 번째로 끊기면 그 결제는 쓴 것으로 처리돼요.");
    expect(page).toContain("네 번째로 끊기면 그 결제는 쓴 것으로 처리되고 다시 열 수 없어요.");
    expect(page).not.toContain("완성되어 계정에 저장되면");
    expect(page).toContain("결제일로부터 7일 안에 전액 환불");
    expect(page).toContain("7일째 되는 날 밤 12시(한국 시간)까지");
    expect(page).toContain("10월 6일에 결제했다면 10월 13일까지");
    expect(page).toContain("7일이 지난 뒤에도 풀이는 그대로 열 수 있어요");
    expect(page).toContain("결제일로부터 7일이 지났어도 환불해 드려요");
    expect(page).not.toContain("기한 없이");
    expect(page).toContain("계좌로 환불");
    expect(page).toContain("내 정보 > 결제한 풀이");
    expect(page).not.toContain("결제 내역의 ‘환불받기’");
    expect(page).not.toContain("결제 내역에서 ‘환불받기’");
    expect(page).toContain("법정대리인");
    expect(page).not.toContain("충전");
    // The signup gift was removed (owner 2026-10-14 evening): the refund policy no longer names it.
    expect(page).not.toContain("가입 선물");
    expect(page).toContain("오픈 기념 무료 풀이는 결제가 없어 환불 대상이 아니에요");
  });

  it("/terms and /pricing: 제공 starts when the reading starts being written (right after payment); one left halfway reopens but is not refunded, a fourth time uses it up", () => {
    const terms = text(<TermsPage />);
    expect(terms).toContain("결제한 풀이는 풀이를 적기 시작한 때 제공이 시작된 것으로 보며, 풀이는 결제 직후 자동으로 적기 시작합니다.");
    expect(terms).toContain("3번까지 다시 열어 받을 수 있고, 환불 대상이 아닙니다. 네 번째로 끊긴 때에는 그 결제 풀이를 쓴 것으로 봅니다.");
    expect(terms).not.toContain("완성되어 계정에 저장된 때");
    expect(terms).not.toContain("화면에 나오기");
    const pricing = text(<PricingPage />);
    expect(pricing).toContain("결제한 풀이는 결제 직후 자동으로 적기 시작하고, 적기 시작하면 청약철회가 제한돼요.");
    expect(pricing).not.toContain("화면에 나오기");
  });

  it("/terms: Kakao or Google members, item-by-item payment, no signup gift (제7조의2 삭제), minors, deletion, no model name", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("“회원”이란 카카오 계정이나 Google 계정으로 로그인해");
    expect(page).toContain("회원 가입은 카카오 계정이나 Google 계정으로 로그인해서 합니다.");
    expect(page).not.toContain("한 사람에게");
    expect(page).toContain("건별로 결제");
    expect(page).toContain("제7조의2 (삭제)");
    expect(page).toContain("민법 제5조");
    expect(page).toContain("열지 않은 결제 풀이는 전액 환불");
    // F1: account deletion skips a purchase given back after its reading was cut off (lib/account/deletion.ts).
    expect(page).toContain("다만 풀이를 받던 중에 이용자가 화면을 닫거나 연결이 끊겨 제7조에 따라 환불 대상이 아닌 결제 풀이는 환불하지 않으며, 탈퇴와 함께 더 이상 열 수 없습니다.");
    expect(page).toContain("열기 전의 결제 풀이는 결제일로부터 7일 안에 전액 환불받을 수 있으며");
    expect(page).not.toContain("가입 선물");
    expect(page).not.toContain("충전");
    expect(page).not.toMatch(MODEL_NAMES);
    expect(page).not.toContain("Anthropic");
  });

  it("/terms: 제7조의2 is 삭제 (the signup gift went, owner 2026-10-14 evening), and 제4조 sets out 오픈 기념 무료: until 2026-11-30, once per logged-in account and per device, tarot only, read and keep only, ending by itself", () => {
    // The old 제2조·제4조 lines: pinned before the terms' 2026-10-31 00:00 KST revision (premiumSchedule.test.tsx has the new ones).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-30T12:00:00+09:00"));
    const { container } = render(<TermsPage />);
    const clause = container.querySelector("#gift");
    expect(clause?.querySelector("h2")?.textContent).toBe("제7조의2 (삭제)");
    expect(clause?.querySelectorAll("li")).toHaveLength(0);
    const service = container.querySelector("#service")?.textContent ?? "";
    expect(service).toContain("운영자는 오픈 기념 무료로 2026년 11월 30일 23시 59분(한국 시간)까지 로그인한 계정마다 한 번(같은 기기에서는 한 번) 타로 전체 풀이를 무료로 제공합니다. 사주 전체 풀이는 무료로 제공하지 않습니다.");
    expect(service).toContain("오픈 기념 무료로 연 타로 전체 풀이는 그 기기에서 보고 보관하는 데에만 쓸 수 있으며, 이어서 물어보기와 결과 공유는 제공하지 않습니다. 오픈 기념 무료는 위 기간이 지나면 자동으로 끝납니다.");
    expect(container.textContent).not.toMatch(/첫 이용 무료|가입 선물/);
    // Article numbers run 1, 2, 3, 4, 4의2, 5, 6, 7, 7의2, 8, (8의2,) 8의3, 9, 10, 11, 12 with nothing skipped.
    const articles = [...container.querySelectorAll("h2")].map((h) => h.textContent?.match(/^제(\d+)조(의\d+)?/)?.slice(1).join("") ?? "").filter(Boolean);
    expect(articles.filter((a) => !/의\d+$/.test(a)).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const definitions = [...(container.querySelector("#definitions")?.querySelectorAll("ol > li") ?? [])].map((li) => li.textContent);
    expect(definitions).toHaveLength(5);
    expect(definitions[4]).toBe("“전체 풀이”란 무료로 공개하는 부분을 넘어 소제목 전체와 이어서 물어보기를 담은 풀이를 말하며, 건별로 결제해서 엽니다. 다만 타로 전체 풀이는 제4조의 오픈 기념 무료로도 열 수 있으며, 이때는 이어서 물어보기와 결과 공유를 제공하지 않습니다.");
  });

  it("/privacy: what an account keeps, for how long, and who processes it; never 'not stored' without a condition", () => {
    const page = text(<PrivacyPage />);
    expect(page).toContain("카카오 회원번호");
    expect(page).toContain("되돌릴 수 없는 값");
    expect(page).toContain("암호화");
    expect(page).toContain("로그인하지 않고 연 풀이");
    expect(page).toContain("5년");
    expect(page).toContain("3년");
    expect(page).toContain("토스페이먼츠 주식회사");
    expect(page).toContain("sl_sid");
    expect(page).toContain("Anthropic, PBC");
    expect(page).not.toContain("결제 도입 시");
    expect(page).not.toContain("지금은 로그인이 없어");
    expect(page).not.toContain("풀이 입력을 서버에 저장하지 않고");
    expect(page).not.toMatch(MODEL_NAMES);
  });

  it("/privacy: Google login keeps only a keyed value of the Google account id, and receives no name, email or picture", () => {
    const page = text(<PrivacyPage />);
    expect(page).toContain("회원(카카오·Google 로그인)");
    expect(page).toContain("Google 계정 식별값(Google로 로그인한 경우): 되돌릴 수 없는 값(HMAC)으로 바꿔서만 저장하며");
    expect(page).toContain("이름, 이메일, 프로필 사진은 받지 않습니다");
    expect(page).toContain("수집 출처: 카카오(카카오 로그인 시 회원번호와 닉네임), Google(Google 로그인 시 계정 식별값)");
    expect(page).toContain("카카오 회원번호나 Google 계정 식별값을 되돌릴 수 없게 바꾼 값과 지급 시각");
    expect(page).toContain("카카오·Google 로그인이 이 브라우저에서 시작됐는지 확인하는 값입니다");
  });

  it("/privacy: what was deleted stays in the database's recovery copies (D1 Time Travel) for up to 30 days", () => {
    const { container } = render(<PrivacyPage />);
    const retention = container.querySelector("#retention")?.textContent ?? "";
    expect(retention).toContain("Time Travel");
    expect(retention).toContain("복구 기록에는 최대 30일 동안 남아 있다가 사라집니다");
  });

  it("none of the four says 베타", () => {
    for (const page of [<PricingPage key="p" />, <RefundPage key="r" />, <TermsPage key="t" />, <PrivacyPage key="v" />]) {
      expect(text(page)).not.toContain("베타");
      cleanup();
    }
  });
});
