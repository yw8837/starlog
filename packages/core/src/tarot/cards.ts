export type Suit = "wands" | "cups" | "swords" | "pentacles";
export type Arcana = "major" | "minor";
export type CardElement = "fire" | "water" | "air" | "earth";

export interface CardDef {
  /** e.g. "major-09-hermit", "wands-01" (same as the image file stem) */
  id: string;
  arcana: Arcana;
  suit?: Suit;
  /** major 0-21, minor 1-14 (11 page, 12 knight, 13 queen, 14 king) */
  number: number;
  /** major only, e.g. "IX" */
  roman?: string;
  names: { ko: string; ja: string; en: string };
  element: CardElement;
}

const ROMAN = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
] as const;

// [slug, ko, ja, en, element] indexed by major number 0-21
const MAJORS: readonly (readonly [string, string, string, string, CardElement])[] = [
  ["fool", "바보", "愚者", "The Fool", "air"],
  ["magician", "마법사", "魔術師", "The Magician", "air"],
  ["high-priestess", "여사제", "女教皇", "The High Priestess", "water"],
  ["empress", "여황제", "女帝", "The Empress", "earth"],
  ["emperor", "황제", "皇帝", "The Emperor", "fire"],
  ["hierophant", "교황", "教皇", "The Hierophant", "earth"],
  ["lovers", "연인", "恋人", "The Lovers", "air"],
  ["chariot", "전차", "戦車", "The Chariot", "water"],
  ["strength", "힘", "力", "Strength", "fire"],
  ["hermit", "은둔자", "隠者", "The Hermit", "earth"],
  ["wheel-of-fortune", "운명의 수레바퀴", "運命の輪", "Wheel of Fortune", "fire"],
  ["justice", "정의", "正義", "Justice", "air"],
  ["hanged-man", "매달린 사람", "吊るされた男", "The Hanged Man", "water"],
  ["death", "죽음", "死神", "Death", "water"],
  ["temperance", "절제", "節制", "Temperance", "fire"],
  ["devil", "악마", "悪魔", "The Devil", "earth"],
  ["tower", "탑", "塔", "The Tower", "fire"],
  ["star", "별", "星", "The Star", "air"],
  ["moon", "달", "月", "The Moon", "water"],
  ["sun", "태양", "太陽", "The Sun", "fire"],
  ["judgement", "심판", "審判", "Judgement", "fire"],
  ["world", "세계", "世界", "The World", "earth"],
];

const SUITS: readonly (readonly [Suit, string, string, string, CardElement])[] = [
  ["wands", "완드", "ワンド", "Wands", "fire"],
  ["cups", "컵", "カップ", "Cups", "water"],
  ["swords", "검", "ソード", "Swords", "air"],
  ["pentacles", "펜타클", "ペンタクル", "Pentacles", "earth"],
];

// [ko, ja, en] for ranks 1 and 11-14; ranks 2-10 are plain numbers
const RANK_NAMES: Readonly<Record<number, readonly [string, string, string]>> = {
  1: ["에이스", "エース", "Ace"],
  11: ["시종", "ペイジ", "Page"],
  12: ["기사", "ナイト", "Knight"],
  13: ["여왕", "クイーン", "Queen"],
  14: ["왕", "キング", "King"],
};

const NUMBER_WORDS = [
  "", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function buildMajors(): CardDef[] {
  return MAJORS.map(([slug, ko, ja, en, element], number) => ({
    id: `major-${pad2(number)}-${slug}`,
    arcana: "major" as const,
    number,
    roman: ROMAN[number],
    names: { ko, ja, en },
    element,
  }));
}

function buildMinors(): CardDef[] {
  const out: CardDef[] = [];
  for (const [suit, suitKo, suitJa, suitEn, element] of SUITS) {
    for (let number = 1; number <= 14; number++) {
      const rank = RANK_NAMES[number];
      out.push({
        id: `${suit}-${pad2(number)}`,
        arcana: "minor",
        suit,
        number,
        names: rank
          ? {
              ko: `${suitKo} ${rank[0]}`,
              ja: `${suitJa}の${rank[1]}`,
              en: `${rank[2]} of ${suitEn}`,
            }
          : {
              ko: `${suitKo} ${number}`,
              ja: `${suitJa}の${number}`,
              en: `${NUMBER_WORDS[number]} of ${suitEn}`,
            },
        element,
      });
    }
  }
  return out;
}

export const CARDS: readonly CardDef[] = [...buildMajors(), ...buildMinors()];

const BY_ID: ReadonlyMap<string, CardDef> = new Map(CARDS.map(c => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export function cardImage(id: string, size: "lg" | "sm" = "lg"): string {
  return size === "sm" ? `/cards/${id}-sm.webp` : `/cards/${id}.webp`;
}
