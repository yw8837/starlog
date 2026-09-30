"use client";

import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { useCopy } from "@/lib/useCopy";
import s from "./ShareButton.module.css";

type ShareButtonProps = {
  /**
   * What the share sheet says with the link, e.g. "나의 스타로그 · 뜸해진 연락 앞에서".
   * Never the user's question, note or birth data.
   */
  text: string;
  /** Readings live on this device only, so the service's home is what gets shared. */
  url?: string;
  title?: string;
  /** Dark-ink style for a paper card. */
  onPaper?: boolean;
};

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M12 15V3.5" />
    <path d="m7.5 8 4.5-4.5L16.5 8" />
    <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);

/**
 * 공유하기: the system share sheet where there is one (phones), otherwise the link is copied and a
 * small toast says so. Secondary style, never the screen's gold primary.
 */
export function ShareButton({ text, url = SITE.url, title = SITE.nameKo, onPaper = false }: ShareButtonProps) {
  const { state, copy } = useCopy();

  const share = async () => {
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

  return (
    <>
      <Button variant="secondary" size="md" onPaper={onPaper} onClick={share} trailing={<ShareIcon />}>
        공유하기
      </Button>
      <p className={s.toast} role="status" data-shown={state === "idle" ? undefined : ""}>
        {state === "copied" ? "링크를 복사했어요" : state === "failed" ? "링크를 복사하지 못했어요" : ""}
      </p>
    </>
  );
}
