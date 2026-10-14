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
      content: { title: string; description?: string; imageUrl: string; imageWidth?: number; imageHeight?: number; link: KakaoLink };
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

/** The script being loaded (shared by taps while it loads). */
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
    const fail = (error: Error) => {
      loading = null;
      script.remove();
      reject(error);
    };
    script.onload = () => {
      try {
        if (!window.Kakao) throw new Error("kakao sdk missing");
        resolve(ready(window.Kakao));
        // Loaded: later taps use window.Kakao directly.
        loading = null;
      } catch (error) {
        // A failed init (e.g. a wrong key) must not stick: the next tap tries again.
        delete window.Kakao;
        fail(error instanceof Error ? error : new Error("kakao init failed"));
      }
    };
    script.onerror = () => fail(new Error("kakao sdk failed to load"));
    document.head.appendChild(script);
  });
  return loading;
}

/** Where a Kakao message leads: the site by default, or a shared reading with its own preview image. */
export interface KakaoTarget {
  url: string;
  imageUrl: string;
  button: string;
  /** One or two lines under the title (owner 10/13: the thumbnail, a short intro and the cards). */
  description?: string;
}

const SITE_TARGET: KakaoTarget = {
  url: SITE.url,
  imageUrl: `${SITE.url}/opengraph-image`,
  button: `${SITE.nameKo} 열기`,
  description: "타로와 사주로 내 고민을 풀어 주는 곳이에요. 지금의 한 장은 언제나 무료예요.",
};

/** Every preview image we send is 1200×630: Kakao keeps that shape instead of cropping it. */
const IMAGE = { imageWidth: 1200, imageHeight: 630 } as const;

/** Shares the text with a link and its image as a feed message (the site's, unless `target` says otherwise). */
export async function shareToKakao(text: string, key: string = kakaoKey(), target: KakaoTarget = SITE_TARGET): Promise<void> {
  const sdk = await loadKakao(key);
  const link = { mobileWebUrl: target.url, webUrl: target.url };
  sdk.Share.sendDefault({
    objectType: "feed",
    content: { title: text, ...(target.description ? { description: target.description } : {}), imageUrl: target.imageUrl, ...IMAGE, link },
    buttons: [{ title: target.button, link }],
  });
}
