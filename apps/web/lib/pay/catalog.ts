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
  /** a generator exists, so a purchase can be delivered (premium generators arrive in P5) */
  deliverable: boolean;
  /** first moment it may be sold (ms), for a product that opens later */
  opensAt?: number;
  /** first moment it may no longer be sold (ms), for a product with a sales window */
  closesAt?: number;
}

/** The signup gift opens one full reading of this product, and of no other (owner 2026-10-08). */
export const GIFT_PRODUCT: StandardProductId = "tarot";

/** The signup gift can be used through the end of the KST day this many days after it arrives (spec 14, default 1). */
export const GIFT_DAYS = 90;

/**
 * A paid reading never opened can be refunded on the buyer's request (환불받기) through the end of
 * the KST day this many days after the payment (paid 10-06 → through 10-13). Company-side failures
 * and account deletion are not limited by it.
 */
export const REFUND_DAYS = 7;

const STANDARD: Product[] = [
  { id: "tarot", name: "타로 전체 풀이", orderName: `${SITE.nameKo} 타로 전체 풀이`, krw: SITE.price.tarotStandardKrw, deliverable: true },
  { id: "saju", name: "사주 전체 풀이", orderName: `${SITE.nameKo} 사주 전체 풀이`, krw: SITE.price.sajuStandardKrw, deliverable: true },
];

const instant = (iso: string) => (iso ? Date.parse(iso) : undefined);

const PREMIUM: Product[] = SITE.price.premium.map((premium) => {
  const opensAt = instant(premium.opensAt);
  const closesAt = instant(premium.closesAt);
  return {
    id: premium.id as ProductId,
    name: premium.name,
    orderName: `${SITE.nameKo} ${premium.name}`,
    krw: premium.krw,
    // P5: the generators exist; STARLOG_PREMIUM still decides who may order (lib/premium/flags.ts).
    deliverable: true,
    ...(opensAt !== undefined ? { opensAt } : {}),
    ...(closesAt !== undefined ? { closesAt } : {}),
  };
});

/** 2027 신년운세 opens mid-November (SITE.price.premium). */
export const NEWYEAR_OPENS_AT = Date.parse(SITE.price.premium.find((p) => p.id === "newyear-2027")!.opensAt);

export const PRODUCTS: readonly Product[] = [...STANDARD, ...PREMIUM];

export function productById(id: string): Product | null {
  return PRODUCTS.find((product) => product.id === id) ?? null;
}

export function standardProduct(kind: StandardProductId): Product {
  return productById(kind)!;
}

/** A new order may be created for it now. */
export function sellable(product: Product, now: number): boolean {
  return product.deliverable && (product.opensAt === undefined || product.opensAt <= now) && (product.closesAt === undefined || now < product.closesAt);
}
