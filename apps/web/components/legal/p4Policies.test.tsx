// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

afterEach(cleanup);

const text = (node: ReactElement) => render(node).container.textContent ?? "";
const MODEL_NAMES = /Claude|클로드|Opus|오푸스|Sonnet|GPT|Gemini/;

describe("policies for the paid launch", () => {
  it("/pricing sells the two standard readings by name and price, and no packs", () => {
    const page = text(<PricingPage />);
    expect(page).toContain("타로 전체 풀이");
    expect(page).toContain("사주 전체 풀이");
    expect(page).toContain("2,900원");
    expect(page).toContain("이 기기에 계속 보관");
    expect(page).toContain("받은 날부터 90일째 되는 날 밤 12시(한국 시간)까지 쓸 수 있어요");
    expect(page).toContain("열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요");
    expect(page).not.toContain("언제든 전액 환불");
    expect(page).not.toMatch(/충전|심층 풀이|프롤로그/);
    expect(page).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("/refund: 제공 means saved to the account; unopened is refundable for 7 KST days after the payment, failures on our side whenever, with a fallback", () => {
    const page = text(<RefundPage />);
    expect(page).toContain("제17조 제2항 제5호");
    expect(page).toContain("완성되어 계정에 저장되면");
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
    expect(page).toContain("90일");
    expect(page).toContain("법정대리인");
    expect(page).not.toContain("충전");
    // A gift reading that fails gives the gift back; the gift itself is never refunded.
    expect(page).toContain("가입 선물로 열던 풀이라면 가입 선물도 그대로 돌려 드려요");
    expect(page).toContain("가입 선물(타로 전체 풀이 1번 무료)은 무료로 드리는 혜택이라 환불 대상이 아니에요");
  });

  it("/terms: Kakao or Google members, item-by-item payment, the signup gift clause, minors, deletion, no model name", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("“회원”이란 카카오 계정이나 Google 계정으로 로그인해");
    expect(page).toContain("회원 가입은 카카오 계정이나 Google 계정으로 로그인해서 하며");
    expect(page).toContain("카카오 계정이나 Google 계정 하나에 한 번만 드리며");
    expect(page).not.toContain("한 사람에게");
    expect(page).toContain("건별로 결제");
    expect(page).toContain("제7조의2 (가입 선물)");
    expect(page).toContain("민법 제5조");
    expect(page).toContain("열지 않은 결제 풀이는 전액 환불");
    expect(page).toContain("열기 전의 결제 풀이는 결제일로부터 7일 안에 전액 환불받을 수 있으며");
    expect(page).toContain("가입 선물");
    expect(page).not.toContain("충전");
    expect(page).not.toMatch(MODEL_NAMES);
    expect(page).not.toContain("Anthropic");
  });

  it("/terms: the signup gift is one clause: once per Kakao or Google account (not again within a year of leaving), standard tarot only, no cash value, not transferable or refundable, expires, changed only going forward with notice", () => {
    const { container } = render(<TermsPage />);
    const clause = container.querySelector("#gift");
    expect(clause?.querySelector("h2")?.textContent).toBe("제7조의2 (가입 선물)");
    const items = [...(clause?.querySelectorAll("ol > li") ?? [])].map((li) => li.textContent);
    expect(items).toEqual([
      "운영자는 처음 가입한 회원에게 가입 선물(무료 이용 혜택)로 타로 전체 풀이 1회를 무료로 드립니다. 가입 선물은 카카오 계정이나 Google 계정 하나에 한 번만 드리며, 탈퇴 후 같은 계정으로 다시 가입해도 탈퇴일로부터 1년 동안은 다시 드리지 않습니다.",
      "가입 선물은 타로 전체 풀이에만 쓸 수 있으며, 사주 전체 풀이(주제별 사주 풀이를 포함합니다)와 그 밖의 유료 풀이에는 쓸 수 없습니다.",
      "가입 선물은 받은 날부터 90일째 되는 날의 자정(한국 시간)까지 쓸 수 있으며, 그때까지 쓰지 않으면 사라집니다. 탈퇴한 경우에도 쓰지 않은 가입 선물은 사라집니다.",
      "가입 선물은 운영자가 무료로 드리는 혜택으로 현금 가치가 없으며, 현금으로 바꾸거나 환불할 수 없고 다른 사람에게 넘길 수 없습니다.",
      "운영자는 가입 선물의 내용과 조건을 바꾸거나 제공을 끝낼 수 있습니다. 이 경우 바뀌는 내용과 시행일을 시행일 7일 전부터 서비스 안에 공지하며, 바뀐 내용은 시행일 이후에 드리는 가입 선물부터 적용합니다.",
    ]);
    // Article numbers run 1, 2, 3, 4, 4의2, 5, 6, 7, 7의2, 8, (8의2,) 9, 10, 11, 12 with nothing skipped.
    const articles = [...container.querySelectorAll("h2")].map((h) => h.textContent?.match(/^제(\d+)조(의2)?/)?.slice(1).join("") ?? "").filter(Boolean);
    expect(articles.filter((a) => !a.endsWith("의2")).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(container.querySelector("#definitions")?.textContent).toContain("“가입 선물”이란 운영자가 처음 가입한 회원에게 무료로 드리는 이용 혜택(타로 전체 풀이 1회)을 말하며");
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
