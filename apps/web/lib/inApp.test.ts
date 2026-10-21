import { describe, expect, it } from "vitest";
import { isInAppBrowser, isKakaoTalk } from "./inApp";

const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  kakao: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410110",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.20.104 (iPhone15,2; iOS 18_0; ko_KR; ko; scale=3.00; 1179x2556)",
  threads: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.20.104 (iPhone15,2; iOS 18_0; ko_KR; ko)",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBLC/ko_KR]",
  naver: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.1)",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0",
  daum: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 DaumApps/8.10.0",
};

describe("in-app browsers (PDF로 저장: window.print() does nothing there)", () => {
  it("names KakaoTalk, Instagram, Threads, Facebook, NAVER, LINE and Daum", () => {
    for (const ua of [UA.kakao, UA.instagram, UA.threads, UA.facebook, UA.naver, UA.line, UA.daum]) expect(isInAppBrowser(ua), ua).toBe(true);
  });

  it("leaves the phone's own browsers and desktop alone", () => {
    for (const ua of [UA.chromeAndroid, UA.safariIos, UA.samsung, UA.desktop, ""]) expect(isInAppBrowser(ua), ua).toBe(false);
  });

  it("tells KakaoTalk apart (its login rides on the app: lib/account/kakao.ts)", () => {
    expect(isKakaoTalk(UA.kakao)).toBe(true);
    expect(isKakaoTalk(UA.kakao.replace("KAKAOTALK", "kakaotalk"))).toBe(true);
    expect(isKakaoTalk(UA.instagram)).toBe(false);
    expect(isKakaoTalk(UA.chromeAndroid)).toBe(false);
  });
});
