// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

const textOf = (Page: () => React.JSX.Element) => render(<Page />).container.textContent ?? "";

describe("policies match what the service does", () => {
  afterEach(() => {
    cleanup();
  });

  it("privacy: names the AI transfer items, retention and legal basis", () => {
    const text = textOf(PrivacyPage);
    expect(text).toContain("제28조의8");
    expect(text).toContain("30일 안에 자동으로 삭제");
    expect(text).toContain("모델 학습에 쓰지 않습니다");
    for (const item of ["메모", "요즘 상황(고른 칩)", "후속 질문", "지난 풀이 요약"]) expect(text).toContain(item);
    expect(text).not.toContain("고민 한 줄");
  });

  it("privacy: lists every cookie, the browser storage, the KV records and Kakao sharing", () => {
    const text = textOf(PrivacyPage);
    for (const cookie of ["sl_q", "sl_daily", "sl_owner"]) expect(text).toContain(cookie);
    expect(text).toContain("로컬 저장소");
    expect(text).toContain("세션 저장소");
    expect(text).toContain("사주 맛보기는 이 기기의 로컬 저장소에 최대 30일 남습니다");
    expect(text).toContain("36시간");
    expect(text).toContain("IP 주소 원문은 저장하지 않습니다");
    expect(text).toContain("카카오톡으로 보내기를 누를 때만");
  });

  it("privacy: no beta-era claims that are no longer true", () => {
    const text = textOf(PrivacyPage);
    expect(text).not.toContain("예시 풀이");
    expect(text).not.toContain("Anthropic으로 정보를 보내지 않습니다");
    expect(text).not.toContain("탭이나 창을 닫으면 지워지는 세션 저장소를 씁니다");
  });

  it("terms: says the content is AI-generated, under the AI Basic Act, and lists only live services", () => {
    const text = textOf(TermsPage);
    expect(text).toContain("제4조의2");
    expect(text).toContain("「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조");
    expect(text).toContain("생성형 인공지능");
    expect(text).not.toContain("친구 초대와 친구가 남긴 카드");
    expect(text).not.toContain("예시 풀이");
    expect(text).toContain("준비 중으로 표시한 풀이는 판매를 시작하기 전에");
    expect(text).toContain("결제한 풀이나 별조각을 쓰지 않습니다");
  });

  it("refund: the digital-content preview duty and the beta note", () => {
    const text = textOf(RefundPage);
    expect(text).toContain("제17조 제6항");
    expect(text).toContain("시행령 제21조의2");
    expect(text).toContain("오픈 기념 무료 풀이는 결제가 없어 환불 대상이 아니에요");
    expect(text).toContain("자동 품질 검사 탈락");
  });
});
