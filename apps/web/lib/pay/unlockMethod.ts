/** How a full reading is opened: 오픈 기념 무료 (one free tarot reading per logged-in account and per device, until SITE.beta.openingEndsAt), a paid purchase, a signup gift granted before it was removed (`free`, tarot only), or the owner pass. */
export const UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
