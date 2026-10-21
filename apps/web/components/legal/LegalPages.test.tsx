// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

const PAGES = { terms: TermsPage, privacy: PrivacyPage, refund: RefundPage } as const;

describe("policy pages", () => {
  // A fixed day between the premium clauses (2026-10-20) and the privacy revision (2026-10-28), so no date can break these.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-21T12:00:00+09:00"));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  for (const [name, Page] of Object.entries(PAGES)) {
    it(`${name}: one h1, effective 2026-10-20 (the premium clauses in force, owner 2026-10-20), and no address but the configured business one`, () => {
      const { container } = render(<Page />);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(container.querySelector('time[datetime="2026-10-20"]')).not.toBeNull();
      // Allowed: "IP 주소" (a logged item in the privacy policy) and SITE.business.address with its label.
      const rest = (container.textContent ?? "")
        .replaceAll("IP 주소", "")
        .replaceAll("사업장 주소", "")
        .replaceAll(SITE.business.address, "");
      expect(rest).not.toContain("주소");
      expect(container.textContent).toContain("665-38-01736");
    });
  }

  it("lets the business email break only before its @, never inside a word (M-15)", () => {
    const { container } = render(<RefundPage />);
    const email = [...container.querySelectorAll("dd")].find((dd) => dd.textContent === SITE.business.email);
    expect(email).toBeTruthy();
    const at = SITE.business.email.indexOf("@");
    expect(email!.innerHTML).toBe(`${SITE.business.email.slice(0, at)}<wbr>${SITE.business.email.slice(at)}`);
  });

  it("refund: cites the withdrawal limit, the unopened-payment refund, and the governing law and guideline", () => {
    const { container } = render(<RefundPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("제17조 제2항 제5호");
    expect(text).toContain("결제하기 전에");
    expect(text).toContain("결제일로부터 7일 안에 전액 환불");
    // F8: 전자상거래법 제18조 제1항: within 3 business days.
    expect(text).toContain("확인한 날부터 3영업일 안에 결제를 취소하고 결제한 수단으로 환불해 드려요.");
    expect(text).not.toContain("3~7일");
    expect(text).toContain("콘텐츠이용자보호지침");
    expect(text).toContain("본인 명의 계좌로 환불");
  });

  it("privacy: names every processor and the overseas transfer", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    for (const name of ["Anthropic, PBC", "Cloudflare, Inc.", "토스페이먼츠"]) expect(text).toContain(name);
    expect(text).toContain("서버에 저장하지 않습니다");
    expect(text).toContain("만 14세 미만");
  });

  it("privacy: says no ad cookies while AdSense is off, and discloses them once it is on", () => {
    vi.stubEnv("ADSENSE_CLIENT", "");
    const off = render(<PrivacyPage />).container.textContent ?? "";
    expect(off).toContain("광고나 행동 추적을 위한 쿠키는 쓰지 않습니다");
    expect(off).not.toContain("애드센스");
    cleanup();

    vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
    const on = render(<PrivacyPage />).container.textContent ?? "";
    expect(on).not.toContain("광고나 행동 추적을 위한 쿠키는 쓰지 않습니다");
    expect(on).toContain("Google 애드센스");
    expect(on).toContain("행태정보");
    expect(on).toContain("Google 광고 설정");
    expect(on).toContain("풀이 화면에는 광고를 싣지 않습니다");
  });

  it("privacy: points to www.aboutads.info for other ad companies' personalised ads, once ads are on", () => {
    vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
    const { container } = render(<PrivacyPage />);
    const link = [...container.querySelectorAll("a")].find((a) => a.getAttribute("href") === "https://www.aboutads.info");
    expect(link?.textContent).toBe("www.aboutads.info");
    expect(link?.closest("li")?.textContent).toBe("Google 외 제3자 광고 사업자의 맞춤 광고도 www.aboutads.info에서 끌 수 있습니다.");
    // The Google settings link stays, and the 시행일 is the one lib/legal.ts holds.
    expect(container.querySelector('a[href="https://adssettings.google.com"]')).not.toBeNull();
    expect(container.querySelector('time[datetime="2026-10-20"]')).not.toBeNull();
    cleanup();

    vi.stubEnv("ADSENSE_CLIENT", "");
    expect(render(<PrivacyPage />).container.textContent).not.toContain("aboutads");
  });

  it("privacy: tells what a shared link keeps and for how long, as the share code does; the 180 days and the follow-up periods come in force on 2026-10-28 after a 7-day notice", () => {
    let text = render(<PrivacyPage />).container.textContent ?? "";
    expect(text).toContain(
      "공유 링크를 만들면 풀이의 공개용 사본(뽑은 카드와 풀이 본문)을 저장합니다. 질문, 직접 쓴 말과 메모, 고른 상황, 생년월일과 태어난 시각, 명식, 이어서 물어본 내용은 넣지 않고, 풀이 본문에 옮겨진 직접 쓴 말과 고른 상황, 생년월일·태어난 시각·나이는 가리며, 연락처나 링크가 들어간 문장은 빼고 저장합니다. 로그인한 상태로 만든 공유에는 계정을 함께 기록합니다.",
    );
    // Before: the old lines, and the revision announced on top.
    expect(text).toContain("개정 예정 · 2026년 10월 28일부터 시행");
    expect(text).toContain("풀이의 공유 사본과 링크는 공유한 날부터 180일이 지나면 자동으로 지웁니다.");
    expect(text).toContain("회원 탈퇴할 때까지 보관하고, 그때 바로 지웁니다. 링크를 아는 사람은 누구나 볼 수 있지만");
    expect(text).toContain("풀이 하나에 남은 후속 질문 수는 무작위 풀이 번호로 8일 동안 보관한 뒤 자동으로 지웁니다.");
    cleanup();
    // From: in the text, with the new 시행일.
    vi.setSystemTime(Date.parse("2026-10-28T00:00:00+09:00"));
    const { container } = render(<PrivacyPage />);
    text = container.textContent ?? "";
    expect(text).not.toContain("개정 예정 · 2026년 10월 28일");
    expect(text).toContain(
      "풀이의 공유 사본은 그 풀이에서 공유 그만하기를 누르거나, 공유한 기기에서 그 풀이를 지우거나, 로그인한 상태로 공유했다면 회원 탈퇴할 때까지 보관하고, 그때 바로 지웁니다. 그 전이라도 공유한 날부터 180일이 지나면 링크와 함께 자동으로 지웁니다.",
    );
    expect(text).toContain("풀이 하나에 남은 후속 질문 수는 무작위 풀이 번호로 일반 풀이는 8일, 프리미엄 풀이는 31일 동안 보관한 뒤 자동으로 지웁니다.");
    expect(container.querySelector('time[datetime="2026-10-28"]')).not.toBeNull();
    expect(text).not.toContain("누를 때까지 보관하고, 누르면 바로 지웁니다");
  });

  describe("privacy: Google Analytics on consent, a revision of its own in force 2026-10-30 00:00 KST", () => {
    const noteOf = (container: HTMLElement, title: string) => [...container.querySelectorAll("p")].find((p) => p.textContent === title)?.parentElement ?? null;
    const MAY = "개정 예정 · 2026년 10월 28일부터 시행";
    const GA = "개정 예정 · 2026년 10월 30일부터 시행";

    it("until then: announced in a box of its own beside the 10/28 one (each with its date), and nothing of it in the text", () => {
      let container = render(<PrivacyPage />).container;
      const may = noteOf(container, MAY);
      const ga = noteOf(container, GA);
      expect(may).not.toBeNull();
      expect(ga).not.toBeNull();
      expect(ga).not.toBe(may);
      expect(may!.textContent).not.toContain("Google");
      for (const part of [
        "방문 통계",
        "허용한 분에 한해 Google 애널리틱스",
        "Google LLC(미국)",
        "IP 주소(위치 추정에만 쓰임)",
        "방문 시각, 페이지에 머문 시간을 모아",
        "이용 통계를 분석",
        "보유 기간: 이벤트 데이터 2개월, 사용자 데이터 14개월(새 방문이 있으면 그때부터 다시 계산), 방문 통계 쿠키는 마지막 방문부터 최대 2년",
        "거부해도 서비스 이용에 제한이 없",
        "2026년 10월 30일부터 이 방침의 방문 통계 설정에서",
      ])
        expect(ga!.textContent, part).toContain(part);
      // The footer's 방문 통계 설정 lands on the notice until the setting exists.
      const anchor = container.querySelector("#analytics");
      expect(anchor?.contains(ga!)).toBe(true);
      expect(anchor!.querySelector("button")).toBeNull();
      expect(container.querySelector('[aria-label="Google LLC"]')).toBeNull();
      expect(container.textContent).not.toContain("_ga");
      expect(container.textContent).toContain("이 이전은 이용자가 요청한 풀이를 만들고 서비스를 제공하는 데 필요한 처리 위탁과 보관이며");
      cleanup();
      // 10/29: the 10/28 revision is in force, the GA one still announced.
      vi.setSystemTime(Date.parse("2026-10-29T23:59:59+09:00"));
      container = render(<PrivacyPage />).container;
      expect(noteOf(container, MAY)).toBeNull();
      expect(noteOf(container, GA)).not.toBeNull();
      expect(container.querySelector('time[datetime="2026-10-28"]')).not.toBeNull();
      expect(container.querySelector("#analytics button")).toBeNull();
    });

    describe("from then", () => {
      beforeEach(() => vi.setSystemTime(Date.parse("2026-10-30T00:00:00+09:00")));

      it("no 개정 예정 left, 시행일 2026-10-30, and the 10/28 revision's lines as they were", () => {
        const { container } = render(<PrivacyPage />);
        const text = container.textContent ?? "";
        expect(text).not.toContain("개정 예정");
        expect(container.querySelector('time[datetime="2026-10-30"]')).not.toBeNull();
        expect(text).toContain("이 방침은 2026년 10월 30일부터 시행합니다.");
        expect(text).toContain("그 전이라도 공유한 날부터 180일이 지나면 링크와 함께 자동으로 지웁니다.");
        expect(text).toContain("풀이 하나에 남은 후속 질문 수는 무작위 풀이 번호로 일반 풀이는 8일, 프리미엄 풀이는 31일 동안 보관한 뒤 자동으로 지웁니다.");
      });

      it("1항 lists what GA collects, as the code sends it (redacted addresses), and no behaviour it does not send; 2항 adds 이용 통계 분석", () => {
        const { container } = render(<PrivacyPage />);
        const items = container.querySelector("#items")?.textContent ?? "";
        for (const part of [
          "방문 통계(허용한 경우에만)",
          "Google 애널리틱스 쿠키에 담긴 무작위 식별값",
          "방문한 페이지의 주소(공유·초대·기록 번호와 결제 정보는 지우고, 홍보 링크의 utm 꼬리표만 남긴 주소)와 페이지 제목",
          "이전 페이지의 주소(스타로그의 페이지는 같은 방식으로 지운 주소, 다른 사이트는 그 사이트의 도메인만)",
          "기기·브라우저·화면 정보",
          "IP 주소(위치 추정에만 쓰이고 Google 애널리틱스에 저장되지 않음)",
          "대략적 위치(접속한 IP 주소로 Google이 추정하는 국가·도시 수준)",
          "방문 시각",
          "페이지에 머문 시간",
        ])
          expect(items, part).toContain(part);
        expect(items).not.toMatch(/이용 행동|스크롤|클릭/);
        expect(container.querySelector("#purposes")?.textContent).toContain("이용 통계 분석");
      });

      it("3항 gives GA's retention as the property sets it: events 2 months, users 14 months (reset on a new visit), cookies up to 2 years, aggregate reports apart", () => {
        const retention = render(<PrivacyPage />).container.querySelector("#retention")?.textContent ?? "";
        expect(retention).toContain(
          "Google 애널리틱스의 방문 통계 중 이벤트 데이터는 2개월, 사용자 데이터는 14개월(그 사이 새 방문이 있으면 그때부터 다시 계산) 동안 보관한 뒤 Google이 자동으로 지웁니다.",
        );
        expect(retention).toContain("페이지별 방문 수 같은 합계 보고서는 이 기간과 관계없이 남을 수 있습니다.");
        expect(retention).toContain("방문 통계 쿠키는 브라우저에 마지막 방문부터 최대 2년 동안 남습니다.");
        expect(retention).not.toContain("정책에 따");
      });

      it("the cookie section's #analytics names _ga and _ga_8X11ZGFZKY on .yeolmaeapps.kr, says the operator views GA reports, and how to refuse and withdraw (with the setting there)", () => {
        vi.stubEnv("ADSENSE_CLIENT", "");
        const { container } = render(<PrivacyPage />);
        const cookies = container.querySelector("#cookies")!;
        const analytics = cookies.querySelector("#analytics");
        expect(analytics).not.toBeNull();
        const text = analytics!.textContent ?? "";
        for (const part of [
          "방문 통계 쿠키(허용한 경우에만)",
          "_ga",
          "_ga_8X11ZGFZKY",
          "(.yeolmaeapps.kr)",
          "마지막 방문부터 최대 2년 뒤 만료",
          "운영자는 Google 애널리틱스 보고서에서",
          "처음 방문할 때 나오는 안내",
          "거부하면 Google 애널리틱스를 불러오지 않고",
          "이 브라우저의 방문 통계 쿠키를 지웁니다",
          "거부해도 서비스 이용에 제한이 없습니다",
          "그것만으로는 방문 통계가 멈추지 않을 수 있으니",
        ])
          expect(text, part).toContain(part);
        expect(text).not.toContain("개인을 알아볼 수 없");
        // First: the transfer abroad, with a link to the Google LLC card.
        const first = analytics!.querySelector("li");
        expect(first?.textContent).toBe("방문 통계 정보는 Google LLC(미국)로 국외 이전됩니다. 이전 항목과 보유 기간은 5항 처리 위탁과 국외 이전의 Google LLC에 있습니다.");
        expect(first?.querySelector("a")?.getAttribute("href")).toBe("#processors");
        expect(container.querySelector("#processors")).not.toBeNull();
        // The setting itself: the two choices.
        expect([...analytics!.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["허용", "거부"]);
        // No longer "no behaviour-tracking cookies" while ads are off.
        expect(cookies.textContent).not.toContain("광고나 행동 추적을 위한 쿠키는 쓰지 않습니다");
        expect(cookies.textContent).toContain("방문 통계를 허용한 경우에만 아래 방문 통계 쿠키를 씁니다. 광고 쿠키는 쓰지 않습니다.");
        cleanup();
        vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
        const on = render(<PrivacyPage />).container.querySelector("#cookies")?.textContent ?? "";
        expect(on).toContain("방문 통계를 허용한 경우에만 아래 방문 통계 쿠키를 씁니다. 가이드 글 페이지에서는 아래 광고 쿠키가 쓰일 수 있습니다.");
      });

      it("4항 has a Google LLC card on consent (제28조의8 제1항 제1호), and the 'needed to provide the service' basis names only Anthropic and Cloudflare", () => {
        const { container } = render(<PrivacyPage />);
        const google = container.querySelector('[aria-label="Google LLC"]');
        expect(google).not.toBeNull();
        const rows = Object.fromEntries([...google!.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? ""]));
        expect(rows["국가"]).toBe("미국");
        expect(rows["이전 목적"]).toBe("이용 통계 분석(방문 통계를 허용한 경우에만)");
        expect(rows["이전 항목"]).toContain("페이지에 머문 시간");
        expect(rows["이전 항목"]).toContain("방문한 페이지의 주소(공유·초대·기록 번호와 결제 정보는 지우고");
        expect(rows["이전 시기와 방법"]).toBe("방문 통계를 허용한 뒤 페이지를 열고 머무는 동안 암호화된 연결(HTTPS)로 전송");
        expect(rows["이전 항목"]).toContain("IP 주소(위치 추정에만 쓰이고 Google 애널리틱스에 저장되지 않음)");
        expect(rows["보유·이용 기간"]).toContain("방문 통계 쿠키는 마지막 방문부터 최대 2년");
        expect(rows["보유·이용 기간"]).toContain("이벤트 데이터 2개월, 사용자 데이터 14개월");
        expect(rows["이전 근거"]).toBe("정보주체의 동의(「개인정보 보호법」 제28조의8 제1항 제1호)");
        expect(rows["거부 방법과 거부 시 불이익"]).toBe("처음 방문할 때 나오는 안내나 이 방침 6항의 방문 통계 설정에서 거부하거나 동의를 철회할 수 있으며, 거부해도 서비스 이용에 제한이 없습니다.");
        expect(google!.querySelector('a[href="https://policies.google.com/privacy"]')?.textContent).toBe("policies.google.com/privacy");
        const processors = container.querySelector("#processors")?.textContent ?? "";
        expect(processors).toContain("Anthropic과 Cloudflare로의 이전은 이용자가 요청한 풀이를 만들고 서비스를 제공하는 데 필요한 처리 위탁과 보관이며");
        expect(processors).toContain("Google LLC로의 이전은 방문 통계를 허용한 분의 동의에 따른 것으로");
        expect(processors).not.toContain("이 이전은 이용자가 요청한");
      });
    });
  });

  it("privacy: names the readings the account keeps the same way everywhere: opened while logged in with a payment (lib/readings/store.ts); 오픈 기념 무료 readings stay on the device", () => {
    const text = render(<PrivacyPage />).container.textContent ?? "";
    // The broader "readings opened while logged in" would also cover a 오픈 기념 무료 reading, which is never saved to the account.
    expect(text).not.toContain("로그인해서 연 풀이");
    const kept = "로그인해 결제하고 연 풀이";
    expect(text.split(kept).length - 1).toBeGreaterThanOrEqual(7);
    expect(text).toContain("로그인하지 않고 연 풀이와 오픈 기념 무료로 연 풀이의 입력은 서버에 저장하지 않고");
  });

  it("privacy: no longer offers the signup gift; describes the grant records still kept for gifts already given", () => {
    const text = render(<PrivacyPage />).container.textContent ?? "";
    expect(text).not.toMatch(/가입 선물로 연|중복 지급 방지|첫 이용 무료/);
    expect(text).toContain("이미 지급한 가입 선물의 지급 기록 관리(가입 선물은 더 이상 드리지 않습니다)");
    expect(text).toContain("가입 선물은 더 이상 드리지 않습니다. 이미 지급한 가입 선물의 지급 기록(카카오 회원번호나 Google 계정 식별값을 되돌릴 수 없게 바꾼 값과 지급 시각)은 탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.");
  });

  it("privacy: discloses 별자리 인연 (stored items, public ranking, share images, D1, retention, age) while it is live", () => {
    expect(SITE.features.bonds).toBe(true);
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    for (const phrase of [
      "별자리 인연",
      "닉네임",
      "한 줄",
      "인연 점수",
      "생년월일은 점수를 계산하는 데만 쓰고 저장하지 않습니다",
      "랭킹",
      "공유 이미지",
      "새로 채우거나 바꾸면 이전 별은 삭제",
      "만 14세 이상인지 확인합니다",
      "sl_uid",
      "sl_fid",
    ]) {
      expect(text).toContain(phrase);
    }
    const cloudflare = container.querySelector('[aria-label="Cloudflare, Inc."]')?.textContent ?? "";
    expect(cloudflare).toContain("Cloudflare D1");
    expect(cloudflare).toMatch(/별자리 인연 정보의 저장/);
    // sections stay numbered in order once 별자리 인연 is section 4
    const titles = [...container.querySelectorAll("h2")].map((h) => h.textContent ?? "");
    expect(titles.map((t) => Number(t.split(".")[0])).filter(Boolean)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(text).toContain("쿠키(아래 6항)");
  });

  it("terms: lists 별자리 인연 with its nickname and message rules and the owner's right to remove stars", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("별자리 인연: 친구 초대");
    expect(text).toContain("닉네임은 2~10자로");
    expect(text).toContain("한 줄(40자 이내)");
    expect(text).toContain("자기 별자리의 별을 언제든 지울 수 있습니다");
    expect(text).toContain("모든 번호의 확률이 같습니다");
    expect(text).not.toContain("로또");
  });

  it("terms: calls readings entertainment, not professional advice, and sets the age at 14", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("오락과 자기 성찰");
    expect(text).toContain("만 14세 이상");
  });
});
