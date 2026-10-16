import { SITE } from "@/lib/config";

/**
 * Premium readings (P5 spec §5): ids, page slugs, what one purchase holds, the parts a reading is
 * written in, and the sales window. Client-safe: prices and windows also come from SITE.
 */

export const PREMIUM_IDS = ["tarot-deep", "match", "newyear-2027"] as const;
export type PremiumId = (typeof PREMIUM_IDS)[number];
export const isPremiumId = (id: string): id is PremiumId => (PREMIUM_IDS as readonly string[]).includes(id);

export type PremiumSlug = "deep-tarot" | "match" | "newyear-2027";

export interface PremiumSpec {
  id: PremiumId;
  slug: PremiumSlug;
  name: string;
  sub: string;
  krw: number;
  /** follow-up questions included */
  followUps: number;
  /** approximate length (characters without spaces), shown before buying */
  approxChars: number;
  /** minutes the whole generation usually takes, shown before it starts */
  approxMinutes: number;
  /** the parts, in order, as the waiting screen names them */
  parts: readonly string[];
  /** checkout's three scope lines (P4 CheckoutView) */
  scope: readonly string[];
  opensAt?: number;
  closesAt?: number;
}

type Local = Pick<PremiumSpec, "followUps" | "approxChars" | "approxMinutes" | "parts" | "scope">;

const LOCAL: Record<PremiumId, Local> = {
  "tarot-deep": {
    followUps: 5, approxChars: 5000, approxMinutes: 3, parts: ["자리별 풀이", "엮어 읽기"],
    scope: ["카드 10장 풀이 전체 · 약 5,000자", "이어서 물어보기 5번", "이 기기와 계정에 보관"],
  },
  match: {
    followUps: 5, approxChars: 5000, approxMinutes: 3, parts: ["사주로 본 두 사람", "카드로 본 지금"],
    scope: ["사주 궁합과 카드 5장 풀이 전체 · 약 5,000자", "이어서 물어보기 5번", "이 기기와 계정에 보관"],
  },
  "newyear-2027": {
    followUps: 5, approxChars: 6800, approxMinutes: 4, parts: ["한 해의 큰 흐름", "1월~6월", "7월~12월"],
    scope: ["2027년 한 해와 열두 달 풀이 전체 · 약 6,800자", "이어서 물어보기 5번", "이 기기와 계정에 보관"],
  },
};

const time = (iso: string) => (iso ? { value: Date.parse(iso) } : null);

export const PREMIUM: Readonly<Record<PremiumId, PremiumSpec>> = Object.freeze(
  Object.fromEntries(
    SITE.price.premium.map((p) => {
      const opens = time(p.opensAt);
      const closes = time(p.closesAt);
      const spec: PremiumSpec = {
        id: p.id, slug: p.slug, name: p.name, sub: p.sub, krw: p.krw, ...LOCAL[p.id],
        ...(opens ? { opensAt: opens.value } : {}),
        ...(closes ? { closesAt: closes.value } : {}),
      };
      return [p.id, spec];
    }),
  ) as Record<PremiumId, PremiumSpec>,
);

export const premiumBySlug = (slug: string): PremiumSpec | null => Object.values(PREMIUM).find((p) => p.slug === slug) ?? null;
export const premiumPath = (id: PremiumId) => `/premium/${PREMIUM[id].slug}`;
/** A shared record's link: its product page, marked so a recipient who cannot see premium goes home, not to a 404 (review 2026-10-17 L5). */
export const PREMIUM_SHARE_FROM = "share";
export const premiumShareHref = (id: PremiumId) => `${premiumPath(id)}?from=${PREMIUM_SHARE_FROM}`;

/** Inside the product's sales window (undated products always are). */
export function inWindow(spec: PremiumSpec, now: number): boolean {
  return (spec.opensAt === undefined || spec.opensAt <= now) && (spec.closesAt === undefined || now < spec.closesAt);
}

/** A 궁합 synced from the account, or whose token carries no sealed partner: follow-ups are asked where it was written (owner 2026-10-16). */
export const MATCH_FOLLOWUP_DEVICE_ONLY = "이어서 물어보기는 풀이한 기기에서만 돼요.";

/** Premium chapter tokens (follow-ups) live 30 days (spec default 12). */
export const PREMIUM_CHAPTER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
