"use client";

import { ShareResultButton } from "@/components/share/ShareResultButton";
import { createBondShareLink, createBondsShareLink, knownBondShareLink, knownBondsShareLink, stopBondShareLink, stopBondsShareLink } from "@/lib/share/client";

/**
 * 별자리 인연 결과 공유 (owner 2026-10-23), both made by the server from the bonds store and read live when opened:
 * the owner's constellation (friends' nicknames on their stars, the total and the average) and a friend's own star
 * (their card, score and reasons, the owner's nickname). `extra` adds more ways to send the same link (the image).
 */
export function BondsShareButton({ constellationId, text, extra, primary = false }: { constellationId: string; text: string; extra?: Parameters<typeof ShareResultButton>[0]["extra"]; primary?: boolean }) {
  return (
    <ShareResultButton
      kind="bonds"
      label="별자리 공유하기"
      primary={primary}
      text={text}
      create={() => createBondsShareLink(constellationId)}
      stop={() => stopBondsShareLink(constellationId)}
      current={() => knownBondsShareLink(constellationId)}
      extra={extra}
    />
  );
}

export function BondShareButton({ starId, text }: { starId: string; text: string }) {
  return (
    <ShareResultButton
      kind="bond"
      label="내 인연 공유하기"
      text={text}
      create={() => createBondShareLink(starId)}
      stop={() => stopBondShareLink(starId)}
      current={() => knownBondShareLink(starId)}
    />
  );
}
