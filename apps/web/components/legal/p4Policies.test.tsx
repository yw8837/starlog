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
  it("/pricing sells the two standard readings by name and price, and no 달빛 packs", () => {
    const page = text(<PricingPage />);
    expect(page).toContain("타로 전체 풀이");
    expect(page).toContain("사주 전체 풀이");
    expect(page).toContain("2,900원");
    expect(page).toContain("이 기기에 계속 보관");
    expect(page).toContain("받은 날부터 90일째 되는 날까지 쓸 수 있어요");
    expect(page).not.toMatch(/충전|심층 풀이|프롤로그/);
    expect(page).not.toMatch(/켈틱|셀틱|celtic/i);
  });

  it("/refund: 제공 means saved to the account; unopened is refundable any time, with a fallback", () => {
    const page = text(<RefundPage />);
    expect(page).toContain("제17조 제2항 제5호");
    expect(page).toContain("완성되어 계정에 저장되면");
    expect(page).toContain("기한 없이 전액 환불");
    expect(page).toContain("계좌로 환불");
    expect(page).toContain("내 정보 > 결제 내역");
    expect(page).toContain("90일");
    expect(page).toContain("법정대리인");
    expect(page).not.toContain("충전");
  });

  it("/terms: Kakao members, item-by-item payment, 별조각 rules, minors, deletion, no model name", () => {
    const page = text(<TermsPage />);
    expect(page).toContain("카카오 계정으로 로그인");
    expect(page).toContain("건별로 결제");
    expect(page).toContain("제7조의2 (별조각)");
    expect(page).toContain("민법 제5조");
    expect(page).toContain("열지 않은 결제 풀이는 전액 환불");
    expect(page).toContain("가입 선물");
    expect(page).not.toContain("충전");
    expect(page).not.toMatch(MODEL_NAMES);
    expect(page).not.toContain("Anthropic");
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

  it("none of the four says 베타", () => {
    for (const page of [<PricingPage key="p" />, <RefundPage key="r" />, <TermsPage key="t" />, <PrivacyPage key="v" />]) {
      expect(text(page)).not.toContain("베타");
      cleanup();
    }
  });
});
