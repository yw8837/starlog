import { SITE, won, type MoonPack } from "./config";

/** 달빛 a pack puts in the wallet, bonus included. */
export const packTotalUnits = (pack: MoonPack) => pack.units + pack.bonus;

/** Whole readings a pack opens, and the 달빛 left over after them. */
export function packReadings(pack: MoonPack, unitsPerReading: number = SITE.price.unitsPerReading) {
  const total = packTotalUnits(pack);
  return { readings: Math.floor(total / unitsPerReading), leftover: total % unitsPerReading };
}

/**
 * What one reading costs when opened with this pack's 달빛:
 * pack price ÷ 달빛 received (bonus included) × 달빛 per reading, to the nearest won.
 */
export function perReadingKrw(pack: MoonPack, unitsPerReading: number = SITE.price.unitsPerReading) {
  const exact = (pack.krw / packTotalUnits(pack)) * unitsPerReading;
  return { krw: Math.round(exact), rounded: !Number.isInteger(exact) };
}

/**
 * Refund for a pack after `used` 달빛 were spent (refund policy): bonus 달빛 count as spent first and are
 * never refunded; each purchased 달빛 left is worth pack price ÷ purchased 달빛, rounded to the nearest won.
 * No fee is deducted.
 */
export function moonRefundKrw(pack: MoonPack, used: number): number {
  const paidUsed = Math.max(0, used - pack.bonus);
  const paidLeft = Math.max(0, pack.units - paidUsed);
  return Math.round((pack.krw * paidLeft) / pack.units);
}

/** A reading's length as shown before it is opened (SITE.reading.approxChars): "2,000", or a range, "2,500~3,000". */
export function approxCharsText({ min, max }: { min: number; max: number }): string {
  const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
  return min === max ? num(min) : `${num(min)}~${num(max)}`;
}

/** "약 2,833원" when rounded, "2,250원" when exact. */
export function perReadingLabel(pack: MoonPack, unitsPerReading: number = SITE.price.unitsPerReading) {
  const { krw, rounded } = perReadingKrw(pack, unitsPerReading);
  return rounded ? `약 ${won(krw)}` : won(krw);
}
