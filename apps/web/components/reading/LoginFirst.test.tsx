// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginFirst } from "./LoginFirst";

/**
 * The login panel in place of a free AI reading (owner 2026-11-04). In an app's own browser (Instagram, Threads…) a Kakao
 * login can leave the app and come back elsewhere (code review 2026-11-04 #9): one plain line says what to do then.
 */

const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0";
const THREADS = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Barcelona 350.0";
const KAKAOTALK = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.8.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const LINE = "인스타그램·스레드 같은 앱 안에서 로그인이 끝나지 않으면 Safari·Chrome에서 열어 주세요. 브라우저를 옮기면 처음부터 다시 해야 해요.";

const panel = () => render(<LoginFirst title="맛보기 풀이는 로그인하고 볼 수 있어요" body="본문" href="/login?next=%2Ftarot%2Fresult" action="로그인하고 맛보기 보기" />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginFirst", () => {
  it("gives each panel its own heading id, so two on one screen each name themselves (code review 2026-11-06)", () => {
    render(
      <>
        <LoginFirst title="첫째 패널" body="본문" href="/login" action="로그인" />
        <LoginFirst title="둘째 패널" body="본문" href="/login" action="로그인" />
      </>,
    );
    expect(screen.getByRole("region", { name: "첫째 패널" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "둘째 패널" })).toBeTruthy();
    const ids = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.id);
    expect(new Set(ids).size).toBe(2);
  });

  it.each([["Instagram", INSTAGRAM], ["Threads", THREADS]])("adds one line in %s's own browser on how to finish the login outside it", async (_name, userAgent) => {
    vi.stubGlobal("navigator", { ...navigator, userAgent });
    panel();
    expect(await screen.findByText(LINE)).toBeTruthy();
  });

  it.each([["KakaoTalk (its Kakao login stays inside)", KAKAOTALK], ["a phone's browser", CHROME]])("says nothing more in %s", (_name, userAgent) => {
    vi.stubGlobal("navigator", { ...navigator, userAgent });
    panel();
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.getByRole("link", { name: "로그인하고 맛보기 보기" }).getAttribute("href")).toBe("/login?next=%2Ftarot%2Fresult");
  });
});
