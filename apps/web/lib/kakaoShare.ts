import { SITE } from "./config";

/**
 * 카카오톡 공유 (Kakao JavaScript SDK). Only when NEXT_PUBLIC_KAKAO_JS_KEY is set; the SDK is
 * loaded from Kakao's CDN on the first tap, with the integrity value Kakao documents for this
 * version (developers.kakao.com/docs/ko/javascript/download, checked 2026-10-01).
 */

export const KAKAO_SDK = {
  src: "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js",
  integrity: "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy",
} as const;

interface KakaoLink {
  mobileWebUrl: string;
  webUrl: string;
}

export interface KakaoSdk {
  init(key: string): void;
  isInitialized(): boolean;
  Share: {
    sendDefault(template: {
      objectType: "feed";
      content: { title: string; imageUrl: string; link: KakaoLink };
      buttons?: Array<{ title: string; link: KakaoLink }>;
    }): void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

/** The JavaScript key, inlined at build time; empty means no Kakao button. */
export const kakaoKey = (): string => process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

let loading: Promise<KakaoSdk> | null = null;

/** Loads the SDK once (script tag with integrity), then initializes it with the key. */
export function loadKakao(key: string): Promise<KakaoSdk> {
  const ready = (sdk: KakaoSdk) => {
    if (!sdk.isInitialized()) sdk.init(key);
    return sdk;
  };
  if (window.Kakao) return Promise.resolve(ready(window.Kakao));
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = KAKAO_SDK.src;
    script.integrity = KAKAO_SDK.integrity;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => (window.Kakao ? resolve(ready(window.Kakao)) : reject(new Error("kakao sdk missing")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("kakao sdk failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Shares the text with the site's link and OG image as a feed message. */
export async function shareToKakao(text: string, key: string = kakaoKey()): Promise<void> {
  const sdk = await loadKakao(key);
  const link = { mobileWebUrl: SITE.url, webUrl: SITE.url };
  sdk.Share.sendDefault({
    objectType: "feed",
    content: { title: text, imageUrl: `${SITE.url}/opengraph-image`, link },
    buttons: [{ title: `${SITE.nameKo} 열기`, link }],
  });
}
