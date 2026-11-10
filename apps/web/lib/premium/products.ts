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
  /**
   * the guaranteed least length (characters without spaces), shown before buying as "N자 이상" (owner 2026-11-10): what
   * the automatic checks let through at the least (lib/ai/validatePremium.ts lengthCheck floors, TOLERANCE 0.25), rounded down
   */
  minChars: number;
  /** minutes the whole generation usually takes, shown before it starts */
  approxMinutes: number;
  /** the parts, in order, as the waiting screen names them */
  parts: readonly string[];
  /** checkout's three scope lines (P4 CheckoutView) */
  scope: readonly string[];
  opensAt?: number;
  closesAt?: number;
}

type Local = Pick<PremiumSpec, "followUps" | "minChars" | "approxMinutes" | "parts" | "scope">;

/** Follow-ups one purchase holds, the same for every premium reading (owner 2026-10-17: 3). */
const FOLLOW_UPS = 3;
const FOLLOW_UP_LINE = `이어서 물어보기 ${FOLLOW_UPS}번`;

const LOCAL: Record<PremiumId, Local> = {
  "tarot-deep": {
    // floors: 10 자리 × 195 + 교차 262 + 갈래 165×2 + 기둥 285 + 시기 112 + 행동 60 + 관찰 60 = 3,059
    followUps: FOLLOW_UPS, minChars: 3000, approxMinutes: 3, parts: ["자리별 풀이", "엮어 읽기"],
    scope: ["카드 10장 풀이 전체 · 3,000자 이상", FOLLOW_UP_LINE, "이 기기와 계정에 보관"],
  },
  // saju only (owner 2026-10-17): the two people, then the year ahead and how to treat each other
  match: {
    // floors: 사주 4절 × 412 + 석 달 4개 × 225 + 함께·피할 것 225×2 + 행동 60 + 관찰 60 = 3,118
    followUps: FOLLOW_UPS, minChars: 3100, approxMinutes: 3, parts: ["사주로 본 두 사람", "앞으로 1년과 서로 대하는 법"],
    scope: ["두 사람의 사주 궁합과 앞으로 1년 풀이 전체 · 3,100자 이상", FOLLOW_UP_LINE, "이 기기와 계정에 보관"],
  },
  "newyear-2027": {
    // floors: 큰 흐름 375 + 대운 225 + 네 분야 × 210 + 생활 90 + 열두 달 × 210 + 마무리 187 + 관찰 60 = 4,297
    followUps: FOLLOW_UPS, minChars: 4200, approxMinutes: 4, parts: ["한 해의 큰 흐름", "1월~6월", "7월~12월"],
    scope: ["2027년 한 해와 열두 달 풀이 전체 · 4,200자 이상", FOLLOW_UP_LINE, "이 기기와 계정에 보관"],
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
