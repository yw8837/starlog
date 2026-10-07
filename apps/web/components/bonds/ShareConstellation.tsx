"use client";

import { getConstellation, type SignId } from "@starlog/core";
import { ShareImageButton } from "@/components/ui/ShareImageButton";
import { SITE } from "@/lib/config";

type ShareConstellationProps = {
  constellationId: string;
  sign: SignId;
  total: number;
  /** the screen's gold primary, or a secondary */
  primary: boolean;
  /** the button's label (default 공유하기) */
  label?: string;
};

/**
 * 공유하기 for a completed constellation: the 1080×1350 share image (friends' nicknames on their stars,
 * never their scores; the owner's 인연 total, and the owner's rank while ranked and public) with the sign's
 * ranking link.
 */
export function ShareConstellation({ constellationId, sign, total, primary, label }: ShareConstellationProps) {
  const def = getConstellation(sign);
  return (
    <ShareImageButton
      imageUrl={`/api/og/bonds/${encodeURIComponent(constellationId)}`}
      fileName={`starlog-${sign}.png`}
      shareText={`내 ${def.ko} 완성! 인연 ${total}점 · ${SITE.nameKo} 별자리 인연`}
      shareUrl={`${SITE.url}/ranking/${sign}`}
      primary={primary}
      label={label}
    />
  );
}
