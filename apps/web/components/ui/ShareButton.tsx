"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { kakaoKey, shareToKakao, type KakaoTarget } from "@/lib/kakaoShare";
import { useCopy } from "@/lib/useCopy";
import s from "./ShareButton.module.css";

type ShareButtonProps = {
  /**
   * What the share sheet says with the link, e.g. "스타로그에서 뽑은 카드 · 은둔자 · 별".
   * Never the user's question, note or birth data.
   */
  text: string;
  title?: string;
  /** Dark-ink style for a paper card. */
  onPaper?: boolean;
  /** Kakao JavaScript key; defaults to NEXT_PUBLIC_KAKAO_JS_KEY. Empty: no Kakao button. */
  kakao?: string;
  /** The link to share instead of the service's home, with its Kakao message (a shared reading, /s/<id>). */
  target?: KakaoTarget;
};

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M12 15V3.5" />
    <path d="m7.5 8 4.5-4.5L16.5 8" />
    <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);

const TalkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" focusable="false">
    <path d="M12 4C7 4 3 7.2 3 11.1c0 2.5 1.7 4.7 4.2 6l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.3 0 .7.1 1 .1 5 0 9-3.2 9-7.2S17 4 12 4z" fill="currentColor" />
  </svg>
);

/**
 * 공유하기: the system share sheet where there is one (phones), otherwise the link is copied and a
 * small toast says so. When the copy is refused too, the link is shown in a field to copy by hand.
 * The link is the service's home (SITE.url) unless `target` names another: a reading lives on its
 * device, and only its own share link (made on purpose, ShareResultButton) shows it to others. With
 * a Kakao key, 카카오톡으로 보내기 sits beside it (the SDK loads on the first tap). Secondary style,
 * never the screen's gold primary.
 */
export function ShareButton({ text, title = SITE.nameKo, onPaper = false, kakao = kakaoKey(), target }: ShareButtonProps) {
  const { state, copy } = useCopy();
  const [kakaoFailed, setKakaoFailed] = useState(false);
  // The link to copy by hand, once the clipboard refused it (stays until the next try).
  const [manual, setManual] = useState(false);
  const url = target?.url ?? SITE.url;

  useEffect(() => {
    if (state === "failed") setManual(true);
  }, [state]);

  const share = async () => {
    setManual(false);
    const data = { title, text, url };
    if (typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        // Closing the share sheet is not an error; anything else falls back to copying the link.
        if ((error as { name?: unknown } | null)?.name === "AbortError") return;
      }
    }
    await copy(url);
  };

  const sendKakao = async () => {
    setKakaoFailed(false);
    try {
      await shareToKakao(text, kakao, target);
    } catch {
      setKakaoFailed(true);
    }
  };

  const toast = kakaoFailed ? "카카오톡을 열지 못했어요" : state === "copied" ? "링크를 복사했어요" : state === "failed" ? "링크를 복사하지 못했어요" : "";

  const buttons = (
    <>
      <Button variant="secondary" size="md" onPaper={onPaper} onClick={share} trailing={<ShareIcon />}>
        공유하기
      </Button>
      {kakao ? (
        <Button variant="secondary" size="md" onPaper={onPaper} onClick={sendKakao} trailing={<TalkIcon />}>
          카카오톡으로 보내기
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      {kakao ? <span className={s.row}>{buttons}</span> : buttons}
      <p className={s.toast} role="status" data-shown={toast ? "" : undefined}>
        {toast}
      </p>
      {manual ? (
        <label className={s.manual}>
          <span className={s.manualLabel}>링크를 길게 눌러 복사해 주세요</span>
          <input className={s.manualField} type="url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
    </>
  );
}
