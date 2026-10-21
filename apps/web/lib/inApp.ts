/**
 * In-app browsers, told apart by their user agent (server routes read the request's header, screens read
 * navigator.userAgent). Threads says "Barcelona", Facebook FBAN/FBAV, NAVER "NAVER(inapp", Daum "DaumApps".
 */

/** KakaoTalk's in-app browser: its Kakao login rides on the app's own session (lib/account/kakao.ts). */
export const isKakaoTalk = (userAgent: string): boolean => /KAKAOTALK/i.test(userAgent);

/** KakaoTalk, Instagram, Threads, Facebook, NAVER, LINE, Daum: window.print() usually does nothing there (PDF로 저장). */
export const isInAppBrowser = (userAgent: string): boolean =>
  isKakaoTalk(userAgent) || /Instagram|Barcelona|FBAN|FBAV|NAVER\(inapp|\bLine\/|DaumApps/.test(userAgent);
