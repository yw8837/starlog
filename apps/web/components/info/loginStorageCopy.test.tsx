// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import PricingPage from "@/app/pricing/page";
import { SajuGuide, TarotGuide } from "@/components/seo/toolGuides";
import { faqGroups } from "@/lib/faq";
import { helpGroups } from "@/lib/helpGuide";
import { llmsFullTxt, serviceFacts } from "@/lib/llms";

afterEach(cleanup);

/**
 * SEO-03 (QA 2026-10-14): the pages used to disagree on login and storage. Login (Kakao/Google) and
 * payments open by a runtime switch while these pages are prerendered, so every page has to say the
 * same thing, true before and after the switch: readings are kept on this device; readings opened while
 * logged in are also kept in the account; without logging in nothing about them is stored on the server.
 */

const text = (node: ReactElement) => render(node).container.textContent ?? "";

const faq = () => faqGroups().flatMap((group) => group.entries.flatMap((entry) => [entry.q, ...entry.a])).join("\n");
const help = () =>
  helpGroups()
    .flatMap((group) => group.items.flatMap((item) => [item.title, item.sub, item.body ?? "", ...(item.steps ?? []), item.tip ?? ""]))
    .join("\n");

/** Every surface that talks about where a reading is kept. */
const SURFACES: ReadonlyArray<readonly [string, () => string]> = [
  ["/faq", faq],
  ["/help", help],
  ["llms.txt facts", () => serviceFacts().join("\n")],
  ["llms-full.txt", () => llmsFullTxt()],
  ["/about", () => text(<AboutPage />)],
  ["/pricing", () => text(<PricingPage />)],
  ["/tarot/new guide", () => text(<TarotGuide />)],
  ["/saju/new guide", () => text(<SajuGuide />)],
];

/** What the pages said before: true only while login does not exist. */
const RETIRED = [
  /모든 기능을 쓸 수 있어요/,
  /로그인이 없어서/,
  /풀이 기록을 쌓지 않아요/,
  /로그인 없이 써요/,
  /기기\(브라우저\)에만 저장/,
];

/** The one sentence about the account, as /pricing words it (the guide adds "도"). */
const ACCOUNT = /로그인해 결제하고 연 풀이는 계정에도 보관돼 다른 기기에서도? 볼 수 있어요/;

const sentences = (value: string) => value.split(/(?<=[.!?])\s+|\n/).filter(Boolean);

describe("login and storage wording (SEO-03)", () => {
  it.each(SURFACES)("%s no longer says everything works without login, or that nothing is stored on the server", (_name, read) => {
    const page = read();
    for (const retired of RETIRED) expect(page, String(retired)).not.toMatch(retired);
  });

  // The 맛보기 need a login from 2026-11-04 and their input is never stored, logged in or not: a sentence may say so of them.
  it.each(SURFACES)("%s: a sentence that says the server stores nothing is about readings opened without logging in, or the 맛보기", (_name, read) => {
    for (const sentence of sentences(read()).filter((line) => /서버에는? [^.]*(저장하지|쌓지)/.test(line))) {
      expect(sentence).toMatch(/로그인하지 않고|맛보기/);
    }
  });

  it.each(SURFACES.filter(([name]) => name !== "/saju/new guide"))("%s tells that readings opened while logged in are also kept in the account", (_name, read) => {
    expect(read()).toMatch(ACCOUNT);
  });

  it("/saju/new guide: the birth details kept on this device are also kept in the account for a logged-in reading", () => {
    const page = text(<SajuGuide />);
    expect(page).toContain("사주 입력 정보는 이 기기의 브라우저에 저장되고");
    expect(page).toMatch(/로그인해 결제하고 연 풀이는 입력한 정보와 함께 암호화해 계정에도 보관돼요/);
  });

  it("/faq: the records answer names both places, and the login answer no longer claims every feature works without login", () => {
    const entries = faqGroups().flatMap((group) => group.entries);
    const records = entries.find((entry) => entry.id === "records")?.a.join(" ") ?? "";
    expect(records).toContain("지금 쓰는 기기의 브라우저에");
    expect(records).toMatch(ACCOUNT);
    expect(records).toContain("이 기기에만 남은 풀이와 맛보기는 다른 기기나 다른 브라우저에서는 보이지 않아요");
    const entry = entries.find((e) => e.id === "login");
    const login = entry?.a.join(" ") ?? "";
    // owner 2026-11-04: every AI reading needs a login; what stays open without one is listed, nothing more.
    expect(login).toContain("타로와 사주의 맛보기, 오늘의 한 장, 결제, 별자리 인연의 내 별자리 만들기는 카카오나 Google로 로그인하고 써요");
    expect(login).toContain("질문 만들기와 카드 뽑기, 무료 사주 명식, 지금의 한 장, 탄생 카드, 2027 키워드, 이번 주 행운 번호, 친구의 별자리 인연 초대, 공유받은 링크는 로그인 없이 쓸 수 있어요");
    expect(login).not.toContain("첫 풀이");
    expect(login).not.toContain("가입 선물");
    // 오픈 기념 무료 is per logged-in account (owner 2026-10-27), said while it runs
    expect(entry?.opening).toContain("오픈 기념 무료 타로 전체 풀이도 로그인하고 받아요");
  });
});
