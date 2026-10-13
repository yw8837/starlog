"use client";

import type { Orientation } from "@starlog/core";
import { backImage, faceImage, useDeckPrefs, type FrontDeck } from "@/lib/deck";
import s from "./TarotCard.module.css";

export type CardSize = "lg" | "md" | "sm";

type TarotCardProps = {
  /** Omit for a card whose face is not known yet (the fan, an empty deck). */
  cardId?: string;
  orientation?: Orientation;
  faceUp: boolean;
  size?: CardSize;
  /** Makes a face-down card a button; tapping it asks the parent to turn it face up. */
  onFlip?: () => void;
  /** Accessible name. Without it the card is decorative (its parent names it). */
  label?: string;
  /**
   * The face's own alt text ("바보 타로 카드"), for a card that is page content. Only a face-up card
   * shows it, so a face-down one gives nothing away. It replaces `label`: the image names itself, so
   * the box is neither a second role="img" nor hidden.
   */
  alt?: string;
  /** Gold ring and glow, e.g. a picked card in the fan. */
  highlight?: boolean;
  className?: string;
  /** The rendered width when a class makes the card smaller than its size (e.g. a 40px thumbnail). */
  imageSizes?: string;
  /** "lazy" for cards below the fold (long lists). */
  loading?: "lazy" | "eager";
  /**
   * Pins the face to one deck. Omit it to follow the visitor's choice (내 정보 → 카드 디자인); the guides pass
   * "rws1909", because their text describes the 1909 pictures. The back always follows the choice.
   */
  deck?: FrontDeck;
};

// Rendered width hint per size; the browser picks the 240w or 600w scan from it and the DPR.
const IMAGE_SIZES: Record<CardSize, string> = { sm: "120px", md: "140px", lg: "180px" };

/**
 * One tarot card in a fixed 600:1040 box (the 1909 scans vary 1.70-1.80, so a face is cropped with
 * object-fit; the Starlog faces are already padded to the box). The flip is a real 3D turn; reversed
 * faces are drawn upside down and tagged.
 */
export function TarotCard({ cardId, orientation = "upright", faceUp, size = "md", onFlip, label, alt, highlight = false, className, imageSizes, loading, deck }: TarotCardProps) {
  const prefs = useDeckPrefs();
  const front = deck ?? prefs.front;
  const sizes = imageSizes ?? IMAGE_SIZES[size];
  const reversed = orientation === "reversed";
  const showFace = faceUp && Boolean(cardId);
  const faceAlt = showFace ? alt : undefined;
  const classes = [s.card, s[size], highlight ? s.highlight : "", className ?? ""].filter(Boolean).join(" ");

  const inner = (
    <span className={s.inner}>
      <span className={s.back}>
        <img
          src={backImage(prefs.back, "sm")}
          srcSet={`${backImage(prefs.back, "sm")} 240w, ${backImage(prefs.back, "lg")} 600w`}
          sizes={sizes}
          alt=""
          width={600}
          height={1040}
          draggable={false}
          loading={loading}
        />
      </span>
      {cardId ? (
        <span className={s.front}>
          <img
            src={faceImage(cardId, "sm", front)}
            srcSet={`${faceImage(cardId, "sm", front)} 240w, ${faceImage(cardId, "lg", front)} 600w`}
            sizes={sizes}
            alt={faceAlt ?? ""}
            width={600}
            height={1040}
            draggable={false}
            loading={loading}
            decoding="async"
            className={reversed ? s.upsideDown : undefined}
          />
        </span>
      ) : null}
    </span>
  );

  return (
    <div className={classes} data-face={showFace ? "up" : "down"}>
      {onFlip && !showFace ? (
        <button type="button" className={`${s.box} ${s.button}`} onClick={onFlip} aria-label={label ?? "카드 뒤집기"}>
          {inner}
        </button>
      ) : (
        <div className={s.box} {...(faceAlt ? {} : label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
          {inner}
        </div>
      )}
      {showFace && reversed ? (
        <span className={s.tag} aria-hidden="true">
          역방향
        </span>
      ) : null}
    </div>
  );
}
