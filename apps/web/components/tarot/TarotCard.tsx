import { cardImage, type Orientation } from "@starlog/core";
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
  /** Gold ring and glow, e.g. a picked card in the fan. */
  highlight?: boolean;
  className?: string;
  /** The rendered width when a class makes the card smaller than its size (e.g. a 40px thumbnail). */
  imageSizes?: string;
  /** "lazy" for cards below the fold (long lists). */
  loading?: "lazy" | "eager";
};

const BACK = "/cards/back.svg";

// Rendered width hint per size; the browser picks the 240w or 600w scan from it and the DPR.
const IMAGE_SIZES: Record<CardSize, string> = { sm: "120px", md: "140px", lg: "180px" };

/**
 * One tarot card in a fixed 600:1040 box (RWS scans vary 1.70-1.80, so the face is cropped
 * with object-fit). The flip is a real 3D turn; reversed faces are drawn upside down and tagged.
 */
export function TarotCard({ cardId, orientation = "upright", faceUp, size = "md", onFlip, label, highlight = false, className, imageSizes, loading }: TarotCardProps) {
  const reversed = orientation === "reversed";
  const showFace = faceUp && Boolean(cardId);
  const classes = [s.card, s[size], highlight ? s.highlight : "", className ?? ""].filter(Boolean).join(" ");

  const inner = (
    <span className={s.inner}>
      <span className={s.back}>
        <img src={BACK} alt="" width={600} height={1020} draggable={false} loading={loading} />
      </span>
      {cardId ? (
        <span className={s.front}>
          <img
            src={cardImage(cardId, "sm")}
            srcSet={`${cardImage(cardId, "sm")} 240w, ${cardImage(cardId, "lg")} 600w`}
            sizes={imageSizes ?? IMAGE_SIZES[size]}
            alt=""
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
        <div className={s.box} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
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
