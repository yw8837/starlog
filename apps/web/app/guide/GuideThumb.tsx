import { TarotCard } from "@/components/tarot/TarotCard";
import type { GuideArticle } from "@/lib/guide";
import s from "./guide.module.css";

// Saju articles get a glyph tile in an element colour instead of a card.
const SAJU_GLYPH: Record<string, { char: string; el: string }> = {
  "saju-without-birth-time": { char: "時", el: "metal" },
  "five-elements": { char: "五", el: "wood" },
};

/** Small picture for a guide article: its card, a card back, or a glyph tile. Decorative. */
export function GuideThumb({ article }: { article: GuideArticle }) {
  const glyph = SAJU_GLYPH[article.slug];
  if (glyph) {
    return (
      <span className={s.glyph} data-el={glyph.el} aria-hidden="true">
        {glyph.char}
      </span>
    );
  }
  return (
    <span className={s.thumb} aria-hidden="true">
      <TarotCard cardId={article.cardId} faceUp={Boolean(article.cardId)} size="sm" className={s.thumbCard} />
    </span>
  );
}
