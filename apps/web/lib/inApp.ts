/**
 * In-app browsers, told apart by their user agent (server routes read the request's header, screens read
 * navigator.userAgent). Threads says "Barcelona", Facebook FBAN/FBAV, NAVER "NAVER(inapp", Daum "DaumApps",
 * Everytime "everytimeApp", X "Twitter for iPhone" (any word starting "Twitter").
 */

/** KakaoTalk's in-app browser: its Kakao login rides on the app's own session (lib/account/kakao.ts). */
export const isKakaoTalk = (userAgent: string): boolean => /KAKAOTALK/i.test(userAgent);

/** KakaoTalk, Instagram, Threads, Facebook, NAVER, LINE, Daum, Everytime, X: window.print() usually does nothing there (PDF로 저장). */
export const isInAppBrowser = (userAgent: string): boolean =>
  isKakaoTalk(userAgent) || /Instagram|Barcelona|FBAN|FBAV|NAVER\(inapp|\bLine\/|DaumApps|everytimeApp|\bTwitter/.test(userAgent);

/** iPhone, iPad (one asking for the desktop site says Macintosh, with touch): its Safari may never send beforeprint. */
export const isIos = (userAgent: string, touchPoints = 0): boolean =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
