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

/**
 * Where a share leads, always the shared thing's own page (owner 2026-10-23: a share that opened the home misled), with
 * its preview image and what the message says.
 */
export interface KakaoTarget {
  url: string;
  imageUrl: string;
  /** The first button, to the shared page ("풀이 보기"). */
  button: string;
  /** The message's title; the share's text when absent. */
  title?: string;
  /** One or two lines under the title: the shared page's first sentence (lib/share/preview.ts). */
  description?: string;
  /** The second button: the visitor's own try ("나도 뽑아 보기" → /tarot/start). */
  second?: { title: string; url: string };
  /** The preview image's size; the share pages' own is 1200×600 (2:1, as Kakao's feed recommends). */
  imageSize?: { width: number; height: number };
}

/** The share pages' preview image (app/api/og/share/[id]): 2:1 and 800px or more wide, as Kakao's feed recommends. */
export const SHARE_IMAGE = { width: 1200, height: 600 } as const;

/** Shares a feed message: the image, the title and description, 풀이 보기 to the shared page and the visitor's own try. */
export async function shareToKakao(text: string, key: string, target: KakaoTarget): Promise<void> {
  const sdk = await loadKakao(key);
  const link = { mobileWebUrl: target.url, webUrl: target.url };
  const size = target.imageSize ?? SHARE_IMAGE;
  sdk.Share.sendDefault({
    objectType: "feed",
    content: {
      title: target.title ?? text,
      ...(target.description ? { description: target.description } : {}),
      imageUrl: target.imageUrl,
      imageWidth: size.width,
      imageHeight: size.height,
      link,
    },
    buttons: [
      { title: target.button, link },
      ...(target.second ? [{ title: target.second.title, link: { mobileWebUrl: target.second.url, webUrl: target.second.url } }] : []),
    ],
  });
}
