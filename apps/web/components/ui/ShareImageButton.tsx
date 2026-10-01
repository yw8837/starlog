"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import s from "./ShareButton.module.css";
import own from "./ShareImageButton.module.css";

type ShareImageButtonProps = {
  /** a same-origin PNG route (e.g. /api/og/bonds/<id>) */
  imageUrl: string;
  fileName: string;
  /** what the share sheet says with the image; never a question, a note or birth data */
  shareText: string;
  shareUrl: string;
  /** the screen's gold primary, or a secondary */
  primary?: boolean;
  label?: string;
};

/** What actually happened, step by step: the toast never claims a step that failed. */
type Toast = "" | "saved" | "savedNoCopy" | "failed";

const TOAST: Record<Exclude<Toast, "">, string> = {
  saved: "이미지를 저장하고 링크를 복사했어요",
  savedNoCopy: "이미지를 저장했어요. 링크는 복사하지 못해서 아래에 적어 둘게요",
  failed: "이미지를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요",
};

/**
 * Shares a PNG: the system share sheet with the file where the device can share files (phones);
 * otherwise the image is downloaded and the link copied. The toast reports each step as it went, and
 * when the link could not be copied it is shown under the button to copy by hand.
 */
export function ShareImageButton({ imageUrl, fileName, shareText, shareUrl, primary = false, label = "공유하기" }: ShareImageButtonProps) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>("");

  const share = async () => {
    setBusy(true);
    setToast("");
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const data = { files: [file], text: shareText, url: shareUrl };
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(data);
          return;
        } catch (error) {
          if ((error as { name?: unknown } | null)?.name === "AbortError") return;
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      let copied = false;
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        // the image is saved either way; the link is shown instead
      }
      setToast(copied ? "saved" : "savedNoCopy");
    } catch {
      setToast("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={primary ? "primary" : "secondary"} block onClick={share} disabled={busy}>
        {busy ? "이미지를 만드는 중이에요" : label}
      </Button>
      <p className={s.toast} role="status" data-shown={toast ? "" : undefined}>
        {toast ? TOAST[toast] : ""}
      </p>
      {toast === "savedNoCopy" ? (
        <p className={own.manual}>
          <span>링크</span> <a href={shareUrl}>{shareUrl}</a>
        </p>
      ) : null}
    </>
  );
}
