"use client";

import { useEffect, useState } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { Button } from "@/components/ui/Button";
import { inviteUrl, shareLink, type ShareOutcome } from "@/lib/bonds/client";
import { SITE } from "@/lib/config";
import { kakaoKey, shareToKakao } from "@/lib/kakaoShare";
import s from "./bonds.module.css";

type InviteShareButtonProps = {
  code: string;
  sign: SignId;
  filled: number;
  ownerNickname: string;
  /** One button only (the home row): 카카오톡으로 초대하기 where there is a key, else 다른 앱으로 보내기. */
  single?: boolean;
  /** The first button's style: the screen's gold primary, or a secondary (the home row). */
  variant?: "primary" | "secondary";
  /** Kakao JavaScript key; defaults to NEXT_PUBLIC_KAKAO_JS_KEY. Empty: no Kakao button. */
  kakao?: string;
};

const TOAST: Partial<Record<ShareOutcome | "kakao", string>> = {
  copied: "초대 링크를 복사했어요",
  failed: "링크를 복사하지 못했어요. 잠시 뒤에 다시 시도해 주세요",
};

/** What the invite says, e.g. "용우님의 양자리에 별이 되어 주세요": no code to type, the link carries it. */
export function inviteTitle(ownerNickname: string, sign: SignId): string {
  return `${ownerNickname}님의 ${getConstellation(sign).ko}에 별이 되어 주세요`;
}

/**
 * 초대 한 번에 (owner 2026-10-23, the 2026-10-02 decision: no copying, making or typing codes): 카카오톡으로 초대하기
 * sends a Kakao feed (lib/kakaoShare.ts, as shares do) with the constellation's invite image, the invite line and
 * 별 되러 가기 to /b/<code>; 다른 앱으로 보내기 is the phone's share sheet (title, text and the link; never a file), or
 * the link copied where there is none. Without a Kakao key, 다른 앱으로 보내기 alone, as the main button.
 */
export function InviteShareButton({ code, sign, filled, ownerNickname, single = false, variant = "primary", kakao = kakaoKey() }: InviteShareButtonProps) {
  const [toast, setToast] = useState("");
  // Without the system share sheet (most computers) the button copies the link, and says so (QA L7).
  const [sheet, setSheet] = useState(true);
  useEffect(() => setSheet(typeof navigator.share === "function"), []);
  const otherLabel = sheet ? "다른 앱으로 보내기" : "링크 복사";
  const url = inviteUrl(code);
  const title = inviteTitle(ownerNickname, sign);
  const slots = getConstellation(sign).slots;

  const sendKakao = async () => {
    setToast("");
    try {
      await shareToKakao(title, kakao, {
        url,
        imageUrl: `${SITE.url}/api/og/invite/${code}`,
        imageSize: { width: 1200, height: 630 },
        title,
        description: `생년월일과 카드 한 장이면 두 사람의 인연 점수가 나와요 · 별 ${filled}/${slots}`,
        button: "별 되러 가기",
      });
    } catch {
      // what to do instead (QA L11)
      setToast(`카카오톡을 열지 못했어요. 아래 ${otherLabel}로 보내 주세요`);
    }
  };

  const sendOther = async () => {
    setToast("");
    setToast(TOAST[await shareLink(title, url, `${SITE.nameKo} 별자리 인연`)] ?? "");
  };

  const other = (style: "primary" | "secondary") => (
    <Button variant={style} size={style === "primary" ? "lg" : "md"} block onClick={sendOther}>
      {otherLabel}
    </Button>
  );

  return (
    <>
      {kakao ? (
        <>
          <Button variant={variant} size={variant === "primary" ? "lg" : "md"} block onClick={sendKakao}>
            카카오톡으로 초대하기
          </Button>
          {single ? null : other("secondary")}
        </>
      ) : (
        other(variant)
      )}
      <p className={s.toast} role="status">
        {toast}
      </p>
    </>
  );
}
