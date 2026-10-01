"use client";

import { useState } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { shareLink, type ShareOutcome } from "@/lib/bonds/client";
import s from "./bonds.module.css";

type ShareConstellationProps = {
  constellationId: string;
  sign: SignId;
  total: number;
  /** the screen's gold primary, or a secondary */
  primary: boolean;
};

const TOAST: Partial<Record<ShareOutcome, string>> = { copied: "링크를 복사했어요", failed: "링크를 복사하지 못했어요" };

/** 공유하기 for a completed constellation: the sign's ranking link with a short line (no scores of friends). */
export function ShareConstellation({ sign, total, primary }: ShareConstellationProps) {
  const [toast, setToast] = useState("");
  const def = getConstellation(sign);
  const share = async () => {
    setToast("");
    const outcome = await shareLink(`내 ${def.ko} 완성! 인연 ${total}점 · ${SITE.nameKo} 별자리 인연`, `${SITE.url}/ranking/${sign}`);
    setToast(TOAST[outcome] ?? "");
  };
  return (
    <>
      <Button variant={primary ? "primary" : "secondary"} block onClick={share}>
        공유하기
      </Button>
      <p className={s.toast} role="status">
        {toast}
      </p>
    </>
  );
}
