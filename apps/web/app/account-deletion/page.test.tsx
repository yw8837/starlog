// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountDeletionPage, { metadata } from "@/app/account-deletion/page";
import PrivacyPage from "@/app/privacy/page";
import { SITE } from "@/lib/config";

/**
 * 계정 삭제 안내 (owner 2026-11-13 "전용 페이지 만들기"): Google Play's account deletion link. It names the app and the operator,
 * gives the 내 정보 > 회원 탈퇴 path and the contact to ask without logging in, and says what goes and what stays, for how long,
 * in the privacy policy's own words. Nothing on it needs a session.
 */
describe("account deletion page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-13T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("one h1, the app and the operator named, and its five sections in order", () => {
    const { container } = render(<AccountDeletionPage />);
    expect([...container.querySelectorAll("h1")].map((h) => h.textContent)).toEqual(["계정 삭제 안내"]);
    const text = container.textContent ?? "";
    expect(text).toContain(`${SITE.nameKo} (${SITE.name})`);
    expect(text).toContain(`${SITE.business.name}(이하 “운영자”)`);
    expect([...container.querySelectorAll("section > h2")].map((h) => h.textContent)).toEqual([
      "1. 내 정보에서 탈퇴하기",
      "2. 이메일·전화로 삭제 요청하기",
      "3. 탈퇴하면 지워지는 정보",
      "4. 탈퇴해도 남는 정보와 보관 기간",
      "5. 이 기기에 저장된 기록",
    ]);
  });

  it("gives the in-app path and what happens to paid readings, as the terms say", () => {
    const { container } = render(<AccountDeletionPage />);
    const section = container.querySelector("#in-app")?.textContent ?? "";
    expect(section).toContain("회원은 언제든지 내 정보에서 탈퇴할 수 있습니다.");
    expect(section).toContain("로그인한 상태에서 내 정보 > 회원 탈퇴를 누릅니다.");
    expect(section).toContain("‘탈퇴할까요?’ 확인창에서 지워지는 것과 남는 것을 확인합니다.");
    expect(section).toContain("탈퇴하면 열지 않은 결제 풀이는 전액 환불합니다.");
  });

  it("gives the contact to ask without logging in: the privacy officer, by email and phone", () => {
    const { container } = render(<AccountDeletionPage />);
    const section = container.querySelector("#request");
    const text = section?.textContent ?? "";
    expect(text).toContain("이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.");
    expect(text).toContain("운영자가 보관하는 정보에 대한 요구는 아래 개인정보 보호책임자에게 해 주시면 지체 없이 조치합니다.");
    expect(text).toContain(SITE.business.ceo);
    const hrefs = [...(section?.querySelectorAll("a[href]") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`mailto:${SITE.business.email}`);
    expect(hrefs).toContain(`tel:${SITE.business.phone.replaceAll("-", "")}`);
  });

  it("says what is deleted and what is kept, for how long, in the privacy policy's words", () => {
    const { container } = render(<AccountDeletionPage />);
    const deleted = container.querySelector("#deleted")?.textContent ?? "";
    expect(deleted).toContain("계정에 보관한 풀이(로그인한 상태로 연 풀이와 계정으로 옮긴 풀이)는 지체 없이 파기합니다.");
    expect(deleted).toContain("그 계정의 풀이 후기와 도움돼요·신고 기록은 지체 없이 파기합니다.");
    const kept = container.querySelector("#kept")?.textContent ?? "";
    expect(kept).toContain("대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁처리에 관한 기록은 3년 동안 보관합니다.");
    expect(kept).toContain("풀이 신고(안드로이드 앱) 기록은 계정과 메모를 지운 채 1년 동안 보관합니다.");
    expect(kept).toContain("탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.");
    expect(kept).toContain("최대 30일 동안 남아 있다가 사라집니다.");
    const device = container.querySelector("#device")?.textContent ?? "";
    expect(device).toContain("‘이 기기에 저장된 기록 모두 지우기’");
    expect(device).toContain("내 정보에서 로그인 없이도 지울 수 있습니다.");
  });

  it("names the 오픈 기념 무료 record while the event runs, and drops it after", () => {
    const during = render(<AccountDeletionPage />).container.querySelector("#kept")?.textContent ?? "";
    expect(during).toContain("오픈 기념 무료를 받은 기록");
    cleanup();
    vi.setSystemTime(Date.parse("2026-12-01T00:00:00+09:00"));
    const after = render(<AccountDeletionPage />).container.querySelector("#kept")?.textContent ?? "";
    expect(after).not.toContain("오픈 기념 무료");
  });

  it("is plain Korean (no English but the app name and the contact), and never says 베타 or 첫 풀이", () => {
    const text = render(<AccountDeletionPage />).container.querySelector("article")?.textContent ?? "";
    expect(text).not.toMatch(/베타|첫 풀이/);
    expect(text.replaceAll(SITE.name, "").replaceAll(SITE.business.email, "")).not.toMatch(/[A-Za-z]/);
  });

  it("needs no login: no session, cookie or header read, and an indexable page of its own like the policies", () => {
    const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(source).not.toMatch(/next\/headers|cookies\(|session|redirect\(/i);
    expect(metadata.alternates?.canonical).toBe("/account-deletion");
    expect(metadata.robots).toBeUndefined();
  });

  it("is linked from the privacy policy's rights section", () => {
    const { container } = render(<PrivacyPage />);
    const hrefs = [...(container.querySelector("#rights")?.querySelectorAll("a[href]") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/account-deletion");
  });
});
