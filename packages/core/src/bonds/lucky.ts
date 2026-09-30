import { computeChart } from "../saju/chart";
import { stemElement, type SajuElement } from "../saju/labels";
import { CARDS, type CardDef } from "../tarot/cards";
import { seededRandom } from "../tarot/draw";
import type { BondBasis } from "./score";

/**
 * 이번 주 행운 번호 (spec §8): six numbers in 1-45, deterministic per (person, KST week), each with
 * the reason it was picked. For fun only; the notice always goes with them.
 */

export const LUCKY_NOTICE = "재미로 보는 번호예요. 추첨에서는 모든 번호의 확률이 같아요.";

/** 하도수: 水 1·6, 火 2·7, 木 3·8, 金 4·9, 土 5·10 → last digits. */
const DIGITS: Record<SajuElement, readonly [number, number]> = { 수: [1, 6], 화: [2, 7], 목: [3, 8], 금: [4, 9], 토: [5, 0] };
const ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
const SUITS = ["wands", "cups", "swords", "pentacles"] as const;
/** 을/를 by the element's final consonant (목·금 end in a consonant). */
const OBJ: Record<SajuElement, string> = { 목: "을", 화: "를", 토: "를", 금: "을", 수: "를" };

export interface LuckyNumber { n: number; reason: string }

export function elementNumbers(e: SajuElement): number[] {
  const [a, b] = DIGITS[e];
  const out: number[] = [];
  for (let n = 1; n <= 45; n++) if (n % 10 === a || n % 10 === b) out.push(n);
  return out;
}

/** Majors by their number (the Fool, 0, as 22); minors by suit and rank folded into 1-45. */
export function cardNumber(card: CardDef): number {
  if (card.arcana === "major") return card.number === 0 ? 22 : card.number;
  const suit = SUITS.indexOf(card.suit!);
  return ((suit * 14 + card.number - 1) % 45) + 1;
}

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

/** The KST Monday of the week that contains `now`, as "YYYY-MM-DD". */
export function kstWeekId(now: number): string {
  const kst = new Date(now + KST_MS);
  const dow = (kst.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - dow * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** This week's card for a person, fixed for the week. */
export function weeklyCard(seedKey: string, weekId: string): CardDef {
  const rand = seededRandom(`card:${seedKey}:${weekId}`);
  return CARDS[Math.floor(rand() * CARDS.length)]!;
}

/** The element of the week: the day stem of its Monday. */
export function weekElement(weekId: string): SajuElement {
  const [y, m, d] = weekId.split("-").map(Number) as [number, number, number];
  const chart = computeChart({ calendar: "solar", year: y, month: m, day: d, time: null, gender: "female", place: { name: "서울", longitude: 126.978 } });
  return stemElement(chart.pillars.day.stem);
}

/** The free number closest to `n` in 1-45 (n itself when free), preferring the higher one on a tie. */
function nearestFree(n: number, taken: ReadonlySet<number>): number {
  for (let d = 0; d < 45; d++) {
    if (n + d <= 45 && !taken.has(n + d)) return n + d;
    if (n - d >= 1 && !taken.has(n - d)) return n - d;
  }
  throw new Error("no free number");
}

export function weeklyLucky({ basis, seedKey, weekId }: { basis: BondBasis; seedKey: string; weekId: string }): { numbers: LuckyNumber[]; card: CardDef } {
  const rand = seededRandom(`lucky:${seedKey}:${weekId}`);
  const taken = new Set<number>();
  const numbers: LuckyNumber[] = [];
  const add = (n: number, reason: string) => {
    taken.add(n);
    numbers.push({ n, reason });
  };
  const pickFrom = (pool: number[], reason: (n: number) => string) => {
    const free = pool.filter((n) => !taken.has(n));
    const n = free[Math.floor(rand() * free.length)]!;
    add(n, reason(n));
  };

  const min = Math.min(...ORDER.map((e) => basis.elements[e]));
  const weak = ORDER.find((e) => basis.elements[e] === min)!;
  const day = stemElement(basis.dayStem);
  const card = weeklyCard(seedKey, weekId);
  const week = weekElement(weekId);

  // Each element has 9 numbers and at most 5 are taken before any pick, so a pool is never empty.
  pickFrom(elementNumbers(weak), (n) => `${n} · 부족한 ${weak}${OBJ[weak]} 채우는 숫자`);
  pickFrom(elementNumbers(weak), (n) => `${n} · 부족한 ${weak}${OBJ[weak]} 채우는 숫자`);
  pickFrom(elementNumbers(day), (n) => `${n} · 나의 일간 ${day}의 숫자`);
  const cn = cardNumber(card);
  const near = nearestFree(cn, taken);
  add(near, `${near} · 이번 주 카드 ${card.names.ko}${near === cn ? "의 숫자" : " 곁의 숫자"}`);
  pickFrom(elementNumbers(week), (n) => `${n} · 이번 주 기운 ${week}의 숫자`);
  pickFrom(elementNumbers(week), (n) => `${n} · 이번 주 기운 ${week}의 숫자`);

  numbers.sort((a, b) => a.n - b.n);
  return { numbers, card };
}
