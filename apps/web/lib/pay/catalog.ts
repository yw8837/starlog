import { SITE } from "@/lib/config";

/**
 * What can be bought, at what price. The server takes every amount from here; a request only names
 * a product id. Client-safe (display prices, unlock offers).
 */

export type StandardProductId = "tarot" | "saju";
export type ProductId = StandardProductId | "tarot-deep" | "match" | "newyear-2027";

export interface Product {
  id: ProductId;
  name: string;
  /** Toss orderName, 100 characters at most */
  orderName: string;
  krw: number;
  /** 별조각 (or future 달빛) units one opening costs; only the standard readings take them */
  units: number | null;
  /** a generator exists, so a purchase can be delivered (premium generators arrive in P5) */
  deliverable: boolean;
  /** first moment it may be sold (ms), for a product that opens later */
  opensAt?: number;
}

/** 별조각 from the signup gift last this many KST days after the day they arrive (spec 14, default 1). */
export const GIFT_DAYS = 90;

/** 2027 신년운세 opens mid-November (spec 14, default 9). */
export const NEWYEAR_OPENS_AT = Date.parse("2026-11-15T00:00:00+09:00");

const STANDARD: Product[] = [
  { id: "tarot", name: "타로 전체 풀이", orderName: `${SITE.nameKo} 타로 전체 풀이`, krw: SITE.price.tarotStandardKrw, units: SITE.price.unitsPerReading, deliverable: true },
  { id: "saju", name: "사주 전체 풀이", orderName: `${SITE.nameKo} 사주 전체 풀이`, krw: SITE.price.sajuStandardKrw, units: SITE.price.unitsPerReading, deliverable: true },
];

const PREMIUM: Product[] = SITE.price.premium.map((premium) => ({
  id: premium.id as ProductId,
  name: premium.name,
  orderName: `${SITE.nameKo} ${premium.name}`,
  krw: premium.krw,
  units: null,
  deliverable: false,
  ...(premium.id === "newyear-2027" ? { opensAt: NEWYEAR_OPENS_AT } : {}),
}));

export const PRODUCTS: readonly Product[] = [...STANDARD, ...PREMIUM];

export function productById(id: string): Product | null {
  return PRODUCTS.find((product) => product.id === id) ?? null;
}

export function standardProduct(kind: StandardProductId): Product {
  return productById(kind)!;
}

/** A new order may be created for it now. */
export function sellable(product: Product, now: number): boolean {
  return product.deliverable && (product.opensAt === undefined || product.opensAt <= now);
}

/** Units a paid lot holds for one purchase: the standard 별조각 price, or 1 opening for premium. */
export function unitsFor(product: Product): number {
  return product.units ?? 1;
}
