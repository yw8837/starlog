/** How a full reading is opened: 오픈 기념 무료 (the device's one free tarot reading, until SITE.beta.openingEndsAt), a paid purchase, a signup gift granted before it was removed (`free`, tarot only), or the owner pass. */
export const UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
