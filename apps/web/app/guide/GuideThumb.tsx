import { TarotCard } from "@/components/tarot/TarotCard";
import type { GuideArticle } from "@/lib/guide";
import s from "./guide.module.css";

// Saju articles get a glyph tile in an element colour instead of a card.
const SAJU_GLYPH: Record<string, { char: string; el: string }> = {
  "saju-without-birth-time": { char: "時", el: "metal" },
  "five-elements": { char: "五", el: "wood" },
  "heavenly-stems": { char: "甲", el: "wood" },
  "earthly-branches": { char: "子", el: "water" },
  "day-master": { char: "日", el: "fire" },
  "ten-gods": { char: "十", el: "earth" },
  daewoon: { char: "運", el: "metal" },
  "saju-vs-astrology": { char: "星", el: "water" },
  manseryeok: { char: "曆", el: "earth" },
  "saju-compatibility": { char: "合", el: "fire" },
  "new-year-fortune": { char: "年", el: "wood" },
  "four-pillars": { char: "柱", el: "earth" },
  "ipchun-jeolgi": { char: "春", el: "wood" },
  "jasi-birth": { char: "夜", el: "water" },
  "saju-birth-info": { char: "生", el: "metal" },
  "branch-relations": { char: "沖", el: "fire" },
  "twelve-stages": { char: "旺", el: "earth" },
  yongsin: { char: "用", el: "water" },
  "wolun-iljin": { char: "月", el: "metal" },
  "saju-glossary": { char: "字", el: "wood" },
  // The ten day masters: each stem in its own element.
  "day-master-gapmok": { char: "甲", el: "wood" },
  "day-master-eulmok": { char: "乙", el: "wood" },
  "day-master-byeonghwa": { char: "丙", el: "fire" },
  "day-master-jeonghwa": { char: "丁", el: "fire" },
  "day-master-muto": { char: "戊", el: "earth" },
  "day-master-gito": { char: "己", el: "earth" },
  "day-master-gyeonggeum": { char: "庚", el: "metal" },
  "day-master-singeum": { char: "辛", el: "metal" },
  "day-master-imsu": { char: "壬", el: "water" },
  "day-master-gyesu": { char: "癸", el: "water" },
};

/**
 * Small picture for a guide article: its card, a card back, or a glyph tile. Decorative. The card
 * is 40px wide, so even a 3x phone takes the small scan; lists load all but their first couple
 * lazily (`eager` for those).
 */
export function GuideThumb({ article, eager = false }: { article: GuideArticle; eager?: boolean }) {
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
      <TarotCard cardId={article.cardId} faceUp={Boolean(article.cardId)} size="sm" className={s.thumbCard} imageSizes="40px" loading={eager ? "eager" : "lazy"} deck="rws1909" />
    </span>
  );
}
