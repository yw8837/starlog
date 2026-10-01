"use client";

import { useState } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { Button } from "@/components/ui/Button";
import { inviteUrl, shareLink, type ShareOutcome } from "@/lib/bonds/client";
import s from "./bonds.module.css";

type InviteShareButtonProps = {
  code: string;
  sign: SignId;
  filled: number;
  variant?: "primary" | "secondary";
  block?: boolean;
  label?: string;
};

const TOAST: Partial<Record<ShareOutcome, string>> = { copied: "초대 문구와 링크를 복사했어요", failed: "복사하지 못했어요. 코드를 직접 알려 주세요" };

/** The invite text spec §3 asks for, e.g. "내 양자리에 별이 되어 줘 (0/4) · 초대코드 K7M4QX". */
export function inviteText(code: string, sign: SignId, filled: number): string {
  const def = getConstellation(sign);
  return `내 ${def.ko}에 별이 되어 줘 (${filled}/${def.slots}) · 초대코드 ${code}`;
}

/** 초대하기: the share sheet with the invite text and link, or both copied where there is none. */
export function InviteShareButton({ code, sign, filled, variant = "primary", block = true, label = "초대하기" }: InviteShareButtonProps) {
  const [toast, setToast] = useState("");
  const share = async () => {
    setToast("");
    const outcome = await shareLink(inviteText(code, sign, filled), inviteUrl(code));
    setToast(TOAST[outcome] ?? "");
  };
  return (
    <>
      <Button variant={variant} size={variant === "primary" ? "lg" : "md"} block={block} onClick={share}>
        {label}
      </Button>
      <p className={s.toast} role="status">
        {toast}
      </p>
    </>
  );
}
